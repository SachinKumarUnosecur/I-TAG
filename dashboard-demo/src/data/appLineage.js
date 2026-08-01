/**
 * Per-app lineage catalog + creation audit logs.
 * Shape mirrors I-TAG official model:
 *   AppRecord          — docs/PRD-delegation-chain.md §6.6 / domain/types.ts
 *   PersistedCreationEdge — domain/lineage.ts (system of record for creators)
 *
 * App keys are kebab-case and shared by identities.apps[], delegationChains,
 * review campaign scopes, and these logs.
 */

export const APP_KEYS = {
  payments: 'payments',
  dataPipeline: 'data-pipeline',
  devops: 'devops',
};

/** Official AppRecord list — creation_data_from is the audit-retention floor. */
export const apps = [
  {
    id: 'payments',
    name: 'Payments',
    creation_data_from: '2022-01-01',
    connectors: ['src-aws', 'src-okta', 'src-azure', 'src-workday'],
    audit_source: 'aws.cloudtrail + okta.system_log + workday.workers',
  },
  {
    id: 'data-pipeline',
    name: 'Data Pipeline',
    creation_data_from: '2022-06-01',
    connectors: ['src-gcp', 'src-okta', 'src-gws', 'src-workday'],
    audit_source: 'gcp.admin_activity + okta.system_log + workday.workers',
  },
  {
    id: 'devops',
    name: 'DevOps',
    creation_data_from: '2022-01-01',
    connectors: ['src-aws', 'src-gcp', 'src-azure', 'src-okta', 'src-workday'],
    audit_source: 'aws.cloudtrail + gcp.admin_activity + azure.activity_log + workday.workers',
  },
];

/** Bootstrap IdP identity — treated as a User (not a system node) in the graph. */
const IDP_USER = {
  id: 'id-sys-001',
  name: 'okta.admin',
  type: 'human',
  originatorId: 'id-sys-001',
  originator: 'okta.admin',
};

// Back-compat alias used by older call sites
const ROOT = IDP_USER;

/**
 * Append-only creation edges (PersistedCreationEdge).
 * One edge per identity per app — child has exactly one creator in that app.
 *
 * Edges dated before app.creation_data_from (or marked outside_window_backfill)
 * surface as first-known user trees — creator before audit retention is unknown.
 */
export const creationEdges = [
  // ── Payments (audit from 2022-01-01) ────────────────────────────────────
  edge('payments', 'id-001', humanActor('payments', 'okta.admin', 'id-sys-001'), '2023-01-15', 'audit_event'),
  edge('payments', 'id-005', humanActor('payments', 'okta.admin', 'id-sys-001'), '2020-03-10', 'outside_window_backfill'),
  edge('payments', 'id-012', humanActor('payments', 'okta.admin', 'id-sys-001'), '2023-11-05', 'audit_event'),
  edge('payments', 'id-014', humanActor('payments', 'okta.admin', 'id-sys-001'), '2019-09-01', 'outside_window_backfill'),
  edge('payments', 'id-007', humanActor('payments', 'okta.admin', 'id-sys-001'), '2024-02-14', 'audit_event'),
  // First-known users (pre-audit) — appear as their own root trees
  edge('payments', 'id-016', humanActor('payments', 'okta.admin', 'id-sys-001'), '2018-04-01', 'outside_window_backfill'),
  edge('payments', 'id-017', humanActor('payments', 'okta.admin', 'id-sys-001'), '2019-01-20', 'outside_window_backfill'),
  edge('payments', 'id-101', humanActor('payments', 'jane.doe', 'id-001', 'acting_principal_is_human'), '2023-02-01', 'audit_event'),
  edge('payments', 'id-107', roleSessionActor('payments', 'arn:aws:iam::481516234210:role/svc-payments-api', 'svc-payments-api', 'jane.doe', 'sts_source_identity'), '2023-06-01', 'audit_event', 'id-101'),
  edge('payments', 'id-105', humanActor('payments', 'alice.brooks', 'id-005', 'acting_principal_is_human'), '2020-04-15', 'outside_window_backfill'),
  edge('payments', 'id-114', humanActor('payments', 'alice.brooks', 'id-005', 'acting_principal_is_human'), '2021-08-01', 'outside_window_backfill'),
  edge('payments', 'id-115', humanActor('payments', 'alice.brooks', 'id-005', 'acting_principal_is_human'), '2026-06-12', 'audit_event'),
  edge('payments', 'id-122', humanActor('payments', 'nora.whitfield', 'id-014', 'acting_principal_is_human'), '2021-03-01', 'outside_window_backfill'),
  edge('payments', 'id-132', humanActor('payments', 'nora.whitfield', 'id-014', 'acting_principal_is_human'), '2020-11-01', 'outside_window_backfill'),
  edge('payments', 'id-125', humanActor('payments', 'alice.brooks', 'id-005', 'acting_principal_is_human'), '2022-02-01', 'audit_event'),
  edge('payments', 'id-020', humanActor('payments', 'okta.admin', 'id-sys-001'), '2022-06-01', 'audit_event'),
  edge('payments', 'id-126', humanActor('payments', 'claire.nguyen', 'id-020', 'acting_principal_is_human'), '2023-04-12', 'audit_event'),
  edge('payments', 'id-127', humanActor('payments', 'claire.nguyen', 'id-020', 'acting_principal_is_human'), '2023-08-20', 'audit_event'),
  edge('payments', 'id-110', humanActor('payments', 'fatima.hassan', 'id-012', 'acting_principal_is_human'), '2024-09-01', 'audit_event'),
  edge('payments', 'id-117', humanActor('payments', 'henry.cole', 'id-016', 'acting_principal_is_human'), '2019-06-01', 'outside_window_backfill'),
  edge('payments', 'id-118', humanActor('payments', 'maya.singh', 'id-017', 'acting_principal_is_human'), '2020-02-01', 'outside_window_backfill'),
  edge('payments', 'id-119', humanActor('payments', 'maya.singh', 'id-017', 'acting_principal_is_human'), '2021-03-15', 'outside_window_backfill'),

  // ── Data Pipeline (audit from 2022-06-01) ───────────────────────────────
  edge('data-pipeline', 'id-003', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2023-04-20', 'audit_event'),
  edge('data-pipeline', 'id-006', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2021-09-01', 'outside_window_backfill'),
  edge('data-pipeline', 'id-009', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2024-06-01', 'audit_event'),
  edge('data-pipeline', 'id-015', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2026-05-12', 'audit_event'),
  edge('data-pipeline', 'id-018', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2020-11-01', 'outside_window_backfill'),
  edge('data-pipeline', 'id-022', humanActor('data-pipeline', 'okta.admin', 'id-sys-001'), '2023-01-09', 'audit_event'),
  edge('data-pipeline', 'id-102', humanActor('data-pipeline', 'priya.sharma', 'id-003', 'acting_principal_is_human'), '2023-05-10', 'audit_event'),
  edge('data-pipeline', 'id-108', humanActor('data-pipeline', 'priya.sharma', 'id-003', 'acting_principal_is_human'), '2024-01-15', 'audit_event'),
  edge('data-pipeline', 'id-104', humanActor('data-pipeline', 'raj.patel', 'id-006', 'acting_principal_is_human'), '2021-10-01', 'object_field'),
  edge('data-pipeline', 'id-116', humanActor('data-pipeline', 'raj.patel', 'id-006', 'acting_principal_is_human'), '2026-05-20', 'audit_event'),
  edge('data-pipeline', 'id-124', humanActor('data-pipeline', 'raj.patel', 'id-006', 'acting_principal_is_human'), '2022-11-01', 'audit_event'),
  edge('data-pipeline', 'id-130', humanActor('data-pipeline', 'helena.cho', 'id-022', 'acting_principal_is_human'), '2023-06-01', 'audit_event'),
  edge('data-pipeline', 'id-131', humanActor('data-pipeline', 'helena.cho', 'id-022', 'acting_principal_is_human'), '2024-02-14', 'audit_event'),
  edge('data-pipeline', 'id-120', humanActor('data-pipeline', 'elise.moran', 'id-018', 'acting_principal_is_human'), '2021-02-10', 'outside_window_backfill'),

  // ── DevOps (audit from 2022-01-01) ──────────────────────────────────────
  edge('devops', 'id-002', humanActor('devops', 'okta.admin', 'id-sys-001'), '2022-08-01', 'audit_event'),
  edge('devops', 'id-008', humanActor('devops', 'okta.admin', 'id-sys-001'), '2022-03-18', 'audit_event'),
  edge('devops', 'id-004', humanActor('devops', 'okta.admin', 'id-sys-001'), '2021-11-01', 'outside_window_backfill'),
  edge('devops', 'id-011', humanActor('devops', 'okta.admin', 'id-sys-001'), '2021-05-01', 'outside_window_backfill'),
  edge('devops', 'id-013', humanActor('devops', 'okta.admin', 'id-sys-001'), '2022-01-20', 'audit_event'),
  edge('devops', 'id-010', humanActor('devops', 'okta.admin', 'id-sys-001'), '2023-08-12', 'audit_event'),
  edge('devops', 'id-019', humanActor('devops', 'okta.admin', 'id-sys-001'), '2019-07-15', 'outside_window_backfill'),
  edge('devops', 'id-021', humanActor('devops', 'okta.admin', 'id-sys-001'), '2021-02-10', 'outside_window_backfill'),
  edge('devops', 'id-103', humanActor('devops', 'mark.chen', 'id-002', 'acting_principal_is_human'), '2022-09-01', 'audit_event'),
  edge('devops', 'id-106', humanActor('devops', 'mark.chen', 'id-002', 'acting_principal_is_human'), '2023-01-01', 'audit_event'),
  edge('devops', 'id-109', humanActor('devops', 'lena.okonkwo', 'id-008', 'acting_principal_is_human'), '2023-03-01', 'audit_event'),
  edge('devops', 'id-112', humanActor('devops', 'lena.okonkwo', 'id-008', 'acting_principal_is_human'), '2023-07-20', 'audit_event'),
  edge('devops', 'id-113', humanActor('devops', 'tom.walker', 'id-004', 'acting_principal_is_human'), '2022-11-01', 'audit_event'),
  edge('devops', 'id-111', humanActor('devops', 'owen.blake', 'id-011', 'acting_principal_is_human'), '2021-06-01', 'object_field'),
  edge('devops', 'id-123', humanActor('devops', 'owen.blake', 'id-011', 'acting_principal_is_human'), '2022-01-15', 'audit_event'),
  edge('devops', 'id-128', humanActor('devops', 'derek.frost', 'id-021', 'acting_principal_is_human'), '2021-08-01', 'object_field'),
  edge('devops', 'id-129', humanActor('devops', 'derek.frost', 'id-021', 'acting_principal_is_human'), '2022-03-18', 'audit_event'),
  edge('devops', 'id-121', humanActor('devops', 'quinn.adebayo', 'id-019', 'acting_principal_is_human'), '2020-08-01', 'outside_window_backfill'),
];

function humanActor(app, principal, identityId, basis = 'acting_principal_is_human') {
  const isIdp = identityId === 'id-sys-001';
  return {
    raw_principal: principal,
    kind: 'human',
    app,
    issuer: null,
    attested_human: isIdp ? principal : principal,
    attested_basis: isIdp ? 'idp_bootstrap_user' : basis,
    pipeline_actor: null,
    review_approver: null,
    identity_id: identityId,
  };
}

function roleSessionActor(app, rawPrincipal, issuer, attestedHuman, basis) {
  return {
    raw_principal: rawPrincipal,
    kind: 'role_session',
    app,
    issuer,
    attested_human: attestedHuman,
    attested_basis: basis,
    pipeline_actor: null,
    review_approver: attestedHuman,
    identity_id: 'id-101', // resolved parent for tree (role issuer)
  };
}

function edge(app, childId, actor, occurredAt, source, parentOverride = null) {
  return {
    id: `ce-${app}-${childId}`,
    app,
    child_id: childId,
    actor,
    parent_id: parentOverride || actor.identity_id,
    observed_at: occurredAt,
    occurred_at: occurredAt,
    source: source === 'outside_window_backfill' ? 'backfill_import' : source,
    superseded_by: null,
  };
}

/**
 * Provider-style activity / audit log rows per app (CloudTrail / Okta / GCP Admin).
 * Same identities and timestamps as creationEdges, plus later access events.
 */
export const appActivityLogs = {
  payments: [
    log('payments', 'user.lifecycle.create', 'id-sys-001', 'id-001', '2023-01-15T10:00:00Z', 'okta.system_log', 'info'),
    log('payments', 'CreateRole', 'id-001', 'id-101', '2023-02-01T12:00:00Z', 'aws.cloudtrail', 'info'),
    log('payments', 'CreateRole', 'id-101', 'id-107', '2023-06-01T09:30:00Z', 'aws.cloudtrail', 'info', {
      sessionIssuer: 'arn:aws:iam::481516234210:role/svc-payments-api',
      sourceIdentity: 'jane.doe',
    }),
    log('payments', 'CreateRole', 'id-005', 'id-105', '2020-04-15T09:00:00Z', 'aws.cloudtrail', 'info'),
    log('payments', 'CreateRole', 'id-005', 'id-114', '2021-08-01T11:00:00Z', 'aws.cloudtrail', 'info'),
    log('payments', 'CreateRole', 'id-005', 'id-125', '2022-02-01T10:00:00Z', 'aws.cloudtrail', 'info'),
    log('payments', 'Add service principal', 'id-012', 'id-110', '2024-09-01T14:00:00Z', 'azure.activity_log', 'info'),
    log('payments', 'Add service principal', 'id-020', 'id-126', '2023-04-12T13:00:00Z', 'azure.activity_log', 'info'),
    log('payments', 'Add service principal', 'id-020', 'id-127', '2023-08-20T15:00:00Z', 'azure.activity_log', 'info'),
    log('payments', 'ssm:StartSession', 'id-001', 'ec2://i-0abc123', '2026-07-31T08:00:00Z', 'aws.cloudtrail', 'critical'),
    log('payments', 'sts:AssumeRole', 'id-105', 'iam://payments-admin-role', '2026-06-20T04:12:00Z', 'aws.cloudtrail', 'critical'),
    log('payments', 'user.lifecycle.deactivate', 'id-sys-001', 'id-005', '2026-06-01T18:00:00Z', 'okta.system_log', 'high'),
    log('payments', 'user.lifecycle.deactivate', 'id-sys-001', 'id-014', '2026-03-01T12:00:00Z', 'okta.system_log', 'high'),
    log('payments', 'user.lifecycle.deactivate', 'id-sys-001', 'id-020', '2026-03-15T19:00:00Z', 'okta.system_log', 'high'),
  ],
  'data-pipeline': [
    log('data-pipeline', 'user.lifecycle.create', 'id-sys-001', 'id-003', '2023-04-20T10:00:00Z', 'okta.system_log', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-003', 'id-102', '2023-05-10T15:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-003', 'id-108', '2024-01-15T16:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-006', 'id-104', '2021-10-01T08:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-006', 'id-124', '2022-11-01T09:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-022', 'id-130', '2023-06-01T10:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'google.iam.service_account.create', 'id-022', 'id-131', '2024-02-14T11:00:00Z', 'gcp.admin_activity', 'info'),
    log('data-pipeline', 'compute.instances.osLogin', 'id-003', 'gce://data-pipeline-vm', '2026-07-30T11:20:00Z', 'gcp.admin_activity', 'critical'),
    log('data-pipeline', 'storage.objects.get', 'id-104', 'storage://raw-pii-data', '2026-07-10T03:05:00Z', 'gcp.data_access', 'critical'),
    log('data-pipeline', 'user.lifecycle.deactivate', 'id-sys-001', 'id-006', '2026-05-15T17:00:00Z', 'okta.system_log', 'high'),
    log('data-pipeline', 'user.lifecycle.deactivate', 'id-sys-001', 'id-022', '2026-07-01T17:00:00Z', 'okta.system_log', 'high'),
  ],
  devops: [
    log('devops', 'user.lifecycle.create', 'id-sys-001', 'id-002', '2022-08-01T10:00:00Z', 'okta.system_log', 'info'),
    log('devops', 'google.iam.service_account.create', 'id-002', 'id-103', '2022-09-01T12:00:00Z', 'gcp.admin_activity', 'info'),
    log('devops', 'CreateRole', 'id-002', 'id-106', '2023-01-01T09:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-008', 'id-109', '2023-03-01T11:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-008', 'id-112', '2023-07-20T13:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-004', 'id-113', '2022-11-01T10:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-011', 'id-111', '2021-06-01T08:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-021', 'id-128', '2021-08-01T09:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'CreateRole', 'id-021', 'id-129', '2022-03-18T11:00:00Z', 'aws.cloudtrail', 'info'),
    log('devops', 'io.k8s.core.v1.pods.exec', 'id-002', 'gke://devops-cluster', '2026-07-28T16:00:00Z', 'gcp.admin_activity', 'high'),
    log('devops', 'user.lifecycle.deactivate', 'id-sys-001', 'id-011', '2026-04-30T18:00:00Z', 'okta.system_log', 'high'),
    log('devops', 'user.lifecycle.deactivate', 'id-sys-001', 'id-021', '2026-01-20T18:30:00Z', 'okta.system_log', 'high'),
  ],
};

function log(app, action, actorId, targetId, timestamp, source, severity, detail = null) {
  return {
    id: `log-${app}-${action.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${String(targetId).replace(/[^a-z0-9]+/gi, '-')}-${timestamp.slice(0, 10)}`,
    app,
    action,
    actor_id: actorId,
    target_id: targetId,
    timestamp,
    source,
    severity,
    detail,
  };
}

/**
 * Build per-app delegation forests from creationEdges + identity catalog.
 * Tree parent = parent_id on the edge (official CREATED_BY).
 */
export function buildDelegationChains(identities) {
  const byId = Object.fromEntries(identities.map(i => [i.id, i]));
  const chains = {};

  for (const app of apps) {
    const edges = creationEdges.filter(e => e.app === app.id && !e.superseded_by);
    const childIds = new Set(edges.map(e => e.child_id));
    const childrenOf = new Map();

    for (const e of edges) {
      const parentId = e.parent_id;
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(e);
    }

    const statusFor = (id) => byId[id]?.status || 'active';
    const typeFor = (id) => (id === IDP_USER.id ? 'human' : byId[id]?.type || 'human');
    const nameFor = (id) => (id === IDP_USER.id ? IDP_USER.name : byId[id]?.name || id);

    function isOutsideAuditWindow(edge) {
      if (!edge) return false;
      // Backfill imports are always pre-retention. object_field only when dated before floor.
      if (edge.source === 'backfill_import') return true;
      if (app.creation_data_from && edge.occurred_at && edge.occurred_at < app.creation_data_from) {
        return true;
      }
      return false;
    }

    function buildNode(id, parentEdge = null, compromiseCtx = null, departureCtx = null, opts = {}) {
      const identity = byId[id];
      const firstKnownRoot = Boolean(opts.firstKnownRoot);
      const originatorId = firstKnownRoot
        ? null
        : (parentEdge?.parent_id || (id === IDP_USER.id ? IDP_USER.id : IDP_USER.id));
      let originator = firstKnownRoot
        ? 'No originator'
        : nameFor(originatorId);
      // IdP / directory bootstrap is not a human originator
      if (!firstKnownRoot && parentEdge?.parent_id === IDP_USER.id) {
        originator = 'No originator';
      } else if (!firstKnownRoot && parentEdge?.actor?.attested_human
        && parentEdge.actor.identity_id !== IDP_USER.id) {
        originator = parentEdge.actor.attested_human;
      } else if (!firstKnownRoot && parentEdge?.actor?.raw_principal
        && parentEdge.actor.identity_id !== IDP_USER.id) {
        originator = parentEdge.actor.raw_principal;
      }
      if (
        originator === IDP_USER.name
        || originator === 'okta.admin'
        || originator === 'Okta directory'
      ) {
        originator = 'No originator';
      }

      // Propagate nearest compromised / departed ancestor context.
      let nextCompromise = compromiseCtx;
      if (identity?.compromisedAt) {
        nextCompromise = {
          id: identity.id,
          name: identity.name,
          at: identity.compromisedAt,
        };
      }

      const departedAt = identity?.departedAt
        || identity?.sources?.hr?.terminationDate
        || (identity?.status === 'departed' ? identity.lastActive : null);

      let nextDeparture = departureCtx;
      if (departedAt) {
        nextDeparture = {
          id: identity.id,
          name: identity.name,
          at: departedAt,
        };
      }

      const createdAt = identity?.createdAt
        || parentEdge?.occurred_at
        || null;
      const isService = (identity?.type || typeFor(id)) === 'service';
      const isCompromisedUser = Boolean(identity?.compromisedAt);
      const isDepartedUser = identity?.status === 'departed' || Boolean(identity?.departedAt);

      // Created after a departed ancestor left (ghost / residual credential provisioning)
      const postDeparture = Boolean(
        !isDepartedUser
        && nextDeparture?.at
        && createdAt
        && createdAt > nextDeparture.at,
      );

      // Pre-integration / no retained creation logs — edge case.
      // Do not treat as orphaned or compromise-path (those need post-integration evidence).
      const preIntegration = Boolean(
        firstKnownRoot
        || isOutsideAuditWindow(parentEdge)
        || (app.creation_data_from && createdAt && createdAt < app.creation_data_from),
      );

      // On a compromise path (self or ancestor) — only after integration
      const postCompromise = Boolean(
        !preIntegration
        && !isDepartedUser
        && (
          isCompromisedUser
          || (nextCompromise?.at && createdAt && createdAt >= nextCompromise.at)
        ),
      );

      // Owner left / no owner → orphaned NHI (post-integration only; not compromised)
      const ownerId = identity?.owner || null;
      const owner = ownerId ? byId[ownerId] : null;
      const ownerDeparted = Boolean(
        owner
        && (owner.status === 'departed' || owner.departedAt),
      );
      const orphanedNhi = Boolean(
        isService
        && !isCompromisedUser
        && !preIntegration
        && (
          identity?.status === 'orphaned'
          || !ownerId
          || ownerDeparted
          || postDeparture
        ),
      );

      // Missing human creator label (display). Distinct from pre-integration evidence.
      const noHumanOriginator = Boolean(
        !originator
        || originator === '—'
        || originator === 'No originator'
        || originator === 'Unknown (pre-audit)'
        || originator === 'Unknown (pre-integration)'
        || originator === 'Okta directory'
        || originator === 'okta.admin',
      );
      // Post-integration NHI with no human originator and not on a compromise path.
      // Pre-integration / no-log edge cases stay plain NHI (not Compromised NHI).
      const compromisedNhiNoPath = Boolean(
        isService
        && !isCompromisedUser
        && !preIntegration
        && !postCompromise
        && !orphanedNhi
        && noHumanOriginator,
      );

      // Chain tone priority:
      // departed HI → orphaned NHI → compromised (self / path / no-originator NHI)
      // → after-departure human → default
      let chainTone = 'default';
      if (isDepartedUser) chainTone = 'departed';
      else if (orphanedNhi) chainTone = 'orphaned';
      else if (isCompromisedUser || postCompromise || compromisedNhiNoPath) chainTone = 'compromised';
      else if (postDeparture && !preIntegration) chainTone = 'after-departure';

      // Delegator: humans delegate as themselves; NHIs use current owner (or originator)
      let delegator = identity?.name || nameFor(id);
      if (isService) {
        delegator = identity.ownerName
          || (owner && owner.name)
          || originator;
      } else if (id === IDP_USER.id) {
        delegator = IDP_USER.name;
      }

      const childEdges = (childrenOf.get(id) || [])
        .slice()
        .sort((a, b) => (a.occurred_at || '').localeCompare(b.occurred_at || ''));

      const node = {
        id,
        name: nameFor(id),
        type: typeFor(id),
        createdAt,
        compromisedAt: identity?.compromisedAt || null,
        departedAt: departedAt || null,
        compromised: isCompromisedUser,
        departed: isDepartedUser,
        postCompromise: postCompromise && !orphanedNhi,
        postDeparture,
        compromisedNhiNoPath,
        preIntegration,
        chainTone,
        firstKnownRoot,
        compromiseSource: postCompromise ? nextCompromise : null,
        departureSource: nextDeparture,
        originatorId: firstKnownRoot
          ? null
          : (parentEdge?.actor?.attested_human
            ? (Object.values(byId).find(i => i.name === parentEdge.actor.attested_human)?.id || originatorId)
            : originatorId),
        originator,
        delegator,
        children: childEdges.map(ce => buildNode(ce.child_id, ce, nextCompromise, nextDeparture)),
      };
      const st = statusFor(id);
      if (orphanedNhi) node.status = 'orphaned';
      else if (preIntegration && isService && st === 'orphaned') node.status = 'active';
      else if (st && st !== 'active') node.status = st;
      return node;
    }

    /**
     * NHI pivots on a compromise path also show red (post-integration only).
     * Pre-integration / no-log edge cases stay plain NHI.
     * Human identities do NOT inherit this — only the compromised HI itself is red.
     */
    function markNhiPivots(node) {
      const children = (node.children || []).map(markNhiPivots);
      const pivotChild = children.find(c => (
        !c.preIntegration
        && !c.compromisedNhiNoPath
        && (c.chainTone === 'compromised' || c.compromisedPivot || c.postCompromise || c.compromised)
      ));

      let next = { ...node, children };
      if (
        node.type === 'service'
        && pivotChild
        && !node.preIntegration
        && node.chainTone === 'default'
        && node.status !== 'orphaned'
      ) {
        next = {
          ...next,
          chainTone: 'compromised',
          compromisedPivot: true,
          postCompromise: true,
          compromiseSource: pivotChild.compromiseSource
            || (pivotChild.compromised
              ? { id: pivotChild.id, name: pivotChild.name, at: pivotChild.compromisedAt }
              : node.compromiseSource),
        };
      }
      return next;
    }

    // IdP / directory is never a graph node. In-window creates are peer roots.
    // Identities with no reliable originator (pre-integration) hang under a
    // "No originator" card that carries the connector integration date.
    const idpEdges = childrenOf.get(IDP_USER.id) || [];
    const knownRoots = [];
    const noOriginatorRoots = [];

    for (const e of idpEdges) {
      if (isOutsideAuditWindow(e)) {
        noOriginatorRoots.push(buildNode(e.child_id, null, null, null, { firstKnownRoot: true }));
      } else {
        const node = buildNode(e.child_id, e);
        knownRoots.push({ ...node, graphRoot: true });
      }
    }

    const placed = new Set();
    function mark(n) {
      placed.add(n.id);
      (n.children || []).forEach(mark);
    }
    knownRoots.forEach(mark);
    noOriginatorRoots.forEach(mark);

    for (const e of edges) {
      if (
        !placed.has(e.child_id)
        && e.parent_id !== IDP_USER.id
        && !childIds.has(e.parent_id)
      ) {
        const unknown = isOutsideAuditWindow(e);
        const node = buildNode(e.child_id, e, null, null, { firstKnownRoot: unknown });
        (unknown ? noOriginatorRoots : knownRoots).push(node);
        mark(node);
      }
    }

    for (const e of edges) {
      if (
        e.parent_id
        && e.parent_id !== IDP_USER.id
        && !placed.has(e.parent_id)
        && !childIds.has(e.parent_id)
        && byId[e.parent_id]
      ) {
        const node = buildNode(e.parent_id, null, null, null, { firstKnownRoot: true });
        noOriginatorRoots.push(node);
        mark(node);
      }
    }

    function lacksHumanOriginator(n) {
      if (!n || n.firstKnownRoot) return true;
      const o = String(n.originator || '').trim().toLowerCase();
      return !o
        || o === '—'
        || o === 'no originator'
        || o === 'unknown'
        || o === 'unknown (pre-audit)'
        || o === 'unknown (pre-integration)'
        || o === 'okta directory'
        || o === 'okta.admin';
    }

    // In-window IdP creates still have no human originator — hang under the hub
    // alongside pre-integration identities. Only roots with a human creator stay peer.
    const annotatedKnown = knownRoots.map(markNhiPivots);
    const stillUnknown = [];
    const stillKnown = [];
    for (const n of annotatedKnown) {
      if (lacksHumanOriginator(n)) stillUnknown.push(n);
      else stillKnown.push(n);
    }
    const annotatedUnknown = [
      ...noOriginatorRoots.map(markNhiPivots),
      ...stillUnknown,
    ];

    const forestChildren = [...stillKnown];
    if (annotatedUnknown.length > 0) {
      // Structural hub per app — UI merge renames to the selected scope (AWS / Okta / …).
      forestChildren.push({
        id: `hub-${app.id}`,
        name: app.name,
        type: 'human',
        isNoOriginator: true,
        chainTone: 'default',
        integratedAt: app.creation_data_from,
        createdAt: app.creation_data_from,
        originator: '—',
        originatorId: null,
        delegator: '—',
        appId: app.id,
        appName: app.name,
        children: annotatedUnknown,
      });
    }

    chains[app.id] = {
      appName: app.name,
      appId: app.id,
      creation_data_from: app.creation_data_from,
      audit_source: app.audit_source,
      root: {
        id: `forest-${app.id}`,
        name: 'Creation lineage',
        type: 'human',
        isForestRoot: true,
        chainTone: 'default',
        originator: '—',
        delegator: '—',
        children: forestChildren,
      },
    };
  }

  return chains;
}

/** True when node itself carries a risk signal (not merely a quiet ancestor). */
export function nodeHasRiskSignal(node) {
  if (!node) return false;
  return Boolean(
    node.compromised
    || node.departed
    || node.status === 'orphaned'
    || node.postCompromise
    || node.postDeparture
    || node.compromisedPivot
    || (node.chainTone && node.chainTone !== 'default'),
  );
}

export function subtreeHasRiskSignal(node) {
  if (!node) return false;
  if (nodeHasRiskSignal(node)) return true;
  return (node.children || []).some(subtreeHasRiskSignal);
}

export function getAppActivityLogs(appId) {
  return appActivityLogs[appId] || [];
}

export function getCreationEdgesForApp(appId) {
  return creationEdges.filter(e => e.app === appId && !e.superseded_by);
}
