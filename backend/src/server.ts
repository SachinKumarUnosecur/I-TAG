import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import {
  createAccountabilityService,
  createDispositionService,
  createLineageService,
  createOwnershipService,
  createSweepService,
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
  createAccessService,
  createExposureService,
  createImpactService,
  fixedClock,
  memoizedAccessOwner,
  memoizedExposureOwnership,
  memoizedImpactExposure,
  memoizedOwnershipState,
  memoryFindingStore,
  seedGraphSource,
  systemClock,
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_LINEAGE_POLICY,
  DEFAULT_ORPHAN_RULES,
  DEFAULT_OWNERSHIP_POLICY,
  type AccountabilityPolicy,
  type Clock,
} from '@itag/core';
import { explainRouter } from './routes/explain.js';
import { createAccessRouter } from './routes/access.js';
import { createAccountabilityRouter } from './routes/accountability.js';
import { createExposureRouter } from './routes/exposure.js';
import { createFindingsRouter } from './routes/findings.js';
import { createImpactRouter } from './routes/impact.js';
import { createOffboardingRouter } from './routes/offboarding.js';
import { createLineageRouter } from './routes/lineage.js';
import { createOwnershipRouter } from './routes/ownership.js';

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
const impactService = createImpactService({
  graphSource,
  clock,
  access: accessService,
  ownership: memoizedExposureOwnership(ownershipService),
  exposure: memoizedImpactExposure(exposureService),
  policy: accountabilityPolicy,
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
