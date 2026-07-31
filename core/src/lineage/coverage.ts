import type {
  LineageCoverage,
  LineageCoverageReport,
  LineageGapBucket,
  LineageGapReason,
  ProvenanceRecord,
} from '../domain/lineage.js';
import type { IdentityGraph } from '../graph/build.js';

/**
 * Aggregates provenance records into explanation coverage — research §4.5, §6.
 *
 * `explanation_coverage = 1 − (unexplained / total)`. The raw count of identities
 * with no creator is never published: like the raw orphan count in
 * `docs/orphaned-identity-research.md` §5.2, it moves in the wrong direction as the
 * product improves, because better ingestion finds *more* identities before it
 * finds more of their creators.
 *
 * `explained` deliberately counts two different things — a creator we hold, and an
 * absence we can account for by bucket. Saying "this account is federated from your
 * IdP, which is why this app records no creator for it" is an explanation; an empty
 * cell is not. That is the difference between `PRD` §6.6's banner and a metric.
 */
function summarise(
  app: string | null,
  records: readonly ProvenanceRecord[],
  creationDataFrom: string | null,
): LineageCoverage {
  let withCreator = 0;
  let explainedAbsences = 0;
  let attributed = 0;
  let attested = 0;
  const buckets = new Map<LineageGapReason, number>();

  let unexplained = 0;

  for (const record of records) {
    const provenance = record.provenance;
    switch (provenance.state) {
      case 'recorded': {
        withCreator += 1;
        const human = provenance.authorizing_human;
        if (human !== null) {
          attributed += 1;
          if (human.confidence === 'attested') {
            attested += 1;
          }
        }
        break;
      }
      case 'explained_absence': {
        explainedAbsences += 1;
        const reason = provenance.gap.reason;
        buckets.set(reason, (buckets.get(reason) ?? 0) + 1);
        break;
      }
      case 'unexplained':
        // Counted, and kept in the denominator on purpose — see `buildCoverage`.
        unexplained += 1;
        break;
    }
  }

  const total = records.length;

  return {
    app,
    total,
    with_recorded_creator: withCreator,
    explained_absences: explainedAbsences,
    unexplained,
    explanation_coverage: total === 0 ? 1 : (withCreator + explainedAbsences) / total,
    gap_buckets: Object.freeze(
      [...buckets]
        .map(([reason, count]): LineageGapBucket => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    ),
    creation_data_from: creationDataFrom,
    attributed_to_human: attributed,
    attested_attributions: attested,
  };
}

/**
 * The landing view's numbers, for the estate and for each app.
 *
 * **Unexplained identities stay in the denominator.** This is a deliberate contrast
 * with `OwnershipFinding.counted`, where `unknown` is structurally excluded from the
 * finding count (`domain/ownership.ts` L22-29) — and the two rules are opposite for
 * a reason. There, excluding uncertain rows keeps a *finding count* honest, because
 * billing an audit-retention gap as an orphan is a fabricated finding. Here, the
 * unexplained population is the entire subject of the measurement: drop it from the
 * denominator and coverage is always 1, the metric can never be falsified, and the
 * product has no way to show the line climbing from install date that research §6
 * builds the whole pitch on.
 *
 * Groups are excluded from the population, matching `ownership/classify.ts` L186 and
 * `PRD` §4.1's node list, which names humans, service accounts, AI agents and
 * app-integration accounts and does not include permission containers.
 */
export function buildCoverage(
  graph: IdentityGraph,
  records: readonly ProvenanceRecord[],
): LineageCoverageReport {
  const scoped = records.filter((record) => record.identity_type !== 'group');

  const byApp = new Map<string, ProvenanceRecord[]>();
  for (const record of scoped) {
    const bucket = byApp.get(record.app);
    if (bucket === undefined) {
      byApp.set(record.app, [record]);
    } else {
      bucket.push(record);
    }
  }

  return {
    // The estate-wide floor has no single retention date, so it reports none rather
    // than picking one app's and implying it applies everywhere.
    overall: summarise(null, scoped, null),
    by_app: Object.freeze(
      [...byApp]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([app, appRecords]) =>
          summarise(app, appRecords, graph.apps.get(app)?.creation_data_from ?? null),
        ),
    ),
  };
}
