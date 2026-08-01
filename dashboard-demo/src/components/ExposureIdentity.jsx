import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from './ui';
import { useExposureIdentity } from '../hooks/useExposureIdentity';
import { downloadExposureProfileCsv } from '../api/exposureApi';
import ExposureGraphMap from './ExposureGraphMap';

const BAND_TONE = {
  extensive: 'extensive',
  substantial: 'substantial',
  limited: 'limited',
  minimal: 'minimal',
};

const SEVERITY_LABEL = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

/** `ExposureOwnershipContext.state` — the actual state word, distinct from *who* owns it. */
const OWNERSHIP_STATE_LABEL = {
  owned: 'Owned',
  unowned: 'Unowned',
  owner_invalid: 'Owner invalid',
  ambiguous: 'Ambiguous',
  unknown: 'Unevaluated',
};

function appQuery(app) {
  const params = new URLSearchParams();
  if (app) params.set('app', app);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function ExposureBandBadge({ assessmentKind, band, label }) {
  if (assessmentKind === 'no_paths') {
    return <span className="em-band em-band--muted">No paths</span>;
  }
  if (assessmentKind === 'no_classified_permissions') {
    return <span className="em-band em-band--warn">Unclassified</span>;
  }
  const tone = BAND_TONE[band] || 'muted';
  return <span className={`em-band em-band--${tone}`}>{label}</span>;
}

function SeverityChip({ severity }) {
  const tone = severity === 'none' || !severity ? 'muted' : severity;
  return <span className={`em-severity em-severity--${tone}`}>{SEVERITY_LABEL[severity] || 'None'}</span>;
}

function OwnerCell({ ownerDisplay }) {
  const tone = ownerDisplay?.tone || 'muted';
  const text = ownerDisplay?.text || 'Unevaluated';
  return <span className={`ad-owner ad-owner--${tone}`} title={text}>{text}</span>;
}

function sensitivityTone(sensitivity) {
  if (sensitivity === 'sensitive') return 'critical';
  if (sensitivity === 'unclassified') return 'high';
  return 'default';
}

function ContributionRow({ contribution, sensitivity }) {
  return (
    <div className={`ad-perm-item ad-perm-item--${sensitivityTone(sensitivity)}`}>
      <div className="ad-perm-item-main">
        <span className="ad-perm-label">{contribution.permission}</span>
        <span className="ad-perm-tone">{Math.round(contribution.share_of_score * 100)}% of weighted sum</span>
      </div>
      <div className="ad-perm-detail">
        weight {contribution.weight} × {contribution.mechanism_multiplier} mechanism multiplier
        {' '}= contribution {contribution.contribution.toFixed(2)}
      </div>
    </div>
  );
}

function RingSection({ ring }) {
  return (
    <div className="em-ring">
      <div className="ad-detail-section-head">
        <h3>Hop distance {ring.hop_distance}</h3>
        <span className="ad-detail-section-count">{ring.permissions.length} permission{ring.permissions.length === 1 ? '' : 's'}</span>
      </div>
      <div className="ad-perm-list">
        {ring.permissions.map((entry) => (
          <div
            key={entry.permission}
            className={`ad-perm-item ad-perm-item--${sensitivityTone(entry.sensitivity)}`}
          >
            <div className="ad-perm-item-main">
              <span className="ad-perm-label">{entry.permission}</span>
              <span className="ad-perm-tone">{entry.sensitivity}</span>
            </div>
            <div className="ad-perm-detail">
              {entry.scored_route.path_type} route · {entry.route_count} route{entry.route_count === 1 ? '' : 's'} found
              {entry.route_types.length > 1 ? ` (${entry.route_types.join(', ')})` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Identity Exposure Map — detail view. Engine profile first: `exposure_set`, `rings`,
 * `contributions[]` and the ownership reconciliation sentence are the primary content.
 * The mock-only cloud resource-map graph (`data/exposureApi.js`) is deliberately not wired
 * here — its shape (compute attachments, radial tree) does not correspond to this engine's
 * `ExposureProfile` contract, and showing it next to live rings would imply it is derived
 * from the same score. See PR notes for the deferred redesign.
 */
export default function ExposureIdentity() {
  const { identityId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const app = searchParams.get('app') || '';
  const [view, setView] = useState('map');

  const { profile, loading, error, notFound, reload, preferMock } = useExposureIdentity(identityId);
  const listHref = `/exposure-map${appQuery(app)}`;

  if (preferMock) {
    return (
      <div className="page-content">
        <div className="page-header">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>← Identities</button>
          <h1 className="page-title">{identityId}</h1>
          <p className="page-subtitle">Offline mock mode (`VITE_USE_MOCK=1`).</p>
        </div>
        <div className="ad-detail-alert">
          <div className="ad-detail-alert-title">
            <Icon name="alert" size={14} color="var(--color-hop)" />
            No engine profile in offline mode
          </div>
          <p>
            The mock inventory carries a flat demo score only — it has no `exposure_set`,
            `rings` or `contributions[]`. Unset `VITE_USE_MOCK` and run the backend to see
            the engine&apos;s derivation for this identity.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-content">
        <div className="page-header">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>← Identities</button>
          <h1 className="page-title">Loading…</h1>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page-content">
        <div className="page-header">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>← Identities</button>
          <h1 className="page-title">Identity not found</h1>
          <p className="page-subtitle">No exposure profile for &quot;{identityId}&quot;.</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-content">
        <div className="page-header">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>← Identities</button>
          <h1 className="page-title">Unable to load</h1>
          <div className="ad-load-error" role="alert">
            <span>{error || 'request_failed'}</span>
            <button type="button" className="btn btn-ghost" onClick={reload}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const { assessment } = profile;
  const tone = BAND_TONE[assessment.band] || 'muted';
  const sensitivityByPermission = new Map(
    (profile.exposureSet.entries || []).map((entry) => [entry.permission, entry.sensitivity]),
  );

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-copy">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>← Identities</button>
          <h1 className="page-title">{profile.name}</h1>
          <p className="page-subtitle">
            {profile.typeLabel} · {profile.app}
            {profile.staleness && (
              <> · snapshot {String(profile.staleness.based_on_access_discovery_snapshot).slice(0, 10)}</>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => downloadExposureProfileCsv(profile.id).catch(() => {})}
        >
          <Icon name="download" size={12} /> Export CSV
        </button>
      </div>

      <div className="em-profile-score">
        <div className="em-profile-score-main">
          <div className={`em-profile-score-value em-profile-score-value--${tone}`}>
            {assessment.score ?? '—'}
          </div>
          <div className="em-profile-score-meta">
            <ExposureBandBadge assessmentKind={assessment.kind} band={assessment.band} label={assessment.bandLabel} />
            {assessment.kind === 'scored' && (
              <span className="ad-detail-section-note">weighted sum {assessment.weightedSum?.toFixed(2)}</span>
            )}
          </div>
        </div>
        <div className="em-profile-score-reach">
          <span className="em-profile-score-reach-label">Reachable</span>
          <span className="em-profile-score-reach-value">
            {profile.exposureSet.counted} / {profile.exposureSet.total_permissions}
          </span>
          {profile.exposureSet.unclassified > 0 && (
            <span className="em-reach-unclassified">{profile.exposureSet.unclassified} unclassified</span>
          )}
        </div>
      </div>

      {assessment.kind === 'no_paths' && (
        <div className="ad-detail-alert ad-detail-alert--info">
          <div className="ad-detail-alert-title">
            <Icon name="check" size={14} color="var(--uno-green-600, #15803d)" />
            No access paths discovered
          </div>
          <p>This identity reaches nothing in Access Discovery&apos;s graph — a clean result, not an unevaluated one.</p>
        </div>
      )}

      {assessment.kind === 'no_classified_permissions' && (
        <div className="ad-detail-alert">
          <div className="ad-detail-alert-title">
            <Icon name="alertTriangle" size={14} color="var(--uno-orange-600)" />
            Classification gap — not a clean result
          </div>
          <p>
            This identity reaches {assessment.unclassified.length} permission{assessment.unclassified.length === 1 ? '' : 's'},
            none of them classified. There is no score to show because nothing has been assessed —
            this is a gap in the classification registry, not evidence of low exposure.
          </p>
        </div>
      )}

      <div className="egm-view-toggle" role="tablist" aria-label="Exposure view">
        <button
          type="button"
          className={view === 'map' ? 'is-active' : ''}
          aria-pressed={view === 'map'}
          onClick={() => setView('map')}
        >
          Map
        </button>
        <button
          type="button"
          className={view === 'table' ? 'is-active' : ''}
          aria-pressed={view === 'table'}
          onClick={() => setView('table')}
        >
          Table
        </button>
      </div>

      {view === 'map' ? (
        // Keyed by identity so its internal hop-slider state resets on navigation instead of
        // needing a setState-in-effect to sync it (see ExposureGraphMap's own note).
        <ExposureGraphMap key={profile.id} profile={profile} />
      ) : (
        <>
          <section className="ad-detail-section">
            <div className="ad-detail-section-head">
              <h3>Ownership reconciliation</h3>
            </div>
            <div className="ad-detail-meta">
              <div className="ad-detail-meta-item">
                <span className="ad-detail-meta-label">Ownership state</span>
                <span className="ad-detail-meta-value">
                  <span className={`ad-owner ad-owner--${profile.ownerDisplay?.tone || 'muted'}`}>
                    {OWNERSHIP_STATE_LABEL[profile.ownershipState] || 'Unevaluated'}
                  </span>
                </span>
              </div>
              <div className="ad-detail-meta-item">
                <span className="ad-detail-meta-label">Owner</span>
                <span className="ad-detail-meta-value"><OwnerCell ownerDisplay={profile.ownerDisplay} /></span>
              </div>
              <div className="ad-detail-meta-item">
                <span className="ad-detail-meta-label">Ownership severity</span>
                <span className="ad-detail-meta-value"><SeverityChip severity={profile.ownershipSeverity} /></span>
              </div>
              <div className="ad-detail-meta-item" style={{ gridColumn: '1 / -1' }}>
                <span className="ad-detail-meta-label">Why these can disagree</span>
                <span className="ad-detail-meta-value">{profile.whyTheseDiffer}</span>
              </div>
            </div>
          </section>

          {assessment.kind === 'scored' && assessment.contributions.length > 0 && (
            <section className="ad-detail-section">
              <div className="ad-detail-section-head">
                <h3>Contributions</h3>
                <span className="ad-detail-section-count">
                  {assessment.contributions.length} of {profile.exposureSet.counted} counted
                </span>
              </div>
              <p className="ad-detail-section-note">
                Descending by share of the weighted sum — the first row is the single largest
                driver of this score.
                {assessment.highestSensitivity && ` Highest sensitivity reached: ${assessment.highestSensitivity}.`}
              </p>
              <div className="ad-perm-list">
                {assessment.contributions.map((c) => (
                  <ContributionRow
                    key={c.permission}
                    contribution={c}
                    sensitivity={sensitivityByPermission.get(c.permission)}
                  />
                ))}
              </div>
            </section>
          )}

          {profile.rings.length > 0 && (
            <section className="ad-detail-section">
              <div className="ad-detail-section-head">
                <h3>Reachability rings</h3>
                <span className="ad-detail-section-count">{profile.rings.length} ring{profile.rings.length === 1 ? '' : 's'}</span>
              </div>
              <p className="ad-detail-section-note">
                One ring per distinct hop distance present, drawn outward from this identity.
              </p>
              {profile.rings.map((ring) => (
                <RingSection key={ring.hop_distance} ring={ring} />
              ))}
            </section>
          )}

          {assessment.unclassified.length > 0 && (
            <section className="ad-detail-section">
              <div className="ad-detail-section-head">
                <h3>Unclassified permissions</h3>
                <span className="ad-detail-section-count">{assessment.unclassified.length}</span>
              </div>
              <p className="ad-detail-section-note">
                Excluded from the weighted sum — nobody has assessed these, which is a claim about
                the classification registry, not about this identity.
              </p>
              <div className="ad-perm-list">
                {assessment.unclassified.map((perm) => (
                  <div key={perm} className="ad-perm-item">
                    <div className="ad-perm-item-main">
                      <span className="ad-perm-label">{perm}</span>
                      <span className="ad-perm-tone">unclassified</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
