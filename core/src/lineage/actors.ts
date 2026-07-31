import { traceAccountability } from '../accountability/trace.js';
import type {
  ActorKind,
  AuthorizingHuman,
  CreationActor,
  HumanResolutionBasis,
  PersistedCreationEdge,
} from '../domain/lineage.js';
import type { AccountabilityPolicy } from '../domain/policy.js';
import type { HrDirectory } from '../domain/ports.js';
import type { Identity, IdentityType } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';

export interface ActorNormalizationContext {
  readonly child: Identity;
  /** The recorded creator, when `provisioned_by` resolves to an identity we hold. */
  readonly parent: Identity | null;
  /** The persisted creation event for this child, when one was ingested (§4.6). */
  readonly edge: PersistedCreationEdge | null;
  readonly graph: IdentityGraph;
}

/**
 * One way of reading a raw creation record into a `CreationActor`.
 *
 * A registry rather than a function with a `switch`, because in a real deployment
 * each provider needs its own reading of its own audit schema — CloudTrail's
 * `userIdentity`, Entra's `initiatedBy`, Okta's `actor`, a Kubernetes
 * `user.username` — and research §8 gap 1 rates this Critical precisely because it
 * is schema-level and upstream of every adapter. Retrofitting it after the adapters
 * exist means rewriting all of them, so the shape is settled here while there is
 * one implementer, and appending an adapter later costs one object.
 *
 * Contract: never throws, and returns either a fully populated actor or null so the
 * next normalizer runs. A half-filled actor is worse than none, because every
 * consumer treats a non-null result as complete.
 */
export interface ActorNormalizer {
  readonly id: string;
  normalize(context: ActorNormalizationContext): CreationActor | null;
}

/**
 * Identity type to actor kind, for the case where all we have is the parent object.
 *
 * A frozen lookup rather than a `switch` so a new `IdentityType` fails the build
 * here instead of silently defaulting — the same reason
 * `ORPHAN_REASON_TO_OWNERSHIP_REASON` is a table.
 *
 * A group maps to `unknown` rather than to any acting kind: a group is a permission
 * container and cannot perform a create, so a group id in a creator position is a
 * data artefact and must not be dressed up as an actor.
 *
 * Note what this table *cannot* produce: `role_session`, `service_principal` and
 * `provider_service`. Those are facts recorded only in an audit event — a
 * `sessionIssuer`, an `initiatedBy.app`, an AWS service principal — and no amount
 * of reading the identity object recovers them (§3.2). That asymmetry is the
 * argument for the persisted edge store, visible in the type system.
 */
const KIND_BY_IDENTITY_TYPE: Readonly<Record<IdentityType, ActorKind>> = Object.freeze({
  human: 'human',
  service_account: 'automation',
  ai_agent: 'automation',
  group: 'unknown',
});

/** An edge that has been corrected is history, not the current answer (§4.6). */
function isLive(edge: PersistedCreationEdge): boolean {
  return edge.superseded_by === null;
}

/**
 * The persisted audit event, which is the only source that carries a real actor.
 *
 * First in precedence because it is the only one of the three that can distinguish
 * a human from the role session they assumed. Everything below it is a fallback
 * that infers an actor from an object field, which for six of seven providers does
 * not exist (§3.2).
 */
const persistedEventNormalizer: ActorNormalizer = {
  id: 'persisted_audit_event',
  normalize({ edge }) {
    if (edge === null || !isLive(edge)) {
      return null;
    }
    return edge.actor;
  },
};

/**
 * The recorded parent, read as an actor.
 *
 * This is the `object_field` case: we hold a `provisioned_by` and no event behind
 * it, so the best available actor is the parent account itself. Honest but lossy —
 * it cannot tell whether a human clicked or a role session acted on their behalf,
 * which is exactly the ambiguity `AuthorizingHuman` then has to resolve.
 */
const recordedParentNormalizer: ActorNormalizer = {
  id: 'recorded_parent',
  normalize({ child, parent }) {
    if (parent === null) {
      return null;
    }
    return {
      raw_principal: parent.id,
      kind: KIND_BY_IDENTITY_TYPE[parent.type],
      // The app that recorded the edge is the *child's* app: it is that system's
      // audit log the creation appears in, even when the creator lives elsewhere.
      app: child.app,
      issuer: null,
      // An object field is not a provider attestation of a *human*, even when the
      // principal named happens to be one: there is no session context to say
      // whether that person acted or something acted under their credential. The
      // `acting_principal_is_human` resolver reads `kind` and prices it correctly;
      // filling `attested_human` here would let an object field masquerade as an
      // audit-log assertion, and confidence that can be forged upstream is
      // decoration.
      attested_human: null,
      attested_basis: null,
      pipeline_actor: null,
      review_approver: null,
    };
  },
};

/**
 * A creator that was recorded and does not resolve to anything we hold.
 *
 * Deliberately produces an actor rather than nothing. `PRD` L28 treats this shape
 * as impossible; research §4.8 shows it is produced by construction, because AWS
 * `CreateServiceLinkedRole` names an AWS service that is not an identity in the
 * customer's estate. We still know *what* acted — the principal string is the
 * evidence — so this is known provenance with an unresolvable parent, and it is the
 * ancestor walk that reports `dangling_reference`. Calling it a coverage gap would
 * let a corrupt pointer quietly improve the coverage metric.
 */
const unresolvedPrincipalNormalizer: ActorNormalizer = {
  id: 'unresolved_principal',
  normalize({ child }) {
    if (child.provisioned_by === null) {
      return null;
    }
    return {
      raw_principal: child.provisioned_by,
      kind: 'unknown',
      app: child.app,
      issuer: null,
      attested_human: null,
      attested_basis: null,
      pipeline_actor: null,
      review_approver: null,
    };
  },
};

/** List order is precedence order. Appending an adapter is appending an object. */
export const DEFAULT_ACTOR_NORMALIZERS: readonly ActorNormalizer[] = Object.freeze([
  persistedEventNormalizer,
  recordedParentNormalizer,
  unresolvedPrincipalNormalizer,
]);

export function normalizeActor(
  context: ActorNormalizationContext,
  normalizers: readonly ActorNormalizer[] = DEFAULT_ACTOR_NORMALIZERS,
): CreationActor | null {
  for (const normalizer of normalizers) {
    const actor = normalizer.normalize(context);
    if (actor !== null) {
      return actor;
    }
  }
  return null;
}

export interface HumanResolutionContext {
  readonly actor: CreationActor;
  readonly child: Identity;
  readonly graph: IdentityGraph;
  readonly hr: HrDirectory;
  /** Bounds the correlation walk. Reuses F4's cap rather than inventing a second. */
  readonly policy: AccountabilityPolicy;
}

/**
 * One way of attaching a human to an actor.
 *
 * Precedence is list order, first match wins, and `basis` plus `confidence` ship
 * with every resolution — the identical discipline `OwnerRef` already uses at
 * `ownership/resolve.ts` L40-48. Research §4.1 is explicit that this pattern should
 * be reused rather than a parallel vocabulary invented.
 */
export interface HumanResolver {
  readonly id: string;
  resolve(context: HumanResolutionContext): AuthorizingHuman | null;
}

/**
 * The three bases a provider can attest, as opposed to the three we derive.
 *
 * Guarded as a set rather than trusted from the actor, so an adapter that stamps a
 * correlated basis onto `attested_basis` cannot launder an inference into an
 * attestation. Confidence is the field a CISO reads before acting on a row; if it
 * can be forged upstream it is decoration.
 */
const ATTESTED_BASES: ReadonlySet<HumanResolutionBasis> = Object.freeze(
  new Set<HumanResolutionBasis>([
    'sts_source_identity',
    'identity_center_user',
    'entra_initiated_by_user',
  ]),
);

function isHuman(graph: IdentityGraph, id: string): boolean {
  return graph.byId.get(id)?.type === 'human';
}

/**
 * Whether we hold this person at all, stated in the detail rather than used to
 * reject the resolution: a provider naming a human we do not have on file is still
 * the evidence of record, and dropping it would lose the only attribution we have.
 */
function population(graph: IdentityGraph, hr: HrDirectory, humanId: string): string {
  if (isHuman(graph, humanId)) {
    return 'in this estate';
  }
  return hr.person(humanId) === null
    ? 'not an identity we hold, so employment status is unverifiable'
    : 'known to HR but not present as an account';
}

/**
 * The provider that recorded the create also named the human. The only `attested`
 * basis, and the only one on which automated remediation is defensible (§4.9).
 */
const attestedFieldResolver: HumanResolver = {
  id: 'attested_provider_field',
  resolve({ actor, graph, hr }) {
    const { attested_human: human, attested_basis: basis } = actor;
    if (human === null || basis === null || !ATTESTED_BASES.has(basis)) {
      return null;
    }
    return {
      human_id: human,
      basis,
      confidence: 'attested',
      detail: `${basis} on the creation event names ${human} (${population(graph, hr, human)})`,
    };
  },
};

/**
 * A CI run's triggering actor.
 *
 * `correlated`, not `attested`: the pipeline asserts who pressed the button, but
 * the provider that recorded the create never saw that person — it saw the runner's
 * credential. Two records joined, so the join can be wrong.
 */
const pipelineTriggerResolver: HumanResolver = {
  id: 'pipeline_trigger',
  resolve({ actor, graph, hr }) {
    const human = actor.pipeline_actor;
    if (human === null) {
      return null;
    }
    return {
      human_id: human,
      basis: 'pipeline_trigger',
      confidence: 'correlated',
      detail:
        `${actor.raw_principal} acted for pipeline run triggered by ${human} ` +
        `(${population(graph, hr, human)})`,
    };
  },
};

/**
 * The approver on the change record.
 *
 * Weaker attribution than a trigger — an approver authorised the change without
 * performing it — but it is the field that satisfies NIST SP 800-53 AC-2(e), so its
 * *presence* matters independently of its strength as an attribution (§4.4).
 */
const reviewApproverResolver: HumanResolver = {
  id: 'pr_approver',
  resolve({ actor, graph, hr }) {
    const human = actor.review_approver;
    if (human === null) {
      return null;
    }
    return {
      human_id: human,
      basis: 'pr_approver',
      confidence: 'correlated',
      detail: `change record for ${actor.raw_principal} was approved by ${human} (${population(graph, hr, human)})`,
    };
  },
};

/**
 * The principal that acted is itself a human account.
 *
 * The common case in this dataset, and in any estate whose provider exposes a
 * creator as an object field rather than an event (§3.2). `correlated` rather than
 * `attested` because a principal string carries no session context: it cannot
 * distinguish this person clicking from something acting under their credential.
 */
const actingHumanResolver: HumanResolver = {
  id: 'acting_principal_is_human',
  resolve({ actor, graph, hr }) {
    if (actor.kind !== 'human') {
      return null;
    }
    const human = actor.raw_principal;
    return {
      human_id: human,
      basis: 'acting_principal_is_human',
      confidence: 'correlated',
      detail:
        `the principal that performed this create is the human account ${human} ` +
        `(${population(graph, hr, human)}); no session context was recorded to confirm they acted themselves`,
    };
  },
};

/**
 * Our own join: the role that acted was itself provisioned by somebody.
 *
 * Last, and `inferred`, and this is the resolver research §4.1 calls the weakest.
 * It is also the one that quietly does damage if trusted: it attributes every
 * Terraform-provisioned identity to whoever created `terraform-ci`, which is a
 * bootstrap admin from years ago who authorised none of it. Kept because an
 * inferred name with the label on it beats "no accountable human" across a whole
 * estate, and dropped the moment a real attestation exists — which list order
 * guarantees.
 *
 * Uses `traceAccountability` rather than a fresh walk: this is F4's question asked
 * about the issuer, and two implementations of it would eventually disagree with
 * each other on the same dataset in the same demo.
 */
const roleAssumptionResolver: HumanResolver = {
  id: 'role_assumption_correlation',
  resolve({ actor, graph, policy }) {
    const subject = actor.issuer ?? actor.raw_principal;
    const start = graph.byId.get(subject);
    if (start === undefined) {
      return null;
    }
    const trace = traceAccountability(graph, start, policy);
    if (trace.termination !== 'resolved_human') {
      return null;
    }
    return {
      human_id: trace.root_human,
      basis: 'role_assumption_correlation',
      confidence: 'inferred',
      detail:
        `no human is attested on this create; ${subject} traces back to ${trace.root_human} ` +
        `in ${trace.chain.length - 1} provisioning hop(s), which is our inference and not the provider's record`,
    };
  },
};

/**
 * Precedence: attested, then correlated, then inferred — research §4.1.
 *
 * The ordering is the whole safety property. An attested human can never lose to an
 * inferred one, which is what stops a confident-looking wrong name from reaching a
 * queue that people act on.
 */
export const DEFAULT_HUMAN_RESOLVERS: readonly HumanResolver[] = Object.freeze([
  attestedFieldResolver,
  pipelineTriggerResolver,
  reviewApproverResolver,
  actingHumanResolver,
  roleAssumptionResolver,
]);

export function resolveAuthorizingHuman(
  context: HumanResolutionContext,
  resolvers: readonly HumanResolver[] = DEFAULT_HUMAN_RESOLVERS,
): AuthorizingHuman | null {
  for (const resolver of resolvers) {
    const human = resolver.resolve(context);
    if (human !== null) {
      return human;
    }
  }
  return null;
}
