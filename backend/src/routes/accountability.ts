import { Router, type Request, type Response } from 'express';
import type { AccountabilityService } from '@itag/core';

/**
 * GET /api/accountability/:id — F4 + F5.
 *
 * Transport only: parse the id, delegate, map the outcome to a status code.
 * A pathological graph shape is a 200 carrying a terminal state, not a 500; only
 * an unrecognised identity is a 404.
 */
export function createAccountabilityRouter(service: AccountabilityService): Router {
  const router = Router();

  router.get('/:id', (req: Request, res: Response) => {
    // Express types the param as string | string[], so narrow rather than cast.
    const rawId: unknown = req.params.id;
    if (typeof rawId !== 'string' || rawId.length === 0) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }

    const identityId = rawId;

    const outcome = service.assess(identityId);
    if (!outcome.ok) {
      res.status(404).json({ error: outcome.error, identity_id: outcome.identity_id });
      return;
    }

    res.json(outcome.assessment);
  });

  return router;
}
