import { useMemo, useState } from 'react';
import ResourceMapGraph from './ResourceMapGraph';

/**
 * Identity Exposure Map — "Map" view.
 *
 * Renders the identity → category → resource card-tree using `ResourceMapGraph` — the exact
 * same graph engine/chrome `DelegationChain` uses (`.dc-graph`: pan/zoom, expand/collapse
 * hubs, curved arrowed links, gradient cards with an accent bar + dot, bottom legend). This
 * file is only the adapter: it turns the live `ExposureProfile.exposure_set.entries[]` —
 * the same data the "Table" view already renders, no mock shape, no new fetch — into the
 * `{ center, rings, itemCount, maxHop }` model that graph expects.
 *
 * `category` is derived client-side from the permission id's prefix (`"admin:platform"` →
 * `"ADMIN"`); `Access` is `scored_route.path_type` (engine vocabulary: direct/indirect/hop —
 * never the old mock's "Shadow" wording); `Sensitivity` is the entry's real
 * `sensitive|not_sensitive|unclassified` word, never remapped to Risk's severity scale.
 */

const ACCESS_LABEL = {
  direct: 'Direct',
  indirect: 'Indirect',
  hop: 'Hop (role assumption)',
};

/** `"admin:platform"` → `"admin"`; permissions with no `:` are their own category. */
function categoryOf(permission) {
  const idx = permission.indexOf(':');
  return idx === -1 ? permission : permission.slice(0, idx);
}

function buildResourceMapModel(profile, hopLimit) {
  const entries = profile.exposureSet.entries || [];
  const visible = hopLimit == null
    ? entries
    : entries.filter((e) => (e.min_hop_distance || 0) <= hopLimit);

  const byCategory = new Map();
  visible.forEach((entry) => {
    const key = categoryOf(entry.permission);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push({
      id: `res:${entry.permission}`,
      name: entry.permission,
      category: key.toUpperCase(),
      accessLabel: ACCESS_LABEL[entry.scored_route?.path_type] || 'Unknown',
      sensitivity: entry.sensitivity,
      hopCount: entry.min_hop_distance || 0,
      mapRole: 'access',
    });
  });

  const rings = [...byCategory.entries()]
    .map(([key, children]) => ({
      id: `ring:${key}`,
      label: key.toUpperCase(),
      kind: 'access',
      category: key.toUpperCase(),
      count: children.length,
      children: children.sort((a, b) => a.hopCount - b.hopCount),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const center = {
    id: profile.id,
    name: profile.name,
    type: profile.identityType,
    isNhi: profile.identityType !== 'human',
    typeLabel: profile.typeLabel,
  };

  const itemCount = rings.reduce((sum, r) => sum + r.children.length, 0);
  // Unfiltered so the slider's own max doesn't shrink as the user drags it down.
  const maxHop = entries.reduce((m, e) => Math.max(m, e.min_hop_distance || 0), 0);

  return { center, rings, branches: rings, itemCount, maxHop };
}

export default function ExposureGraphMap({ profile }) {
  // `null` = no cap applied yet; `ResourceMapGraph` shows the full `maxHop` range by default.
  const [hopLimit, setHopLimit] = useState(null);

  const model = useMemo(() => buildResourceMapModel(profile, hopLimit), [profile, hopLimit]);

  if (model.rings.length === 0) {
    return <div className="egm-empty">No reachable permissions to map for this identity.</div>;
  }

  return (
    <ResourceMapGraph
      model={model}
      maxHopLimit={hopLimit}
      onMaxHopLimitChange={setHopLimit}
    />
  );
}
