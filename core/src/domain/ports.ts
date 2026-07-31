import type { IdentityGraph } from '../graph/build.js';
import type { FindingDisposition } from './ownership.js';
import type {
  ControlEvent,
  EmployeeRecord,
  GrantHalfLife,
  GrantRecord,
  OwnerAssignment,
  SuppressionEntry,
  TeamRecord,
} from './types.js';

/**
 * Time source. Injected so that staleness arithmetic is deterministic in tests
 * and pinnable during a live demo. Domain code must never call `Date.now()`.
 *
 * Implementations: `systemClock` and `fixedClock` (both in `src/adapters/clock.ts`).
 */
export interface Clock {
  now(): Date;
}

/**
 * Supplies the built graph. Keeps route handlers and domain code away from the
 * filesystem and from dataset construction.
 *
 * Implementations: `seedGraphSource` (production, in `src/adapters/seed-source.ts`),
 * fixture graphs in the test suites, and — once F7 lands — a simulation source
 * returning a mutated copy so "what-if" toggles never touch the base dataset.
 */
export interface GraphSource {
  graph(): IdentityGraph;
}

/**
 * Employment facts about a person.
 *
 * Separate from `TeamDirectory` rather than one "HR service": the ownership
 * resolvers that need employment status mostly do not need team rosters, and a
 * real deployment sources them from different systems (HRIS vs IdP groups).
 */
export interface HrDirectory {
  person(personId: string): EmployeeRecord | null;
}

/**
 * Protective-control changes and entitlement issue dates — the two lifecycle tables
 * `ITAG.md` §F9 and §F10 specified and nothing has read until now.
 *
 * A port beside `HrDirectory` rather than a read of `graph.dataset`, because these are
 * facts from other systems on other clocks: control changes come from an IdP audit
 * stream, grant records from an entitlement register, and the half-life table is a
 * historical study of neither. Modelling them as one directory is what lets
 * `docs/identity-risk-profile-research.md` §4.5's `stalest_input` ever mean something —
 * a deployment where the IdP stream lags the graph by three days has somewhere to say so.
 *
 * **Null means no record, and never an empty result.** `controlEvents` returning `null`
 * is "this identity has no control history ingested", which architecture rule 9 requires
 * be reported as unevaluated rather than as a clean bill of health; returning `[]` for
 * the same case would make the two indistinguishable. Research §3.2 is the empirical
 * argument: every provider's dormancy and hygiene surface excludes populations
 * *silently* — AWS Access Analyzer "service-linked roles are not analyzed", Access
 * Advisor tracks no data-plane event — so an absent row is the common case, not an edge one.
 *
 * Implementation: `datasetLifecycleDirectory` (in `src/adapters/dataset-directories.ts`).
 */
export interface LifecycleDirectory {
  /** `ITAG.md` §F9's log. Null when nothing has been ingested for this identity. */
  controlEvents(identityId: string): readonly ControlEvent[] | null;
  /** `ITAG.md` §F10's live grants. Null when this identity has no tracked grant. */
  grants(identityId: string): readonly GrantRecord[] | null;
  /**
   * The historical pattern for a grant class. Null when the class is unknown, which
   * `validateDataset` makes unreachable for a loaded dataset — every `grant_records`
   * row is checked against `grant_half_lives` at boot.
   */
  halfLife(grantType: string): GrantHalfLife | null;
}

export interface TeamDirectory {
  team(teamId: string): TeamRecord | null;
  /** The team owning a given group identity, if any. */
  teamForGroup(groupId: string): TeamRecord | null;
}

/**
 * Explicit owner records. In production this is the service registry / CMDB /
 * tag source; here it is backed by the seed dataset.
 */
export interface OwnerRegistry {
  assignment(identityId: string, app: string): OwnerAssignment | null;
}

/** Registered exemptions: break-glass, shared system and vendor-managed accounts. */
export interface SuppressionRegistry {
  entry(identityId: string): SuppressionEntry | null;
}

/**
 * Append-only journal of dispositions.
 *
 * Deliberately has no update or delete: superseding is the only way to change an
 * answer, because the audit value is the history rather than the latest row.
 */
export interface FindingStore {
  append(disposition: FindingDisposition): void;
  /** Chronological, oldest first. */
  history(identityId: string): readonly FindingDisposition[];
  all(): readonly FindingDisposition[];
}
