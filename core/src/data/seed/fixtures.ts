import { cluster, type Identity } from './fragment.js';

/**
 * BEAT 14 and the pathological terminal states.
 *
 * Everything here is prefixed `*-fixture-*` so it can be filtered out of every
 * demo view: these rows exist to prove the engine cannot be crashed or fooled by
 * corrupt lineage, not to be shown to a CISO. The legacy directory is their home
 * because a system with no usable audit trail is where broken provenance actually
 * comes from.
 *
 * Lost provenance is a *finding*, not a dataset bug — `validateDataset` deliberately
 * permits a dangling `provisioned_by` for exactly this reason. The engine reports
 * "we lost the pointer to the owner" separately from "nobody owns this", because
 * the first is a data-integrity failure to chase and the second is an access
 * decision to make.
 */

/**
 * BEAT 14 — one hop longer than the traversal can follow.
 *
 * `maxChainDepth` defaults to 16, so an 18-link chain makes `depth_limit_exceeded`
 * reachable with no env override: the walk from the deepest link needs 17 hops to
 * reach the root and gives up first. Generated from a fixed length rather than
 * written out eighteen times — deterministic, and one number to change if the
 * policy default moves.
 *
 * Marked revoked so eighteen fixture rows cannot flood the reviewer's queue. The
 * accountability trace ignores `revoked`, so the depth cap is still demonstrable at
 * `GET /api/accountability/svc-fixture-depth-18`.
 */
const DEPTH_CHAIN_LENGTH = 18;

function depthId(position: number): string {
  return `svc-fixture-depth-${String(position).padStart(2, '0')}`;
}

const DEPTH_CHAIN: readonly Identity[] = Array.from(
  { length: DEPTH_CHAIN_LENGTH },
  (_unused, offset): Identity => {
    const position = offset + 1;
    return {
      id: depthId(position),
      type: 'service_account',
      name: `depth-probe-${position}`,
      app: 'legacy-ldap',
      direct_grants: [],
      inherited_from: [],
      delegates_to: position === DEPTH_CHAIN_LENGTH ? [] : [depthId(position + 1)],
      provisioned_by: position === 1 ? null : depthId(position - 1),
      revoked: true,
      created_at: '2019-03-01',
    };
  },
);

export const FIXTURES = cluster({
  identities: [
    {
      id: 'svc-fixture-dangling-owner',
      type: 'service_account',
      name: 'orphaned-import-svc',
      app: 'legacy-ldap',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: [],
      // Points at an identity that is not in the graph. Mirrors a real Entra
      // failure mode: an auto-created service principal inherits no owner from
      // either the application object or the user who triggered its creation.
      provisioned_by: 'user-ghost',
    },
    /**
     * The out-of-population parent, produced by a provider working correctly.
     *
     * `PRD` L28 asserts creation lineage cannot contain a dangling parent; research
     * §4.8 shows AWS `CreateServiceLinkedRole` produces one by construction, naming
     * a service principal that is not an identity in the customer's estate at all.
     * The row above it is a *corrupt* pointer; this one is a correct record we
     * cannot resolve, and the two are worth having side by side because the
     * remediation differs — one is a bug to chase, the other is a fact to display.
     *
     * Revoked so a probe cannot enter the reviewer's queue. The accountability and
     * lineage walks both ignore `revoked`, so `dangling_reference` stays reachable.
     */
    {
      id: 'svc-fixture-service-linked-role',
      type: 'service_account',
      name: 'service-linked-role-probe',
      app: 'aws-iam',
      direct_grants: [],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'aws:autoscaling.amazonaws.com',
      revoked: true,
      created_at: '2025-04-18',
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-fixture-cycle-a',
      type: 'service_account',
      name: 'cycle-probe-a',
      app: 'legacy-ldap',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-b'],
      provisioned_by: 'svc-fixture-cycle-b',
    },
    {
      id: 'svc-fixture-cycle-b',
      type: 'service_account',
      name: 'cycle-probe-b',
      app: 'legacy-ldap',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-a'],
      provisioned_by: 'svc-fixture-cycle-a',
    },
    ...DEPTH_CHAIN,
  ],

  /**
   * The one `provider_service` actor in the dataset.
   *
   * `KIND_BY_IDENTITY_TYPE` in `lineage/actors.ts` cannot produce this kind from an
   * identity object, because the AWS service that performed the create is not in the
   * population to have a type — it is a fact recorded only in the audit event. So the
   * edge is the only place the kind can come from, and this is the row that proves it.
   */
  creation_edges: [
    {
      app: 'aws-iam',
      child_id: 'svc-fixture-service-linked-role',
      actor: {
        raw_principal: 'aws:autoscaling.amazonaws.com',
        kind: 'provider_service',
        app: 'aws-iam',
        issuer: null,
        attested_human: null,
        attested_basis: null,
        pipeline_actor: null,
        review_approver: null,
      },
      observed_at: '2025-04-18',
      occurred_at: '2025-04-18',
      source: 'audit_event',
      superseded_by: null,
    },
  ],
});
