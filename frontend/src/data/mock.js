export const threats = [
  { id: 'DET-10482', title: 'Suspicious PowerShell encoded command', sev: 'critical', technique: 'T1059.001', asset: 'WIN-FIN-042', actor: 'Unknown', time: '2m ago', status: 'Active' },
  { id: 'DET-10477', title: 'Impossible travel sign-in', sev: 'high', technique: 'T1078', asset: 'jdoe@acme.com', actor: 'Credential abuse', time: '14m ago', status: 'Investigating' },
  { id: 'DET-10471', title: 'Anomalous S3 public ACL change', sev: 'high', technique: 'T1530', asset: 'aws-prod-logs', actor: 'Cloud identity', time: '31m ago', status: 'Active' },
  { id: 'DET-10468', title: 'Lateral movement via RDP', sev: 'medium', technique: 'T1021.001', asset: 'SRV-HR-011', actor: 'APT-like', time: '1h ago', status: 'Contained' },
  { id: 'DET-10455', title: 'Mimikatz-like memory access', sev: 'critical', technique: 'T1003', asset: 'DC-01', actor: 'Unknown', time: '2h ago', status: 'Active' },
  { id: 'DET-10440', title: 'Kubernetes privileged pod spawn', sev: 'medium', technique: 'T1611', asset: 'eks-prod', actor: 'Insider?', time: '3h ago', status: 'Monitoring' },
];

export const incidents = [
  { id: 'INC-2841', title: 'Suspected credential stuffing → vault access', sev: 'critical', status: 'In progress', owner: 'A. Chen', assets: 12, opened: 'Today 09:14', sla: '1h 12m' },
  { id: 'INC-2837', title: 'Ransomware precursors on finance endpoints', sev: 'high', status: 'Triaged', owner: 'M. Ortiz', assets: 7, opened: 'Today 07:42', sla: '3h 40m' },
  { id: 'INC-2829', title: 'OAuth app consent phishing', sev: 'high', status: 'Contained', owner: 'R. Caplan', assets: 3, opened: 'Yesterday', sla: 'Met' },
  { id: 'INC-2818', title: 'Misconfigured storage bucket exposure', sev: 'medium', status: 'Resolved', owner: 'S. Patel', assets: 1, opened: '2d ago', sla: 'Met' },
];

export const alerts = [
  { id: 'AL-9182', title: 'Brute force against VPN gateway', sev: 'critical', source: 'Firewall', count: 1842, ai: 'Coordinated credential stuffing from 14 ASN clusters targeting finance VPN. Recommend temporary geo-block + MFA step-up.', time: '1m ago' },
  { id: 'AL-9177', title: 'Privileged group membership change', sev: 'high', source: 'Identity', count: 1, ai: 'User n.brooks added to Domain Admins outside change window. No linked ticket found.', time: '12m ago' },
  { id: 'AL-9171', title: 'Endpoint quarantine failed', sev: 'high', source: 'EDR', count: 3, ai: 'Agent offline on WIN-FIN-042 during isolation attempt. Likely network partition or tamper.', time: '28m ago' },
  { id: 'AL-9164', title: 'CVSS 9.8 package in prod image', sev: 'medium', source: 'Scanner', count: 6, ai: 'openssl advisory affects payments-api:2.14. Patch available; rollout risk low.', time: '1h ago' },
  { id: 'AL-9158', title: 'Unusual Graph API consent', sev: 'low', source: 'SaaS', count: 1, ai: 'New app requested Mail.ReadWrite for 2 users. Looks like shadow IT, not malware.', time: '3h ago' },
];

export const vulns = [
  { cve: 'CVE-2026-2144', title: 'Remote code execution in OpenSSL', cvss: 9.8, risk: 'Critical', assets: 26, exploit: 'In the wild', patch: '3.2.1', progress: 35 },
  { cve: 'CVE-2026-1881', title: 'Privilege escalation in kubelet', cvss: 8.8, risk: 'High', assets: 14, exploit: 'PoC public', patch: '1.30.4', progress: 62 },
  { cve: 'CVE-2025-9921', title: 'SSRF in internal gateway', cvss: 7.5, risk: 'High', assets: 4, exploit: 'None', patch: 'Config fix', progress: 80 },
  { cve: 'CVE-2025-7710', title: 'XSS in admin portal', cvss: 6.1, risk: 'Medium', assets: 1, exploit: 'None', patch: '2.9.18', progress: 100 },
];

export const assets = [
  { name: 'DC-01', type: 'Server', env: 'Prod', health: 96, risk: 'High', owner: 'Identity', lastSeen: '1m' },
  { name: 'WIN-FIN-042', type: 'Endpoint', env: 'Prod', health: 41, risk: 'Critical', owner: 'Finance', lastSeen: '4m' },
  { name: 'payments-api', type: 'Application', env: 'Prod', health: 88, risk: 'Medium', owner: 'Platform', lastSeen: '30s' },
  { name: 'eks-prod', type: 'Kubernetes', env: 'Prod', health: 91, risk: 'Medium', owner: 'SRE', lastSeen: '1m' },
  { name: 'postgres-core', type: 'Database', env: 'Prod', health: 97, risk: 'Low', owner: 'Data', lastSeen: '2m' },
  { name: 'aws-prod-logs', type: 'Cloud', env: 'Prod', health: 78, risk: 'High', owner: 'SecOps', lastSeen: '5m' },
  { name: 'fw-edge-01', type: 'Network', env: 'Prod', health: 99, risk: 'Low', owner: 'NetEng', lastSeen: '20s' },
  { name: 'macbook-riya', type: 'Endpoint', env: 'Corp', health: 94, risk: 'Low', owner: 'Riya C.', lastSeen: '8m' },
];

export const endpoints = [
  { name: 'WIN-FIN-042', os: 'Windows 11', agent: '7.4.2', health: 41, risk: 9.2, malware: 'Suspicious', isolated: false, user: 'jdoe' },
  { name: 'MAC-ENG-118', os: 'macOS 15', agent: '7.4.2', health: 93, risk: 2.1, malware: 'Clean', isolated: false, user: 'achen' },
  { name: 'WIN-HR-009', os: 'Windows 10', agent: '7.3.9', health: 72, risk: 5.4, malware: 'Clean', isolated: false, user: 'mortiz' },
  { name: 'LIN-BUILD-03', os: 'Ubuntu 22.04', agent: '7.4.1', health: 88, risk: 3.6, malware: 'Clean', isolated: false, user: 'ci-bot' },
  { name: 'WIN-EXEC-002', os: 'Windows 11', agent: '7.4.2', health: 64, risk: 6.8, malware: 'Quarantined', isolated: true, user: 'exec-asst' },
];

export const identities = [
  { name: 'John Doe', email: 'jdoe@acme.com', role: 'Engineer', mfa: false, risk: 8.9, priv: true, lastSignIn: '14h ago' },
  { name: 'Aisha Chen', email: 'achen@acme.com', role: 'SecOps', mfa: true, risk: 2.1, priv: true, lastSignIn: '12m ago' },
  { name: 'Service: vault-sync', email: 'vault-sync@svc', role: 'Workload', mfa: 'N/A', risk: 6.4, priv: true, lastSignIn: '2m ago' },
  { name: 'Maya Ortiz', email: 'mortiz@acme.com', role: 'Analyst', mfa: true, risk: 1.4, priv: false, lastSignIn: '4m ago' },
  { name: 'Broken Owner', email: 'dwhitfield@acme.com', role: 'Manager', mfa: false, risk: 7.2, priv: false, lastSignIn: 'Disabled' },
];

export const compliance = [
  { framework: 'ISO 27001', score: 86, controls: 114, gaps: 9, status: 'On track' },
  { framework: 'SOC 2', score: 91, controls: 64, gaps: 4, status: 'Audit ready' },
  { framework: 'NIST CSF', score: 78, controls: 108, gaps: 18, status: 'Improving' },
  { framework: 'PCI DSS', score: 72, controls: 78, gaps: 14, status: 'At risk' },
  { framework: 'HIPAA', score: 88, controls: 42, gaps: 3, status: 'On track' },
  { framework: 'GDPR', score: 84, controls: 36, gaps: 5, status: 'On track' },
];

export const heatLevels = Array.from({ length: 84 }, (_, i) => {
  const r = (i * 17) % 10;
  if (r > 8) return 'l4';
  if (r > 6) return 'l3';
  if (r > 4) return 'l2';
  if (r > 2) return 'l1';
  return '';
});
