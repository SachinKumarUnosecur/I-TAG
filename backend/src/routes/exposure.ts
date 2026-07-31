import { Router, type Request, type Response } from 'express';
import type {
  ExposureBand,
  ExposureProfile,
  ExposureQuery,
  ExposureService,
  IdentityType,
} from '@itag/core';
import { EXPOSURE_BAND_FLOORS } from '@itag/core';

const BANDS: readonly ExposureBand[] = EXPOSURE_BAND_FLOORS.map((entry) => entry.band);

const IDENTITY_TYPES: readonly IdentityType[] = ['human', 'service_account', 'ai_agent', 'group'];

/** Express types query values as `string | string[] | ...`, so narrow rather than cast. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asMember<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = singleValue(raw);
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

/** Scores are 0-100 integers, so anything outside that is a client error, not a clamp. */
function asScore(raw: unknown): number | null {
  const value = singleValue(raw);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

/**
 * Identity Exposure Map — `docs/PRD-identity-exposure-map.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code. Note what is
 * present here that is absent from every other router in this process — a score —
 * and note what travels with it. Research §7.2 makes this the engine's second
 * ranking authority, and the condition is that ownership's verdict and the
 * sentence reconciling the two ship inside the same payload. `service.ts` puts
 * them on every row and every profile; nothing here can strip them.
 *
 * Also absent, deliberately: `exposure_delta`, a `rising_fast` chip, and any
 * filter for either (Amendment 5). The graph is built once from a frozen dataset,
 * so a trend would be fabricated and a badge derived from it would be a fabricated
 * alarm — worse than a missing field, because it is actionable.
 */
export function createExposureRouter(service: ExposureService): Router {
  const router = Router();

  function queryFrom(req: Request): ExposureQuery {
    const app = singleValue(req.query.app);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    const band = asMember(req.query.band, BANDS);
    const minScore = asScore(req.query.min_score);
    const maxScore = asScore(req.query.max_score);

    return {
      ...(app === null ? {} : { app }),
      ...(identityType === null ? {} : { identityType }),
      ...(band === null ? {} : { band }),
      ...(minScore === null ? {} : { minScore }),
      ...(maxScore === null ? {} : { maxScore }),
      includeNoPaths: singleValue(req.query.include_no_paths) === 'true',
    };
  }

  /** An unrecognised filter is a client error, never a silent full-table scan. */
  function rejectBadFilters(req: Request, res: Response): boolean {
    if (req.query.band !== undefined && asMember(req.query.band, BANDS) === null) {
      res.status(400).json({ error: 'invalid_band', allowed: BANDS });
      return true;
    }
    if (
      req.query.identity_type !== undefined &&
      asMember(req.query.identity_type, IDENTITY_TYPES) === null
    ) {
      res.status(400).json({ error: 'invalid_identity_type', allowed: IDENTITY_TYPES });
      return true;
    }
    if (req.query.min_score !== undefined && asScore(req.query.min_score) === null) {
      res.status(400).json({ error: 'invalid_min_score', allowed: '0-100' });
      return true;
    }
    if (req.query.max_score !== undefined && asScore(req.query.max_score) === null) {
      res.status(400).json({ error: 'invalid_max_score', allowed: '0-100' });
      return true;
    }
    return false;
  }

  /**
   * The landing strip, ahead of the table for the reason §7 promotes classification
   * completeness from a metric to a gate: the first thing a reviewer needs to know
   * is not who scores highest but whether the scores mean anything. `scored`,
   * `no_paths` and `no_classified_permissions` are three counts rather than one
   * `unscored` because they are three different claims.
   */
  router.get('/summary', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    res.json(service.summary(queryFrom(req)));
  });

  /** §6.3's table. */
  router.get('/', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const rows = service.list(queryFrom(req));
    res.json({ count: rows.length, identities: rows });
  });

  /** §6.4's detail view — the exposure set, the rings and the derivation. */
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

  /** §6.6 — one row per permission, with the contribution that permission made. */
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
 * §6.6, with the contribution breakdown included — Amendment 5.
 *
 * A score exported without its derivation is the artifact FIRST's CVSS licence
 * terms exist to prevent, and an audit packet is precisely where that matters
 * most. So every row carries the weight and the multiplier that produced it, and
 * an unclassified permission appears as a row with an empty contribution rather
 * than being dropped — a reviewer reading the export has to be able to see what
 * the score could not see.
 */
function toCsv(profile: ExposureProfile): string {
  const header = [
    'identity_id',
    'permission',
    'sensitivity',
    'path_type',
    'hop_distance',
    'min_hop_distance',
    'route_count',
    'route_types',
    'weight',
    'mechanism_multiplier',
    'contribution',
    'share_of_weighted_sum',
    'exposure_score',
    'weighted_sum',
    'based_on_access_discovery_snapshot',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const scored = profile.assessment.kind === 'scored' ? profile.assessment : null;
  const contributions = new Map(
    (scored?.contributions ?? []).map((entry) => [entry.permission, entry]),
  );

  const lines = profile.exposure_set.entries.map((entry) => {
    const contribution = contributions.get(entry.permission);
    return [
      profile.identity_id,
      entry.permission,
      entry.sensitivity,
      entry.scored_route.path_type,
      String(entry.scored_route.hop_count),
      String(entry.min_hop_distance),
      String(entry.route_count),
      entry.route_types.join(' | '),
      contribution === undefined ? '' : String(contribution.weight),
      contribution === undefined ? '' : String(contribution.mechanism_multiplier),
      contribution === undefined ? '' : String(contribution.contribution),
      contribution === undefined ? '' : String(contribution.share_of_score),
      scored === null ? '' : String(scored.exposure_score),
      scored === null ? '' : String(scored.weighted_sum),
      profile.staleness.based_on_access_discovery_snapshot,
    ]
      .map(escape)
      .join(',');
  });

  return [header, ...lines].join('\n');
}
