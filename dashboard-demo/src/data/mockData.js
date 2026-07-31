// ITAG Mock Data Layer
// Ingested from live-style API payloads: AWS, GCP, Azure, Google Workspace, Okta, Workday HR
// UI-facing fields stay stable; `api` / `sources` hold provider-native shapes.

export const tenant = {
  name: "Unosecur Demo Tenant",
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
    mfaEnabled: true, credentialAge: 45, owner: "id-001", ownerName: "Jane Doe", riskScore: 72, apps: ["payments", "devops"],
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
    status: "active", createdBy: "id-sys-001", createdAt: "2021-11-01", lastActive: "2026-07-31",
    mfaEnabled: true, credentialAge: 8, owner: "id-004", ownerName: "Tom Walker", riskScore: 22, apps: ["devops", "payments"],
    sources: {
      okta: { id: "00u4tomw6alker0kt", status: "ACTIVE", login: "tom.walker@acme.com", groups: ["Security", "AWS-Security-Audit", "Access-Reviewers"], mfaTypes: ["webauthn", "okta_verify"] },
      googleWorkspace: { id: "112233445566778899001", primaryEmail: "tom.walker@acme.com", orgUnitPath: "/Security", isAdmin: true, isEnrolledIn2Sv: true },
      hr: { employeeId: "WD-08712", workerType: "Employee", employmentStatus: "Active", hireDate: "2021-11-01", managerEmployeeId: "WD-10001", costCenter: "SEC-010" },
      aws: { principalArn: "arn:aws:iam::481516234210:user/tom.walker", federatedVia: "arn:aws:iam::481516234210:saml-provider/Okta" },
    },
  },
  {
    id: "id-005", name: "alice.brooks", type: "human", email: "alice.brooks@acme.com", department: "Finance",
    status: "departed", createdBy: "id-sys-001", createdAt: "2020-03-10", lastActive: "2026-06-01",
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
    status: "departed", createdBy: "id-sys-001", createdAt: "2021-09-01", lastActive: "2026-05-15",
    mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, riskScore: 88, apps: ["data-pipeline", "devops"],
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

  // Service / workload identities from cloud IAM APIs
  {
    id: "id-101", name: "svc-payments-api", type: "service", email: null, department: "Payments",
    status: "active", createdBy: "id-001", createdAt: "2023-02-01", lastActive: "2026-07-31",
    mfaEnabled: false, credentialAge: 320, owner: "id-001", ownerName: "Jane Doe", riskScore: 67, apps: ["payments"],
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
    mfaEnabled: false, credentialAge: 45, owner: "id-002", ownerName: "Mark Chen", riskScore: 41, apps: ["devops"],
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
    mfaEnabled: false, credentialAge: 380, owner: null, ownerName: null, riskScore: 91, apps: ["data-pipeline"],
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
    mfaEnabled: false, credentialAge: 460, owner: null, ownerName: null, riskScore: 97, apps: ["payments"],
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
    mfaEnabled: false, credentialAge: 90, owner: "id-002", ownerName: "Mark Chen", riskScore: 29, apps: ["devops"],
    sources: {
      aws: { roleArn: "arn:aws:iam::481516234210:role/svc-monitoring", path: "/service-roles/" },
      gcp: { email: "svc-monitoring@acme-prod-4821.iam.gserviceaccount.com", uniqueId: "555666777888999000111" },
    },
  },
  {
    id: "id-107", name: "svc-billing-sync", type: "service", email: null, department: "Finance",
    status: "active", createdBy: "id-001", createdAt: "2023-06-01", lastActive: "2026-07-28",
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
];

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

  // Shadow Access — multi-hop, invisible to native analyzers
  {
    id: "ap-009", identityId: "id-001", identityName: "jane.doe",
    resource: "iam://account-root-admin", resourceSensitivity: "critical", accessType: "Shadow", hopCount: 2,
    effectivePermissions: ["*"], mechanism: "ssm:StartSession → EC2:i-0abc123 → AssumeRole:AdminRole",
    lastConfirmed: "2026-07-31", cloudProvider: "AWS", blocked: false, shadowAdmin: true,
    adminRole: "iam://account-root-admin",
    hopChain: [
      { step: 1, from: "jane.doe", to: "ec2://i-0abc123 (payments-prod-worker)", mechanism: "ssm:StartSession", timestamp: "2026-07-31T08:00:00Z", api: "ssm:StartSession", resourceArn: "arn:aws:ec2:us-east-1:481516234210:instance/i-0abc123def456" },
      { step: 2, from: "ec2://i-0abc123", to: "iam://AdminInstanceProfile", mechanism: "EC2 Instance Profile → AssumeRole", timestamp: "2026-07-31T08:00:01Z", api: "ec2:DescribeIamInstanceProfileAssociations", resourceArn: "arn:aws:iam::481516234210:instance-profile/AdminInstanceProfile" },
      { step: 3, from: "iam://AdminInstanceProfile", to: "iam://account-root-admin", mechanism: "iam:PassRole", timestamp: "2026-07-31T08:00:02Z", api: "iam:PassRole", resourceArn: "arn:aws:iam::481516234210:role/account-root-admin" },
    ],
    api: {
      source: "aws.ssm + ec2 + iam",
      nativeVisible: false,
      nativeToolsMissed: ["IAM Access Analyzer", "IAM Policy Simulator (direct only)"],
      terminalRoleArn: "arn:aws:iam::481516234210:role/account-root-admin",
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
    id: "ap-012", identityId: "id-005", identityName: "alice.brooks (departed)",
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
];

// ─── Shadow Access derived views ─────────────────────────────────────────────

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
    nativlyVisible: false,
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
    nativlyVisible: false,
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
    nativlyVisible: false,
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
    nativlyVisible: false,
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
    nativlyVisible: false,
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
    nativlyVisible: false,
    severity: "Catastrophic",
    riskNote: "CI service principal reaches Subscription resource-group Owner via managed identity. Not fully visible in Azure PIM eligible-assignment views.",
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
  S: { label: "Spoofing", count: 3, severity: "High" },
  T: { label: "Tampering", count: 1, severity: "Low" },
  R: { label: "Repudiation", count: 3, severity: "Critical" },
  I: { label: "Information disclosure", count: 4, severity: "Critical" },
  D: { label: "Denial of service", count: 1, severity: "Medium" },
  E: { label: "Elevation of privilege", count: 5, severity: "Critical" },
};

export const mitreFindings = [
  { id: "mf-001", technique: "T1078", name: "Valid Accounts", tactic: "Initial Access", strideCategory: "S", identityId: "id-005", identityName: "alice.brooks", description: "Departed user still has live AWS credentials after Workday termination", severity: "Critical", triggeredAt: "2026-07-28T09:12:00Z" },
  { id: "mf-002", technique: "T1548.002", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation", strideCategory: "E", identityId: "id-001", identityName: "jane.doe", description: "SSM session to EC2 instance profile escalates to account-root-admin", severity: "Critical", triggeredAt: "2026-07-31T08:00:00Z" },
  { id: "mf-003", technique: "T1078.004", name: "Cloud Accounts", tactic: "Defense Evasion", strideCategory: "R", identityId: "id-006", identityName: "raj.patel", description: "Terminated engineer principal still authenticates to GCP after Okta deprovision", severity: "Critical", triggeredAt: "2026-07-22T14:40:00Z" },
  { id: "mf-004", technique: "T1078.004", name: "Cloud Accounts", tactic: "Defense Evasion", strideCategory: "R", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned service account with no owner creates repudiation risk", severity: "Critical", triggeredAt: "2026-07-10T03:00:00Z" },
  { id: "mf-005", technique: "T1552.001", name: "Credentials in Files", tactic: "Credential Access", strideCategory: "I", identityId: "id-003", identityName: "priya.sharma", description: "Workload identity on data-pipeline-vm reaches data-admin with iam:*", severity: "Critical", triggeredAt: "2026-07-30T11:20:00Z" },
  { id: "mf-006", technique: "T1530", name: "Data from Cloud Storage Object", tactic: "Collection", strideCategory: "I", identityId: "id-104", identityName: "svc-orphaned-etl", description: "Orphaned ETL SA can read raw PII from GCS", severity: "Critical", triggeredAt: "2026-07-10T03:05:00Z" },
  { id: "mf-007", technique: "T1548", name: "Abuse Elevation Control Mechanism", tactic: "Privilege Escalation", strideCategory: "E", identityId: "id-003", identityName: "priya.sharma", description: "GCE OS Login path binds to data-admin role", severity: "High", triggeredAt: "2026-07-30T11:21:00Z" },
  { id: "mf-008", technique: "T1078", name: "Valid Accounts", tactic: "Initial Access", strideCategory: "S", identityId: "id-001", identityName: "jane.doe", description: "Okta group AWS-PowerUsers grants broad IAM simulate hits on production roles", severity: "High", triggeredAt: "2026-07-29T16:10:00Z" },
  { id: "mf-009", technique: "T1098", name: "Account Manipulation", tactic: "Persistence", strideCategory: "E", identityId: "id-002", identityName: "mark.chen", description: "kubectl exec into GKE pod assumes cluster-admin via workload identity", severity: "High", triggeredAt: "2026-07-28T16:00:00Z" },
  { id: "mf-010", technique: "T1550", name: "Use Alternate Authentication Material", tactic: "Defense Evasion", strideCategory: "S", identityId: "id-005", identityName: "alice.brooks", description: "Stale Azure token used against finance Key Vault after HR termination", severity: "High", triggeredAt: "2026-07-25T09:00:00Z" },
  { id: "mf-011", technique: "T1087", name: "Account Discovery", tactic: "Discovery", strideCategory: "I", identityId: "id-002", identityName: "mark.chen", description: "Repeated IAM enumeration from devops workstation against prod accounts", severity: "Medium", triggeredAt: "2026-07-27T11:00:00Z" },
  { id: "mf-012", technique: "T1526", name: "Cloud Service Discovery", tactic: "Discovery", strideCategory: "I", identityId: "id-007", identityName: "sara.jones", description: "Unusual ListBuckets volume from new joiner outside assigned OU", severity: "Medium", triggeredAt: "2026-07-26T13:30:00Z" },
  { id: "mf-013", technique: "T1496", name: "Resource Hijacking", tactic: "Impact", strideCategory: "D", identityId: "id-004", identityName: "tom.walker", description: "Burst of KMS Decrypt calls outside normal review hours", severity: "Medium", triggeredAt: "2026-07-24T02:15:00Z" },
  { id: "mf-014", technique: "T1082", name: "System Information Discovery", tactic: "Discovery", strideCategory: "T", identityId: "id-007", identityName: "sara.jones", description: "Low-volume metadata probing on payments-logs bucket", severity: "Low", triggeredAt: "2026-07-23T10:00:00Z" },
  { id: "mf-015", technique: "T1199", name: "Trusted Relationship", tactic: "Initial Access", strideCategory: "S", identityId: "id-004", identityName: "tom.walker", description: "Cross-account AssumeRole denied attempts from security audit role", severity: "Low", triggeredAt: "2026-07-21T15:45:00Z" },
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
  shadowAdminCount: 6,
  criticalFindings: riskProfiles.filter(r => r.band === "Catastrophic").length,
  orphanedAccountability: ownershipRecords.filter(o => o.orphaned).length,
  activeReviewCampaigns: reviewCampaigns.filter(c => c.status === "in_progress").length,
  reviewCompletionPct: reviewCampaigns[0].completionPct,
  topRiskIdentity: riskProfiles.sort((a, b) => b.score - a.score)[0],
  overallRiskBand: "Unacceptable",
};
