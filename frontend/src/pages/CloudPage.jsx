import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

export default function CloudPage({ onNavigate }) {
  const providers = [
    { name: 'AWS', mark: 'AWS', color: '#F59E0B', accounts: 6, findings: 41, score: 74 },
    { name: 'Azure', mark: 'AZ', color: '#2563EB', accounts: 3, findings: 18, score: 81 },
    { name: 'GCP', mark: 'GCP', color: '#22C55E', accounts: 2, findings: 9, score: 86 },
    { name: 'Kubernetes', mark: 'K8s', color: '#7C3AED', accounts: 4, findings: 22, score: 69 },
  ];

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Cloud Security</div>
          <h1 className={ui.pageHeadTitle}>Multi-cloud posture & attack paths</h1>
          <p className={ui.pageHeadDesc}>AWS, Azure, GCP, Kubernetes, storage, and IAM — misconfigurations, compliance posture, and reachable attack paths.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Sync now</button>
          <button className={ui.btnPrimary} onClick={() => onNavigate('copilot')}>Explain posture</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {providers.map((p) => (
          <div className={ui.card} key={p.name}>
            <div className={cn(ui.cloudProvider, 'mb-3')}>
              <div className={ui.providerMark} style={{ background: p.color }}>{p.mark}</div>
              <div>
                <div className="font-bold">{p.name}</div>
                <div className="text-xs text-text-3">{p.accounts} accounts · {p.findings} findings</div>
              </div>
            </div>
            <div className={ui.progressRingLabel}><span>Posture</span><span>{p.score}</span></div>
            <div className={ui.scoreBar}><i style={{ width: `${p.score}%` }} /></div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={cn(ui.card, 'overflow-hidden p-0')}>
          <table className="w-full">
            <thead>
              <tr>
                <th>Finding</th>
                <th>Provider</th>
                <th>Severity</th>
                <th>Resource</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['S3 bucket allows public ACL writes', 'AWS', 'critical', 'aws-prod-logs', 'Open'],
                ['Overly permissive IAM role trust', 'AWS', 'high', 'vault-reader', 'Open'],
                ['Storage account public blob', 'Azure', 'high', 'fin-archive', 'In progress'],
                ['Privileged pod security policy gap', 'Kubernetes', 'medium', 'eks-prod', 'Open'],
                ['Service account key older than 90d', 'GCP', 'medium', 'etl-runner', 'Open'],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="font-semibold">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td><span className={sevClass(r[2])}>{r[2]}</span></td>
                  <td className={ui.mono}>{r[3]}</td>
                  <td>{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className={cn(ui.card, 'mb-4')}>
            <div className={ui.cardTitle}>Attack path</div>
            <div className={cn(ui.cardSub, 'mb-3')}>Internet → data</div>
            <div className={ui.attackChain}>
              {['Public ACL', 'Compromised role', 'AssumeRole', 'Secrets Manager', 'Customer PII'].map((n, i) => (
                <div key={n} className="contents">
                  {i > 0 && <div className={ui.chainArrow}>→</div>}
                  <div className={ui.chainStep}><b>Step {i + 1}</b>{n}</div>
                </div>
              ))}
            </div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardTitle}>Compliance posture</div>
            {[['CIS AWS', 82], ['CIS Azure', 88], ['CIS Kubernetes', 71]].map(([label, v]) => (
              <div key={label} className="mt-3">
                <div className={ui.progressRingLabel}><span>{label}</span><span>{v}%</span></div>
                <div className={ui.scoreBar}><i style={{ width: `${v}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
