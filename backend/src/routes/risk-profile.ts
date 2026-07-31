import { Router, type Request, type Response } from 'express';
import type {
  IdentityType,
  RiskFactorName,
  RiskFindingLevel,
  RiskProfile,
  RiskQuery,
  RiskService,
} from '@itag/core';
import { DEFAULT_RISK_FACTORS, riskLevelsHighToLow } from '@itag/core';

const FACTORS: readonly RiskFactorName[] = DEFAULT_RISK_FACTORS.map((factor) => factor.factor);

const LEVELS: readonly RiskFindingLevel[] = riskLevelsHighToLow();

const IDENTITY_TYPES: readonly IdentityType[] = ['human', 'service_account', 'ai_agent', 'group'];

/** Express types query values as `string | string[] | ...`, so narrow rather than cast. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asMember<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = singleValue(raw);
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

/**
 * A factor count is bounded by the registry, so anything outside it is a client error.
 *
 * Not clamped: `min_factors=9` is a request for rows that cannot exist, and answering it
 * with the whole table would be a silent full scan of the kind `routes/exposure.ts` L70
 * refuses.
 */
function asFactorCount(raw: unknown): number | null {
  const value = singleValue(raw);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= FACTORS.length ? parsed : null;
}

/**
 * Identity Risk Profile — `docs/identity-risk-profile-research.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code. Note what is absent
 * here that the source PRD asks for, and note that none of it is absent by oversight.
 * There is no `min_score` or `max_score` filter because there is no score; no
 * `peer_percentile` because at n=14 humans and n=6 AI agents NIST's own definition returns
 * the maximum for any p ≥ N/(N+1) = 0.9333, so the field would be a maximum relabelled;
 * and no `rising_fast` chip or `delta_7d` filter because the graph is built once from a
 * frozen dataset — the same reason `routes/exposure.ts` L45-49 records for refusing them
 * one module earlier, and a fabricated alarm is worse than a missing field because it is
 * actionable.
 *
 * What is present, on every row, is the pair of quoted verdicts and the sentence
 * reconciling four surfaces. `risk/service.ts` puts them there; nothing here can strip them.
 */
export function createRiskProfileRouter(service: RiskService): Router {
  const router = Router();

  function queryFrom(req: Request): RiskQuery {
    const app = singleValue(req.query.app);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    const worstLevel = asMember(req.query.worst_level, LEVELS);
    const factor = asMember(req.query.factor, FACTORS);
    const minFactors = asFactorCount(req.query.min_factors);
    const owner = singleValue(req.query.owner);

    return {
      ...(app === null ? {} : { app }),
      ...(identityType === null ? {} : { identityType }),
      ...(worstLevel === null ? {} : { worstLevel }),
      ...(factor === null ? {} : { factor }),
      ...(minFactors === null ? {} : { minFactors }),
      ...(owner === null ? {} : { owner }),
      includeWithoutFindings: singleValue(req.query.include_without_findings) === 'true',
    };
  }

  /** An unrecognised filter is a client error, never a silent full-table scan. */
  function rejectBadFilters(req: Request, res: Response): boolean {
    if (req.query.worst_level !== undefined && asMember(req.query.worst_level, LEVELS) === null) {
      res.status(400).json({ error: 'invalid_worst_level', allowed: LEVELS });
      return true;
    }
    if (req.query.factor !== undefined && asMember(req.query.factor, FACTORS) === null) {
      res.status(400).json({ error: 'invalid_factor', allowed: FACTORS });
      return true;
    }
    if (
      req.query.identity_type !== undefined &&
      asMember(req.query.identity_type, IDENTITY_TYPES) === null
    ) {
      res.status(400).json({ error: 'invalid_identity_type', allowed: IDENTITY_TYPES });
      return true;
    }
    if (req.query.min_factors !== undefined && asFactorCount(req.query.min_factors) === null) {
      res.status(400).json({ error: 'invalid_min_factors', allowed: `1-${FACTORS.length}` });
      return true;
    }
    return false;
  }

  /**
   * The landing strip, ahead of the table, and the ordering is the argument.
   *
   * `factor_coverage` comes first in the payload because on this estate `control_drift`
   * reaches four identities and `grant_staleness` seven. A reviewer who reads the ranking
   * before the coverage reads a six-row queue as an estate-wide assessment; one who reads
   * this first knows the queue is a floor. `exposure/service.test.ts` L402 established the
   * ordering for the same reason one module earlier.
   */
  router.get('/summary', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    res.json(service.summary(queryFrom(req)));
  });

  /** §6's table, most independently-firing signals first. */
  router.get('/', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const rows = service.list(queryFrom(req));
    res.json({ count: rows.length, identities: rows });
  });

  /** §6's drawer — the finding list with full evidence, plus both quoted verdicts. */
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

  /** §6.7 — one row per finding, so an auditor sees the "why" offline. */
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
    res.type('text/csv').send(toCsv(outcome.profile));
  });

  return router;
}

/**
 * One row per finding, and one row per factor that could not be evaluated.
 *
 * The unevaluated factors are rows rather than a footer because NIST SP 800-53r5 RA-3 maps
 * to this artifact only if it is a *record* — "document, review, disseminate, update on
 * significant change" — and a record that omits what the assessment could not see cannot
 * evidence clauses (c) through (f). Research §3.3 also puts IA-5(f)'s "by authenticator
 * type" here: a reader has to be able to tell which factor produced which line, which a
 * single fused figure could never support.
 *
 * An identity with no findings still exports its header and its unevaluated rows, so
 * "nothing found" and "nothing looked at" are distinguishable in a spreadsheet as well as
 * in the API.
 */
function toCsv(profile: RiskProfile): string {
  const header = [
    'identity_id',
    'name',
    'identity_type',
    'app',
    'assessment',
    'worst_level',
    'factors_firing',
    'factor',
    'level',
    'evidence',
    'source',
    'quoted',
    'ownership_state',
    'based_on_access_discovery_snapshot',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const { assessment } = profile;
  const worstLevel = assessment.kind === 'findings' ? assessment.worst_level : '';
  const firing = assessment.kind === 'findings' ? String(assessment.factors_firing) : '';
  const unavailable = assessment.kind === 'no_findings' ? [] : assessment.factors_unavailable;

  const line = (
    factor: string,
    level: string,
    evidence: string,
    source: string,
    quoted: string,
  ): string =>
    [
      profile.identity_id,
      profile.name,
      profile.identity_type,
      profile.app,
      assessment.kind,
      worstLevel,
      firing,
      factor,
      level,
      evidence,
      source,
      quoted,
      profile.ownership.state,
      profile.staleness.based_on_access_discovery_snapshot,
    ]
      .map(escape)
      .join(',');

  const findings = assessment.kind === 'findings' ? assessment.findings : [];
  const rows = [
    ...findings.map((finding) =>
      line(finding.factor, finding.level, finding.evidence, finding.source, String(finding.quoted)),
    ),
    ...unavailable.map((factor) => line(factor, '', 'not evaluated: no data for this identity', '', '')),
  ];

  return [header, ...rows].join('\n');
}
