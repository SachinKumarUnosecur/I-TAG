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
  LineageCoverageReport,
  LineageRow,
  LineageTree,
  LineageTreeOutcome,
  CreatorStatus,
} from './domain/lineage.js';

// Access Discovery vocabulary
export type {
  AccessChainStep,
  AccessCounts,
  AccessEdge,
  AccessOutcome,
  AccessOwnerResolution,
  AccessPath,
  AccessPathType,
  AccessRow,
  AccessSnapshot,
  AccessSummary,
  IdentityAccessProfile,
} from './domain/access.js';

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
export type {
  AccountabilityPolicy,
  FanOutBaseline,
  LineagePolicy,
  OwnershipPolicy,
  RiskPolicy,
} from './domain/policy.js';
export {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_LINEAGE_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
} from './domain/policy.js';
export type {
  Clock,
  FindingStore,
  GraphSource,
  HrDirectory,
  LifecycleDirectory,
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

// Provisioning Lineage — gap buckets and signals (research gaps 5, 6, 9)
export type {
  CreationAuthorityContext,
  FanOutContext,
  LineageGapContext,
  LineageGapRule,
  OwnershipStateSource,
} from './lineage/signals.js';
export {
  classifyLineageGap,
  DEFAULT_LINEAGE_GAP_RULES,
  evaluateCreationAuthority,
  evaluateFanOut,
} from './lineage/signals.js';

// Provisioning Lineage — explanation coverage (research 4.5, the landing view)
export { buildCoverage } from './lineage/coverage.js';

// Provisioning Lineage — the service and its query surface (research 6)
export type { LineageDeps, LineageQuery, LineageService } from './lineage/service.js';
export { createLineageService } from './lineage/service.js';

// Access Discovery — path classification (`PRD` §4.2) and the service (§6)
export type {
  AccessClassification,
  AccessPathContext,
  AccessPathRule,
} from './access/classify.js';
export {
  classifyChain,
  comparePaths,
  DEFAULT_ACCESS_PATH_RULES,
  discoverAccess,
} from './access/classify.js';
export type { AccessDeps, AccessOwnerSource, AccessQuery, AccessService } from './access/service.js';
export { createAccessService } from './access/service.js';

// Identity Exposure Map — the aggregate, and the engine's second ranking authority
export type {
  ClassificationCompleteness,
  ExposureAssessment,
  ExposureBand,
  ExposureBandCount,
  ExposureContribution,
  ExposureEntry,
  ExposureOutcome,
  ExposureOwnershipContext,
  ExposureProfile,
  ExposureQuery,
  ExposureRing,
  ExposureRow,
  ExposureSet,
  ExposureStaleness,
  ExposureSummary,
  PermissionSensitivity,
} from './domain/exposure.js';
export { EXPOSURE_BAND_FLOORS, EXPOSURE_VERSUS_SEVERITY } from './domain/exposure.js';
export type { SensitivityLookup } from './exposure/score.js';
export {
  bandFor,
  collapseToExposureSet,
  contributionsOf,
  HOP_MULTIPLIER,
  MECHANISM_PRECEDENCE,
  NOT_SENSITIVE_WEIGHT,
  ringsOf,
  saturate,
  SATURATION_CONSTANT,
  SENSITIVE_WEIGHT,
  weightedSum,
} from './exposure/score.js';
export type { ExposureDeps, ExposureOwnershipSource, ExposureService } from './exposure/service.js';
export { createExposureService } from './exposure/service.js';

// Blast Radius — the counterfactual, and the engine's only ranker of remediations
export type {
  AffectedIdentity,
  ChokePoint,
  ChokePointEffect,
  ChokePointReport,
  ChokePointSelection,
  ImpactAssessment,
  ImpactBaseline,
  ImpactCounts,
  ImpactDelta,
  ImpactExposureReference,
  ImpactOutcome,
  ImpactPivot,
  ImpactProfile,
  ImpactStaleness,
  SimulationOutcome,
  SurvivingRoute,
} from './domain/impact.js';
export { IMPACT_VERSUS_EXPOSURE, MAX_EXHAUSTIVE_CANDIDATES } from './domain/impact.js';
export { severingBindings } from './impact/counterfactual.js';
export type {
  AffectedReach,
  CandidateEvaluation,
  ChokePointStrategy,
  ReachIndex,
  SelectionContext,
  SelectionResult,
} from './impact/choke.js';
export {
  baselineOf,
  DEFAULT_CHOKE_POINT_STRATEGIES,
  evaluateCandidate,
  EXHAUSTIVE_STRATEGY,
  GREEDY_HITTING_SET_STRATEGY,
  indexReach,
  pivotBindingsOf,
  selectChokePoints,
} from './impact/choke.js';
export type {
  ImpactDeps,
  ImpactExposureSource,
  ImpactOwnershipSource,
  ImpactService,
} from './impact/service.js';
export { createImpactService } from './impact/service.js';

// Identity Risk Profile — the join, and the only module that ranks nothing on purpose
export type {
  RiskAssessment,
  RiskFactorCoverage,
  RiskFactorName,
  RiskFinding,
  RiskFindingLevel,
  RiskFindingSource,
  RiskLevelCount,
  RiskOutcome,
  RiskProfile,
  RiskQuery,
  RiskRow,
  RiskStalestInput,
  RiskStaleness,
  RiskSummary,
} from './domain/risk.js';
export { RISK_VERSUS_RANKERS } from './domain/risk.js';
export type {
  RiskFactor,
  RiskFactorContext,
  RiskFactorVerdict,
  RiskGrant,
} from './risk/factors.js';
export {
  CONDITIONAL_ACCESS_CONTROL,
  CONTROL_DRIFT_FACTOR,
  DEFAULT_RISK_FACTORS,
  EXCEPTION_GRANTED,
  EXPOSURE_BAND_LEVELS,
  EXPOSURE_FACTOR,
  GRANT_STALENESS_FACTOR,
  HOP_ACCESS_FACTOR,
  MFA_CONTROL,
  MFA_DISABLED,
  OWNERSHIP_FACTOR,
  REVIEW_STALENESS_FACTOR,
} from './risk/factors.js';
export type { FactorRun } from './risk/summarize.js';
export {
  compareAssessments,
  factorsFiringIn,
  isFindingLevel,
  levelCounts,
  riskLevelsHighToLow,
  summarize,
  worstLevelOf,
} from './risk/summarize.js';
export type {
  RiskDeps,
  RiskExposureSource,
  RiskOwnershipSource,
  RiskService,
} from './risk/service.js';
export { createRiskService } from './risk/service.js';

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

// Identity Threat Profile — translation-only, the engine's second module that ranks nothing
export type {
  MitreTactic,
  PtraceStage,
  PtraceStageReference,
  ThreatAssessment,
  ThreatCell,
  ThreatFinding,
  ThreatFindingRow,
  ThreatFindingSource,
  ThreatImpactLevel,
  ThreatLikelihoodLevel,
  ThreatMatrixCell,
  ThreatOutcome,
  ThreatProfile,
  ThreatQuery,
  ThreatRow,
  ThreatSeverityBand,
  ThreatStageCoverage,
  ThreatStaleness,
  ThreatSummary,
} from './domain/threat.js';
export { THREAT_VERSUS_RANKERS } from './domain/threat.js';
export type {
  ThreatFindingSeed,
  ThreatMappingContext,
  ThreatMappingRule,
} from './threat/mapping.js';
export {
  allCells,
  CHOKE_POINT_RULE,
  CONTROL_DRIFT_RULE,
  CREATOR_LINEAGE_RULE,
  DEFAULT_THREAT_MAPPING_RULES,
  EXPOSURE_REALIZED_RULE,
  HOP_ACCESS_RULE,
  impactFor,
  likelihoodFor,
  PIVOT_RULE,
  PROBING_COVERAGE_GAP,
  PTRACE_REFERENCE,
  severityFor,
  SEVERITY_BAND_MATRIX,
} from './threat/mapping.js';
export {
  criticalFindings,
  identitiesWithFindings,
  matrixCounts,
  stageCoverage,
  summarizeThreatFindings,
  totalFindings,
  unavailableSourcesFor,
  unplacedFindingsCount,
} from './threat/summarize.js';
export type {
  ThreatDeps,
  ThreatExposureSource,
  ThreatImpactSource,
  ThreatLineageSource,
  ThreatOwnershipSource,
  ThreatRiskSource,
  ThreatService,
} from './threat/service.js';
export { createThreatProfileService } from './threat/service.js';

// Adapters
export {
  datasetHrDirectory,
  datasetLifecycleDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from './adapters/dataset-directories.js';
export { memoryFindingStore } from './adapters/memory-finding-store.js';
export { memoizedAccessOwner } from './adapters/access-owner.js';
export { memoizedExposureOwnership } from './adapters/exposure-ownership.js';
export { memoizedImpactExposure } from './adapters/impact-exposure.js';
export { memoizedImpactChokePoints } from './adapters/impact-chokepoints.js';
export { memoizedLineageRows } from './adapters/lineage-rows.js';
export { memoizedOwnershipState } from './adapters/ownership-state.js';
export { memoizedRiskAssessment } from './adapters/risk-assessment.js';
export { fixedClock, systemClock } from './adapters/clock.js';
export { seedGraphSource } from './adapters/seed-source.js';

// Data
export { SEED_DATASET } from './data/seed.js';
export { DatasetValidationError, validateDataset } from './data/validate.js';
