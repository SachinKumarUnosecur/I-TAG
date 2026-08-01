/**
 * Access Reviews vocabulary — `docs/PRD-access-reviews.md` §3–§5.
 *
 * Campaign membership and decisions are owned here. Grants, owner, and risk
 * context are quoted from Access / Ownership / Risk — never recomputed, and
 * never sourced from Threat Profile.
 */

import type { AccessPathType } from './access.js';
import type { IdentityType } from './types.js';
import type { RiskFindingLevel } from './risk.js';

export type ReviewDecision = 'pending' | 'approved' | 'revoked' | 'escalated';

export type ReviewCampaignStatus = 'in_progress' | 'closed';

export type ReviewExportFramework = 'soc2' | 'iso27001';

export interface ReviewCampaign {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly reviewer: string;
  readonly reviewers: readonly string[];
  readonly dueDate: string;
  readonly status: ReviewCampaignStatus;
}

export interface ReviewCampaignRow extends ReviewCampaign {
  readonly totalItems: number;
  readonly approvedItems: number;
  readonly revokedItems: number;
  readonly pendingItems: number;
  readonly escalatedItems: number;
  readonly completionPct: number;
}

/**
 * Display band for the existing SeverityBadge — mapped from Risk `worst_level`,
 * never from an invented composite score (`PRD` §7).
 */
export type ReviewRiskBand =
  | 'Critical'
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Desirable';

/** One quoted grant for the assignment drawer. */
export interface ReviewAssignment {
  readonly id: string;
  readonly identityId: string;
  readonly identityName: string;
  readonly resource: string;
  /** UI AccessBadge labels: Direct | Indirect | Shadow. */
  readonly accessType: 'Direct' | 'Indirect' | 'Shadow';
  readonly pathType: AccessPathType;
  readonly hopCount: number;
  readonly mechanism: string | null;
  readonly cloudProvider: string | null;
  readonly connector: string;
  readonly permissions: readonly string[];
  readonly resourceSensitivity: 'critical' | 'high' | 'medium' | 'low' | null;
  readonly lastConfirmed: string | null;
  readonly shadowAdmin: boolean;
}

export interface ReviewItem {
  readonly id: string;
  readonly campaignId: string;
  readonly identityId: string;
  readonly identityName: string;
  /** UI TypeChip: human | service. */
  readonly type: 'human' | 'service';
  readonly identityType: IdentityType;
  readonly status: string;
  readonly resource: string | null;
  readonly accessType: 'Direct' | 'Indirect' | 'Shadow' | null;
  /**
   * Quoted `factors_firing` when findings exist, else 0 — a count of risk findings,
   * not a weighted 0–100 score (`PRD` §3.1, §7).
   */
  readonly riskScore: number;
  readonly riskBand: ReviewRiskBand;
  readonly worstLevel: RiskFindingLevel | null;
  readonly owner: string | null;
  readonly decision: ReviewDecision;
  readonly shadowAdmin: boolean;
  readonly connectors: readonly string[];
  readonly grantCount: number;
  readonly permissionCount: number;
  readonly app: string | null;
}

export interface ReviewSummary {
  readonly pending: number;
  readonly approved: number;
  readonly revoked: number;
  readonly escalated: number;
  readonly identityCount: number;
  readonly grantCount: number;
}

export interface ReviewDecisionRecord {
  readonly item_id: string;
  readonly identity_id: string;
  readonly decision: Exclude<ReviewDecision, 'pending'>;
  readonly actor: string;
  readonly justification: string;
  readonly at: string;
}

export interface ReviewAssignmentDetail {
  readonly identityId: string;
  readonly identityName: string;
  readonly type: 'human' | 'service';
  readonly status: string;
  readonly owner: string | null;
  readonly riskScore: number;
  readonly riskBand: ReviewRiskBand;
  readonly connectors: readonly string[];
  readonly assignments: readonly ReviewAssignment[];
  readonly grantCount: number;
  readonly permissionCount: number;
}

export interface ReviewItemProfile {
  readonly item: ReviewItem;
  readonly detail: ReviewAssignmentDetail;
}

export interface ReviewQuery {
  readonly campaignId?: string;
  readonly decision?: ReviewDecision | 'all';
  readonly search?: string;
  readonly connector?: string;
}

export interface ReviewDecisionRequest {
  readonly action: 'approve' | 'revoke' | 'escalate';
  readonly actor: string;
  readonly justification: string;
}

export type ReviewDecisionOutcome =
  | { readonly ok: true; readonly item: ReviewItem; readonly record: ReviewDecisionRecord }
  | {
      readonly ok: false;
      readonly error: 'unknown_item' | 'missing_field' | 'not_pending';
      readonly item_id: string;
    };

export type ReviewProfileOutcome =
  | { readonly ok: true; readonly profile: ReviewItemProfile }
  | { readonly ok: false; readonly error: 'unknown_item'; readonly item_id: string };
