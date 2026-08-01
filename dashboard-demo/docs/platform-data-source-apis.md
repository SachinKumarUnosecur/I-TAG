# Platform data sources — read-only APIs & permissions

Use this when someone asks: **“How are you getting this data?”** or **“Which permissions do you need?”**

**Scope of this doc:** only **read-only** APIs / permissions the connector needs for discovery.  
We do **not** require invoke, assume-role, pass-role, exec, or other mutating/session APIs to collect inventory. Shadow / multi-hop paths are inferred from **configuration** (trust policies, instance profiles, role assignments, IAM bindings), not by executing those actions.

The demo uses mock payloads shaped like live connector responses (`dataSources`, `identities[].sources`, `accessPaths[].api`).

---

## 1. Connected systems (short answer)

| System | Role | What we get (via read-only APIs) |
|--------|------|----------------------------------|
| **AWS** | Cloud IAM + resources | Users/roles/policies, effective access simulation, NHI attachments (instance profiles, Lambda config) |
| **GCP** | Cloud IAM + resources | Service accounts, IAM bindings, GKE/GCE/BigQuery/GCS policy, attachment metadata |
| **Azure** | Cloud IAM + resources | Role assignments, service principals, managed identities, Key Vault / Storage inventory |
| **Okta** | IdP | Humans, groups, MFA, app assignments, deprovision status |
| **Google Workspace** | IdP (optional) | Directory users/groups, admin roles, activity reports |
| **Workday** | HR | Employment status, hire/term dates, manager, cost center |

**One-liner for demos:**  
*Connectors are read-only. We correlate IdP + HR with cloud IAM config and policy evaluation — we never need write or session access to production workloads.*

---

## 2. Product surface → read-only APIs

| Product surface | Data we show | Primary read-only APIs |
|-----------------|--------------|------------------------|
| **Identity inventory** | Name, type, status, owner, MFA | Okta `GET` users/groups/factors · Workday workers · AWS IAM List/Get · GCP `iam.serviceAccounts.list` · Azure Graph users + servicePrincipals (read) |
| **Access Discovery** | Resource, sensitivity, effective access | AWS `iam:SimulatePrincipalPolicy` · GCP `cloudasset.analyzeIamPolicy` / `*.getIamPolicy` · Azure `roleAssignments/read` + `roleDefinitions/read` |
| **Exposure / Resource map** | What HI can access; NHI attachments + reach | Same evaluation APIs + describe/get for attachments (EC2 instance profiles, Lambda config, Managed Identity read) |
| **Delegation / lineage** | Who created whom | IAM/IdP create metadata (read) + connector `integratedAt` |
| **Orphaned / departed** | Live cloud principal after offboard | Workday + Okta status (read) + still-present cloud principals (list/get) |
| **Threat / MITRE findings** | Technique ↔ identity ↔ resource | Derived from access graph (same read connectors) |
| **Access reviews** | Campaign items | Same correlated graph |

---

## 3. AWS — read-only APIs

### Identity & policy

| API | Gives us |
|-----|----------|
| `sts:GetCallerIdentity` | Account context for the connector |
| `organizations:ListAccounts` | Multi-account scope |
| `iam:ListUsers` / `iam:GetUser` | Human IAM users |
| `iam:ListRoles` / `iam:GetRole` | NHI roles, trust policy, path |
| `iam:ListAttachedUserPolicies` / `iam:ListAttachedRolePolicies` | Attached managed policies |
| `iam:ListAttachedGroupPolicies` | Group-attached policies |
| `iam:GetPolicy` / `iam:GetPolicyVersion` | Policy document |
| `iam:ListGroupsForUser` / `iam:GetGroup` | Indirect access via groups |
| `iam:ListInstanceProfilesForRole` / `iam:GetInstanceProfile` | Instance profile ↔ role |
| `iam:SimulatePrincipalPolicy` | Effective permissions (read-only evaluation) |
| `iam:GetAccountAuthorizationDetails` *(optional)* | Bulk IAM export |

### Attachments (NHI “where attached”)

| API | Gives us |
|-----|----------|
| `ec2:DescribeInstances` | Compute targets |
| `ec2:DescribeIamInstanceProfileAssociations` | Role ↔ EC2 instance profile attachment |
| `lambda:GetFunction` / `lambda:ListFunctions` | Execution role attachment |
| `ecs:DescribeServices` / `ecs:DescribeTaskDefinition` *(optional)* | Task role attachment |

### Resource policy / metadata (read)

| API | Gives us |
|-----|----------|
| `s3:GetBucketPolicy` / `s3:GetBucketAcl` / `s3:ListAllMyBuckets` | S3 reachability context |
| `secretsmanager:GetResourcePolicy` / `secretsmanager:ListSecrets` | Secrets access context |
| `dynamodb:DescribeTable` / `dynamodb:ListTables` | Table resource context |
| `kms:DescribeKey` / `kms:ListKeys` / `kms:GetKeyPolicy` | KMS policy context |
| `ssm:DescribeSessions` / `ssm:DescribeInstanceInformation` | Session / managed-instance context *(describe only)* |
| `ecr:DescribeRepositories` | Registry inventory |
| `rds:DescribeDBInstances` | DB inventory |
| `cloudwatch:DescribeAlarms` *(optional)* | Alarm inventory |

### Connector allow-list (read-only)

```
sts:GetCallerIdentity
organizations:ListAccounts
iam:ListUsers
iam:GetUser
iam:ListRoles
iam:GetRole
iam:GetPolicy
iam:GetPolicyVersion
iam:ListAttachedUserPolicies
iam:ListAttachedRolePolicies
iam:ListAttachedGroupPolicies
iam:ListGroupsForUser
iam:GetGroup
iam:GetInstanceProfile
iam:ListInstanceProfilesForRole
iam:SimulatePrincipalPolicy
ec2:DescribeInstances
ec2:DescribeIamInstanceProfileAssociations
lambda:GetFunction
lambda:ListFunctions
s3:ListAllMyBuckets
s3:GetBucketPolicy
secretsmanager:ListSecrets
secretsmanager:GetResourcePolicy
dynamodb:ListTables
dynamodb:DescribeTable
kms:ListKeys
kms:DescribeKey
kms:GetKeyPolicy
ssm:DescribeSessions
ssm:DescribeInstanceInformation
```

**Managed policy shortcut:** AWS managed `SecurityAudit` + `ViewOnlyAccess` (or equivalent custom read-only) covering the list above.

**Not required (do not request):** `sts:AssumeRole`, `iam:PassRole`, `ssm:StartSession`, `lambda:InvokeFunction`, `ecs:UpdateService`, `events:PutEvents`, or any `*Write*` / `*Delete*` / `*Create*`.

---

## 4. GCP — read-only APIs

### Identity & IAM

| API | Gives us |
|-----|----------|
| `iam.serviceAccounts.list` / `iam.serviceAccounts.get` | NHI service accounts |
| `iam.roles.get` / `iam.roles.list` | Custom/predefined roles |
| `cloudresourcemanager.projects.getIamPolicy` | Project-level bindings |
| `cloudresourcemanager.organizations.getIamPolicy` *(optional)* | Org bindings |
| `cloudasset.analyzeIamPolicy` | Who can access what (read analysis) |
| `cloudasset.searchAllIamPolicies` / `searchAllResources` *(optional)* | Estate-wide policy/resource search |

### Resource IAM (getIamPolicy only)

| API | Gives us |
|-----|----------|
| `bigquery.datasets.get` / `bigquery.datasets.getIamPolicy` | Dataset access |
| `storage.buckets.list` / `storage.buckets.getIamPolicy` | GCS bucket access |
| `pubsub.topics.getIamPolicy` / `pubsub.subscriptions.getIamPolicy` *(optional)* | Pub/Sub access |

### Attachments & inventory (read)

| API | Gives us |
|-----|----------|
| `compute.instances.get` / `compute.instances.list` | GCE + SA / metadata |
| `container.clusters.get` / `container.clusters.list` | GKE cluster identity |
| `cloudfunctions.functions.get` / `cloudfunctions.functions.list` | Function SA binding |
| `aiplatform.pipelineJobs.get` / `list` *(optional, read)* | Pipeline SA binding metadata |

### Connector allow-list (read-only)

```
iam.serviceAccounts.list
iam.serviceAccounts.get
iam.roles.get
iam.roles.list
cloudresourcemanager.projects.getIamPolicy
cloudasset.analyzeIamPolicy
compute.instances.list
compute.instances.get
container.clusters.list
container.clusters.get
bigquery.datasets.get
bigquery.datasets.getIamPolicy
storage.buckets.list
storage.buckets.getIamPolicy
```

**Role shortcut:** `roles/viewer` + `roles/iam.securityReviewer` (and/or Cloud Asset Viewer) on scoped projects/org.

**Not required:** `iamcredentials.generateAccessToken`, `container.pods.exec`, `cloudfunctions.functions.call`, `aiplatform.pipelineJobs.create`, `setIamPolicy`, or any mutating method.

---

## 5. Azure — read-only APIs

### Identity & RBAC

| API | Gives us |
|-----|----------|
| Microsoft Graph `User.Read.All` (application) | Entra users |
| Microsoft Graph `Application.Read.All` / `ServicePrincipal.Read.All` | Apps / NHI principals |
| `Microsoft.Authorization/roleAssignments/read` | Who has which role on which scope |
| `Microsoft.Authorization/roleDefinitions/read` | Role → actions / dataActions |

### Attachments & resources

| API | Gives us |
|-----|----------|
| `Microsoft.ManagedIdentity/userAssignedIdentities/read` | Managed identity inventory |
| `Microsoft.Automation/automationAccounts/read` | Automation account + identity linkage |
| `Microsoft.KeyVault/vaults/read` | Key Vault inventory |
| `Microsoft.Storage/storageAccounts/read` | Storage account inventory |
| `Microsoft.Resources/subscriptions/resourceGroups/read` *(optional)* | RG inventory |
| `Microsoft.Compute/virtualMachines/read` *(optional)* | VM ↔ identity linkage |

### Connector allow-list (read-only)

```
Microsoft.Authorization/roleAssignments/read
Microsoft.Authorization/roleDefinitions/read
Microsoft.ManagedIdentity/userAssignedIdentities/read
Microsoft.Automation/automationAccounts/read
Microsoft.KeyVault/vaults/read
Microsoft.Storage/storageAccounts/read
Microsoft Graph: User.Read.All
Microsoft Graph: Application.Read.All
Microsoft Graph: ServicePrincipal.Read.All
```

**Role shortcut:** `Reader` + `Role Based Access Control Administrator` is **not** needed — use **Reader** and ensure role assignment read (e.g. subscription Reader is enough for assignments visible to the principal; for full estate RBAC read, prefer custom role with only `*/read` + authorization read actions).

**Not required:** role assignment write, Key Vault secret get/list data-plane (unless separately justified), PIM activate, or any write actions.

---

## 6. Okta — read-only APIs

| API | Gives us |
|-----|----------|
| `GET /api/v1/users` | Human directory, status (`ACTIVE` / `DEPROVISIONED`) |
| `GET /api/v1/groups` | Group membership |
| `GET /api/v1/apps` | App assignments |
| `GET /api/v1/users/{id}/factors` | MFA posture |
| `GET /api/v1/logs` | Auth / admin events (read system log) |

**OAuth scopes (read):** e.g. `okta.users.read`, `okta.groups.read`, `okta.apps.read`, `okta.logs.read` (names vary by Okta app grant UI).

**Not required:** user/group/app create, update, lifecycle deactivate, or any write scopes.

---

## 7. Google Workspace — read-only APIs

| API | Gives us |
|-----|----------|
| `directory.users.list` | User directory |
| `directory.groups.list` / `directory.members.list` | Group membership |
| `directory.roleAssignments.list` | Workspace admin privilege |
| `reports.activities.list` | Admin / login activity |

**Scopes (read):** Admin SDK Directory readonly + Reports readonly.

---

## 8. Workday (HR) — read-only APIs

| API | Gives us |
|-----|----------|
| `GET /ccx/api/v1/.../workers` | Worker list |
| `GET /ccx/api/v1/.../workers/{id}` | Employment status, hire/term, worker type |
| Orgs / supervisory orgs (GET) | Manager + org structure |

**Not required:** any HR write / staffing actions.

---

## 9. How we classify access (still read-only)

| Class | Meaning | Read-only computation |
|-------|---------|------------------------|
| **Direct** | Principal policy/binding reaches the resource | SimulatePrincipalPolicy · analyzeIamPolicy · roleAssignments/read |
| **Indirect** | Via group or assumed-role **trust** | Okta groups (GET) + IAM GetRole trust / attached policies |
| **Shadow** | Multi-hop path native tools miss | Inferred from **config** (instance profiles, trust policies, MI assignments, SA bindings) — not by invoking SSM/Lambda/exec |

Native tools incomplete for Shadow (for talk track only):

- **AWS:** IAM Access Analyzer, IAM Policy Simulator (direct-only)
- **GCP:** Policy Analyzer (direct bindings only)
- **Azure:** PIM / Access Reviews (often miss standing MI paths)

---

## 10. Resource map — which reads feed it

### Human (HI)

Reachable resources from read-only access evaluation for that principal.

### NHI

1. **Where attached** — `GetInstanceProfile` / EC2 association describe · Lambda get · Managed Identity read · compute/container get  
2. **What it can access** — same Simulate / analyzeIamPolicy / roleAssignments reads as above  

---

## 11. Correlation keys

| Source | Join key examples |
|--------|-------------------|
| Okta ↔ cloud | email / login ↔ federated principal / SAML NameID |
| Workday ↔ Okta | employeeId / email |
| AWS | `principalArn`, `roleArn`, account id |
| GCP | `user:` / `serviceAccount:` member, project id |
| Azure | Entra `objectId` / `principalId`, subscription id |

---

## 12. Installer talk track (read-only only)

Ask for **read-only security audit** access:

| Cloud | Ask for |
|-------|---------|
| **AWS** | `SecurityAudit` + describe/list on EC2/Lambda/S3/KMS as needed; `iam:SimulatePrincipalPolicy`; Organizations list if multi-account |
| **GCP** | `roles/viewer` + `roles/iam.securityReviewer` (+ Cloud Asset Viewer) on scoped projects |
| **Azure** | Subscription **Reader**; Graph `User.Read.All` + `Application.Read.All` / `ServicePrincipal.Read.All` (app-only) |
| **Okta** | Users/groups/apps/factors/logs **read** scopes |
| **Workday** | Workers + org **GET** only |

**Hard rule:** no write, no assume-role for customer workloads, no session start, no invoke, no exec.

---

## 13. Quick Q&A

**Q: Do you need admin on the account?**  
A: No — read-only audit / viewer-style access.

**Q: How do you see shadow paths without AssumeRole / SSM StartSession?**  
A: From configuration: trust policies, instance profile associations, managed identities, SA bindings, and IAM simulation — not by running the hop.

**Q: Where does exposure score come from?**  
A: Weighted sum of reachable resources from read-only policy evaluation in scope.

**Q: How do you know an NHI is on an EC2?**  
A: `ec2:DescribeIamInstanceProfileAssociations` + `iam:GetInstanceProfile` (both read).

---

## 14. Code references

| Artifact | Path |
|----------|------|
| Connector definitions | `src/data/mockData.js` → `dataSources` |
| Per-identity native payloads | `src/data/mockData.js` → `identities[].sources` |
| Access paths + API evidence | `src/data/mockData.js` → `accessPaths[].api` / `hopChain` |
| Exposure / resource map logic | `src/data/exposureApi.js` |
| Cloud-native display formatting | `src/data/cloudNative.js` |

---

*Read-only connector permissions only. Mutating / session APIs that may appear as hop **mechanisms** in the UI are attacker/capability evidence, not permissions we request.*
