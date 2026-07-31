import type { AccessService } from '../access/service.js';
import type { AccessSnapshot } from '../domain/access.js';
import type {
  ClassificationCompleteness,
  ExposureAssessment,
  ExposureBandCount,
  ExposureEntry,
  ExposureOutcome,
  ExposureOwnershipContext,
  ExposureProfile,
  ExposureQuery,
  ExposureRow,
  ExposureSummary,
  PermissionSensitivity,
} from '../domain/exposure.js';
import { EXPOSURE_BAND_FLOORS } from '../domain/exposure.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import {
  bandFor,
  collapseToExposureSet,
  contributionsOf,
  highestSensitivityReached,
  isCounted,
  ringsOf,
  saturate,
  unclassifiedPermissionsOf,
  weightedSum,
} from './score.js';

/**
 * Identity Exposure Map — `docs/PRD-identity-exposure-map.md` §6 and
 * `docs/identity-exposure-map-research.md` §6.
 *
 * Aggregation only. Every path this module scores was classified by Access
 * Discovery and is consumed through `AccessService.profile`, so there is no second
 * traversal and architecture rule 1 holds without effort. What is added is one
 * fact no other module computes: how much one identity can reach in total, and how
 * much of that has ever been assessed.
 *
 * **This service ranks, and it is the second thing in the engine allowed to.**
 * Research §7.2 makes that a governance decision rather than a technical one, and
 * the price of the exception is disclosure: every row and every profile carries
 * ownership's verdict and the sentence reconciling the two, so no consumer can put
 * an exposure score on screen without the other number beside it.
 */

/**
 * Ownership's verdict for one identity, as this module is allowed to see it.
 *
 * A narrow port for the reason `AccessOwnerSource` is one: `ownership/classify.ts`
 * must not become an import of this module, and only an adapter should know both
 * sides. The values are copied, never recomputed — this module has no opinion
 * about whether anyone is accountable for an identity.
 */
export interface ExposureOwnershipSource {
  context(identityId: string): ExposureOwnershipContext;
}

export interface ExposureDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  /** The path inventory this module aggregates and does not re-derive. */
  readonly access: AccessService;
  readonly ownership: ExposureOwnershipSource;
}

export interface ExposureService {
  /** §6.3's landing table, widest footprint first. */
  list(query?: ExposureQuery): readonly ExposureRow[];
  /** §6.4's detail view. Never throws on an unknown id. */
  profile(identityId: string): ExposureOutcome;
  /** §7's gate metrics, over the population the table was computed from. */
  summary(query?: ExposureQuery): ExposureSummary;
}

/**
 * Ordering of the three assessment arms in the landing table.
 *
 * Scored identities first because they are the triage queue. Then the identities
 * whose whole footprint is unassessed, which is a gap to close rather than a clean
 * result and must not be buried. Identities that reach nothing come last and are
 * excluded by default — there is nothing to act on, and in this dataset all 21 of
 * them are `svc-fixture-*` engine probes.
 */
const ASSESSMENT_ORDER: Readonly<Record<ExposureAssessment['kind'], number>> = Object.freeze({
  scored: 0,
  no_classified_permissions: 1,
  no_paths: 2,
});

export function createExposureService(deps: ExposureDeps): ExposureService {
  /**
   * Access Discovery's snapshot, read once and reused.
   *
   * PRD §4.4's contract is that this value is *copied* from the module that
   * produced the facts, never re-read from the clock — a consumer dates the facts
   * it read, not the moment it read them. The only exposed source is
   * `AccessService.summary()`, which walks the estate, so calling it per request
   * would make a full scan out of a single-identity detail view.
   *
   * Cached per service instance, which is correct here for the same reason
   * `memoizedOwnershipState`'s cache is: the graph is built once at boot from a
   * frozen dataset. A deployment with a mutable graph must scope one service per
   * rebuild rather than one per process.
   */
  let snapshot: AccessSnapshot | null = null;
  function accessSnapshot(): AccessSnapshot {
    snapshot ??= deps.access.summary().snapshot;
    return snapshot;
  }

  /**
   * Groups are excluded, matching `access/service.ts` and `ownership/classify.ts`.
   *
   * Arithmetic as well as conceptual: a group's grants already appear as the
   * indirect paths of every member, so scoring the group as its own subject would
   * count the same permission twice in the estate's totals and make the landing
   * table's shape depend on how the estate happens to be foldered.
   */
  function population(graph: IdentityGraph, app: string | undefined): readonly Identity[] {
    const scope = app === undefined ? graph.all : (graph.byApp.get(app) ?? []);
    return scope.filter((identity) => identity.type !== 'group');
  }

  /**
   * The three-state read of a flag stored as `true | false | undefined`.
   *
   * Both sets come from `graph/build.ts`, which is the engine's only reader of
   * `PermissionRecord.sensitive`. A permission absent from the catalogue cannot
   * occur — `validateDataset` rejects a grant naming one at boot — so the fallback
   * is unreachable rather than a silent default.
   */
  function sensitivityLookup(graph: IdentityGraph): (permission: string) => PermissionSensitivity {
    return (permission) => {
      if (graph.sensitivePermissions.has(permission)) {
        return 'sensitive';
      }
      return graph.unclassifiedPermissions.has(permission) ? 'unclassified' : 'not_sensitive';
    };
  }

  function entriesFor(graph: IdentityGraph, identity: Identity): readonly ExposureEntry[] {
    const outcome = deps.access.profile(identity.id);
    return outcome.ok
      ? collapseToExposureSet(outcome.profile.paths, sensitivityLookup(graph))
      : Object.freeze([]);
  }

  /**
   * Which of the three claims this identity supports — architecture rule 7.
   *
   * "Reaches nothing" and "reaches things nobody has assessed" are different
   * findings with different remediations, and a `0` both collapse into would be
   * acted on wrongly in one of the two cases. The scored fields exist only on the
   * arm that earned them, so a consumer cannot read a number off a row without one.
   */
  function assessmentFor(entries: readonly ExposureEntry[]): ExposureAssessment {
    if (entries.length === 0) {
      return { kind: 'no_paths' };
    }

    const unclassified = unclassifiedPermissionsOf(entries);
    if (!entries.some(isCounted)) {
      return { kind: 'no_classified_permissions', unclassified_permissions: unclassified };
    }

    const weighted = weightedSum(entries);
    const score = saturate(weighted);
    return {
      kind: 'scored',
      exposure_score: score,
      weighted_sum: weighted,
      band: bandFor(score),
      contributions: contributionsOf(entries),
      unclassified_permissions: unclassified,
      highest_sensitivity_reached: highestSensitivityReached(entries),
    };
  }

  function rowFor(graph: IdentityGraph, identity: Identity): ExposureRow {
    const entries = entriesFor(graph, identity);
    return {
      identity_id: identity.id,
      name: identity.name,
      identity_type: identity.type,
      app: identity.app,
      assessment: assessmentFor(entries),
      reachable_permissions: entries.length,
      unclassified_permissions: entries.filter((entry) => !isCounted(entry)).length,
      ownership: deps.ownership.context(identity.id),
    };
  }

  /**
   * A filter on a score cannot match a row that has not got one.
   *
   * `band`, `minScore` and `maxScore` therefore exclude both unscored arms rather
   * than treating them as zero — which is the same argument the three-armed union
   * exists for, applied to the query side so the table and the type agree.
   */
  function matches(row: ExposureRow, query: ExposureQuery): boolean {
    if (query.identityType !== undefined && row.identity_type !== query.identityType) {
      return false;
    }
    if (row.assessment.kind === 'no_paths' && query.includeNoPaths !== true) {
      return false;
    }

    const scoreFiltered =
      query.band !== undefined || query.minScore !== undefined || query.maxScore !== undefined;
    if (!scoreFiltered) {
      return true;
    }
    if (row.assessment.kind !== 'scored') {
      return false;
    }
    if (query.band !== undefined && row.assessment.band !== query.band) {
      return false;
    }
    if (query.minScore !== undefined && row.assessment.exposure_score < query.minScore) {
      return false;
    }
    return !(query.maxScore !== undefined && row.assessment.exposure_score > query.maxScore);
  }

  /**
   * Widest footprint first, ordered on `weighted_sum` rather than on the score.
   *
   * Saturation compresses the top — at `S = 6` every footprint reads 99 — so
   * sorting on the published 0-100 would leave the most exposed identities in an
   * arbitrary order exactly where the ordering matters most (research §5).
   */
  function compareRows(left: ExposureRow, right: ExposureRow): number {
    const byArm = ASSESSMENT_ORDER[left.assessment.kind] - ASSESSMENT_ORDER[right.assessment.kind];
    if (byArm !== 0) {
      return byArm;
    }
    if (left.assessment.kind === 'scored' && right.assessment.kind === 'scored') {
      const bySum = right.assessment.weighted_sum - left.assessment.weighted_sum;
      if (bySum !== 0) {
        return bySum;
      }
    }
    const byUnclassified = right.unclassified_permissions - left.unclassified_permissions;
    return byUnclassified !== 0 ? byUnclassified : left.identity_id.localeCompare(right.identity_id);
  }

  /**
   * §7's gate metric, measured over the whole catalogue.
   *
   * Research §3.2 found the joinable fraction of provider classification data to be
   * zero, so this is not one indicator among four — it is the precondition for the
   * score meaning anything. The denominator is the catalogue rather than today's
   * reachable subset because the catalogue is the vocabulary every future score
   * will be computed against, and a figure that improves when an identity is
   * deleted would be the wrong-direction metric `orphaned-identity-research.md`
   * §5.2 warns about.
   */
  function completeness(graph: IdentityGraph): ClassificationCompleteness {
    const total = graph.dataset.permissions.length;
    const unclassified = graph.unclassifiedPermissions.size;
    return {
      classified: total - unclassified,
      unclassified,
      total,
      ratio: total === 0 ? 1 : (total - unclassified) / total,
    };
  }

  function bandCounts(rows: readonly ExposureRow[]): readonly ExposureBandCount[] {
    return Object.freeze(
      EXPOSURE_BAND_FLOORS.map(
        ({ band, floor }): ExposureBandCount => ({
          band,
          floor,
          count: rows.filter(
            (row) => row.assessment.kind === 'scored' && row.assessment.band === band,
          ).length,
        }),
      ),
    );
  }

  return {
    list(query = {}) {
      const graph = deps.graphSource.graph();
      const rows = population(graph, query.app)
        .map((identity) => rowFor(graph, identity))
        .filter((row) => matches(row, query));
      return Object.freeze([...rows].sort(compareRows));
    },

    profile(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }

      const entries = entriesFor(graph, identity);
      const profile: ExposureProfile = {
        identity_id: identity.id,
        name: identity.name,
        identity_type: identity.type,
        app: identity.app,
        assessment: assessmentFor(entries),
        exposure_set: {
          total_permissions: entries.length,
          counted: entries.filter(isCounted).length,
          unclassified: entries.filter((entry) => !isCounted(entry)).length,
          entries,
        },
        rings: ringsOf(entries),
        ownership: deps.ownership.context(identity.id),
        staleness: {
          based_on_access_discovery_snapshot: accessSnapshot().graph_snapshot_at,
          // The moment this object was built, and explicitly not evidence of
          // freshness — the field above is. Both are published so the difference
          // between "when we looked" and "when the facts are from" is visible.
          computed_at: deps.clock.now().toISOString(),
        },
      };
      return { ok: true, profile };
    },

    summary(query = {}) {
      const graph = deps.graphSource.graph();
      const scanned = population(graph, query.app).map((identity) => rowFor(graph, identity));
      const listed = scanned.filter((row) => matches(row, query));

      return {
        scored: listed.filter((row) => row.assessment.kind === 'scored').length,
        no_paths: scanned.filter((row) => row.assessment.kind === 'no_paths').length,
        no_classified_permissions: listed.filter(
          (row) => row.assessment.kind === 'no_classified_permissions',
        ).length,
        identities_scanned: scanned.length,
        classification_completeness: completeness(graph),
        band_counts: bandCounts(listed),
        snapshot: accessSnapshot(),
      };
    },
  };
}
