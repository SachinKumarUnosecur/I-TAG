/**
 * Identity Exposure Map view-model adapter.
 *
 * Maps `@itag/backend` `/api/exposure` payloads (`ExposureRow[]`, `ExposureProfile`,
 * `ExposureSummary` — `core/src/domain/exposure.ts`) into the table/detail shapes the
 * Unosecur demo page renders.
 *
 * Non-negotiables enforced here, not in the page:
 * - `assessment.kind` is a three-way switch (`scored` | `no_paths` | `no_classified_permissions`).
 *   `no_classified_permissions` never renders as score `0` / "clean" — see `assessmentView`.
 * - Band vocabulary is engine-only (`minimal|limited|substantial|extensive`); this file never
 *   imports or emits Risk's `Catastrophic…Desirable` words.
 * - `ownership` (state + severity + owner + why_these_differ) always travels with the row —
 *   `exposureOwnerLabel` / `whyTheseDiffer` are never dropped by a mapper.
 * - Engine order is preserved: `buildExposureMapViewModel` maps `list.identities` 1:1, it does
 *   not re-sort by a client-side formula (`service.ts` already sorts by `weighted_sum`).
 */

const BAND_LABEL = {
  extensive: 'Extensive',
  substantial: 'Substantial',
  limited: 'Limited',
  minimal: 'Minimal',
};

const TYPE_LABEL = {
  human: 'Human',
  service_account: 'Service',
  ai_agent: 'AI agent',
  group: 'Group',
};

export function typeKindOf(identityType) {
  return identityType === 'human' ? 'human' : 'service';
}

export function typeLabel(identityType) {
  return TYPE_LABEL[identityType] || identityType;
}

export function bandLabel(band) {
  return BAND_LABEL[band] || 'Unevaluated';
}

/**
 * Ownership's verdict for this row — `ExposureOwnershipContext.state` (`ownership.ts`).
 * Shape differs from Access Discovery's `AccessOwnerResolution` (no `suppression` member here),
 * so this is a sibling of `accessViewModel.ownerLabel`, not a shared function.
 */
export function exposureOwnerLabel(ownership) {
  if (!ownership) return { text: 'Unevaluated', tone: 'muted', state: 'unknown', owner: null };
  switch (ownership.state) {
    case 'owned':
      return { text: ownership.owner?.id || 'Owned', tone: 'ok', state: 'owned', owner: ownership.owner };
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

/**
 * `ExposureAssessment` → UI shape, one switch on `.kind` covering all three arms.
 *
 * `no_classified_permissions` is never given `score: 0` — its `bandLabel` is a distinct
 * "Unclassified" chip, never "Minimal", so it cannot be mistaken for an evaluated-and-clean row.
 */
export function assessmentView(assessment) {
  if (!assessment) {
    return {
      kind: 'unevaluated',
      score: null,
      weightedSum: null,
      band: null,
      bandLabel: 'Unevaluated',
      contributions: [],
      unclassified: [],
      highestSensitivity: null,
    };
  }
  switch (assessment.kind) {
    case 'scored':
      return {
        kind: 'scored',
        score: assessment.exposure_score,
        weightedSum: assessment.weighted_sum,
        band: assessment.band,
        bandLabel: bandLabel(assessment.band),
        contributions: assessment.contributions || [],
        unclassified: assessment.unclassified_permissions || [],
        highestSensitivity: assessment.highest_sensitivity_reached,
      };
    case 'no_paths':
      return {
        kind: 'no_paths',
        score: null,
        weightedSum: null,
        band: null,
        bandLabel: 'No paths',
        contributions: [],
        unclassified: [],
        highestSensitivity: null,
      };
    case 'no_classified_permissions':
      return {
        kind: 'no_classified_permissions',
        score: null,
        weightedSum: null,
        band: null,
        bandLabel: 'Unclassified',
        contributions: [],
        unclassified: assessment.unclassified_permissions || [],
        highestSensitivity: null,
      };
    default:
      return {
        kind: 'unevaluated',
        score: null,
        weightedSum: null,
        band: null,
        bandLabel: 'Unevaluated',
        contributions: [],
        unclassified: [],
        highestSensitivity: null,
      };
  }
}

function rowViewModel(row) {
  const assessment = assessmentView(row.assessment);
  const ownerDisplay = exposureOwnerLabel(row.ownership);
  return {
    id: row.identity_id,
    name: row.name,
    identityType: row.identity_type,
    typeKey: typeKindOf(row.identity_type),
    typeLabel: typeLabel(row.identity_type),
    app: row.app,
    assessmentKind: assessment.kind,
    exposureScore: assessment.score,
    weightedSum: assessment.weightedSum,
    band: assessment.band,
    bandLabel: assessment.bandLabel,
    highestSensitivity: assessment.highestSensitivity,
    reachablePermissions: row.reachable_permissions,
    unclassifiedPermissions: row.unclassified_permissions,
    ownershipState: row.ownership?.state || 'unknown',
    ownershipSeverity: row.ownership?.severity || 'none',
    ownerDisplay,
    whyTheseDiffer: row.ownership?.why_these_differ || '',
  };
}

/**
 * Build the landing table + KPI strip from `/api/exposure/summary` + `/api/exposure`.
 *
 * `rows` is `list.identities` mapped 1:1 — the engine's order (weighted_sum desc within
 * `scored`, per `exposure/service.ts`) is preserved verbatim; nothing here re-sorts it.
 */
export function buildExposureMapViewModel({ summary, list }) {
  const rows = (list?.identities || []).map(rowViewModel);
  const apps = [...new Set(rows.map((r) => r.app).filter(Boolean))].sort();
  const completeness = summary?.classification_completeness
    || { classified: 0, unclassified: 0, total: 0, ratio: 0 };
  const topScored = rows.find((r) => r.assessmentKind === 'scored') || null;

  return {
    source: 'live',
    rows,
    apps,
    summary: {
      scored: summary?.scored ?? 0,
      noPaths: summary?.no_paths ?? 0,
      noClassifiedPermissions: summary?.no_classified_permissions ?? 0,
      identitiesScanned: summary?.identities_scanned ?? rows.length,
      completeness,
      bandCounts: summary?.band_counts || [],
      topScored,
      snapshotAt: summary?.snapshot?.graph_snapshot_at || null,
    },
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Build the detail-page view model from `/api/exposure/:id` (`ExposureProfile`).
 *
 * Carries `exposure_set`, `rings` and the full `assessment` through untouched — the page
 * renders `contributions[]` and `why_these_differ` directly off this object (non-negotiable
 * §3/§4: score never travels alone, ownership context always shown).
 */
export function buildExposureIdentityViewModel(profile) {
  if (!profile) return null;
  const assessment = assessmentView(profile.assessment);
  const ownerDisplay = exposureOwnerLabel(profile.ownership);
  return {
    id: profile.identity_id,
    name: profile.name,
    identityType: profile.identity_type,
    typeLabel: typeLabel(profile.identity_type),
    app: profile.app,
    assessment,
    ownershipState: profile.ownership?.state || 'unknown',
    ownershipSeverity: profile.ownership?.severity || 'none',
    ownerDisplay,
    whyTheseDiffer: profile.ownership?.why_these_differ || '',
    exposureSet: profile.exposure_set || { total_permissions: 0, counted: 0, unclassified: 0, entries: [] },
    rings: profile.rings || [],
    staleness: profile.staleness || null,
  };
}

// --- Offline mock path (`VITE_USE_MOCK=1`) ----------------------------------

/**
 * Quarter-scale floors mirroring `core/src/domain/exposure.ts` `EXPOSURE_BAND_FLOORS`
 * (75/50/25/0), applied to the *mock* 0-100 score for offline demo continuity only.
 * This is display bucketing of an already-fake number, not a reimplementation of
 * `scoreExposure` — the live path never calls this.
 */
const MOCK_BAND_FLOORS = [
  { band: 'extensive', floor: 75 },
  { band: 'substantial', floor: 50 },
  { band: 'limited', floor: 25 },
  { band: 'minimal', floor: 0 },
];

function mockBandFor(score) {
  const hit = MOCK_BAND_FLOORS.find((entry) => score >= entry.floor);
  return hit ? hit.band : 'minimal';
}

/**
 * Map the offline mock cloud-exposure inventory (`data/exposureApi.js`
 * `fetchCloudExposureInventory`) into the same row shape as the live table, so the page has
 * one render path. Every row is clearly `source: 'mock'`; ownership is `Unevaluated` rather
 * than fabricated, since the mock bundle carries no `ExposureOwnershipContext`.
 */
export function buildExposureMapViewModelFromMock(inventory) {
  const rows = (inventory || [])
    .map((item) => {
      const band = mockBandFor(item.exposureScore);
      return {
        id: item.id,
        name: item.name,
        identityType: item.type === 'service' ? 'service_account' : 'human',
        typeKey: item.type === 'service' ? 'service' : 'human',
        typeLabel: item.type === 'service' ? 'Service' : 'Human',
        app: item.department || item.clouds?.[0] || 'mock',
        assessmentKind: 'scored',
        exposureScore: item.exposureScore,
        weightedSum: null,
        band,
        bandLabel: bandLabel(band),
        highestSensitivity: item.highestSensitivity || null,
        reachablePermissions: item.pathCount ?? 0,
        unclassifiedPermissions: 0,
        ownershipState: 'unknown',
        ownershipSeverity: 'none',
        ownerDisplay: { text: 'Unevaluated (mock)', tone: 'muted', state: 'unknown', owner: null },
        whyTheseDiffer: 'Offline mock mode — ownership reconciliation is not available.',
      };
    })
    .sort((a, b) => b.exposureScore - a.exposureScore);

  const apps = [...new Set(rows.map((r) => r.app).filter(Boolean))].sort();
  const total = rows.length;
  const bandCounts = MOCK_BAND_FLOORS.map(({ band, floor }) => ({
    band,
    floor,
    count: rows.filter((r) => r.band === band).length,
  }));

  return {
    source: 'mock',
    rows,
    apps,
    summary: {
      scored: total,
      noPaths: 0,
      noClassifiedPermissions: 0,
      identitiesScanned: total,
      completeness: { classified: total, unclassified: 0, total, ratio: total ? 1 : 0 },
      bandCounts,
      topScored: rows[0] || null,
      snapshotAt: null,
    },
    fetchedAt: new Date().toISOString(),
  };
}
