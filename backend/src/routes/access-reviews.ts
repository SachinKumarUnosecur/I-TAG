import { Router, type Request, type Response } from 'express';
import type {
  AccessReviewsService,
  ReviewDecision,
  ReviewExportFramework,
  ReviewQuery,
} from '@itag/core';

const DECISIONS: readonly ReviewDecision[] = ['pending', 'approved', 'revoked', 'escalated'];
const FRAMEWORKS: readonly ReviewExportFramework[] = ['soc2', 'iso27001'];
const ACTIONS = ['approve', 'revoke', 'escalate'] as const;

function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asMember<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = singleValue(raw);
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Access Reviews — `docs/PRD-access-reviews.md` §5.
 * Transport only: parse, delegate, status codes.
 */
export function createAccessReviewsRouter(service: AccessReviewsService): Router {
  const router = Router();

  function listQuery(req: Request): {
    readonly query: ReviewQuery;
    readonly decisionOk: boolean;
  } {
    const campaign = singleValue(req.query.campaign) ?? singleValue(req.query.campaign_id);
    const decisionRaw = singleValue(req.query.decision);
    let decision: ReviewDecision | 'all' | undefined;
    let decisionOk = true;
    if (decisionRaw === null || decisionRaw === 'all' || decisionRaw === 'All') {
      decision = undefined;
    } else {
      const parsed = asMember(decisionRaw, DECISIONS);
      if (parsed === null) {
        decisionOk = false;
      } else {
        decision = parsed;
      }
    }
    const search = singleValue(req.query.search) ?? undefined;
    const connector = singleValue(req.query.connector) ?? undefined;

    return {
      decisionOk,
      query: {
        ...(campaign === null ? {} : { campaignId: campaign }),
        ...(decision === undefined ? {} : { decision }),
        ...(search === undefined ? {} : { search }),
        ...(connector === undefined ? {} : { connector }),
      },
    };
  }

  router.get('/summary', (req: Request, res: Response) => {
    const { query, decisionOk } = listQuery(req);
    if (!decisionOk) {
      res.status(400).json({ error: 'invalid_decision', allowed: DECISIONS });
      return;
    }
    res.json(service.summary(query));
  });

  router.get('/campaigns', (_req: Request, res: Response) => {
    const campaigns = service.campaigns();
    res.json({ count: campaigns.length, campaigns });
  });

  router.get('/export', (req: Request, res: Response) => {
    const framework = asMember(req.query.framework, FRAMEWORKS);
    if (framework === null) {
      res.status(400).json({ error: 'invalid_framework', allowed: FRAMEWORKS });
      return;
    }
    res
      .type('text/csv')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="access-reviews-${framework}-attestation.csv"`,
      )
      .send(service.exportCsv(framework));
  });

  router.get('/', (req: Request, res: Response) => {
    const { query, decisionOk } = listQuery(req);
    if (!decisionOk) {
      res.status(400).json({ error: 'invalid_decision', allowed: DECISIONS });
      return;
    }
    const result = service.list(query);
    res.json(result);
  });

  router.get('/:itemId', (req: Request, res: Response) => {
    const itemId = singleValue(req.params.itemId);
    if (itemId === null) {
      res.status(404).json({ error: 'unknown_item', item_id: null });
      return;
    }
    const connector = singleValue(req.query.connector) ?? undefined;
    const outcome = service.profile(itemId, {
      ...(connector === undefined ? {} : { connector }),
    });
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, item_id: outcome.item_id });
      return;
    }
    res.json(outcome.profile);
  });

  router.post('/:itemId/decision', (req: Request, res: Response) => {
    const itemId = singleValue(req.params.itemId);
    if (itemId === null) {
      res.status(404).json({ error: 'unknown_item', item_id: null });
      return;
    }
    const body = req.body as Record<string, unknown> | null;
    if (body === null || typeof body !== 'object') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const action = asMember(body.action, ACTIONS);
    const actor = singleValue(body.actor);
    const justification = singleValue(body.justification);
    if (action === null || actor === null || justification === null) {
      res.status(400).json({
        error: 'missing_field',
        required: ['action', 'actor', 'justification'],
        allowed_actions: ACTIONS,
      });
      return;
    }

    const outcome = service.decide(itemId, { action, actor, justification });
    if (!outcome.ok) {
      const status = outcome.error === 'unknown_item' ? 404 : 400;
      res.status(status).json({ error: outcome.error, item_id: outcome.item_id });
      return;
    }
    res.status(201).json({ item: outcome.item, record: outcome.record });
  });

  return router;
}
