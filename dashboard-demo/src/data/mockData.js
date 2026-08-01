// ITAG Mock Data Layer
// Ingested from live-style API payloads: AWS, GCP, Azure, Google Workspace, Okta, Workday HR
// UI-facing fields stay stable; `api` / `sources` hold provider-native shapes.
// Per-app lineage + creation audit logs follow I-TAG official AppRecord / PersistedCreationEdge shapes.

import {
  apps,
  creationEdges,
  appActivityLogs,
  buildDelegationChains,
  getAppActivityLogs,
  getCreationEdgesForApp,
} from './appLineage.js';
export { apps, creationEdges, appActivityLogs, getAppActivityLogs, getCreationEdgesForApp };

export const tenant = {
  name: "Unosecur",
  id: "tenant-001",
  lastScan: "2026-07-31T14:22:00Z",
  cloudProviders: ["AWS", "GCP", "Azure"],
  identityProviders: ["Okta", "Google Workspace"],
  hrSystems: ["Workday"],
};

// ─── Connected data sources (API connectors) ─────────────────────────────────

export const dataSources = [
  {
    id: "src-aws",
    provider: "AWS",
    category: "cloud",
    status: "connected",
    // Audit / lineage integration floor for this connector
    integratedAt: "2022-01-01",
    accountId: "481516234210",
    region: "us-east-1",
    apis: [
      "iam:ListUsers", "iam:ListRoles", "iam:GetPolicyVersion", "iam:ListAttachedRolePolicies",
      "sts:GetCallerIdentity", "ec2:DescribeInstances", "ec2:DescribeIamInstanceProfileAssociations",
      "s3:GetBucketPolicy", "ssm:DescribeSessions", "lambda:GetFunction", "organizations:ListAccounts",
    ],
    lastSync: "2026-07-31T14:18:00Z",
  },
  {
    id: "src-gcp",
    provider: "GCP",
    category: "cloud",
    status: "connected",
    integratedAt: "2022-01-01",
    projectId: "acme-prod-4821",
    organizationId: "organizations/958472019384",
    apis: [
      "cloudresourcemanager.projects.getIamPolicy",
      "iam.serviceAccounts.list",
      "iam.roles.get",
      "compute.instances.get",
      "container.clusters.get",
      "bigquery.datasets.getIamPolicy",
      "storage.buckets.getIamPolicy",
    ],
    lastSync: "2026-07-31T14:19:00Z",
  },
  {
    id: "src-azure",
    provider: "Azure",
    category: "cloud",
    status: "connected",
    integratedAt: "2022-01-01",
    tenantId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    subscriptionId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    apis: [
      "Microsoft.Authorization/roleAssignments/read",
      "Microsoft.Authorization/roleDefinitions/read",
      "Microsoft.Graph/users",
      "Microsoft.Graph/servicePrincipals",
      "Microsoft.ManagedIdentity/userAssignedIdentities/read",
      "Microsoft.KeyVault/vaults/read",
      "Microsoft.Storage/storageAccounts/read",
    ],
    lastSync: "2026-07-31T14:17:00Z",
  },
  {
    id: "src-okta",
    provider: "Okta",
    category: "idp",
    status: "connected",
    integratedAt: "2021-06-01",
    orgUrl: "https://acme.okta.com",
    apis: [
      "GET /api/v1/users",
      "GET /api/v1/groups",
      "GET /api/v1/apps",
      "GET /api/v1/users/{id}/factors",
      "GET /api/v1/logs",
    ],
    lastSync: "2026-07-31T14:20:00Z",
  },
  {
    id: "src-gws",
    provider: "Google Workspace",
    category: "idp",
    status: "connected",
    integratedAt: "2022-06-01",
    customerId: "C01acme42",
    domain: "acme.com",
    apis: [
      "directory.users.list",
      "directory.groups.list",
      "directory.members.list",
      "directory.roleAssignments.list",
      "reports.activities.list",
    ],
    lastSync: "2026-07-31T14:16:00Z",
  },
  {
    id: "src-workday",
    provider: "Workday",
    category: "hr",
    status: "connected",
    integratedAt: "2021-01-01",
    tenant: "acme_preview",
    apis: [
      "GET /ccx/api/v1/acme/workers",
      "GET /ccx/api/v1/acme/workers/{id}",
      "GET /ccx/api/v1/acme/orgs",
      "GET /ccx/api/v1/acme/supervisoryOrganizations",
    ],
    lastSync: "2026-07-31T14:15:00Z",
  },
];

// ─── Identities (correlated across Okta + Workspace + HR + cloud IAM) ────────

export const identities = [
  {
    id: "id-001", name: "jane.doe", type: "human", email: "jane.doe@acme.com", department: "Engineering",
    status: "active", createdBy: "id-sys-001", createdAt: "2023-01-15", lastActive: "2026-07-31",
    // Simulated demo overlay — NOT an Ownership/Lineage engine finding
    compromisedAt: "2023-04-01",
    provenanceState: "explained_absence", gapReason: "idp_directory_bootstrap",
    originator: "No originator", originatorId: null,
    mfaEnabled: true, credentialAge: 45, owner: "id-001", ownerName: "Jane Doe", riskScore: 100, apps: ["payments"],
    sources: {
      okta: { id: "00u1jane9doe0kta", status: "ACTIVE", login: "jane.doe@acme.com", groups: ["Engineering", "AWS-PowerUsers", "Payments-App"], mfaTypes: ["okta_verify", "webauthn"] },
      googleWorkspace: { id: "118294756019384756201", primaryEmail: "jane.doe@acme.com", orgUnitPath: "/Engineering", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-10482", workerType: "Employee", employmentStatus: "Active", hireDate: "2023-01-15", managerEmployeeId: "WD-10001", costCenter: "ENG-220" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/jane.doe", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
      azure: { objectId: "8f3a2c1b-4d5e-6f70-8192-a3b4c5d6e7f8", userPrincipalName: "jane.doe@acme.com" },
    },
  },
  {
    id: "id-002", name: "mark.chen", type: "human", email: "mark.chen@acme.com", department: "DevOps",
    status: "active", createdBy: "id-sys-001", createdAt: "2022-08-01", lastActive: "2026-07-30",
    provenanceState: "explained_absence", gapReason: "idp_directory_bootstrap",
    originator: "No originator", originatorId: null, fanOut: 5,
    mfaEnabled: true, credentialAge: 12, owner: "id-002", ownerName: "Mark Chen", riskScore: 31, apps: ["devops"],
    sources: {
      okta: { id: "00u2mark8chen0kta", status: "ACTIVE", login: "mark.chen@acme.com", groups: ["DevOps", "GCP-Admins", "GKE-Operators"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "109384756201938475620", primaryEmail: "mark.chen@acme.com", orgUnitPath: "/DevOps", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-09831", workerType: "Employee", employmentStatus: "Active", hireDate: "2022-08-01", managerEmployeeId: "WD-10001", costCenter: "OPS-110" },
      gcp: { principal: "user:mark.chen@acme.com", memberType: "user" },
      azure: { objectId: "1a2b3c4d-5e6f-7081-9203-b4c5d6e7f809", userPrincipalName: "mark.chen@acme.com" },
    },
  },
  {
    id: "id-003", name: "priya.sharma", type: "human", email: "priya.sharma@acme.com", department: "Data",
    status: "active", createdBy: "id-sys-001", createdAt: "2023-04-20", lastActive: "2026-07-29",
    mfaEnabled: false, credentialAge: 180, owner: "id-003", ownerName: "Priya Sharma", riskScore: 58, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u3priy7shar0kta", status: "ACTIVE", login: "priya.sharma@acme.com", groups: ["Data", "GCP-Data-Analysts"], mfaTypes: [] },
      googleWorkspace: { id: "104857392018374650192", primaryEmail: "priya.sharma@acme.com", orgUnitPath: "/Data", isAdmin: false, isEnrolledIn2Sv: false },
      hr: { employeeId: "WD-11204", workerType: "Employee", employmentStatus: "Active", hireDate: "2023-04-20", managerEmployeeId: "WD-10044", costCenter: "DATA-300" },
      gcp: { principal: "user:priya.sharma@acme.com", memberType: "user" },
    },
  },
  {
    id: "id-004", name: "tom.walker", type: "human", email: "tom.walker@acme.com", department: "Security",
    status: "active", createdBy: null, createdAt: "2021-11-01", lastActive: "2026-07-31",
    mfaEnabled: true, credentialAge: 8, owner: "id-004", ownerName: "Tom Walker", riskScore: 22, apps: ["devops"],
    sources: {
      okta: { id: "00u4tomw6alker0kt", status: "ACTIVE", login: "tom.walker@acme.com", groups: ["Security", "AWS-Security-Audit", "Access-Reviewers"], mfaTypes: ["webauthn", "okta_verify"] },
      googleWorkspace: { id: "112233445566778899001", primaryEmail: "tom.walker@acme.com", orgUnitPath: "/Security", isAdmin: true, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-08712", workerType: "Employee", employmentStatus: "Active", hireDate: "2021-11-01", managerEmployeeId: "WD-10001", costCenter: "SEC-010" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/tom.walker", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-005", name: "alice.brooks", type: "human", email: "alice.brooks@acme.com", department: "Finance",
    status: "departed", createdBy: null, createdAt: "2020-03-10", lastActive: "2026-06-01",
    departedAt: "2026-06-01",
    // Simulated demo overlay — NOT an Ownership/Lineage engine finding
    compromisedAt: "2021-06-01",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, fanOut: 6, creatorStatus: "departed",
    mfaEnabled: false, credentialAge: 420, owner: null, ownerName: null, riskScore: 95, apps: ["payments"],
    sources: {
      okta: { id: "00u5alic5broo0kta", status: "DEPROVISIONED", login: "alice.brooks@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-06-01T18:00:00.000Z" },
      googleWorkspace: { id: "119988776655443322110", primaryEmail: "alice.brooks@acme.com", orgUnitPath: "/Finance", suspended: true, deletionTime: null },
      hr: { employeeId: "WD-06118", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2020-03-10", terminationDate: "2026-06-01", managerEmployeeId: "WD-10022", costCenter: "FIN-400" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/alice.brooks", stillActiveInCloud: true },
    },
  },
  {
    id: "id-006", name: "raj.patel", type: "human", email: "raj.patel@acme.com", department: "Engineering",
    status: "departed", createdBy: null, createdAt: "2021-09-01", lastActive: "2026-05-15",
    departedAt: "2026-05-15",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, creatorStatus: "departed",
    mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, riskScore: 88, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u6rajp4atel0kta", status: "DEPROVISIONED", login: "raj.patel@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-05-15T17:00:00.000Z" },
      googleWorkspace: { id: "101010101010101010101", primaryEmail: "raj.patel@acme.com", orgUnitPath: "/Engineering", suspended: true },
      hr: { employeeId: "WD-07944", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2021-09-01", terminationDate: "2026-05-15", managerEmployeeId: "WD-10001", costCenter: "ENG-220" },
      gcp: { principal: "user:raj.patel@acme.com", stillActiveInCloud: true },
    },
  },
  {
    id: "id-007", name: "sara.jones", type: "human", email: "sara.jones@acme.com", department: "Engineering",
    status: "active", createdBy: "id-sys-001", createdAt: "2024-02-14", lastActive: "2026-07-31",
    mfaEnabled: true, credentialAge: 3, owner: "id-007", ownerName: "Sara Jones", riskScore: 18, apps: ["payments"],
    sources: {
      okta: { id: "00u7sara3jone0kta", status: "ACTIVE", login: "sara.jones@acme.com", groups: ["Engineering", "Payments-App"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "123456789012345678901", primaryEmail: "sara.jones@acme.com", orgUnitPath: "/Engineering", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-13055", workerType: "Employee", employmentStatus: "Active", hireDate: "2024-02-14", managerEmployeeId: "WD-10482", costCenter: "ENG-220" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/sara.jones", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-008", name: "lena.okonkwo", type: "human", email: "lena.okonkwo@acme.com", department: "Platform",
    status: "active", createdBy: "id-sys-001", createdAt: "2022-03-18", lastActive: "2026-07-31",
    provenanceState: "explained_absence", gapReason: "idp_directory_bootstrap",
    originator: "No originator", originatorId: null, fanOut: 2,
    mfaEnabled: true, credentialAge: 28, owner: "id-008", ownerName: "Lena Okonkwo", riskScore: 81, apps: ["devops"],
    sources: {
      okta: { id: "00u8lena2okon0kta", status: "ACTIVE", login: "lena.okonkwo@acme.com", groups: ["Platform", "Azure-Contributors", "AWS-PowerUsers"], mfaTypes: ["webauthn"] },
      googleWorkspace: { id: "148295761039485761039", primaryEmail: "lena.okonkwo@acme.com", orgUnitPath: "/Platform", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-09102", workerType: "Employee", employmentStatus: "Active", hireDate: "2022-03-18", managerEmployeeId: "WD-10001", costCenter: "PLT-150" },
      azure: { objectId: "9e8d7c6b-5a49-3827-1605-f4e3d2c1b0a9", userPrincipalName: "lena.okonkwo@acme.com" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/lena.okonkwo", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-009", name: "diego.ramos", type: "human", email: "diego.ramos@acme.com", department: "Engineering",
    status: "active", createdBy: "id-sys-001", createdAt: "2024-06-01", lastActive: "2026-07-22",
    mfaEnabled: true, credentialAge: 95, owner: "id-009", ownerName: "Diego Ramos", riskScore: 63, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u9dieg1ramo0kta", status: "ACTIVE", login: "diego.ramos@acme.com", groups: ["Engineering", "GCP-Developers", "Contractors-Extended"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "156789012345678901234", primaryEmail: "diego.ramos@acme.com", orgUnitPath: "/Engineering/Contractors", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-14120", workerType: "Contingent Worker", employmentStatus: "Active", hireDate: "2024-06-01", managerEmployeeId: "WD-10482", costCenter: "ENG-220" },
      gcp: { principal: "user:diego.ramos@acme.com", memberType: "user" },
    },
  },
  {
    id: "id-010", name: "mei.lin", type: "human", email: "mei.lin@acme.com", department: "Security",
    status: "active", createdBy: "id-sys-001", createdAt: "2023-08-12", lastActive: "2026-07-31",
    mfaEnabled: true, credentialAge: 6, owner: "id-010", ownerName: "Mei Lin", riskScore: 19, apps: ["devops"],
    sources: {
      okta: { id: "00u0meil0linx0kta", status: "ACTIVE", login: "mei.lin@acme.com", groups: ["Security", "AWS-Security-Audit", "Access-Reviewers"], mfaTypes: ["webauthn", "okta_verify"] },
      googleWorkspace: { id: "167890123456789012345", primaryEmail: "mei.lin@acme.com", orgUnitPath: "/Security", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-11888", workerType: "Employee", employmentStatus: "Active", hireDate: "2023-08-12", managerEmployeeId: "WD-08712", costCenter: "SEC-010" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/mei.lin", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-011", name: "owen.blake", type: "human", email: "owen.blake@acme.com", department: "DevOps",
    status: "departed", createdBy: null, createdAt: "2021-05-01", lastActive: "2026-04-30",
    departedAt: "2026-04-30",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, creatorStatus: "departed",
    mfaEnabled: false, credentialAge: 510, owner: null, ownerName: null, riskScore: 93, apps: ["devops"],
    sources: {
      okta: { id: "00u1owen9blak0kta", status: "DEPROVISIONED", login: "owen.blake@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-04-30T18:00:00.000Z" },
      googleWorkspace: { id: "178901234567890123456", primaryEmail: "owen.blake@acme.com", orgUnitPath: "/DevOps", suspended: true },
      hr: { employeeId: "WD-07221", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2021-05-01", terminationDate: "2026-04-30", managerEmployeeId: "WD-10001", costCenter: "OPS-110" },
      gcp: { principal: "user:owen.blake@acme.com", stillActiveInCloud: true },
      azure: { objectId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789", userPrincipalName: "owen.blake@acme.com", accountEnabled: true },
    },
  },
  {
    id: "id-012", name: "fatima.hassan", type: "human", email: "fatima.hassan@acme.com", department: "Product",
    status: "active", createdBy: "id-sys-001", createdAt: "2023-11-05", lastActive: "2026-07-30",
    mfaEnabled: true, credentialAge: 40, owner: "id-012", ownerName: "Fatima Hassan", riskScore: 47, apps: ["payments"],
    sources: {
      okta: { id: "00u2fati8hass0kta", status: "ACTIVE", login: "fatima.hassan@acme.com", groups: ["Product", "Payments-App-Readers"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "189012345678901234567", primaryEmail: "fatima.hassan@acme.com", orgUnitPath: "/Product", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-12501", workerType: "Employee", employmentStatus: "Active", hireDate: "2023-11-05", managerEmployeeId: "WD-10022", costCenter: "PROD-500" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/fatima.hassan", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-013", name: "chris.nguyen", type: "human", email: "chris.nguyen@acme.com", department: "SRE",
    status: "active", createdBy: "id-sys-001", createdAt: "2022-01-20", lastActive: "2026-07-31",
    mfaEnabled: true, credentialAge: 15, owner: "id-013", ownerName: "Chris Nguyen", riskScore: 76, apps: ["devops"],
    sources: {
      okta: { id: "00u3chri7nguy0kta", status: "ACTIVE", login: "chris.nguyen@acme.com", groups: ["SRE", "GCP-SRE-Oncall", "AWS-BreakGlass"], mfaTypes: ["webauthn"] },
      googleWorkspace: { id: "190123456789012345678", primaryEmail: "chris.nguyen@acme.com", orgUnitPath: "/SRE", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-08540", workerType: "Employee", employmentStatus: "Active", hireDate: "2022-01-20", managerEmployeeId: "WD-09831", costCenter: "OPS-110" },
      gcp: { principal: "user:chris.nguyen@acme.com", memberType: "user" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/chris.nguyen", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-014", name: "nora.whitfield", type: "human", email: "nora.whitfield@acme.com", department: "Finance",
    status: "departed", createdBy: null, createdAt: "2019-09-01", lastActive: "2026-02-28",
    departedAt: "2026-02-28",
    mfaEnabled: true, credentialAge: 60, owner: null, ownerName: null, riskScore: 22, apps: ["payments"],
    sources: {
      okta: { id: "00u4nora6whit0kta", status: "DEPROVISIONED", login: "nora.whitfield@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-03-01T12:00:00.000Z" },
      googleWorkspace: { id: "101234567890123456789", primaryEmail: "nora.whitfield@acme.com", orgUnitPath: "/Finance", suspended: true, deletionTime: "2026-03-05T00:00:00.000Z" },
      hr: { employeeId: "WD-04110", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2019-09-01", terminationDate: "2026-02-28", managerEmployeeId: "WD-10001", costCenter: "FIN-400" },
      azure: { objectId: "f1e2d3c4-b5a6-9788-0011-223344556677", userPrincipalName: "nora.whitfield@acme.com", accountEnabled: false },
    },
  },
  {
    id: "id-015", name: "kai.sato", type: "human", email: "kai.sato@acme.com", department: "Engineering",
    status: "active", createdBy: "id-sys-001", createdAt: "2026-05-12", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 80, owner: "id-015", ownerName: "Kai Sato", riskScore: 69, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u5kais5ato0kta", status: "ACTIVE", login: "kai.sato@acme.com", groups: ["Engineering", "Interns", "AWS-Developers", "GCP-Editors"], mfaTypes: [] },
      googleWorkspace: { id: "112345678901234567890", primaryEmail: "kai.sato@acme.com", orgUnitPath: "/Engineering/Interns", isAdmin: false, isEnrolledIn2Sv: false },
      hr: { employeeId: "WD-16002", workerType: "Intern", employmentStatus: "Active", hireDate: "2026-05-12", managerEmployeeId: "WD-10482", costCenter: "ENG-220" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/kai.sato", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
      gcp: { principal: "user:kai.sato@acme.com", memberType: "user" },
    },
  },
  // First-known users — provisioned before audit retention; no reliable creator in logs
  {
    id: "id-016", name: "henry.cole", type: "human", email: "henry.cole@acme.com", department: "Finance",
    status: "active", createdBy: null, createdAt: "2018-04-01", lastActive: "2026-07-28",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null,
    mfaEnabled: true, credentialAge: 900, owner: "id-016", ownerName: "Henry Cole", riskScore: 58, apps: ["payments"],
    sources: {
      okta: { id: "00u6henr4cole0kta", status: "ACTIVE", login: "henry.cole@acme.com", groups: ["Finance", "Payments-App"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "120111222333444555666", primaryEmail: "henry.cole@acme.com", orgUnitPath: "/Finance", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-03210", workerType: "Employee", employmentStatus: "Active", hireDate: "2018-04-01", managerEmployeeId: "WD-10022", costCenter: "FIN-400" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/henry.cole", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-017", name: "maya.singh", type: "human", email: "maya.singh@acme.com", department: "Finance",
    status: "active", createdBy: null, createdAt: "2019-01-20", lastActive: "2026-07-30",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null,
    mfaEnabled: true, credentialAge: 700, owner: "id-017", ownerName: "Maya Singh", riskScore: 52, apps: ["payments"],
    sources: {
      okta: { id: "00u7maya3sing0kta", status: "ACTIVE", login: "maya.singh@acme.com", groups: ["Finance", "Payments-App-Readers"], mfaTypes: ["okta_verify", "webauthn"] },
      googleWorkspace: { id: "121222333444555666777", primaryEmail: "maya.singh@acme.com", orgUnitPath: "/Finance", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-03880", workerType: "Employee", employmentStatus: "Active", hireDate: "2019-01-20", managerEmployeeId: "WD-10022", costCenter: "FIN-400" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/maya.singh", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-018", name: "elise.moran", type: "human", email: "elise.moran@acme.com", department: "Data",
    status: "active", createdBy: null, createdAt: "2020-11-01", lastActive: "2026-07-29",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null,
    mfaEnabled: true, credentialAge: 520, owner: "id-018", ownerName: "Elise Moran", riskScore: 61, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u8elis2mora0kta", status: "ACTIVE", login: "elise.moran@acme.com", groups: ["Data", "GCP-Data-Analysts"], mfaTypes: ["okta_verify"] },
      googleWorkspace: { id: "122333444555666777888", primaryEmail: "elise.moran@acme.com", orgUnitPath: "/Data", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-05501", workerType: "Employee", employmentStatus: "Active", hireDate: "2020-11-01", managerEmployeeId: "WD-10044", costCenter: "DATA-300" },
      gcp: { principal: "user:elise.moran@acme.com", memberType: "user" },
    },
  },
  {
    id: "id-019", name: "quinn.adebayo", type: "human", email: "quinn.adebayo@acme.com", department: "DevOps",
    status: "active", createdBy: null, createdAt: "2019-07-15", lastActive: "2026-07-31",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null,
    mfaEnabled: true, credentialAge: 640, owner: "id-019", ownerName: "Quinn Adebayo", riskScore: 55, apps: ["devops"],
    sources: {
      okta: { id: "00u9quin1adeb0kta", status: "ACTIVE", login: "quinn.adebayo@acme.com", groups: ["DevOps", "AWS-PowerUsers"], mfaTypes: ["webauthn"] },
      googleWorkspace: { id: "123444555666777888999", primaryEmail: "quinn.adebayo@acme.com", orgUnitPath: "/DevOps", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-04440", workerType: "Employee", employmentStatus: "Active", hireDate: "2019-07-15", managerEmployeeId: "WD-10001", costCenter: "OPS-110" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/quinn.adebayo", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-020", name: "claire.nguyen", type: "human", email: "claire.nguyen@acme.com", department: "Product",
    status: "departed", createdBy: "id-sys-001", createdAt: "2022-06-01", lastActive: "2026-03-15",
    departedAt: "2026-03-15",
    mfaEnabled: false, credentialAge: 210, owner: null, ownerName: null, riskScore: 76, apps: ["payments"],
    sources: {
      okta: { id: "00u0clai8nguy0kta", status: "DEPROVISIONED", login: "claire.nguyen@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-03-15T19:00:00.000Z" },
      googleWorkspace: { id: "124555666777888999000", primaryEmail: "claire.nguyen@acme.com", orgUnitPath: "/Product", suspended: true },
      hr: { employeeId: "WD-09821", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2022-06-01", terminationDate: "2026-03-15", managerEmployeeId: "WD-10022", costCenter: "PRD-210" },
      azure: { objectId: "c1a1re00-2222-4333-8444-555566667777", userPrincipalName: "claire.nguyen@acme.com", accountEnabled: true },
    },
  },
  {
    id: "id-021", name: "derek.frost", type: "human", email: "derek.frost@acme.com", department: "Security",
    status: "departed", createdBy: "id-sys-001", createdAt: "2021-02-10", lastActive: "2026-01-20",
    departedAt: "2026-01-20",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, creatorStatus: "departed", fanOut: 3,
    mfaEnabled: false, credentialAge: 540, owner: null, ownerName: null, riskScore: 90, apps: ["devops"],
    sources: {
      okta: { id: "00u1dere7fros0kta", status: "DEPROVISIONED", login: "derek.frost@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-01-20T18:30:00.000Z" },
      googleWorkspace: { id: "125666777888999000111", primaryEmail: "derek.frost@acme.com", orgUnitPath: "/Security", suspended: true },
      hr: { employeeId: "WD-06770", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2021-02-10", terminationDate: "2026-01-20", managerEmployeeId: "WD-08712", costCenter: "SEC-010" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/derek.frost", stillActiveInCloud: true },
    },
  },
  {
    id: "id-022", name: "helena.cho", type: "human", email: "helena.cho@acme.com", department: "Engineering",
    status: "departed", createdBy: "id-sys-001", createdAt: "2023-01-09", lastActive: "2026-07-01",
    departedAt: "2026-07-01",
    mfaEnabled: true, credentialAge: 30, owner: null, ownerName: null, riskScore: 18, apps: ["data-pipeline"],
    sources: {
      okta: { id: "00u2hele6cho0kta", status: "DEPROVISIONED", login: "helena.cho@acme.com", groups: [], mfaTypes: [], statusChanged: "2026-07-01T17:00:00.000Z" },
      googleWorkspace: { id: "126777888999000111222", primaryEmail: "helena.cho@acme.com", orgUnitPath: "/Engineering", suspended: true, deletionTime: "2026-07-08T00:00:00.000Z" },
      hr: { employeeId: "WD-15110", workerType: "Employee", employmentStatus: "Terminated", hireDate: "2023-01-09", terminationDate: "2026-07-01", managerEmployeeId: "WD-10482", costCenter: "ENG-220" },
      gcp: { principal: "user:helena.cho@acme.com", stillActiveInCloud: false },
    },
  },
  /**
   * Out-of-population creator for payments fan-out.
   * No IdP child edge — herself hangs under the connector hub (No originator);
   * her NHIs nest under her: Connector → sofia.reyes → svc-sofia-*.
   */
  {
    id: "id-023", name: "sofia.reyes", type: "human", email: "sofia.reyes@acme.com", department: "Platform",
    status: "active", createdBy: null, createdAt: "2022-11-01", lastActive: "2026-07-31",
    provenanceState: "unexplained", gapReason: "unexplained",
    originator: "No originator", originatorId: null, fanOut: 6, creatorStatus: "active",
    mfaEnabled: true, credentialAge: 60, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 36, apps: ["payments"],
    sources: {
      okta: { id: "00u3sofi5reye0kta", status: "ACTIVE", login: "sofia.reyes@acme.com", groups: ["Platform", "AWS-PowerUsers"], mfaTypes: ["okta_verify", "webauthn"] },
      googleWorkspace: { id: "127888999000111222333", primaryEmail: "sofia.reyes@acme.com", orgUnitPath: "/Platform", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-14280", workerType: "Employee", employmentStatus: "Active", hireDate: "2022-11-01", managerEmployeeId: "WD-09102", costCenter: "PLT-150" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/sofia.reyes", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  /**
   * Out-of-population creator for devops NHIs.
   * Hub path: Connector → marcus.vale → svc-marcus-*.
   */
  {
    id: "id-024", name: "marcus.vale", type: "human", email: "marcus.vale@acme.com", department: "SRE",
    status: "active", createdBy: null, createdAt: "2023-06-01", lastActive: "2026-07-30",
    provenanceState: "unexplained", gapReason: "unexplained",
    originator: "No originator", originatorId: null, fanOut: 2, creatorStatus: "active",
    mfaEnabled: true, credentialAge: 40, owner: "id-024", ownerName: "Marcus Vale", riskScore: 28, apps: ["devops"],
    sources: {
      okta: { id: "00u4marc4vale0kta", status: "ACTIVE", login: "marcus.vale@acme.com", groups: ["SRE", "AWS-BreakGlass"], mfaTypes: ["webauthn"] },
      googleWorkspace: { id: "128999000111222333444", primaryEmail: "marcus.vale@acme.com", orgUnitPath: "/SRE", isAdmin: false, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-14802", workerType: "Employee", employmentStatus: "Active", hireDate: "2023-06-01", managerEmployeeId: "WD-08540", costCenter: "OPS-110" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/marcus.vale", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },

  // Service / workload identities from cloud IAM APIs
  {
    id: "id-101", name: "svc-payments-api", type: "service", email: null, department: "Payments",
    status: "active", createdBy: "id-001", createdAt: "2023-02-01", lastActive: "2026-07-31",
    provenanceState: "recorded", originator: "jane.doe", originatorId: "id-001", generation: 1, fanOut: 1,
    mfaEnabled: false, credentialAge: 320, owner: "id-001", ownerName: "jane.doe", ownerKind: "user",
    ownershipState: "owned", riskScore: 67, riskFactorsFiring: 1, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-payments-api",
        path: "/service-roles/",
        createDate: "2023-02-01T12:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/PaymentsApiAccess"],
        instanceProfileArn: "arn:aws:iam::481516234210:instance-profile/svc-payments-api",
      },
      hr: null,
      okta: null,
    },
  },
  {
    id: "id-102", name: "svc-data-ingest", type: "service", email: null, department: "Data",
    status: "active", createdBy: "id-003", createdAt: "2023-05-10", lastActive: "2026-07-30",
    mfaEnabled: false, credentialAge: 210, owner: "id-003", ownerName: "Priya Sharma", riskScore: 54, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-data-ingest@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "102938475610293847561",
        oauth2ClientId: "102938475610293847561",
        disabled: false,
      },
    },
  },
  {
    id: "id-103", name: "svc-ci-runner", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-002", createdAt: "2022-09-01", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 45, owner: "team-platform", ownerName: "team-platform", ownerKind: "team",
    ownershipState: "owned", ownerAttestedAt: "2026-07-22", riskScore: 41, riskFactorsFiring: 1, apps: ["devops"],
    sources: {
      gcp: {
        email: "svc-ci-runner@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "198273645019827364501",
        disabled: false,
      },
      azure: {
        objectId: "c0ffee00-1234-5678-9abc-def012345678",
        appId: "a11ce000-aaaa-bbbb-cccc-ddddeeeeffff",
        displayName: "svc-ci-runner",
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-104", name: "svc-orphaned-etl", type: "service", email: null, department: "Data",
    status: "orphaned", createdBy: "id-006", createdAt: "2021-10-01", lastActive: "2026-07-10",
    mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, ownershipState: "unowned",
    riskScore: 91, riskFactorsFiring: 2, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-orphaned-etl@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "111222333444555666777",
        disabled: false,
        createdBy: "raj.patel@acme.com",
      },
    },
  },
  {
    id: "id-105", name: "svc-old-payments-worker", type: "service", email: null, department: "Payments",
    status: "orphaned", createdBy: "id-005", createdAt: "2020-04-15", lastActive: "2026-06-20",
    mfaEnabled: false, credentialAge: 460, owner: null, ownerName: null, ownershipState: "unowned",
    riskScore: 97, riskFactorsFiring: 3, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-old-payments-worker",
        path: "/legacy/",
        createDate: "2020-04-15T09:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/LegacyPaymentsWorker"],
      },
    },
  },
  {
    id: "id-106", name: "svc-monitoring", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-002", createdAt: "2023-01-01", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 90, owner: "team-platform", ownerName: "team-platform", ownerKind: "team",
    ownershipState: "owned", riskScore: 29, riskFactorsFiring: 1, apps: ["devops"],
    sources: {
      aws: { roleArn: "arn:aws:iam::481516234210:role/svc-monitoring", path: "/service-roles/" },
      gcp: { email: "svc-monitoring@acme-prod-4821.iam.gserviceaccount.com", uniqueId: "555666777888999000111" },
    },
  },
  {
    id: "id-107", name: "svc-billing-sync", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-101", createdAt: "2023-06-01", lastActive: "2026-07-28",
    provenanceState: "recorded", originator: "jane.doe", originatorId: "id-001", generation: 2, fanOut: 1,
    mfaEnabled: false, credentialAge: 120, owner: "id-001", ownerName: "Jane Doe", riskScore: 44, apps: ["payments"],
    sources: {
      aws: { roleArn: "arn:aws:iam::481516234210:role/svc-billing-sync", path: "/service-roles/" },
      azure: {
        objectId: "deadbeef-0001-4000-8000-000000000107",
        appId: "b1110000-aaaa-bbbb-cccc-000000000107",
        displayName: "svc-billing-sync",
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-108", name: "svc-ml-training", type: "service", email: null, department: "Data",
    status: "active", createdBy: "id-003", createdAt: "2024-01-15", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 200, owner: "id-003", ownerName: "Priya Sharma", riskScore: 71, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-ml-training@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "222333444555666777888",
        disabled: false,
      },
    },
  },
  {
    id: "id-109", name: "svc-terraform-apply", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-008", createdAt: "2023-03-01", lastActive: "2026-07-31",
    // Self-authorized-shaped story: creator also received privilege via this role on 2023-03-02
    provenanceState: "recorded", originator: "lena.okonkwo", originatorId: "id-008",
    selfAuthorized: true, creatorStatus: "active", generation: 1,
    mfaEnabled: false, credentialAge: 150, owner: "id-008", ownerName: "Lena Okonkwo", riskScore: 84, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-terraform-apply",
        path: "/cicd/",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/TerraformPowerUser"],
      },
      azure: {
        objectId: "aabbccdd-1122-3344-5566-77889900aabb",
        appId: "terraform000-aaaa-bbbb-cccc-000000000109",
        displayName: "svc-terraform-apply",
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-110", name: "svc-support-bot", type: "service", email: null, department: "Product",
    status: "active", createdBy: "id-012", createdAt: "2024-09-01", lastActive: "2026-07-30",
    mfaEnabled: false, credentialAge: 70, owner: "id-012", ownerName: "Fatima Hassan", riskScore: 52, apps: ["payments"],
    sources: {
      azure: {
        objectId: "11223344-5566-7788-99aa-bbccddeeff00",
        appId: "supportbot0-aaaa-bbbb-cccc-000000000110",
        displayName: "svc-support-bot",
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-111", name: "svc-backup-agent", type: "service", email: null, department: "DevOps",
    status: "orphaned", createdBy: "id-011", createdAt: "2021-06-01", lastActive: "2026-03-12",
    mfaEnabled: false, credentialAge: 620, owner: null, ownerName: null, ownershipState: "unowned",
    suppressionEffect: "suppressed", suppressionReason: "break_glass",
    suppressionDetail: "emergency restore path; use is alerted rather than owned",
    suppressionExpiresAt: "2026-12-31",
    riskScore: 96, riskFactorsFiring: 2, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-backup-agent",
        path: "/legacy/",
        createDate: "2021-06-01T08:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/BackupFullAccess"],
      },
    },
  },
  {
    id: "id-112", name: "svc-github-actions", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-008", createdAt: "2023-07-20", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 35, owner: "team-platform", ownerName: "team-platform", ownerKind: "team",
    ownershipState: "owned", riskScore: 78, riskFactorsFiring: 2, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-github-actions",
        path: "/cicd/",
        federatedVia: "arn:aws:iam::481516234210:oidc-provider/token.actions.githubusercontent.com",
      },
      gcp: {
        email: "svc-github-actions@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "333444555666777888999",
        disabled: false,
      },
    },
  },
  {
    id: "id-113", name: "svc-hr-sync", type: "service", email: null, department: "People Ops",
    status: "active", createdBy: "id-004", createdAt: "2022-11-01", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 110, owner: null, ownerName: null, ownershipState: "unknown",
    suppressionEffect: "unknown", suppressionReason: "sso_federated",
    suppressionDetail: "provisioned via SSO federation; this app records no durable owner attestation",
    riskScore: 38, riskAssessment: "unevaluated", apps: ["devops"],
    sources: {
      okta: { id: "0oa_hr_sync_app", status: "ACTIVE", label: "Workday HR Sync" },
      hr: { integrationSystemId: "WD-INT-HR-SYNC", status: "Active" },
      aws: { roleArn: "arn:aws:iam::481516234210:role/svc-hr-sync", path: "/integrations/" },
    },
  },
  {
    id: "id-114", name: "svc-finance-reporter", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-005", createdAt: "2021-08-01", lastActive: "2026-05-28",
    mfaEnabled: false, credentialAge: 400, owner: null, ownerName: null, ownershipState: "unowned",
    riskScore: 88, riskFactorsFiring: 2, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-finance-reporter",
        path: "/legacy/",
        createDate: "2021-08-01T11:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/FinanceReportsRead"],
      },
    },
  },
  {
    id: "id-115", name: "svc-finance-ghost", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-005", createdAt: "2026-06-12", lastActive: "2026-07-20",
    mfaEnabled: false, credentialAge: 50, owner: null, ownerName: null, riskScore: 94, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-finance-ghost",
        path: "/legacy/",
        createDate: "2026-06-12T03:14:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/FinanceReportsRead"],
        note: "Created with alice.brooks credentials after HR termination",
      },
    },
  },
  {
    id: "id-116", name: "svc-etl-ghost", type: "service", email: null, department: "Data",
    status: "orphaned", createdBy: "id-006", createdAt: "2026-05-20", lastActive: "2026-07-08",
    mfaEnabled: false, credentialAge: 70, owner: null, ownerName: null, riskScore: 93, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-etl-ghost@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "999888777666555444333",
        disabled: false,
        createdBy: "raj.patel@acme.com",
        note: "Created after raj.patel termination",
      },
    },
  },
  {
    id: "id-117", name: "svc-ledger-bot", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-016", createdAt: "2019-06-01", lastActive: "2026-07-27",
    mfaEnabled: false, credentialAge: 850, owner: "id-016", ownerName: "Henry Cole", riskScore: 48, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-ledger-bot",
        path: "/legacy/",
        createDate: "2019-06-01T09:00:00Z",
      },
    },
  },
  {
    id: "id-118", name: "svc-recon-worker", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-017", createdAt: "2020-02-01", lastActive: "2026-07-26",
    mfaEnabled: false, credentialAge: 780, owner: "id-017", ownerName: "Maya Singh", riskScore: 52, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-recon-worker",
        path: "/legacy/",
        createDate: "2020-02-01T14:00:00Z",
      },
    },
  },
  {
    id: "id-119", name: "svc-fx-batch", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-017", createdAt: "2021-03-15", lastActive: "2026-07-25",
    mfaEnabled: false, credentialAge: 610, owner: "id-017", ownerName: "Maya Singh", riskScore: 46, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-fx-batch",
        path: "/legacy/",
        createDate: "2021-03-15T11:30:00Z",
      },
    },
  },
  {
    id: "id-120", name: "svc-catalog-sync", type: "service", email: null, department: "Data",
    status: "active", createdBy: "id-018", createdAt: "2021-02-10", lastActive: "2026-07-24",
    mfaEnabled: false, credentialAge: 640, owner: "id-018", ownerName: "Elise Moran", riskScore: 43, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-catalog-sync@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "111222333444555666777",
        disabled: false,
      },
    },
  },
  {
    id: "id-121", name: "svc-ami-baker", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-019", createdAt: "2020-08-01", lastActive: "2026-07-23",
    mfaEnabled: false, credentialAge: 720, owner: "id-019", ownerName: "Quinn Adebayo", riskScore: 50, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-ami-baker",
        path: "/legacy/",
        createDate: "2020-08-01T08:00:00Z",
      },
    },
  },
  // Fully offboarded NHIs left by departed humans (no live paths)
  {
    id: "id-122", name: "svc-nora-gl-export", type: "service", email: null, department: "Finance",
    status: "disabled", createdBy: "id-014", createdAt: "2021-03-01", lastActive: "2026-02-28",
    mfaEnabled: false, credentialAge: 40, owner: null, ownerName: null, riskScore: 12, apps: ["payments"],
    sources: {
      azure: {
        objectId: "a9b8c7d6-e5f4-3210-9876-543210fedcba",
        displayName: "svc-nora-gl-export",
        accountEnabled: false,
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-123", name: "svc-owen-nightly", type: "service", email: null, department: "DevOps",
    status: "disabled", createdBy: "id-011", createdAt: "2022-01-15", lastActive: "2026-04-28",
    mfaEnabled: false, credentialAge: 55, owner: null, ownerName: null, riskScore: 10, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-owen-nightly",
        path: "/legacy/",
        createDate: "2022-01-15T08:00:00Z",
        attachedPolicies: [],
      },
    },
  },
  {
    id: "id-124", name: "svc-raj-warehouse-archive", type: "service", email: null, department: "Data",
    status: "disabled", createdBy: "id-006", createdAt: "2022-11-01", lastActive: "2026-05-14",
    mfaEnabled: false, credentialAge: 40, owner: null, ownerName: null, riskScore: 14, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-raj-warehouse-archive@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "444555666777888999000",
        disabled: true,
        createdBy: "raj.patel@acme.com",
      },
    },
  },
  {
    id: "id-125", name: "svc-alice-wire-batch", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-005", createdAt: "2022-02-01", lastActive: "2026-07-18",
    mfaEnabled: false, credentialAge: 340, owner: null, ownerName: null, riskScore: 89, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-alice-wire-batch",
        path: "/legacy/",
        createDate: "2022-02-01T10:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/WireBatchSubmit"],
      },
    },
  },
  {
    id: "id-126", name: "svc-claire-support-bridge", type: "service", email: null, department: "Product",
    status: "orphaned", createdBy: "id-020", createdAt: "2023-04-12", lastActive: "2026-07-12",
    mfaEnabled: false, credentialAge: 260, owner: null, ownerName: null, riskScore: 82, apps: ["payments"],
    sources: {
      azure: {
        objectId: "c1a1re11-bridge-4000-8000-000000000126",
        appId: "clairebridge-aaaa-bbbb-cccc-000000000126",
        displayName: "svc-claire-support-bridge",
        servicePrincipalType: "Application",
        accountEnabled: true,
      },
    },
  },
  {
    id: "id-127", name: "svc-claire-catalog-bot", type: "service", email: null, department: "Product",
    status: "disabled", createdBy: "id-020", createdAt: "2023-08-20", lastActive: "2026-03-14",
    mfaEnabled: false, credentialAge: 45, owner: null, ownerName: null, riskScore: 11, apps: ["payments"],
    sources: {
      azure: {
        objectId: "c1a1re22-catalo-4000-8000-000000000127",
        displayName: "svc-claire-catalog-bot",
        accountEnabled: false,
        servicePrincipalType: "Application",
      },
    },
  },
  {
    id: "id-128", name: "svc-derek-scan-runner", type: "service", email: null, department: "Security",
    status: "orphaned", createdBy: "id-021", createdAt: "2021-08-01", lastActive: "2026-07-05",
    mfaEnabled: false, credentialAge: 480, owner: null, ownerName: null, riskScore: 93, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-derek-scan-runner",
        path: "/security/",
        createDate: "2021-08-01T09:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/SecurityScanFull"],
      },
    },
  },
  {
    id: "id-129", name: "svc-derek-vault-reader", type: "service", email: null, department: "Security",
    status: "orphaned", createdBy: "id-021", createdAt: "2022-03-18", lastActive: "2026-06-30",
    mfaEnabled: false, credentialAge: 390, owner: null, ownerName: null, riskScore: 95, apps: ["devops"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-derek-vault-reader",
        path: "/security/",
        createDate: "2022-03-18T11:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/SecretsReadOnly"],
      },
    },
  },
  {
    id: "id-130", name: "svc-helena-feature-flag", type: "service", email: null, department: "Engineering",
    status: "disabled", createdBy: "id-022", createdAt: "2023-06-01", lastActive: "2026-06-28",
    mfaEnabled: false, credentialAge: 35, owner: null, ownerName: null, riskScore: 9, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-helena-feature-flag@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "555666777888999000111",
        disabled: true,
        createdBy: "helena.cho@acme.com",
      },
    },
  },
  {
    id: "id-131", name: "svc-helena-metrics-push", type: "service", email: null, department: "Engineering",
    status: "disabled", createdBy: "id-022", createdAt: "2024-02-14", lastActive: "2026-06-30",
    mfaEnabled: false, credentialAge: 28, owner: null, ownerName: null, riskScore: 8, apps: ["data-pipeline"],
    sources: {
      gcp: {
        email: "svc-helena-metrics-push@acme-prod-4821.iam.gserviceaccount.com",
        uniqueId: "666777888999000111222",
        disabled: true,
        createdBy: "helena.cho@acme.com",
      },
    },
  },
  {
    id: "id-132", name: "svc-nora-ap-export", type: "service", email: null, department: "Finance",
    status: "disabled", createdBy: "id-014", createdAt: "2020-11-01", lastActive: "2026-02-27",
    mfaEnabled: false, credentialAge: 50, owner: null, ownerName: null, riskScore: 10, apps: ["payments"],
    sources: {
      azure: {
        objectId: "n0ra0000-apexp-4000-8000-000000000132",
        displayName: "svc-nora-ap-export",
        accountEnabled: false,
        servicePrincipalType: "Application",
      },
    },
  },
  // alice.brooks fan-out children (departed creator tree)
  {
    id: "id-133", name: "svc-alice-refund-bot", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-005", createdAt: "2022-06-15", lastActive: "2026-07-20",
    provenanceState: "recorded", originator: "alice.brooks", originatorId: "id-005",
    creatorStatus: "departed", generation: 1,
    mfaEnabled: false, credentialAge: 310, owner: null, ownerName: null, riskScore: 86, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-alice-refund-bot",
        path: "/legacy/",
        createDate: "2022-06-15T10:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/RefundSubmit"],
      },
    },
  },
  {
    id: "id-134", name: "svc-alice-tax-export", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-005", createdAt: "2023-01-20", lastActive: "2026-07-15",
    provenanceState: "recorded", originator: "alice.brooks", originatorId: "id-005",
    creatorStatus: "departed", generation: 1,
    mfaEnabled: false, credentialAge: 280, owner: null, ownerName: null, riskScore: 80, apps: ["payments"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-alice-tax-export",
        path: "/legacy/",
        createDate: "2023-01-20T09:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/TaxExportRead"],
      },
    },
  },
  // sofia.reyes peer-root NHIs (recorded human originator)
  {
    id: "id-140", name: "svc-sofia-deploy-gate", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2023-09-01", lastActive: "2026-07-31",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 100, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 42, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-deploy-gate", path: "/platform/", createDate: "2023-09-01T12:00:00Z" } },
  },
  {
    id: "id-141", name: "svc-sofia-secrets-rotate", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2023-09-08", lastActive: "2026-07-30",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 95, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 48, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-secrets-rotate", path: "/platform/", createDate: "2023-09-08T12:00:00Z" } },
  },
  {
    id: "id-142", name: "svc-sofia-canary-roll", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2023-10-02", lastActive: "2026-07-29",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 90, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 35, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-canary-roll", path: "/platform/", createDate: "2023-10-02T12:00:00Z" } },
  },
  {
    id: "id-143", name: "svc-sofia-cost-guard", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2023-11-14", lastActive: "2026-07-28",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 85, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 30, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-cost-guard", path: "/platform/", createDate: "2023-11-14T12:00:00Z" } },
  },
  {
    id: "id-144", name: "svc-sofia-vpc-flow", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2024-01-09", lastActive: "2026-07-27",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 70, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 33, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-vpc-flow", path: "/platform/", createDate: "2024-01-09T12:00:00Z" } },
  },
  {
    id: "id-145", name: "svc-sofia-ami-promote", type: "service", email: null, department: "Platform",
    status: "active", createdBy: "id-023", createdAt: "2024-02-22", lastActive: "2026-07-26",
    provenanceState: "recorded", originator: "sofia.reyes", originatorId: "id-023", generation: 1,
    mfaEnabled: false, credentialAge: 65, owner: "id-023", ownerName: "Sofia Reyes", riskScore: 38, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-sofia-ami-promote", path: "/platform/", createDate: "2024-02-22T12:00:00Z" } },
  },
  // marcus.vale peer-root NHIs
  {
    id: "id-146", name: "svc-marcus-chaos-runner", type: "service", email: null, department: "SRE",
    status: "active", createdBy: "id-024", createdAt: "2024-04-01", lastActive: "2026-07-25",
    provenanceState: "recorded", originator: "marcus.vale", originatorId: "id-024", generation: 1,
    mfaEnabled: false, credentialAge: 55, owner: "id-024", ownerName: "Marcus Vale", riskScore: 45, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-marcus-chaos-runner", path: "/sre/", createDate: "2024-04-01T10:00:00Z" } },
  },
  {
    id: "id-147", name: "svc-marcus-pager-bridge", type: "service", email: null, department: "SRE",
    status: "active", createdBy: "id-024", createdAt: "2024-05-10", lastActive: "2026-07-24",
    provenanceState: "recorded", originator: "marcus.vale", originatorId: "id-024", generation: 1,
    mfaEnabled: false, credentialAge: 50, owner: "id-024", ownerName: "Marcus Vale", riskScore: 40, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-marcus-pager-bridge", path: "/sre/", createDate: "2024-05-10T10:00:00Z" } },
  },
  // Depth ≥3: jane → payments-api → billing-sync → billing-recon
  {
    id: "id-148", name: "svc-billing-recon", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-107", createdAt: "2024-03-01", lastActive: "2026-07-28",
    provenanceState: "recorded", originator: "svc-billing-sync", originatorId: "id-107", generation: 3,
    mfaEnabled: false, credentialAge: 110, owner: "id-001", ownerName: "Jane Doe", riskScore: 46, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-billing-recon", path: "/service-roles/", createDate: "2024-03-01T11:00:00Z" } },
  },
  // Depth ≥3 under alice: alice → old-payments-worker → legacy-settlement
  {
    id: "id-149", name: "svc-legacy-settlement", type: "service", email: null, department: "Finance",
    status: "orphaned", createdBy: "id-105", createdAt: "2022-08-01", lastActive: "2026-07-10",
    provenanceState: "recorded", originator: "alice.brooks", originatorId: "id-005",
    creatorStatus: "departed", generation: 2,
    mfaEnabled: false, credentialAge: 360, owner: null, ownerName: null, riskScore: 88, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-legacy-settlement", path: "/legacy/", createDate: "2022-08-01T09:00:00Z" } },
  },
  // Pre-audit gap NHIs (No originator + gapReason)
  {
    id: "id-150", name: "svc-payments-legacy-batch", type: "service", email: null, department: "Finance",
    status: "active", createdBy: null, createdAt: "2019-03-01", lastActive: "2026-07-01",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, generation: 0,
    mfaEnabled: false, credentialAge: 900, owner: "id-016", ownerName: "Henry Cole", riskScore: 55, apps: ["payments"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-payments-legacy-batch", path: "/legacy/", createDate: "2019-03-01T08:00:00Z" } },
  },
  // mark.chen AWS NHIs (promote to peers under AWS scope — mark has no aws source)
  {
    id: "id-151", name: "svc-mark-canary", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-002", createdAt: "2023-04-12", lastActive: "2026-07-31",
    provenanceState: "recorded", originator: "mark.chen", originatorId: "id-002", generation: 1,
    mfaEnabled: false, credentialAge: 100, owner: "team-platform", ownerName: "team-platform", riskScore: 32, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-mark-canary", path: "/service-roles/", createDate: "2023-04-12T10:00:00Z" } },
  },
  {
    id: "id-152", name: "svc-mark-log-shipper", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-002", createdAt: "2023-05-03", lastActive: "2026-07-30",
    provenanceState: "recorded", originator: "mark.chen", originatorId: "id-002", generation: 1,
    mfaEnabled: false, credentialAge: 95, owner: "team-platform", ownerName: "team-platform", riskScore: 29, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-mark-log-shipper", path: "/service-roles/", createDate: "2023-05-03T10:00:00Z" } },
  },
  {
    id: "id-153", name: "svc-mark-node-drainer", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: "id-002", createdAt: "2023-06-18", lastActive: "2026-07-29",
    provenanceState: "recorded", originator: "mark.chen", originatorId: "id-002", generation: 1,
    mfaEnabled: false, credentialAge: 88, owner: "team-platform", ownerName: "team-platform", riskScore: 34, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-mark-node-drainer", path: "/service-roles/", createDate: "2023-06-18T10:00:00Z" } },
  },
  {
    id: "id-154", name: "svc-devops-bootstrap-runner", type: "service", email: null, department: "DevOps",
    status: "active", createdBy: null, createdAt: "2020-02-01", lastActive: "2026-06-01",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "No originator", originatorId: null, generation: 0,
    mfaEnabled: false, credentialAge: 800, owner: "id-013", ownerName: "Chris Nguyen", riskScore: 50, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-devops-bootstrap-runner", path: "/legacy/", createDate: "2020-02-01T08:00:00Z" } },
  },
  {
    id: "id-155", name: "svc-derek-threat-intel", type: "service", email: null, department: "Security",
    status: "orphaned", createdBy: "id-021", createdAt: "2021-11-01", lastActive: "2026-07-08",
    provenanceState: "explained_absence", gapReason: "outside_window_backfill",
    originator: "derek.frost", originatorId: "id-021", creatorStatus: "departed", generation: 1,
    mfaEnabled: false, credentialAge: 520, owner: null, ownerName: null, riskScore: 91, apps: ["devops"],
    sources: { aws: { roleArn: "arn:aws:iam::481516234210:role/svc-derek-threat-intel", path: "/security/", createDate: "2021-11-01T09:00:00Z" } },
  },
  /**
   * Offline QA twin of engine beat 23b (`svc-temp-ssm-bridge`):
   * hop-producing grant + no owner — compound Needs attention.
   * Display name matches live Access Discovery (`Temporary SSM Bridge`).
   */
  {
    id: "id-mock-ssm-bridge",
    name: "Temporary SSM Bridge",
    type: "service",
    email: null,
    department: "Platform",
    status: "orphaned",
    createdBy: null,
    createdAt: "2026-05-01",
    lastActive: "2026-07-28",
    mfaEnabled: false,
    credentialAge: 91,
    owner: null,
    ownerName: null,
    ownerKind: null,
    ownershipState: "unowned",
    riskScore: 96,
    riskFactorsFiring: 3,
    mockAttention: "hop_unowned",
    apps: ["aws-iam"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-temp-ssm-bridge",
        path: "/temp/",
        createDate: "2026-05-01T00:00:00Z",
        attachedPolicies: ["arn:aws:iam::481516234210:policy/SsmSessionDeployBox"],
      },
    },
  },
  /**
   * Offline twin of live `agent-incident-responder` — multi-hop Shadow drawer
   * (admin:warehouse via runbook → warehouse role). Owned team-platform so
   * attention is hop-only (rank 2), matching the live CISO walkthrough.
   */
  {
    id: "id-mock-incident-responder",
    name: "Incident Responder Agent",
    type: "service",
    email: null,
    department: "Platform",
    status: "active",
    createdBy: null,
    createdAt: "2026-01-14",
    lastActive: "2026-07-30",
    mfaEnabled: false,
    credentialAge: 40,
    owner: "team-platform",
    ownerName: "team-platform",
    ownerKind: "team",
    ownershipState: "owned",
    ownerAttestedAt: "2026-07-24",
    riskScore: 94,
    riskFactorsFiring: 2,
    apps: ["mcp-gateway"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/agent-incident-responder",
        path: "/agents/",
        createDate: "2026-01-14T00:00:00Z",
      },
    },
  },
  /**
   * Offline twin of live `svc-release-orchestrator` — deploy:prod Shadow chain
   * through GitHub connect permissions (delegation drawer parity).
   */
  {
    id: "id-mock-release-orchestrator",
    name: "Release Orchestrator",
    type: "service",
    email: null,
    department: "Platform",
    status: "active",
    createdBy: "id-008",
    createdAt: "2025-11-02",
    lastActive: "2026-07-31",
    mfaEnabled: false,
    credentialAge: 55,
    owner: "team-platform",
    ownerName: "team-platform",
    ownerKind: "team",
    ownershipState: "owned",
    ownerAttestedAt: "2026-07-22",
    riskScore: 90,
    riskFactorsFiring: 2,
    apps: ["github"],
    sources: {
      aws: {
        roleArn: "arn:aws:iam::481516234210:role/svc-release-orchestrator",
        path: "/cicd/",
        createDate: "2025-11-02T00:00:00Z",
      },
    },
  },
];


// Every identity has a resolved originator (human provisioner when possible).
const SYSTEM_ORIGINATOR = { id: 'id-sys-001', name: 'No originator' };
const identityNameById = Object.fromEntries([
  [SYSTEM_ORIGINATOR.id, SYSTEM_ORIGINATOR.name],
  ...identities.map(i => [i.id, i.name]),
]);
const identityByIdMap = Object.fromEntries(identities.map(i => [i.id, i]));
identities.forEach(i => {
  // Pre-audit identities have no reliable creator in retained logs
  if (i.createdBy == null) {
    i.originatorId = null;
    i.originator = 'No originator';
    return;
  }
  let originatorId = i.createdBy || SYSTEM_ORIGINATOR.id;
  for (let guard = 0; guard < 8; guard++) {
    const parent = identityByIdMap[originatorId];
    if (!parent || parent.type === 'human' || originatorId === SYSTEM_ORIGINATOR.id) break;
    originatorId = parent.createdBy || SYSTEM_ORIGINATOR.id;
  }
  const resolved = identityByIdMap[originatorId];
  if (resolved?.type === 'service' && resolved.owner && identityByIdMap[resolved.owner]) {
    originatorId = resolved.owner;
  }
  i.originatorId = originatorId;
  // Directory / system bootstrap is not a human originator
  if (originatorId === SYSTEM_ORIGINATOR.id) {
    i.originator = 'No originator';
    return;
  }
  i.originator = identityNameById[originatorId] || 'No originator';
});

// ─── Access Paths (cloud IAM API evidence) ───────────────────────────────────

export const accessPaths = [
  // Direct — AWS IAM GetPolicyVersion / ListAttachedUserPolicies
  {
    id: "ap-001", identityId: "id-001", identityName: "jane.doe",
    resource: "s3://payments-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:PutObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/jane.doe",
      resourceArn: "arn:aws:s3:::payments-prod",
      policyArn: "arn:aws:iam::481516234210:policy/PaymentsS3Access",
      policyVersionId: "v3",
      statementSid: "AllowPaymentsBucketRW",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-002", identityId: "id-002", identityName: "mark.chen",
    resource: "gke://devops-cluster", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["container.pods.exec", "container.pods.list"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.cloudresourcemanager + container",
      principal: "user:mark.chen@acme.com",
      resourceName: "projects/acme-prod-4821/locations/us-central1/clusters/devops-cluster",
      role: "roles/container.developer",
      bindingCondition: null,
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-003", identityId: "id-004", identityName: "tom.walker",
    resource: "kms://prod-key-ring", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["kms:Decrypt", "kms:Encrypt"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.kms + iam",
      principalArn: "arn:aws:iam::481516234210:user/tom.walker",
      resourceArn: "arn:aws:kms:us-east-1:481516234210:keyring/prod-key-ring",
      policyArn: "arn:aws:iam::481516234210:policy/SecurityKmsCrypto",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-004", identityId: "id-007", identityName: "sara.jones",
    resource: "s3://payments-logs", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/sara.jones",
      resourceArn: "arn:aws:s3:::payments-logs",
      policyArn: "arn:aws:iam::481516234210:policy/PaymentsLogsRead",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-016", identityId: "id-001", identityName: "jane.doe",
    resource: "azure://kv-payments-prod", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Keys/get", "Secrets/get"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization + keyvault",
      principalId: "8f3a2c1b-4d5e-6f70-8192-a3b4c5d6e7f8",
      roleDefinitionId: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86b69e6",
      roleDefinitionName: "Key Vault Secrets User",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-payments/providers/Microsoft.KeyVault/vaults/kv-payments-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },

  // Indirect — group / role assumption
  {
    id: "ap-005", identityId: "id-001", identityName: "jane.doe",
    resource: "rds://payments-db-prod", resourceSensitivity: "critical", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["rds:Connect", "rds:DescribeDBInstances"], mechanism: "MEMBER_OF:group-db-readers",
    lastConfirmed: "2026-07-29", cloudProvider: "AWS", blocked: false,
    api: {
      source: "okta.groups + aws.iam",
      oktaGroupId: "00g_db_readers_okta",
      oktaGroupName: "AWS-DB-Readers",
      principalArn: "arn:aws:iam::481516234210:user/jane.doe",
      resourceArn: "arn:aws:rds:us-east-1:481516234210:db:payments-db-prod",
      roleArn: "arn:aws:iam::481516234210:role/DbReadersRole",
      evaluatedVia: "iam:GetGroup + iam:ListAttachedRolePolicies",
    },
  },
  {
    id: "ap-006", identityId: "id-003", identityName: "priya.sharma",
    resource: "bigquery://analytics-prod", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData"], mechanism: "ASSUMES_ROLE:data-analyst-role",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.iam",
      principal: "user:priya.sharma@acme.com",
      role: "projects/acme-prod-4821/roles/dataAnalystCustom",
      resourceName: "projects/acme-prod-4821/datasets/analytics_prod",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-007", identityId: "id-002", identityName: "mark.chen",
    resource: "secrets://prod-api-keys", resourceSensitivity: "critical", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["secretsmanager:GetSecretValue"], mechanism: "MEMBER_OF:group-devops-leads",
    lastConfirmed: "2026-07-28", cloudProvider: "AWS", blocked: false,
    api: {
      source: "okta.groups + aws.secretsmanager",
      oktaGroupId: "00g_devops_leads_okta",
      oktaGroupName: "DevOps-Leads",
      resourceArn: "arn:aws:secretsmanager:us-east-1:481516234210:secret:prod-api-keys-AbCdEf",
      evaluatedVia: "secretsmanager:GetResourcePolicy + iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-008", identityId: "id-101", identityName: "svc-payments-api",
    resource: "dynamodb://payments-table", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["dynamodb:GetItem", "dynamodb:PutItem"], mechanism: "ASSUMES_ROLE:payments-service-role",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam + dynamodb",
      roleArn: "arn:aws:iam::481516234210:role/payments-service-role",
      resourceArn: "arn:aws:dynamodb:us-east-1:481516234210:table/payments-table",
      trustPolicyPrincipal: "arn:aws:iam::481516234210:role/svc-payments-api",
      evaluatedVia: "iam:GetRole + dynamodb:DescribeTable",
    },
  },
  {
    id: "ap-017", identityId: "id-107", identityName: "svc-billing-sync",
    resource: "azure://sa-billing-prod", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
    mechanism: "ASSUMES_ROLE:Storage Blob Data Reader",
    lastConfirmed: "2026-07-28", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "deadbeef-0001-4000-8000-000000000107",
      roleDefinitionName: "Storage Blob Data Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.Storage/storageAccounts/sabillingprod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },

  // Shadow Access — multi-hop (engine chain vocabulary for HopChain drawer)
  {
    id: "ap-009", identityId: "id-001", identityName: "jane.doe",
    resource: "admin:platform", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 3,
    effectivePermissions: ["admin:platform"], mechanism: "ssm:session-deploy-box → role-deploy-box",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "role-deploy-box",
    hopChain: [
      { step: 1, from: "jane.doe", to: "ssm:session-deploy-box", edge: "CAN_ACCESS", mechanism: "granted ssm:session-deploy-box" },
      { step: 2, from: "ssm:session-deploy-box", to: "role-deploy-box", edge: "ASSUMES_ROLE", mechanism: "resource carries role-deploy-box" },
      { step: 3, from: "role-deploy-box", to: "admin:platform", edge: "HAS_POLICY", mechanism: "holds admin:platform" },
    ],
    api: {
      source: "aws.iam + ssm",
      nativeVisible: false,
      nativeToolsMissed: ["IAM Access Analyzer", "IAM Policy Simulator (direct only)"],
      evaluatedVia: "itag.access.classify",
    },
  },
  {
    id: "ap-010", identityId: "id-003", identityName: "priya.sharma",
    resource: "iam://data-admin-role", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["iam.serviceAccounts.actAs", "storage.objects.*", "resourcemanager.projects.setIamPolicy"],
    mechanism: "gcloud compute ssh → GCE:data-pipeline-vm → WorkloadIdentity:data-admin",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false, shadowAdmin: true,
    adminRole: "iam://data-admin-role",
    hopChain: [
      { step: 1, from: "priya.sharma", to: "gce://data-pipeline-vm", mechanism: "gcloud compute ssh", timestamp: "2026-07-30T11:20:00Z", api: "compute.instances.osLogin", resourceName: "projects/acme-prod-4821/zones/us-central1-a/instances/data-pipeline-vm" },
      { step: 2, from: "gce://data-pipeline-vm", to: "iam://data-admin-role", mechanism: "Workload Identity → AssumeRole", timestamp: "2026-07-30T11:20:01Z", api: "iamcredentials.generateAccessToken", resourceName: "projects/acme-prod-4821/serviceAccounts/data-admin@acme-prod-4821.iam.gserviceaccount.com" },
    ],
    api: {
      source: "gcp.compute + iamcredentials",
      nativeVisible: false,
      nativeToolsMissed: ["Policy Analyzer (direct bindings only)"],
      terminalPrincipal: "serviceAccount:data-admin@acme-prod-4821.iam.gserviceaccount.com",
    },
  },
  {
    id: "ap-011", identityId: "id-104", identityName: "svc-orphaned-etl",
    resource: "storage://raw-pii-data", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["storage.objects.get", "storage.objects.list"],
    mechanism: "CloudFunction:etl-trigger → ServiceAccount:svc-orphaned-etl → storage.admin",
    lastConfirmed: "2026-07-10", cloudProvider: "GCP", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "svc-orphaned-etl", to: "gcf://etl-trigger-fn", mechanism: "Cloud Function invocation", timestamp: "2026-07-10T03:00:00Z", api: "cloudfunctions.functions.call" },
      { step: 2, from: "gcf://etl-trigger-fn", to: "storage://raw-pii-data", mechanism: "storage.admin binding", timestamp: "2026-07-10T03:00:01Z", api: "storage.buckets.getIamPolicy" },
    ],
    api: { source: "gcp.cloudfunctions + storage", nativeVisible: false },
  },
  {
    id: "ap-012", identityId: "id-005", identityName: "alice.brooks",
    resource: "s3://finance-audit-logs", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["s3:*"], mechanism: "AssumeRole:finance-auditor → EC2:i-0fin456 → s3:Full",
    lastConfirmed: "2026-07-25", cloudProvider: "AWS", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "alice.brooks", to: "iam://finance-auditor-role", mechanism: "AssumeRole", timestamp: "2026-07-25T09:00:00Z", api: "sts:AssumeRole", resourceArn: "arn:aws:iam::481516234210:role/finance-auditor-role" },
      { step: 2, from: "iam://finance-auditor-role", to: "ec2://i-0fin456", mechanism: "ec2:StartInstances", timestamp: "2026-07-25T09:00:01Z", api: "ec2:StartInstances" },
      { step: 3, from: "ec2://i-0fin456", to: "s3://finance-audit-logs", mechanism: "Instance Profile → s3:FullAccess", timestamp: "2026-07-25T09:00:02Z", api: "s3:GetBucketPolicy", resourceArn: "arn:aws:s3:::finance-audit-logs" },
    ],
    api: {
      source: "aws.sts + ec2 + s3",
      hrCorrelation: { employeeId: "WD-06118", employmentStatus: "Terminated", terminationDate: "2026-06-01" },
      oktaCorrelation: { status: "DEPROVISIONED", stillHasCloudPrincipal: true },
      nativeVisible: false,
    },
  },
  {
    id: "ap-013", identityId: "id-105", identityName: "svc-old-payments-worker",
    resource: "iam://payments-admin-role", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 3,
    effectivePermissions: ["*"], mechanism: "Lambda:legacy-worker → AssumeRole:payments-admin",
    lastConfirmed: "2026-07-20", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://payments-admin-role",
    hopChain: [
      { step: 1, from: "svc-old-payments-worker", to: "lambda://legacy-worker", mechanism: "InvokeFunction", timestamp: "2026-07-20T04:00:00Z", api: "lambda:InvokeFunction", resourceArn: "arn:aws:lambda:us-east-1:481516234210:function:legacy-worker" },
      { step: 2, from: "lambda://legacy-worker", to: "iam://payments-exec-role", mechanism: "Lambda execution role", timestamp: "2026-07-20T04:00:01Z", api: "lambda:GetFunction", resourceArn: "arn:aws:iam::481516234210:role/payments-exec-role" },
      { step: 3, from: "iam://payments-exec-role", to: "iam://payments-admin-role", mechanism: "sts:AssumeRole", timestamp: "2026-07-20T04:00:02Z", api: "sts:AssumeRole", resourceArn: "arn:aws:iam::481516234210:role/payments-admin-role" },
    ],
    api: { source: "aws.lambda + iam + sts", nativeVisible: false, terminalRoleArn: "arn:aws:iam::481516234210:role/payments-admin-role" },
  },
  {
    id: "ap-014", identityId: "id-002", identityName: "mark.chen",
    resource: "iam://cluster-admin-role", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "kubectl exec → GKE node SA → cluster-admin",
    lastConfirmed: "2026-07-28", cloudProvider: "GCP", blocked: false, shadowAdmin: true,
    adminRole: "iam://cluster-admin-role",
    hopChain: [
      { step: 1, from: "mark.chen", to: "gke://devops-cluster/pod", mechanism: "kubectl exec", timestamp: "2026-07-28T16:00:00Z", api: "container.pods.exec" },
      { step: 2, from: "gke://devops-cluster/pod", to: "iam://cluster-admin-role", mechanism: "Workload Identity", timestamp: "2026-07-28T16:00:01Z", api: "iamcredentials.generateAccessToken" },
    ],
    api: { source: "gcp.container + iamcredentials", nativeVisible: false },
  },
  {
    id: "ap-015", identityId: "id-101", identityName: "svc-payments-api",
    resource: "iam://account-poweruser", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["iam:*", "ec2:*"], mechanism: "Instance profile → poweruser",
    lastConfirmed: "2026-07-29", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://account-poweruser",
    hopChain: [
      { step: 1, from: "svc-payments-api", to: "ec2://i-0pay789", mechanism: "Instance profile attachment", timestamp: "2026-07-29T10:00:00Z", api: "ec2:DescribeIamInstanceProfileAssociations", resourceArn: "arn:aws:ec2:us-east-1:481516234210:instance/i-0pay789abc" },
      { step: 2, from: "ec2://i-0pay789", to: "iam://account-poweruser", mechanism: "AssumeRole", timestamp: "2026-07-29T10:00:01Z", api: "sts:AssumeRole", resourceArn: "arn:aws:iam::481516234210:role/account-poweruser" },
    ],
    api: { source: "aws.ec2 + sts", nativeVisible: false },
  },
  {
    id: "ap-018", identityId: "id-103", identityName: "svc-ci-runner",
    resource: "azure://rg-devops-prod", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "Managed Identity → Owner on rg-devops-prod",
    lastConfirmed: "2026-07-27", cloudProvider: "Azure", blocked: false, shadowAdmin: true,
    adminRole: "azure://Owner",
    hopChain: [
      { step: 1, from: "svc-ci-runner", to: "azure://mi-ci-runner", mechanism: "User-assigned managed identity", timestamp: "2026-07-27T12:00:00Z", api: "Microsoft.ManagedIdentity/userAssignedIdentities/read" },
      { step: 2, from: "azure://mi-ci-runner", to: "azure://rg-devops-prod", mechanism: "Role assignment Owner", timestamp: "2026-07-27T12:00:01Z", api: "Microsoft.Authorization/roleAssignments/read" },
    ],
    api: {
      source: "azure.managedidentity + authorization",
      principalId: "c0ffee00-1234-5678-9abc-def012345678",
      roleDefinitionName: "Owner",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-devops-prod",
      nativeVisible: false,
      nativeToolsMissed: ["Azure PIM (eligible only)", "Access Reviews (direct assignments)"],
    },
  },

  // Expanded inventory — more humans & NHIs across clouds
  {
    id: "ap-019", identityId: "id-008", identityName: "lena.okonkwo",
    resource: "azure://rg-platform-prod", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["*/read", "Microsoft.Authorization/*/write"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "9e8d7c6b-5a49-3827-1605-f4e3d2c1b0a9",
      roleDefinitionName: "User Access Administrator",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-platform-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-020", identityId: "id-008", identityName: "lena.okonkwo",
    resource: "iam://subscription-owner", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "Runbook → MI → Owner elevation",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false, shadowAdmin: true,
    adminRole: "azure://Owner",
    hopChain: [
      { step: 1, from: "lena.okonkwo", to: "azure://automation-account", mechanism: "Automation Contributor", timestamp: "2026-07-30T14:00:00Z", api: "Microsoft.Automation/automationAccounts/read" },
      { step: 2, from: "azure://automation-account", to: "azure://mi-platform-ops", mechanism: "Runbook managed identity", timestamp: "2026-07-30T14:00:01Z", api: "Microsoft.ManagedIdentity/userAssignedIdentities/read" },
      { step: 3, from: "azure://mi-platform-ops", to: "azure://subscription-owner", mechanism: "Owner role assignment", timestamp: "2026-07-30T14:00:02Z", api: "Microsoft.Authorization/roleAssignments/read" },
    ],
    api: { source: "azure.automation + managedidentity + authorization", nativeVisible: false },
  },
  {
    id: "ap-021", identityId: "id-009", identityName: "diego.ramos",
    resource: "bigquery://customer-events", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData", "bigquery.jobs.create"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-22", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery + iam",
      principal: "user:diego.ramos@acme.com",
      role: "roles/bigquery.dataViewer",
      resourceName: "projects/acme-prod-4821/datasets/customer_events",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-022", identityId: "id-009", identityName: "diego.ramos",
    resource: "storage://ml-training-artifacts", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["storage.objects.get", "storage.objects.list"], mechanism: "MEMBER_OF:group-gcp-developers",
    lastConfirmed: "2026-07-21", cloudProvider: "GCP", blocked: false,
    api: {
      source: "okta.groups + gcp.storage",
      oktaGroupName: "GCP-Developers",
      principal: "user:diego.ramos@acme.com",
      role: "roles/storage.objectViewer",
      evaluatedVia: "storage.buckets.getIamPolicy",
    },
  },
  {
    id: "ap-023", identityId: "id-010", identityName: "mei.lin",
    resource: "s3://security-findings", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:ListBucket"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/mei.lin",
      resourceArn: "arn:aws:s3:::security-findings",
      policyArn: "arn:aws:iam::481516234210:policy/SecurityFindingsRead",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-024", identityId: "id-011", identityName: "owen.blake",
    resource: "gke://legacy-ops-cluster", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "gcloud ssh → node SA → cluster-admin",
    lastConfirmed: "2026-07-18", cloudProvider: "GCP", blocked: false, shadowAdmin: true,
    adminRole: "iam://legacy-cluster-admin",
    hopChain: [
      { step: 1, from: "owen.blake", to: "gce://legacy-bastion", mechanism: "gcloud compute ssh", timestamp: "2026-07-18T09:00:00Z", api: "compute.instances.osLogin" },
      { step: 2, from: "gce://legacy-bastion", to: "gke://legacy-ops-cluster", mechanism: "kubectl via node credentials", timestamp: "2026-07-18T09:00:01Z", api: "container.clusters.get" },
      { step: 3, from: "gke://legacy-ops-cluster", to: "iam://legacy-cluster-admin", mechanism: "Workload Identity", timestamp: "2026-07-18T09:00:02Z", api: "iamcredentials.generateAccessToken" },
    ],
    api: {
      source: "gcp.compute + container + iamcredentials",
      hrCorrelation: { employeeId: "WD-07221", employmentStatus: "Terminated", terminationDate: "2026-04-30" },
      oktaCorrelation: { status: "DEPROVISIONED", stillHasCloudPrincipal: true },
      nativeVisible: false,
    },
  },
  {
    id: "ap-025", identityId: "id-011", identityName: "owen.blake",
    resource: "azure://kv-ops-secrets", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/get", "Secrets/list"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-15", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization + keyvault",
      principalId: "0a1b2c3d-4e5f-6789-abcd-ef0123456789",
      roleDefinitionName: "Key Vault Secrets User",
      hrCorrelation: { employeeId: "WD-07221", employmentStatus: "Terminated" },
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-026", identityId: "id-012", identityName: "fatima.hassan",
    resource: "s3://payments-analytics", resourceSensitivity: "medium", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["s3:GetObject"], mechanism: "MEMBER_OF:group-payments-readers",
    lastConfirmed: "2026-07-30", cloudProvider: "AWS", blocked: false,
    api: {
      source: "okta.groups + aws.iam",
      oktaGroupName: "Payments-App-Readers",
      principalArn: "arn:aws:iam::481516234210:user/fatima.hassan",
      resourceArn: "arn:aws:s3:::payments-analytics",
      evaluatedVia: "iam:GetGroup + iam:ListAttachedRolePolicies",
    },
  },
  {
    id: "ap-027", identityId: "id-013", identityName: "chris.nguyen",
    resource: "ssm://break-glass-sessions", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ssm:StartSession", "ssm:ResumeSession"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.ssm + iam",
      principalArn: "arn:aws:iam::481516234210:user/chris.nguyen",
      policyArn: "arn:aws:iam::481516234210:policy/BreakGlassSSM",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-028", identityId: "id-013", identityName: "chris.nguyen",
    resource: "iam://prod-breakglass-admin", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "ssm:StartSession → EC2 → AssumeRole:breakglass-admin",
    lastConfirmed: "2026-07-29", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://prod-breakglass-admin",
    hopChain: [
      { step: 1, from: "chris.nguyen", to: "ec2://i-0sre999", mechanism: "ssm:StartSession", timestamp: "2026-07-29T02:00:00Z", api: "ssm:StartSession" },
      { step: 2, from: "ec2://i-0sre999", to: "iam://prod-breakglass-admin", mechanism: "Instance profile → sts:AssumeRole", timestamp: "2026-07-29T02:00:01Z", api: "sts:AssumeRole" },
    ],
    api: { source: "aws.ssm + ec2 + sts", nativeVisible: false, nativeToolsMissed: ["IAM Access Analyzer"] },
  },
  {
    id: "ap-029", identityId: "id-013", identityName: "chris.nguyen",
    resource: "gke://sre-oncall-cluster", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["container.pods.exec", "container.pods.get"], mechanism: "ASSUMES_ROLE:sre-oncall-role",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.container + iam",
      principal: "user:chris.nguyen@acme.com",
      role: "roles/container.developer",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-030", identityId: "id-014", identityName: "nora.whitfield",
    resource: "azure://kv-finance-prod", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/get", "Certificates/get"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-03-01", cloudProvider: "Azure", blocked: true,
    api: {
      source: "azure.authorization + keyvault",
      principalId: "f1e2d3c4-b5a6-9788-0011-223344556677",
      roleDefinitionName: "Key Vault Administrator",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.KeyVault/vaults/kv-finance-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-031", identityId: "id-015", identityName: "kai.sato",
    resource: "s3://eng-scratch", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/kai.sato",
      resourceArn: "arn:aws:s3:::eng-scratch",
      policyArn: "arn:aws:iam::481516234210:policy/InternDevAccess",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-032", identityId: "id-015", identityName: "kai.sato",
    resource: "bigquery://prod-analytics", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData"], mechanism: "MEMBER_OF:group-gcp-editors",
    lastConfirmed: "2026-07-28", cloudProvider: "GCP", blocked: false,
    api: {
      source: "okta.groups + gcp.bigquery",
      oktaGroupName: "GCP-Editors",
      principal: "user:kai.sato@acme.com",
      note: "Intern inherited editor group — over-permissioned for tenure",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-033", identityId: "id-108", identityName: "svc-ml-training",
    resource: "storage://raw-training-pii", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["storage.objects.get", "storage.objects.create"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.storage + iam",
      principal: "serviceAccount:svc-ml-training@acme-prod-4821.iam.gserviceaccount.com",
      role: "roles/storage.objectAdmin",
      resourceName: "projects/acme-prod-4821/buckets/raw-training-pii",
      evaluatedVia: "storage.buckets.getIamPolicy",
    },
  },
  {
    id: "ap-034", identityId: "id-108", identityName: "svc-ml-training",
    resource: "iam://ml-project-editor", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["resourcemanager.projects.setIamPolicy", "iam.serviceAccounts.actAs"],
    mechanism: "Vertex AI pipeline → project editor SA",
    lastConfirmed: "2026-07-27", cloudProvider: "GCP", blocked: false, shadowAdmin: true,
    adminRole: "iam://ml-project-editor",
    hopChain: [
      { step: 1, from: "svc-ml-training", to: "vertex://training-pipeline", mechanism: "Pipeline execution", timestamp: "2026-07-27T06:00:00Z", api: "aiplatform.pipelineJobs.create" },
      { step: 2, from: "vertex://training-pipeline", to: "iam://ml-project-editor", mechanism: "Impersonate service account", timestamp: "2026-07-27T06:00:01Z", api: "iamcredentials.generateAccessToken" },
    ],
    api: { source: "gcp.aiplatform + iamcredentials", nativeVisible: false },
  },
  {
    id: "ap-035", identityId: "id-109", identityName: "svc-terraform-apply",
    resource: "iam://org-wide-deploy", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["*"], mechanism: "OIDC → terraform role → org admin policy",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://org-wide-deploy",
    hopChain: [
      { step: 1, from: "svc-terraform-apply", to: "iam://terraform-state-role", mechanism: "sts:AssumeRole", timestamp: "2026-07-31T01:00:00Z", api: "sts:AssumeRole" },
      { step: 2, from: "iam://terraform-state-role", to: "iam://org-wide-deploy", mechanism: "iam:PassRole + broad deploy policy", timestamp: "2026-07-31T01:00:01Z", api: "iam:PassRole" },
    ],
    api: { source: "aws.sts + iam", nativeVisible: false, terminalRoleArn: "arn:aws:iam::481516234210:role/org-wide-deploy" },
  },
  {
    id: "ap-036", identityId: "id-109", identityName: "svc-terraform-apply",
    resource: "azure://mgmt-group-prod", resourceSensitivity: "critical", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["*/write"], mechanism: "ASSUMES_ROLE:Contributor",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "aabbccdd-1122-3344-5566-77889900aabb",
      roleDefinitionName: "Contributor",
      scope: "/providers/Microsoft.Management/managementGroups/acme-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-037", identityId: "id-110", identityName: "svc-support-bot",
    resource: "azure://sa-customer-uploads", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "11223344-5566-7788-99aa-bbccddeeff00",
      roleDefinitionName: "Storage Blob Data Reader",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-038", identityId: "id-111", identityName: "svc-backup-agent",
    resource: "s3://org-backups-prod", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["s3:*", "kms:Decrypt"], mechanism: "EventBridge → Lambda → backup role → s3 full",
    lastConfirmed: "2026-03-12", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://backup-admin-role",
    hopChain: [
      { step: 1, from: "svc-backup-agent", to: "events://nightly-backup", mechanism: "EventBridge invoke", timestamp: "2026-03-12T03:00:00Z", api: "events:PutEvents" },
      { step: 2, from: "events://nightly-backup", to: "lambda://backup-runner", mechanism: "Lambda invoke", timestamp: "2026-03-12T03:00:01Z", api: "lambda:InvokeFunction" },
      { step: 3, from: "lambda://backup-runner", to: "s3://org-backups-prod", mechanism: "Execution role s3:*", timestamp: "2026-03-12T03:00:02Z", api: "s3:GetBucketPolicy" },
    ],
    api: { source: "aws.events + lambda + s3", nativeVisible: false, note: "Orphaned after owen.blake departure" },
  },
  {
    id: "ap-039", identityId: "id-112", identityName: "svc-github-actions",
    resource: "ecr://payments-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ecr:PutImage", "ecr:BatchGetImage"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.ecr + iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-github-actions",
      resourceArn: "arn:aws:ecr:us-east-1:481516234210:repository/payments-prod",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-040", identityId: "id-112", identityName: "svc-github-actions",
    resource: "iam://deploy-prod-role", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["ecs:*", "iam:PassRole"], mechanism: "OIDC federation → deploy role → PassRole",
    lastConfirmed: "2026-07-28", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://deploy-prod-role",
    hopChain: [
      { step: 1, from: "svc-github-actions", to: "iam://deploy-prod-role", mechanism: "sts:AssumeRoleWithWebIdentity", timestamp: "2026-07-28T11:00:00Z", api: "sts:AssumeRoleWithWebIdentity" },
      { step: 2, from: "iam://deploy-prod-role", to: "ecs://payments-prod", mechanism: "ecs:UpdateService + iam:PassRole", timestamp: "2026-07-28T11:00:01Z", api: "ecs:UpdateService" },
    ],
    api: { source: "aws.sts + ecs + iam", nativeVisible: false },
  },
  {
    id: "ap-041", identityId: "id-113", identityName: "svc-hr-sync",
    resource: "dynamodb://employee-directory", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
    mechanism: "ASSUMES_ROLE:hr-directory-writer",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "okta.apps + aws.iam + workday",
      roleArn: "arn:aws:iam::481516234210:role/hr-directory-writer",
      hrCorrelation: { integrationSystemId: "WD-INT-HR-SYNC" },
      evaluatedVia: "iam:GetRole + dynamodb:DescribeTable",
    },
  },
  {
    id: "ap-042", identityId: "id-006", identityName: "raj.patel",
    resource: "bigquery://legacy-finance", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData", "bigquery.tables.updateData"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-05", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery + iam",
      principal: "user:raj.patel@acme.com",
      hrCorrelation: { employeeId: "WD-07944", employmentStatus: "Terminated", terminationDate: "2026-05-15" },
      stillActiveInCloud: true,
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-043", identityId: "id-102", identityName: "svc-data-ingest",
    resource: "pubsub://ingest-raw", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["pubsub.subscriptions.consume", "pubsub.topics.publish"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.pubsub + iam",
      principal: "serviceAccount:svc-data-ingest@acme-prod-4821.iam.gserviceaccount.com",
      role: "roles/pubsub.subscriber",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-045", identityId: "id-114", identityName: "svc-finance-reporter",
    resource: "s3://finance-reports", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:ListBucket"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-05-28", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:role/svc-finance-reporter",
      resourceArn: "arn:aws:s3:::finance-reports",
      policyArn: "arn:aws:iam::481516234210:policy/FinanceReportsRead",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
      note: "Orphaned after alice.brooks departure",
    },
  },
  {
    id: "ap-044", identityId: "id-106", identityName: "svc-monitoring",
    resource: "cloudwatch://prod-alarms", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["cloudwatch:PutMetricData", "cloudwatch:DescribeAlarms"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.cloudwatch + iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-monitoring",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },

  // Pathless principals filled for demo coverage (Exposure / Discovery / GWS filters)
  {
    id: "ap-046", identityId: "id-016", identityName: "henry.cole",
    resource: "s3://finance-reports", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:ListBucket"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-28", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/henry.cole",
      resourceArn: "arn:aws:s3:::finance-reports",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-047", identityId: "id-017", identityName: "maya.singh",
    resource: "s3://finance-reports", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/maya.singh",
      resourceArn: "arn:aws:s3:::finance-reports",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-048", identityId: "id-018", identityName: "elise.moran",
    resource: "bigquery://acme-analytics.pii_views", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData", "bigquery.jobs.create"], mechanism: "HAS_ROLE",
    lastConfirmed: "2026-07-29", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery + cloudasset",
      principal: "user:elise.moran@acme.com",
      resource: "//bigquery.googleapis.com/projects/acme-prod-4821/datasets/pii_views",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-049", identityId: "id-019", identityName: "quinn.adebayo",
    resource: "ec2://i-0devopsjump01", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ec2:StartInstances", "ec2:StopInstances", "ssm:StartSession"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam + ssm",
      principalArn: "arn:aws:iam::481516234210:user/quinn.adebayo",
      resourceArn: "arn:aws:ec2:us-east-1:481516234210:instance/i-0devopsjump01",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-050", identityId: "id-115", identityName: "svc-finance-ghost",
    resource: "s3://finance-reports", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 1,
    effectivePermissions: ["s3:GetObject", "s3:GetObjectAcl", "s3:ListBucket"], mechanism: "ASSUMES_ROLE",
    lastConfirmed: "2026-07-20", cloudProvider: "AWS", blocked: false, shadowAdmin: false,
    adminRole: "iam://finance-reports-reader",
    api: {
      source: "aws.iam + cloudtrail",
      roleArn: "arn:aws:iam::481516234210:role/svc-finance-ghost",
      resourceArn: "arn:aws:s3:::finance-reports",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
      note: "Created with alice.brooks credentials after HR termination",
    },
    hopChain: [
      { step: 1, from: "alice.brooks", to: "svc-finance-ghost", mechanism: "iam:CreateRole", timestamp: "2026-06-12T03:14:00Z" },
      { step: 2, from: "svc-finance-ghost", to: "s3://finance-reports", mechanism: "s3:GetObject", timestamp: "2026-07-20T11:02:00Z" },
    ],
  },
  {
    id: "ap-051", identityId: "id-116", identityName: "svc-etl-ghost",
    resource: "storage://raw-pii-data", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["storage.objects.get", "storage.objects.list"],
    mechanism: "gcf://ghost-etl-fn → SA key → storage.objectViewer",
    lastConfirmed: "2026-07-08", cloudProvider: "GCP", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "svc-etl-ghost", to: "gcf://ghost-etl-fn", mechanism: "Cloud Function trigger", timestamp: "2026-07-08T03:00:00Z", api: "cloudfunctions.functions.call" },
      { step: 2, from: "gcf://ghost-etl-fn", to: "iam://svc-etl-ghost-key", mechanism: "embedded SA key", timestamp: "2026-07-08T03:00:01Z", api: "iam.serviceAccountKeys.list" },
      { step: 3, from: "iam://svc-etl-ghost-key", to: "storage://raw-pii-data", mechanism: "storage.objectViewer binding", timestamp: "2026-07-08T03:00:02Z", api: "storage.buckets.getIamPolicy" },
    ],
    api: {
      source: "gcp.storage + cloudasset",
      principal: "serviceAccount:svc-etl-ghost@acme-prod-4821.iam.gserviceaccount.com",
      resource: "//storage.googleapis.com/projects/_/buckets/raw-pii-data",
      resourceName: "projects/acme-prod-4821/buckets/raw-pii-data",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
      note: "Created after raj.patel termination",
    },
  },
  {
    id: "ap-052", identityId: "id-117", identityName: "svc-ledger-bot",
    resource: "dynamodb://payments-ledger", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-27", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-ledger-bot",
      resourceArn: "arn:aws:dynamodb:us-east-1:481516234210:table/payments-ledger",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-053", identityId: "id-118", identityName: "svc-recon-worker",
    resource: "lambda://payments-recon", resourceSensitivity: "high", accessType: "Indirect", hopCount: 1,
    effectivePermissions: ["lambda:InvokeFunction", "s3:GetObject"], mechanism: "ASSUMES_ROLE",
    lastConfirmed: "2026-07-26", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.lambda + iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-recon-worker",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-054", identityId: "id-119", identityName: "svc-fx-batch",
    resource: "secrets://fx-api-keys", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["secretsmanager:GetSecretValue"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-25", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.secretsmanager + iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-fx-batch",
      resourceArn: "arn:aws:secretsmanager:us-east-1:481516234210:secret:fx-api-keys",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-055", identityId: "id-120", identityName: "svc-catalog-sync",
    resource: "bigquery://acme-analytics.product_catalog", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData", "bigquery.tables.updateData"], mechanism: "HAS_ROLE",
    lastConfirmed: "2026-07-24", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery + cloudasset",
      principal: "serviceAccount:svc-catalog-sync@acme-prod-4821.iam.gserviceaccount.com",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-056", identityId: "id-121", identityName: "svc-ami-baker",
    resource: "ec2://ami-bake-pipeline", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ec2:CreateImage", "ec2:DescribeImages", "s3:PutObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-23", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.ec2 + iam",
      roleArn: "arn:aws:iam::481516234210:role/svc-ami-baker",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },

  // Google Workspace directory-derived access (so Discovery GWS filter is non-empty)
  {
    id: "ap-057", identityId: "id-001", identityName: "jane.doe",
    resource: "gws://group/AWS-PowerUsers", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["groups.membership"], mechanism: "MEMBER_OF",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false,
    api: {
      source: "google.workspace.directory",
      primaryEmail: "jane.doe@acme.com",
      groupEmail: "aws-powerusers@acme.com",
      evaluatedVia: "directory.members.list",
    },
  },
  {
    id: "ap-058", identityId: "id-004", identityName: "tom.walker",
    resource: "gws://admin/super-admin", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["admin.directory.user", "admin.directory.group"], mechanism: "IS_ADMIN",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false,
    api: {
      source: "google.workspace.directory",
      primaryEmail: "tom.walker@acme.com",
      isAdmin: true,
      evaluatedVia: "directory.users.get",
    },
  },
  {
    id: "ap-059", identityId: "id-010", identityName: "mei.lin",
    resource: "gws://group/Security-Oncall", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["groups.membership"], mechanism: "MEMBER_OF",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "google.workspace.directory",
      primaryEmail: "mei.lin@acme.com",
      groupEmail: "security-oncall@acme.com",
      evaluatedVia: "directory.members.list",
    },
  },
  {
    id: "ap-060", identityId: "id-007", identityName: "sara.jones",
    resource: "gws://group/Engineering", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["groups.membership"], mechanism: "MEMBER_OF",
    lastConfirmed: "2026-07-29", cloudProvider: "GCP", blocked: false,
    api: {
      source: "google.workspace.directory",
      primaryEmail: "sara.jones@acme.com",
      groupEmail: "engineering@acme.com",
      evaluatedVia: "directory.members.list",
    },
  },
  // Leaver / NHI residual access (lifecycle)
  {
    id: "ap-061", identityId: "id-125", identityName: "svc-alice-wire-batch",
    resource: "s3://payments-wire-outbox", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:PutObject", "s3:GetObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-18", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:role/svc-alice-wire-batch",
      resourceArn: "arn:aws:s3:::payments-wire-outbox",
      policyArn: "arn:aws:iam::481516234210:policy/WireBatchSubmit",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
      note: "Orphaned after alice.brooks departure",
    },
  },
  {
    id: "ap-062", identityId: "id-020", identityName: "claire.nguyen",
    resource: "azure://app-support-bridge", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Application.ReadWrite.OwnedBy"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-12", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "c1a1re00-2222-4333-8444-555566667777",
      roleDefinitionName: "Application Administrator",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-063", identityId: "id-126", identityName: "svc-claire-support-bridge",
    resource: "azure://kv-product-tokens", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/get", "Secrets/list"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-12", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization + keyvault",
      principalId: "c1a1re11-bridge-4000-8000-000000000126",
      roleDefinitionName: "Key Vault Secrets User",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-064", identityId: "id-021", identityName: "derek.frost",
    resource: "s3://security-scan-artifacts", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-05", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:user/derek.frost",
      resourceArn: "arn:aws:s3:::security-scan-artifacts",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-065", identityId: "id-128", identityName: "svc-derek-scan-runner",
    resource: "ec2://i-0scanfleet", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ec2:StartInstances", "ec2:StopInstances", "ssm:SendCommand"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-05", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:role/svc-derek-scan-runner",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-066", identityId: "id-129", identityName: "svc-derek-vault-reader",
    resource: "secretsmanager://prod/security/*", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["secretsmanager:GetSecretValue", "secretsmanager:ListSecrets"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-06-30", cloudProvider: "AWS", blocked: false,
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:role/svc-derek-vault-reader",
      evaluatedVia: "iam:SimulatePrincipalPolicy",
    },
  },
  {
    id: "ap-067", identityId: "id-022", identityName: "helena.cho",
    resource: "bigquery://eng-scratch.feature_flags", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-06-28", cloudProvider: "GCP", blocked: true,
    api: {
      source: "gcp.bigquery + iam",
      principal: "user:helena.cho@acme.com",
      role: "roles/bigquery.dataViewer",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
      note: "Revoked during offboarding",
    },
  },
  // Offline beat 23b — hop + unowned (compound Needs attention) + companion direct grant
  {
    id: "ap-068", identityId: "id-mock-ssm-bridge", identityName: "Temporary SSM Bridge",
    resource: "admin:platform", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 3,
    effectivePermissions: ["admin:platform"], mechanism: "ssm:session-deploy-box → role-deploy-box",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    originator: "No originator",
    hopChain: [
      { step: 1, from: "svc-temp-ssm-bridge", to: "ssm:session-deploy-box", edge: "CAN_ACCESS", mechanism: "granted ssm:session-deploy-box" },
      { step: 2, from: "ssm:session-deploy-box", to: "role-deploy-box", edge: "ASSUMES_ROLE", mechanism: "resource carries role-deploy-box" },
      { step: 3, from: "role-deploy-box", to: "admin:platform", edge: "HAS_POLICY", mechanism: "holds admin:platform" },
    ],
    api: {
      source: "aws.iam + ssm",
      principalArn: "arn:aws:iam::481516234210:role/svc-temp-ssm-bridge",
      evaluatedVia: "itag.access.classify",
    },
  },
  {
    id: "ap-069", identityId: "id-mock-ssm-bridge", identityName: "Temporary SSM Bridge",
    resource: "ssm:session-deploy-box", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["ssm:session-deploy-box"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    originator: "No originator",
    api: {
      source: "aws.iam",
      principalArn: "arn:aws:iam::481516234210:role/svc-temp-ssm-bridge",
      evaluatedVia: "itag.access.classify",
    },
  },

  // Incident Responder Agent — live agent-incident-responder drawer parity
  {
    id: "ap-070", identityId: "id-mock-incident-responder", identityName: "Incident Responder Agent",
    resource: "admin:warehouse", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 6,
    effectivePermissions: ["admin:warehouse"],
    mechanism: "mcp:connect-prod-runbook → mcp:connect-warehouse-box",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    originator: "No originator",
    hopChain: [
      { step: 1, from: "agent-incident-responder", to: "group-oncall-agents", edge: "MEMBER_OF", mechanism: "group membership" },
      { step: 2, from: "group-oncall-agents", to: "mcp:connect-prod-runbook", edge: "CAN_ACCESS", mechanism: "granted mcp:connect-prod-runbook" },
      { step: 3, from: "mcp:connect-prod-runbook", to: "role-runbook-executor", edge: "ASSUMES_ROLE", mechanism: "resource carries role-runbook-executor" },
      { step: 4, from: "role-runbook-executor", to: "mcp:connect-warehouse-box", edge: "CAN_ACCESS", mechanism: "granted mcp:connect-warehouse-box" },
      { step: 5, from: "mcp:connect-warehouse-box", to: "role-warehouse-admin", edge: "ASSUMES_ROLE", mechanism: "resource carries role-warehouse-admin" },
      { step: 6, from: "role-warehouse-admin", to: "admin:warehouse", edge: "HAS_POLICY", mechanism: "holds admin:warehouse" },
    ],
    api: { source: "mcp-gateway", evaluatedVia: "itag.access.classify", app: "mcp-gateway" },
  },
  {
    id: "ap-071", identityId: "id-mock-incident-responder", identityName: "Incident Responder Agent",
    resource: "mcp:prod-db-query", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 4,
    effectivePermissions: ["mcp:prod-db-query"],
    mechanism: "mcp:connect-prod-runbook → role-runbook-executor",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    originator: "No originator",
    hopChain: [
      { step: 1, from: "agent-incident-responder", to: "group-oncall-agents", edge: "MEMBER_OF", mechanism: "group membership" },
      { step: 2, from: "group-oncall-agents", to: "mcp:connect-prod-runbook", edge: "CAN_ACCESS", mechanism: "granted mcp:connect-prod-runbook" },
      { step: 3, from: "mcp:connect-prod-runbook", to: "role-runbook-executor", edge: "ASSUMES_ROLE", mechanism: "resource carries role-runbook-executor" },
      { step: 4, from: "role-runbook-executor", to: "mcp:prod-db-query", edge: "HAS_POLICY", mechanism: "holds mcp:prod-db-query" },
    ],
    api: { source: "mcp-gateway", evaluatedVia: "itag.access.classify", app: "mcp-gateway" },
  },
  {
    id: "ap-072", identityId: "id-mock-incident-responder", identityName: "Incident Responder Agent",
    resource: "mcp:connect-warehouse-box", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 4,
    effectivePermissions: ["mcp:connect-warehouse-box"],
    mechanism: "mcp:connect-prod-runbook → role-runbook-executor",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    originator: "No originator",
    hopChain: [
      { step: 1, from: "agent-incident-responder", to: "group-oncall-agents", edge: "MEMBER_OF", mechanism: "group membership" },
      { step: 2, from: "group-oncall-agents", to: "mcp:connect-prod-runbook", edge: "CAN_ACCESS", mechanism: "granted mcp:connect-prod-runbook" },
      { step: 3, from: "mcp:connect-prod-runbook", to: "role-runbook-executor", edge: "ASSUMES_ROLE", mechanism: "resource carries role-runbook-executor" },
      { step: 4, from: "role-runbook-executor", to: "mcp:connect-warehouse-box", edge: "HAS_POLICY", mechanism: "holds mcp:connect-warehouse-box" },
    ],
    api: { source: "mcp-gateway", evaluatedVia: "itag.access.classify", app: "mcp-gateway" },
  },
  {
    id: "ap-073", identityId: "id-mock-incident-responder", identityName: "Incident Responder Agent",
    resource: "mcp:connect-prod-runbook", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["mcp:connect-prod-runbook"],
    mechanism: "MEMBER_OF:group-oncall-agents",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    originator: "No originator",
    api: {
      source: "mcp-gateway",
      oktaGroupName: "group-oncall-agents",
      evaluatedVia: "itag.access.classify",
      app: "mcp-gateway",
    },
  },

  // Release Orchestrator — live svc-release-orchestrator drawer parity
  {
    id: "ap-074", identityId: "id-mock-release-orchestrator", identityName: "Release Orchestrator",
    resource: "deploy:prod", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 5,
    effectivePermissions: ["deploy:prod"],
    mechanism: "gh:connect-release-runner → gh:connect-artifact-signer",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    hopChain: [
      { step: 1, from: "svc-release-orchestrator", to: "gh:connect-release-runner", edge: "CAN_ACCESS", mechanism: "granted gh:connect-release-runner" },
      { step: 2, from: "gh:connect-release-runner", to: "role-release-runner", edge: "ASSUMES_ROLE", mechanism: "resource carries role-release-runner" },
      { step: 3, from: "role-release-runner", to: "gh:connect-artifact-signer", edge: "CAN_ACCESS", mechanism: "granted gh:connect-artifact-signer" },
      { step: 4, from: "gh:connect-artifact-signer", to: "role-artifact-signer", edge: "ASSUMES_ROLE", mechanism: "resource carries role-artifact-signer" },
      { step: 5, from: "role-artifact-signer", to: "deploy:prod", edge: "HAS_POLICY", mechanism: "holds deploy:prod" },
    ],
    api: { source: "github", evaluatedVia: "itag.access.classify", app: "github" },
  },
  {
    id: "ap-075", identityId: "id-mock-release-orchestrator", identityName: "Release Orchestrator",
    resource: "gh:connect-artifact-signer", resourceSensitivity: "high", accessType: "Shadow", hopCount: 3,
    effectivePermissions: ["gh:connect-artifact-signer"],
    mechanism: "gh:connect-release-runner → role-release-runner",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "svc-release-orchestrator", to: "gh:connect-release-runner", edge: "CAN_ACCESS", mechanism: "granted gh:connect-release-runner" },
      { step: 2, from: "gh:connect-release-runner", to: "role-release-runner", edge: "ASSUMES_ROLE", mechanism: "resource carries role-release-runner" },
      { step: 3, from: "role-release-runner", to: "gh:connect-artifact-signer", edge: "HAS_POLICY", mechanism: "holds gh:connect-artifact-signer" },
    ],
    api: { source: "github", evaluatedVia: "itag.access.classify", app: "github" },
  },
  {
    id: "ap-076", identityId: "id-mock-release-orchestrator", identityName: "Release Orchestrator",
    resource: "gh:connect-release-runner", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["gh:connect-release-runner"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: { source: "github", evaluatedVia: "itag.access.classify", app: "github" },
  },
  {
    id: "ap-077", identityId: "id-mock-release-orchestrator", identityName: "Release Orchestrator",
    resource: "read:release-notes", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["read:release-notes"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false,
    api: { source: "github", evaluatedVia: "itag.access.classify", app: "github" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Exposure demo pack: azure-bridge — densify Azure tab (≥2 pages)
  // subscription f47ac10b-58cc-4372-a567-0e02b2c3d479
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ap-080", identityId: "id-004", identityName: "tom.walker",
    resource: "azure://kv-security-audit", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/list", "Keys/list"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization + keyvault",
      principalId: "tom-walker-azure-oid",
      roleDefinitionName: "Key Vault Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-security/providers/Microsoft.KeyVault/vaults/kv-security-audit",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-081", identityId: "id-005", identityName: "alice.brooks",
    resource: "azure://sa-finance-archive", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-06-28", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "alice-brooks-azure-oid",
      roleDefinitionName: "Storage Blob Data Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.Storage/storageAccounts/safinancearchive",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
      note: "Departed human; Azure principal still assigned",
    },
  },
  {
    id: "ap-082", identityId: "id-014", identityName: "nora.whitfield",
    resource: "azure://sql-finance-reporting", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["Microsoft.Sql/servers/databases/read"],
    mechanism: "MEMBER_OF:Azure-Finance-Readers",
    lastConfirmed: "2026-03-01", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization + graph",
      principalId: "f1e2d3c4-b5a6-9788-0011-223344556677",
      roleDefinitionName: "SQL DB Contributor",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.Sql/servers/sql-finance/databases/reporting",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-083", identityId: "id-016", identityName: "henry.cole",
    resource: "azure://kv-payments-prod", resourceSensitivity: "critical", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/get"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-28", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.keyvault",
      principalId: "henry-cole-azure-oid",
      roleDefinitionName: "Key Vault Secrets User",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-payments/providers/Microsoft.KeyVault/vaults/kv-payments-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-084", identityId: "id-017", identityName: "maya.singh",
    resource: "azure://sa-billing-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-29", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "maya-singh-azure-oid",
      roleDefinitionName: "Storage Blob Data Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.Storage/storageAccounts/sabillingprod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-085", identityId: "id-013", identityName: "chris.nguyen",
    resource: "azure://aks-sre-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.ContainerService/managedClusters/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.containerservice",
      principalId: "chris-nguyen-azure-oid",
      roleDefinitionName: "Azure Kubernetes Service Cluster User Role",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-sre/providers/Microsoft.ContainerService/managedClusters/aks-sre-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-086", identityId: "id-013", identityName: "chris.nguyen",
    resource: "azure://mi-sre-ops → kv-ops-secrets", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["Secrets/get", "Secrets/set"],
    mechanism: "AKS workload identity → MI → Key Vault",
    lastConfirmed: "2026-07-28", cloudProvider: "Azure", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "chris.nguyen", to: "azure://aks-sre-prod", mechanism: "cluster user binding", timestamp: "2026-07-28T10:00:00Z", api: "Microsoft.ContainerService/managedClusters/read" },
      { step: 2, from: "azure://aks-sre-prod", to: "azure://mi-sre-ops", mechanism: "workload identity federation", timestamp: "2026-07-28T10:00:01Z", api: "Microsoft.ManagedIdentity/userAssignedIdentities/read" },
      { step: 3, from: "azure://mi-sre-ops", to: "azure://kv-ops-secrets", mechanism: "Key Vault Secrets Officer", timestamp: "2026-07-28T10:00:02Z", api: "Microsoft.Authorization/roleAssignments/read" },
    ],
    api: {
      source: "azure.containerservice + managedidentity + keyvault",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-sre",
      nativeVisible: false,
    },
  },
  {
    id: "ap-087", identityId: "id-023", identityName: "sofia.reyes",
    resource: "azure://rg-platform-prod", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["*/read"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.authorization",
      principalId: "sofia-reyes-azure-oid",
      roleDefinitionName: "Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-platform-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-088", identityId: "id-024", identityName: "marcus.vale",
    resource: "azure://appi-sre-prod", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Insights/*/read"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-27", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.insights",
      principalId: "marcus-vale-azure-oid",
      roleDefinitionName: "Monitoring Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-sre/providers/Microsoft.Insights/components/appi-sre-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-089", identityId: "id-101", identityName: "svc-payments-api",
    resource: "azure://sb-payments-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.ServiceBus/namespaces/queues/send"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.servicebus",
      principalId: "deadbeef-0001-4000-8000-000000000101",
      roleDefinitionName: "Azure Service Bus Data Sender",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-payments/providers/Microsoft.ServiceBus/namespaces/sb-payments-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-090", identityId: "id-106", identityName: "svc-monitoring",
    resource: "azure://law-ops-prod", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.OperationalInsights/workspaces/query/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.operationalinsights",
      principalId: "deadbeef-0001-4000-8000-000000000106",
      roleDefinitionName: "Log Analytics Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-ops/providers/Microsoft.OperationalInsights/workspaces/law-ops-prod",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-091", identityId: "id-133", identityName: "svc-alice-refund-bot",
    resource: "azure://fn-refunds-prod", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["Microsoft.Web/sites/functions/write", "Secrets/get"],
    mechanism: "Function app → system MI → Key Vault + refunds queue",
    lastConfirmed: "2026-07-20", cloudProvider: "Azure", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "svc-alice-refund-bot", to: "azure://fn-refunds-prod", mechanism: "function app identity", timestamp: "2026-07-20T08:00:00Z", api: "Microsoft.Web/sites/read" },
      { step: 2, from: "azure://fn-refunds-prod", to: "azure://mi-fn-refunds", mechanism: "system-assigned managed identity", timestamp: "2026-07-20T08:00:01Z", api: "Microsoft.ManagedIdentity/userAssignedIdentities/read" },
      { step: 3, from: "azure://mi-fn-refunds", to: "azure://kv-payments-prod", mechanism: "Key Vault Secrets User", timestamp: "2026-07-20T08:00:02Z", api: "Microsoft.Authorization/roleAssignments/read" },
    ],
    api: {
      source: "azure.web + managedidentity + keyvault",
      note: "Orphaned NHI after alice.brooks departure",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-payments",
      nativeVisible: false,
    },
  },
  {
    id: "ap-092", identityId: "id-021", identityName: "derek.frost",
    resource: "azure://kv-security-audit", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Secrets/list"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-29", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.keyvault",
      principalId: "derek-frost-azure-oid",
      roleDefinitionName: "Key Vault Reader",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-security/providers/Microsoft.KeyVault/vaults/kv-security-audit",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-093", identityId: "id-015", identityName: "kai.sato",
    resource: "azure://app-intern-sandbox", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Web/sites/read"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-25", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.web",
      principalId: "kai-sato-azure-oid",
      roleDefinitionName: "Website Contributor",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-sandbox/providers/Microsoft.Web/sites/app-intern-sandbox",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-094", identityId: "id-019", identityName: "quinn.adebayo",
    resource: "azure://vmss-build-agents", resourceSensitivity: "high", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["Microsoft.Compute/virtualMachineScaleSets/*/read"],
    mechanism: "MEMBER_OF:Azure-DevOps-Operators",
    lastConfirmed: "2026-07-28", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.compute + graph",
      principalId: "quinn-adebayo-azure-oid",
      roleDefinitionName: "Virtual Machine Contributor",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-devops/providers/Microsoft.Compute/virtualMachineScaleSets/vmss-build-agents",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-095", identityId: "id-114", identityName: "svc-finance-reporter",
    resource: "azure://synapse-finance", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Synapse/workspaces/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-26", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.synapse",
      principalId: "deadbeef-0001-4000-8000-000000000114",
      roleDefinitionName: "Synapse SQL Administrator",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance/providers/Microsoft.Synapse/workspaces/synapse-finance",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-096", identityId: "id-115", identityName: "svc-finance-ghost",
    resource: "azure://sa-finance-archive", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["Microsoft.Storage/storageAccounts/blobServices/containers/blobs/*"],
    mechanism: "Logic App → MI → Storage Blob Data Owner",
    lastConfirmed: "2026-07-12", cloudProvider: "Azure", blocked: false, shadowAdmin: true,
    hopChain: [
      { step: 1, from: "svc-finance-ghost", to: "azure://logic-finance-export", mechanism: "Logic App run", timestamp: "2026-07-12T02:00:00Z", api: "Microsoft.Logic/workflows/read" },
      { step: 2, from: "azure://logic-finance-export", to: "azure://mi-finance-export", mechanism: "workflow managed identity", timestamp: "2026-07-12T02:00:01Z", api: "Microsoft.ManagedIdentity/userAssignedIdentities/read" },
      { step: 3, from: "azure://mi-finance-export", to: "azure://sa-finance-archive", mechanism: "Storage Blob Data Owner", timestamp: "2026-07-12T02:00:02Z", api: "Microsoft.Authorization/roleAssignments/read" },
    ],
    api: {
      source: "azure.logic + storage",
      note: "Ghost NHI — no active owner attestation",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-finance",
      nativeVisible: false,
    },
  },
  {
    id: "ap-097", identityId: "id-002", identityName: "mark.chen",
    resource: "azure://acr-devops", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.ContainerRegistry/registries/pull/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.containerregistry",
      principalId: "1a2b3c4d-5e6f-7081-9203-b4c5d6e7f809",
      roleDefinitionName: "AcrPull",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-devops/providers/Microsoft.ContainerRegistry/registries/acrdevops",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },
  {
    id: "ap-098", identityId: "id-007", identityName: "sara.jones",
    resource: "azure://app-payments-portal", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["Microsoft.Web/sites/read"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-29", cloudProvider: "Azure", blocked: false,
    api: {
      source: "azure.web",
      principalId: "sara-jones-azure-oid",
      roleDefinitionName: "Website Contributor",
      scope: "/subscriptions/f47ac10b-58cc-4372-a567-0e02b2c3d479/resourceGroups/rg-payments/providers/Microsoft.Web/sites/app-payments-portal",
      evaluatedVia: "Microsoft.Authorization/roleAssignments",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Exposure demo pack: gcp-data-plane — deepen GCP + score spread
  // project acme-prod-4821
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "ap-100", identityId: "id-004", identityName: "tom.walker",
    resource: "bigquery://security_audit_views", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData"], mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery",
      principal: "user:tom.walker@acme.com",
      role: "roles/bigquery.dataViewer",
      resourceName: "projects/acme-prod-4821/datasets/security_audit_views",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-101", identityId: "id-018", identityName: "elise.moran",
    resource: "bigquery://analytics-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData", "bigquery.jobs.create"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-29", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery",
      principal: "user:elise.moran@acme.com",
      role: "roles/bigquery.dataEditor",
      resourceName: "projects/acme-prod-4821/datasets/analytics_prod",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
    },
  },
  {
    id: "ap-102", identityId: "id-015", identityName: "kai.sato",
    resource: "gke://devops-cluster", resourceSensitivity: "medium", accessType: "Indirect", hopCount: 0,
    effectivePermissions: ["container.pods.get", "container.pods.list"],
    mechanism: "MEMBER_OF:GCP-Editors",
    lastConfirmed: "2026-07-28", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.container",
      principal: "user:kai.sato@acme.com",
      role: "roles/container.viewer",
      resourceName: "projects/acme-prod-4821/locations/us-central1/clusters/devops-cluster",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-103", identityId: "id-015", identityName: "kai.sato",
    resource: "storage://ml-scratch", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["storage.objects.create", "storage.objects.get"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-27", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.storage",
      principal: "user:kai.sato@acme.com",
      role: "roles/storage.objectUser",
      resourceName: "projects/acme-prod-4821/buckets/ml-scratch",
      evaluatedVia: "storage.buckets.getIamPolicy",
    },
  },
  {
    id: "ap-104", identityId: "id-009", identityName: "diego.ramos",
    resource: "gce://batch-worker-01", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["compute.instances.start", "compute.instances.stop"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-26", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.compute",
      principal: "user:diego.ramos@acme.com",
      role: "roles/compute.instanceAdmin.v1",
      resourceName: "projects/acme-prod-4821/zones/us-central1-a/instances/batch-worker-01",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-105", identityId: "id-102", identityName: "svc-data-ingest",
    resource: "pubsub://raw-events", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["pubsub.subscriptions.consume"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.pubsub",
      principal: "serviceAccount:svc-data-ingest@acme-prod-4821.iam.gserviceaccount.com",
      role: "roles/pubsub.subscriber",
      resourceName: "projects/acme-prod-4821/subscriptions/raw-events-sub",
      evaluatedVia: "pubsub.subscriptions.getIamPolicy",
    },
  },
  {
    id: "ap-106", identityId: "id-102", identityName: "svc-data-ingest",
    resource: "bigquery://landing_zone", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["bigquery.tables.updateData", "bigquery.datasets.update"],
    mechanism: "Dataflow worker SA impersonation → dataset editor",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false, shadowAdmin: false,
    hopChain: [
      { step: 1, from: "svc-data-ingest", to: "dataflow://ingest-job", mechanism: "pipeline launch", timestamp: "2026-07-30T04:00:00Z", api: "dataflow.jobs.create" },
      { step: 2, from: "dataflow://ingest-job", to: "iam://dataflow-worker", mechanism: "worker service account", timestamp: "2026-07-30T04:00:01Z", api: "iamcredentials.generateAccessToken" },
      { step: 3, from: "iam://dataflow-worker", to: "bigquery://landing_zone", mechanism: "dataset editor binding", timestamp: "2026-07-30T04:00:02Z", api: "bigquery.datasets.getIamPolicy" },
    ],
    api: {
      source: "gcp.dataflow + bigquery",
      principal: "serviceAccount:svc-data-ingest@acme-prod-4821.iam.gserviceaccount.com",
      resourceName: "projects/acme-prod-4821/datasets/landing_zone",
      nativeVisible: false,
    },
  },
  {
    id: "ap-107", identityId: "id-012", identityName: "fatima.hassan",
    resource: "storage://product-exports", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["storage.objects.get"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-24", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.storage",
      principal: "user:fatima.hassan@acme.com",
      role: "roles/storage.objectViewer",
      resourceName: "projects/acme-prod-4821/buckets/product-exports",
      evaluatedVia: "storage.buckets.getIamPolicy",
    },
  },
  {
    id: "ap-108", identityId: "id-120", identityName: "svc-catalog-sync",
    resource: "firestore://product-catalog", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["datastore.entities.get", "datastore.entities.create"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-28", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.firestore",
      principal: "serviceAccount:svc-catalog-sync@acme-prod-4821.iam.gserviceaccount.com",
      role: "roles/datastore.user",
      resourceName: "projects/acme-prod-4821/databases/(default)",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-109", identityId: "id-006", identityName: "raj.patel",
    resource: "bigquery://analytics-prod", resourceSensitivity: "high", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["bigquery.tables.getData"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-05-01", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.bigquery",
      principal: "user:raj.patel@acme.com",
      role: "roles/bigquery.dataViewer",
      resourceName: "projects/acme-prod-4821/datasets/analytics_prod",
      evaluatedVia: "bigquery.datasets.getIamPolicy",
      note: "Departed; GCP binding not fully revoked",
    },
  },
  {
    id: "ap-110", identityId: "id-008", identityName: "lena.okonkwo",
    resource: "gke://devops-cluster", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["container.pods.exec"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-30", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.container",
      principal: "user:lena.okonkwo@acme.com",
      role: "roles/container.developer",
      resourceName: "projects/acme-prod-4821/locations/us-central1/clusters/devops-cluster",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-111", identityId: "id-019", identityName: "quinn.adebayo",
    resource: "gce://ci-builder-02", resourceSensitivity: "medium", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["compute.instances.setMetadata", "compute.instances.start"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-29", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.compute",
      principal: "user:quinn.adebayo@acme.com",
      role: "roles/compute.instanceAdmin.v1",
      resourceName: "projects/acme-prod-4821/zones/us-central1-b/instances/ci-builder-02",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-112", identityId: "id-022", identityName: "helena.cho",
    resource: "artifactregistry://eng-images", resourceSensitivity: "low", accessType: "Direct", hopCount: 0,
    effectivePermissions: ["artifactregistry.repositories.downloadArtifacts"],
    mechanism: "HAS_POLICY",
    lastConfirmed: "2026-07-28", cloudProvider: "GCP", blocked: false,
    api: {
      source: "gcp.artifactregistry",
      principal: "user:helena.cho@acme.com",
      role: "roles/artifactregistry.reader",
      resourceName: "projects/acme-prod-4821/locations/us-central1/repositories/eng-images",
      evaluatedVia: "cloudasset.analyzeIamPolicy",
    },
  },
  {
    id: "ap-113", identityId: "id-112", identityName: "svc-github-actions",
    resource: "iam://deploy-prod-sa", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["iam.serviceAccounts.actAs", "container.clusters.getCredentials"],
    mechanism: "WIF → deploy SA → GKE deploy",
    lastConfirmed: "2026-07-31", cloudProvider: "GCP", blocked: false, shadowAdmin: true,
    hopChain: [
      { step: 1, from: "svc-github-actions", to: "iam://github-wif-pool", mechanism: "Workload Identity Federation", timestamp: "2026-07-31T09:00:00Z", api: "iam.googleapis.com" },
      { step: 2, from: "iam://github-wif-pool", to: "iam://deploy-prod-sa", mechanism: "impersonate service account", timestamp: "2026-07-31T09:00:01Z", api: "iamcredentials.generateAccessToken" },
      { step: 3, from: "iam://deploy-prod-sa", to: "gke://devops-cluster", mechanism: "cluster credentials", timestamp: "2026-07-31T09:00:02Z", api: "container.clusters.getCredentials" },
    ],
    api: {
      source: "gcp.iam + container",
      principal: "serviceAccount:svc-github-actions@acme-prod-4821.iam.gserviceaccount.com",
      resourceName: "projects/acme-prod-4821/locations/us-central1/clusters/devops-cluster",
      nativeVisible: false,
    },
  },
];

// ─── Shadow Access derived views ─────────────────────────────────────────────


/** Align hopChain with live Access Discovery drawer (engine AccessChainStep vocabulary). */
function normalizeMockHopChain(steps) {
  if (!Array.isArray(steps) || !steps.length) return [];
  return steps.map((raw, idx) => {
    const from = String(raw.from || '').trim();
    const to = String(raw.to || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    let mechanism = String(raw.mechanism || '').trim();
    let edge = raw.edge || null;
    const isLast = idx === steps.length - 1;
    const alreadyEngine = /^(granted |resource carries |holds |group membership)/i.test(mechanism);

    if (!alreadyEngine) {
      const m = mechanism.toLowerCase();
      if (/member_of|group membership|memberof/.test(m)) {
        mechanism = 'group membership';
        edge = 'MEMBER_OF';
      } else if (
        /resource carries|instance profile|workload identity|execution role|managed identity|assumes?_?role|assumerole/.test(m)
        && !isLast
      ) {
        mechanism = `resource carries ${to.replace(/^iam:\/\//, '').replace(/^azure:\/\//, '')}`;
        edge = 'ASSUMES_ROLE';
      } else if (isLast || /holds|has_policy|fullaccess|owner role|passrole|binding/.test(m)) {
        mechanism = `holds ${to.replace(/^iam:\/\//, '').replace(/^azure:\/\//, '')}`;
        edge = 'HAS_POLICY';
      } else {
        const grant = to.includes('://') ? to.split('/').pop() : to;
        mechanism = `granted ${grant}`;
        edge = 'CAN_ACCESS';
      }
    } else if (!edge) {
      if (/^granted /i.test(mechanism)) edge = 'CAN_ACCESS';
      else if (/^resource carries /i.test(mechanism)) edge = 'ASSUMES_ROLE';
      else if (/^holds /i.test(mechanism)) edge = 'HAS_POLICY';
      else if (/^group membership/i.test(mechanism)) edge = 'MEMBER_OF';
    }

    return {
      step: idx + 1,
      from,
      to,
      edge: edge || 'CAN_ACCESS',
      mechanism,
      ...(raw.api ? { api: raw.api } : {}),
      ...(raw.resourceArn ? { resourceArn: raw.resourceArn } : {}),
      ...(raw.resourceName ? { resourceName: raw.resourceName } : {}),
    };
  });
}

// Keep denormalized names / originators aligned with the canonical identity roster
accessPaths.forEach(p => {
  const identity = identities.find(i => i.id === p.identityId);
  if (identity) p.identityName = identity.name;
  p.originatorId = identity?.originatorId || identity?.createdBy || SYSTEM_ORIGINATOR.id;
  p.originator = identity?.originator || identityNameById[p.originatorId] || SYSTEM_ORIGINATOR.name;
  p.provisionedById = p.originatorId;
  p.provisionedBy = p.originator;

  // Delegation / escalation drawer: hopCount = chain length; app label for related-path meta
  if (Array.isArray(p.hopChain) && p.hopChain.length) {
    p.hopChain = normalizeMockHopChain(p.hopChain);
    p.hopCount = p.hopChain.length;
    if (p.accessType === 'Shadow' || p.hopCount > 0) {
      p.accessType = 'Shadow';
    }
  }
  if (p.api?.app && !p.app) p.app = p.api.app;
});

export const shadowAccessPaths = accessPaths.filter(p => p.accessType === "Shadow");

// Shadow Admins: identities who gain effective admin-level access via shadow access chains
export const shadowAdmins = [
  {
    identityId: "id-105",
    identityName: "svc-old-payments-worker",
    identityType: "service",
    department: "Payments",
    hopCount: 3,
    adminRole: "iam://payments-admin-role",
    adminRoleLabel: "Payments Admin",
    effectivePermissions: ["*"],
    shadowPath: "svc-old-payments-worker → Lambda:legacy-worker → payments-exec-role → payments-admin-role",
    pivotResource: "lambda://legacy-worker",
    mechanism: "InvokeFunction → Lambda execution role → sts:AssumeRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-20",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Orphaned service account reaches payments-admin through a three-hop Lambda chain. Not visible in AWS IAM Analyzer.",
  },
  {
    identityId: "id-001",
    identityName: "jane.doe",
    identityType: "human",
    department: "Engineering",
    hopCount: 2,
    adminRole: "iam://account-root-admin",
    adminRoleLabel: "AWS Account Root Admin",
    effectivePermissions: ["*"],
    shadowPath: "jane.doe → EC2:i-0abc123 (payments-prod-worker) → AdminInstanceProfile → iam:PassRole → account-root-admin",
    pivotResource: "EC2:i-0abc123 (payments-prod-worker)",
    mechanism: "ssm:StartSession → EC2 Instance Profile → iam:PassRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-31",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Full wildcard (*) permissions — equivalent to cloud super-admin. Not visible in AWS IAM Analyzer because access is mediated through an EC2 instance profile, not a direct policy attachment.",
  },
  {
    identityId: "id-002",
    identityName: "mark.chen",
    identityType: "human",
    department: "DevOps",
    hopCount: 2,
    adminRole: "iam://cluster-admin-role",
    adminRoleLabel: "GKE Cluster Admin",
    effectivePermissions: ["*"],
    shadowPath: "mark.chen → GKE pod → node SA → cluster-admin-role",
    pivotResource: "gke://devops-cluster/pod",
    mechanism: "kubectl exec → Workload Identity → AssumeRole",
    cloudProvider: "GCP",
    firstSeen: "2026-07-28",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Cluster-admin via kubectl exec into a pod with elevated workload identity. Not visible in GCP Policy Analyzer.",
  },
  {
    identityId: "id-003",
    identityName: "priya.sharma",
    identityType: "human",
    department: "Data",
    hopCount: 1,
    adminRole: "iam://data-admin-role",
    adminRoleLabel: "GCP Data Admin",
    effectivePermissions: ["iam:*", "s3:*"],
    shadowPath: "priya.sharma → GCE:data-pipeline-vm → Workload Identity → data-admin-role",
    pivotResource: "GCE:data-pipeline-vm",
    mechanism: "gcloud compute ssh → Workload Identity Federation → AssumeRole",
    cloudProvider: "GCP",
    firstSeen: "2026-07-30",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "iam:* and s3:* — can modify any IAM policy and read any S3 object in the project. Not visible in GCP Policy Analyzer because the escalation path runs through a VM's attached workload identity, not a direct IAM binding.",
  },
  {
    identityId: "id-101",
    identityName: "svc-payments-api",
    identityType: "service",
    department: "Payments",
    hopCount: 1,
    adminRole: "iam://account-poweruser",
    adminRoleLabel: "Account PowerUser",
    effectivePermissions: ["iam:*", "ec2:*"],
    shadowPath: "svc-payments-api → EC2:i-0pay789 → account-poweruser",
    pivotResource: "ec2://i-0pay789",
    mechanism: "Instance profile → AssumeRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-29",
    nativeVisible: false,
    severity: "Unacceptable",
    riskNote: "Service identity reaches PowerUser through an attached instance profile hop.",
  },
  {
    identityId: "id-103",
    identityName: "svc-ci-runner",
    identityType: "service",
    department: "DevOps",
    hopCount: 2,
    adminRole: "azure://Owner",
    adminRoleLabel: "Azure Owner (rg-devops-prod)",
    effectivePermissions: ["*"],
    shadowPath: "svc-ci-runner → mi-ci-runner → Owner on rg-devops-prod",
    pivotResource: "azure://mi-ci-runner",
    mechanism: "User-assigned managed identity → Role assignment Owner",
    cloudProvider: "Azure",
    firstSeen: "2026-07-27",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "CI service principal reaches Subscription resource-group Owner via managed identity. Not fully visible in Azure PIM eligible-assignment views.",
  },
  {
    identityId: "id-008",
    identityName: "lena.okonkwo",
    identityType: "human",
    department: "Platform",
    hopCount: 2,
    adminRole: "azure://Owner",
    adminRoleLabel: "Azure Subscription Owner (via automation MI)",
    effectivePermissions: ["*"],
    shadowPath: "lena.okonkwo → automation-account → mi-platform-ops → Owner",
    pivotResource: "azure://automation-account",
    mechanism: "Automation Contributor → Runbook MI → Owner",
    cloudProvider: "Azure",
    firstSeen: "2026-07-30",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Platform engineer reaches subscription Owner through an automation runbook managed identity hop.",
  },
  {
    identityId: "id-011",
    identityName: "owen.blake",
    identityType: "human",
    department: "DevOps",
    hopCount: 2,
    adminRole: "iam://legacy-cluster-admin",
    adminRoleLabel: "Legacy GKE Cluster Admin",
    effectivePermissions: ["*"],
    shadowPath: "owen.blake → legacy-bastion → legacy-ops-cluster → cluster-admin",
    pivotResource: "gce://legacy-bastion",
    mechanism: "gcloud compute ssh → kubectl → Workload Identity",
    cloudProvider: "GCP",
    firstSeen: "2026-07-18",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Departed employee still reaches cluster-admin via lingering cloud principals after Okta deprovisioning.",
  },
  {
    identityId: "id-013",
    identityName: "chris.nguyen",
    identityType: "human",
    department: "SRE",
    hopCount: 2,
    adminRole: "iam://prod-breakglass-admin",
    adminRoleLabel: "Prod Break-glass Admin",
    effectivePermissions: ["*"],
    shadowPath: "chris.nguyen → EC2:i-0sre999 → prod-breakglass-admin",
    pivotResource: "ec2://i-0sre999",
    mechanism: "ssm:StartSession → Instance profile → sts:AssumeRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-29",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Break-glass SSM path effectively grants standing admin via instance profile assumption.",
  },
  {
    identityId: "id-108",
    identityName: "svc-ml-training",
    identityType: "service",
    department: "Data",
    hopCount: 1,
    adminRole: "iam://ml-project-editor",
    adminRoleLabel: "ML Project Editor",
    effectivePermissions: ["resourcemanager.projects.setIamPolicy", "iam.serviceAccounts.actAs"],
    shadowPath: "svc-ml-training → Vertex pipeline → ml-project-editor",
    pivotResource: "vertex://training-pipeline",
    mechanism: "Pipeline execution → SA impersonation",
    cloudProvider: "GCP",
    firstSeen: "2026-07-27",
    nativeVisible: false,
    severity: "Unacceptable",
    riskNote: "Training SA can set IAM policy via Vertex pipeline impersonation.",
  },
  {
    identityId: "id-109",
    identityName: "svc-terraform-apply",
    identityType: "service",
    department: "Platform",
    hopCount: 1,
    adminRole: "iam://org-wide-deploy",
    adminRoleLabel: "Org-wide Deploy",
    effectivePermissions: ["*"],
    shadowPath: "svc-terraform-apply → terraform-state-role → org-wide-deploy",
    pivotResource: "iam://terraform-state-role",
    mechanism: "sts:AssumeRole → iam:PassRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-31",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Terraform CI role chains into org-wide deploy with wildcard effective permissions.",
  },
  {
    identityId: "id-111",
    identityName: "svc-backup-agent",
    identityType: "service",
    department: "DevOps",
    hopCount: 2,
    adminRole: "iam://backup-admin-role",
    adminRoleLabel: "Backup Admin",
    effectivePermissions: ["s3:*", "kms:Decrypt"],
    shadowPath: "svc-backup-agent → EventBridge → Lambda → s3/org-backups-prod",
    pivotResource: "lambda://backup-runner",
    mechanism: "EventBridge → Lambda → s3:*",
    cloudProvider: "AWS",
    firstSeen: "2026-03-12",
    nativeVisible: false,
    severity: "Catastrophic",
    riskNote: "Orphaned backup agent still reaches full backup bucket access months after owner departure.",
  },
  {
    identityId: "id-112",
    identityName: "svc-github-actions",
    identityType: "service",
    department: "Platform",
    hopCount: 1,
    adminRole: "iam://deploy-prod-role",
    adminRoleLabel: "Deploy Prod",
    effectivePermissions: ["ecs:*", "iam:PassRole"],
    shadowPath: "svc-github-actions → deploy-prod-role → ecs/payments-prod",
    pivotResource: "iam://deploy-prod-role",
    mechanism: "OIDC AssumeRoleWithWebIdentity → PassRole",
    cloudProvider: "AWS",
    firstSeen: "2026-07-28",
    nativeVisible: false,
    severity: "Unacceptable",
    riskNote: "GitHub Actions OIDC role can PassRole into production ECS deploy paths.",
  },
];

// Summary stats derived
export const accessSummary = {
  direct: accessPaths.filter(p => p.accessType === "Direct").length,
  indirect: accessPaths.filter(p => p.accessType === "Indirect").length,
  shadow: accessPaths.filter(p => p.accessType === "Shadow").length,
  total: accessPaths.length,
};

/**
 * Legacy week-over-week average — Access Discovery no longer surfaces this.
 * Kept for any older demo screens that still reference a prior scan instant.
 * Risk Profile on the Discovery page uses level counts, not fused %.
 */
export const riskTrend = {
  priorAvgRisk: null,
  scannedAt: "2026-07-31T00:00:00Z",
  note: "No honest WoW trend without a prior graph snapshot",
};

// ─── Delegation Chains (built from per-app creationEdges — official forest) ───

export const delegationChains = buildDelegationChains(identities);

// ─── Identity Ownership (Accountability) ────────────────────────────────────

export const ownershipRecords = [
  { identityId: "id-001", grantId: "grant-001", resource: "s3://payments-prod", owner: "jane.doe", ownerStatus: "active", lastConfirmed: "2026-07-15", orphaned: false, app: "payments" },
  { identityId: "id-005", grantId: "grant-002", resource: "s3://finance-audit-logs", owner: null, ownerStatus: "departed", lastConfirmed: "2026-05-01", orphaned: true, rootCause: "alice.brooks (departed 2026-06-01)", app: "payments" },
  { identityId: "id-104", grantId: "grant-003", resource: "storage://raw-pii-data", owner: null, ownerStatus: "departed", lastConfirmed: "2026-05-10", orphaned: true, rootCause: "raj.patel (departed 2026-05-15)", app: "data-pipeline" },
  { identityId: "id-105", grantId: "grant-004", resource: "iam://payments-admin-role", owner: null, ownerStatus: "departed", lastConfirmed: "2026-04-20", orphaned: true, rootCause: "alice.brooks (departed 2026-06-01)", app: "payments" },
  { identityId: "id-114", grantId: "grant-007", resource: "s3://finance-reports", owner: null, ownerStatus: "departed", lastConfirmed: "2026-05-01", orphaned: true, rootCause: "alice.brooks (departed 2026-06-01)", app: "payments" },
  { identityId: "id-002", grantId: "grant-005", resource: "secrets://prod-api-keys", owner: "mark.chen", ownerStatus: "active", lastConfirmed: "2026-07-20", orphaned: false, app: "devops" },
  { identityId: "id-003", grantId: "grant-006", resource: "bigquery://analytics-prod", owner: "priya.sharma", ownerStatus: "active", lastConfirmed: "2026-07-18", orphaned: false, app: "data-pipeline" },
];

// ─── PTRACE / Threat Profile ─────────────────────────────────────────────────
// PTRACE: Probing → Trust Exploitation → Rights Escalation → Account Spoofing →
//         Concealment & Persistence → Exfiltration & Lateral Movement

const PTRACE_STAGE_META = {
  P: {
    label: "Probing",
    severity: "Medium",
    question: "Is the attacker mapping accounts, groups, or trust relationships before acting?",
  },
  T: {
    label: "Trust Exploitation",
    severity: "High",
    question: "Is a trust relationship being abused rather than a credential?",
  },
  R: {
    label: "Rights Escalation",
    severity: "Critical",
    question: "Can this identity get more than it started with?",
  },
  A: {
    label: "Account Spoofing / Assumption",
    severity: "Critical",
    question: "Can someone become this identity?",
  },
  C: {
    label: "Concealment & Persistence",
    severity: "High",
    question: "Can the attacker keep access without being noticed?",
  },
  E: {
    label: "Exfiltration & Lateral Movement",
    severity: "Critical",
    question: "What can this identity now reach, and what does it enable next?",
  },
};

export const mitreFindings = [
  // impact 1–5 (Negligible→Catastrophic) × likelihood 1–5 (Improbable→Frequent)
  // Spread across the matrix so every response band has real identity hits.
  { id: "mf-001", technique: "T1548.002", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation", ptraceCategory: "R", identityId: "id-001", identityName: "jane.doe", description: "SSM session to EC2 instance profile escalates to account-root-admin", severity: "Critical", impact: 5, likelihood: 5, triggeredAt: "2026-07-31T08:00:00Z" },
  { id: "mf-002", technique: "T1078", name: "Valid Accounts", tactic: "Initial Access", ptraceCategory: "R", identityId: "id-001", identityName: "jane.doe", description: "Okta AWS-PowerUsers group hits production IAM roles via simulate", severity: "Critical", impact: 5, likelihood: 5, triggeredAt: "2026-07-29T16:10:00Z" },
  { id: "mf-003", technique: "T1078", name: "Valid Accounts", tactic: "Initial Access", ptraceCategory: "A", identityId: "id-005", identityName: "alice.brooks", description: "Departed user still has live AWS credentials after Workday termination", severity: "Critical", impact: 5, likelihood: 4, triggeredAt: "2026-07-28T09:12:00Z" },
  { id: "mf-004", technique: "T1552.001", name: "Credentials in Files", tactic: "Credential Access", ptraceCategory: "R", identityId: "id-003", identityName: "priya.sharma", description: "Workload identity on data-pipeline-vm reaches data-admin with iam:*", severity: "Critical", impact: 5, likelihood: 4, triggeredAt: "2026-07-30T11:20:00Z" },
  { id: "mf-005", technique: "T1078.004", name: "Cloud Accounts", tactic: "Defense Evasion", ptraceCategory: "A", identityId: "id-006", identityName: "raj.patel", description: "Terminated engineer principal still authenticates to GCP after Okta deprovision", severity: "Critical", impact: 5, likelihood: 3, triggeredAt: "2026-07-22T14:40:00Z" },
  { id: "mf-006", technique: "T1530", name: "Data from Cloud Storage Object", tactic: "Collection", ptraceCategory: "E", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned ETL SA can read raw PII from GCS", severity: "Critical", impact: 5, likelihood: 3, triggeredAt: "2026-07-10T03:05:00Z" },
  { id: "mf-007", technique: "T1550.001", name: "Application Access Token", tactic: "Defense Evasion", ptraceCategory: "A", identityId: "id-105", identityName: "svc-old-payments-worker", description: "Stale Lambda execution role still decrypts payments secrets", severity: "Critical", impact: 5, likelihood: 2, triggeredAt: "2026-07-18T07:40:00Z" },
  { id: "mf-008", technique: "T1078.004", name: "Cloud Accounts", tactic: "Initial Access", ptraceCategory: "A", identityId: "id-011", identityName: "owen.blake", description: "Departed admin IAM user unused but not disabled — break-glass risk", severity: "High", impact: 5, likelihood: 1, triggeredAt: "2026-07-12T19:00:00Z" },

  { id: "mf-009", technique: "T1098", name: "Account Manipulation", tactic: "Persistence", ptraceCategory: "C", identityId: "id-002", identityName: "mark.chen", description: "kubectl exec into GKE pod can create lasting cluster bindings", severity: "Critical", impact: 4, likelihood: 5, triggeredAt: "2026-07-28T16:00:00Z" },
  { id: "mf-010", technique: "T1078.004", name: "Cloud Accounts", tactic: "Defense Evasion", ptraceCategory: "C", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned service account with no owner creates repudiation risk", severity: "Critical", impact: 4, likelihood: 4, triggeredAt: "2026-07-10T03:00:00Z" },
  { id: "mf-011", technique: "T1548", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation", ptraceCategory: "R", identityId: "id-003", identityName: "priya.sharma", description: "GCE OS Login path binds to data-admin role", severity: "High", impact: 4, likelihood: 3, triggeredAt: "2026-07-30T11:21:00Z" },
  { id: "mf-012", technique: "T1134", name: "Access Token Manipulation", tactic: "Privilege Escalation", ptraceCategory: "R", identityId: "id-101", identityName: "svc-payments-api", description: "API role can passRole into broader payments admin role", severity: "High", impact: 4, likelihood: 3, triggeredAt: "2026-07-27T08:15:00Z" },
  { id: "mf-013", technique: "T1098.001", name: "Additional Cloud Credentials", tactic: "Persistence", ptraceCategory: "C", identityId: "id-002", identityName: "mark.chen", description: "Workload identity can mint long-lived GCP keys", severity: "High", impact: 4, likelihood: 2, triggeredAt: "2026-07-26T12:00:00Z" },
  { id: "mf-014", technique: "T1484", name: "Domain or Tenant Policy Modification", tactic: "Defense Evasion", ptraceCategory: "C", identityId: "id-001", identityName: "jane.doe", description: "Conditional access bypass path via privileged Okta group", severity: "High", impact: 4, likelihood: 1, triggeredAt: "2026-07-15T10:30:00Z" },

  { id: "mf-015", technique: "T1550", name: "Use Alternate Authentication Material", tactic: "Defense Evasion", ptraceCategory: "T", identityId: "id-005", identityName: "alice.brooks", description: "Stale Azure token used against finance Key Vault after HR termination", severity: "High", impact: 3, likelihood: 5, triggeredAt: "2026-07-25T09:00:00Z" },
  { id: "mf-016", technique: "T1199", name: "Trusted Relationship", tactic: "Initial Access", ptraceCategory: "T", identityId: "id-004", identityName: "tom.walker", description: "Cross-account trust used for lateral audit-role assumption", severity: "High", impact: 3, likelihood: 4, triggeredAt: "2026-07-21T15:45:00Z" },
  { id: "mf-017", technique: "T1496", name: "Resource Hijacking", tactic: "Impact", ptraceCategory: "E", identityId: "id-004", identityName: "tom.walker", description: "Burst of KMS Decrypt calls outside normal review hours", severity: "Medium", impact: 3, likelihood: 3, triggeredAt: "2026-07-24T02:15:00Z" },
  { id: "mf-018", technique: "T1537", name: "Transfer Data to Cloud Account", tactic: "Exfiltration", ptraceCategory: "E", identityId: "id-107", identityName: "svc-billing-sync", description: "Billing sync can copy finance tables to an external project", severity: "Medium", impact: 3, likelihood: 2, triggeredAt: "2026-07-20T14:20:00Z" },
  { id: "mf-019", technique: "T1485", name: "Data Destruction", tactic: "Impact", ptraceCategory: "E", identityId: "id-114", identityName: "svc-finance-reporter", description: "Reporter role retains delete on finance-reports bucket", severity: "Medium", impact: 3, likelihood: 1, triggeredAt: "2026-07-14T11:05:00Z" },

  { id: "mf-020", technique: "T1087", name: "Account Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-002", identityName: "mark.chen", description: "Repeated IAM enumeration from devops workstation against prod accounts", severity: "Medium", impact: 2, likelihood: 5, triggeredAt: "2026-07-27T11:00:00Z" },
  { id: "mf-021", technique: "T1087.004", name: "Cloud Account Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-007", identityName: "sara.jones", description: "ListUsers/ListRoles bursts from new joiner outside assigned OU", severity: "Medium", impact: 2, likelihood: 4, triggeredAt: "2026-07-26T13:35:00Z" },
  { id: "mf-022", technique: "T1526", name: "Cloud Service Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-007", identityName: "sara.jones", description: "Unusual ListBuckets volume from new joiner outside assigned OU", severity: "Medium", impact: 2, likelihood: 3, triggeredAt: "2026-07-26T13:30:00Z" },
  { id: "mf-023", technique: "T1199", name: "Trusted Relationship", tactic: "Initial Access", ptraceCategory: "T", identityId: "id-004", identityName: "tom.walker", description: "Denied AssumeRole probes against security audit role", severity: "Low", impact: 2, likelihood: 2, triggeredAt: "2026-07-21T15:50:00Z" },
  { id: "mf-024", technique: "T1078.004", name: "Cloud Accounts", tactic: "Initial Access", ptraceCategory: "T", identityId: "id-008", identityName: "lena.okonkwo", description: "Contractor federation used once outside approved window", severity: "Low", impact: 2, likelihood: 1, triggeredAt: "2026-07-11T09:20:00Z" },

  { id: "mf-025", technique: "T1082", name: "System Information Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-007", identityName: "sara.jones", description: "Low-volume metadata probing on payments-logs bucket", severity: "Low", impact: 1, likelihood: 5, triggeredAt: "2026-07-23T10:00:00Z" },
  { id: "mf-026", technique: "T1580", name: "Cloud Infrastructure Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-009", identityName: "diego.ramos", description: "DescribeInstances noise from staging identity against prod account", severity: "Low", impact: 1, likelihood: 4, triggeredAt: "2026-07-22T16:40:00Z" },
  { id: "mf-027", technique: "T1619", name: "Cloud Storage Object Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-010", identityName: "mei.lin", description: "HeadObject probes on org-backups-prod without follow-on reads", severity: "Low", impact: 1, likelihood: 3, triggeredAt: "2026-07-19T08:55:00Z" },
  { id: "mf-028", technique: "T1082", name: "System Information Discovery", tactic: "Discovery", ptraceCategory: "P", identityId: "id-008", identityName: "lena.okonkwo", description: "IMDS metadata checks from contractor workstation", severity: "Low", impact: 1, likelihood: 2, triggeredAt: "2026-07-17T13:10:00Z" },
  { id: "mf-029", technique: "T1592", name: "Gather Victim Host Information", tactic: "Reconnaissance", ptraceCategory: "P", identityId: "id-009", identityName: "diego.ramos", description: "One-off GetCallerIdentity outside change window", severity: "Low", impact: 1, likelihood: 1, triggeredAt: "2026-07-09T18:00:00Z" },
  { id: "mf-030", technique: "T1552.005", name: "Cloud Instance Metadata API", tactic: "Credential Access", ptraceCategory: "R", identityId: "id-103", identityName: "svc-ci-runner", description: "CI runner role can read instance metadata beyond build scope", severity: "High", impact: 4, likelihood: 4, triggeredAt: "2026-07-28T06:30:00Z" },
  { id: "mf-031", technique: "T1078.004", name: "Cloud Accounts", tactic: "Persistence", ptraceCategory: "C", identityId: "id-105", identityName: "svc-old-payments-worker", description: "Orphaned worker retains console-less persistence via scheduled invoke", severity: "High", impact: 3, likelihood: 4, triggeredAt: "2026-07-16T04:00:00Z" },
  { id: "mf-032", technique: "T1486", name: "Data Encrypted for Impact", tactic: "Impact", ptraceCategory: "E", identityId: "id-101", identityName: "svc-payments-api", description: "Payments API can disable KMS key grants used by sibling services", severity: "Critical", impact: 5, likelihood: 2, triggeredAt: "2026-07-29T21:10:00Z" },
];

// Back-compat aliases + keep names on the canonical roster
mitreFindings.forEach(f => {
  f.traceCategory = f.ptraceCategory;
  f.strideCategory = f.ptraceCategory;
  const identity = identities.find(i => i.id === f.identityId);
  if (identity) f.identityName = identity.name;
});

/** PTRACE stage counts derived from MITRE findings (not hardcoded). */
export const ptraceFindingCounts = Object.fromEntries(
  Object.entries(PTRACE_STAGE_META).map(([key, meta]) => [
    key,
    {
      ...meta,
      count: mitreFindings.filter(f => f.ptraceCategory === key).length,
    },
  ]),
);

/** @deprecated use ptraceFindingCounts */
export const traceFindingCounts = ptraceFindingCounts;
/** @deprecated use ptraceFindingCounts */
export const strideFindingCounts = ptraceFindingCounts;

// Risk profiles + identity incidents: built by riskProfileApi.js (API-shaped).
// Legacy sync accessors re-exported below after Access Reviews / dashboard blocks.

// Access Reviews inventory/campaigns: see accessReviewApi.js (built live from identities + paths).
shadowAdmins.forEach(s => {
  const identity = identities.find(i => i.id === s.identityId);
  if (identity) s.identityName = identity.name;
});

// ─── JML / Lifecycle Events ──────────────────────────────────────────────────

const jmlEventSeed = [
  { id: "jml-001", eventType: "leaver", identityId: "id-005", triggeredAt: "2026-06-01", deprovisionedAt: null, app: "payments" },
  { id: "jml-002", eventType: "leaver", identityId: "id-006", triggeredAt: "2026-05-15", deprovisionedAt: null, app: "data-pipeline" },
  { id: "jml-003", eventType: "leaver", identityId: "id-011", triggeredAt: "2026-04-30", deprovisionedAt: "2026-04-30T18:00:00Z", app: "devops" },
  { id: "jml-004", eventType: "leaver", identityId: "id-014", triggeredAt: "2026-02-28", deprovisionedAt: "2026-03-01T12:00:00Z", app: "payments" },
  { id: "jml-005", eventType: "leaver", identityId: "id-020", triggeredAt: "2026-03-15", deprovisionedAt: null, app: "payments" },
  { id: "jml-006", eventType: "leaver", identityId: "id-021", triggeredAt: "2026-01-20", deprovisionedAt: null, app: "devops" },
  { id: "jml-007", eventType: "leaver", identityId: "id-022", triggeredAt: "2026-07-01", deprovisionedAt: "2026-07-01T17:00:00Z", app: "data-pipeline" },
];

function livePathCount(identityId) {
  return accessPaths.filter(p => p.identityId === identityId && !p.blocked).length;
}

/** NHIs created by a leaver — used to check whether their workload identities were offboarded. */
export function nhisCreatedBy(identityId) {
  return identities.filter(i => i.type === "service" && i.createdBy === identityId);
}

/** NHIs created by or still owned by a human (matches lifecycle / exposure attachment). */
export function nhisAttachedTo(identityId) {
  return identities.filter(i => (
    i.type === "service"
    && (i.owner === identityId || i.createdBy === identityId)
  ));
}

export function offboardStatusForNhi(nhi) {
  const paths = livePathCount(nhi.id);
  if (paths === 0 && (nhi.status === "disabled" || nhi.status === "deprovisioned")) return "success";
  if (paths === 0) return "success";
  if (nhi.status === "orphaned" || !nhi.owner) return "failed";
  return "partial";
}

/** Derive leaver campaign status from residual human + NHI access. */
export function deriveLeaverStatus(identityId, linkedNhis = nhisAttachedTo(identityId)) {
  const humanLive = livePathCount(identityId) > 0;
  const openNhis = linkedNhis.filter(n => offboardStatusForNhi(n) !== "success").length;
  const closedNhis = linkedNhis.length - openNhis;
  if (!humanLive && openNhis === 0) return "success";
  if (openNhis > 0 && closedNhis > 0) return "partial";
  if (!humanLive && openNhis > 0) return "partial";
  if (humanLive && closedNhis > 0) return "partial";
  return "failed";
}

export const jmlEvents = jmlEventSeed.map(event => {
  const identity = identities.find(i => i.id === event.identityId);
  const linkedNhis = nhisAttachedTo(event.identityId);
  const status = deriveLeaverStatus(event.identityId, linkedNhis);
  return {
    ...event,
    status,
    identityName: identity?.name || event.identityId,
    liveAccess: livePathCount(event.identityId),
    app: (identity?.apps && identity.apps[0]) || event.app,
    linkedNhis: linkedNhis.map(nhi => ({
      id: nhi.id,
      name: nhi.name,
      status: nhi.status,
      owner: nhi.owner,
      createdBy: nhi.createdBy,
      app: (nhi.apps && nhi.apps[0]) || event.app,
      liveAccess: livePathCount(nhi.id),
      offboardStatus: offboardStatusForNhi(nhi),
    })),
    orphanedAccounts: linkedNhis
      .filter(nhi => nhi.status === "orphaned" || offboardStatusForNhi(nhi) !== "success")
      .map(nhi => nhi.name),
  };
});

export const orphanedAccounts = identities.filter(id => id.status === "orphaned");

// ─── Unified Impact Analysis — Graph Data ────────────────────────────────────

export const impactGraph = {
  nodes: [
    { id: "jane.doe", label: "jane.doe", type: "human", riskScore: 100, group: "origin" },
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
  shadowAdminCount: shadowAdmins.length,
  criticalFindings: identities.filter(i => (i.riskScore || 0) >= 80).length,
  orphanedAccountability: ownershipRecords.filter(o => o.orphaned).length,
  activeReviewCampaigns: 2,
  reviewCompletionPct: 65,
  topRiskIdentity: identities
    .slice()
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
    .map(i => ({
      identityId: i.id,
      name: i.name,
      type: i.type,
      score: i.riskScore || 0,
      band: (i.riskScore || 0) >= 80 ? "Catastrophic"
        : (i.riskScore || 0) >= 60 ? "Unacceptable"
          : (i.riskScore || 0) >= 40 ? "Undesirable"
            : (i.riskScore || 0) >= 20 ? "Acceptable" : "Desirable",
    }))[0],
  overallRiskBand: "Unacceptable",
};
