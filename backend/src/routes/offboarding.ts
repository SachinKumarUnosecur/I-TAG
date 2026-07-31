import { Router, type Request, type Response } from 'express';
import type { SweepService } from '@itag/core';

/**
 * F11 — off-boarding sweep. `docs/orphaned-identity-research.md` §5.1.
 *
 * A human who is active, or who left nothing behind, is a 404 rather than an
 * empty envelope: "no debt" and "not a departed person" are different answers.
 */
export function createOffboardingRouter(service: SweepService): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const footprints = service.all();
    res.json({
      departed_with_debt: footprints.length,
      live_identities: footprints.reduce((total, footprint) => total + footprint.live.length, 0),
      footprints,
    });
  });

  router.get('/:humanId', (req: Request, res: Response) => {
    const rawId: unknown = req.params.humanId;
    if (typeof rawId !== 'string' || rawId.length === 0) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }

    const footprint = service.forHuman(rawId);
    if (footprint === null) {
      res.status(404).json({ error: 'not_a_departed_human', identity_id: rawId });
      return;
    }

    res.json(footprint);
  });

  return router;
}
