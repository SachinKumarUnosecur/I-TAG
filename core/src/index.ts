/**
 * Public surface of the ITAG engine.
 *
 * Consumed by `@itag/backend` (which wraps it in the HTTP endpoints of
 * `docs/ITAG.md` §5) and importable from the frontend for shared types.
 */

// Domain model
export type {
  ControlEvent,
  ControlHistory,
  EmployeeRecord,
  EmploymentStatus,
  GrantHalfLife,
  GrantRecord,
  Identity,
  IdentityDataset,
  IdentityType,
  PermissionRecord,
} from './domain/types.js';

// Ownership vocabulary
export type {
  OwnerConfidence,
  OwnerKind,
  OwnerRef,
  OwnerSource,
  OwnershipReason,
  OwnershipState,
} from './domain/ownership.js';
export { ORPHAN_REASON_TO_OWNERSHIP_REASON } from './domain/ownership.js';

// Results
export type {
  AccountabilityAssessment,
  AccountabilityTrace,
  AssessmentOutcome,
  ChainNode,
  OrphanReason,
  TraceTermination,
} from './domain/results.js';

// Policy and ports
export type { AccountabilityPolicy } from './domain/policy.js';
export { DEFAULT_ACCOUNTABILITY_POLICY } from './domain/policy.js';
export type { Clock, GraphSource } from './domain/ports.js';

// Graph
export type { IdentityGraph } from './graph/build.js';
export { buildIdentityGraph } from './graph/build.js';
export type {
  ReferenceSelector,
  RevisitPolicy,
  TraversalOptions,
  TraversalResult,
  TraversalStop,
} from './graph/traverse.js';
export { traverse } from './graph/traverse.js';

// Accountability (F4 + F5)
export { traceAccountability } from './accountability/trace.js';
export type { OrphanFinding, OrphanRule, OrphanRuleContext } from './accountability/rules.js';
export { DEFAULT_ORPHAN_RULES, daysSince, rootHumanRecord } from './accountability/rules.js';
export type { AccountabilityDeps, AccountabilityService } from './accountability/assess.js';
export { createAccountabilityService } from './accountability/assess.js';

// Adapters
export { fixedClock, systemClock } from './adapters/clock.js';
export { seedGraphSource } from './adapters/seed-source.js';

// Data
export { SEED_DATASET } from './data/seed.js';
export { DatasetValidationError, validateDataset } from './data/validate.js';
