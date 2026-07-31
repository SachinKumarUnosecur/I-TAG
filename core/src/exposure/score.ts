import type { AccessPath, AccessPathType } from '../domain/access.js';
import type {
  ExposureBand,
  ExposureContribution,
  ExposureEntry,
  ExposureRing,
  PermissionSensitivity,
} from '../domain/exposure.js';
import { EXPOSURE_BAND_FLOORS } from '../domain/exposure.js';

/**
 * The exposure algorithm — `docs/identity-exposure-map-research.md` §5, six steps.
 *
 * Pure functions over `readonly AccessPath[]`. No clock, no graph, no traversal:
 * architecture rule 1 is satisfied trivially because Access Discovery has already
 * walked the graph, and this module is forbidden from walking it again. The only
 * thing injected is a classifier for one permission's sensitivity, so the whole
 * file is testable against four hand-built paths and a `Map`.
 *
 * Every constant below is exported and cited. Research §4.3's argument is that a
 * score whose derivation is not published is an assertion rather than an
 * assessment, and that has to be true of the source as well as of the payload —
 * anyone should be able to re-derive `k` from this file without opening another.
 */

// --- Step 2: weights --------------------------------------------------------

/**
 * Two weights, not PRD §4.2 step 3's four, because two is what the engine knows.
 *
 * `PermissionRecord` carries one bit. Research §3.2 checked every provider
 * mechanism the PRD proposes to populate a four-tier registry from — Macie profiles
 * buckets, GCP Sensitive Data Protection profiles buckets and containers, Purview
 * labels Data Map assets and database columns — and none of them classifies a
 * capability like `admin:platform`. **There is no join key**, so the missing three
 * tiers would be populated by hand for the demo and by nothing in production.
 *
 * The 10:1 ratio is a calibration choice, not a measurement, and saying so is the
 * condition on which it is allowed to exist (research §5 step 2).
 */
export const SENSITIVE_WEIGHT = 1.0;
export const NOT_SENSITIVE_WEIGHT = 0.1;

// --- Step 3: mechanism multiplier -------------------------------------------

/**
 * Applied to `path_type`, never to `hop_count` — PRD Amendment 4.
 *
 * Step 4 of the PRD combines sensitivity with hop *distance*, reasoning that a
 * hop-mediated route is less visible and less governed than a direct grant. The
 * reasoning is right and the variable is wrong: distance and mechanism are
 * collinear by construction, because a direct path is one edge and an indirect one
 * is two, so multiplying by both counts the same fact twice. Distance is left to
 * the map's geometry, where it is a position rather than a coefficient.
 */
export const HOP_MULTIPLIER = 1.5;
export const BASELINE_MULTIPLIER = 1.0;

// --- Step 5: saturation -----------------------------------------------------

/**
 * `exposure_score = round(100 · (1 − e^(−S / k)))`, and this is `k`.
 *
 * Fixed by a single published anchor: **one sensitive permission reached by a hop,
 * plus three non-sensitive paths, scores 78** — `user-jane`'s footprint and the
 * PRD's own worked-example number. Solving `78 = 100(1 − e^(−1.8/k))` with
 * `S = (1.0 × 1.5) + (3 × 0.1 × 1.0) = 1.8` gives `k = 1.189`.
 *
 * Saturating rather than population-normalized. Dividing by the estate's maximum —
 * the obvious alternative — makes 78 mean something different every time the
 * estate changes, so no identity is comparable to its own value last month. This
 * curve is bounded, monotone, and depends on nothing outside the identity.
 *
 * What it costs, stated plainly: at `S = 6` the score is 99.4, and every larger
 * footprint is indistinguishable at integer resolution. That is why `weighted_sum`
 * ships beside the score and why the landing table sorts on it (research §5).
 */
export const SATURATION_CONSTANT = 1.189;

/**
 * The unit the sum is accumulated in, and the reason it is an integer.
 *
 * Floating-point addition is not associative: `1.5 + 0.1 + 0.1 + 0.1` evaluates to
 * `1.8000000000000003`. Research §4.3 requires the published derivation to
 * reconstruct the published number, and `user-jane`'s score is quoted on stage as
 * `S = 1.8` — a `weighted_sum` of `1.8000000000000003` makes a liar of the slide
 * and of every equality assertion written against it.
 *
 * Every weight and multiplier here is a whole number of hundredths, and so is
 * every product of the two (`100 × 150 / 100 = 150`), so the total is accumulated
 * in exact integer arithmetic and divided into a decimal exactly once, at the end.
 * `weightedSum` therefore returns the nearest double to the true rational total —
 * literally `1.8` — rather than an accumulation of rounding error.
 *
 * What this does **not** buy: re-summing the published `contribution` decimals in
 * double precision still drifts by an ulp or two, because they are doubles. The
 * arithmetic an auditor does by hand is exact; the arithmetic a consumer does in
 * JavaScript needs a tolerance. That is a property of IEEE-754, not something a
 * different accumulation order could fix.
 */
const HUNDREDTHS = 100;

function hundredthsOf(value: number): number {
  return Math.round(value * HUNDREDTHS);
}

// --- Step 1: collapse -------------------------------------------------------

/**
 * Worst-first, so `hop` beats `indirect` beats `direct` when one permission is
 * reached more than one way (PRD §4.2 step 2).
 *
 * Index order is the precedence order — extending the path vocabulary means
 * inserting a member here rather than editing a comparison (architecture rule 3).
 */
export const MECHANISM_PRECEDENCE: readonly AccessPathType[] = Object.freeze([
  'direct',
  'indirect',
  'hop',
]);

function isWorse(candidate: AccessPathType, incumbent: AccessPathType): boolean {
  return MECHANISM_PRECEDENCE.indexOf(candidate) > MECHANISM_PRECEDENCE.indexOf(incumbent);
}

/** Resolves one permission's classification — injected so this file needs no graph. */
export type SensitivityLookup = (permission: string) => PermissionSensitivity;

/**
 * Step 1 — group `paths` by permission and keep what the score and the map need.
 *
 * The route that *scores* is retained whole rather than flattened, because
 * `AccessPath` is already a discriminated union carrying exactly the right fields
 * per mechanism and copying them out would reintroduce the nullable columns that
 * union exists to remove. The routes that lose are retained as a count and a type
 * list — §8's second open question is whether collapsing hides that closing the
 * scored route would not fully remediate, and the honest answer is one field
 * rather than a UI feature (research §4.5).
 *
 * Sorted by permission id so two runs over the same identity are byte-identical.
 */
export function collapseToExposureSet(
  paths: readonly AccessPath[],
  sensitivityOf: SensitivityLookup,
): readonly ExposureEntry[] {
  const scoredRoutes = new Map<string, AccessPath>();
  const shortest = new Map<string, number>();
  const routeCounts = new Map<string, number>();
  const routeTypes = new Map<string, Set<AccessPathType>>();

  for (const path of paths) {
    const incumbent = scoredRoutes.get(path.permission);
    if (incumbent === undefined || isWorse(path.path_type, incumbent.path_type)) {
      scoredRoutes.set(path.permission, path);
    }
    shortest.set(
      path.permission,
      Math.min(shortest.get(path.permission) ?? path.hop_count, path.hop_count),
    );
    routeCounts.set(path.permission, (routeCounts.get(path.permission) ?? 0) + 1);
    const types = routeTypes.get(path.permission) ?? new Set<AccessPathType>();
    types.add(path.path_type);
    routeTypes.set(path.permission, types);
  }

  const entries: ExposureEntry[] = [];
  for (const [permission, scoredRoute] of scoredRoutes) {
    entries.push({
      permission,
      sensitivity: sensitivityOf(permission),
      scored_route: scoredRoute,
      min_hop_distance: shortest.get(permission) ?? scoredRoute.hop_count,
      route_count: routeCounts.get(permission) ?? 1,
      route_types: Object.freeze([...(routeTypes.get(permission) ?? [])].sort()),
    });
  }

  return Object.freeze(entries.sort((left, right) => left.permission.localeCompare(right.permission)));
}

// --- Steps 2-4: weight, multiply, sum ---------------------------------------

/**
 * `unclassified` is excluded here and nowhere else, so there is one place to look
 * when a reviewer asks why a permission is missing from the breakdown.
 *
 * Architecture rule 9 and PRD Amendment 3: absence of assessment is not a finding
 * and is not a tier. PRD §5 L129's "treated as Medium, not Low" is overruled —
 * defaulting it makes the score rise when the registry degrades rather than when
 * the estate does, which is a movement no reviewer can act on.
 */
export function isCounted(entry: ExposureEntry): boolean {
  return entry.sensitivity !== 'unclassified';
}

export function weightOf(sensitivity: PermissionSensitivity): number {
  return sensitivity === 'sensitive' ? SENSITIVE_WEIGHT : NOT_SENSITIVE_WEIGHT;
}

export function mechanismMultiplierOf(pathType: AccessPathType): number {
  return pathType === 'hop' ? HOP_MULTIPLIER : BASELINE_MULTIPLIER;
}

/**
 * Steps 2-4 in one pass, emitting the derivation rather than only the total.
 *
 * Descending by contribution, so `contributions[0]` is the row PRD §6.4's summary
 * card exists to deliver — "83 % of this score is one hop path". Ties break on
 * permission id so the ordering is total and the demo is reproducible.
 *
 * `share_of_score` is a share of `weighted_sum`, not of the 0-100 score. The
 * saturation is applied once to the total and cannot be attributed per permission;
 * splitting it would be arithmetic fiction dressed as a breakdown.
 */
export function contributionsOf(
  entries: readonly ExposureEntry[],
): readonly ExposureContribution[] {
  const counted = entries.filter(isCounted);
  const totalHundredths = counted.reduce(
    (running, entry) => running + contributionHundredths(entry),
    0,
  );

  const contributions = counted.map((entry): ExposureContribution => {
    const hundredths = contributionHundredths(entry);
    return {
      permission: entry.permission,
      weight: weightOf(entry.sensitivity),
      mechanism_multiplier: mechanismMultiplierOf(entry.scored_route.path_type),
      contribution: hundredths / HUNDREDTHS,
      share_of_score: totalHundredths === 0 ? 0 : hundredths / totalHundredths,
    };
  });

  return Object.freeze(
    contributions.sort(
      (left, right) =>
        right.contribution - left.contribution || left.permission.localeCompare(right.permission),
    ),
  );
}

function contributionHundredths(entry: ExposureEntry): number {
  const weight = hundredthsOf(weightOf(entry.sensitivity));
  const multiplier = hundredthsOf(mechanismMultiplierOf(entry.scored_route.path_type));
  return (weight * multiplier) / HUNDREDTHS;
}

/**
 * Step 4 — `S = Σ wᵢ · mᵢ`, unbounded and monotone in both the number and the
 * sensitivity of what is reachable.
 *
 * Summed from the entries rather than from the contributions so the two are
 * independently derived and the test asserting they agree is a real test.
 */
export function weightedSum(entries: readonly ExposureEntry[]): number {
  const total = entries
    .filter(isCounted)
    .reduce((running, entry) => running + contributionHundredths(entry), 0);
  return total / HUNDREDTHS;
}

// --- Step 5: saturate -------------------------------------------------------

export function saturate(weighted: number): number {
  return Math.round(100 * (1 - Math.exp(-weighted / SATURATION_CONSTANT)));
}

/**
 * The chip a reviewer filters on. First floor cleared wins, walking the frozen
 * list from the top, so a fifth band is an inserted row and never a new branch.
 */
export function bandFor(score: number): ExposureBand {
  for (const { band, floor } of EXPOSURE_BAND_FLOORS) {
    if (score >= floor) {
      return band;
    }
  }
  // Unreachable while the list ends at floor 0, and typed rather than asserted so
  // removing that row is a compile error somewhere rather than a runtime surprise.
  return 'minimal';
}

// --- Step 6: rings ----------------------------------------------------------

/**
 * One ring per *distinct* distance present, not PRD §4.2 step 6's 1 / 2 / 3+.
 *
 * Research §4.1 measured the seed: `direct` was always distance 1, `indirect`
 * always 2, and only `hop` went further, so three buckets would have redrawn the
 * path-type column as geometry and folded the estate's six-edge chain into the
 * same ring as its three-edge one. A permission is placed at its *scored* route's
 * distance, because that is the route the badge and the contribution describe;
 * `min_hop_distance` carries the shorter one for anything that needs it.
 */
export function ringsOf(entries: readonly ExposureEntry[]): readonly ExposureRing[] {
  const byDistance = new Map<number, ExposureEntry[]>();
  for (const entry of entries) {
    const ring = byDistance.get(entry.scored_route.hop_count) ?? [];
    ring.push(entry);
    byDistance.set(entry.scored_route.hop_count, ring);
  }

  return Object.freeze(
    [...byDistance.entries()]
      .sort(([left], [right]) => left - right)
      .map(([hop_distance, permissions]): ExposureRing => ({
        hop_distance,
        permissions: Object.freeze(permissions),
      })),
  );
}

/**
 * PRD §6.3's *Highest Sensitivity Reached*, reduced to the bit the model carries.
 *
 * With a binary flag there is no "highest" among sensitive permissions, so the one
 * named is the largest contributor — which, since every sensitive permission
 * weighs 1.0, is a sensitive permission reached by a hop if one exists. That is
 * also the right answer for the column's purpose: it is the row a reviewer should
 * click first. Null when nothing sensitive is reachable, which is one unambiguous
 * claim rather than two collapsed ones.
 */
export function highestSensitivityReached(entries: readonly ExposureEntry[]): string | null {
  const sensitive = entries.filter((entry) => entry.sensitivity === 'sensitive');
  if (sensitive.length === 0) {
    return null;
  }
  const ranked = [...sensitive].sort(
    (left, right) =>
      contributionHundredths(right) - contributionHundredths(left) ||
      left.permission.localeCompare(right.permission),
  );
  return ranked[0]?.permission ?? null;
}

/** Named and sorted, never merely counted — research §4.3's fourth published field. */
export function unclassifiedPermissionsOf(entries: readonly ExposureEntry[]): readonly string[] {
  return Object.freeze(
    entries
      .filter((entry) => entry.sensitivity === 'unclassified')
      .map((entry) => entry.permission)
      .sort(),
  );
}
