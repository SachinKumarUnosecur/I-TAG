import { Router, type Request, type Response } from 'express';
import { buildExplainPrompt } from '../llm/prompts.js';

export const explainRouter = Router();

/**
 * POST /api/explain
 *
 * Body: {
 *   name, type, direct_grants, effective_grants,
 *   extra_permissions_not_explicitly_granted,
 *   accountability_chain, root_employee_status,
 *   trust_score, control_history_events
 * }
 *
 * Returns: { narrative: string, prompt: string }
 *
 * Right now this is a stub that echoes the prepared prompt. Wire in the
 * Anthropic SDK later (see F6 in the PRD).
 */
explainRouter.post('/', async (req: Request, res: Response) => {
  const payload = req.body ?? {};
  const prompt = buildExplainPrompt(payload);

  // TODO: replace with real Anthropic call once ANTHROPIC_API_KEY is wired up.
  const narrative =
    'LLM proxy not yet wired. This is a placeholder narrative — see backend/src/routes/explain.ts.';

  res.json({ narrative, prompt });
});
