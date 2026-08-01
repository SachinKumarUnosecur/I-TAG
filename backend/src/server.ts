import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  createAccountabilityService,
  createAccessReviewsService,
  createDispositionService,
  createLineageService,
  createOwnershipService,
  createSweepService,
  createThreatProfileService,
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
  createAccessService,
  createExposureService,
  createImpactService,
  createRiskService,
  datasetLifecycleDirectory,
  fixedClock,
  memoizedAccessOwner,
  memoizedExposureOwnership,
  memoizedImpactChokePoints,
  memoizedImpactExposure,
  memoizedLineageRows,
  memoizedOwnershipState,
  memoizedRiskAssessment,
  memoryFindingStore,
  memoryReviewDecisionStore,
  seedGraphSource,
  systemClock,
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_LINEAGE_POLICY,
  DEFAULT_ORPHAN_RULES,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
  type AccountabilityPolicy,
  type Clock,
} from '@itag/core';
import { explainRouter } from './routes/explain.js';
import { createAccessRouter } from './routes/access.js';
import { createAccessReviewsRouter } from './routes/access-reviews.js';
import { createAccountabilityRouter } from './routes/accountability.js';
import { createExposureRouter } from './routes/exposure.js';
import { createFindingsRouter } from './routes/findings.js';
import { createImpactRouter } from './routes/impact.js';
import { createOffboardingRouter } from './routes/offboarding.js';
import { createLineageRouter } from './routes/lineage.js';
import { createOwnershipRouter } from './routes/ownership.js';
import { createRiskProfileRouter } from './routes/risk-profile.js';
import { createThreatProfileRouter } from './routes/threat-profile.js';

/** Pin `ITAG_NOW` to keep a rehearsed demo's day counts identical on any date. */
function resolveClock(): Clock {
  const pinned = process.env.ITAG_NOW;
  if (pinned === undefined || pinned.length === 0) {
    return systemClock;
  }
  const instant = new Date(pinned);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`ITAG_NOW is not a parseable date: "${pinned}"`);
  }
  return fixedClock(instant);
}

/** `ITAG_MAX_CHAIN_DEPTH` exists so the depth cap can be demonstrated on real data. */
function resolvePolicy(): AccountabilityPolicy {
  const raw = process.env.ITAG_MAX_CHAIN_DEPTH;
  if (raw === undefined || raw.length === 0) {
    return DEFAULT_ACCOUNTABILITY_POLICY;
  }
  const maxChainDepth = Number(raw);
  if (!Number.isInteger(maxChainDepth) || maxChainDepth < 1) {
    throw new Error(`ITAG_MAX_CHAIN_DEPTH must be a positive integer, got "${raw}"`);
  }
  return { ...DEFAULT_ACCOUNTABILITY_POLICY, maxChainDepth };
}

// Composition root. The dataset is validated and indexed here, once, so a schema
// violation kills the boot rather than surfacing as a request-time failure.
// Every concrete adapter is constructed here and nowhere else — the domain only
// ever sees the port interfaces.
const graphSource = seedGraphSource();
const clock = resolveClock();
const accountabilityPolicy = resolvePolicy();
const dataset = graphSource.graph().dataset;

const accountabilityService = createAccountabilityService({
  graphSource,
  clock,
  policy: accountabilityPolicy,
  rules: DEFAULT_ORPHAN_RULES,
});

const hr = datasetHrDirectory(dataset);

const ownershipService = createOwnershipService({
  graphSource,
  clock,
  hr,
  teams: datasetTeamDirectory(dataset),
  owners: datasetOwnerRegistry(dataset),
  suppressions: datasetSuppressionRegistry(dataset),
  accountabilityPolicy,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

// Provisioning Lineage. Reads Ownership Assurance through a narrow port rather than
// importing it, so the dependency runs one way only: research 7.2 has ownership
// consuming lineage, and only this composition root knows both sides.
const lineageService = createLineageService({
  graphSource,
  clock,
  hr,
  suppressions: datasetSuppressionRegistry(dataset),
  ownership: memoizedOwnershipState(ownershipService),
  accountabilityPolicy,
  policy: DEFAULT_LINEAGE_POLICY,
});

// Access Discovery. Reads Ownership Assurance through a narrow port for §6.3's
// Owner column only — `docs/PRD-access-discovery.md` §2.1 has ownership consuming
// this module for grant-level attribution, so the dependency runs one way and only
// this composition root knows both sides.
const accessService = createAccessService({
  graphSource,
  clock,
  owners: memoizedAccessOwner(ownershipService),
  policy: accountabilityPolicy,
});

// Identity Exposure Map. Aggregates Access Discovery's inventory and nothing else
// — it never touches the graph to find a path, only to read the catalogue. It also
// reads ownership through its own narrow port, and that dependency is not for a
// column: `docs/identity-exposure-map-research.md` §7.2 makes this the engine's
// second ranking authority, and the condition of the exception is that ownership's
// verdict ships inside every exposure payload so the two numbers are never shown
// apart.
const exposureService = createExposureService({
  graphSource,
  clock,
  access: accessService,
  ownership: memoizedExposureOwnership(ownershipService),
});

// Blast Radius. Reads Access Discovery's *uncollapsed* path inventory rather than
// Exposure Map's `exposure_set`, which the source PRD §4.2 step 1 mandates and
// `docs/unified-impact-analysis-research.md` §10 overrules: exposure collapses each
// permission to its worst mechanism, and a counterfactual computed over collapsed
// routes cannot see that `svc-invoice-poster` keeps reaching `write:invoice-queue`
// after the hop is cut. Exposure is still consumed, through a port that carries the
// whole assessment union rather than a number — research §4.2 makes "this module
// authors no 0-100 score" structural, and a port typed as `number` would have made
// the copy indistinguishable from an original.
// Hoisted out of the two services that read them so both share one cache. Ownership
// classification runs an accountability traversal per identity and exposure scoring runs
// the model over a full path inventory, while Blast Radius touches every affected identity
// across seven candidates and Risk Profile touches all 127 — two caches would mean the same
// verdicts computed twice, and two *instances* would make the byte-identity guards weaker
// than they read.
const exposureOwnershipPort = memoizedExposureOwnership(ownershipService);
const impactExposurePort = memoizedImpactExposure(exposureService);

const impactService = createImpactService({
  graphSource,
  clock,
  access: accessService,
  ownership: exposureOwnershipPort,
  exposure: impactExposurePort,
  policy: accountabilityPolicy,
});

// Identity Risk Profile. The join, and the only module in the engine that deliberately
// ranks nothing: `docs/identity-risk-profile-research.md` §7.2 reaches verdict (c) because
// sixteen of the source PRD composite's top twenty rows were already surfaced by the two
// shipped rankers, and fusing them dropped `svc-vpn-legacy` from ownership queue rank 1 to
// composite rank 9. It reads both ranking authorities through the *same* ports Blast Radius
// uses — the values are quotations, asserted byte-identical in `risk/service.test.ts` — and
// reads `ITAG.md` §F9's and §F10's lifecycle tables through a directory of their own,
// because a control-plane audit stream and an entitlement register are other systems on
// other clocks.
const riskService = createRiskService({
  graphSource,
  clock,
  access: accessService,
  ownership: exposureOwnershipPort,
  exposure: impactExposurePort,
  lifecycle: datasetLifecycleDirectory(dataset),
  hr,
  policy: DEFAULT_RISK_POLICY,
  accountabilityPolicy,
});

// Identity Threat Profile. The engine's second module whose main contribution is refusing
// to rank (`docs/identity-threat-profile-research.md` §5, §7.2): it translates whichever of
// the three ranking authorities above already fired into a PTRACE stage, a MITRE ATT&CK tag
// and a NIST SP 800-30-shaped impact/likelihood cell, and reads Provisioning Lineage's row
// (not the `flags` array `domain/lineage.ts` L421-424 already removed) for Concealment &
// Persistence. Constructed after `riskService` because it depends on it, through the same
// `exposureOwnershipPort` / `impactExposurePort` two other modules already share — a fourth
// cache or a fourth instance here would make the byte-identity guard in
// `threat/service.test.ts` weaker than it reads.
const threatProfileService = createThreatProfileService({
  graphSource,
  clock,
  access: accessService,
  ownership: exposureOwnershipPort,
  exposure: impactExposurePort,
  impact: memoizedImpactChokePoints(impactService),
  risk: memoizedRiskAssessment(riskService),
  lineage: memoizedLineageRows(lineageService),
});

// Access Reviews. Quotes access + risk (ownership embedded); owns campaigns + decisions.
const accessReviewsService = createAccessReviewsService({
  graphSource,
  clock,
  access: accessService,
  risk: riskService,
  decisions: memoryReviewDecisionStore(),
});

const sweepService = createSweepService({
  graphSource,
  hr,
  clock,
  policy: accountabilityPolicy,
});

const dispositionService = createDispositionService({
  store: memoryFindingStore(),
  clock,
});

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'itag-backend' });
});

app.use('/api/explain', explainRouter);
// F5 v1. Kept on its existing contract; the richer ownership finding is served
// alongside it rather than replacing it.
app.use('/api/accountability', createAccountabilityRouter(accountabilityService));
app.use('/api/ownership', createOwnershipRouter(ownershipService));
app.use('/api/lineage', createLineageRouter(lineageService));
app.use('/api/access', createAccessRouter(accessService));
app.use('/api/exposure', createExposureRouter(exposureService));
app.use('/api/impact', createImpactRouter(impactService));
app.use('/api/risk-profile', createRiskProfileRouter(riskService));
app.use('/api/threat-profile', createThreatProfileRouter(threatProfileService));
app.use('/api/access-reviews', createAccessReviewsRouter(accessReviewsService));
app.use('/api/offboarding-sweep', createOffboardingRouter(sweepService));
app.use('/api/findings', createFindingsRouter(dispositionService));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[itag-backend] listening on http://localhost:${PORT}`);
});
