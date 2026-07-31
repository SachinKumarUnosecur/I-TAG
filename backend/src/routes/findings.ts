import { Router, type Request, type Response } from 'express';
import type { DispositionAction, DispositionService } from '@itag/core';

const ACTIONS: readonly DispositionAction[] = [
  'open',
  'reassigned',
  'revoked',
  'attested',
  'suppressed',
];

function asString(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Disposition journal — `docs/orphaned-identity-research.md` §4.5.
 *
 * A finding with no way to record what was decided is a report, not a control,
 * so this is the endpoint that turns the queue into evidence.
 */
export function createFindingsRouter(service: DispositionService): Router {
  const router = Router();

  router.post('/:id/disposition', (req: Request, res: Response) => {
    const findingId = asString(req.params.id);
    const body: unknown = req.body;
    if (findingId === null || typeof body !== 'object' || body === null) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }

    const payload = body as Record<string, unknown>;
    const identityId = asString(payload.identity_id);
    const actor = asString(payload.actor);
    const justification = asString(payload.justification);
    const rawAction = asString(payload.action);
    const action = rawAction !== null && ACTIONS.includes(rawAction as DispositionAction)
      ? (rawAction as DispositionAction)
      : null;

    if (identityId === null || actor === null || justification === null || action === null) {
      res.status(400).json({
        error: 'missing_field',
        required: ['identity_id', 'actor', 'justification', 'action'],
        allowed_actions: ACTIONS,
      });
      return;
    }

    const expiresAt = asString(payload.expires_at);
    const evidenceRef = asString(payload.evidence_ref);

    const outcome = service.record({
      finding_id: findingId,
      identity_id: identityId,
      action,
      actor,
      justification,
      ...(expiresAt === null ? {} : { expires_at: expiresAt }),
      ...(evidenceRef === null ? {} : { evidence_ref: evidenceRef }),
    });

    if (!outcome.ok) {
      res.status(400).json({ error: outcome.error });
      return;
    }

    res.status(201).json({ disposition: outcome.disposition, supersedes: outcome.supersedes });
  });

  router.get('/:identityId/history', (req: Request, res: Response) => {
    const identityId = asString(req.params.identityId);
    if (identityId === null) {
      res.status(404).json({ error: 'unknown_identity', identity_id: null });
      return;
    }
    res.json({ history: service.history(identityId) });
  });

  return router;
}
