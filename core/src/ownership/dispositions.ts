import type { DispositionAction, FindingDisposition } from '../domain/ownership.js';
import type { Clock, FindingStore } from '../domain/ports.js';

export interface DispositionRequest {
  readonly finding_id: string;
  readonly identity_id: string;
  readonly action: DispositionAction;
  readonly actor: string;
  readonly justification: string;
  readonly expires_at?: string;
  readonly evidence_ref?: string;
}

export type DispositionOutcome =
  | { readonly ok: true; readonly disposition: FindingDisposition; readonly supersedes: number }
  | { readonly ok: false; readonly error: 'expiry_required' | 'invalid_expiry' | 'missing_field' }
  ;

export interface DispositionService {
  record(request: DispositionRequest): DispositionOutcome;
  history(identityId: string): readonly FindingDisposition[];
}

export interface DispositionDeps {
  readonly store: FindingStore;
  readonly clock: Clock;
}

/**
 * Records a decision against a finding.
 *
 * Returns a typed outcome rather than throwing, so the HTTP layer maps a bad
 * request to a 400 without a try/catch and the domain keeps its no-exceptions
 * contract.
 */
export function createDispositionService(deps: DispositionDeps): DispositionService {
  return {
    record(request) {
      if (
        request.finding_id.length === 0 ||
        request.identity_id.length === 0 ||
        request.actor.length === 0 ||
        request.justification.length === 0
      ) {
        return { ok: false, error: 'missing_field' };
      }

      // §4.5: a suppression without an expiry is a permanent exception nobody
      // revisits, which is the failure mode the whole module exists to catch.
      if (request.action === 'suppressed' && request.expires_at === undefined) {
        return { ok: false, error: 'expiry_required' };
      }
      if (request.expires_at !== undefined && Number.isNaN(Date.parse(request.expires_at))) {
        return { ok: false, error: 'invalid_expiry' };
      }

      const supersedes = deps.store.history(request.identity_id).length;
      const disposition: FindingDisposition = {
        finding_id: request.finding_id,
        identity_id: request.identity_id,
        action: request.action,
        actor: request.actor,
        at: deps.clock.now().toISOString(),
        justification: request.justification,
        expires_at: request.expires_at ?? null,
        evidence_ref: request.evidence_ref ?? null,
      };

      deps.store.append(disposition);
      return { ok: true, disposition, supersedes };
    },

    history(identityId) {
      return deps.store.history(identityId);
    },
  };
}
