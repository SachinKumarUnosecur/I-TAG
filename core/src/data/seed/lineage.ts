import { cluster, type Identity } from './fragment.js';

/**
 * BEATS 16, 17 and 18 — Provisioning Lineage, and the two rows that stay green.
 *
 * `docs/delegation-chain-research.md` §9 measured the seed before this file existed
 * and found the module undemoable on its own data: maximum fan-out 2 against a
 * motivating example of 40, and maximum generation 3 against a proposed `deep_chain`
 * threshold of >4. Three shapes were missing, and all three are here.
 *
 * BEAT 16 — the headline, and the reason this module exists. `svc-legacy-test-oauth`
 * is the Midnight Blizzard shape: a legacy, non-production, unowned application that
 * created exactly ONE account and granted it a privileged role, with no second party
 * in either event. Fan-out 1 and generation 2, so both of the shape flags `PRD` L62-63
 * specifies are silent on it, and `creationAuthority` is the only thing that fires
 * (research §4.4, NIST SP 800-53 AC-2(e)). The creator's own access is deliberately
 * unremarkable — `read:directory-metadata`, nothing sensitive — so no access-based
 * ranking reaches it either. What it *did* is the finding.
 *
 * BEAT 17 — `svc-scim-provisioner`, fan-out 34, GREEN. The row that proves we did not
 * threshold on a number: 34 lifetime creations is the highest in the dataset by an
 * order of magnitude, and it is baseline-normal for an automation actor against its
 * own trailing median, so `fanOutRate` stays silent (research §4.3). It sits in the
 * same tenant as beat 16 on purpose — same app, same audit source, opposite verdicts.
 *
 * BEAT 18 — a five-generation Terraform ladder, GREEN. Research §4.2 deletes
 * `deep_chain`; this is the concrete counterexample to point at when a judge asks why
 * it is missing. Generation 5 is a correct IaC pipeline, and the flag would have fired
 * on all six rows.
 *
 * Every creation here is also carried as a `PersistedCreationEdge`, because research
 * §4.6 makes our own store the system of record: Entra's `directoryAudit` retention is
 * 7 days on the free tier and 30 on P1 (§3.2), so a design that re-reads the provider
 * is permanently lossy. The edges are what let the ladder show an *attested* human on
 * a create from 2025 that the provider forgot about long ago.
 *
 * Dates are calibrated to the pinned clock `ITAG_NOW=2026-07-31T00:00:00Z`, and the
 * day-delta is stated wherever a threshold decision depends on it.
 */

/**
 * The pinned demo instant, so the cohort below can be authored as day-deltas.
 *
 * Not a violation of the Clock port rule: nothing here reads ambient time. It is the
 * same literal every other fragment encodes into its date strings by hand, named once
 * so a 34-row cohort can carry its window arithmetic in the data instead of in a
 * comment a reviewer has to trust.
 */
const PINNED_NOW = Date.parse('2026-07-31T00:00:00Z');

const MS_PER_DAY = 86_400_000;

function daysAgo(days: number): string {
  return new Date(PINNED_NOW - days * MS_PER_DAY).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// BEAT 17 — the provisioning cohort
// ---------------------------------------------------------------------------

/**
 * When each provisioned account was created, in days before the pinned instant.
 *
 * Chosen so the rate arithmetic in `lineage/signals.ts` has something real to chew on
 * rather than a flat line. Against the `automation` baseline (30-day window, 6 trailing
 * windows, 3σ) these fall as 3 in the current window against trailing windows of
 * 2, 4, 2, 3, 3, 2 — a trailing median of 2.5 and a deviation of 0.4σ. A bot creating
 * three accounts this month when it usually creates two or three is the definition of
 * baseline-normal, and that is what the beat has to show.
 *
 * The engineer wanted these generated from a seeded RNG to save the literal list. The
 * CISO position won: a demo number that changes when someone touches the generator is
 * a number nobody can defend on stage, so the distribution is written down.
 */
const PROVISIONED_DAY_OFFSETS: readonly number[] = Object.freeze([
  4, 11, 19, // current window: 3
  34, 51, // 2
  62, 68, 74, 81, // 4
  96, 110, // 2
  123, 131, 144, // 3
  152, 165, 173, // 3
  187, 199, // 2 — the last window the trailing median reads
  215, 228, 242, 255, 271, 283, 301, 312, 330, 345, 361, 372, 392, 405, 421,
]);

function provisionedId(position: number): string {
  return `svc-provisioned-${String(position).padStart(2, '0')}`;
}

/**
 * Ids of the cohort, exported so `seed.test.ts` can pin all 34 verdicts from one
 * generated block instead of thirty-four literal rows that would say the same thing.
 */
export const SCIM_PROVISIONED_IDS: readonly string[] = Object.freeze(
  PROVISIONED_DAY_OFFSETS.map((_unused, offset) => provisionedId(offset + 1)),
);

/**
 * Thirty-four accounts, identical in every column that decides a verdict.
 *
 * Owned through `group-provisioned-workloads` rather than by an explicit tag on each,
 * which is what a real SCIM target looks like and also why they are green: group
 * ownership is how a cohort this size stays accountable without 34 attestations
 * (`ownership/rules.ts` L231-237 scopes the never-attested rule to explicit tags for
 * exactly this reason).
 */
const PROVISIONED_COHORT: readonly Identity[] = PROVISIONED_DAY_OFFSETS.map(
  (offset, index): Identity => {
    const position = index + 1;
    return {
      id: provisionedId(position),
      type: 'service_account',
      name: `provisioned-workload-${String(position).padStart(2, '0')}`,
      app: 'entra-tenant',
      direct_grants: [],
      inherited_from: ['group-provisioned-workloads'],
      // Creation is not delegation. See the note on `svc-legacy-test-oauth` below.
      delegates_to: [],
      provisioned_by: 'svc-scim-provisioner',
      revoked: false,
      created_at: daysAgo(offset),
      last_activity_at: daysAgo(2),
      provisioning_source: 'app_native',
      environment: 'production',
    };
  },
);

// ---------------------------------------------------------------------------
// BEAT 18 — the five-generation ladder
// ---------------------------------------------------------------------------

/**
 * Six rows, generations 0 through 5, all green.
 *
 * Written out rather than generated, unlike `FIXTURES`' depth chain: these are demo
 * rows a reviewer has to be able to read as a plausible landing-zone pipeline, and
 * `bootstrap -> runner -> baseline -> mesh CA -> broker -> executor` only reads that
 * way if the names are real. The depth fixture is generated because eighteen probes
 * have nothing to say individually.
 *
 * All six inherit `group-eng`, which Platform Engineering owns and which holds nothing
 * sensitive, so every row is `owned` with severity `none`. That is the point: research
 * §4.2 killed `deep_chain` because it fires on exactly this, a correct automation
 * ladder with an owner at every rung.
 */
const LADDER: readonly Identity[] = [
  {
    id: 'svc-terraform-ci',
    type: 'service_account',
    name: 'terraform-ci',
    app: 'aws-iam',
    direct_grants: ['deploy:staging'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: null,
    revoked: false,
    created_at: '2025-01-20',
    last_activity_at: '2026-07-30',
    /**
     * The bootstrap role came in with `terraform import` during the landing-zone
     * migration, so the gap bucket is `bulk_imported` rather than unexplained: a
     * migration records one job, not one actor per identity (research §4.5). This and
     * `svc-ldap-print-spool` are the two readers of a `provisioning_source` value that
     * `domain/types.ts` L55 has declared since the first commit — research gap 9.
     */
    provisioning_source: 'bulk_import',
    environment: 'production',
  },
  {
    id: 'svc-tf-workspace-runner',
    type: 'service_account',
    name: 'tf-workspace-runner',
    app: 'aws-iam',
    direct_grants: ['deploy:staging'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: 'svc-terraform-ci',
    revoked: false,
    created_at: '2025-02-14',
    last_activity_at: '2026-07-30',
    provisioning_source: 'app_native',
    environment: 'production',
  },
  {
    id: 'svc-landing-zone-baseline',
    type: 'service_account',
    name: 'landing-zone-baseline',
    app: 'aws-iam',
    direct_grants: ['read:metrics'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: 'svc-tf-workspace-runner',
    revoked: false,
    created_at: '2025-05-06',
    last_activity_at: '2026-07-29',
    provisioning_source: 'app_native',
    environment: 'production',
  },
  {
    id: 'svc-service-mesh-ca',
    type: 'service_account',
    name: 'service-mesh-ca',
    app: 'aws-iam',
    direct_grants: ['read:metrics'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: 'svc-landing-zone-baseline',
    revoked: false,
    created_at: '2025-09-18',
    last_activity_at: '2026-07-30',
    provisioning_source: 'app_native',
    environment: 'production',
  },
  {
    id: 'svc-workload-identity-broker',
    type: 'service_account',
    name: 'workload-identity-broker',
    app: 'aws-iam',
    direct_grants: ['read:metrics'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: 'svc-service-mesh-ca',
    revoked: false,
    created_at: '2026-01-27',
    last_activity_at: '2026-07-30',
    provisioning_source: 'app_native',
    environment: 'production',
  },
  {
    id: 'svc-batch-executor',
    type: 'service_account',
    name: 'batch-executor',
    app: 'aws-iam',
    direct_grants: ['read:warehouse'],
    inherited_from: ['group-eng'],
    delegates_to: [],
    provisioned_by: 'svc-workload-identity-broker',
    revoked: false,
    created_at: '2026-05-12',
    last_activity_at: '2026-07-30',
    provisioning_source: 'app_native',
    environment: 'production',
  },
];

export const LINEAGE = cluster({
  identities: [
    // --- BEAT 16 — the Midnight Blizzard chain ----------------------------
    /**
     * Generation 0. Predates the date diagnostic settings were pointed at Log
     * Analytics (2024-01-01), so no creator is recoverable and this resolves to
     * `unknown` / `outside_audit_window` rather than to a finding — the same
     * treatment the `legacy-ldap` cluster gets, in an app whose *newer* rows are
     * fully attributable. Two regimes in one tenant, which is what a retention
     * floor actually looks like.
     */
    {
      id: 'svc-entra-bootstrap',
      type: 'service_account',
      name: 'tenant-bootstrap-sp',
      app: 'entra-tenant',
      direct_grants: ['admin:platform'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2023-08-22', // before the 2024-01-01 floor
      last_activity_at: '2026-07-28',
      provisioning_source: 'app_native',
      environment: 'production',
    },

    /**
     * Generation 1, and the row the module exists for.
     *
     * A test application registered 632 days ago, never assigned an owner, never
     * moved out of non-production, and still able to create accounts in a production
     * tenant. Microsoft's account of Midnight Blizzard has the actor using "a legacy
     * test OAuth application" to "create a new user account to grant consent"
     * (Microsoft Security Blog, 25 Jan 2024).
     *
     * `delegates_to` is empty deliberately, and this is the engineer/CISO
     * disagreement worth recording. The CISO wanted the creator to inherit its
     * child's blast radius so severity would reflect the whole chain. The engineer's
     * position won: `delegates_to` is a *delegation* edge and `provisioned_by` is a
     * *creation* edge (`ownership/classify.test.ts` L550 already relies on them being
     * different relations), and conflating them would make every provisioning bot
     * appear to hold the union of everything it ever created — which is precisely the
     * "`terraform-ci` permanently tops the ranking" failure research §4.3 is about.
     * Creating an account is not authorization to use it. The consequence is exactly
     * what the beat needs: this row reaches nothing sensitive, so no access-based
     * ranking finds it, and `creationAuthority` is the only signal that does.
     */
    {
      id: 'svc-legacy-test-oauth',
      type: 'service_account',
      name: 'legacy-test-oauth-app',
      app: 'entra-tenant',
      direct_grants: ['read:directory-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-entra-bootstrap',
      revoked: false,
      created_at: '2024-11-06', // 632 days, past every SLA and still nobody's
      last_activity_at: '2026-07-24', // 7 days — dormancy is not what is wrong here
      provisioning_source: 'app_native',
      /**
       * The field the `creator_privilege_mismatch` half of the signal reads (§4.4).
       * A non-production principal exercising a production creation privilege is the
       * property research §3.4 concludes is the real signal, as against the shape of
       * the chain.
       */
      environment: 'non_production',
    },

    /**
     * Generation 2, fan-out 0. Created five days ago and handed a privileged role in
     * the same act, by the account above, with no approver on either event.
     *
     * Modelled as a `service_account` although the incident's was an Entra *user*
     * object, and the CISO wanted it shown as a user because that is what the
     * auditor sees. The engineer's position won: `data/validate.ts` L109 requires
     * every `human` to have an `employee_status` record, and fabricating an HR record
     * for an attacker-created account would launder the one property that makes this
     * a finding — that there is no person behind it. The name carries the intent
     * instead.
     */
    {
      id: 'svc-mail-archive-relay',
      type: 'service_account',
      name: 'mail-archive-relay',
      app: 'entra-tenant',
      direct_grants: ['admin:exchange-mailboxes'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-legacy-test-oauth',
      revoked: false,
      created_at: '2026-07-26', // 5 days — inside the 14-day SLA, so `high`, not `critical`
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
      environment: 'production',
    },

    // --- BEAT 17 — the provisioning bot that must stay green ---------------
    /**
     * The administrator who registered the provisioning application. Active and
     * recently reviewed, so she owns herself and the identity she registered
     * resolves cleanly — which is what makes the *absence* of any such person on
     * beat 16's chain legible as a difference rather than as a gap in our data.
     */
    {
      id: 'user-priya',
      type: 'human',
      name: 'Priya Raghavan',
      app: 'entra-tenant',
      direct_grants: ['sso:corp-login'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2024-02-05',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
      /**
       * The only populated `person_id` in the dataset — research §4.7. Optional,
       * non-key, and read by nothing: it is the correlation hint a cross-app join
       * would use, and it is deliberately not a storage key so that a provider
       * changing it cannot orphan an edge.
       */
      person_id: 'hr-40318',
    },

    {
      id: 'group-provisioned-workloads',
      type: 'group',
      name: 'Provisioned Workloads',
      app: 'entra-tenant',
      direct_grants: ['sso:corp-login'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2024-02-20',
    },

    /**
     * Fan-out 34 — the highest in the dataset by an order of magnitude, and green.
     *
     * Declared owner, production, active, and creating at its own baseline rate. The
     * `PRD` L63 static threshold would rank this first in the estate; research §4.3's
     * rate ranks it nowhere, which is the difference between a flag an analyst reads
     * and one they mute in week one.
     */
    {
      id: 'svc-scim-provisioner',
      type: 'service_account',
      name: 'scim-provisioner',
      app: 'entra-tenant',
      direct_grants: ['read:directory-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-priya',
      revoked: false,
      created_at: '2024-06-11',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
      environment: 'production',
    },

    /**
     * The bucket that makes the metric move, and the only one that shrinks.
     *
     * GitHub's creation history is complete on our side of the retention question —
     * `creation_data_from` is null — so nothing was destroyed. We simply were not
     * installed in 2018, which is a materially different claim from the
     * `legacy-ldap` cluster's: a backfill would recover this, and `recoverable_from`
     * says so on the row (research §4.5).
     *
     * Owned, attested 25 days ago, and green, which is the point. Coverage is not a
     * proxy for hygiene: this identity is in perfect standing and still unexplained,
     * so the two numbers have to be able to move independently or neither can be
     * trusted.
     */
    {
      id: 'svc-github-release-bot',
      type: 'service_account',
      name: 'github-release-bot',
      app: 'github',
      direct_grants: ['read:repo-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2018-05-30', // before observedFrom (2019-01-01), after no floor
      last_activity_at: '2026-07-29',
      provisioning_source: 'app_native',
      environment: 'production',
    },

    ...PROVISIONED_COHORT,
    ...LADDER,
  ],

  employee_status: {
    'user-priya': { status: 'active', last_reviewed: '2026-07-15' }, // 16 days
  },

  teams: [
    {
      id: 'team-identity',
      name: 'Identity Operations',
      members: ['user-priya'],
      owns_group: 'group-provisioned-workloads',
    },
  ],

  owner_assignments: [
    // BEAT 17 — the "declared owner" half of why fan-out 34 is baseline-normal
    // rather than a finding (research §9, true negative 1).
    {
      identity_id: 'svc-scim-provisioner',
      app: 'entra-tenant',
      owner_kind: 'team',
      owner_id: 'team-identity',
      backup_id: 'user-priya',
      attested_at: '2026-07-10', // 21 days, well inside the 90-day window
    },
    // The `not_yet_captured` row is owned and attested, so an unexplained origin
    // cannot be mistaken for an ownership problem.
    {
      identity_id: 'svc-github-release-bot',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      backup_id: 'user-dan',
      attested_at: '2026-07-06', // 25 days
    },
  ],

  /**
   * The observed creation events — research §4.6.
   *
   * These carry the three actor kinds and the three attested bases that no amount of
   * reading the identity object can recover (`lineage/actors.ts` L54-58): a role
   * session is not its issuer, an app-initiated create names no human at all, and
   * `sourceIdentity` only exists if an admin configured STS to demand it. The
   * asymmetry between what is here and what `recordedParentNormalizer` can infer is
   * the entire argument for persisting them.
   */
  creation_edges: [
    // --- BEAT 16 ---------------------------------------------------------
    /**
     * `initiatedBy.app`, and therefore no human on the event at all. Entra's
     * `initiatedBy` is a union of user *or* app (research §3.2), and this is the arm
     * `PRD` §4.1 does not model: the actor is an OAuth application acting on its own
     * behalf. Nothing downstream invents a person for it — `authorizing_human` stays
     * null, which is a fact about the estate rather than a hole in our data.
     */
    {
      app: 'entra-tenant',
      child_id: 'svc-mail-archive-relay',
      actor: {
        raw_principal: 'svc-legacy-test-oauth',
        kind: 'service_principal',
        app: 'entra-tenant',
        issuer: null,
        attested_human: null,
        attested_basis: null,
        pipeline_actor: null,
        // The absent second party. Its presence here would clear the AC-2(e)
        // finding, which is what makes the finding falsifiable rather than a smear.
        review_approver: null,
      },
      observed_at: '2026-07-26',
      occurred_at: '2026-07-26',
      source: 'audit_event',
      superseded_by: null,
    },

    // --- BEAT 17 ---------------------------------------------------------
    /** `directoryAudit.initiatedBy.user` — the provider named the person itself. */
    {
      app: 'entra-tenant',
      child_id: 'svc-scim-provisioner',
      actor: {
        raw_principal: 'user-priya',
        kind: 'human',
        app: 'entra-tenant',
        issuer: null,
        attested_human: 'user-priya',
        attested_basis: 'entra_initiated_by_user',
        pipeline_actor: null,
        review_approver: null,
      },
      observed_at: '2024-06-11',
      occurred_at: '2024-06-11',
      source: 'audit_event',
      superseded_by: null,
    },

    // --- BEAT 18 ---------------------------------------------------------
    /**
     * CloudTrail `AssumedRole` with `sourceIdentity` set. The session is not an
     * identity we hold, so `raw_principal` is normalised onto the role that issued
     * it and `issuer` records that this is what happened — an honest collapse, and
     * the reason `kind` exists as a separate field from the principal string.
     */
    {
      app: 'aws-iam',
      child_id: 'svc-tf-workspace-runner',
      actor: {
        raw_principal: 'svc-terraform-ci',
        kind: 'role_session',
        app: 'aws-iam',
        issuer: 'svc-terraform-ci',
        attested_human: 'user-dan',
        attested_basis: 'sts_source_identity',
        pipeline_actor: null,
        review_approver: null,
      },
      observed_at: '2025-02-14',
      occurred_at: '2025-02-14',
      source: 'audit_event',
      superseded_by: null,
    },

    /**
     * The append-only correction pair — research §4.6, and the reason this store is
     * not a cache. Ingestion first saw only the object field and could say no more
     * than "a bot did it"; a later CloudTrail backfill said "Carol, through Identity
     * Center". The first record is superseded rather than mutated, because an
     * assessor asking "what did you believe on 7 May 2025" has to get an answer.
     */
    {
      app: 'aws-iam',
      child_id: 'svc-landing-zone-baseline',
      actor: {
        raw_principal: 'svc-tf-workspace-runner',
        kind: 'automation',
        app: 'aws-iam',
        issuer: null,
        attested_human: null,
        attested_basis: null,
        pipeline_actor: null,
        review_approver: null,
      },
      observed_at: '2025-05-07',
      occurred_at: null,
      source: 'object_field',
      superseded_by: 'cloudtrail-backfill-2025-06-02',
    },
    {
      app: 'aws-iam',
      child_id: 'svc-landing-zone-baseline',
      actor: {
        raw_principal: 'svc-tf-workspace-runner',
        kind: 'role_session',
        app: 'aws-iam',
        issuer: 'svc-tf-workspace-runner',
        // `userIdentity.onBehalfOf`, which is the one CloudTrail field that names an
        // Identity Center user behind an assumed role.
        attested_human: 'user-carol',
        attested_basis: 'identity_center_user',
        pipeline_actor: null,
        review_approver: null,
      },
      observed_at: '2025-06-02',
      occurred_at: '2025-05-06',
      source: 'backfill_import',
      superseded_by: null,
    },

    /** A CI run: the pipeline asserts who triggered it, the provider never saw them. */
    {
      app: 'aws-iam',
      child_id: 'svc-service-mesh-ca',
      actor: {
        raw_principal: 'svc-landing-zone-baseline',
        kind: 'automation',
        app: 'aws-iam',
        issuer: null,
        attested_human: null,
        attested_basis: null,
        pipeline_actor: 'user-dan',
        review_approver: null,
      },
      observed_at: '2025-09-18',
      occurred_at: '2025-09-18',
      source: 'audit_event',
      superseded_by: null,
    },

    /**
     * An IaC review record. Weaker attribution than a trigger — an approver
     * authorised the change without performing it — but its *presence* is what
     * AC-2(e) asks for, which is why it is modelled at all (§4.4).
     */
    {
      app: 'aws-iam',
      child_id: 'svc-workload-identity-broker',
      actor: {
        raw_principal: 'svc-service-mesh-ca',
        kind: 'automation',
        app: 'aws-iam',
        issuer: null,
        attested_human: null,
        attested_basis: null,
        pipeline_actor: null,
        review_approver: 'user-priya',
      },
      observed_at: '2026-01-27',
      occurred_at: '2026-01-27',
      source: 'declared',
      superseded_by: null,
    },
  ],

  /**
   * The second half of the AC-2(e) join — research §4.4.
   *
   * Two rows, and the contrast between them is the whole signal: one grant with no
   * approver made by the principal that created the account, and one grant of the
   * same shape with an approver on it. If the second did not clear, the control would
   * be unsatisfiable and the flag would be noise.
   */
  privilege_grant_events: [
    // BEAT 16 — created and privileged in one act, by one principal, five days ago.
    {
      identity_id: 'svc-mail-archive-relay',
      permission: 'admin:exchange-mailboxes',
      app: 'entra-tenant',
      actor_principal: 'svc-legacy-test-oauth',
      occurred_at: '2026-07-26', // same day as the create, inside the 7-day join window
      approved_by: null,
    },
    // BEAT 18's true negative — same join, one day apart, with a named approver.
    {
      identity_id: 'svc-batch-executor',
      permission: 'read:warehouse',
      app: 'aws-iam',
      actor_principal: 'svc-workload-identity-broker',
      occurred_at: '2026-05-13',
      approved_by: 'user-priya',
    },
  ],
});
