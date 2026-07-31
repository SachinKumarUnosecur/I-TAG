import type { IdentityDataset } from '../domain/types.js';
import { assembleDataset } from './seed/fragment.js';
import { ACCESS } from './seed/access.js';
import { CATALOG } from './seed/catalog.js';
import { DATA_GAPS } from './seed/data-gaps.js';
import { DIRECTORY } from './seed/directory.js';
import { EXPOSURE } from './seed/exposure.js';
import { FIXTURES } from './seed/fixtures.js';
import { FOOTPRINT } from './seed/footprint.js';
import { GROUPS } from './seed/groups.js';
import { HEADLINE } from './seed/headline.js';
import { LINEAGE } from './seed/lineage.js';
import { REASON_MATRIX } from './seed/reason-matrix.js';
import { SUPPRESSED } from './seed/suppressed.js';
import { TRUE_NEGATIVES } from './seed/true-negatives.js';

/**
 * Static seed dataset — `docs/ITAG.md` §9 Step 1.
 *
 * Held as typed modules rather than a `.json` file (which §4 F1 suggests) so every
 * literal is checked against `IdentityDataset` at compile time. Intent is
 * unchanged: one static dataset, loaded once into memory, no database.
 *
 * **This dataset is the demo.** Every claim made on stage has to be visible here,
 * and every number on screen has to be defensible, so it is calibrated against a
 * pinned clock — `ITAG_NOW=2026-07-31T00:00:00Z` — and every date that a threshold
 * decision depends on carries its day-delta in a comment. Where a scenario is meant
 * to sit near a boundary it sits 1-5 days from it, so "what if it were 89 days" is
 * answerable by pointing at the neighbouring row. Nothing is random.
 *
 * Composed of one module per demo beat (see `seed/fragment.ts` for why), in the
 * order the beats are shown. The correct non-findings come immediately after the
 * headline on purpose: anyone can render red nodes, and §8 is explicit that the
 * rows we deliberately did *not* flag are what a security buyer is evaluating.
 *
 *   directory       people and teams — the ground truth everything else reads
 *   groups          permission containers, two of them holding sensitive access
 *   headline        beat 1  — the Colonial Pipeline pattern, ranked #1
 *   footprint       beats 2, 3, 9a — three live hops, agent-spawned agent, ambiguous
 *   true-negatives  beats 4, 5, 11 — green rows, including one dormant 200 days
 *   data-gaps       beats 6, 8 — unknown is not unowned
 *   suppressed      beat 7  — unowned by design, plus one expired exemption
 *   reason-matrix   beats 9b, 10, 12 — one clean example per reason code, SLA pair
 *   lineage         beats 16, 17, 18 — Midnight Blizzard, fan-out 34, generation 5
 *   access          beats 19, 20, 21 — the resource-mediated hop, and the two it is not
 *   exposure        beats 24-28 — breadth, unclassified access, two routes, nesting
 *   fixtures        beat 14 — depth cap and corrupt lineage, filtered from every view
 *
 * Lineage is stored per app and left unmerged (§4.2). Three chains deliberately
 * cross app boundaries, which is the one question a per-app view cannot answer:
 * each system holds a fragment that looks unremarkable alone, and the finding only
 * appears once the fragments are joined (`graph.crossAppEdges`).
 *
 * Expected state, reason, severity and counted for every curated identity are
 * pinned in `seed.test.ts` and tabulated in `docs/demo-script.md`.
 */
export const SEED_DATASET: IdentityDataset = assembleDataset(CATALOG, [
  DIRECTORY,
  GROUPS,
  HEADLINE,
  FOOTPRINT,
  TRUE_NEGATIVES,
  DATA_GAPS,
  SUPPRESSED,
  REASON_MATRIX,
  LINEAGE,
  ACCESS,
  EXPOSURE,
  FIXTURES,
]);
