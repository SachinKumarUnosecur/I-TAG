import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, TablePager, paginateRows } from './ui';
import { useExposureMap } from '../hooks/useExposureMap';

const TABLE_PAGE_SIZE = 10;

const BAND_TONE = {
  extensive: 'extensive',
  substantial: 'substantial',
  limited: 'limited',
  minimal: 'minimal',
};

function appQuery(app) {
  const params = new URLSearchParams();
  if (app) params.set('app', app);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Engine band chip — deliberately not `SeverityBadge` (Risk owns Catastrophic…Desirable). */
function ExposureBandBadge({ assessmentKind, band, label }) {
  if (assessmentKind === 'no_paths') {
    return <span className="em-band em-band--muted">No paths</span>;
  }
  if (assessmentKind === 'no_classified_permissions') {
    return <span className="em-band em-band--warn" title="Reaches permissions, none classified">Unclassified</span>;
  }
  const tone = BAND_TONE[band] || 'muted';
  return <span className={`em-band em-band--${tone}`}>{label}</span>;
}

/**
 * Custom chip (not `ui.jsx`'s `TypeChip`, which hardcodes Human/Service labels only) —
 * `identity_type` has four members and `ai_agent` must render as "AI agent", not "Service".
 */
function IdentityTypeChip({ identityType, label }) {
  return <span className={`type-chip type-chip-${identityType}`}>{label}</span>;
}

function OwnerCell({ ownerDisplay }) {
  const tone = ownerDisplay?.tone || 'muted';
  const text = ownerDisplay?.text || 'Unevaluated';
  return (
    <span className={`ad-owner ad-owner--${tone}`} title={text}>
      {text}
    </span>
  );
}

function SummaryCard({ icon, tone, value, label, footer }) {
  return (
    <div className={`ad-summary-card ad-summary-card--${tone}`}>
      <div className={`ad-summary-icon ad-summary-icon--${tone}`}>
        <Icon name={icon} size={15} />
      </div>
      <div className="ad-summary-body">
        <div className="ad-summary-value">{value}</div>
        <div className="ad-summary-label">{label}</div>
        {footer ? <div className="ad-summary-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * Identity Exposure Map — landing table.
 *
 * Engine owns score / band / completeness (`core/src/exposure/service.ts`); this page owns
 * presentation only. Rows render in the order the engine returned them — sorting by
 * `weighted_sum` within `scored` already happened server-side.
 */
export default function ExposureMap() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const app = searchParams.get('app') || '';
  const { bundle, loading, error, reload, preferMock } = useExposureMap({ app: app || undefined });

  const rows = bundle?.rows || [];
  const apps = bundle?.apps || [];
  const summary = bundle?.summary || null;

  // Guard against a stale ?app= that no longer exists in the fetched population.
  useEffect(() => {
    if (!bundle || !app) return;
    if (apps.length && !apps.includes(app)) {
      const params = new URLSearchParams(searchParams);
      params.delete('app');
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (
      r.name.toLowerCase().includes(q)
      || (r.app || '').toLowerCase().includes(q)
      || r.typeLabel.toLowerCase().includes(q)
      || (r.highestSensitivity || '').toLowerCase().includes(q)
    ));
  }, [rows, search]);

  useEffect(() => {
    setPage(1);
  }, [search, app]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    filtered,
    page,
    TABLE_PAGE_SIZE,
  );

  function setApp(next) {
    const params = new URLSearchParams(searchParams);
    if (!next) params.delete('app');
    else params.set('app', next);
    setSearchParams(params, { replace: true });
  }

  function openIdentity(id) {
    navigate(`/exposure-map/${id}${appQuery(app)}`);
  }

  const completenessPct = summary
    ? Math.round((summary.completeness.ratio || 0) * 100)
    : null;
  const topScored = summary?.topScored || null;

  return (
    <div className="page-content em-page">
      <div className="page-header em-page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Identity exposure map</h1>
          <p className="page-subtitle">
            Blast radius, ranked by the engine — how much each identity could reach if it were
            misused, not whether it is owned or correctly configured.
            {preferMock && <> Offline mock mode (`VITE_USE_MOCK=1`).</>}
            {!preferMock && summary?.snapshotAt && <> Graph snapshot {String(summary.snapshotAt).slice(0, 10)}.</>}
          </p>
          {error && (
            <div className="ad-load-error" role="alert">
              <span>{error}</span>
              <button type="button" className="btn btn-ghost" onClick={reload}>Retry</button>
            </div>
          )}
        </div>
      </div>

      <div className="ad-summary-grid em-kpi-grid">
        <SummaryCard
          icon="check"
          tone="blue"
          value={loading ? '—' : `${completenessPct}%`}
          label="Classification completeness"
          footer={
            <span className="ad-pill ad-pill--info">
              {loading
                ? 'Loading…'
                : `${summary.completeness.classified} classified · ${summary.completeness.unclassified} unclassified of ${summary.completeness.total} permissions`}
            </span>
          }
        />
        <SummaryCard
          icon="alertTriangle"
          tone="red"
          value={loading ? '—' : (topScored?.exposureScore ?? '—')}
          label="Highest exposure score"
          footer={
            <span className="ad-pill ad-pill--danger">
              {loading ? 'Loading…' : (topScored ? `${topScored.name} · ${topScored.bandLabel}` : 'No scored identities')}
            </span>
          }
        />
        <SummaryCard
          icon="layers"
          tone="violet"
          value={loading ? '—' : summary.scored}
          label="Identities scored"
          footer={
            <span className="ad-pill ad-pill--violet">
              No paths ({loading ? '—' : summary.noPaths}) · Unclassified ({loading ? '—' : summary.noClassifiedPermissions})
            </span>
          }
        />
      </div>

      <div className="em-toolbar" role="search">
        <label className={`em-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={15} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity, app, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search identity"
          />
          {search.trim() && (
            <button type="button" className="em-search-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </label>

        {apps.length > 1 && (
          <label className="em-account-filter">
            <span className="em-account-filter-k">App</span>
            <select
              value={app}
              onChange={(e) => setApp(e.target.value)}
              aria-label="Filter by app"
            >
              <option value="">All apps</option>
              {apps.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
        )}

        <div className="em-list-count">
          {loading ? 'Loading…' : `${filtered.length} identit${filtered.length === 1 ? 'y' : 'ies'}`}
        </div>
      </div>

      <div className="em-table-shell">
        <div className="em-table-scroll">
          <div className="em-table-head">
            <span className="em-col-id">Identity</span>
            <span className="em-col-type">Type</span>
            <span className="em-col-bar">Exposure</span>
            <span className="em-col-score">Score</span>
            <span className="em-col-reach">Reachable</span>
            <span className="em-col-band">Band</span>
            <span className="em-col-owner">Owner</span>
          </div>
          {!loading && filtered.length === 0 && (
            <div className="em-table-empty">
              {error ? 'Unable to load exposure map' : `No identities match${app ? ` for app "${app}"` : ''}.`}
            </div>
          )}
          {pageRows.map((row) => {
            const pct = row.exposureScore == null ? 0 : Math.max(0, Math.min(100, row.exposureScore));
            const tone = BAND_TONE[row.band] || 'muted';
            return (
              <button
                key={row.id}
                type="button"
                className="em-table-row"
                onClick={() => openIdentity(row.id)}
              >
                <span className="em-col-id">
                  <span className="em-id-name">{row.name}</span>
                  <span className="em-id-dept">{row.app}</span>
                </span>
                <span className="em-col-type">
                  <IdentityTypeChip identityType={row.identityType} label={row.typeLabel} />
                </span>
                <span className="em-col-bar">
                  <span className="em-bar-track">
                    <span className={`em-bar-fill em-bar-fill--${tone}`} style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className={`em-col-score em-col-score--${tone}`}>
                  {row.exposureScore ?? '—'}
                </span>
                <span className="em-col-reach">
                  {row.reachablePermissions}
                  {row.unclassifiedPermissions > 0 && (
                    <span className="em-reach-unclassified"> ({row.unclassifiedPermissions} unclassified)</span>
                  )}
                </span>
                <span className="em-col-band">
                  <ExposureBandBadge
                    assessmentKind={row.assessmentKind}
                    band={row.band}
                    label={row.bandLabel}
                  />
                </span>
                <span className="em-col-owner">
                  <OwnerCell ownerDisplay={row.ownerDisplay} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={filtered.length}
        noun="identities"
      />
    </div>
  );
}
