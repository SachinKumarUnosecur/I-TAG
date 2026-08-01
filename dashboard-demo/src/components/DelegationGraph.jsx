import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { chainToneColors, chainToneCssVars, color } from '../theme/colors';

const NODE_W = 248;
const LINE_H = 14;
const NAME_Y = 22;
const DETAIL_START_Y = 40;
const PAD_BOTTOM = 14;
const COL_GAP = 300;
const ROW_GAP = 128;
const PAD_X = 72;
const PAD_Y = 56;
const TOGGLE_R = 12;
/** Card entrance stagger — keep short so the graph feels snappy. */
const CARD_STAGGER_MS = 10;
const CARD_STAGGER_MAX_INDEX = 8;

function formatDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const CHAIN_COLORS = chainToneColors;

const TONE_ACCENT_VAR = Object.fromEntries(
  Object.entries(chainToneCssVars).map(([tone, v]) => [tone, v.accent]),
);

function scopeKindLabel(category) {
  if (category === 'cloud') return 'Cloud';
  if (category === 'idp') return 'Identity';
  if (category === 'hr') return 'HR';
  return 'Connector';
}

function typeLabel(node) {
  if (node.isNoOriginator) {
    return `${node.name || 'Connector'} · ${scopeKindLabel(node.scopeCategory)}`;
  }
  if (node.isAttachment || node.mapRole === 'attachment') {
    return node.resourceKind === 'Attached to' ? 'Attached to' : 'Attachment';
  }
  if (node.isResource || node.mapRole === 'access') {
    return node.resourceKind || 'Resource';
  }
  if (node.resourceKind && node.resourceKind !== 'User' && node.resourceKind !== 'NHI') {
    return node.resourceKind;
  }
  if (node.chainTone === 'departed' || node.departed || node.status === 'departed') {
    return 'Departed user';
  }
  if (
    node.type === 'service'
    && (node.status === 'orphaned' || node.chainTone === 'orphaned')
  ) {
    return 'Orphaned NHI';
  }
  if (node.compromised) return 'Compromised user';
  // Compromised NHI: post-integration only (pre-integration / no-log → plain NHI)
  if (
    node.type === 'service'
    && !node.preIntegration
    && (node.compromisedNhiNoPath || (
      node.chainTone === 'compromised'
      && !node.postCompromise
      && !node.compromisedPivot
      && originatorLabel(node) === 'No originator'
    ))
  ) {
    return 'Compromised NHI';
  }
  if (
    node.compromisedPivot
    || (node.type === 'service' && node.postCompromise && !node.compromised)
  ) {
    return 'Compromise-path NHI';
  }
  if (node.chainTone === 'compromised' || node.postCompromise) return 'After compromise';
  if (node.chainTone === 'after-departure') return 'After departure';
  if (node.type === 'service') return 'NHI';
  return 'User';
}

function originatorLabel(node) {
  if (node.isNoOriginator) return '—';
  const raw = String(node.originator || '').trim().toLowerCase();
  if (
    !raw
    || raw === '—'
    || raw === 'no originator'
    || raw === 'unknown'
    || raw === 'unknown (pre-audit)'
    || raw === 'unknown (pre-integration)'
    || raw === 'okta directory'
    || raw === 'okta.admin'
  ) {
    return 'No originator';
  }
  // firstKnownRoot with a retained human name still shows that name
  return String(node.originator).trim();
}

function detailLines(node) {
  // Scope hub (AWS / Okta / …): Integrated · Linked only
  // Resource map: Attachment / Access cards (not permission lists)
  // Identity cards: Type · Originator · Created · Linked
  let lines;

  if (node.isNoOriginator) {
    lines = [
      {
        type: 'Integrated',
        value: formatDate(node.integratedAt) || formatDate(node.createdAt) || '—',
      },
      { type: 'Linked', value: String(node.childCount || 0) },
    ];
  } else if (node.isAttachment || node.mapRole === 'attachment') {
    lines = [
      { type: 'Type', value: typeLabel(node) },
      {
        type: node.resourceKind === 'Attached to' ? 'Owner' : 'Mechanism',
        value: node.mechanism || node.accessLabel || '—',
      },
      {
        type: 'Cloud',
        value: node.cloudProvider || '—',
      },
      { type: 'Linked', value: String(node.childCount || 0) },
    ];
  } else if (node.isResource || node.mapRole === 'access') {
    lines = [
      { type: 'Type', value: typeLabel(node) },
      {
        type: 'Access',
        value: node.accessLabel
          || (node.accessTypes || []).join(' · ')
          || '—',
      },
      {
        type: 'Cloud',
        value: node.cloudProvider || '—',
      },
      {
        type: 'Sensitivity',
        value: node.sensitivity || '—',
      },
    ];
  } else {
    lines = [
      { type: 'Type', value: typeLabel(node) },
      { type: 'Originator', value: originatorLabel(node) },
      {
        type: 'Created',
        value: formatDate(node.createdAt) || formatDate(node.integratedAt) || '—',
      },
      { type: 'Linked', value: String(node.childCount || 0) },
    ];
  }

  if (node.isNoOriginator) {
    return {
      tone: 'no-originator',
      accent: TONE_ACCENT_VAR['no-originator'],
      accentSolid: CHAIN_COLORS['no-originator'].accent,
      lines,
    };
  }

  const tone = node.status === 'orphaned' || node.chainTone === 'orphaned'
    ? 'orphaned'
    : node.chainTone && node.chainTone !== 'default'
      ? node.chainTone
      : node.type === 'service'
        ? 'service'
        : 'human';

  return {
    tone,
    accent: TONE_ACCENT_VAR[tone] || TONE_ACCENT_VAR.human,
    accentSolid: (CHAIN_COLORS[tone] || CHAIN_COLORS.human).accent,
    lines,
  };
}

function nodeHeight(lineCount) {
  return Math.max(72, NAME_Y + 8 + lineCount * LINE_H + PAD_BOTTOM);
}

function nodeKey(id, parentKey) {
  return parentKey ? `${parentKey}/${id}` : id;
}

function pruneTree(node, expanded, parentKey = '') {
  const key = nodeKey(node.id, parentKey);
  const kids = node.children || [];
  const isExpanded = expanded.has(key);
  return {
    ...node,
    nodeKey: key,
    childCount: kids.length,
    children: isExpanded
      ? kids.map(child => pruneTree(child, expanded, key))
      : [],
  };
}

function buildLayout(tree) {
  const root = d3.hierarchy(tree);
  d3.tree().nodeSize([ROW_GAP, COL_GAP])(root);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  root.each(d => {
    minX = Math.min(minX, d.y);
    maxX = Math.max(maxX, d.y);
    minY = Math.min(minY, d.x);
    maxY = Math.max(maxY, d.x);
  });

  const nodes = root.descendants().map(d => {
    const base = {
      id: d.data.id,
      nodeKey: d.data.nodeKey || d.data.id,
      name: d.data.name,
      type: d.data.type,
      status: d.data.status || 'active',
      depth: d.depth,
      childCount: d.data.childCount || 0,
      hasChildren: (d.data.childCount || 0) > 0,
      compromised: Boolean(d.data.compromised),
      departed: Boolean(d.data.departed),
      postCompromise: Boolean(d.data.postCompromise),
      postDeparture: Boolean(d.data.postDeparture),
      compromisedPivot: Boolean(d.data.compromisedPivot),
      compromisedNhiNoPath: Boolean(d.data.compromisedNhiNoPath),
      preIntegration: Boolean(d.data.preIntegration),
      isBucket: Boolean(d.data.isBucket),
      isNoOriginator: Boolean(d.data.isNoOriginator),
      isForestRoot: Boolean(d.data.isForestRoot),
      isResource: Boolean(d.data.isResource),
      firstKnownRoot: Boolean(d.data.firstKnownRoot),
      scopeCategory: d.data.scopeCategory || null,
      connectorId: d.data.connectorId || null,
      appName: d.data.appName || null,
      createdAt: d.data.createdAt || null,
      integratedAt: d.data.integratedAt || null,
      cloudProvider: d.data.cloudProvider || null,
      sensitivity: d.data.sensitivity || null,
      resourceKind: d.data.resourceKind || null,
      pathIds: d.data.pathIds || [],
      chainTone: d.data.chainTone || 'default',
      originator: d.data.originator || '—',
      delegator: d.data.delegator || d.data.originator || '—',
      compromiseSource: d.data.compromiseSource || null,
      departureSource: d.data.departureSource || null,
      baseX: d.y - minX + PAD_X,
      baseY: d.x - minY + PAD_Y,
      data: d.data,
      parentId: d.parent?.data?.id || null,
      parentName: d.parent?.data?.name || null,
      parentIsForest: Boolean(d.parent?.data?.isForestRoot),
    };
    const meta = detailLines(base);
    return { ...base, meta, nodeH: nodeHeight(meta.lines.length) };
  }).filter(n => !n.isForestRoot);

  const maxNodeH = nodes.reduce((m, n) => Math.max(m, n.nodeH), 72);
  const width = Math.max(920, maxX - minX + PAD_X * 2 + NODE_W + 36);
  const height = Math.max(420, maxY - minY + PAD_Y * 2 + maxNodeH);

  const links = root.links()
    .filter(l => !l.source.data.isForestRoot)
    .map((l, i) => {
      // Edge color matches the child card tone (same rules as detailLines).
      const childBase = {
        ...l.target.data,
        childCount: l.target.data.childCount || (l.target.data.children || []).length,
      };
      const tone = detailLines(childBase).tone || 'default';
      return {
        id: `${l.source.data.nodeKey}-${l.target.data.nodeKey}-${i}`,
        sourceKey: l.source.data.nodeKey,
        targetKey: l.target.data.nodeKey,
        chainTone: tone,
      };
    });

  return { nodes, links, width, height };
}

function curvePath(sx, sy, sh, tx, ty, th) {
  const x0 = sx + NODE_W;
  const y0 = sy + sh / 2;
  const x1 = tx;
  const y1 = ty + th / 2;
  const dx = Math.max(40, (x1 - x0) * 0.42);
  return `M${x0},${y0} C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`;
}

function shortLabel(value, max = 18) {
  const text = String(value || '—');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function subtreeHasRisk(n) {
  return (n.chainTone && n.chainTone !== 'default')
    || n.status === 'orphaned'
    || n.compromised
    || n.departed
    || n.postCompromise
    || n.postDeparture
    || n.compromisedPivot
    || (n.children || []).some(subtreeHasRisk);
}

/**
 * Default expand policy:
 * - Forest always open (peer roots visible)
 * - No-originator hub stays collapsed (biggest clutter source)
 * - Risk roots deep-open; quiet roots stay collapsed
 * - Search focus (`expandRoots`): open each match and its risk branches
 */
function defaultExpandedKeys(tree, { expandRoots = false } = {}) {
  const keys = new Set();
  if (!tree) return keys;

  function walk(node, parentKey = '') {
    const key = nodeKey(node.id, parentKey);
    keys.add(key);
    if (node.isBucket) return;
    const kids = node.children || [];

    if (node.isForestRoot) {
      kids.forEach(child => {
        if (child.isNoOriginator) {
          // Hub card visible via forest expand; children stay behind +
          return;
        }
        if (expandRoots || subtreeHasRisk(child)) walk(child, key);
      });
      return;
    }

    if (node.isNoOriginator) {
      kids.forEach(child => {
        if (subtreeHasRisk(child)) walk(child, key);
      });
      return;
    }

    kids.forEach(child => {
      if (subtreeHasRisk(child)) walk(child, key);
    });
  }

  walk(tree);
  return keys;
}

export default function DelegationGraph({
  tree,
  onSelect,
  selectedId,
  selectedIds,
  expandRoots = false,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const dragRef = useRef(null);
  const transformRef = useRef({ x: 40, y: 20, k: 1 });

  const [expanded, setExpanded] = useState(() => defaultExpandedKeys(tree, { expandRoots }));
  const [transform, setTransform] = useState({ x: 40, y: 20, k: 1 });
  const [offsets, setOffsets] = useState({});
  const [panning, setPanning] = useState(false);
  const [draggingNode, setDraggingNode] = useState(false);
  const [size, setSize] = useState({ w: 960, h: 520 });

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    setExpanded(defaultExpandedKeys(tree, { expandRoots }));
    setOffsets({});
    const next = { x: 40, y: 20, k: 1 };
    transformRef.current = next;
    setTransform(next);
  }, [tree, expandRoots]);

  useEffect(() => {
    if (!wrapRef.current) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setSize({ w: width, h: 520 });
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

  const visibleTree = useMemo(() => pruneTree(tree, expanded), [tree, expanded]);
  const layout = useMemo(() => buildLayout(visibleTree), [visibleTree]);

  const positioned = useMemo(() => (
    layout.nodes.map(n => {
      const o = offsets[n.nodeKey] || { x: 0, y: 0 };
      return { ...n, x: n.baseX + o.x, y: n.baseY + o.y };
    })
  ), [layout.nodes, offsets]);

  const posByKey = useMemo(
    () => Object.fromEntries(positioned.map(n => [n.nodeKey, n])),
    [positioned],
  );

  const arrowIds = {
    default: `dc-arrow-${uid}`,
    human: `dc-arrow-human-${uid}`,
    service: `dc-arrow-service-${uid}`,
    compromised: `dc-arrow-compromised-${uid}`,
    orphaned: `dc-arrow-orphaned-${uid}`,
    departed: `dc-arrow-departed-${uid}`,
    'after-departure': `dc-arrow-after-${uid}`,
    'no-originator': `dc-arrow-hub-${uid}`,
  };
  const gridId = `dc-grid-${uid}`;
  const softId = `dc-soft-${uid}`;
  const bgId = `dc-bg-${uid}`;

  function clientToWorld(clientX, clientY) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    const t = transformRef.current;
    return {
      x: (local.x - t.x) / t.k,
      y: (local.y - t.y) / t.k,
    };
  }

  function toggleNode(key, event) {
    event.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onCanvasPointerDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.dc-card, .dc-node-toggle')) return;
    e.preventDefault();
    window.getSelection?.()?.removeAllRanges?.();
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

  function onNodePointerDown(node, e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    window.getSelection?.()?.removeAllRanges?.();
    const world = clientToWorld(e.clientX, e.clientY);
    const o = offsets[node.nodeKey] || { x: 0, y: 0 };
    dragRef.current = {
      kind: 'node',
      key: node.nodeKey,
      baseX: node.baseX,
      baseY: node.baseY,
      grabX: world.x - (node.baseX + o.x),
      grabY: world.y - (node.baseY + o.y),
      moved: false,
      selectPayload: {
        ...node.data,
        depth: node.depth,
        parentId: node.parentId,
        parentName: node.parentName,
      },
    };
    setDraggingNode(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const next = {
        ...transformRef.current,
        x: drag.origX + (e.clientX - drag.startX),
        y: drag.origY + (e.clientY - drag.startY),
      };
      transformRef.current = next;
      setTransform(next);
      return;
    }

    if (drag.kind === 'node') {
      const world = clientToWorld(e.clientX, e.clientY);
      const ox = world.x - drag.grabX - drag.baseX;
      const oy = world.y - drag.grabY - drag.baseY;
      if (Math.abs(ox) + Math.abs(oy) > 3) drag.moved = true;
      setOffsets(prev => ({ ...prev, [drag.key]: { x: ox, y: oy } }));
    }
  }

  function onPointerUp(e) {
    const drag = dragRef.current;
    dragRef.current = null;
    setPanning(false);
    setDraggingNode(false);
    if (drag?.kind === 'node' && !drag.moved && drag.selectPayload) {
      onSelect?.(drag.selectPayload);
    }
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  }

  function setZoom(nextK) {
    const k = Math.min(1.8, Math.max(0.45, +Number(nextK).toFixed(2)));
    const next = { ...transformRef.current, k };
    transformRef.current = next;
    setTransform(next);
  }

  function fitToView() {
    setExpanded(defaultExpandedKeys(tree, { expandRoots }));
    setOffsets({});
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

  return (
    <div className="dc-graph" ref={wrapRef}>
      <div className="dc-graph-chrome">
        <div className="dc-graph-toolbar" aria-label="Graph controls">
          <div className="dc-tool-group">
            <button
              type="button"
              className="dc-zoom-btn"
              onClick={() => setZoom(transform.k + 0.1)}
              aria-label="Zoom in"
            >
              +
            </button>
            <span className="dc-zoom-label">{Math.round(transform.k * 100)}%</span>
            <button
              type="button"
              className="dc-zoom-btn"
              onClick={() => setZoom(transform.k - 0.1)}
              aria-label="Zoom out"
            >
              −
            </button>
          </div>
          <span className="dc-toolbar-sep" aria-hidden="true" />
          <button
            type="button"
            className="dc-zoom-btn dc-zoom-btn--wide"
            onClick={fitToView}
            aria-label="Fit graph to view"
          >
            Fit
          </button>
        </div>
      </div>

      <div
        className={`dc-graph-canvas${panning ? ' is-panning' : ''}${draggingNode ? ' is-dragging-node' : ''}`}
        style={{ height: size.h }}
      >
        <svg
          ref={svgRef}
          className="dc-graph-svg"
          width="100%"
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          role="img"
          aria-label="Delegation lineage graph"
          onPointerDown={onCanvasPointerDown}
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
            <linearGradient id={`${uid}-card-orphaned`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['red.50']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-departed`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['yellow.75']} />
            </linearGradient>
            <linearGradient id={`${uid}-card-after`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={color.white} />
              <stop offset="100%" stopColor={color['violet.100']} />
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
            <filter id={`${uid}-glow-after`} x="-60%" y="-60%" width="220%" height="220%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={CHAIN_COLORS['after-departure'].glow} />
            </filter>
          </defs>

          <rect width={size.w} height={size.h} fill={`url(#${bgId})`} />
          <rect width={size.w} height={size.h} fill={`url(#${gridId})`} opacity="0.9" />

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            <g className="dc-graph-links">
              {layout.links.map(link => {
                const s = posByKey[link.sourceKey];
                const t = posByKey[link.targetKey];
                if (!s || !t) return null;
                const tone = (link.chainTone && link.chainTone !== 'default' && CHAIN_COLORS[link.chainTone])
                  ? link.chainTone
                  : t.isNoOriginator
                    ? 'no-originator'
                    : t.type === 'service'
                      ? 'service'
                      : 'human';
                const colors = CHAIN_COLORS[tone] || CHAIN_COLORS.default;
                const d = curvePath(s.x, s.y, s.nodeH || 72, t.x, t.y, t.nodeH || 72);
                const hot = ['compromised', 'orphaned', 'departed', 'after-departure'].includes(tone);
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
              {positioned.map((node, index) => {
                const meta = node.meta || detailLines(node);
                const h = node.nodeH || nodeHeight(meta.lines.length);
                const active = Array.isArray(selectedIds)
                  ? selectedIds.includes(node.id)
                  : selectedId === node.id;
                const isRoot = node.depth === 0 || node.parentIsForest;
                const isOpen = expanded.has(node.nodeKey);
                const tone = meta.tone || 'human';
                const fillId = tone === 'service'
                  ? `${uid}-card-service`
                  : tone === 'compromised'
                    ? `${uid}-card-compromised`
                    : tone === 'orphaned'
                      ? `${uid}-card-orphaned`
                      : tone === 'departed'
                        ? `${uid}-card-departed`
                        : tone === 'after-departure'
                          ? `${uid}-card-after`
                          : tone === 'no-originator'
                            ? `${uid}-card-hub`
                            : `${uid}-card-human`;
                const glowFilter = tone === 'compromised' || tone === 'orphaned'
                  ? `url(#${uid}-glow-risk)`
                  : tone === 'departed'
                    ? `url(#${uid}-glow-departed)`
                    : tone === 'after-departure'
                      ? `url(#${uid}-glow-after)`
                      : `url(#${softId})`;
                const risky = tone === 'compromised' || tone === 'orphaned' || tone === 'departed';
                return (
                  <g
                    key={node.nodeKey}
                    className={`dc-card dc-card--${tone}${active ? ' is-active' : ''}${isRoot ? ' is-root' : ''}${risky ? ' is-risk' : ''}`}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ '--dc-delay': `${Math.min(index, CARD_STAGGER_MAX_INDEX) * CARD_STAGGER_MS}ms` }}
                    onPointerDown={e => onNodePointerDown(node, e)}
                  >
                    <title>
                      {[
                        node.name,
                        ...meta.lines.map(l => `${l.type}: ${l.value}`),
                      ].join('\n')}
                    </title>
                    {risky && (
                      <rect
                        x={-4}
                        y={-4}
                        width={NODE_W + 8}
                        height={h + 8}
                        rx={18}
                        ry={18}
                        className="dc-card-pulse"
                        fill="none"
                        stroke={meta.accentSolid || meta.accent}
                      />
                    )}
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
                      fill={meta.accentSolid || meta.accent}
                      className="dc-card-accent"
                    />
                    <circle
                      cx={NODE_W - 16}
                      cy={16}
                      r={4}
                      fill={meta.accentSolid || meta.accent}
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

                    {node.hasChildren && (
                      <g
                        className={`dc-node-toggle${isOpen ? ' is-open' : ''}`}
                        transform={`translate(${NODE_W + 4}, ${h / 2})`}
                        onPointerDown={e => {
                          e.stopPropagation();
                          toggleNode(node.nodeKey, e);
                        }}
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
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--user" /> User</span>
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--nhi" /> NHI</span>
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--compromised" /> Compromised</span>
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--departed" /> Departed</span>
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--orphaned" /> Orphaned NHI</span>
        <span className="dc-legend-item"><i className="dc-legend-swatch dc-legend-swatch--after" /> After departure</span>
      </div>
    </div>
  );
}
