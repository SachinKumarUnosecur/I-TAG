// ITAG Mock Data Layer
// Realistic demo data for all 10 screens

export const tenant = {
  name: "Unosecur Demo Tenant",
  id: "tenant-001",
  lastScan: "2026-07-31T14:22:00Z",
  cloudProviders: ["AWS", "GCP", "Azure"],
};

// ─── Identities ─────────────────────────────────────────────────────────────

export const identities = [
  // Human identities
  { id: "id-001", name: "jane.doe", type: "human", email: "jane.doe@acme.com", department: "Engineering", status: "active", createdBy: "id-sys-001", createdAt: "2023-01-15", lastActive: "2026-07-31", mfaEnabled: true, credentialAge: 45, owner: "id-001", ownerName: "Jane Doe", riskScore: 72, apps: ["payments", "devops"] },
  { id: "id-002", name: "mark.chen", type: "human", email: "mark.chen@acme.com", department: "DevOps", status: "active", createdBy: "id-sys-001", createdAt: "2022-08-01", lastActive: "2026-07-30", mfaEnabled: true, credentialAge: 12, owner: "id-002", ownerName: "Mark Chen", riskScore: 31, apps: ["devops"] },
  { id: "id-003", name: "priya.sharma", type: "human", email: "priya.sharma@acme.com", department: "Data", status: "active", createdBy: "id-sys-001", createdAt: "2023-04-20", lastActive: "2026-07-29", mfaEnabled: false, credentialAge: 180, owner: "id-003", ownerName: "Priya Sharma", riskScore: 58, apps: ["data-pipeline"] },
  { id: "id-004", name: "tom.walker", type: "human", email: "tom.walker@acme.com", department: "Security", status: "active", createdBy: "id-sys-001", createdAt: "2021-11-01", lastActive: "2026-07-31", mfaEnabled: true, credentialAge: 8, owner: "id-004", ownerName: "Tom Walker", riskScore: 22, apps: ["devops", "payments"] },
  { id: "id-005", name: "alice.brooks", type: "human", email: "alice.brooks@acme.com", department: "Finance", status: "departed", createdBy: "id-sys-001", createdAt: "2020-03-10", lastActive: "2026-06-01", mfaEnabled: false, credentialAge: 420, owner: null, ownerName: null, riskScore: 95, apps: ["payments"] },
  { id: "id-006", name: "raj.patel", type: "human", email: "raj.patel@acme.com", department: "Engineering", status: "departed", createdBy: "id-sys-001", createdAt: "2021-09-01", lastActive: "2026-05-15", mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, riskScore: 88, apps: ["data-pipeline", "devops"] },
  { id: "id-007", name: "sara.jones", type: "human", email: "sara.jones@acme.com", department: "Engineering", status: "active", createdBy: "id-sys-001", createdAt: "2024-02-14", lastActive: "2026-07-31", mfaEnabled: true, credentialAge: 3, owner: "id-007", ownerName: "Sara Jones", riskScore: 18, apps: ["payments"] },

  // Service accounts
  { id: "id-101", name: "svc-payments-api", type: "service", email: null, department: "Payments", status: "active", createdBy: "id-001", createdAt: "2023-02-01", lastActive: "2026-07-31", mfaEnabled: false, credentialAge: 320, owner: "id-001", ownerName: "Jane Doe", riskScore: 67, apps: ["payments"] },
  { id: "id-102", name: "svc-data-ingest", type: "service", email: null, department: "Data", status: "active", createdBy: "id-003", createdAt: "2023-05-10", lastActive: "2026-07-30", mfaEnabled: false, credentialAge: 210, owner: "id-003", ownerName: "Priya Sharma", riskScore: 54, apps: ["data-pipeline"] },
  { id: "id-103", name: "svc-ci-runner", type: "service", email: null, department: "DevOps", status: "active", createdBy: "id-002", createdAt: "2022-09-01", lastActive: "2026-07-31", mfaEnabled: false, credentialAge: 45, owner: "id-002", ownerName: "Mark Chen", riskScore: 41, apps: ["devops"] },
  { id: "id-104", name: "svc-orphaned-etl", type: "service", email: null, department: "Data", status: "orphaned", createdBy: "id-006", createdAt: "2021-10-01", lastActive: "2026-07-10", mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, riskScore: 91, apps: ["data-pipeline"] },
  { id: "id-105", name: "svc-old-payments-worker", type: "service", email: null, department: "Payments", status: "orphaned", createdBy: "id-005", createdAt: "2020-04-15", lastActive: "2026-06-20", mfaEnabled: false, credentialAge: 460, owner: null, ownerName: null, riskScore: 97, apps: ["payments"] },
  { id: "id-106", name: "svc-monitoring", type: "service", email: null, department: "DevOps", status: "active", createdBy: "id-002", createdAt: "2023-01-01", lastActive: "2026-07-31", mfaEnabled: false, credentialAge: 90, owner: "id-002", ownerName: "Mark Chen", riskScore: 29, apps: ["devops"] },
  { id: "id-107", name: "svc-billing-sync", type: "service", email: null, department: "Finance", status: "active", createdBy: "id-001", createdAt: "2023-06-01", lastActive: "2026-07-28", mfaEnabled: false, credentialAge: 120, owner: "id-001", ownerName: "Jane Doe", riskScore: 44, apps: ["payments"] },
];

// ─── Access Paths ────────────────────────────────────────────────────────────

export const accessPaths = [
  // Direct paths
  { id: "ap-001", identityId: "id-001", identityName: "jane.doe", resource: "s3://payments-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0, effectivePermissions: ["s3:GetObject", "s3:PutObject"], mechanism: "HAS_POLICY", lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false },
  { id: "ap-002", identityId: "id-002", identityName: "mark.chen", resource: "gke://devops-cluster", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0, effectivePermissions: ["container.pods.exec", "container.pods.list"], mechanism: "HAS_POLICY", lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false },
  { id: "ap-003", identityId: "id-004", identityName: "tom.walker", resource: "kms://prod-key-ring", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0, effectivePermissions: ["kms:Decrypt", "kms:Encrypt"], mechanism: "HAS_POLICY", lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false },
  { id: "ap-004", identityId: "id-007", identityName: "sara.jones", resource: "s3://payments-logs", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0, effectivePermissions: ["s3:GetObject"], mechanism: "HAS_POLICY", lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false },

  // Indirect paths
  { id: "ap-005", identityId: "id-001", identityName: "jane.doe", resource: "rds://payments-db-prod", resourceSensitivity: "critical", accessType: "Indirect", hopCount: 0, effectivePermissions: ["rds:Connect", "rds:DescribeDBInstances"], mechanism: "MEMBER_OF:group-db-readers", lastConfirmed: "2026-07-29", cloudProvider: "AWS", blocked: false },
  { id: "ap-006", identityId: "id-003", identityName: "priya.sharma", resource: "bigquery://analytics-prod", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0, effectivePermissions: ["bigquery.tables.getData"], mechanism: "ASSUMES_ROLE:data-analyst-role", lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false },
  { id: "ap-007", identityId: "id-002", identityName: "mark.chen", resource: "secrets://prod-api-keys", resourceSensitivity: "critical", accessType: "Indirect", hopCount: 0, effectivePermissions: ["secretsmanager:GetSecretValue"], mechanism: "MEMBER_OF:group-devops-leads", lastConfirmed: "2026-07-28", cloudProvider: "AWS", blocked: false },
  { id: "ap-008", identityId: "id-101", identityName: "svc-payments-api", resource: "dynamodb://payments-table", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0, effectivePermissions: ["dynamodb:GetItem", "dynamodb:PutItem"], mechanism: "ASSUMES_ROLE:payments-service-role", lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false },

  // Shadow Access paths — resource-mediated privilege escalations invisible to native IAM tools
  // shadowAdmin:true — identity gains effective admin/root-level access through the shadow chain
  { id: "ap-009", identityId: "id-001", identityName: "jane.doe", resource: "iam://account-root-admin", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2, effectivePermissions: ["*"], mechanism: "ssm:StartSession → EC2:i-0abc123 → AssumeRole:AdminRole", lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true, adminRole: "iam://account-root-admin", hopChain: [
    { step: 1, from: "jane.doe", to: "ec2://i-0abc123 (payments-prod-worker)", mechanism: "ssm:StartSession", timestamp: "2026-07-31T08:00:00Z" },
    { step: 2, from: "ec2://i-0abc123", to: "iam://AdminInstanceProfile", mechanism: "EC2 Instance Profile → AssumeRole", timestamp: "2026-07-31T08:00:01Z" },
    { step: 3, from: "iam://AdminInstanceProfile", to: "iam://account-root-admin", mechanism: "iam:PassRole", timestamp: "2026-07-31T08:00:02Z" },
  ]},
  { id: "ap-010", identityId: "id-003", identityName: "priya.sharma", resource: "iam://data-admin-role", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1, effectivePermissions: ["iam:*", "s3:*"], mechanism: "gcloud compute ssh → GCE:data-pipeline-vm → WorkloadIdentity:data-admin", lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false, shadowAdmin: true, adminRole: "iam://data-admin-role", hopChain: [
    { step: 1, from: "priya.sharma", to: "gce://data-pipeline-vm", mechanism: "gcloud compute ssh", timestamp: "2026-07-30T11:20:00Z" },
    { step: 2, from: "gce://data-pipeline-vm", to: "iam://data-admin-role", mechanism: "Workload Identity → AssumeRole", timestamp: "2026-07-30T11:20:01Z" },
  ]},
  { id: "ap-011", identityId: "id-104", identityName: "svc-orphaned-etl", resource: "storage://raw-pii-data", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1, effectivePermissions: ["storage.objects.get", "storage.objects.list"], mechanism: "CloudFunction:etl-trigger → ServiceAccount:svc-orphaned-etl → storage.admin", lastConfirmed: "2026-07-10", cloudProvider: "GCP", blocked: false, shadowAdmin: false, hopChain: [
    { step: 1, from: "svc-orphaned-etl", to: "gcf://etl-trigger-fn", mechanism: "Cloud Function invocation", timestamp: "2026-07-10T03:00:00Z" },
    { step: 2, from: "gcf://etl-trigger-fn", to: "storage://raw-pii-data", mechanism: "storage.admin binding", timestamp: "2026-07-10T03:00:01Z" },
  ]},
  { id: "ap-012", identityId: "id-005", identityName: "alice.brooks (departed)", resource: "s3://finance-audit-logs", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2, effectivePermissions: ["s3:*"], mechanism: "AssumeRole:finance-auditor → EC2:i-0fin456 → s3:Full", lastConfirmed: "2026-07-25", cloudProvider: "AWS", blocked: false, shadowAdmin: false, hopChain: [
    { step: 1, from: "alice.brooks", to: "iam://finance-auditor-role", mechanism: "AssumeRole", timestamp: "2026-07-25T09:00:00Z" },
    { step: 2, from: "iam://finance-auditor-role", to: "ec2://i-0fin456", mechanism: "ec2:StartInstances", timestamp: "2026-07-25T09:00:01Z" },
    { step: 3, from: "ec2://i-0fin456", to: "s3://finance-audit-logs", mechanism: "Instance Profile → s3:FullAccess", timestamp: "2026-07-25T09:00:02Z" },
  ]},
];

// ─── Shadow Access derived views ─────────────────────────────────────────────

export const shadowAccessPaths = accessPaths.filter(p => p.accessType === "Shadow");

// Shadow Admins: identities who gain effective admin-level access via shadow access chains
export const shadowAdmins = [
  {
    identityId: "id-001",
    identityName: "jane.doe",
    identityType: "human",
    department: "Engineering",
    adminRole: "iam://account-root-admin",
    adminRoleLabel: "AWS Account Root Admin",
    effectivePermissions: ["*"],
    shadowPath: "jane.doe → EC2:i-0abc123 (payments-prod-worker) → AdminInstanceProfile → iam:PassRole → account-root-admin",
    pivotResource: "EC2:i-0abc123 (payments-prod-worker)",
    mechanism: "ssm:StartSession → EC2 Instance Profile → iam:PassRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-31",
    nativlyVisible: false,
    severity: "Catastrophic",
    riskNote: "Full wildcard (*) permissions — equivalent to cloud super-admin. Not visible in AWS IAM Analyzer because access is mediated through an EC2 instance profile, not a direct policy attachment.",
  },
  {
    identityId: "id-003",
    identityName: "priya.sharma",
    identityType: "human",
    department: "Data",
    adminRole: "iam://data-admin-role",
    adminRoleLabel: "GCP Data Admin",
    effectivePermissions: ["iam:*", "s3:*"],
    shadowPath: "priya.sharma → GCE:data-pipeline-vm → Workload Identity → data-admin-role",
    pivotResource: "GCE:data-pipeline-vm",
    mechanism: "gcloud compute ssh → Workload Identity Federation → AssumeRole",
    cloudProvider: "GCP",
    firstSeen: "2026-07-30",
    nativlyVisible: false,
    severity: "Catastrophic",
    riskNote: "iam:* and s3:* — can modify any IAM policy and read any S3 object in the project. Not visible in GCP Policy Analyzer because the escalation path runs through a VM's attached workload identity, not a direct IAM binding.",
  },
];

// Summary stats derived
export const accessSummary = {
  direct: accessPaths.filter(p => p.accessType === "Direct").length,
  indirect: accessPaths.filter(p => p.accessType === "Indirect").length,
  shadow: accessPaths.filter(p => p.accessType === "Shadow").length,
  total: accessPaths.length,
};

// ─── Risk Profiles ───────────────────────────────────────────────────────────

export const riskProfiles = identities.map(id => ({
  identityId: id.id,
  name: id.name,
  type: id.type,
  score: id.riskScore,
  band: id.riskScore >= 80 ? "Catastrophic" : id.riskScore >= 60 ? "Unacceptable" : id.riskScore >= 40 ? "Undesirable" : id.riskScore >= 20 ? "Acceptable" : "Desirable",
  factors: {
    exposure: Math.round(id.riskScore * 0.3 + Math.random() * 5),
    shadowPresence: accessPaths.some(p => p.identityId === id.id && p.accessType === "Shadow") ? 25 : 0,
    credentialHygiene: id.mfaEnabled ? Math.min(id.credentialAge / 20, 15) : id.credentialAge / 10,
    trustDecay: Math.random() * 10,
    dormantPrivilege: id.status === "departed" || id.status === "orphaned" ? 20 : Math.random() * 8,
    ownershipStatus: id.owner ? 0 : 20,
  },
}));

// ─── Delegation Chains ───────────────────────────────────────────────────────

export const delegationChains = {
  payments: {
    appName: "Payments",
    root: {
      id: "id-sys-001", name: "IdP System (Okta)", type: "system", children: [
        { id: "id-001", name: "jane.doe", type: "human", children: [
          { id: "id-101", name: "svc-payments-api", type: "service", children: [
            { id: "id-107", name: "svc-billing-sync", type: "service", children: [] },
          ]},
          { id: "id-105", name: "svc-old-payments-worker", type: "service", status: "orphaned", children: [] },
        ]},
        { id: "id-005", name: "alice.brooks", type: "human", status: "departed", children: [
          { id: "id-105b", name: "svc-finance-reporter", type: "service", status: "orphaned", children: [] },
        ]},
      ]
    }
  },
  dataPipeline: {
    appName: "Data Pipeline",
    root: {
      id: "id-sys-001", name: "IdP System (Okta)", type: "system", children: [
        { id: "id-003", name: "priya.sharma", type: "human", children: [
          { id: "id-102", name: "svc-data-ingest", type: "service", children: [] },
        ]},
        { id: "id-006", name: "raj.patel", type: "human", status: "departed", children: [
          { id: "id-104", name: "svc-orphaned-etl", type: "service", status: "orphaned", children: [] },
        ]},
      ]
    }
  },
  devops: {
    appName: "DevOps",
    root: {
      id: "id-sys-001", name: "IdP System (Okta)", type: "system", children: [
        { id: "id-002", name: "mark.chen", type: "human", children: [
          { id: "id-103", name: "svc-ci-runner", type: "service", children: [] },
          { id: "id-106", name: "svc-monitoring", type: "service", children: [] },
        ]},
        { id: "id-004", name: "tom.walker", type: "human", children: [] },
      ]
    }
  },
};

// ─── Identity Ownership (Accountability) ────────────────────────────────────

export const ownershipRecords = [
  { identityId: "id-001", grantId: "grant-001", resource: "s3://payments-prod", owner: "jane.doe", ownerStatus: "active", lastConfirmed: "2026-07-15", orphaned: false },
  { identityId: "id-005", grantId: "grant-002", resource: "s3://finance-audit-logs", owner: null, ownerStatus: "departed", lastConfirmed: "2026-05-01", orphaned: true, rootCause: "alice.brooks (departed 2026-06-01)" },
  { identityId: "id-104", grantId: "grant-003", resource: "storage://raw-pii-data", owner: null, ownerStatus: "departed", lastConfirmed: "2026-05-10", orphaned: true, rootCause: "raj.patel (departed 2026-05-15)" },
  { identityId: "id-105", grantId: "grant-004", resource: "rds://payments-db-prod", owner: null, ownerStatus: "departed", lastConfirmed: "2026-04-20", orphaned: true, rootCause: "alice.brooks (departed 2026-06-01)" },
  { identityId: "id-002", grantId: "grant-005", resource: "secrets://prod-api-keys", owner: "mark.chen", ownerStatus: "active", lastConfirmed: "2026-07-20", orphaned: false },
  { identityId: "id-003", grantId: "grant-006", resource: "bigquery://analytics-prod", owner: "priya.sharma", ownerStatus: "active", lastConfirmed: "2026-07-18", orphaned: false },
];

// ─── STRIDE / Threat Profile ─────────────────────────────────────────────────

export const strideFindingCounts = {
  S: { label: "Spoofing", count: 3, severity: "Unacceptable" },
  T: { label: "Tampering", count: 0, severity: "Desirable" },
  R: { label: "Repudiation", count: 4, severity: "Catastrophic" },
  I: { label: "Information disclosure", count: 5, severity: "Catastrophic" },
  D: { label: "Denial of service", count: 0, severity: "Desirable" },
  E: { label: "Elevation of privilege", count: 6, severity: "Catastrophic" },
};

export const mitreFindings = [
  { id: "mf-001", technique: "T1078", name: "Valid Accounts", tactic: "Initial Access", strideCategory: "S", identityId: "id-005", identityName: "alice.brooks", description: "Departed user account still active with valid credentials", severity: "Catastrophic" },
  { id: "mf-002", technique: "T1548.002", name: "Abuse Elevation Control Mechanism: Bypass User Account Control", tactic: "Privilege Escalation", strideCategory: "E", identityId: "id-001", identityName: "jane.doe", description: "Shadow access via EC2 instance profile leads to admin role assumption — jane.doe is a shadow admin", severity: "Catastrophic" },
  { id: "mf-004", technique: "T1078.004", name: "Cloud Accounts", tactic: "Defense Evasion", strideCategory: "R", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned service account with no owner — repudiation risk", severity: "Catastrophic" },
  { id: "mf-005", technique: "T1552.001", name: "Credentials in Files", tactic: "Credential Access", strideCategory: "I", identityId: "id-003", identityName: "priya.sharma", description: "Shadow access reaches data-admin role (iam:*, s3:*) via GCE workload identity — priya.sharma is a shadow admin", severity: "Catastrophic" },
  { id: "mf-006", technique: "T1530", name: "Data from Cloud Storage Object", tactic: "Collection", strideCategory: "I", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned service account can exfiltrate raw PII data from GCS", severity: "Catastrophic" },
  { id: "mf-007", technique: "T1548", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation", strideCategory: "E", identityId: "id-003", identityName: "priya.sharma", description: "GCE VM workload identity binding allows privilege escalation to data-admin", severity: "Unacceptable" },
];

// ─── Access Reviews ──────────────────────────────────────────────────────────

export const reviewCampaigns = [
  {
    id: "camp-001",
    name: "Q3 2026 Payments Access Review",
    scope: "payments",
    reviewer: "tom.walker",
    dueDate: "2026-08-15",
    totalItems: 22,
    approvedItems: 10,
    revokedItems: 4,
    pendingItems: 8,
    status: "in_progress",
    completionPct: 73,
  },
  {
    id: "camp-002",
    name: "Data Pipeline Quarterly Attestation",
    scope: "data-pipeline",
    reviewer: "priya.sharma",
    dueDate: "2026-08-30",
    totalItems: 14,
    approvedItems: 0,
    revokedItems: 0,
    pendingItems: 14,
    status: "pending",
    completionPct: 0,
  },
];

export const reviewItems = [
  { id: "ri-001", campaignId: "camp-001", identityName: "jane.doe", resource: "iam://account-root-admin", accessType: "Shadow", riskBand: "Catastrophic", owner: "jane.doe", decision: "pending", shadowAdmin: true },
  { id: "ri-002", campaignId: "camp-001", identityName: "alice.brooks", resource: "s3://finance-audit-logs", accessType: "Shadow", riskBand: "Catastrophic", owner: null, decision: "pending", shadowAdmin: false },
  { id: "ri-003", campaignId: "camp-001", identityName: "svc-payments-api", resource: "dynamodb://payments-table", accessType: "Indirect", riskBand: "Unacceptable", owner: "jane.doe", decision: "approved", shadowAdmin: false },
  { id: "ri-004", campaignId: "camp-001", identityName: "svc-old-payments-worker", resource: "rds://payments-db-prod", accessType: "Shadow", riskBand: "Catastrophic", owner: null, decision: "pending", shadowAdmin: false },
  { id: "ri-005", campaignId: "camp-001", identityName: "sara.jones", resource: "s3://payments-logs", accessType: "Direct", riskBand: "Acceptable", owner: "sara.jones", decision: "approved", shadowAdmin: false },
  { id: "ri-006", campaignId: "camp-001", identityName: "svc-billing-sync", resource: "rds://payments-db-prod", accessType: "Indirect", riskBand: "Undesirable", owner: "jane.doe", decision: "revoked", shadowAdmin: false },
  { id: "ri-007", campaignId: "camp-001", identityName: "jane.doe", resource: "rds://payments-db-prod", accessType: "Indirect", riskBand: "Unacceptable", owner: "jane.doe", decision: "approved", shadowAdmin: false },
  { id: "ri-008", campaignId: "camp-001", identityName: "alice.brooks", resource: "iam://finance-auditor-role", accessType: "Direct", riskBand: "Catastrophic", owner: null, decision: "pending", shadowAdmin: false },
];

// ─── JML / Lifecycle Events ──────────────────────────────────────────────────

export const jmlEvents = [
  { id: "jml-001", eventType: "leaver", identityName: "alice.brooks", triggeredAt: "2026-06-01", deprovisionedAt: null, status: "failed", liveAccess: 4, orphanedAccounts: ["svc-old-payments-worker", "svc-finance-reporter"] },
  { id: "jml-002", eventType: "leaver", identityName: "raj.patel", triggeredAt: "2026-05-15", deprovisionedAt: null, status: "failed", liveAccess: 3, orphanedAccounts: ["svc-orphaned-etl"] },
  { id: "jml-003", eventType: "leaver", identityName: "chris.huang", triggeredAt: "2026-04-01", deprovisionedAt: "2026-04-01T18:00:00Z", status: "success", liveAccess: 0, orphanedAccounts: [] },
  { id: "jml-004", eventType: "joiner", identityName: "sara.jones", triggeredAt: "2026-02-14", deprovisionedAt: null, status: "success", liveAccess: 2, orphanedAccounts: [] },
  { id: "jml-005", eventType: "mover", identityName: "mark.chen", triggeredAt: "2026-01-10", deprovisionedAt: null, status: "partial", liveAccess: 1, orphanedAccounts: [] },
];

export const orphanedAccounts = identities.filter(id => id.status === "orphaned");

// ─── Unified Impact Analysis — Graph Data ────────────────────────────────────

export const impactGraph = {
  nodes: [
    { id: "jane.doe", label: "jane.doe", type: "human", riskScore: 72, group: "origin" },
    { id: "ec2-i0abc123", label: "EC2 i-0abc123", type: "resource", sensitivity: "high", group: "hop" },
    { id: "admin-role", label: "AdminRole", type: "role", sensitivity: "critical", group: "compromised" },
    { id: "s3-payments-prod", label: "s3://payments-prod", type: "resource", sensitivity: "high", group: "reachable" },
    { id: "rds-payments-db", label: "rds://payments-db-prod", type: "resource", sensitivity: "critical", group: "reachable" },
    { id: "secrets-api-keys", label: "secrets://prod-api-keys", type: "resource", sensitivity: "critical", group: "reachable" },
    { id: "svc-payments-api", label: "svc-payments-api", type: "service", riskScore: 67, group: "downstream" },
    { id: "dynamo-payments", label: "dynamodb://payments-table", type: "resource", sensitivity: "high", group: "reachable" },
    { id: "iam-account-root", label: "iam://account-root-admin", type: "role", sensitivity: "critical", group: "compromised" },
    { id: "kms-prod", label: "kms://prod-key-ring", type: "resource", sensitivity: "critical", group: "reachable" },
  ],
  links: [
    { source: "jane.doe", target: "ec2-i0abc123", type: "Shadow", mechanism: "ssm:StartSession" },
    { source: "ec2-i0abc123", target: "admin-role", type: "Shadow", mechanism: "Instance Profile" },
    { source: "admin-role", target: "s3-payments-prod", type: "Direct", mechanism: "s3:*" },
    { source: "admin-role", target: "rds-payments-db", type: "Direct", mechanism: "rds:*" },
    { source: "admin-role", target: "secrets-api-keys", type: "Direct", mechanism: "secretsmanager:*" },
    { source: "admin-role", target: "iam-account-root", type: "Shadow", mechanism: "iam:PassRole" },
    { source: "jane.doe", target: "s3-payments-prod", type: "Direct", mechanism: "HAS_POLICY" },
    { source: "jane.doe", target: "rds-payments-db", type: "Indirect", mechanism: "MEMBER_OF:group-db-readers" },
    { source: "svc-payments-api", target: "dynamo-payments", type: "Indirect", mechanism: "ASSUMES_ROLE" },
    { source: "admin-role", target: "kms-prod", type: "Direct", mechanism: "kms:*" },
  ],
};

// ─── Dashboard summary ───────────────────────────────────────────────────────

export const dashboardSummary = {
  totalIdentities: identities.length,
  humanIdentities: identities.filter(i => i.type === "human").length,
  serviceIdentities: identities.filter(i => i.type === "service").length,
  orphanedAccounts: orphanedAccounts.length,
  shadowPaths: accessPaths.filter(p => p.accessType === "Shadow").length,
  shadowAdminCount: 2,
  criticalFindings: riskProfiles.filter(r => r.band === "Catastrophic").length,
  orphanedAccountability: ownershipRecords.filter(o => o.orphaned).length,
  activeReviewCampaigns: reviewCampaigns.filter(c => c.status === "in_progress").length,
  reviewCompletionPct: reviewCampaigns[0].completionPct,
  topRiskIdentity: riskProfiles.sort((a, b) => b.score - a.score)[0],
  overallRiskBand: "Unacceptable",
};
