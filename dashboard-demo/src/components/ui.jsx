import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Icons (inline SVG helpers)
export function Icon({ name, size = 16, color = 'currentColor' }) {
  const icons = {
    home: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    network: <><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v3M5 16l4-2M19 16l-4-2"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    tree: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    bot: <><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></>,
    server: <><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
    gitBranch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    alertTriangle: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    sparkles: <><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75L19 15z"/></>,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || null}
    </svg>
  );
}

// Access type badge
export function AccessBadge({ type }) {
  const map = {
    Direct: 'badge-direct',
    Indirect: 'badge-indirect',
    Shadow: 'badge-hop',
    Hop: 'badge-hop', // legacy compat
  };
  return <span className={`badge ${map[type] || 'badge-direct'}`}>{type}</span>;
}

// Severity badge
export function SeverityBadge({ band }) {
  const map = {
    Catastrophic: 'badge-catastrophic',
    Unacceptable: 'badge-unacceptable',
    Undesirable: 'badge-undesirable',
    Acceptable: 'badge-acceptable',
    Desirable: 'badge-desirable',
    Critical: 'badge-critical',
    High: 'badge-high',
    Medium: 'badge-medium',
    Low: 'badge-low',
  };
  return <span className={`badge ${map[band] || ''}`}>{band}</span>;
}

// Identity type chip
export function TypeChip({ type }) {
  const labels = { human: 'Human', service: 'Service' };
  return <span className={`type-chip type-chip-${type}`}>{labels[type] || type}</span>;
}

// Status chip
export function StatusChip({ status }) {
  return (
    <span className={`status-chip status-${status}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

// Risk color by score
export function riskColor(score) {
  if (score >= 80) return 'var(--color-catastrophic)';
  if (score >= 60) return 'var(--color-unacceptable)';
  if (score >= 40) return 'var(--color-undesirable)';
  if (score >= 20) return 'var(--color-acceptable)';
  return 'var(--color-desirable)';
}

export function bandColor(band) {
  const map = {
    Catastrophic: 'var(--color-catastrophic)',
    Unacceptable: 'var(--color-unacceptable)',
    Undesirable: 'var(--color-undesirable)',
    Acceptable: 'var(--color-acceptable)',
    Desirable: 'var(--color-desirable)',
    Critical: 'var(--color-catastrophic)',
    High: 'var(--color-unacceptable)',
    Medium: 'var(--color-undesirable)',
    Low: 'var(--color-acceptable)',
  };
  return map[band] || 'var(--text-tertiary)';
}

// Donut SVG
export function DonutChart({ direct, indirect, hop, size = 110, strokeWidth = 12 }) {
  const total = direct + indirect + hop;
  if (total === 0) return null;
  const r = size * 0.38;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pDirect = direct / total;
  const pIndirect = indirect / total;
  const pHop = hop / total;
  const gap = 0.02;
  const dLen = Math.max(0, pDirect * circ - gap * circ);
  const iLen = Math.max(0, pIndirect * circ - gap * circ);
  const hLen = Math.max(0, pHop * circ - gap * circ);
  const dOff = 0;
  const iOff = -(pDirect * circ);
  const hOff = -(pDirect * circ) - (pIndirect * circ);

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-subtle)" strokeWidth={strokeWidth} />
      {dLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-direct)" strokeWidth={strokeWidth} strokeDasharray={`${dLen} ${circ}`} strokeDashoffset={dOff} />}
      {iLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-indirect)" strokeWidth={strokeWidth} strokeDasharray={`${iLen} ${circ}`} strokeDashoffset={iOff} />}
      {hLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-hop)" strokeWidth={strokeWidth} strokeDasharray={`${hLen} ${circ}`} strokeDashoffset={hOff} />}
    </svg>
  );
}

/** Generic multi-segment donut. segments: [{ value, color }] */
export function SegmentDonut({ segments, size = 104, strokeWidth = 10 }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  if (total === 0) return null;
  const r = size * 0.365;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = 0.015;
  let offset = 0;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-subtle)" strokeWidth={strokeWidth} />
      {segments.filter(seg => seg.value > 0).map((seg, i) => {
        const len = Math.max(0, (seg.value / total) * circ - gap * circ);
        const dashOffset = -offset;
        offset += (seg.value / total) * circ;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${len} ${circ}`}
            strokeDashoffset={dashOffset}
          />
        );
      })}
    </svg>
  );
}

// Completion ring
export function CompletionRing({ pct, size = 80, color = 'var(--color-desirable)', trackColor = 'var(--surface-subtle)', strokeWidth }) {
  const sw = strokeWidth ?? Math.max(8, size * 0.1);
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// Risk arc — semi-circle gauge
export function RiskArc({ score, size = 140, color, trackColor = 'var(--uno-grey-150)', strokeWidth = 10 }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size * 0.52;
  const circ = Math.PI * r;
  const fill = Math.max(0, Math.min(100, score)) / 100 * circ;
  const stroke = color || riskColor(score);
  const startX = cx - r;
  const endX = cx + r;
  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${fill} ${circ}`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

/** Radar / spider chart — hexagonal blast-radius style. */
export function RadarChart({
  axes,
  series,
  size = 240,
  levels = 4,
}) {
  const n = axes.length;
  if (!n) return null;

  const pad = 36;
  const plot = size - pad * 2;
  const cx = size / 2;
  const cy = size / 2;
  const radius = plot * 0.42;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const pointAt = (i, t) => {
    const a = startAngle + i * angleStep;
    return {
      x: cx + Math.cos(a) * radius * t,
      y: cy + Math.sin(a) * radius * t,
    };
  };

  const ringPoints = (t) =>
    Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, t);
      return `${p.x},${p.y}`;
    }).join(' ');

  const seriesPath = (values) => values.map((v, i) => {
    const p = pointAt(i, Math.max(0, Math.min(1, v)));
    return `${p.x},${p.y}`;
  }).join(' ');

  const labelPos = (i) => {
    const a = startAngle + i * angleStep;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let x = cx + cos * radius * 1.34;
    let y = cy + sin * radius * 1.34;
    x = Math.max(8, Math.min(size - 8, x));
    y = Math.max(10, Math.min(size - 8, y));
    let anchor = 'middle';
    if (cos < -0.4) anchor = 'end';
    else if (cos > 0.4) anchor = 'start';
    return { x, y, anchor };
  };

  return (
    <svg width="100%" height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', overflow: 'visible' }}>
      <circle cx={cx} cy={cy} r={radius} fill="var(--uno-grey-100)" opacity="0.55" />
      {Array.from({ length: levels }, (_, li) => {
        const t = (li + 1) / levels;
        return (
          <polygon
            key={`ring-${li}`}
            points={ringPoints(t)}
            fill="none"
            stroke="var(--uno-grey-200)"
            strokeWidth="1"
          />
        );
      })}

      {axes.map((axis, i) => {
        const tip = pointAt(i, 1);
        return (
          <line
            key={axis.key || axis.label}
            x1={cx}
            y1={cy}
            x2={tip.x}
            y2={tip.y}
            stroke="var(--uno-grey-300)"
            strokeWidth="1"
          />
        );
      })}

      {series.map((s, si) => (
        <g key={s.name || si}>
          <polygon
            points={seriesPath(s.values)}
            fill={s.color}
            fillOpacity={s.fillOpacity ?? 0.15}
            stroke={s.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {s.values.map((v, i) => {
            const p = pointAt(i, Math.max(0, Math.min(1, v)));
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="3"
                fill={s.color}
                stroke="#fff"
                strokeWidth="1.5"
              />
            );
          })}
        </g>
      ))}

      {axes.map((axis, i) => {
        const p = labelPos(i);
        const lines = axis.lines || [axis.label];
        return (
          <text
            key={`label-${axis.key || i}`}
            x={p.x}
            y={p.y - ((lines.length - 1) * 5)}
            textAnchor={p.anchor}
            style={{ fontSize: 10, fontWeight: 700, fill: 'var(--text-secondary)' }}
          >
            {lines.map((line, li) => (
              <tspan key={li} x={p.x} dy={li === 0 ? 0 : 11}>{line}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

/** Stepped funnel chart — bars with slope connectors; per-step colors supported. */
export function StepFunnel({
  steps,
  activeIndex = 0,
  onSelect,
  height = 132,
  color = 'var(--uno-blue-500)',
  colW = 64,
  barW = 22,
}) {
  const n = steps.length;
  if (!n) return null;

  const max = Math.max(...steps.map(s => s.value), 1);
  const labelLinesMax = Math.max(...steps.map(s => (s.lines || [s.shortLabel || s.label]).length), 1);
  const topPad = 28 + labelLinesMax * 13 + 22;
  const bottomPad = 14;
  const plotH = height - topPad - bottomPad;
  const width = colW * n;
  const uid = `funnel-${steps.map(s => s.key || s.label).join('-')}`;

  const bars = steps.map((s, i) => {
    const h = Math.max(12, (s.value / max) * plotH);
    const x = i * colW + (colW - barW) / 2;
    const y = topPad + (plotH - h);
    const c = s.color || color;
    const lines = s.lines || String(s.shortLabel || s.label).split('\n');
    return { ...s, i, h, x, y, cx: x + barW / 2, c, lines };
  });

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block' }}
      >
        <defs>
          {bars.map(bar => (
            <g key={`defs-${bar.key || bar.i}`}>
              <pattern
                id={`${uid}-stripe-${bar.i}`}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="2.5" height="6" fill={bar.c} opacity="0.32" />
              </pattern>
              <linearGradient id={`${uid}-solid-${bar.i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={bar.c} stopOpacity="1" />
                <stop offset="100%" stopColor={bar.c} stopOpacity="0.72" />
              </linearGradient>
              <linearGradient id={`${uid}-col-${bar.i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={bar.c} stopOpacity="0.14" />
                <stop offset="100%" stopColor={bar.c} stopOpacity="0.02" />
              </linearGradient>
            </g>
          ))}
        </defs>

        {[0.25, 0.5, 0.75, 1].map(t => {
          const y = topPad + plotH * (1 - t);
          return (
            <line key={t} x1={0} x2={width} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
          );
        })}

        {bars.slice(0, -1).map((a, i) => {
          const b = bars[i + 1];
          return (
            <polygon
              key={`slope-${i}`}
              points={`${a.x + barW},${a.y} ${b.x},${b.y} ${b.x},${topPad + plotH} ${a.x + barW},${topPad + plotH}`}
              fill={a.c}
              opacity="0.08"
            />
          );
        })}

        {bars.map(bar => {
          const active = bar.i === activeIndex;
          const prev = bar.i > 0 ? bars[bar.i - 1] : null;
          const conversion = prev ? Math.round((bar.value / Math.max(prev.value, 1)) * 100) : 100;
          const drop = prev ? conversion - 100 : 0;
          const valueY = 14 + bar.lines.length * 13;
          return (
            <g
              key={bar.key || bar.label}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={e => {
                e.stopPropagation();
                onSelect?.(bar.i);
              }}
            >
              {active && (
                <rect
                  x={bar.i * colW + 4}
                  y={0}
                  width={colW - 8}
                  height={height}
                  rx="10"
                  fill={`url(#${uid}-col-${bar.i})`}
                />
              )}
              {bar.lines.map((line, li) => (
                <text
                  key={li}
                  x={bar.cx}
                  y={14 + li * 13}
                  textAnchor="middle"
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    fill: active ? bar.c : 'var(--text-secondary)',
                  }}
                >
                  {line}
                </text>
              ))}
              <text
                x={bar.cx}
                y={valueY + 4}
                textAnchor="middle"
                style={{
                  fontSize: 17,
                  fontWeight: 800,
                  fill: active ? bar.c : 'var(--text-primary)',
                }}
              >
                {bar.value}
              </text>
              <rect
                x={bar.x}
                y={bar.y}
                width={barW}
                height={bar.h}
                rx="5"
                fill={active ? `url(#${uid}-solid-${bar.i})` : `url(#${uid}-stripe-${bar.i})`}
              />
              {active && prev && (
                <g>
                  <rect
                    x={Math.max(4, bar.cx - 62)}
                    y={Math.max(valueY + 8, bar.y - 26)}
                    width="124"
                    height="20"
                    rx="10"
                    fill="var(--surface)"
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={bar.cx}
                    y={Math.max(valueY + 8, bar.y - 26) + 13.5}
                    textAnchor="middle"
                    style={{ fontSize: 10, fontWeight: 600, fill: 'var(--text-secondary)' }}
                  >
                    {conversion}% keep · {drop}% drop
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Slice a list for table pagination. */
export function paginateRows(items, page, pageSize = 10) {
  const list = Array.isArray(items) ? items : [];
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page || 1), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: list.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total: list.length,
  };
}

/** Previous / next pager for data tables. Hidden when only one page. */
export function TablePager({ page, pageCount, onPageChange, total, noun = 'rows' }) {
  if (!pageCount || pageCount <= 1) return null;
  return (
    <div className="table-pager" role="navigation" aria-label="Table pagination">
      <button
        type="button"
        className="table-pager-btn"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        Previous
      </button>
      <span className="table-pager-label">
        Page {page} of {pageCount}
        {typeof total === 'number' ? ` · ${total} ${noun}` : ''}
      </span>
      <button
        type="button"
        className="table-pager-btn"
        disabled={page >= pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
      >
        Next
      </button>
    </div>
  );
}

// Panel overlay
export function SlidePanel({ title, subtitle, onClose, children, size = 'default' }) {
  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className={`slide-panel${size === 'wide' ? ' slide-panel--wide' : ''}`}>
        <div className="panel-header">
          <div className="panel-header-copy">
            <div className="panel-title">{title}</div>
            {subtitle && <div className="panel-subtitle">{subtitle}</div>}
          </div>
          <button type="button" className="panel-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </>
  );
}

// Hop chain display
export function HopChain({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="hop-chain">
      {steps.map((s, i) => {
        const to = s.to || s.displayTo || s.from;
        const from = s.from || s.displayFrom;
        return (
          <div key={i} className="hop-step">
            <div className="hop-step-line">
              <div className="hop-step-index">{s.step || i + 1}</div>
              {i < steps.length - 1 && <div className="hop-step-connector" />}
            </div>
            <div className="hop-step-content">
              <div className="hop-step-label" title={to}>{to}</div>
              {from && s.to && (
                <div className="hop-step-from">from <span title={from}>{from}</span></div>
              )}
              <div className="hop-step-mechanism">{s.mechanism}</div>
              <div className="hop-step-meta">
                {s.api && <span className="hop-step-api">{s.api}</span>}
                {s.resourceArn && (
                  <span className="hop-step-api" title={s.resourceArn}>{s.resourceArn}</span>
                )}
                {s.resourceName && !s.resourceArn && (
                  <span className="hop-step-api" title={s.resourceName}>{s.resourceName}</span>
                )}
                {s.timestamp && <span className="hop-step-time">{s.timestamp}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Tree node
export function TreeNode({ node, onSelect, parent = null, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children?.length > 0;
  const typeIcon = { human: 'user', service: 'server', system: 'shield' };
  const statusColor = node.status === 'departed' ? 'var(--color-unacceptable)' : node.status === 'orphaned' ? 'var(--color-hop)' : 'var(--text-primary)';

  return (
    <div className="tree-node">
      <div className="tree-node-content">
        <button
          type="button"
          className="tree-node-toggle"
          aria-label={hasChildren ? (open ? 'Collapse' : 'Expand') : 'Leaf'}
          onClick={e => {
            e.stopPropagation();
            if (hasChildren) setOpen(v => !v);
          }}
        >
          {hasChildren
            ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} color="var(--text-tertiary)" />
            : <span style={{ width: 12 }} />}
        </button>
        <button
          type="button"
          className="tree-node-main"
          onClick={() => onSelect?.({
            ...node,
            depth,
            parentId: parent?.id || null,
            parentName: parent?.name || null,
          })}
        >
          <Icon name={typeIcon[node.type] || 'user'} size={13} color={statusColor} />
          <span style={{ color: statusColor, fontWeight: node.status === 'orphaned' || node.status === 'departed' ? 600 : 400 }}>
            {node.name}
          </span>
          {(node.status === 'orphaned' || node.status === 'departed') && (
            <span className={`badge badge-${node.status === 'orphaned' ? 'hop' : 'unacceptable'}`} style={{ fontSize: 10, padding: '1px 5px' }}>
              {node.status}
            </span>
          )}
        </button>
      </div>
      {open && hasChildren && (
        <div className="tree-children">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              parent={node}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Tile exit link
export function TileExit({ label, onClick }) {
  return (
    <button className="tile-exit" onClick={e => { e.stopPropagation(); onClick(); }}>
      {label} <Icon name="arrowRight" size={12} />
    </button>
  );
}
