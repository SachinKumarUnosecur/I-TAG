import { cluster } from './fragment.js';

/**
 * BEATS 32-35 — the low-probability tail, and the reason it was missing.
 *
 * `docs/identity-threat-profile-research.md` §4.6 measured the matrix this engine
 * produces from beats 1-31 and found Likelihood empty below `moderate` and Impact
 * thin below `moderate`: every hop path is `high`/`critical` by construction
 * (`risk/factors.ts` `HOP_ACCESS_FACTOR` — "never compensable by the other five
 * factors"), and every realized-exposure or pivot finding requires a `substantial`+
 * exposure band, which floors Likelihood at `moderate` on its own
 * (`EXPOSURE_FACTOR`'s own mapping, `risk/factors.ts` L123-135). Four beats do not
 * change a rule or a threshold anywhere — they add four identities whose *only*
 * signal is one this engine already treats as `low` or `medium`.
 *
 * **Why the tail cannot reach `very_low`, and why these four stop at the next rung
 * up instead.** `risk/summarize.ts`'s `no_findings` arm requires *zero* unavailable
 * factors, and `control_drift`/`grant_staleness` are `unavailable` for any identity
 * with no row in `control_history`/`grant_records` — which is every identity that
 * has never had an event ingested for it, i.e. most of the estate. An identity that
 * clears every factor only by having no rows at all therefore always carries at
 * least one `unavailable` factor, so `kind: 'no_findings'` — and the `very_low`
 * likelihood it maps to — is unreachable by this engine's own non-compensatory rule
 * (`likelihoodFor`, `threat/mapping.ts` L153-162), not by an omission in the seed.
 *
 * **BEATS 32-33 — `low` Likelihood, and why it cannot pair with a hop, a pivot, an
 * exposure band or a control-drift finding.** All four of those factors are
 * unconditionally `medium`+ whenever they fire at all, so the only Risk factor
 * capable of publishing `low` is Ownership (`ownership/severity.ts` L36: unowned,
 * nothing sensitive reached, not SLA-breached, not inactive). Both identities here
 * are unowned rather than orphaned — `created_at` is inside the 14-day
 * service-account SLA (`OwnershipPolicy.slaDaysByType`) and `last_activity_at` is
 * inside the 90-day inactivity window, so `ownership/severity.ts`'s `low` arm is
 * what fires, not a departure story. Because that path requires `provisioned_by`
 * to stay `null` (any creator, live or departed, resolves an owner and moves the
 * verdict off `unowned` — `ownership/rules.ts`'s `noOwnerRule` only reaches a
 * `null` resolution), Creator Lineage has nothing to translate for either row, so
 * the real fact backing their one Threat finding is a **choke point** instead
 * (PRD §4.1 row 3/Rights Escalation): each directly holds one permission that
 * binds to a role holding nothing of its own (`role-integration-relay`,
 * `role-vendor-relay` in `catalog.ts`), so severing it removes exactly the
 * holder's own reach of that one permission — a real, measured
 * `access_removed.removed` of 1, not a fabricated score — without opening a hop,
 * because `access/classify.ts` never emits `ASSUMES_ROLE` for a role with no
 * `direct_grants` to reach beyond it.
 *
 * **BEATS 34-35 — `moderate` Likelihood at `very_low`/`low` Impact**, filling the
 * two cells the live matrix had empty even though `moderate,moderate` (10 rows) was
 * not: both are owned outright by an explicitly, freshly attested team (so
 * Ownership contributes nothing) and each carries one `control_history` event that
 * is neither an MFA removal nor a stale conditional-access exception — a
 * conditional-access *policy edit*, the estate's own `svc-monitor` pattern
 * (`true-negatives.ts`) minus the MFA removal — so `control_drift`'s fallback
 * fires at `medium` rather than `critical`/`high` (`risk/factors.ts` L376-386),
 * which `CONTROL_DRIFT_RULE` (Trust Exploitation) translates directly.
 *
 * All four hold only permissions `catalog.ts` already marks `sensitive: false`, at
 * `minimal` or `limited` exposure, so Impact here is Exposure's own band, quoted,
 * nothing escalated.
 */
export const THREAT_COVERAGE = cluster({
  identities: [
    // --- BEAT 32 — unowned this week, one choke point, minimal exposure ------
    {
      id: 'svc-partner-status-sync',
      type: 'service_account',
      name: 'partner-status-sync',
      app: 'github',
      direct_grants: ['read:billing', 'read:integration-status-feed'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2026-07-25', // 6 days -> inside the 14-day service-account SLA
      last_activity_at: '2026-07-29', // 2 days -> inside the 90-day inactivity window
      provisioning_source: 'app_native',
    },

    // --- BEAT 33 — unowned this week, one choke point, limited exposure ------
    {
      id: 'svc-vendor-webhook-relay',
      type: 'service_account',
      name: 'vendor-webhook-relay',
      app: 'github',
      direct_grants: [
        'read:billing',
        'read:dashboards',
        'read:repo-metadata',
        'read:fileshare',
        'read:vendor-sync-status',
      ],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2026-07-21', // 10 days -> inside the 14-day service-account SLA
      last_activity_at: '2026-07-28', // 3 days -> inside the 90-day inactivity window
      provisioning_source: 'app_native',
    },

    // --- BEAT 34 — team-owned, one grant, one non-MFA control change ---------
    {
      id: 'svc-catalog-sync-poller',
      type: 'service_account',
      name: 'catalog-sync-poller',
      app: 'snowflake',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-11-04',
      last_activity_at: '2026-07-26',
      provisioning_source: 'app_native',
    },

    // --- BEAT 35 — team-owned, four grants, one non-MFA control change -------
    {
      id: 'svc-feature-flag-reader',
      type: 'service_account',
      name: 'feature-flag-reader',
      app: 'snowflake',
      direct_grants: ['read:warehouse', 'read:dashboards', 'read:hris-feed', 'read:directory-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-12-09',
      last_activity_at: '2026-07-24',
      provisioning_source: 'app_native',
    },

    /**
     * The two roles beats 32-33 bind to — real identities, not synthetic ids, so
     * `access/classify.ts` and `impact/choke.ts` walk them exactly as they walk
     * `role-deploy-box` or `role-release-runner` in `access.ts`. Each holds nothing
     * of its own on purpose: that absence is what keeps the holder's own path
     * `direct` rather than `hop` (see the file header). Owned and attested like
     * every other infrastructure role in the estate, so neither adds a second
     * finding of its own.
     */
    {
      id: 'role-integration-relay',
      type: 'service_account',
      name: 'Integration Status Relay Role',
      app: 'github',
      direct_grants: [],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-02-11',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'role-vendor-relay',
      type: 'service_account',
      name: 'Vendor Sync Relay Role',
      app: 'github',
      direct_grants: [],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-02-11',
      last_activity_at: '2026-07-27',
      provisioning_source: 'bulk_import',
    },
  ],

  // The two roles, kept green like every other infrastructure role in the estate.
  owner_assignments: [
    {
      identity_id: 'role-integration-relay',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-20', // 11 days
    },
    {
      identity_id: 'role-vendor-relay',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-22', // 9 days
    },
    // BEATS 34-35 — attested this week, so ownership contributes nothing and
    // `control_drift` is the only signal on either row.
    {
      identity_id: 'svc-catalog-sync-poller',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-data',
      backup_id: 'user-bob',
      attested_at: '2026-07-20', // 11 days
    },
    {
      identity_id: 'svc-feature-flag-reader',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-data',
      backup_id: 'user-bob',
      attested_at: '2026-07-22', // 9 days
    },
  ],

  // BEATS 34-35 — a conditional-access policy edit, not an MFA removal and not a
  // stale exception, so `control_drift`'s fallback fires at `medium` rather than
  // `critical`/`high` (`risk/factors.ts` L376-386).
  control_history: [
    {
      identity_id: 'svc-catalog-sync-poller',
      events: [{ control: 'conditional_access', change: 'policy_updated', date: '2026-07-15' }],
    },
    {
      identity_id: 'svc-feature-flag-reader',
      events: [{ control: 'conditional_access', change: 'policy_updated', date: '2026-07-10' }],
    },
  ],
});
