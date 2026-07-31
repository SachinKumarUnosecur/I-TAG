import type { OwnershipFinding } from '../domain/ownership-results.js';
import type { FindingDisposition } from '../domain/ownership.js';

/**
 * The artefact an assessor asks for.
 *
 * PCI DSS v4.0.1 Req 8.2.6 is verified from "a dated inactive-account report,
 * tickets or change records showing approvals and actions"; NIST SP 800-53
 * AC-2(3) wants retained proof that disablement happened inside the SLA. Both are
 * a table with a date, a subject, a decision and a reference — so the export is
 * part of the feature, not a reporting afterthought.
 */
export interface EvidencePack {
  readonly generated_at: string;
  readonly findings: readonly OwnershipFinding[];
  readonly dispositions: readonly FindingDisposition[];
}

const COLUMNS = [
  'identity_id',
  'app',
  'identity_type',
  'state',
  'reason',
  'severity',
  'owner_kind',
  'owner_id',
  'owner_source',
  'owner_confidence',
  'condition_since',
  'age_days',
  'sla_days',
  'sla_breached',
  'last_activity_at',
  'inactive_days',
  'reachable_sensitive_count',
  'counted',
  'suppression_reason',
  'suppression_expires_at',
  'detected_at',
] as const;

/** RFC 4180: quote every field, double any embedded quote. */
function csvCell(value: string | number | boolean | null): string {
  if (value === null) {
    return '""';
  }
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function findingsToCsv(findings: readonly OwnershipFinding[]): string {
  const rows = findings.map((finding) =>
    [
      finding.identity_id,
      finding.app,
      finding.identity_type,
      finding.state,
      finding.state === 'owned' ? null : finding.reason,
      finding.severity,
      finding.owner?.kind ?? null,
      finding.owner?.id ?? null,
      finding.owner?.source ?? null,
      finding.owner?.confidence ?? null,
      finding.timeline.condition_since,
      finding.timeline.age_days,
      finding.timeline.sla_days,
      finding.timeline.sla_breached,
      finding.timeline.last_activity_at,
      finding.timeline.inactive_days,
      finding.reachable_sensitive_count,
      finding.counted,
      finding.suppression?.reason ?? null,
      finding.suppression?.expires_at ?? null,
      finding.detected_at,
    ]
      .map(csvCell)
      .join(','),
  );

  return [COLUMNS.map(csvCell).join(','), ...rows].join('\n');
}

export function buildEvidencePack(
  findings: readonly OwnershipFinding[],
  dispositions: readonly FindingDisposition[],
  generatedAt: Date,
): EvidencePack {
  return {
    generated_at: generatedAt.toISOString(),
    findings,
    dispositions,
  };
}
