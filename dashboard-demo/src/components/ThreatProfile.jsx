import { useEffect, useMemo, useState } from 'react';
import { Icon, SeverityBadge, TablePager, paginateRows } from './ui';
import { fetchMitreFindings, listPtraceStages } from '../data/riskProfileApi';

const FINDINGS_PAGE_SIZE = 10;

const mitreFindings = fetchMitreFindings();
const PTRACE_STAGES = listPtraceStages();
const PTRACE_ORDER = PTRACE_STAGES.map(s => s.key);

/** Presentation chrome for stages (colors / coaching copy) — labels come from API. */
const PTRACE_UI = {
  P: {
    color: 'var(--uno-green-700)',
    question: 'Is the attacker mapping accounts, groups, or trust relationships before acting?',
  },
  T: {
    color: 'var(--uno-orange-500)',
    question: 'Is a trust relationship being abused rather than a credential?',
  },
  R: {
    color: 'var(--uno-red-500)',
    question: 'Can this identity get more than it started with?',
  },
  A: {
    color: 'var(--uno-blue-500)',
    question: 'Can someone become this identity?',
  },
  C: {
    color: 'var(--uno-yellow-600)',
    question: 'Can the attacker keep access without being noticed?',
  },
  E: {
    color: 'var(--uno-blue-700)',
    question: 'What can this identity now reach, and what does it enable next?',
  },
};

const PTRACE_META = Object.fromEntries(
  PTRACE_STAGES.map(s => [
    s.key,
    {
      short: s.short,
      full: s.full,
      color: PTRACE_UI[s.key]?.color || 'var(--text-secondary)',
      question: PTRACE_UI[s.key]?.question || '',
      mitreTactics: s.mitreTactics || [],
    },
  ]),
);

const PTRACE_COLOR = Object.fromEntries(
  Object.entries(PTRACE_META).map(([k, v]) => [k, v.color]),
);

/** Default impact × likelihood when a finding only carries a PTRACE stage. */
const PTRACE_DEFAULT_SCORE = {
  P: { impact: 2, likelihood: 3 },
  T: { impact: 3, likelihood: 3 },
  R: { impact: 4, likelihood: 4 },
  A: { impact: 5, likelihood: 3 },
  C: { impact: 4, likelihood: 3 },
  E: { impact: 5, likelihood: 3 },
};

/** Y-axis (top → bottom): Impact high to low */
const IMPACT_ROWS = [
  { rank: 5, label: 'Catastrophic' },
  { rank: 4, label: 'Significant' },
  { rank: 3, label: 'Moderate' },
  { rank: 2, label: 'Low' },
  { rank: 1, label: 'Negligible' },
];

/** X-axis (left → right): Likelihood low to high */
const LIKELIHOOD_COLS = [
  { rank: 1, label: 'Improbable' },
  { rank: 2, label: 'Remote' },
  { rank: 3, label: 'Occasional' },
  { rank: 4, label: 'Probable' },
  { rank: 5, label: 'Frequent' },
];

const CELL_BAND = {
  '1:1': 'desirable', '2:1': 'desirable', '3:1': 'desirable', '4:1': 'desirable', '5:1': 'acceptable',
  '1:2': 'desirable', '2:2': 'acceptable', '3:2': 'acceptable', '4:2': 'undesirable', '5:2': 'undesirable',
  '1:3': 'desirable', '2:3': 'acceptable', '3:3': 'undesirable', '4:3': 'undesirable', '5:3': 'unacceptable',
  '1:4': 'acceptable', '2:4': 'undesirable', '3:4': 'undesirable', '4:4': 'catastrophic', '5:4': 'catastrophic',
  '1:5': 'acceptable', '2:5': 'undesirable', '3:5': 'unacceptable', '4:5': 'catastrophic', '5:5': 'catastrophic',
};

/** Classic risk-matrix palette (green → red), black numerals. */
const BAND_META = {
  desirable: { label: 'Desirable · No Action', bg: '#43a047', text: '#111' },
  acceptable: { label: 'Acceptable · Monitor', bg: '#9ccc65', text: '#111' },
  undesirable: { label: 'Undesirable · Action', bg: '#fdd835', text: '#111' },
  unacceptable: { label: 'Unacceptable · Urgent Action', bg: '#fb8c00', text: '#111' },
  catastrophic: { label: 'Catastrophic · Stop', bg: '#e53935', text: '#111' },
};

function cellBand(impact, likelihood) {
  return CELL_BAND[`${impact}:${likelihood}`] || 'desirable';
}

function clampRank(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(5, Math.max(1, Math.round(v)));
}

/** Normalize a MITRE finding onto the matrix using PTRACE defaults when needed. */
function normalizeFinding(f) {
  const stage = PTRACE_ORDER.includes(f.ptraceCategory) ? f.ptraceCategory : 'P';
  const defaults = PTRACE_DEFAULT_SCORE[stage] || PTRACE_DEFAULT_SCORE.P;
  const impact = clampRank(f.impact, defaults.impact);
  const likelihood = clampRank(f.likelihood, defaults.likelihood);
  return {
    ...f,
    ptraceCategory: stage,
    impact,
    likelihood,
    score: impact * likelihood,
    band: cellBand(impact, likelihood),
  };
}

function RiskHeatmap({ findings, selectedCell, onSelectCell }) {
  const cellIndex = useMemo(() => {
    const map = new Map();
    findings.forEach(f => {
      const key = `${f.impact}:${f.likelihood}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    });
    return map;
  }, [findings]);

  return (
    <div className="tp-heatmap-map">
      <div className="tp-matrix" role="grid" aria-label="Likelihood by Impact risk matrix">
        <div className="tp-matrix-y-title" aria-hidden="true">Impact</div>

        <div className="tp-matrix-ylabels" aria-hidden="true">
          {IMPACT_ROWS.map(i => (
            <div key={`y-${i.rank}`} className="tp-matrix-ylab">
              <span className="tp-matrix-rank">{i.rank}</span>
              <span className="tp-matrix-rank-name">{i.label}</span>
            </div>
          ))}
        </div>

        <div className="tp-matrix-cube">
          {IMPACT_ROWS.flatMap(i => LIKELIHOOD_COLS.map(l => {
            const band = cellBand(i.rank, l.rank);
            const theme = BAND_META[band];
            const key = `${i.rank}:${l.rank}`;
            const list = cellIndex.get(key) || [];
            const count = list.length;
            const active = selectedCell?.impact === i.rank
              && selectedCell?.likelihood === l.rank;
            const stages = [...new Set(list.map(f => f.ptraceCategory))];
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                className={[
                  'tp-matrix-cell',
                  `tp-matrix-cell--${band}`,
                  active ? 'is-active' : '',
                  count ? 'has-findings' : 'is-empty',
                ].filter(Boolean).join(' ')}
                style={{ background: theme.bg, color: theme.text }}
                aria-label={
                  count
                    ? `Impact ${i.label}, likelihood ${l.label}, ${count} findings`
                    : `Impact ${i.label}, likelihood ${l.label}, no findings`
                }
                title={
                  count
                    ? `${count} finding${count === 1 ? '' : 's'}${stages.length ? ` · PTRACE ${stages.join(', ')}` : ''}`
                    : 'No findings in this cell'
                }
                onClick={() => onSelectCell(
                  active ? null : {
                    impact: i.rank,
                    likelihood: l.rank,
                    band,
                    count,
                    stages,
                  },
                )}
              >
                <span className="tp-matrix-cell-count">{count}</span>
              </button>
            );
          }))}
        </div>

        <div className="tp-matrix-xlabels" aria-hidden="true">
          {LIKELIHOOD_COLS.map(l => (
            <div key={`x-${l.rank}`} className="tp-matrix-xlab">
              <span className="tp-matrix-rank">{l.rank}</span>
              <span className="tp-matrix-rank-name">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="tp-matrix-x-title" aria-hidden="true">Likelihood</div>
      </div>

      <div className="tp-heatmap-legend">
        {Object.entries(BAND_META).map(([key, meta]) => (
          <span key={key} className="tp-heatmap-legend-item">
            <i style={{ background: meta.bg }} />
            {meta.label.split(' · ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ThreatProfile() {
  const [selectedCell, setSelectedCell] = useState(null);
  const [search, setSearch] = useState('');
  const [ptraceFilter, setPtraceFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [page, setPage] = useState(1);

  const findings = useMemo(
    () => mitreFindings.map(normalizeFinding),
    [],
  );

  const severities = useMemo(() => {
    const order = ['Critical', 'High', 'Medium', 'Low'];
    const seen = new Set(findings.map(f => f.severity).filter(Boolean));
    return order.filter(s => seen.has(s));
  }, [findings]);

  const ptraceStats = useMemo(() => {
    const counts = Object.fromEntries(PTRACE_ORDER.map(s => [s, 0]));
    findings.forEach(f => { counts[f.ptraceCategory] += 1; });
    return { counts };
  }, [findings]);

  const summary = useMemo(() => {
    let critical = 0;
    const identities = new Set();
    findings.forEach(f => {
      if (f.severity === 'Critical' || f.band === 'catastrophic') critical += 1;
      if (f.identityName) identities.add(f.identityName);
    });
    return {
      findings: findings.length,
      critical,
      identities: identities.size,
    };
  }, [findings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return findings.filter(f => {
      if (selectedCell
        && (f.impact !== selectedCell.impact || f.likelihood !== selectedCell.likelihood)) {
        return false;
      }
      if (ptraceFilter !== 'all' && f.ptraceCategory !== ptraceFilter) return false;
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q)
        || f.technique.toLowerCase().includes(q)
        || f.identityName.toLowerCase().includes(q)
        || f.tactic?.toLowerCase().includes(q)
        || PTRACE_META[f.ptraceCategory]?.short.toLowerCase().includes(q)
        || PTRACE_META[f.ptraceCategory]?.full.toLowerCase().includes(q)
      );
    });
  }, [findings, selectedCell, search, ptraceFilter, severityFilter]);

  useEffect(() => {
    setPage(1);
  }, [selectedCell, search, ptraceFilter, severityFilter]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    filtered,
    page,
    FINDINGS_PAGE_SIZE,
  );

  return (
    <div className="page-content tp-page">
      <header className="tp-hero">
        <div className="tp-hero-copy">
          <h1 className="tp-hero-title">Threat profile</h1>
          <p className="tp-hero-sub">
            Impact × likelihood matrix with PTRACE → MITRE ATT&CK identity mapping
          </p>
        </div>
        <dl className="tp-hero-stats">
          <div>
            <dt>Findings</dt>
            <dd>{summary.findings}</dd>
          </div>
          <div>
            <dt>Critical</dt>
            <dd className="is-hot">{summary.critical}</dd>
          </div>
          <div>
            <dt>Identities</dt>
            <dd>{summary.identities}</dd>
          </div>
        </dl>
      </header>

      <section className="tp-workspace" aria-label="Risk matrix and PTRACE mapping">
        <article className="tp-card tp-card--matrix" aria-labelledby="tp-matrix-title">
          <div className="tp-card-head">
            <div className="tp-card-head-copy">
              <div className="tp-card-title-row">
                <h2 id="tp-matrix-title" className="tp-card-title">Risk matrix</h2>
                <span className="tp-card-kicker">Impact × Likelihood</span>
              </div>
              <p className="tp-card-sub">
                Cell counts are MITRE findings. Click a cell to filter the table.
              </p>
            </div>
            {selectedCell && (
              <div className="tp-card-head-meta">
                <button
                  type="button"
                  className="btn btn-ghost tp-heatmap-clear"
                  onClick={() => setSelectedCell(null)}
                >
                  Clear · I{selectedCell.impact}×L{selectedCell.likelihood}
                </button>
              </div>
            )}
          </div>
          <RiskHeatmap
            findings={findings}
            selectedCell={selectedCell}
            onSelectCell={setSelectedCell}
          />
        </article>

        <aside className="tp-card tp-card--ptrace" aria-labelledby="tp-ptrace-title">
          <div className="tp-card-head">
            <div className="tp-card-head-copy">
              <div className="tp-card-title-row">
                <h3 id="tp-ptrace-title" className="tp-card-title">PTRACE · MITRE</h3>
                <span className="tp-card-kicker">Identity attack chain</span>
              </div>
              <p className="tp-card-sub">
                Stages of identity risk, mapped to ATT&amp;CK tactics.
              </p>
            </div>
          </div>
          <ol className="tp-ptrace-cube">
            {PTRACE_ORDER.map((letter) => {
              const meta = PTRACE_META[letter];
              const count = ptraceStats.counts[letter];
              const tactics = meta.mitreTactics || [];
              return (
                <li key={letter}>
                  <div
                    className={['tp-ptrace-face', count ? '' : 'is-empty'].filter(Boolean).join(' ')}
                    style={{ '--tp-stage': meta.color }}
                    title={meta.full}
                  >
                    <span className="tp-ptrace-face-letter" aria-hidden="true">{letter}</span>
                    <span className="tp-ptrace-face-copy">
                      <span className="tp-ptrace-face-name">{meta.full}</span>
                      {tactics.length > 0 && (
                        <span className="tp-ptrace-mitre-tactics" aria-label="MITRE ATT&CK tactics">
                          {tactics.map(t => (
                            <span key={t} className="tp-ptrace-mitre-tactic">{t}</span>
                          ))}
                        </span>
                      )}
                      {meta.question && (
                        <span className="tp-ptrace-face-q">{meta.question}</span>
                      )}
                    </span>
                    <span className="tp-ptrace-face-count">
                      <b>{count}</b>
                      <small>findings</small>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </aside>
      </section>

      <section className="tp-findings" aria-labelledby="tp-findings-title">
        <div className="tp-findings-head">
          <h2 id="tp-findings-title" className="tp-section-title">Findings</h2>
        </div>

        <div className="rp-panel-toolbar tp-findings-toolbar">
          <label className={`rp-search${search.trim() ? ' is-filled' : ''}`}>
            <Icon name="search" size={14} color="var(--text-tertiary)" />
            <input
              placeholder="Search findings…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search findings"
            />
          </label>
          <label className="tp-filter-select">
            <span className="tp-filter-select-k">PTRACE</span>
            <select
              value={ptraceFilter}
              onChange={e => setPtraceFilter(e.target.value)}
              aria-label="Filter by PTRACE stage"
            >
              <option value="all">All stages</option>
              {PTRACE_ORDER.map(letter => (
                <option key={letter} value={letter}>
                  {PTRACE_META[letter]?.full || PTRACE_META[letter]?.short || letter}
                </option>
              ))}
            </select>
          </label>
          <div className="rp-status-seg" role="group" aria-label="Severity">
            <button
              type="button"
              className={`rp-status-btn${severityFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => setSeverityFilter('all')}
            >
              All
            </button>
            {severities.map(s => (
              <button
                key={s}
                type="button"
                className={`rp-status-btn${severityFilter === s ? ' is-active' : ''}`}
                onClick={() => setSeverityFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="rp-panel-count">
          {[
            selectedCell && `Cell I${selectedCell.impact}×L${selectedCell.likelihood}`,
            selectedCell && BAND_META[selectedCell.band]?.label?.split(' · ')[0],
            `${filtered.length} finding${filtered.length === 1 ? '' : 's'}`,
          ].filter(Boolean).join(' · ')}
        </div>

        <div className="table-wrapper tp-findings-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Technique</th>
                <th>Name</th>
                <th>Tactic</th>
                <th>PTRACE</th>
                <th>Impact</th>
                <th>Likelihood</th>
                <th>Identity</th>
                <th>Severity</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="tp-findings-empty">
                    No findings match filters
                  </td>
                </tr>
              )}
              {pageRows.map(f => {
                const color = PTRACE_COLOR[f.ptraceCategory];
                const stage = PTRACE_META[f.ptraceCategory];
                return (
                  <tr key={f.id}>
                    <td>
                      <a
                        className="tp-tech-link"
                        href={`https://attack.mitre.org/techniques/${f.technique.replace('.', '/')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {f.technique}
                      </a>
                    </td>
                    <td className="tp-findings-name">{f.name}</td>
                    <td><span className="fact-pill">{f.tactic}</span></td>
                    <td>
                      <span className="tp-ptrace-tag" style={{ color }} title={stage?.full}>
                        {f.ptraceCategory} · {stage?.full || stage?.short}
                      </span>
                    </td>
                    <td className="tp-num">{f.impact}</td>
                    <td className="tp-num">{f.likelihood}</td>
                    <td className="tp-findings-id">{f.identityName}</td>
                    <td><SeverityBadge band={f.severity} /></td>
                    <td className="tp-findings-desc">{f.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePager
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          total={filtered.length}
          noun="findings"
        />
      </section>
    </div>
  );
}
