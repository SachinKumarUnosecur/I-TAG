import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { chainToneColors, color } from '../theme/colors';

const NODE_W = 248;
const LINE_H = 14;
const NAME_Y = 22;
const DETAIL_START_Y = 40;
const PAD_BOTTOM = 14;
const COL_GAP = 300;
const ROW_GAP = 18;
const PAD_X = 48;
const PAD_Y = 48;
const TOGGLE_R = 12;
const CARD_STAGGER_MS = 10;

const CHAIN_COLORS = chainToneColors;

function shortLabel(text, max = 26) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function nodeHeight(lineCount) {
  return DETAIL_START_Y + Math.max(lineCount, 1) * LINE_H + PAD_BOTTOM;
}

/**
 * Tone for a resource leaf's colored accent/glow. Accepts both the legacy mock vocabulary
 * (`critical|high|medium`) and the live engine's `ExposureSetEntry.sensitivity`
 * (`sensitive|not_sensitive|unclassified`, `core/src/domain/exposure.ts`) — the displayed
 * `Sensitivity:` value itself is always the caller's real word, never remapped.
 */
function sensitivityTone(sensitivity) {
  if (sensitivity === 'critical' || sensitivity === 'high' || sensitivity === 'sensitive') return 'compromised';
  if (sensitivity === 'medium' || sensitivity === 'unclassified') return 'departed';
  return 'service';
}

function cardMeta(node) {
  if (node.role === 'center' || node.mapRole === 'identity') {
    const tone = node.type === 'service' || node.isNhi ? 'service' : 'human';
    return {
      tone,
      accent: CHAIN_COLORS[tone].accent,
      lines: [
        { type: 'Type', value: node.typeLabel || (node.isNhi || node.type === 'service' ? 'NHI' : 'User') },
        { type: 'Categories', value: String(node.categoryCount ?? '—') },
        { type: 'Resources', value: String(node.resourceCount ?? '—') },
      ],
    };
  }

  if (node.role === 'hub') {
    const tone = node.kind === 'attachment' ? 'service' : 'no-originator';
    return {
      tone,
      accent: CHAIN_COLORS[tone]?.accent || CHAIN_COLORS.default.accent,
      lines: [
        { type: 'Category', value: node.name },
        { type: 'Kind', value: node.kind === 'attachment' ? 'Attachment' : 'Resource' },
        { type: 'Linked', value: String(node.count ?? node.children?.length ?? 0) },
      ],
    };
  }

  // Leaf resource / attachment
  if (node.isAttachment || node.mapRole === 'attachment') {
    return {
      tone: 'service',
      accent: CHAIN_COLORS.service.accent,
      lines: [
        { type: 'Category', value: node.category || 'Attachment' },
        { type: 'Mechanism', value: node.mechanism || node.accessLabel || '—' },
        { type: 'Cloud', value: node.cloudProvider || '—' },
      ],
    };
  }

  const tone = sensitivityTone(node.sensitivity);
  return {
    tone,
    accent: CHAIN_COLORS[tone]?.accent || CHAIN_COLORS.service.accent,
    lines: [
      { type: 'Category', value: node.category || 'Resource' },
      { type: 'Access', value: node.accessLabel || node.accessType || '—' },
      { type: 'Sensitivity', value: node.sensitivity || '—' },
      { type: 'Hops', value: String(node.hopCount ?? 0) },
    ],
  };
}

function curvePath(x1, y1, h1, x2, y2, h2) {
  const sx = x1 + NODE_W;
  const sy = y1 + h1 / 2;
  const tx = x2;
  const ty = y2 + h2 / 2;
  const mx = (sx + tx) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
}

/**
 * Left-to-right tree: identity → category hubs → resources.
 * Same card chrome / fit behavior as DelegationGraph.
 */
function layoutResourceTree(model, expanded) {
  if (!model?.center) {
    return { nodes: [], links: [], width: 400, height: 320 };
  }

  const rings = model.rings || model.branches || [];
  const resourceCount = rings.reduce((s, r) => s + (r.children?.length || 0), 0);

  const root = {
    ...model.center,
    role: 'center',
    mapRole: 'identity',
    categoryCount: rings.filter(r => r.kind !== 'attachment').length,
    resourceCount,
    children: rings.map(ring => ({
      id: ring.id,
      name: ring.label,
      role: 'hub',
      kind: ring.kind,
      category: ring.category || ring.label,
      count: ring.count,
      children: (ring.children || []).map(child => ({
        ...child,
        role: 'leaf',
        parentHubId: ring.id,
      })),
    })),
  };

  const nodes = [];
  const links = [];

  function measure(node, depth) {
    const meta = cardMeta(node);
    const h = nodeHeight(meta.lines.length);
    const isOpen = depth === 0 || expanded.has(node.id);
    const kids = isOpen ? (node.children || []) : [];
    if (!kids.length) {
      return { h, leafSpan: h };
    }
    let span = 0;
    const childLayouts = kids.map(k => {
      const m = measure(k, depth + 1);
      span += m.leafSpan;
      return m;
    });
    span += ROW_GAP * (kids.length - 1);
    return { h, leafSpan: Math.max(h, span), childLayouts, kids };
  }

  function place(node, depth, top, measured) {
    const meta = cardMeta(node);
    const h = measured.h;
    const x = PAD_X + depth * COL_GAP;
    const y = top + (measured.leafSpan - h) / 2;
    const placed = {
      ...node,
      meta,
      nodeH: h,
      x,
      y,
      depth,
      hasChildren: (node.children || []).length > 0,
    };
    nodes.push(placed);

    const isOpen = depth === 0 || expanded.has(node.id);
    if (!isOpen || !measured.kids?.length) return placed;

    let childTop = top;
    measured.kids.forEach((child, i) => {
      const cm = measured.childLayouts[i];
      const childPlaced = place(child, depth + 1, childTop, cm);
      links.push({
        id: `${placed.id}->${childPlaced.id}`,
        source: placed,
        target: childPlaced,
        tone: childPlaced.meta.tone,
      });
      childTop += cm.leafSpan + ROW_GAP;
    });
    return placed;
  }

  const rootMeasure = measure(root, 0);
  place(root, 0, PAD_Y, rootMeasure);

  const maxX = nodes.reduce((m, n) => Math.max(m, n.x + NODE_W), 0);
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.nodeH), 0);

  return {
    nodes,
    links,
    width: maxX + PAD_X,
    height: maxY + PAD_Y,
  };
}

export default function ResourceMapGraph({
  model,
  selectedIds = [],
  onSelect,
  maxHopLimit = null,
  onMaxHopLimitChange,
}) {
  const wrapRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const gridId = `${uid}-grid`;
  const bgId = `${uid}-bg`;
  const softId = `${uid}-soft`;

  const [size, setSize] = useState({ w: 960, h: 560 });
  const [transform, setTransform] = useState({ x: 40, y: 20, k: 1 });
  const transformRef = useRef(transform);
  const dragRef = useRef(null);
  const [panning, setPanning] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  const dataMaxHop = model?.maxHop ?? 0;
  const sliderValue = maxHopLimit == null ? dataMaxHop : maxHopLimit;

  // Expand all category hubs by default when model changes
  useEffect(() => {
    const rings = model?.rings || model?.branches || [];
    setExpanded(new Set(rings.map(r => r.id)));
    setTransform({ x: 40, y: 20, k: 1 });
  }, [model?.center?.id, model?.itemCount, maxHopLimit]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setSize({ w: width, h: 560 });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current?.querySelector('.dc-graph-canvas');
    if (!el) return undefined;
    const onWheelNative = (e) => {
      e.preventDefault();
      setTransform(t => {
        const next = {
          ...t,
          k: Math.min(1.8, Math.max(0.45, +(t.k + (e.deltaY > 0 ? -0.08 : 0.08)).toFixed(2))),
        };
        transformRef.current = next;
        return next;
      });
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const layout = useMemo(
    () => layoutResourceTree(model, expanded),
    [model, expanded],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const arrowIds = useMemo(() => Object.fromEntries(
    Object.keys(CHAIN_COLORS).map(t => [t, `${uid}-arrow-${t}`]),
  ), [uid]);

  // Auto-fit when layout size changes
  useEffect(() => {
    if (!layout.width || !layout.height) return;
    const pad = 36;
    const contentW = Math.max(layout.width, 1);
    const contentH = Math.max(layout.height, 1);
    const viewW = Math.max(size.w - pad * 2, 120);
    const viewH = Math.max(size.h - pad * 2, 120);
    const k = Math.min(1.2, Math.max(0.4, Math.min(viewW / contentW, viewH / contentH)));
    const next = {
      k: +k.toFixed(2),
      x: pad + (viewW - contentW * k) / 2,
      y: pad + (viewH - contentH * k) / 2,
    };
    transformRef.current = next;
    setTransform(next);
  }, [layout.width, layout.height, size.w, size.h, model?.center?.id, maxHopLimit]);

  function fitToView() {
    const pad = 36;
    const contentW = Math.max(layout.width || 1, 1);
    const contentH = Math.max(layout.height || 1, 1);
    const viewW = Math.max(size.w - pad * 2, 120);
    const viewH = Math.max(size.h - pad * 2, 120);
    const k = Math.min(1.35, Math.max(0.35, Math.min(viewW / contentW, viewH / contentH)));
    const next = {
      k: +k.toFixed(2),
      x: pad + (viewW - contentW * k) / 2,
      y: pad + (viewH - contentH * k) / 2,
    };
    transformRef.current = next;
    setTransform(next);
  }

  function setZoom(nextK) {
    const k = Math.min(1.8, Math.max(0.45, +Number(nextK).toFixed(2)));
    const next = { ...transformRef.current, k };
    transformRef.current = next;
    setTransform(next);
  }

  function toggleHub(id, e) {
    e?.stopPropagation?.();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.dc-card') || e.target.closest('.dc-node-toggle')) return;
    dragRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origX: transformRef.current.x,
      origY: transformRef.current.y,
    };
    setPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag || drag.kind !== 'pan') return;
    const next = {
      ...transformRef.current,
      x: drag.origX + (e.clientX - drag.startX),
      y: drag.origY + (e.clientY - drag.startY),
    };
    transformRef.current = next;
    setTransform(next);
  }

  function onPointerUp(e) {
    dragRef.current = null;
    setPanning(false);
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }

  if (!model) return null;

  return (
    <div className="dc-graph rm-dc-graph" ref={wrapRef}>
      <div className="dc-graph-chrome">
        <div className="dc-graph-toolbar" aria-label="Graph controls">
          <div className="dc-tool-group">
            <button type="button" className="dc-zoom-btn" onClick={() => setZoom(transform.k + 0.1)} aria-label="Zoom in">+</button>
            <span className="dc-zoom-label">{Math.round(transform.k * 100)}%</span>
            <button type="button" className="dc-zoom-btn" onClick={() => setZoom(transform.k - 0.1)} aria-label="Zoom out">−</button>
          </div>
          <span className="dc-toolbar-sep" aria-hidden="true" />
          <button type="button" className="dc-zoom-btn dc-zoom-btn--wide" onClick={fitToView}>
            Fit
          </button>
        </div>

        {dataMaxHop > 0 && typeof onMaxHopLimitChange === 'function' && (
          <div className="rm-hop-slider rm-hop-slider--chrome">
            <label htmlFor={`${uid}-hops`}>
              Reachability
              <strong>
                {' '}
                {sliderValue === 0 ? 'direct' : `≤ ${sliderValue} hop${sliderValue === 1 ? '' : 's'}`}
              </strong>
            </label>
            <input
              id={`${uid}-hops`}
              type="range"
              min={0}
              max={dataMaxHop}
              step={1}
              value={sliderValue}
              onChange={e => onMaxHopLimitChange(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div
        className={`dc-graph-canvas${panning ? ' is-panning' : ''}`}
        style={{ height: size.h }}
      >
        <svg
          className="dc-graph-svg"
          width="100%"
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label="Resource reachability map"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <pattern id={gridId} width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1.1" fill={color['blue.200']} opacity="0.55" />
            </pattern>
            <linearGradient id={bgId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color['blue.50']} />
              <stop offset="55%" stopColor={color['grey.100']} />
              <stop offset="100%" stopColor={color['teal.100']} />
            </linearGradient>
            {Object.entries(CHAIN_COLORS).map(([tone, colors]) => (
              <marker
                key={tone}
                id={arrowIds[tone]}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="8"
                markerHeight="8"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M0 1L9 5L0 9z" fill={colors.arrow} />
              </marker>
            ))}
            <linearGradient id={`${uid}-card-human`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['blue.50']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-service`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['teal.100']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-compromised`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['red.50']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-departed`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['yellow.75']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-hub`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['grey.150']} />
            </linearGradient>
            <filter id={softId} x="-40%" y="-50%" width="180%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor={CHAIN_COLORS.human.glow} />
            </filter>
            <filter id={`${uid}-glow-risk`} x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={CHAIN_COLORS.compromised.glow} />
            </filter>
            <filter id={`${uid}-glow-departed`} x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={CHAIN_COLORS.departed.glow} />
            </filter>
          </defs>

          <rect width={size.w} height={size.h} fill={`url(#${bgId})`} />
          <rect width={size.w} height={size.h} fill={`url(#${gridId})`} opacity="0.9" />

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            <g className="dc-graph-links">
              {layout.links.map(link => {
                const s = link.source;
                const t = link.target;
                const tone = link.tone && CHAIN_COLORS[link.tone] ? link.tone : 'default';
                const colors = CHAIN_COLORS[tone] || CHAIN_COLORS.default;
                const d = curvePath(s.x, s.y, s.nodeH, t.x, t.y, t.nodeH);
                const hot = ['compromised', 'orphaned', 'departed'].includes(tone);
                return (
                  <g key={link.id} className={`dc-link-group dc-link-group--${tone}`}>
                    <path
                      d={d}
                      className={`dc-graph-link dc-graph-link--${tone}`}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={hot ? 2.8 : 2.2}
                      strokeOpacity={hot ? 0.32 : 0.22}
                    />
                    <path
                      d={d}
                      className={`dc-graph-link-flow dc-graph-link-flow--${tone}`}
                      fill="none"
                      stroke={colors.stroke}
                      strokeWidth={hot ? 2.5 : 1.9}
                      markerEnd={`url(#${arrowIds[tone] || arrowIds.default})`}
                    />
                  </g>
                );
              })}
            </g>

            <g className="dc-graph-nodes">
              {layout.nodes.map((node, index) => {
                const meta = node.meta;
                const h = node.nodeH;
                const active = selectedSet.has(node.id)
                  || (node.role === 'hub' && (node.children || []).some(c => selectedSet.has(c.id)));
                const tone = meta.tone || 'human';
                const fillId = tone === 'service'
                  ? `${uid}-card-service`
                  : tone === 'compromised'
                    ? `${uid}-card-compromised`
                    : tone === 'departed'
                      ? `${uid}-card-departed`
                      : tone === 'no-originator'
                        ? `${uid}-card-hub`
                        : `${uid}-card-human`;
                const glowFilter = tone === 'compromised'
                  ? `url(#${uid}-glow-risk)`
                  : tone === 'departed'
                    ? `url(#${uid}-glow-departed)`
                    : `url(#${softId})`;
                const isOpen = node.role === 'center' || expanded.has(node.id);
                const risky = tone === 'compromised' || tone === 'departed';

                return (
                  <g
                    key={node.id}
                    className={`dc-card dc-card--${tone}${active ? ' is-active' : ''}${node.role === 'center' ? ' is-root' : ''}${risky ? ' is-risk' : ''}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ '--dc-delay': `${Math.min(index, 8) * CARD_STAGGER_MS}ms` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(node);
                    }}
                  >
                    <title>
                      {[
                        node.name,
                        ...meta.lines.map(l => `${l.type}: ${l.value}`),
                        node.nativeName,
                      ].filter(Boolean).join('\n')}
                    </title>
                    <rect
                      width={NODE_W}
                      height={h}
                      rx={16}
                      ry={16}
                      className="dc-card-body"
                      fill={`url(#${fillId})`}
                      filter={glowFilter}
                    />
                    <rect
                      x={0}
                      y={10}
                      width={5}
                      height={Math.max(28, h - 20)}
                      rx={2.5}
                      fill={meta.accent}
                      className="dc-card-accent"
                    />
                    <circle
                      cx={NODE_W - 16}
                      cy={16}
                      r={4}
                      fill={meta.accent}
                      className="dc-card-dot"
                      opacity={0.9}
                    />
                    <text className="dc-card-name" x={16} y={NAME_Y}>
                      {shortLabel(node.name, 26)}
                    </text>
                    {meta.lines.map((line, i) => (
                      <text
                        key={`${line.type}-${i}`}
                        className="dc-card-detail"
                        x={16}
                        y={DETAIL_START_Y + i * LINE_H}
                      >
                        <tspan className="dc-card-detail-type">{line.type}: </tspan>
                        <tspan className="dc-card-detail-value">
                          {shortLabel(line.value, 22)}
                        </tspan>
                      </text>
                    ))}

                    {node.role === 'hub' && node.hasChildren && (
                      <g
                        className={`dc-node-toggle${isOpen ? ' is-open' : ''}`}
                        transform={`translate(${NODE_W + 4}, ${h / 2})`}
                        onClick={e => toggleHub(node.id, e)}
                        role="button"
                        aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
                      >
                        <circle r={TOGGLE_R + 5} className="dc-node-toggle-ring" />
                        <circle r={TOGGLE_R} className="dc-node-toggle-disk" />
                        <text className="dc-node-toggle-mark" textAnchor="middle" dominantBaseline="central">
                          {isOpen ? '−' : '+'}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      <div className="dc-graph-legend" aria-hidden="true">
        <span className="dc-legend-item">
          <i className="dc-legend-swatch dc-legend-swatch--user" /> Identity
        </span>
        <span className="dc-legend-item">
          <i className="dc-legend-swatch dc-legend-swatch--nhi" /> Category / attachment
        </span>
        <span className="dc-legend-item">
          <i className="dc-legend-swatch dc-legend-swatch--compromised" /> Critical / high
        </span>
        <span className="dc-legend-item">
          <i className="dc-legend-swatch dc-legend-swatch--departed" /> Medium
        </span>
        <span className="dc-legend-item rm-legend-hint">
          {model.itemCount} resource{model.itemCount === 1 ? '' : 's'} in view
        </span>
      </div>
    </div>
  );
}
