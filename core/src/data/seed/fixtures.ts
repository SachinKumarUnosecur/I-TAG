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
});
