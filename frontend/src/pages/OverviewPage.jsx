import { ui } from "../lib/ui";
import { cn } from "../lib/cn";
import { sevClass } from "../lib/badges";

const IMPACTS = [
  "Catastrophic 5",
  "Significant 4",
  "Moderate 3",
  "Low 2",
  "Negligible 1",
];

const LIKELIHOODS = [
  "1 Improbable",
  "2 Remote",
  "3 Occasional",
  "4 Probable",
  "5 Frequent",
];

/** Impact (5→1) × Likelihood (1→5). Colors match classic 5×5 risk matrix. */
const RISK_MATRIX = [
  [
    ["acceptable", 5],
    ["undesirable", 10],
    ["unacceptable", 15],
    ["catastrophic", 20],
    ["catastrophic", 25],
  ],
  [
    ["desirable", 4],
    ["undesirable", 8],
    ["undesirable", 12],
    ["catastrophic", 16],
    ["catastrophic", 20],
  ],
  [
    ["desirable", 3],
    ["acceptable", 6],
    ["undesirable", 9],
    ["undesirable", 12],
    ["unacceptable", 15],
  ],
  [
    ["desirable", 2],
    ["acceptable", 4],
    ["acceptable", 6],
    ["undesirable", 8],
    ["undesirable", 10],
  ],
  [
    ["desirable", 1],
    ["desirable", 2],
    ["desirable", 3],
    ["acceptable", 4],
    ["acceptable", 5],
  ],
];

const RISK_LEVEL_CLASS = {
  catastrophic: ui.riskCatastrophic,
  unacceptable: ui.riskUnacceptable,
  undesirable: ui.riskUndesirable,
  acceptable: ui.riskAcceptable,
  desirable: ui.riskDesirable,
};

const RISK_LEGEND = [
  { level: "catastrophic", label: "Catastrophic", action: "Stop" },
  { level: "unacceptable", label: "Unacceptable", action: "Urgent Action" },
  { level: "undesirable", label: "Undesirable", action: "Action" },
  { level: "acceptable", label: "Acceptable", action: "Monitor" },
  { level: "desirable", label: "Desirable", action: "No Action" },
];

const INSIGHT_CARDS = [
  { label: "Shadow Admins", value: "2", page: "identity" },
  { label: "Incidents & Risks", value: "7", page: "incidents" },
  { label: "Access Requests", value: "18", page: "govern" },
];

function InsightCards({ onNavigate }) {
  return (
    <div className={cn(ui.g3, "insight-card-grid mb-10 grid gap-4")} role="list">
      {INSIGHT_CARDS.map((k) => (
        <article className={ui.insightCard} key={k.label} role="listitem">
          <h3 className={ui.insightCardHeading}>
            <a
              href={`#${k.page}`}
              className={ui.insightCardLink}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(k.page);
              }}
            >
              <span className={ui.insightCardValue}>{k.value}</span>
              <span className={ui.insightCardLabel}>{k.label}</span>
            </a>
          </h3>
        </article>
      ))}
    </div>
  );
}

export default function OverviewPage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Executive Dashboard</div>
          <h1 className={ui.pageHeadTitle}>Are we secure right now?</h1>
          <p className={ui.pageHeadDesc}>
            Live posture across identity, cloud, endpoint, and detections — what
            changed today, what needs attention first, and what AI recommends.
          </p>
        </div>
        <div className={ui.pageActions}>
          <span className={ui.liveDot}>Live</span>
          <button className={ui.btn}>Last 24 hours</button>
          <button
            className={ui.btnPrimary}
            onClick={() => onNavigate("reports")}
          >
            Export brief
          </button>
        </div>
      </div>

      <InsightCards onNavigate={onNavigate} />

      <div className={cn(ui.grid, ui.g75, "mb-4")}>
        <div className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <div className={ui.cardTitle}>Risk heatmap</div>
              <div className={ui.cardSub}>Impact × Likelihood risk matrix</div>
            </div>
          </div>
          <div className={ui.riskMatrix}>
            <div className={ui.riskMatrixYLabel}>Impact</div>
            <div className={ui.riskMatrixMain}>
              <div className={ui.riskMatrixGrid}>
                {RISK_MATRIX.map((row, r) => (
                  <div key={IMPACTS[r]} className="contents">
                    <div className={ui.riskMatrixAxisCell}>{IMPACTS[r]}</div>
                    {row.map(([level, score]) => (
                      <div
                        key={`${IMPACTS[r]}-${score}-${level}`}
                        className={cn(ui.riskMatrixScore, RISK_LEVEL_CLASS[level])}
                        title={`Impact ${5 - r} × Likelihood ${score / (5 - r)} = ${score}`}
                      >
                        {score}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className={ui.riskMatrixXWrap}>
                <div />
                {LIKELIHOODS.map((label) => (
                  <div key={label} className={ui.riskMatrixXCell}>
                    <span className="inline-block max-w-[4.5rem] [writing-mode:vertical-rl] rotate-180">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <div className={ui.riskMatrixXTitle}>Likelihood</div>
              <div className={ui.riskMatrixLegend}>
                {RISK_LEGEND.map((item) => (
                  <div key={item.level} className={ui.riskMatrixLegendItem}>
                    <span
                      className={cn(
                        ui.riskMatrixLegendSwatch,
                        RISK_LEVEL_CLASS[item.level],
                      )}
                    />
                    <span>
                      <span className={ui.riskMatrixLegendLabel}>{item.label}</span>
                      <span className={ui.riskMatrixLegendAction}>
                        {" "}
                        · {item.action}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <div className={ui.cardTitle}>What changed today</div>
              <div className={ui.cardSub}>Timeline of material events</div>
            </div>
          </div>
          <div className={ui.timeline}>
            <div className={cn(ui.tlItem, "crit")}>
              <div className={ui.tlTime}>09:14</div>
              <div className={ui.tlTitle}>
                INC-2841 opened — vault access path
              </div>
              <div className={ui.tlDesc}>
                Credential stuffing correlated with privileged API calls.
              </div>
            </div>
            <div className={cn(ui.tlItem, "warn")}>
              <div className={ui.tlTime}>08:02</div>
              <div className={ui.tlTitle}>WIN-FIN-042 isolation failed</div>
              <div className={ui.tlDesc}>
                EDR agent offline during response playbook.
              </div>
            </div>
            <div className={cn(ui.tlItem, "ok")}>
              <div className={ui.tlTime}>06:40</div>
              <div className={ui.tlTitle}>Critical OpenSSL patch staged</div>
              <div className={ui.tlDesc}>
                26 assets queued; 9 remediations complete.
              </div>
            </div>
            <div className={ui.tlItem}>
              <div className={ui.tlTime}>05:18</div>
              <div className={ui.tlTitle}>New OAuth consent anomaly</div>
              <div className={ui.tlDesc}>
                Shadow IT app requested Mail.ReadWrite.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <div className={ui.cardTitle}>Recent incidents</div>
              <div className={ui.cardSub}>Urgent workspace items</div>
            </div>
            <button className={ui.btn} onClick={() => onNavigate("incidents")}>
              Open workspace
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Severity</th>
                <th>Owner</th>
                <th>SLA</th>
              </tr>
            </thead>
            <tbody>
              <tr
                onClick={() => onNavigate("incidents")}
                className="cursor-pointer"
              >
                <td className={ui.mono}>INC-2841</td>
                <td>Credential stuffing → vault access</td>
                <td>
                  <span className={sevClass("critical")}>Critical</span>
                </td>
                <td>A. Chen</td>
                <td>1h 12m</td>
              </tr>
              <tr
                onClick={() => onNavigate("incidents")}
                className="cursor-pointer"
              >
                <td className={ui.mono}>INC-2837</td>
                <td>Ransomware precursors on finance endpoints</td>
                <td>
                  <span className={sevClass("high")}>High</span>
                </td>
                <td>M. Ortiz</td>
                <td>3h 40m</td>
              </tr>
              <tr
                onClick={() => onNavigate("incidents")}
                className="cursor-pointer"
              >
                <td className={ui.mono}>INC-2829</td>
                <td>OAuth app consent phishing</td>
                <td>
                  <span className={sevClass("high")}>High</span>
                </td>
                <td>R. Caplan</td>
                <td>Met</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className={ui.card}>
          <div className={ui.cardHead}>
            <div>
              <div className={ui.cardTitle}>AI recommendations</div>
              <div className={ui.cardSub}>Fix-first guidance</div>
            </div>
            <button className={ui.btn} onClick={() => onNavigate("copilot")}>
              Ask Copilot
            </button>
          </div>
          <div className={ui.actionItem}>
            <b className="mb-1.5 block text-xs">
              1. Isolate WIN-FIN-042 via out-of-band network ACL
            </b>
            <div className="mb-2 text-[12.5px] text-text-3">
              Agent offline — use switchport quarantine to contain ransomware
              precursors.
            </div>
            <button className={cn(ui.btnPrimary, "text-xs")}>
              Run playbook
            </button>
          </div>
          <div className={ui.actionItem}>
            <b className="mb-1.5 block text-xs">
              2. Enforce step-up MFA on John Doe
            </b>
            <div className="mb-2 text-[12.5px] text-text-3">
              Risk 8.9 with path to production vault in two hops.
            </div>
            <button
              className={cn(ui.btn, "text-xs")}
              onClick={() => onNavigate("identity")}
            >
              Open identity
            </button>
          </div>
          <div className={ui.actionItem}>
            <b className="mb-1.5 block text-xs">
              3. Patch CVE-2026-2144 on payments cluster
            </b>
            <div className="mb-2 text-[12.5px] text-text-3">
              Exploit in the wild · 26 assets · CVSS 9.8
            </div>
            <button
              className={cn(ui.btn, "text-xs")}
              onClick={() => onNavigate("vulns")}
            >
              View vulns
            </button>
          </div>
          <div className="mt-3">
            <div className={cn(ui.cardTitle, "mb-2")}>Quick actions</div>
            <div className={cn(ui.chipRow, "mb-0")}>
              <button className={ui.chip} onClick={() => onNavigate("threats")}>
                Threats
              </button>
              <button className={ui.chip} onClick={() => onNavigate("alerts")}>
                Alerts
              </button>
              <button className={ui.chip} onClick={() => onNavigate("cloud")}>
                Cloud posture
              </button>
              <button
                className={ui.chip}
                onClick={() => onNavigate("compliance")}
              >
                Compliance
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
