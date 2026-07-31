import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Icon, AccessBadge } from './ui';
import { impactGraph } from '../data/mockData';

const nodeColors = {
  origin: '#025DFD',
  hop: '#E72E21',
  compromised: '#F97316',
  reachable: '#CA7F06',
  downstream: '#00B44A',
};

const nodeSize = {
  origin: 18,
  hop: 14,
  compromised: 16,
  reachable: 10,
  downstream: 12,
};

const linkColors = {
  Hop: '#E72E21',
  Indirect: '#CA7F06',
  Direct: '#8D97AE',
};

export default function UnifiedImpact() {
  const svgRef = useRef(null);
  const [simulating, setSimulating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [revokedLinks, setRevokedLinks] = useState(new Set());

  useEffect(() => {
    buildGraph(revokedLinks);
  }, [revokedLinks]);

  function buildGraph(revoked) {
    const container = svgRef.current;
    if (!container) return;
    const W = container.clientWidth || 800;
    const H = container.clientHeight || 500;

    d3.select(container).selectAll('*').remove();

    const svg = d3.select(container)
      .append('svg')
      .attr('width', W)
      .attr('height', H);

    // Defs: arrowheads
    const defs = svg.append('defs');
    ['Hop', 'Indirect', 'Direct'].forEach(type => {
      defs.append('marker')
        .attr('id', `arrow-${type}`)
        .attr('viewBox', '0 -4 8 8')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-4L8,0L0,4')
        .attr('fill', linkColors[type])
        .attr('opacity', 0.8);
    });

    const activeLinks = impactGraph.links.filter(l => !revoked.has(`${l.source}-${l.target}`));
    const activeNodeIds = new Set([...activeLinks.map(l => l.source), ...activeLinks.map(l => l.target), 'jane.doe']);
    const activeNodes = impactGraph.nodes.filter(n => activeNodeIds.has(n.id));

    const sim = d3.forceSimulation(activeNodes)
      .force('link', d3.forceLink(activeLinks).id(d => d.id).distance(100).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-280))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide().radius(d => (nodeSize[d.group] || 10) + 20));

    const linkG = svg.append('g');
    const link = linkG.selectAll('line')
      .data(activeLinks)
      .join('line')
      .attr('stroke', d => linkColors[d.type])
      .attr('stroke-width', d => d.type === 'Hop' ? 2.5 : 1.5)
      .attr('stroke-dasharray', d => d.type === 'Indirect' ? '4,3' : null)
      .attr('opacity', 0.7)
      .attr('marker-end', d => `url(#arrow-${d.type})`);

    // Link labels
    const linkLabel = svg.append('g').selectAll('text')
      .data(activeLinks)
      .join('text')
      .attr('font-size', 9)
      .attr('fill', d => linkColors[d.type])
      .attr('opacity', 0.8)
      .attr('text-anchor', 'middle')
      .text(d => d.mechanism);

    const nodeG = svg.append('g');
    const node = nodeG.selectAll('g')
      .data(activeNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag()
        .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    // Glow effect for origin
    node.filter(d => d.group === 'origin').append('circle')
      .attr('r', d => (nodeSize[d.group] || 10) + 8)
      .attr('fill', 'rgba(99,102,241,0.15)');

    node.append('circle')
      .attr('r', d => nodeSize[d.group] || 10)
      .attr('fill', d => nodeColors[d.group] || '#888')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .attr('opacity', 0.95);

    // Type icon text
    const typeSymbol = { origin: '●', hop: '⬡', compromised: '★', reachable: '◆', downstream: '◉' };
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', d => (nodeSize[d.group] || 10) * 0.9)
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text(d => typeSymbol[d.group] || '·');

    node.append('text')
      .attr('dy', d => (nodeSize[d.group] || 10) + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('font-weight', 600)
      .attr('fill', 'var(--text-primary)')
      .attr('pointer-events', 'none')
      .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label);

    sim.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 5);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => sim.stop();
  }

  const hopLinks = impactGraph.links.filter(l => l.type === 'Hop');

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Unified impact analysis</div>
        <div className="page-subtitle">Systemic blast radius — forward traversal from compromised identity through downstream pivots and resource-mediated hops</div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Simulated origin</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#025DFD' }}>jane.doe</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Hypothetically compromised</div>
        </div>
        <div className="card" style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Reachable nodes</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-hop)' }}>{impactGraph.nodes.length - 1}</div>
        </div>
        <div className="card" style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Hop pivots</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-hop)' }}>{hopLinks.length}</div>
        </div>

        {/* Simulate revoke */}
        <div className="card" style={{ flex: '1 1 200px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Simulate revoke — remove a grant before committing
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hopLinks.map(l => {
              const key = `${l.source}-${l.target}`;
              const isRevoked = revokedLinks.has(key);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <div style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>
                    {String(l.source)} → {String(l.target)}
                  </div>
                  <button className={`btn ${isRevoked ? 'btn-success' : 'btn-danger'}`} style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => {
                      const next = new Set(revokedLinks);
                      isRevoked ? next.delete(key) : next.add(key);
                      setRevokedLinks(next);
                    }}>
                    {isRevoked ? 'Restore' : 'Revoke'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(nodeColors).map(([group, color]) => (
          <div key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            {group}
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <div style={{ width: 20, height: 2, background: 'var(--color-hop)' }} />Hop
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <div style={{ width: 20, height: 1, background: 'var(--color-indirect)', borderTop: '1px dashed var(--color-indirect)' }} />Indirect
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
          <div style={{ width: 20, height: 1.5, background: 'var(--color-direct)' }} />Direct
        </div>
      </div>

      {/* Graph */}
      <div className="graph-container" ref={svgRef} style={{ height: 520 }} />

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
        Drag nodes to explore. Red lines are Hop pivots — resource-mediated privilege escalations not visible in native IAM tools.
        {revokedLinks.size > 0 && <span style={{ color: 'var(--color-desirable)', fontWeight: 600 }}> {revokedLinks.size} grant(s) simulated as revoked.</span>}
      </div>
    </div>
  );
}
