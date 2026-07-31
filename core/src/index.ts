/**
 * Public surface of the ITAG engine.
 *
 * Consumed by `@itag/backend` (which wraps it in the HTTP endpoints of
 * `docs/ITAG.md` §5) and importable from the frontend for shared types.
 */

// Domain model
export type {
  AppRecord,
  ControlEvent,
  ControlHistory,
  EmployeeRecord,
  EmploymentStatus,
  OwnerAssignment,
  SuppressionEntry,
  TeamRecord,
  GrantHalfLife,
  GrantRecord,
  Identity,
  IdentityDataset,
  IdentityType,
  PermissionRecord,
} from './domain/types.js';

// Provisioning Lineage vocabulary (renamed from Delegation Chain, research §3.1)
export type {
  ActorKind,
  AuthorizingHuman,
  CreationActor,
  CreationAuthoritySignal,
  FanOutSignal,
  HumanResolutionBasis,
  HumanResolutionConfidence,
  LineageCoverage,
  LineageGap,
  LineageGapBucket,
  LineageGapReason,
  LineageNode,
  LineageRootKind,
  LineageWalk,
  PersistedCreationEdge,
  PrivilegeGrantEvent,
  Provenance,
  ProvenanceOutcome,
  ProvenanceRecord,
} from './domain/lineage.js';

// Ownership vocabulary
export type {
  DispositionAction,
  FindingDisposition,
  OwnerConfidence,
  OwnerKind,
  OwnerRef,
  OwnerSource,
  OwnershipReason,
  OwnershipState,
  OwnershipTimeline,
  Severity,
  Suppression,
  SuppressionEffect,
  SuppressionReason,
} from './domain/ownership.js';
export { ORPHAN_REASON_TO_OWNERSHIP_REASON } from './domain/ownership.js';

// Ownership results
export type {
  FootprintNode,
  OwnershipFinding,
  OwnershipOutcome,
  ResidualFootprint,
} from './domain/ownership-results.js';

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
export type { AccountabilityPolicy, OwnershipPolicy } from './domain/policy.js';
export { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from './domain/policy.js';
export type {
  Clock,
  FindingStore,
  GraphSource,
  HrDirectory,
  OwnerRegistry,
  SuppressionRegistry,
  TeamDirectory,
} from './domain/ports.js';

// Graph
export type { CreationEdge, IdentityGraph } from './graph/build.js';
export { buildIdentityGraph, creationEdgeKey } from './graph/build.js';
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

// Provisioning Lineage — actor normalization and human resolution (research gap 1)
export type {
  ActorNormalizationContext,
  ActorNormalizer,
  HumanResolutionContext,
  HumanResolver,
} from './lineage/actors.js';
export {
  DEFAULT_ACTOR_NORMALIZERS,
  DEFAULT_HUMAN_RESOLVERS,
  normalizeActor,
  resolveAuthorizingHuman,
} from './lineage/actors.js';

// Provisioning Lineage — ancestor/descendant resolution (research gaps 3, 4, 7)
export {
  ancestorsToRoot,
  descendants,
  fanOut,
  fanOutInApp,
  inAppRoot,
  rootKindOf,
} from './lineage/resolve.js';

// Ownership Assurance — owner resolution (gap 1)
export type {
  OwnerResolution,
  OwnerResolutionContext,
  OwnerResolver,
} from './ownership/resolve.js';
export { DEFAULT_OWNER_RESOLVERS, resolveOwner } from './ownership/resolve.js';

// Ownership Assurance — time modeling (gap 2)
export type { TimelineInput } from './ownership/timeline.js';
export { buildTimeline } from './ownership/timeline.js';

// Ownership Assurance — suppression (gap 3)
export type { SuppressionContext, SuppressionRule } from './ownership/suppression.js';
export { applySuppression, DEFAULT_SUPPRESSION_RULES } from './ownership/suppression.js';

// Ownership Assurance — classification
export type { OwnershipRule, OwnershipRuleContext, OwnershipVerdict } from './ownership/rules.js';
export { DEFAULT_OWNERSHIP_RULES } from './ownership/rules.js';
export type { OwnershipDeps, OwnershipQuery, OwnershipService } from './ownership/classify.js';
export { createOwnershipService } from './ownership/classify.js';

// Ownership Assurance — ranking
export type { Reachability } from './ownership/reach.js';
export { reachableAccess } from './ownership/reach.js';
export type { SeverityInput, SeverityStrategy } from './ownership/severity.js';
export { atLeast, DEFAULT_SEVERITY_STRATEGY, severityRank } from './ownership/severity.js';

// Ownership Assurance — off-boarding sweep (F11)
export type { SweepDeps, SweepService } from './ownership/sweep.js';
export { createSweepService } from './ownership/sweep.js';

// Ownership Assurance — dispositions and evidence (gap 5)
export type {
  DispositionDeps,
  DispositionOutcome,
  DispositionRequest,
  DispositionService,
} from './ownership/dispositions.js';
export { createDispositionService } from './ownership/dispositions.js';
export type { EvidencePack } from './ownership/evidence.js';
export { buildEvidencePack, findingsToCsv } from './ownership/evidence.js';

// Adapters
export {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from './adapters/dataset-directories.js';
export { memoryFindingStore } from './adapters/memory-finding-store.js';
export { fixedClock, systemClock } from './adapters/clock.js';
export { seedGraphSource } from './adapters/seed-source.js';

// Data
export { SEED_DATASET } from './data/seed.js';
export { DatasetValidationError, validateDataset } from './data/validate.js';
