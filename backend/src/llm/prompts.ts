/**
 * Prompt template for F6 — Explainable Risk Narrative.
 * Mirrors §8 of the PRD.
 */
export interface ExplainInput {
  name?: string;
  type?: string;
  direct_grants?: unknown;
  effective_grants?: unknown;
  extra_permissions_not_explicitly_granted?: unknown;
  accountability_chain?: unknown;
  root_employee_status?: unknown;
  trust_score?: number;
  control_history_events?: unknown;
}

export const EXPLAIN_SYSTEM_PROMPT = `You are a security analyst explaining an identity access risk to a non-expert. Be concise (4-6 sentences). Explain (1) what excess access this identity effectively has and how it got it, (2) who is accountable for that access and whether that accountability is still valid, and (3) whether this identity's protective controls (MFA, conditional access) have weakened over time, independent of its permissions. End with 1-2 ranked remediation actions, prioritizing whichever issue is most severe.`;

export function buildExplainPrompt(input: ExplainInput): string {
  const j = (v: unknown) => JSON.stringify(v ?? null, null, 2);
  return [
    `Identity "${input.name ?? 'unknown'}" (type: ${input.type ?? 'unknown'}) has:`,
    `- Explicit grants: ${j(input.direct_grants)}`,
    `- Effective (inherited/delegated) access: ${j(input.effective_grants)}`,
    `- Escalation: ${j(input.extra_permissions_not_explicitly_granted)}`,
    `- Accountability chain: ${j(input.accountability_chain)}`,
    `- Root human status: ${j(input.root_employee_status)}`,
    `- Trust score: ${input.trust_score ?? 100} (baseline 100)`,
    `- Control change history: ${j(input.control_history_events)}`,
    '',
    'Explain the risk and what to fix first.',
  ].join('\n');
}
