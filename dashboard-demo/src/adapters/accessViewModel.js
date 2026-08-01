/**
 * Access Discovery view-model adapter.
 *
 * Maps `@itag/backend` access + risk + lineage payloads into the table/KPI shapes
 * the Unosecur demo page consumes. Vocabulary bridges:
 * - engine `hop` → UI "Shadow"
 * - PRD Owner column → UI "Delegator" (documented; same ownership resolution)
 * - Originator ← lineage provenance / created_by (never ownership)
 *
 * Non-negotiables: no fused 0–100 risk score; null ≠ empty; unknown ≠ unowned;
 * Unevaluated/suppressed do not raise Needs attention.
 */

const PATH_LABEL = {
  direct: 'Direct',
  indirect: 'Indirect',
  hop: 'Shadow',
};

const RISK_LEVEL_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const OWNERSHIP_FINDING_STATES = new Set(['unowned', 'owner_invalid', 'ambiguous']);

function pathTypeLabel(pathType) {
  return PATH_LABEL[pathType] || pathType;
}

function isNhiType(identityType) {
  return identityType === 'service_account' || identityType === 'ai_agent';
}

function kindOf(identityType) {
  return identityType === 'human' ? 'human' : 'service';
}

/** Ownership finding that raises attention — unknown/suppressed/excluded do not. */
export function isOwnershipAttention(ownership) {
  if (!ownership) return false;
  const effect = ownership.suppression?.effect;
  if (effect === 'suppressed' || effect === 'excluded' || effect === 'unknown') return false;
  if (ownership.state === 'unknown') return false;
  return OWNERSHIP_FINDING_STATES.has(ownership.state);
}

/**
 * 3 = hop + ownership finding (compound Needs attention)
 * 2 = hop only
 * 1 = ownership finding only
 * 0 = clean
 */
export function attentionRank({ hopCount, ownership }) {
  const hop = (hopCount || 0) > 0;
  const own = isOwnershipAttention(ownership);
  if (hop && own) return 3;
  if (hop) return 2;
  if (own) return 1;
  return 0;
}

/**
 * Delegator / Owner column display.
 * Unowned (red) / Unevaluated (grey) / Suppressed (info) / owner id.
 */
export function ownerLabel(ownership) {
  if (!ownership) {
    return { text: 'Unevaluated', tone: 'muted', state: 'unknown' };
  }

  const effect = ownership.suppression?.effect;
  if (effect === 'suppressed') {
    return { text: 'Suppressed', tone: 'info', state: ownership.state, suppression: ownership.suppression };
  }
  if (effect === 'excluded') {
    return { text: 'Excluded', tone: 'muted', state: ownership.state, suppression: ownership.suppression };
  }

  switch (ownership.state) {
    case 'owned':
      return {
        text: ownership.owner?.id || 'Owned',
        tone: 'ok',
        state: 'owned',
        owner: ownership.owner,
      };
    case 'unowned':
      return { text: 'Unowned', tone: 'danger', state: 'unowned', owner: null };
    case 'owner_invalid':
      return {
        text: ownership.owner?.id ? `${ownership.owner.id} (invalid)` : 'Invalid owner',
        tone: 'danger',
        state: 'owner_invalid',
        owner: ownership.owner,
      };
    case 'ambiguous':
      return {
        text: ownership.owner?.id ? `${ownership.owner.id} (ambiguous)` : 'Ambiguous',
        tone: 'warn',
        state: 'ambiguous',
        owner: ownership.owner,
      };
    case 'unknown':
    default:
      return { text: 'Unevaluated', tone: 'muted', state: 'unknown', owner: ownership.owner ?? null };
  }
}

/** Originator from lineage — never paint unexplained as Unowned. */
export function originatorLabel(lineageRow) {
  if (!lineageRow) return 'No originator';
  const provenance = lineageRow.provenance;
  if (!provenance) return 'No originator';

  if (provenance.state === 'recorded') {
    const fromActor = provenance.actor?.attested_human
      || provenance.actor?.raw_principal
      || null;
    const createdBy = lineageRow.created_by;
    const label = createdBy || fromActor;
    if (!label) return 'No originator';
    const norm = String(label).trim().toLowerCase();
    if (!norm || norm === 'unknown' || norm.startsWith('unknown ')) return 'No originator';
    return label;
  }

  // explained_absence / unexplained — honest gap, not an ownership finding
  return 'No originator';
}

export function riskLevelView(assessment) {
  if (!assessment) {
    return { kind: 'unevaluated', level: null, label: 'Unevaluated', tone: 'muted', factorsFiring: 0 };
  }
  switch (assessment.kind) {
    case 'findings':
      return {
        kind: 'findings',
        level: assessment.worst_level,
        label: RISK_LEVEL_LABEL[assessment.worst_level] || assessment.worst_level,
        tone: assessment.worst_level,
        factorsFiring: assessment.factors_firing ?? 0,
      };
    case 'no_findings':
      return { kind: 'no_findings', level: null, label: 'No findings', tone: 'ok', factorsFiring: 0 };
    case 'partially_evaluated':
      return {
        kind: 'partially_evaluated',
        level: null,
        label: 'Unevaluated',
        tone: 'muted',
        factorsFiring: 0,
        factorsUnavailable: assessment.factors_unavailable || [],
      };
    default:
      return { kind: 'unevaluated', level: null, label: 'Unevaluated', tone: 'muted', factorsFiring: 0 };
  }
}

function viaOf(path) {
  if (path.path_type === 'hop') return path.via_permission || path.assumed_identity || '';
  if (path.path_type === 'indirect') return path.via_group || '';
  return path.chain?.[0]?.mechanism || 'HAS_POLICY';
}

function pathSeverity(path) {
  const typeScore = path.path_type === 'hop' ? 3 : path.path_type === 'indirect' ? 1 : 0;
  return typeScore + (path.sensitive ? 2 : 0) + (path.hop_count || 0);
}

/** Flatten an AccessPath into the detail-panel shape the page already renders. */
export function toUiPath(path, { identityName, snapshotAt, ownership } = {}) {
  const accessType = pathTypeLabel(path.path_type);
  return {
    id: `${path.identity_id}:${path.permission}:${path.path_type}:${path.hop_count}`,
    identityId: path.identity_id,
    identityName: identityName || path.identity_id,
    identityType: path.identity_type,
    accessType,
    pathType: path.path_type,
    resource: path.permission,
    mechanism: viaOf(path),
    hopCount: path.path_type === 'hop' ? Math.max(0, (path.hop_count || 1) - 1) : 0,
    hopChain: (path.chain || []).map((step, idx) => ({
      step: idx + 1,
      from: step.from,
      to: step.to,
      mechanism: step.mechanism,
      edge: step.edge,
    })),
    effectivePermissions: [path.permission],
    cloudProvider: path.app,
    resourceSensitivity: path.sensitive ? 'critical' : 'medium',
    shadowAdmin: path.path_type === 'hop' && path.sensitive,
    lastConfirmed: snapshotAt ? String(snapshotAt).slice(0, 10) : '—',
    blocked: false,
    ownership: ownership || null,
    api: {},
  };
}

function normalizeOwnership(row) {
  if (row?.ownership && typeof row.ownership === 'object' && 'state' in row.ownership) {
    return row.ownership;
  }
  // Legacy bare OwnerRef (pre-AccessOwnerResolution)
  if (row && 'owner' in row) {
    return {
      owner: row.owner ?? null,
      state: row.owner ? 'owned' : 'unowned',
      suppression: null,
    };
  }
  return { owner: null, state: 'unknown', suppression: null };
}

/**
 * Build identity-first Discovery rows + summary KPIs from live API payloads.
 */
export function buildAccessDiscoveryViewModel({
  accessSummary,
  accessList,
  riskSummary,
  riskList,
  lineageList,
}) {
  const snapshotAt = accessSummary?.snapshot?.graph_snapshot_at || null;
  const rows = accessList?.rows || [];
  const riskById = new Map((riskList?.identities || []).map((r) => [r.identity_id, r]));
  const lineageById = new Map((lineageList?.rows || []).map((r) => [r.identity_id, r]));
  const nameById = new Map((riskList?.identities || []).map((r) => [r.identity_id, r.name]));

  // Prefer profile names from risk; fall back to identity_id. Access paths have no name.
  const byIdentity = new Map();

  for (const row of rows) {
    const path = row.path;
    const ownership = normalizeOwnership(row);
    const id = path.identity_id;
    let entry = byIdentity.get(id);
    if (!entry) {
      const risk = riskById.get(id);
      const lineage = lineageById.get(id);
      const name = risk?.name || nameById.get(id) || id;
      entry = {
        identityId: id,
        identityName: name,
        identityType: path.identity_type,
        kind: kindOf(path.identity_type),
        app: path.app,
        ownership,
        ownerDisplay: ownerLabel(ownership),
        originator: originatorLabel(lineage),
        risk: riskLevelView(risk?.assessment),
        hopPaths: 0,
        pathCounts: { direct: 0, indirect: 0, hop: 0 },
        paths: [],
        lastUpdated: snapshotAt ? String(snapshotAt).slice(0, 10) : '—',
        representative: null,
      };
      byIdentity.set(id, entry);
    }

    entry.pathCounts[path.path_type] = (entry.pathCounts[path.path_type] || 0) + 1;
    if (path.path_type === 'hop') entry.hopPaths += 1;

    const uiPath = toUiPath(path, {
      identityName: entry.identityName,
      snapshotAt,
      ownership,
    });
    entry.paths.push(uiPath);

    if (!entry.representative || pathSeverity(path) > pathSeverity(entry.representative._raw)) {
      entry.representative = { ...uiPath, _raw: path };
    }
  }

  // Fill names from lineage when risk list omitted the identity
  for (const entry of byIdentity.values()) {
    if (entry.identityName === entry.identityId) {
      const lin = lineageById.get(entry.identityId);
      if (lin?.name) entry.identityName = lin.name;
      entry.paths.forEach((p) => { p.identityName = entry.identityName; });
      if (entry.representative) entry.representative.identityName = entry.identityName;
    }
    entry.attentionRank = attentionRank({ hopCount: entry.hopPaths, ownership: entry.ownership });
    entry.needsAttention = entry.attentionRank > 0;
    delete entry.representative?._raw;
  }

  const identities = [...byIdentity.values()].sort((a, b) => {
    if (b.attentionRank !== a.attentionRank) return b.attentionRank - a.attentionRank;
    const levelOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const la = levelOrder[a.risk.level] || 0;
    const lb = levelOrder[b.risk.level] || 0;
    if (lb !== la) return lb - la;
    if (b.hopPaths !== a.hopPaths) return b.hopPaths - a.hopPaths;
    return a.identityName.localeCompare(b.identityName);
  });

  // Table population (identities with ≥1 discovered path) — drives filters / kind chips
  const tableHuman = identities.filter((i) => i.kind === 'human').length;
  const tableNhi = identities.length - tableHuman;
  const needAttention = identities.filter((i) => i.needsAttention).length;
  const hopIdentities = identities.filter((i) => i.hopPaths > 0).length;
  const ownershipFindings = identities.filter((i) => isOwnershipAttention(i.ownership)).length;

  // Estate population (risk join) — Total card must sum to identities_scanned
  const scannedSubjects = (riskList?.identities || []).filter((r) => r.identity_type !== 'group');
  const scannedHuman = scannedSubjects.filter((r) => r.identity_type === 'human').length;
  const scannedNhi = scannedSubjects.length - scannedHuman;

  const counts = accessSummary?.counts || { direct: 0, indirect: 0, hop: 0 };
  const byLevel = Object.fromEntries(
    (riskSummary?.by_worst_level || []).map((row) => [row.level, row.count]),
  );

  const summary = {
    totalIdentities: accessSummary?.identities_scanned
      ?? (scannedSubjects.length || identities.length),
    humanCount: scannedSubjects.length ? scannedHuman : tableHuman,
    nhiCount: scannedSubjects.length ? scannedNhi : tableNhi,
    needAttention,
    attentionFooter: `Shadow hops (${hopIdentities}) · Ownership findings (${ownershipFindings})`,
    // Honest risk strip — levels, not a fused percentage or week-over-week trend
    riskFindings: riskSummary?.with_findings ?? identities.filter((i) => i.risk.kind === 'findings').length,
    riskFooter: `Critical (${byLevel.critical || 0}) · High (${byLevel.high || 0}) · Medium (${byLevel.medium || 0})`,
    hopPathCount: counts.hop,
    directPaths: counts.direct,
    indirectPaths: counts.indirect,
    shadowPaths: counts.hop,
    identitiesWithHop: accessSummary?.identities_with_hop ?? hopIdentities,
    kindCounts: {
      All: identities.length,
      human: tableHuman,
      service: tableNhi,
    },
    graphSnapshotAt: snapshotAt,
    lastSync: snapshotAt ? String(snapshotAt).slice(0, 10) : null,
    connectedSources: 0,
    systemCounts: {},
  };

  return {
    source: 'live',
    identities,
    summary,
    accessPaths: identities.flatMap((i) => i.paths),
    fetchedAt: new Date().toISOString(),
  };
}

/** Resolve mock identity → AccessOwnerResolution (same three-way as live). */
export function mockOwnershipOf(identity) {
  if (!identity) {
    return { owner: null, state: 'unknown', suppression: null };
  }
  if (identity.mockAttention === 'hop_unowned' || identity.id === 'id-mock-ssm-bridge') {
    return { owner: null, state: 'unowned', suppression: null };
  }

  const suppression = identity.suppressionEffect
    ? {
        effect: identity.suppressionEffect,
        reason: identity.suppressionReason || identity.suppressionEffect,
        detail: identity.suppressionDetail || '',
        expires_at: identity.suppressionExpiresAt || null,
      }
    : null;

  if (identity.ownershipState) {
    const state = identity.ownershipState;
    const ownerId = identity.ownerName || identity.owner || null;
    const owner = ownerId
      ? {
          id: ownerId,
          kind: identity.ownerKind === 'team' ? 'team' : 'user',
          source: 'explicit_tag',
          confidence: 'high',
          attested_at: identity.ownerAttestedAt || null,
          backup_id: null,
        }
      : null;
    return { owner: state === 'unowned' ? null : owner, state, suppression };
  }

  if (suppression?.effect === 'unknown' || identity.status === 'pre_audit') {
    return { owner: null, state: 'unknown', suppression };
  }

  const hasOwner = Boolean(identity.owner || identity.ownerName)
    && identity.status !== 'orphaned'
    && identity.status !== 'departed';
  if (!hasOwner) {
    return { owner: null, state: 'unowned', suppression };
  }

  return {
    owner: {
      id: identity.ownerName || identity.owner,
      kind: identity.ownerKind === 'team' ? 'team' : 'user',
      source: 'explicit_tag',
      confidence: 'high',
      attested_at: identity.ownerAttestedAt || null,
      backup_id: null,
    },
    state: identity.status === 'role_changed' ? 'owner_invalid' : 'owned',
    suppression,
  };
}

function mockRiskOf(identity, hopPaths) {
  if (identity?.riskAssessment === 'unevaluated') {
    return riskLevelView({
      kind: 'partially_evaluated',
      factors_evaluated: [],
      factors_unavailable: ['control_drift', 'grant_staleness'],
    });
  }
  const score = identity?.riskScore;
  if (!Number.isFinite(score)) {
    return riskLevelView({
      kind: 'partially_evaluated',
      factors_evaluated: [],
      factors_unavailable: ['mock'],
    });
  }
  let level = 'low';
  if (score >= 80) level = 'critical';
  else if (score >= 60) level = 'high';
  else if (score >= 40) level = 'medium';

  const factors = Number.isFinite(identity?.riskFactorsFiring)
    ? identity.riskFactorsFiring
    : (hopPaths > 0 && level === 'critical' ? 3 : level === 'critical' ? 2 : 1);

  return riskLevelView({
    kind: 'findings',
    worst_level: level,
    factors_firing: factors,
    findings: [],
  });
}

function mockOriginatorOf(path, identity) {
  const raw = path.originator || identity?.originator || 'No originator';
  const norm = String(raw).trim().toLowerCase();
  if (
    !norm
    || norm.includes('unknown')
    || norm === 'okta directory'
    || norm === 'okta.admin'
    || norm === 'no originator'
  ) {
    return 'No originator';
  }
  return raw;
}

function mockPathSeverity(path) {
  const typeScore = path.accessType === 'Shadow' || (path.hopCount || 0) > 0
    ? 3
    : path.accessType === 'Indirect' ? 1 : 0;
  return (path.shadowAdmin ? 4 : 0) + typeScore + (path.hopCount || 0);
}

/**
 * Normalize mock hopChain steps to the live Access Discovery / HopChain contract:
 * `from → to` with engine mechanism vocabulary (granted / resource carries / holds /
 * group membership) and edge kinds. Matches `core` AccessChainStep rendering.
 */
export function normalizeHopChain(steps = []) {
  if (!Array.isArray(steps) || steps.length === 0) return [];

  return steps.map((raw, idx) => {
    const from = String(raw.from || '').trim();
    const to = String(raw.to || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    let mechanism = String(raw.mechanism || '').trim();
    let edge = raw.edge || null;
    const isLast = idx === steps.length - 1;
    const alreadyEngine = /^(granted |resource carries |holds |group membership)/i.test(mechanism);

    if (!alreadyEngine) {
      const m = mechanism.toLowerCase();
      if (/member_of|group membership|memberof/.test(m)) {
        mechanism = 'group membership';
        edge = 'MEMBER_OF';
      } else if (
        /resource carries|instance profile|workload identity|execution role|managed identity|assumes?_?role|assumerole/.test(m)
        && !isLast
      ) {
        const role = to.replace(/^iam:\/\//, '').replace(/^azure:\/\//, '');
        mechanism = `resource carries ${role}`;
        edge = 'ASSUMES_ROLE';
      } else if (isLast || /holds|has_policy|fullaccess|owner role|passrole|binding/.test(m)) {
        mechanism = `holds ${to.replace(/^iam:\/\//, '').replace(/^azure:\/\//, '')}`;
        edge = 'HAS_POLICY';
      } else {
        // Connect / session / invoke front of a hop
        const grant = to.includes('://')
          ? to.split('/').pop()
          : to;
        mechanism = `granted ${grant}`;
        edge = 'CAN_ACCESS';
      }
    } else if (!edge) {
      if (/^granted /i.test(mechanism)) edge = 'CAN_ACCESS';
      else if (/^resource carries /i.test(mechanism)) edge = 'ASSUMES_ROLE';
      else if (/^holds /i.test(mechanism)) edge = 'HAS_POLICY';
      else if (/^group membership/i.test(mechanism)) edge = 'MEMBER_OF';
    }

    return {
      step: idx + 1,
      from,
      to,
      edge: edge || 'CAN_ACCESS',
      mechanism,
      ...(raw.api ? { api: raw.api } : {}),
      ...(raw.resourceArn ? { resourceArn: raw.resourceArn } : {}),
      ...(raw.resourceName ? { resourceName: raw.resourceName } : {}),
    };
  });
}

function shadowMechanismSummary(chain) {
  if (!chain.length) return '';
  const vias = chain
    .filter((s) => s.edge === 'CAN_ACCESS' || /^granted /i.test(s.mechanism))
    .map((s) => s.to);
  if (vias.length) return vias.join(' → ');
  return chain.map((s) => s.to).join(' → ');
}

/**
 * Map the offline mock bundle into the same identity-row shape so the page
 * has one render path. Mock risk scores are coerced to level bands for offline
 * QA only — never presented as engine Risk Profile truth.
 */
export function buildViewModelFromMockBundle(bundle) {
  const identitiesRaw = bundle?.identities || [];
  const accessPaths = bundle?.accessPaths || [];
  const identityById = Object.fromEntries(identitiesRaw.map((i) => [i.id, i]));
  const snapshotAt = bundle?.summary?.graphSnapshotAt
    || bundle?.summary?.lastSync
    || '2026-07-31';

  const byIdentity = new Map();
  for (const p of accessPaths) {
    const identity = identityById[p.identityId];
    const id = p.identityId;
    let entry = byIdentity.get(id);
    if (!entry) {
      const ownership = mockOwnershipOf(identity);
      entry = {
        identityId: id,
        identityName: identity?.name || p.identityName || id,
        identityType: identity?.type === 'human' ? 'human' : 'service_account',
        kind: identity?.type === 'human' ? 'human' : 'service',
        app: p.cloudProvider || 'mock',
        ownership,
        ownerDisplay: ownerLabel(ownership),
        originator: mockOriginatorOf(p, identity),
        risk: null, // filled after hop tally
        hopPaths: 0,
        pathCounts: { direct: 0, indirect: 0, hop: 0 },
        paths: [],
        lastUpdated: String(snapshotAt).slice(0, 10),
        representative: null,
        _identity: identity,
      };
      byIdentity.set(id, entry);
    }

    const pathType = p.accessType === 'Shadow' || (p.hopCount || 0) > 0
      ? 'hop'
      : p.accessType === 'Indirect'
        ? 'indirect'
        : 'direct';
    entry.pathCounts[pathType] += 1;
    if (pathType === 'hop') entry.hopPaths += 1;

    const hopChain = pathType === 'hop' || (p.hopChain && p.hopChain.length)
      ? normalizeHopChain(p.hopChain || [])
      : [];
    const hopCount = hopChain.length || p.hopCount || 0;
    const uiPath = {
      ...p,
      identityName: entry.identityName,
      pathType,
      accessType: pathType === 'hop' ? 'Shadow' : p.accessType,
      hopChain,
      hopCount,
      mechanism: hopChain.length ? (shadowMechanismSummary(hopChain) || p.mechanism) : p.mechanism,
      ownership: entry.ownership,
      lastConfirmed: entry.lastUpdated,
      shadowAdmin: Boolean(p.shadowAdmin) || (pathType === 'hop' && (p.resourceSensitivity === 'critical' || p.sensitive)),
      // Prefer engine `app` (mcp-gateway / github / aws-iam) for related-path meta
      cloudProvider: p.api?.app || p.app || p.cloudProvider || entry.app,
    };
    entry.paths.push(uiPath);
    if (!entry.representative || mockPathSeverity(uiPath) > mockPathSeverity(entry.representative)) {
      entry.representative = uiPath;
    }
  }

  const tableIdentities = [...byIdentity.values()].map((entry) => {
    entry.risk = mockRiskOf(entry._identity, entry.hopPaths);
    entry.attentionRank = attentionRank({ hopCount: entry.hopPaths, ownership: entry.ownership });
    entry.needsAttention = entry.attentionRank > 0;
    // Beat 23b pin — compound hop+unowned demo row wins ties (matches live svc-temp-ssm-bridge).
    entry.demoPin = entry._identity?.mockAttention === 'hop_unowned'
      || entry.identityId === 'id-mock-ssm-bridge' ? 1 : 0;
    delete entry._identity;
    return entry;
  }).sort((a, b) => {
    if (b.attentionRank !== a.attentionRank) return b.attentionRank - a.attentionRank;
    if (b.demoPin !== a.demoPin) return b.demoPin - a.demoPin;
    const levelOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    const la = levelOrder[a.risk.level] || 0;
    const lb = levelOrder[b.risk.level] || 0;
    if (lb !== la) return lb - la;
    if ((b.risk.factorsFiring || 0) !== (a.risk.factorsFiring || 0)) {
      return (b.risk.factorsFiring || 0) - (a.risk.factorsFiring || 0);
    }
    if (b.hopPaths !== a.hopPaths) return b.hopPaths - a.hopPaths;
    return a.identityName.localeCompare(b.identityName);
  });

  // Estate = full mock roster; table = identities with discovered paths
  const estateHuman = identitiesRaw.filter((i) => i.type === 'human').length;
  const estateNhi = identitiesRaw.filter((i) => i.type === 'service').length;
  const tableHuman = tableIdentities.filter((i) => i.kind === 'human').length;
  const tableNhi = tableIdentities.length - tableHuman;
  const hopIdentities = tableIdentities.filter((i) => i.hopPaths > 0).length;
  const ownershipFindings = tableIdentities.filter((i) => isOwnershipAttention(i.ownership)).length;
  const needAttention = tableIdentities.filter((i) => i.needsAttention).length;

  const levelCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const entry of tableIdentities) {
    if (entry.risk.kind === 'findings' && entry.risk.level) {
      levelCounts[entry.risk.level] = (levelCounts[entry.risk.level] || 0) + 1;
    }
  }
  const riskFindings = tableIdentities.filter((i) => i.risk.kind === 'findings').length;

  const directPaths = accessPaths.filter((p) => p.accessType === 'Direct').length;
  const indirectPaths = accessPaths.filter((p) => p.accessType === 'Indirect').length;
  const shadowPaths = accessPaths.filter((p) => p.accessType === 'Shadow' || (p.hopCount || 0) > 0).length;

  const summary = {
    totalIdentities: identitiesRaw.length || tableIdentities.length,
    humanCount: estateHuman,
    nhiCount: estateNhi,
    needAttention,
    attentionFooter: `Shadow hops (${hopIdentities}) · Ownership findings (${ownershipFindings})`,
    riskFindings,
    riskFooter: `Critical (${levelCounts.critical}) · High (${levelCounts.high}) · Medium (${levelCounts.medium})`,
    hopPathCount: shadowPaths,
    directPaths,
    indirectPaths,
    shadowPaths,
    identitiesWithHop: hopIdentities,
    kindCounts: { All: tableIdentities.length, human: tableHuman, service: tableNhi },
    graphSnapshotAt: snapshotAt,
    lastSync: String(snapshotAt).slice(0, 10),
    connectedSources: bundle?.summary?.connectedSources || 0,
    systemCounts: bundle?.summary?.systemCounts || {},
  };

  return {
    source: 'mock',
    identities: tableIdentities,
    summary,
    accessPaths: tableIdentities.flatMap((i) => i.paths),
    dataSources: bundle?.dataSources || [],
    fetchedAt: bundle?.fetchedAt || new Date().toISOString(),
  };
}
