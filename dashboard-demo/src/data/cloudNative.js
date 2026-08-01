/**
 * Normalize demo shorthand (s3://…, gke://…, azure://…) into real cloud
 * identifiers — AWS ARNs, GCP resource names, Azure resource IDs.
 */

export const CLOUD_CTX = {
  awsAccount: '481516234210',
  awsRegion: 'us-east-1',
  gcpProject: 'acme-prod-4821',
  gcpRegion: 'us-central1',
  gcpZone: 'us-central1-a',
  azureSub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
};

const { awsAccount, awsRegion, gcpProject, gcpRegion, gcpZone, azureSub } = CLOUD_CTX;

function stripScheme(value) {
  const raw = String(value || '').trim();
  // "ec2://i-0abc123 (payments-prod-worker)" → keep id, drop label
  const withoutLabel = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const idx = withoutLabel.indexOf('://');
  if (idx === -1) return { scheme: '', name: withoutLabel };
  return {
    scheme: withoutLabel.slice(0, idx).toLowerCase(),
    name: withoutLabel.slice(idx + 3),
  };
}

function azureRg(name) {
  if (name.startsWith('rg-')) return name;
  if (name.startsWith('kv-')) return 'rg-payments';
  if (name.startsWith('sa-') || name.startsWith('sab')) return 'rg-finance';
  if (name.startsWith('mi-')) return 'rg-platform';
  if (name.includes('devops')) return 'rg-devops-prod';
  if (name.includes('platform')) return 'rg-platform-prod';
  if (name.includes('finance') || name.includes('billing')) return 'rg-finance';
  if (name.includes('ops')) return 'rg-ops';
  return 'rg-platform-prod';
}

/** Convert a shorthand or partial ref into a cloud-native identifier. */
export function formatCloudRef(ref, cloudProvider, hints = {}) {
  if (!ref) return null;
  const raw = String(ref).trim();
  if (!raw || raw === '—') return raw;

  // Already native
  if (raw.startsWith('arn:aws:')) return raw;
  if (raw.startsWith('/subscriptions/') || raw.startsWith('/providers/')) return raw;
  if (raw.startsWith('projects/') || raw.startsWith('//')) return raw;
  if (/^(user|serviceAccount|group|domain):/.test(raw)) return raw;

  const { scheme, name } = stripScheme(raw);
  const cloud = cloudProvider
    || hints.cloudProvider
    || (scheme === 'azure' ? 'Azure'
      : ['gke', 'gce', 'gcf', 'bigquery', 'storage', 'pubsub', 'vertex'].includes(scheme) ? 'GCP'
        : ['s3', 'iam', 'ec2', 'rds', 'dynamodb', 'kms', 'lambda', 'secrets', 'ssm', 'ecr', 'events', 'ecs', 'cloudwatch'].includes(scheme) ? 'AWS'
          : null);

  if (hints.resourceArn) return hints.resourceArn;
  if (hints.resourceName && cloud === 'GCP') return hints.resourceName;
  if (hints.scope && cloud === 'Azure') return hints.scope;

  if (cloud === 'AWS') {
    switch (scheme) {
      case 's3':
        return `arn:aws:s3:::${name}`;
      case 'iam':
        return `arn:aws:iam::${awsAccount}:role/${name.replace(/^role\//, '')}`;
      case 'ec2': {
        const id = name.replace(/^instance\//, '');
        return `arn:aws:ec2:${awsRegion}:${awsAccount}:instance/${id}`;
      }
      case 'rds':
        return `arn:aws:rds:${awsRegion}:${awsAccount}:db:${name}`;
      case 'dynamodb':
        return `arn:aws:dynamodb:${awsRegion}:${awsAccount}:table/${name}`;
      case 'kms':
        return name.includes('key/') || name.includes('alias/')
          ? `arn:aws:kms:${awsRegion}:${awsAccount}:${name}`
          : `arn:aws:kms:${awsRegion}:${awsAccount}:alias/${name.replace(/^keyring\//, '')}`;
      case 'lambda':
        return `arn:aws:lambda:${awsRegion}:${awsAccount}:function:${name}`;
      case 'secrets':
        return `arn:aws:secretsmanager:${awsRegion}:${awsAccount}:secret:${name}`;
      case 'ssm':
        return `arn:aws:ssm:${awsRegion}:${awsAccount}:document/${name}`;
      case 'ecr':
        return `arn:aws:ecr:${awsRegion}:${awsAccount}:repository/${name}`;
      case 'events':
        return `arn:aws:events:${awsRegion}:${awsAccount}:rule/${name}`;
      case 'ecs':
        return `arn:aws:ecs:${awsRegion}:${awsAccount}:service/default/${name}`;
      case 'cloudwatch':
        return `arn:aws:cloudwatch:${awsRegion}:${awsAccount}:alarm:${name}`;
      default:
        if (name.startsWith('i-')) {
          return `arn:aws:ec2:${awsRegion}:${awsAccount}:instance/${name}`;
        }
        return raw.includes('/') || raw.includes(':') ? raw : `arn:aws:iam::${awsAccount}:role/${raw}`;
    }
  }

  if (cloud === 'GCP') {
    switch (scheme) {
      case 'gke': {
        const cluster = name.split('/')[0];
        return `projects/${gcpProject}/locations/${gcpRegion}/clusters/${cluster}`;
      }
      case 'gce':
        return `projects/${gcpProject}/zones/${gcpZone}/instances/${name}`;
      case 'gcf':
        return `projects/${gcpProject}/locations/${gcpRegion}/functions/${name}`;
      case 'bigquery':
        return `projects/${gcpProject}/datasets/${name.replace(/-/g, '_')}`;
      case 'storage':
        return `projects/_/buckets/${name}`;
      case 'pubsub':
        return `projects/${gcpProject}/topics/${name}`;
      case 'vertex':
        return `projects/${gcpProject}/locations/${gcpRegion}/pipelineJobs/${name}`;
      case 'iam': {
        const sa = name.includes('@')
          ? name
          : `${name}@${gcpProject}.iam.gserviceaccount.com`;
        return `projects/${gcpProject}/serviceAccounts/${sa}`;
      }
      default:
        if (raw.includes('@') && raw.includes('gserviceaccount.com')) {
          return `projects/${gcpProject}/serviceAccounts/${raw}`;
        }
        return raw;
    }
  }

  if (cloud === 'Azure') {
    const sub = `/subscriptions/${azureSub}`;
    switch (scheme) {
      case 'azure':
      default: {
        const n = name || raw.replace(/^azure:\/\//, '');
        if (n.startsWith('kv-')) {
          return `${sub}/resourceGroups/${azureRg(n)}/providers/Microsoft.KeyVault/vaults/${n}`;
        }
        if (n.startsWith('rg-') || n.startsWith('rg')) {
          return `${sub}/resourceGroups/${n}`;
        }
        if (n.startsWith('sa-') || n.startsWith('sab')) {
          const account = n.replace(/^sa-/, '').replace(/-/g, '');
          return `${sub}/resourceGroups/${azureRg(n)}/providers/Microsoft.Storage/storageAccounts/${account}`;
        }
        if (n.startsWith('mi-')) {
          return `${sub}/resourceGroups/${azureRg(n)}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${n}`;
        }
        if (n.includes('automation')) {
          return `${sub}/resourceGroups/rg-platform-prod/providers/Microsoft.Automation/automationAccounts/aa-platform-ops`;
        }
        if (n.includes('mgmt-group') || n.includes('management')) {
          return `/providers/Microsoft.Management/managementGroups/acme-prod`;
        }
        if (n === 'Owner' || n === 'subscription-owner') {
          return `${sub}/providers/Microsoft.Authorization/roleAssignments/owner`;
        }
        return `${sub}/resourceGroups/${azureRg(n)}/providers/Microsoft.Resources/resourceGroups/${n}`;
      }
    }
  }

  return raw;
}

/**
 * Resource category for map grouping/labels — service kind, not cloud vendor.
 * e.g. S3, IAM, BigQuery, Key Vault — never "AWS" / "GCP" / "Azure".
 */
export function resourceCategory(ref, cloudProvider, hints = {}) {
  const raw = String(ref || hints.resourceArn || hints.resourceName || hints.scope || '').trim();
  const lower = raw.toLowerCase();
  const { scheme } = (() => {
    const idx = raw.indexOf('://');
    if (idx === -1) return { scheme: '' };
    return { scheme: raw.slice(0, idx).toLowerCase() };
  })();

  // Scheme-based (demo shorthand + some native)
  const schemeMap = {
    s3: 'S3',
    rds: 'RDS',
    dynamodb: 'DynamoDB',
    kms: 'KMS',
    iam: 'IAM',
    ec2: 'EC2',
    lambda: 'Lambda',
    secrets: 'Secrets Manager',
    ssm: 'Systems Manager',
    ecr: 'ECR',
    ecs: 'ECS',
    events: 'EventBridge',
    cloudwatch: 'CloudWatch',
    gke: 'GKE',
    gce: 'Compute Engine',
    gcf: 'Cloud Functions',
    bigquery: 'BigQuery',
    storage: 'Cloud Storage',
    pubsub: 'Pub/Sub',
    vertex: 'Vertex AI',
    azure: null, // resolve below from ARM path
  };
  if (scheme && schemeMap[scheme]) return schemeMap[scheme];

  // AWS ARNs
  if (lower.startsWith('arn:aws:')) {
    const svc = lower.split(':')[2] || '';
    const arnMap = {
      s3: 'S3',
      iam: 'IAM',
      ec2: 'EC2',
      rds: 'RDS',
      dynamodb: 'DynamoDB',
      kms: 'KMS',
      lambda: 'Lambda',
      secretsmanager: 'Secrets Manager',
      ssm: 'Systems Manager',
      ecr: 'ECR',
      ecs: 'ECS',
      events: 'EventBridge',
      cloudwatch: 'CloudWatch',
      sts: 'STS',
    };
    if (arnMap[svc]) return arnMap[svc];
    if (lower.includes(':instance-profile/')) return 'Instance profile';
    if (lower.includes(':role/')) return 'IAM';
    return svc ? svc.toUpperCase() : 'AWS resource';
  }

  // GCP resource names
  if (lower.includes('/clusters/') || lower.includes('container.googleapis')) return 'GKE';
  if (lower.includes('/instances/') && lower.includes('/zones/')) return 'Compute Engine';
  if (lower.includes('/datasets/') || lower.includes('bigquery')) return 'BigQuery';
  if (lower.includes('/buckets/') || lower.includes('storage.googleapis')) return 'Cloud Storage';
  if (lower.includes('/topics/') || lower.includes('pubsub')) return 'Pub/Sub';
  if (lower.includes('/functions/')) return 'Cloud Functions';
  if (lower.includes('/pipelinejobs/') || lower.includes('aiplatform')) return 'Vertex AI';
  if (lower.includes('/serviceaccounts/') || lower.includes('.iam.gserviceaccount.com')) return 'Service account';

  // Azure ARM
  if (lower.includes('microsoft.keyvault')) return 'Key Vault';
  if (lower.includes('microsoft.storage')) return 'Storage account';
  if (lower.includes('microsoft.managedidentity')) return 'Managed identity';
  if (lower.includes('microsoft.authorization')) return 'Role assignment';
  if (lower.includes('microsoft.automation')) return 'Automation';
  if (lower.includes('microsoft.compute')) return 'Virtual machine';
  if (lower.includes('/resourcegroups/') && !lower.includes('/providers/')) return 'Resource group';
  if (lower.includes('managementgroups')) return 'Management group';

  if (scheme === 'azure') {
    const name = raw.slice(raw.indexOf('://') + 3).toLowerCase();
    if (name.startsWith('kv-')) return 'Key Vault';
    if (name.startsWith('sa-') || name.startsWith('sab')) return 'Storage account';
    if (name.startsWith('mi-')) return 'Managed identity';
    if (name.startsWith('rg-')) return 'Resource group';
    return 'Azure resource';
  }

  if (cloudProvider === 'AWS') return 'Cloud resource';
  if (cloudProvider === 'GCP') return 'Cloud resource';
  if (cloudProvider === 'Azure') return 'Cloud resource';
  return 'Resource';
}

/** Human-readable short label for graph cards (keep readable, still cloud-native). */
export function formatCloudLabel(ref, cloudProvider, hints = {}) {
  const native = formatCloudRef(ref, cloudProvider, hints);
  if (!native) return ref;

  if (cloudProvider === 'AWS' || String(native).startsWith('arn:aws:')) {
    // arn:aws:s3:::bucket → s3:::bucket ; role → role/name
    const m = String(native).match(/^arn:aws:([^:]+):([^:]*):([^:]*):(.+)$/);
    if (m) {
      const [, service, , , resource] = m;
      if (service === 's3') return `s3:::${resource}`;
      return `${service}:${resource}`;
    }
  }

  if (cloudProvider === 'GCP' || String(native).startsWith('projects/')) {
    const parts = String(native).split('/');
    // show last two segments: datasets/analytics_prod, clusters/devops-cluster
    if (parts.length >= 2) return parts.slice(-2).join('/');
  }

  if (cloudProvider === 'Azure' || String(native).startsWith('/subscriptions/') || String(native).startsWith('/providers/')) {
    const parts = String(native).split('/');
    return parts.slice(-2).join('/');
  }

  return native;
}

export function formatCloudApiSource(source, cloudProvider) {
  if (!source) {
    if (cloudProvider === 'AWS') return 'AWS IAM';
    if (cloudProvider === 'GCP') return 'Google Cloud IAM';
    if (cloudProvider === 'Azure') return 'Azure Resource Manager';
    return null;
  }
  const s = String(source);
  // Collapse "okta.groups + aws.iam" → prefer cloud-native primary for this surface
  if (cloudProvider === 'AWS') {
    if (/aws\.iam/i.test(s) && /simulate|policy/i.test(s)) return 'AWS IAM';
    if (/aws\.sts/i.test(s)) return 'AWS STS';
    if (/aws\.s3/i.test(s)) return 'Amazon S3';
    if (/aws\.ec2/i.test(s)) return 'Amazon EC2';
    if (/aws\.lambda/i.test(s)) return 'AWS Lambda';
    if (/aws\.ssm/i.test(s)) return 'AWS Systems Manager';
    if (/aws\.secretsmanager/i.test(s)) return 'AWS Secrets Manager';
    if (/aws\.ecr/i.test(s)) return 'Amazon ECR';
    if (/aws\.rds/i.test(s)) return 'Amazon RDS';
    if (/aws\.dynamodb/i.test(s)) return 'Amazon DynamoDB';
    if (/aws\.kms/i.test(s)) return 'AWS KMS';
    if (/aws\.events/i.test(s)) return 'Amazon EventBridge';
    if (/aws\.cloudwatch/i.test(s)) return 'Amazon CloudWatch';
    if (/aws\.ecs/i.test(s)) return 'Amazon ECS';
    if (/aws\./i.test(s)) return s.replace(/okta\.[^+]+\s*\+\s*/gi, '').replace(/\baw[s]\./gi, 'AWS ').trim();
    return 'AWS IAM';
  }
  if (cloudProvider === 'GCP') {
    if (/bigquery/i.test(s)) return 'Google BigQuery IAM';
    if (/storage/i.test(s)) return 'Google Cloud Storage IAM';
    if (/container/i.test(s)) return 'Google Kubernetes Engine';
    if (/compute/i.test(s)) return 'Compute Engine';
    if (/pubsub/i.test(s)) return 'Cloud Pub/Sub';
    if (/cloudfunctions/i.test(s)) return 'Cloud Functions';
    if (/aiplatform/i.test(s)) return 'Vertex AI';
    if (/iamcredentials/i.test(s)) return 'IAM Service Account Credentials';
    if (/cloudresourcemanager|cloudasset|gcp\.iam/i.test(s)) return 'Cloud Asset Inventory';
    return 'Google Cloud IAM';
  }
  if (cloudProvider === 'Azure') {
    if (/keyvault/i.test(s)) return 'Azure Key Vault + Authorization';
    if (/managedidentity/i.test(s)) return 'Microsoft.ManagedIdentity';
    if (/automation/i.test(s)) return 'Azure Automation + Authorization';
    if (/storage/i.test(s)) return 'Azure Storage + Authorization';
    return 'Microsoft.Authorization';
  }
  return s;
}

/**
 * Build provider-native API evidence rows for the detail panel.
 * Field names match what you'd see in AWS / GCP / Azure consoles & APIs.
 */
export function buildApiEvidenceRows(api, cloudProvider, path = {}) {
  if (!api && !path) return [];
  const a = api || {};
  const cloud = cloudProvider || path.cloudProvider;
  const perms = path.effectivePermissions || [];
  const resourceNative = formatCloudRef(
    path.resource,
    cloud,
    {
      resourceArn: a.resourceArn,
      resourceName: a.resourceName,
      scope: a.scope,
    },
  );

  if (cloud === 'AWS') {
    const rows = [
      { k: 'Service', v: formatCloudApiSource(a.source, 'AWS') },
      { k: 'Principal ARN', v: a.principalArn || a.roleArn || a.trustPolicyPrincipal || a.terminalRoleArn },
      { k: 'Resource ARN', v: a.resourceArn || resourceNative },
      { k: 'Policy ARN', v: a.policyArn },
      { k: 'Role ARN', v: a.roleArn || a.terminalRoleArn },
      { k: 'Action', v: perms.length ? perms.join(', ') : null },
      { k: 'Statement SID', v: a.statementSid },
      { k: 'Policy version', v: a.policyVersionId },
      { k: 'Evaluated via', v: a.evaluatedVia || (a.nativeVisible === false ? 'Multi-hop path (not in IAM Access Analyzer)' : 'iam:SimulatePrincipalPolicy') },
      { k: 'Account', v: awsAccount },
      { k: 'Region', v: awsRegion },
    ];
    return rows.filter(r => r.v);
  }

  if (cloud === 'GCP') {
    const rows = [
      { k: 'API', v: formatCloudApiSource(a.source, 'GCP') },
      { k: 'Member', v: a.principal || a.terminalPrincipal },
      { k: 'Resource name', v: a.resourceName || resourceNative },
      { k: 'Role', v: a.role },
      { k: 'Permission', v: perms.length ? perms.join(', ') : null },
      { k: 'Condition', v: a.bindingCondition },
      { k: 'Analyzed via', v: a.evaluatedVia || (a.nativeVisible === false ? 'Multi-hop path (not in Policy Analyzer)' : 'cloudasset.analyzeIamPolicy') },
      { k: 'Project', v: gcpProject },
    ];
    return rows.filter(r => r.v != null && r.v !== '');
  }

  if (cloud === 'Azure') {
    const rows = [
      { k: 'Provider', v: formatCloudApiSource(a.source, 'Azure') },
      { k: 'Principal ID', v: a.principalId },
      { k: 'Role definition', v: a.roleDefinitionName || a.roleDefinitionId },
      { k: 'Scope', v: a.scope || resourceNative },
      { k: 'DataActions', v: perms.length ? perms.join(', ') : null },
      { k: 'Evaluated via', v: a.evaluatedVia || 'Microsoft.Authorization/roleAssignments' },
      { k: 'Subscription', v: azureSub },
    ];
    return rows.filter(r => r.v);
  }

  return [
    { k: 'Source', v: a.source },
    { k: 'Resource', v: resourceNative },
  ].filter(r => r.v);
}

/** Normalize a hop step to cloud-native from/to + API operation. */
export function normalizeHopStep(step, cloudProvider) {
  if (!step) return step;
  const hints = {
    resourceArn: step.resourceArn,
    resourceName: step.resourceName,
  };
  return {
    ...step,
    from: formatCloudRef(step.from, cloudProvider, hints) || step.from,
    to: formatCloudRef(step.to, cloudProvider, hints) || step.to,
    displayTo: formatCloudLabel(step.to, cloudProvider, hints),
    displayFrom: formatCloudLabel(step.from, cloudProvider, hints),
    api: step.api || null,
  };
}

/** Enrich an access path for UI — native resource id, hops, API rows. */
export function normalizeAccessPath(path) {
  if (!path) return path;
  const cloud = path.cloudProvider;
  const api = path.api || {};
  const nativeResource = formatCloudRef(path.resource, cloud, {
    resourceArn: api.resourceArn,
    resourceName: api.resourceName,
    scope: api.scope,
  });
  const hopChain = (path.hopChain || []).map(h => normalizeHopStep(h, cloud));

  return {
    ...path,
    resource: nativeResource,
    resourceShort: formatCloudLabel(path.resource, cloud, {
      resourceArn: api.resourceArn,
      resourceName: api.resourceName,
      scope: api.scope,
    }),
    resourceLegacy: path.resource,
    hopChain,
    apiEvidence: buildApiEvidenceRows(api, cloud, { ...path, resource: path.resource }),
    api: {
      ...api,
      resourceArn: cloud === 'AWS' ? (api.resourceArn || nativeResource) : api.resourceArn,
      resourceName: cloud === 'GCP' ? (api.resourceName || nativeResource) : api.resourceName,
      scope: cloud === 'Azure' ? (api.scope || nativeResource) : api.scope,
      sourceLabel: formatCloudApiSource(api.source, cloud),
    },
  };
}
