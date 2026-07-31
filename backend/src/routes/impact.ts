import { Router, type Request, type Response } from 'express';
import type { ChokePoint, ImpactProfile, ImpactService } from '@itag/core';

/** Express types query and param values as `string | string[] | ...`, so narrow. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Blast Radius — `docs/unified-impact-analysis-research.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code.
 *
 * **Note what is absent, because it is the module's defining decision.** There is
 * no `?sort=` and no leaderboard route. The source PRD §6.3 ranks every identity by
 * an `exploitable_risk_score`, and research §4.2 strikes both the score and the
 * column: architecture rule 8 fixes the engine at two identity-ranking authorities,
 * and this module survives alongside them precisely by ranking a different
 * population. Its landing route returns *grants*, sorted by measured reduction.
 * There is nothing here that puts one identity above another.
 *
 * Also absent: `stale_if_older_than_hours` (research §2 — the convention the PRD
 * cites was never adopted) and any `percent_of_total_risk_removed` (research §1.3 —
 * a percentage moves between 0 and 17 on the same remediation depending on an
 * unstated denominator, so both deltas ship with their baselines instead).
 */
export function createImpactRouter(service: ImpactService): Router {
  const router = Router();

  /**
   * Registered before `/:id`, and the order is load-bearing.
   *
   * Express matches in declaration order, so a `/:id` declared first would swallow
   * `/choke-points` and answer the module's primary route with `unknown_identity`.
   */
  router.get('/choke-points', (_req: Request, res: Response) => {
    res.json(service.chokePoints());
  });

  /**
   * `ITAG.md` §F7's before/after diff — "fully non-destructive… toggles never touch
   * the base seed dataset", which `impact/counterfactual.ts` satisfies by rebuilding
   * a second graph over a copied dataset rather than by being careful.
   *
   * A `GET` despite computing a simulation, because it neither writes nor is meant
   * to: the whole point of F7 is that a what-if leaves no trace, so the request that
   * runs one should be as safe to repeat as any other read.
   */
  router.get('/simulate', (req: Request, res: Response) => {
    const permission = singleValue(req.query.sever);
    if (permission === null) {
      res.status(400).json({ error: 'missing_sever', expected: 'sever=<permission-id>' });
      return;
    }

    const outcome = service.simulate(permission);
    if (!outcome.ok) {
      // A permission that does not exist is not found; one that exists but confers
      // no principal is a well-formed request for something this model cannot do,
      // and telling the caller which is more useful than one status for both.
      const status = outcome.error === 'unknown_permission' ? 404 : 400;
      res.status(status).json({ error: outcome.error, permission: outcome.permission });
      return;
    }
    res.json(outcome);
  });

  /** Per starting identity: the counts, the crossings, and both other authorities. */
  router.get('/:id', (req: Request, res: Response) => {
    const identityId = singleValue(req.params.id);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }
    const outcome = service.profile(identityId);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }
    res.json(outcome.profile);
  });

  router.get('/:id/export', (req: Request, res: Response) => {
    const identityId = singleValue(req.params.id);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }
    const outcome = service.profile(identityId);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }
    res.type('text/csv').send(toCsv(outcome.profile, service.chokePoints().candidates));
  });

  return router;
}

/**
 * One row per boundary this identity crosses — research §6.
 *
 * Both deltas are on every row, and they are the *estate-wide* figures for that
 * grant rather than this identity's share of them. That is the honest join: a
 * revocation is not scoped to whoever's export it appears in, and a per-identity
 * slice of a whole-graph counterfactual would be a fourth number nobody asked for.
 * `closes` travels beside them so a row reading zero removed access cannot be
 * mistaken for a measurement error (research §5 step 5).
 */
function toCsv(profile: ImpactProfile, candidates: readonly ChokePoint[]): string {
  const header = [
    'identity_id',
    'identity_type',
    'app',
    'assessment',
    'resources_reachable',
    'identities_reachable',
    'highest_sensitivity_reached',
    'via_permission',
    'assumed_identity',
    'assumed_identity_app',
    'permissions_reached',
    'deepest_hop_count',
    'closes',
    'access_removed',
    'access_removed_baseline',
    'mechanisms_closed',
    'mechanisms_closed_baseline',
    'ownership_state',
    'based_on_access_discovery_snapshot',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const byPermission = new Map(candidates.map((candidate) => [candidate.permission, candidate]));
  const counts = profile.assessment.kind === 'no_access' ? null : profile.assessment.counts;
  const pivots = profile.assessment.kind === 'propagates' ? profile.assessment.pivots : [];

  const base = [
    profile.identity_id,
    profile.identity_type,
    profile.app,
    profile.assessment.kind,
    counts === null ? '' : String(counts.resources_reachable),
    counts === null ? '' : String(counts.identities_reachable),
    counts?.highest_sensitivity_reached ?? '',
  ];

  // An identity that crosses nothing still exports one row. Dropping it would make
  // "no pivot paths" indistinguishable from "not in the export", which is the same
  // two-claims-one-value collapse the assessment union exists to prevent.
  const rows =
    pivots.length === 0
      ? [[...base, '', '', '', '', '', '', '', '', '', '']]
      : pivots.map((pivot) => {
          const candidate = byPermission.get(pivot.via_permission);
          return [
            ...base,
            pivot.via_permission,
            pivot.assumed_identity,
            pivot.assumed_identity_app,
            pivot.permissions_reached.join(' | '),
            String(pivot.deepest_hop_count),
            candidate?.closes ?? '',
            candidate === undefined ? '' : String(candidate.access_removed.removed),
            candidate === undefined ? '' : String(candidate.access_removed.baseline),
            candidate === undefined ? '' : String(candidate.mechanisms_closed.removed),
            candidate === undefined ? '' : String(candidate.mechanisms_closed.baseline),
          ];
        });

  const lines = rows.map((row) =>
    [
      ...row,
      profile.ownership.state,
      profile.staleness.based_on_access_discovery_snapshot,
    ]
      .map(escape)
      .join(','),
  );

  return [header, ...lines].join('\n');
}
