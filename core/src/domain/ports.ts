import type { IdentityGraph } from '../graph/build.js';
import type { FindingDisposition } from './ownership.js';
import type {
  EmployeeRecord,
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
