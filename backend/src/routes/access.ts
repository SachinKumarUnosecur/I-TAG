import { Router, type Request, type Response } from 'express';
import type { AccessPathType, AccessQuery, AccessRow, AccessService, IdentityType } from '@itag/core';

const PATH_TYPES: readonly AccessPathType[] = ['direct', 'indirect', 'hop'];

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
 * Access Discovery — `docs/PRD-access-discovery.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code. Note what is
 * absent from every response — a severity and a rank. `PRD` L30 makes scoring a
 * non-goal and hands it to Identity Risk Profile, and `ownership/severity.ts`
 * remains the single place in the engine that decides what matters most.
 */
export function createAccessRouter(service: AccessService): Router {
  const router = Router();

  function queryFrom(req: Request): AccessQuery {
    const app = singleValue(req.query.app);
    const pathType = asMember(req.query.path_type, PATH_TYPES);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    const minHopCount = asInteger(req.query.min_hop_count);
    const maxHopCount = asInteger(req.query.max_hop_count);

    return {
      ...(app === null ? {} : { app }),
      ...(pathType === null ? {} : { pathType }),
      ...(identityType === null ? {} : { identityType }),
      ...(minHopCount === null ? {} : { minHopCount }),
      ...(maxHopCount === null ? {} : { maxHopCount }),
      sensitiveOnly: singleValue(req.query.sensitive_only) === 'true',
    };
  }

  /** An unrecognised filter is a client error, never a silent full-table scan. */
  function rejectBadFilters(req: Request, res: Response): boolean {
    if (req.query.path_type !== undefined && asMember(req.query.path_type, PATH_TYPES) === null) {
      res.status(400).json({ error: 'invalid_path_type', allowed: PATH_TYPES });
      return true;
    }
    if (
      req.query.identity_type !== undefined &&
      asMember(req.query.identity_type, IDENTITY_TYPES) === null
    ) {
      res.status(400).json({ error: 'invalid_identity_type', allowed: IDENTITY_TYPES });
      return true;
    }
    if (req.query.min_hop_count !== undefined && asInteger(req.query.min_hop_count) === null) {
      res.status(400).json({ error: 'invalid_min_hop_count' });
      return true;
    }
    if (req.query.max_hop_count !== undefined && asInteger(req.query.max_hop_count) === null) {
      res.status(400).json({ error: 'invalid_max_hop_count' });
      return true;
    }
    return false;
  }

  /**
   * The landing view — `PRD` §6.4's `X Direct · Y Indirect · Z Hop` strip.
   *
   * Ahead of the table for the reason §6.4 pins the "Hop Access Only" chip to the
   * top-left of the filter bar: on a real estate the table opens on thousands of
   * direct and indirect rows, and the one count that decides whether anything is
   * wrong is the third. Carries `graph_snapshot_at` so §4.4's downstream contract
   * is satisfiable by a consumer that only ever calls this endpoint.
   */
  router.get('/summary', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    res.json(service.summary(queryFrom(req)));
  });

  router.get('/export', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const rows = service.list(queryFrom(req));
    if (singleValue(req.query.format) === 'csv') {
      res.type('text/csv').send(toCsv(rows));
      return;
    }
    res.json({ count: rows.length, rows });
  });

  /** The §6.3 table. */
  router.get('/', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const rows = service.list(queryFrom(req));
    res.json({
      count: rows.length,
      // The §6.4 counters travel with the page so a filtered table never has to
      // infer the totals it was filtered from.
      hop: rows.filter((row) => row.path.path_type === 'hop').length,
      rows,
    });
  });

  /**
   * The §6.9 per-user page.
   *
   * `PRD` §6.9 step 1 also wants a Risk Score and a JML status in the header. Both
   * come from modules that do not exist yet (Identity Risk Profile, Identity
   * Lifecycle), and they are omitted entirely rather than emitted as nulls: a null
   * risk score renders as a zero somewhere downstream, and a zero is a claim.
   */
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

  return router;
}

/**
 * `PRD` §6.8 — the chain flattened into one Path column.
 *
 * "No data should be graph-only or unexportable" is the standard the other two
 * modules already meet, and the chain is the column an auditor actually needs:
 * the classification is a word, the proof is the sequence of edges behind it.
 */
function toCsv(rows: readonly AccessRow[]): string {
  const header = [
    'identity_id',
    'identity_type',
    'app',
    'permission',
    'path_type',
    'hop_count',
    'sensitive',
    'via',
    'assumed_identity',
    'owner_kind',
    'owner_id',
    'ownership_state',
    'suppression_effect',
    'path',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const lines = rows.map(({ path, ownership }) =>
    [
      path.identity_id,
      path.identity_type,
      path.app,
      path.permission,
      path.path_type,
      String(path.hop_count),
      String(path.sensitive),
      path.path_type === 'hop'
        ? path.via_permission
        : path.path_type === 'indirect'
          ? path.via_group
          : '',
      path.path_type === 'hop' ? path.assumed_identity : '',
      ownership.owner?.kind ?? '',
      ownership.owner?.id ?? '',
      ownership.state,
      ownership.suppression?.effect ?? '',
      path.chain.map((step) => `${step.from} -[${step.edge}]-> ${step.to}`).join(' | '),
    ]
      .map(escape)
      .join(','),
  );

  return [header, ...lines].join('\n');
}
