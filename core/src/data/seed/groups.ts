import { cluster } from './fragment.js';

/**
 * Groups and roles — permission containers, not things a person owns.
 *
 * Two of them carry sensitive access that nobody was granted directly, which is
 * the whole point of effective-access ranking: `group-finance` puts a production
 * export inside reach of anything that inherits it, and `group-legacy-admins`
 * puts the production database inside reach of a VPN account nobody owns.
 *
 * Which groups a team owns is in `directory.ts`. `group-finance` is deliberately
 * unowned: it is inherited by five identities whose ownership must be decided by
 * their own records, not silently supplied by a group.
 */
export const GROUPS = cluster({
  identities: [
    {
      id: 'group-eng',
      type: 'group',
      name: 'Engineering',
      app: 'aws-iam',
      direct_grants: ['mcp:notion-write'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-01-06',
    },
    {
      id: 'group-finance',
      type: 'group',
      name: 'Finance',
      app: 'aws-iam',
      direct_grants: ['read:finance-db', 'export:finance-report'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-01-06',
    },
    {
      id: 'group-data',
      type: 'group',
      name: 'Data Platform',
      app: 'snowflake',
      direct_grants: ['write:warehouse', 'admin:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-06-03',
    },
    {
      id: 'group-search-index',
      type: 'group',
      name: 'Search Index Writers',
      app: 'snowflake',
      direct_grants: ['write:search-index'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-02-11',
    },
    {
      id: 'group-agent-tools',
      type: 'group',
      name: 'Agent Tooling',
      app: 'mcp-gateway',
      direct_grants: ['mcp:notion-write'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-10-30',
    },
    {
      id: 'group-legacy-admins',
      type: 'group',
      name: 'Legacy Directory Admins',
      app: 'legacy-ldap',
      direct_grants: ['admin:prod-database', 'read:ldap-directory'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2019-08-20',
    },
  ],
});
