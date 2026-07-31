import { Router, type Request, type Response } from 'express';
import {
  atLeast,
  findingsToCsv,
  type OwnershipQuery,
  type OwnershipService,
  type OwnershipState,
  type Severity,
} from '@itag/core';

const STATES: readonly OwnershipState[] = ['owned', 'unowned', 'owner_invalid', 'ambiguous', 'unknown'];
const SEVERITIES: readonly Severity[] = ['none', 'low', 'medium', 'high', 'critical'];

/** Express types query values as `string | string[] | ...`, so narrow rather than cast. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asState(raw: unknown): OwnershipState | null {
  const value = singleValue(raw);
  return value !== null && STATES.includes(value as OwnershipState) ? (value as OwnershipState) : null;
}

function asSeverity(raw: unknown): Severity | null {
  const value = singleValue(raw);
  return value !== null && SEVERITIES.includes(value as Severity) ? (value as Severity) : null;
}

/**
 * Ownership Assurance — `docs/orphaned-identity-research.md` §5.1.
 *
 * Transport only: parse, delegate, map the outcome to a status code. An
 * `unknown`/suppressed verdict is a 200 carrying that state, because "we cannot
 * tell" is an answer; only an unrecognised identity is a 404.
 */
export function createOwnershipRouter(service: OwnershipService): Router {
  const router = Router();

  /**
   * The reviewer's queue, and the default view: this is the endpoint that
   * answers "what do I work on Monday morning", so it is ranked, not paginated
   * by insertion order.
   */
  router.get('/', (req: Request, res: Response) => {
    const state = asState(req.query.state);
    const minSeverity = asSeverity(req.query.min_severity);
    const app = singleValue(req.query.app);

    // An unrecognised filter value is a client error rather than a silent
    // full-table scan, which would read as "we found nothing wrong".
    if (req.query.state !== undefined && state === null) {
      res.status(400).json({ error: 'invalid_state', allowed: STATES });
      return;
    }
    if (req.query.min_severity !== undefined && minSeverity === null) {
      res.status(400).json({ error: 'invalid_min_severity', allowed: SEVERITIES });
      return;
    }

    const query: OwnershipQuery = {
      ...(state === null ? {} : { state }),
      ...(app === null ? {} : { app }),
      ...(minSeverity === null ? {} : { minSeverity }),
      includeUncounted: singleValue(req.query.include_uncounted) === 'true',
    };

    const findings = service.list(query);
    res.json({
      count: findings.length,
      // Reported separately so the count is never inflated by data gaps (§4.6).
      counted: findings.filter((finding) => finding.counted).length,
      findings,
    });
  });

  router.get('/export', (req: Request, res: Response) => {
    const findings = service.list({ includeUncounted: true });
    if (singleValue(req.query.format) === 'csv') {
      res.type('text/csv').send(findingsToCsv(findings));
      return;
    }
    res.json({ findings });
  });

  router.get('/summary', (_req: Request, res: Response) => {
    const all = service.list({ includeUncounted: true });
    const counted = all.filter((finding) => finding.counted);
    res.json({
      total_identities: all.length,
      // §5.2's coverage metric. Raw orphan count is deliberately not headlined:
      // it rises as coverage improves, which makes it misleading on a slide.
      ownership_coverage: all.length === 0 ? 1 : all.filter((f) => f.state === 'owned').length / all.length,
      findings: counted.length,
      sla_breached: counted.filter((finding) => finding.timeline.sla_breached).length,
      reaching_sensitive: counted.filter((finding) => finding.reachable_sensitive_count > 0).length,
      critical_or_high: counted.filter((finding) => atLeast(finding.severity, 'high')).length,
      unknown: all.filter((finding) => finding.state === 'unknown').length,
    });
  });

  router.get('/:id', (req: Request, res: Response) => {
    const identityId = singleValue(req.params.id);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }

    const outcome = service.classify(identityId);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }

    res.json(outcome.finding);
  });

  return router;
}
