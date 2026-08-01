/**
 * Identity Risk Profile API
 * Builds incident + score payloads from seed catalog / MITRE findings / connected sources.
 * UI consumes only these fetchers — no hardcoded cloud/band/status lists in components.
 */

import {
  accessPaths,
  dataSources,
  identities,
  mitreFindings,
  tenant,
} from './mockData.js';
import { cloudAttackTechniques } from './cloudAttackCatalog.js';
import { apiGet } from '../api/client.js';

const OPEN_STATUSES = new Set(['open', 'investigating']);

const SEVERITY_RANK = {
  Critical: 0,
  Catastrophic: 0,
  High: 1,
  Unacceptable: 1,
  Medium: 2,
  Undesirable: 2,
  Low: 3,
  Acceptable: 3,
  Info: 4,
  Informational: 4,
  Desirable: 4,
};

function severityRank(value) {
  return SEVERITY_RANK[value] ?? 5;
}

function compareIncidentsBySeverity(a, b) {
  const sev = severityRank(a.severity || a.cvssLabel) - severityRank(b.severity || b.cvssLabel);
  if (sev !== 0) return sev;
  const cell = (b.cellScore || 0) - (a.cellScore || 0);
  if (cell !== 0) return cell;
  return String(b.triggeredAt || '').localeCompare(String(a.triggeredAt || ''));
}

/**
 * PTRACE convention for identity threat modelling.
 * Each stage maps to MITRE ATT&CK tactics + representative techniques.
 */
const PTRACE_STAGES = {
  P: {
    key: 'P',
    short: 'Probing',
    full: 'Probing',
    mitreTactics: ['Reconnaissance', 'Discovery'],
    mitreTechniques: [
      { id: 'T1087', name: 'Account Discovery' },
      { id: 'T1087.004', name: 'Cloud Account Discovery' },
      { id: 'T1526', name: 'Cloud Service Discovery' },
      { id: 'T1580', name: 'Cloud Infrastructure Discovery' },
    ],
  },
  T: {
    key: 'T',
    short: 'Trust',
    full: 'Trust Exploitation',
    mitreTactics: ['Initial Access', 'Defense Evasion'],
    mitreTechniques: [
      { id: 'T1199', name: 'Trusted Relationship' },
      { id: 'T1550', name: 'Use Alternate Authentication Material' },
      { id: 'T1078.004', name: 'Cloud Accounts' },
      // Appended for the live @itag/backend feed — HOP_ACCESS_RULE and CONTROL_DRIFT_RULE
      // (core/src/threat/mapping.ts) tag Trust Exploitation with these two, not present above.
      { id: 'T1550.001', name: 'Application Access Token' },
      { id: 'T1556', name: 'Modify Authentication Process' },
    ],
  },
  R: {
    key: 'R',
    short: 'Rights',
    full: 'Rights Escalation',
    mitreTactics: ['Privilege Escalation', 'Credential Access'],
    mitreTechniques: [
      { id: 'T1548', name: 'Abuse Elevation Control Mechanism' },
      { id: 'T1548.002', name: 'Bypass User Account Control' },
      { id: 'T1134', name: 'Access Token Manipulation' },
      { id: 'T1552', name: 'Unsecured Credentials' },
      // Appended for the live @itag/backend feed — CHOKE_POINT_RULE (core/src/threat/mapping.ts)
      // tags a choke-point grant with the bare id, not the .004 cloud-accounts variant below.
      { id: 'T1078', name: 'Valid Accounts' },
    ],
  },
  A: {
    key: 'A',
    short: 'Assumption',
    full: 'Account Spoofing / Assumption',
    mitreTactics: ['Initial Access', 'Defense Evasion'],
    mitreTechniques: [
      { id: 'T1078', name: 'Valid Accounts' },
      { id: 'T1078.004', name: 'Cloud Accounts' },
      { id: 'T1550.001', name: 'Application Access Token' },
    ],
  },
  C: {
    key: 'C',
    short: 'Concealment',
    full: 'Concealment & Persistence',
    mitreTactics: ['Persistence', 'Defense Evasion'],
    mitreTechniques: [
      { id: 'T1098', name: 'Account Manipulation' },
      { id: 'T1098.001', name: 'Additional Cloud Credentials' },
      { id: 'T1484', name: 'Domain or Tenant Policy Modification' },
    ],
  },
  E: {
    key: 'E',
    short: 'Exfiltration',
    full: 'Exfiltration & Lateral Movement',
    mitreTactics: ['Collection', 'Exfiltration', 'Lateral Movement', 'Impact'],
    mitreTechniques: [
      { id: 'T1530', name: 'Data from Cloud Storage Object' },
      { id: 'T1537', name: 'Transfer Data to Cloud Account' },
      { id: 'T1021', name: 'Remote Services' },
      { id: 'T1486', name: 'Data Encrypted for Impact' },
    ],
  },
};

const BAND_FLOORS = [
  { band: 'Catastrophic', min: 80 },
  { band: 'Unacceptable', min: 60 },
  { band: 'Undesirable', min: 40 },
  { band: 'Acceptable', min: 20 },
  { band: 'Desirable', min: 0 },
];

const identityById = Object.fromEntries(identities.map(i => [i.id, i]));

let _cache = null;

function connectedClouds() {
  const fromSources = dataSources
    .filter(d => d.category === 'cloud' && d.status === 'connected')
    .map(d => d.provider);
  const fromTenant = tenant.cloudProviders || [];
  return [...new Set([...fromSources, ...fromTenant])];
}

function bandForScore(score) {
  return BAND_FLOORS.find(b => score >= b.min)?.band || 'Desirable';
}

function scoreIdentityIncidents(incs) {
  if (!incs.length) {
    return { score: 0, band: 'Desirable', peakIncidentScore: 0, openCount: 0 };
  }
  const peak = Math.max(...incs.map(i => (i.impact || 1) * (i.likelihood || 1)));
  const openBoost = Math.min(
    12,
    incs.filter(i => OPEN_STATUSES.has(i.status)).length * 3,
  );
  // Cap volume so a few related findings don't all pin at 100.
  const volumeBoost = Math.min(10, Math.max(0, incs.length - 1) * 2);
  const criticalBoost = incs.some(i => i.severity === 'Critical' || i.cvssLabel === 'Critical')
    ? 8
    : 0;
  const score = Math.min(100, peak * 3 + openBoost + volumeBoost + criticalBoost);
  return {
    score,
    band: bandForScore(score),
    peakIncidentScore: peak,
    openCount: incs.filter(i => OPEN_STATUSES.has(i.status)).length,
  };
}

/** Derive which identities appear on each cloud from paths + identity source bindings. */
function buildCloudIdentityPools() {
  const clouds = connectedClouds();
  const pools = Object.fromEntries(clouds.map(c => [c, []]));

  for (const path of accessPaths) {
    const cloud = path.cloudProvider;
    if (!pools[cloud]) continue;
    if (path.identityId && !pools[cloud].includes(path.identityId)) {
      pools[cloud].push(path.identityId);
    }
  }

  for (const id of identities) {
    const sources = id.sources || {};
    for (const cloud of clouds) {
      const key = cloud === 'AWS' ? 'aws' : cloud === 'GCP' ? 'gcp' : cloud === 'Azure' ? 'azure' : cloud.toLowerCase();
      if (sources[key] && pools[cloud] && !pools[cloud].includes(id.id)) {
        pools[cloud].push(id.id);
      }
    }
  }

  // Ensure every connected cloud has at least one identity to attribute catalog rows
  const fallback = identities.map(i => i.id);
  for (const cloud of clouds) {
    if (!pools[cloud]?.length) pools[cloud] = fallback.slice();
  }

  return pools;
}

function statusForTechnique(tech, index) {
  if (tech.cvssLabel === 'Critical') return 'open';
  if (tech.cvssLabel === 'High') return index % 3 === 0 ? 'investigating' : 'open';
  if (tech.cvssLabel === 'Low') return index % 2 === 0 ? 'closed' : 'investigating';
  return index % 4 === 0 ? 'closed' : 'open';
}

function triggeredAtFor(index, cloud) {
  const scan = tenant.lastScan ? new Date(tenant.lastScan) : new Date('2026-07-31T14:22:00Z');
  const ms = scan.getTime() - ((index + 1) * 3600_000 * (3 + (cloud.length % 5)));
  return new Date(ms).toISOString();
}

function normalizeIncident(raw) {
  const ptrace = PTRACE_STAGES[raw.ptraceCategory] || null;
  const impact = Number(raw.impact) || 1;
  const likelihood = Number(raw.likelihood) || 1;
  return {
    id: raw.id,
    techniqueId: raw.techniqueId || null,
    identityId: raw.identityId,
    identityName: raw.identityName,
    title: raw.title,
    summary: raw.summary,
    severity: raw.severity || raw.cvssLabel || 'Medium',
    status: raw.status || 'open',
    ptraceCategory: raw.ptraceCategory || null,
    ptrace: ptrace
      ? {
        key: ptrace.key,
        short: ptrace.short,
        full: ptrace.full,
        mitreTactics: ptrace.mitreTactics || [],
        mitreTechniques: ptrace.mitreTechniques || [],
      }
      : null,
    impact,
    likelihood,
    cellScore: impact * likelihood,
    technique: raw.technique || null,
    tactic: raw.tactic || null,
    mitreUrl: raw.technique
      ? `https://attack.mitre.org/techniques/${String(raw.technique).replace('.', '/')}`
      : null,
    source: raw.source || null,
    cloudProvider: raw.cloudProvider || null,
    triggeredAt: raw.triggeredAt,
    kind: raw.kind || 'catalog',
    permissions: raw.permissions || [],
    methodName: raw.methodName || null,
    bestPractices: raw.bestPractices || [],
    remediation: raw.remediation || [],
    cvss: raw.cvss ?? null,
    cvssLabel: raw.cvssLabel || raw.severity || null,
  };
}

/**
 * Observed catalog incidents only — not the full attack technique library.
 * Full catalog remains available via fetchAttackCatalog for reference browsing.
 */
const OBSERVED_CATALOG_INCIDENTS = [
  { techId: 'aws-002', identityId: 'id-001' }, // jane — Attach Admin Policy
  { techId: 'aws-007', identityId: 'id-004' }, // tom — cross-account AssumeRole
  { techId: 'aws-019', identityId: 'id-007' }, // sara — IAM enumeration
  { techId: 'gcp-001', identityId: 'id-002' }, // mark — Create API key
  { techId: 'gcp-019', identityId: 'id-104' }, // orphaned ETL — GCS exfil
  { techId: 'gcp-005', identityId: 'id-003' }, // priya — actAs Function
  { techId: 'azure-001', identityId: 'id-005' }, // alice — Owner assignment
  { techId: 'azure-005', identityId: 'id-107' }, // billing-sync — Key Vault
  { techId: 'azure-018', identityId: 'id-014' }, // nora — role enumeration
];

function buildCatalogIncidents(pools) {
  const techById = Object.fromEntries(cloudAttackTechniques.map(t => [t.id, t]));
  const clouds = new Set(connectedClouds());

  return OBSERVED_CATALOG_INCIDENTS.flatMap((row, index) => {
    const tech = techById[row.techId];
    if (!tech || !clouds.has(tech.cloudProvider)) return [];

    const pool = pools[tech.cloudProvider] || [];
    const identityId = pool.includes(row.identityId)
      ? row.identityId
      : (pool[0] || row.identityId);
    const identity = identityById[identityId];
    if (!identity) return [];

    return [normalizeIncident({
      id: `inc-${tech.id}`,
      techniqueId: tech.id,
      identityId,
      identityName: identity.name,
      title: tech.title,
      summary: tech.description,
      severity: tech.cvssLabel,
      status: statusForTechnique(tech, index),
      ptraceCategory: tech.ptraceCategory,
      impact: tech.impact,
      likelihood: tech.likelihood,
      technique: tech.mitreTechnique,
      tactic: tech.mitreTactic,
      source: `${tech.cloudProvider} detected activity`,
      cloudProvider: tech.cloudProvider,
      triggeredAt: triggeredAtFor(index, tech.cloudProvider),
      kind: 'catalog',
      permissions: tech.permissions,
      methodName: tech.methodName,
      bestPractices: tech.bestPractices,
      remediation: tech.remediation,
      cvss: tech.cvss,
      cvssLabel: tech.cvssLabel,
    })];
  });
}

/** Prefer access-path cloud, then identity source bindings. */
function cloudForIdentity(identityId) {
  const fromPath = accessPaths.find(p => p.identityId === identityId && p.cloudProvider);
  if (fromPath?.cloudProvider) return fromPath.cloudProvider;

  const id = identityById[identityId];
  const sources = id?.sources || {};
  if (sources.aws) return 'AWS';
  if (sources.gcp) return 'GCP';
  if (sources.azure) return 'Azure';
  return null;
}

function buildMitreIncidents() {
  // Risk Profiles: actionable incidents only. Low discovery noise stays on Threat Profile.
  return mitreFindings
    .filter(f => f.severity !== 'Low')
    .map(f => normalizeIncident({
      id: `inc-${f.id}`,
      techniqueId: null,
      identityId: f.identityId,
      identityName: f.identityName,
      title: f.name,
      summary: f.description,
      severity: f.severity,
      status: f.severity === 'Critical' || f.severity === 'High' ? 'open' : 'investigating',
      ptraceCategory: f.ptraceCategory,
      impact: f.impact,
      likelihood: f.likelihood,
      technique: f.technique,
      tactic: f.tactic,
      source: 'MITRE ATT&CK mapping',
      cloudProvider: cloudForIdentity(f.identityId),
      triggeredAt: f.triggeredAt,
      kind: 'mitre',
      permissions: [],
      methodName: null,
      bestPractices: [],
      remediation: [],
      cvss: null,
      cvssLabel: f.severity,
    }));
}

function buildStore() {
  if (_cache) return _cache;

  const pools = buildCloudIdentityPools();
  const incidents = [...buildMitreIncidents(), ...buildCatalogIncidents(pools)]
    .sort(compareIncidentsBySeverity);

  const byIdentity = new Map();
  for (const inc of incidents) {
    if (!byIdentity.has(inc.identityId)) byIdentity.set(inc.identityId, []);
    byIdentity.get(inc.identityId).push(inc);
  }

  const profiles = identities.map(id => {
    const incs = byIdentity.get(id.id) || [];
    const scored = scoreIdentityIncidents(incs);
    // Canonical score lives on the identity roster so every surface shares the same list + ranking.
    const score = Math.min(100, Math.max(0, id.riskScore ?? scored.score));
    const pathClouds = accessPaths
      .filter(p => p.identityId === id.id && p.cloudProvider)
      .map(p => p.cloudProvider);
    const clouds = [...new Set([
      ...incs.map(i => i.cloudProvider).filter(Boolean),
      ...pathClouds,
    ])];
    return {
      identityId: id.id,
      name: id.name,
      type: id.type,
      email: id.email || null,
      department: id.department || null,
      status: id.status || 'active',
      score,
      band: bandForScore(score),
      incidentCount: incs.length,
      openIncidentCount: scored.openCount,
      peakIncidentScore: scored.peakIncidentScore,
      clouds,
      factors: {
        exposure: Math.min(25, Math.round(scored.peakIncidentScore || score * 0.2)),
        hopPresence: incs.some(i => i.ptraceCategory === 'R' || i.ptraceCategory === 'E') ? 20 : 0,
        credentialHygiene: incs.some(i => i.ptraceCategory === 'A') ? 18 : 0,
        trustDecay: incs.some(i => i.ptraceCategory === 'T') ? 12 : 0,
        dormantPrivilege: id.status === 'departed' || id.status === 'orphaned' ? 15 : 0,
        ownershipStatus: id.owner ? 0 : (incs.length || score >= 60) ? 10 : 0,
      },
    };
  });

  _cache = { incidents, profiles, pools };
  return _cache;
}

/** @deprecated sync snapshot for legacy imports — prefer fetch* */
export function getRiskProfilesSnapshot() {
  return buildStore().profiles;
}

/** @deprecated sync snapshot for legacy imports — prefer fetch* */
export function getIdentityIncidentsSnapshot() {
  return buildStore().incidents;
}

export function listRiskCloudProviders() {
  return connectedClouds();
}

export function listRiskBands() {
  return BAND_FLOORS.map(b => b.band);
}

export function listIncidentStatuses() {
  const statuses = [...new Set(buildStore().incidents.map(i => i.status))];
  return statuses.sort();
}

export function listIdentityTypes() {
  return [...new Set(identities.map(i => i.type))].sort();
}

export function listMitreTactics() {
  return [...new Set(buildStore().incidents.map(i => i.tactic).filter(Boolean))].sort();
}

export function listPtraceStages() {
  return Object.values(PTRACE_STAGES);
}

export function fetchRiskSummary() {
  const { profiles, incidents } = buildStore();
  const top = profiles.slice().sort((a, b) => b.score - a.score)[0] || null;
  return {
    identityCount: profiles.length,
    incidentCount: incidents.length,
    catalogCount: incidents.filter(i => i.kind === 'catalog').length,
    openCount: incidents.filter(i => OPEN_STATUSES.has(i.status)).length,
    topScore: top?.score ?? 0,
    topIdentityId: top?.identityId ?? null,
    topIdentityName: top?.name ?? null,
    clouds: listRiskCloudProviders(),
    bands: listRiskBands(),
  };
}

/**
 * Identity inventory for risk table.
 * opts: { search, type, band, onlyWithIncidents }
 */
export function fetchRiskInventory(opts = {}) {
  const {
    search = '',
    type = 'all',
    band = 'all',
    onlyWithIncidents = false,
  } = opts;

  const q = String(search || '').trim().toLowerCase();
  let rows = buildStore().profiles.slice();

  if (onlyWithIncidents) rows = rows.filter(r => r.incidentCount > 0);
  if (type !== 'all') rows = rows.filter(r => r.type === type);
  if (band !== 'all') rows = rows.filter(r => r.band === band);
  if (q) {
    rows = rows.filter(r => (
      r.name.toLowerCase().includes(q)
      || (r.department || '').toLowerCase().includes(q)
      || (r.email || '').toLowerCase().includes(q)
    ));
  }

  rows.sort((a, b) => b.score - a.score || b.incidentCount - a.incidentCount);

  return {
    items: rows,
    total: rows.length,
    filters: {
      clouds: listRiskCloudProviders(),
      bands: listRiskBands(),
      types: listIdentityTypes(),
      statuses: listIncidentStatuses(),
      tactics: listMitreTactics(),
      ptrace: listPtraceStages(),
    },
  };
}

export function fetchIdentityRiskProfile(identityId) {
  const profile = buildStore().profiles.find(p => p.identityId === identityId);
  if (!profile) return null;
  return { ...profile };
}

/**
 * Incidents for one identity (or all).
 * opts: { identityId, cloud, status, tactic, search }
 */
export function fetchIdentityIncidents(opts = {}) {
  const {
    identityId = 'all',
    cloud = 'all',
    status = 'all',
    tactic = 'all',
    search = '',
  } = opts;

  const q = String(search || '').trim().toLowerCase();
  let items = buildStore().incidents.slice();

  if (identityId && identityId !== 'all') {
    items = items.filter(i => i.identityId === identityId);
  }
  if (cloud && cloud !== 'all') {
    items = items.filter(i => i.cloudProvider === cloud);
  }
  if (status === 'open') {
    items = items.filter(i => OPEN_STATUSES.has(i.status));
  } else if (status === 'closed') {
    items = items.filter(i => i.status === 'closed');
  } else if (status && status !== 'all') {
    items = items.filter(i => i.status === status);
  }
  if (tactic && tactic !== 'all') {
    items = items.filter(i => i.tactic === tactic);
  }
  if (q) {
    items = items.filter(i => (
      i.title.toLowerCase().includes(q)
      || i.summary.toLowerCase().includes(q)
      || i.identityName.toLowerCase().includes(q)
      || (i.technique || '').toLowerCase().includes(q)
      || (i.tactic || '').toLowerCase().includes(q)
      || (i.methodName || '').toLowerCase().includes(q)
      || (i.permissions || []).some(p => p.toLowerCase().includes(q))
      || (i.ptrace?.short || '').toLowerCase().includes(q)
    ));
  }

  items.sort(compareIncidentsBySeverity);

  return {
    items,
    total: items.length,
    filters: {
      clouds: listRiskCloudProviders(),
      statuses: listIncidentStatuses(),
      tactics: listMitreTactics(),
    },
  };
}

export function fetchAttackCatalog(opts = {}) {
  const { cloud = 'all', tactic = 'all' } = opts;
  let items = cloudAttackTechniques.map(t => ({
    id: t.id,
    sno: t.sno,
    cloudProvider: t.cloudProvider,
    title: t.title,
    description: t.description,
    permissions: t.permissions,
    methodName: t.methodName,
    bestPractices: t.bestPractices,
    remediation: t.remediation,
    cvss: t.cvss,
    cvssLabel: t.cvssLabel,
    mitreTechnique: t.mitreTechnique,
    mitreTactic: t.mitreTactic,
    ptraceCategory: t.ptraceCategory,
    impact: t.impact,
    likelihood: t.likelihood,
    mitreUrl: `https://attack.mitre.org/techniques/${String(t.mitreTechnique).replace('.', '/')}`,
  }));

  if (cloud !== 'all') items = items.filter(t => t.cloudProvider === cloud);
  if (tactic !== 'all') items = items.filter(t => t.mitreTactic === tactic);

  return {
    items,
    total: items.length,
    filters: {
      clouds: listRiskCloudProviders(),
      tactics: [...new Set(cloudAttackTechniques.map(t => t.mitreTactic))].sort(),
    },
  };
}

/**
 * Live @itag/backend feed for the Threat Profile surface.
 * `fetchMitreFindings()` used to read the mock `mitreFindings` array (still used, unchanged,
 * by `buildMitreIncidents()` for the Risk Profiles page below). It now translates the real
 * engine's `GET /api/threat-profile` (`ThreatFindingRow[]`) into the exact object shape
 * `ThreatProfile.jsx` has always consumed, so that component needs no changes of its own.
 */

/** `PtraceStage` (full word) → the single-letter code this UI has always keyed on. */
const STAGE_CODE_BY_PTRACE_STAGE = {
  probing: 'P',
  trust_exploitation: 'T',
  rights_escalation: 'R',
  account_spoofing: 'A',
  concealment_persistence: 'C',
  exfiltration_lateral_movement: 'E',
};

/** NIST SP 800-30 Rev 1's five qualitative axis values → this UI's 1–5 rank. */
const RANK_BY_NIST_LEVEL = {
  very_low: 1,
  low: 2,
  moderate: 3,
  high: 4,
  very_high: 5,
};

/**
 * Flat technique-id → display-name lookup, merged from every `PTRACE_STAGES[*].mitreTechniques`
 * list above. The backend publishes `mitre_technique` as a bare id (e.g. `"T1556"`); it does
 * not publish a display name, so this is the only place one is derived. Unmatched ids fall
 * back to the id itself in `fetchMitreFindings()` below — never to an invented label.
 */
const TECHNIQUE_NAMES = new Map(
  Object.values(PTRACE_STAGES).flatMap(stage => stage.mitreTechniques.map(t => [t.id, t.name])),
);

/** MITRE findings for threat-profile surface — API-shaped, backed by the real engine. */
export async function fetchMitreFindings() {
  const body = await apiGet('/api/threat-profile');
  return (body?.findings || []).map(f => {
    const ptraceCategory = STAGE_CODE_BY_PTRACE_STAGE[f.ptrace_stage] || null;
    const impact = f.cell ? RANK_BY_NIST_LEVEL[f.cell.impact] : undefined;
    const likelihood = f.cell ? RANK_BY_NIST_LEVEL[f.cell.likelihood] : undefined;
    const severity = f.severity
      ? f.severity.charAt(0).toUpperCase() + f.severity.slice(1)
      : null;
    return {
      id: f.finding_id,
      technique: f.mitre_technique,
      name: TECHNIQUE_NAMES.get(f.mitre_technique) || f.mitre_technique,
      tactic: f.mitre_tactic,
      ptraceCategory,
      ptrace: PTRACE_STAGES[ptraceCategory] || null,
      identityId: f.identity_id,
      identityName: f.identity_name,
      identityType: f.identity_type,
      description: f.evidence,
      severity,
      impact,
      likelihood,
      cellScore: (impact || 1) * (likelihood || 1),
      // The engine has no per-finding timestamp (only an identity-level snapshot staleness,
      // which `list()` doesn't carry) — fetch time, not an upstream fact. Unused by this
      // component today (no column, no sort); kept for shape parity only.
      triggeredAt: new Date().toISOString(),
      mitreUrl: `https://attack.mitre.org/techniques/${String(f.mitre_technique).replace('.', '/')}`,
    };
  });
}
