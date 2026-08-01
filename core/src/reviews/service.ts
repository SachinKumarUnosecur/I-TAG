import type { AccessService } from '../access/service.js';
import type { ReviewDecisionStore } from '../adapters/memory-review-decision-store.js';
import type {
  ReviewAssignment,
  ReviewAssignmentDetail,
  ReviewCampaign,
  ReviewCampaignRow,
  ReviewDecision,
  ReviewDecisionOutcome,
  ReviewDecisionRecord,
  ReviewDecisionRequest,
  ReviewExportFramework,
  ReviewItem,
  ReviewItemProfile,
  ReviewProfileOutcome,
  ReviewQuery,
  ReviewRiskBand,
  ReviewSummary,
} from '../domain/access-reviews.js';
import type { AccessPath } from '../domain/access.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { RiskFindingLevel, RiskRow } from '../domain/risk.js';
import type { Identity, IdentityType } from '../domain/types.js';
import type { RiskService } from '../risk/service.js';

/**
 * Access Reviews — `docs/PRD-access-reviews.md`.
 *
 * Quotes AccessService + RiskService (which already embeds ownership context).
 * Owns campaign membership and the decision journal only.
 */

const CAMPAIGNS: readonly ReviewCampaign[] = Object.freeze([
  {
    id: 'camp-001',
    name: 'Identities Access Review',
    scope: 'identities',
    reviewer: 'tom.walker',
    reviewers: Object.freeze(['tom.walker', 'priya.sharma', 'sara.jones']),
    dueDate: '2026-08-15',
    status: 'in_progress',
  },
  {
    id: 'camp-002',
    name: 'Data Pipeline Quarterly Attestation',
    scope: 'data-pipeline',
    reviewer: 'priya.sharma',
    reviewers: Object.freeze(['priya.sharma', 'elise.moran']),
    dueDate: '2026-08-30',
    status: 'in_progress',
  },
]);

/** Demo seed decisions for a handful of well-known identities (`PRD` §6). */
const SEED_DECISIONS: Readonly<Record<string, ReviewDecision>> = Object.freeze({
  'user-jane': 'escalated',
  'user-alice': 'approved',
  'user-bob': 'pending',
  'user-carol': 'approved',
  'user-dan': 'pending',
  'user-erin': 'pending',
  'user-heidi': 'pending',
  'user-victor': 'revoked',
  'svc-vpn-legacy': 'escalated',
  'svc-backup': 'pending',
  'svc-payments-recon': 'approved',
  'svc-legacy-export': 'revoked',
  'svc-breakglass-root': 'pending',
  'svc-systemroot': 'revoked',
  'agent-incident-responder': 'approved',
  'agent-report': 'revoked',
  'agent-crm-writer': 'approved',
});

const DECISION_CYCLE: readonly ReviewDecision[] = Object.freeze([
  'pending',
  'approved',
  'pending',
  'revoked',
  'approved',
  'escalated',
]);

const DATA_PIPELINE_APPS = new Set(['snowflake', 'mcp-gateway']);

export interface AccessReviewsDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  readonly access: AccessService;
  readonly risk: RiskService;
  readonly decisions: ReviewDecisionStore;
}

export interface AccessReviewsService {
  summary(query?: ReviewQuery): ReviewSummary;
  list(query?: ReviewQuery): { readonly count: number; readonly items: readonly ReviewItem[]; readonly summary: ReviewSummary };
  campaigns(): readonly ReviewCampaignRow[];
  profile(itemId: string, opts?: { readonly connector?: string }): ReviewProfileOutcome;
  decide(itemId: string, request: ReviewDecisionRequest): ReviewDecisionOutcome;
  exportCsv(framework: ReviewExportFramework): string;
}

function itemIdFor(identityId: string): string {
  return `ri-${identityId}`;
}

function identityIdFromItemId(itemId: string): string | null {
  if (!itemId.startsWith('ri-') || itemId.length <= 3) {
    return null;
  }
  return itemId.slice(3);
}

function campaignIdFor(identity: Identity): string {
  return DATA_PIPELINE_APPS.has(identity.app) ? 'camp-002' : 'camp-001';
}

function uiType(type: IdentityType): 'human' | 'service' {
  return type === 'human' ? 'human' : 'service';
}

function accessTypeLabel(pathType: AccessPath['path_type']): 'Direct' | 'Indirect' | 'Shadow' {
  if (pathType === 'direct') return 'Direct';
  if (pathType === 'indirect') return 'Indirect';
  return 'Shadow';
}

function riskBandFor(row: RiskRow | undefined): { band: ReviewRiskBand; score: number; worst: RiskFindingLevel | null } {
  if (!row) {
    return { band: 'Desirable', score: 0, worst: null };
  }
  const { assessment } = row;
  if (assessment.kind === 'findings') {
    const map: Record<RiskFindingLevel, ReviewRiskBand> = {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    };
    return {
      band: map[assessment.worst_level],
      score: assessment.factors_firing,
      worst: assessment.worst_level,
    };
  }
  return { band: 'Desirable', score: 0, worst: null };
}

function ownerName(
  row: RiskRow | undefined,
  identityById: ReadonlyMap<string, Identity>,
): string | null {
  const owner = row?.ownership.owner;
  if (!owner) return null;
  const named = identityById.get(owner.id);
  return named?.name ?? owner.id;
}

function seededDecision(identityId: string, index: number): ReviewDecision {
  return SEED_DECISIONS[identityId] ?? DECISION_CYCLE[index % DECISION_CYCLE.length] ?? 'pending';
}

function connectorForPath(path: AccessPath): string {
  return path.app;
}

function pathResource(path: AccessPath): string {
  if (path.path_type === 'hop') {
    return path.assumed_identity;
  }
  if (path.path_type === 'indirect') {
    return path.via_group;
  }
  return path.permission;
}

function pathMechanism(path: AccessPath): string | null {
  const last = path.chain[path.chain.length - 1];
  return last?.mechanism ?? null;
}

function sortPaths(paths: readonly AccessPath[]): AccessPath[] {
  const rank = { hop: 3, indirect: 2, direct: 1 } as const;
  return [...paths].sort(
    (a, b) =>
      rank[b.path_type] - rank[a.path_type]
      || b.hop_count - a.hop_count
      || a.permission.localeCompare(b.permission),
  );
}

function tallySummary(items: readonly ReviewItem[]): ReviewSummary {
  return {
    pending: items.filter((i) => i.decision === 'pending').length,
    approved: items.filter((i) => i.decision === 'approved').length,
    revoked: items.filter((i) => i.decision === 'revoked').length,
    escalated: items.filter((i) => i.decision === 'escalated').length,
    identityCount: items.length,
    grantCount: items.reduce((n, i) => n + i.grantCount, 0),
  };
}

function campaignTally(items: readonly ReviewItem[]): Omit<ReviewCampaignRow, keyof ReviewCampaign> {
  const approvedItems = items.filter((i) => i.decision === 'approved').length;
  const revokedItems = items.filter((i) => i.decision === 'revoked').length;
  const pendingItems = items.filter((i) => i.decision === 'pending').length;
  const escalatedItems = items.filter((i) => i.decision === 'escalated').length;
  const totalItems = items.length;
  const decided = approvedItems + revokedItems + escalatedItems;
  return {
    totalItems,
    approvedItems,
    revokedItems,
    pendingItems,
    escalatedItems,
    completionPct: totalItems ? Math.round((decided / totalItems) * 100) : 0,
  };
}

function matchesQuery(item: ReviewItem, query: ReviewQuery): boolean {
  if (query.campaignId && query.campaignId !== 'all' && item.campaignId !== query.campaignId) {
    return false;
  }
  if (
    query.decision
    && query.decision !== 'all'
    && item.decision !== query.decision
  ) {
    return false;
  }
  if (query.connector && query.connector !== 'all' && !item.connectors.includes(query.connector)) {
    return false;
  }
  const q = (query.search ?? '').trim().toLowerCase();
  if (!q) return true;
  return (
    item.identityName.toLowerCase().includes(q)
    || (item.owner ?? '').toLowerCase().includes(q)
    || item.connectors.some((c) => c.toLowerCase().includes(q))
    || (item.resource ?? '').toLowerCase().includes(q)
    || item.identityId.toLowerCase().includes(q)
  );
}

export function createAccessReviewsService(deps: AccessReviewsDeps): AccessReviewsService {
  function identityIndex(): {
    identities: readonly Identity[];
    byId: ReadonlyMap<string, Identity>;
  } {
    const identities = deps.graphSource
      .graph()
      .dataset.identities.filter((identity) => identity.type !== 'group');
    return {
      identities,
      byId: new Map(deps.graphSource.graph().dataset.identities.map((i) => [i.id, i])),
    };
  }

  function riskByIdentity(): Map<string, RiskRow> {
    const map = new Map<string, RiskRow>();
    for (const row of deps.risk.list({ includeWithoutFindings: true })) {
      map.set(row.identity_id, row);
    }
    return map;
  }

  function decisionFor(itemId: string, identityId: string, index: number): ReviewDecision {
    const recorded = deps.decisions.latest(itemId);
    if (recorded) return recorded.decision;
    return seededDecision(identityId, index);
  }

  function assignmentsFor(
    identity: Identity,
    connector: string | undefined,
  ): { assignments: ReviewAssignment[]; connectors: string[] } {
    const outcome = deps.access.profile(identity.id);
    if (!outcome.ok) {
      return { assignments: [], connectors: [] };
    }
    const sorted = sortPaths(outcome.profile.paths);
    const mapped: ReviewAssignment[] = sorted.map((path) => {
      const connectorLabel = connectorForPath(path);
      const shadowAdmin = path.path_type === 'hop' && path.sensitive;
      return {
        id: `${path.identity_id}:${path.path_type}:${path.permission}:${path.hop_count}`,
        identityId: path.identity_id,
        identityName: identity.name,
        resource: pathResource(path),
        accessType: accessTypeLabel(path.path_type),
        pathType: path.path_type,
        hopCount: path.hop_count,
        mechanism: pathMechanism(path),
        cloudProvider: null,
        connector: connectorLabel,
        permissions: [path.permission],
        resourceSensitivity: path.sensitive ? 'critical' : null,
        lastConfirmed: null,
        shadowAdmin,
      };
    });
    const connectors = [...new Set(mapped.map((a) => a.connector))].sort();
    const filtered =
      connector && connector !== 'all'
        ? mapped.filter((a) => a.connector === connector)
        : mapped;
    return { assignments: filtered, connectors };
  }

  function buildItem(
    identity: Identity,
    index: number,
    riskMap: Map<string, RiskRow>,
    byId: ReadonlyMap<string, Identity>,
  ): ReviewItem {
    const id = itemIdFor(identity.id);
    const risk = riskBandFor(riskMap.get(identity.id));
    const { assignments, connectors } = assignmentsFor(identity, undefined);
    const primary = assignments[0] ?? null;
    const permissionCount = assignments.reduce((n, a) => n + a.permissions.length, 0);
    const shadowAdmin = assignments.some((a) => a.shadowAdmin);

    return {
      id,
      campaignId: campaignIdFor(identity),
      identityId: identity.id,
      identityName: identity.name,
      type: uiType(identity.type),
      identityType: identity.type,
      status: 'active',
      resource: primary?.resource ?? null,
      accessType: primary?.accessType ?? null,
      riskScore: risk.score,
      riskBand: risk.band,
      worstLevel: risk.worst,
      owner: ownerName(riskMap.get(identity.id), byId),
      decision: decisionFor(id, identity.id, index),
      shadowAdmin,
      connectors,
      grantCount: assignments.length,
      permissionCount,
      app: identity.app,
    };
  }

  function allItems(): ReviewItem[] {
    const { identities, byId } = identityIndex();
    const riskMap = riskByIdentity();
    return identities.map((identity, index) => buildItem(identity, index, riskMap, byId));
  }

  function filteredItems(query: ReviewQuery = {}): ReviewItem[] {
    return allItems().filter((item) => matchesQuery(item, query));
  }

  return {
    summary(query = {}) {
      return tallySummary(filteredItems(query));
    },

    list(query = {}) {
      const items = filteredItems(query);
      return {
        count: items.length,
        items,
        summary: tallySummary(items),
      };
    },

    campaigns() {
      const items = allItems();
      return CAMPAIGNS.map((def) => ({
        ...def,
        ...campaignTally(items.filter((i) => i.campaignId === def.id)),
      }));
    },

    profile(itemId, opts = {}) {
      const identityId = identityIdFromItemId(itemId);
      if (identityId === null) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const { identities, byId } = identityIndex();
      const index = identities.findIndex((i) => i.id === identityId);
      if (index < 0) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const identity = identities[index];
      if (identity === undefined) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const riskMap = riskByIdentity();
      const item = buildItem(identity, index, riskMap, byId);
      const { assignments, connectors } = assignmentsFor(identity, opts.connector);
      const permissionCount = assignments.reduce((n, a) => n + a.permissions.length, 0);
      const detail: ReviewAssignmentDetail = {
        identityId: identity.id,
        identityName: identity.name,
        type: uiType(identity.type),
        status: 'active',
        owner: item.owner,
        riskScore: item.riskScore,
        riskBand: item.riskBand,
        connectors,
        assignments,
        grantCount: assignments.length,
        permissionCount,
      };
      const profile: ReviewItemProfile = { item, detail };
      return { ok: true, profile };
    },

    decide(itemId, request) {
      if (
        request.actor.trim().length === 0
        || request.justification.trim().length === 0
      ) {
        return { ok: false, error: 'missing_field', item_id: itemId };
      }
      const identityId = identityIdFromItemId(itemId);
      if (identityId === null) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const { identities, byId } = identityIndex();
      const index = identities.findIndex((i) => i.id === identityId);
      if (index < 0) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const identity = identities[index];
      if (identity === undefined) {
        return { ok: false, error: 'unknown_item', item_id: itemId };
      }
      const riskMap = riskByIdentity();
      const current = buildItem(identity, index, riskMap, byId);
      if (current.decision !== 'pending') {
        return { ok: false, error: 'not_pending', item_id: itemId };
      }

      const decision: Exclude<ReviewDecision, 'pending'> =
        request.action === 'approve'
          ? 'approved'
          : request.action === 'revoke'
            ? 'revoked'
            : 'escalated';

      const record: ReviewDecisionRecord = {
        item_id: itemId,
        identity_id: identityId,
        decision,
        actor: request.actor.trim(),
        justification: request.justification.trim(),
        at: deps.clock.now().toISOString(),
      };
      deps.decisions.append(record);
      const item = buildItem(identity, index, riskMap, byId);
      return { ok: true, item, record };
    },

    exportCsv(framework) {
      const label =
        framework === 'soc2'
          ? 'SOC 2 attestation evidence export — not a certification'
          : 'ISO 27001 attestation evidence export — not a certification';
      const header = [
        'export_label',
        'framework',
        'item_id',
        'campaign_id',
        'identity_id',
        'identity_name',
        'owner',
        'decision',
        'risk_band',
        'factors_firing',
        'grant_count',
        'app',
      ].join(',');
      const escape = (value: string): string =>
        /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
      const rows = allItems().map((item) =>
        [
          label,
          framework,
          item.id,
          item.campaignId,
          item.identityId,
          item.identityName,
          item.owner ?? '',
          item.decision,
          item.riskBand,
          String(item.riskScore),
          String(item.grantCount),
          item.app ?? '',
        ]
          .map(escape)
          .join(','),
      );
      return [header, ...rows].join('\n');
    },
  };
}
