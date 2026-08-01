import { Router, type Request, type Response } from 'express';
import type {
  IdentityType,
  MitreTactic,
  PtraceStage,
  ThreatFinding,
  ThreatFindingRow,
  ThreatImpactLevel,
  ThreatLikelihoodLevel,
  ThreatProfile,
  ThreatQuery,
  ThreatService,
} from '@itag/core';
import { PTRACE_REFERENCE } from '@itag/core';

const STAGES: readonly PtraceStage[] = PTRACE_REFERENCE.map((entry) => entry.stage);
const SEVERITIES: readonly ThreatFinding['severity'][] = ['critical', 'high', 'medium', 'low'];
const IMPACT_LEVELS: readonly ThreatImpactLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high'];
const LIKELIHOOD_LEVELS: readonly ThreatLikelihoodLevel[] = ['very_low', 'low', 'moderate', 'high', 'very_high'];
const IDENTITY_TYPES: readonly IdentityType[] = ['human', 'service_account', 'ai_agent', 'group'];

/** Express types query values as `string | string[] | ...`, so narrow rather than cast. */
function singleValue(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function asMember<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = singleValue(raw);
  return value !== null && allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Identity Threat Profile — `docs/identity-threat-profile-research.md` §6.
 *
 * Transport only: parse, delegate, map the outcome to a status code — `routes/risk-profile.ts`'s
 * shape, copied. One deliberate difference: `GET /` returns *findings*, not identities, because
 * `core/src/threat/service.ts`'s own header explains why `list()` is shaped that way — PRD §6.4's
 * table is "32 findings", not 32 identities, and `ThreatFindingRow` already inlines the identity
 * columns a table needs.
 */
export function createThreatProfileRouter(service: ThreatService): Router {
  const router = Router();

  function queryFrom(req: Request): ThreatQuery {
    const app = singleValue(req.query.app);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    const stage = asMember(req.query.stage, STAGES);
    const severity = asMember(req.query.severity, SEVERITIES);
    const impact = asMember(req.query.impact, IMPACT_LEVELS);
    const likelihood = asMember(req.query.likelihood, LIKELIHOOD_LEVELS);

    return {
      ...(app === null ? {} : { app }),
      ...(identityType === null ? {} : { identityType }),
      ...(stage === null ? {} : { stage }),
      ...(severity === null ? {} : { severity }),
      ...(impact === null ? {} : { impact }),
      ...(likelihood === null ? {} : { likelihood }),
    };
  }

  /** An unrecognised filter is a client error, never a silent full-table scan. */
  function rejectBadFilters(req: Request, res: Response): boolean {
    if (req.query.stage !== undefined && asMember(req.query.stage, STAGES) === null) {
      res.status(400).json({ error: 'invalid_stage', allowed: STAGES });
      return true;
    }
    if (req.query.severity !== undefined && asMember(req.query.severity, SEVERITIES) === null) {
      res.status(400).json({ error: 'invalid_severity', allowed: SEVERITIES });
      return true;
    }
    if (req.query.impact !== undefined && asMember(req.query.impact, IMPACT_LEVELS) === null) {
      res.status(400).json({ error: 'invalid_impact', allowed: IMPACT_LEVELS });
      return true;
    }
    if (req.query.likelihood !== undefined && asMember(req.query.likelihood, LIKELIHOOD_LEVELS) === null) {
      res.status(400).json({ error: 'invalid_likelihood', allowed: LIKELIHOOD_LEVELS });
      return true;
    }
    if (
      req.query.identity_type !== undefined &&
      asMember(req.query.identity_type, IDENTITY_TYPES) === null
    ) {
      res.status(400).json({ error: 'invalid_identity_type', allowed: IDENTITY_TYPES });
      return true;
    }
    return false;
  }

  /**
   * PRD §6.1's KPIs, §6.2's matrix, §6.3's stage cards — `stage_coverage` and `matrix` first
   * in the payload, ahead of the counts they qualify, the same ordering
   * `routes/risk-profile.ts` L106-113 argues for one module earlier: a reviewer who reads
   * Probing's zero after the KPI strip reads it as a finding; one who reads it as a named
   * coverage gate first reads it correctly.
   */
  router.get('/summary', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const app = singleValue(req.query.app);
    const identityType = asMember(req.query.identity_type, IDENTITY_TYPES);
    res.json(
      service.summary({
        ...(app === null ? {} : { app }),
        ...(identityType === null ? {} : { identityType }),
      }),
    );
  });

  /** PRD §6.4's Findings table — one row per finding, most severe first. */
  router.get('/', (req: Request, res: Response) => {
    if (rejectBadFilters(req, res)) {
      return;
    }
    const findings: readonly ThreatFindingRow[] = service.list(queryFrom(req));
    res.json({ count: findings.length, findings });
  });

  /** The per-identity drawer — every finding plus the three quoted verdicts. */
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

  /** One row per finding, plus one row per upstream source this identity could not evaluate. */
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

/** MITRE tactic column carries the whole tag; `mitre_technique` stays a separate column. */
function joinTactic(tactic: MitreTactic): string {
  return tactic;
}

function toCsv(profile: ThreatProfile): string {
  const header = [
    'identity_id',
    'name',
    'identity_type',
    'app',
    'assessment',
    'ptrace_stage',
    'mitre_tactic',
    'mitre_technique',
    'severity',
    'impact',
    'likelihood',
    'band',
    'evidence',
    'source',
    'ownership_state',
    'based_on_access_discovery_snapshot',
  ].join(',');

  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

  const { assessment } = profile;
  const findings = assessment.kind === 'findings' ? assessment.findings : [];
  const unavailable = assessment.kind === 'partially_evaluated' ? assessment.unavailable : [];

  const line = (values: readonly string[]): string => values.map(escape).join(',');

  const rows = [
    ...findings.map((finding) =>
      line([
        profile.identity_id,
        profile.name,
        profile.identity_type,
        profile.app,
        assessment.kind,
        finding.ptrace_stage,
        joinTactic(finding.mitre_tactic),
        finding.mitre_technique,
        finding.severity,
        finding.cell?.impact ?? '',
        finding.cell?.likelihood ?? '',
        finding.cell?.band ?? '',
        finding.evidence,
        finding.source,
        profile.ownership.state,
        profile.staleness.based_on_access_discovery_snapshot,
      ]),
    ),
    ...unavailable.map((source) =>
      line([
        profile.identity_id,
        profile.name,
        profile.identity_type,
        profile.app,
        assessment.kind,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        `not evaluated: no verdict available from ${source}`,
        source,
        profile.ownership.state,
        profile.staleness.based_on_access_discovery_snapshot,
      ]),
    ),
  ];

  return [header, ...rows].join('\n');
}
