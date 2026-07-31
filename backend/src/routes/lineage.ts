import { Router, type Request, type Response } from 'express';
import type { IdentityType, LineageGapReason, LineageQuery, LineageService } from '@itag/core';

const SIGNALS: readonly NonNullable<LineageQuery['signal']>[] = [
  'self_authorized',
  'creator_privilege_mismatch',
  'fan_out_rate',
];

const GAP_REASONS: readonly LineageGapReason[] = [
  'root_by_design',
  'outside_audit_window',
  'federated_elsewhere',
  'self_registered',
  'bulk_imported',
  'not_yet_captured',
];

const IDENTITY_TYPES: readonly IdentityType[] = ['human', 'service_account', 'ai_agent', 'group'];

/** Express types query values as `string | string[] | ...`, so narrow rather than cast. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asMember<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = singleValue(raw);
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

function asInteger(raw: unknown): number | null {
  const value = singleValue(raw);
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Provisioning Lineage — `docs/delegation-chain-research.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code. Note what is
 * absent from every response here — a severity and a rank. `PRD` L34 makes scoring a
 * non-goal and research §7.2 keeps `ownership/severity.ts` the single place in the
 * engine where anything is ranked, which is the property that stops the two modules
 * from disagreeing about danger in front of a customer.
 */
export function createLineageRouter(service: LineageService): Router {
  const router = Router();

  /**
   * The default landing view, and a deliberate departure from `PRD` §6.1's
   * table-first recommendation.
   *
   * Research §6 records the disagreement and its resolution. On day one in a real
   * tenant the table is mostly rows with no creator (§3.2), so opening on it makes
   * the product look broken at the moment a buyer forms their opinion — and look
   * broken in the wrong direction, as though we were at fault rather than their audit
   * configuration. Opening on coverage makes the same data say "here is how much of
   * your estate we can explain, here is why the rest cannot be, and here is the date
   * that number starts climbing from".
   */
  router.get('/coverage', (req: Request, res: Response) => {
    const app = singleValue(req.query.app);
    res.json(service.coverage(app ?? undefined));
  });

  /** The §4.3 fan-out leaderboard: each actor against its own baseline, not a volume rank. */
  router.get('/actors', (req: Request, res: Response) => {
    const app = singleValue(req.query.app);
    const signals = service.actors(app ?? undefined);
    res.json({ count: signals.length, actors: signals });
  });

  router.get('/export', (req: Request, res: Response) => {
    const app = singleValue(req.query.app);
    const rows = service.list(app === null ? {} : { app });
    if (singleValue(req.query.format) === 'csv') {
      res.type('text/csv').send(toCsv(rows));
      return;
    }
    res.json({ rows });
  });

  /** The §6.3 table. `O(1)` per row, because generation is memoized at graph build. */
  router.get('/', (req: Request, res: Response) => {
    const signal = asMember(req.query.signal, SIGNALS);
    const gapReason = asMember(req.query.gap_reason, GAP_REASONS);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    const app = singleValue(req.query.app);
    const minGeneration = asInteger(req.query.min_generation);
    const maxGeneration = asInteger(req.query.max_generation);

    // An unrecognised filter is a client error rather than a silent full-table scan,
    // which would read as "we found nothing".
    if (req.query.signal !== undefined && signal === null) {
      res.status(400).json({ error: 'invalid_signal', allowed: SIGNALS });
      return;
    }
    if (req.query.gap_reason !== undefined && gapReason === null) {
      res.status(400).json({ error: 'invalid_gap_reason', allowed: GAP_REASONS });
      return;
    }
    if (req.query.identity_type !== undefined && identityType === null) {
      res.status(400).json({ error: 'invalid_identity_type', allowed: IDENTITY_TYPES });
      return;
    }
    if (req.query.min_generation !== undefined && minGeneration === null) {
      res.status(400).json({ error: 'invalid_min_generation' });
      return;
    }
    if (req.query.max_generation !== undefined && maxGeneration === null) {
      res.status(400).json({ error: 'invalid_max_generation' });
      return;
    }

    const query: LineageQuery = {
      ...(app === null ? {} : { app }),
      ...(signal === null ? {} : { signal }),
      ...(gapReason === null ? {} : { gapReason }),
      ...(identityType === null ? {} : { identityType }),
      ...(minGeneration === null ? {} : { minGeneration }),
      ...(maxGeneration === null ? {} : { maxGeneration }),
      hideAbsentCreators: singleValue(req.query.hide_absent_creators) === 'true',
    };

    const rows = service.list(query);
    res.json({
      count: rows.length,
      // Reported alongside the count so a screenful of rows with no creator is never
      // mistaken for a screenful of findings (§4.5).
      with_recorded_creator: rows.filter((row) => row.provenance.state === 'recorded').length,
      self_authorized: rows.filter((row) => row.self_authorized).length,
      rows,
    });
  });

  /**
   * The §6.5 tree. Depth-bounded and capped by the service, because §6.5's own
   * example is a bot that created 40 accounts and an unbounded subtree turns one row
   * into a megabyte of payload.
   */
  router.get('/:id/tree', (req: Request, res: Response) => {
    const identityId = singleValue(req.params.id);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }
    const requested = asInteger(req.query.depth);
    const outcome = service.tree(identityId, requested ?? 3);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }
    res.json(outcome.tree);
  });

  router.get('/:id', (req: Request, res: Response) => {
    const identityId = singleValue(req.params.id);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }
    const outcome = service.record(identityId);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }
    res.json(outcome.record);
  });

  return router;
}

/**
 * The NIST SP 800-53 AC-2(4) evidence pack.
 *
 * AC-2(4) demands automated audit of account creation; what an assessor cannot get
 * from a provider console is the *coverage* half — which systems have that audit and
 * which do not — so the gap reason is a column here rather than a footnote.
 */
function toCsv(rows: readonly ReturnType<LineageService['list']>[number][]): string {
  const header = [
    'identity_id',
    'app',
    'identity_type',
    'created_by',
    'creator_status',
    'generation',
    'root_id',
    'fan_out',
    'provenance',
    'gap_reason',
    'self_authorized',
    'creator_privilege_mismatch',
    'fan_out_exceeds_baseline',
    'created_at',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const lines = rows.map((row) =>
    [
      row.identity_id,
      row.app,
      row.identity_type,
      row.created_by ?? '',
      row.creator_status,
      row.generation === null ? '' : String(row.generation),
      row.root_id ?? '',
      String(row.fan_out),
      row.provenance.state,
      row.provenance.state === 'explained_absence' ? row.provenance.gap.reason : '',
      String(row.self_authorized),
      String(row.creator_privilege_mismatch),
      String(row.fan_out_exceeds_baseline),
      row.created_at ?? '',
    ]
      .map(escape)
      .join(','),
  );

  return [header, ...lines].join('\n');
}
