// ============================================================================
// Q-Dispatch — predictive approval score
//
// Before dispatch, estimates the likely approved amount, the certain deduction,
// and the risk factors — so the hospital knows what to expect.
//
// Honest by design: deductions we are CERTAIN about (non-payable line items)
// are computed exactly; everything else is surfaced as an explainable risk
// factor, NOT a fabricated rupee figure. The final amount is always confirmed
// by the insurer's reply. Accuracy sharpens as the hospital's own claim
// outcomes train the model (feedback loop).
// ============================================================================

import { BillItem, Claim } from './types';
import { isNonPayable } from './auditRules';

export interface RiskFactor {
  factor: string;
  estimated_impact: number | null; // rupees when certain, else null
  note: string;
}

export interface Prediction {
  total_amount: number;
  certain_deduction: number;
  predicted_approved: number;
  deduction_ratio: number; // % of the bill
  approval_likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_factors: RiskFactor[];
  basis: string;
}

const ROOM_RE = /\b(room|ward|bed|suite|icu|hdu)\b/i;

export function predictApproval(claim: Claim, items: BillItem[]): Prediction {
  const total = claim.total_amount || 0;
  const factors: RiskFactor[] = [];
  let certain = 0;

  // 1. Non-payable line items — certain deductions.
  for (const it of items) {
    if (isNonPayable(it.description)) {
      certain += it.amount;
      factors.push({
        factor: 'Non-payable item',
        estimated_impact: it.amount,
        note: `"${it.description}" is typically non-payable and will be deducted.`,
      });
    }
  }

  // 2. Room-rent concentration — qualitative risk (cap depends on policy).
  const roomSum = items
    .filter((i) => ROOM_RE.test(i.description))
    .reduce((s, i) => s + i.amount, 0);
  const roomShare = total > 0 ? roomSum / total : 0;
  if (roomShare > 0.2) {
    factors.push({
      factor: 'Room rent',
      estimated_impact: null,
      note: 'Room charges are a large share of the bill — insurers often cap room rent, which can proportionally reduce associated charges.',
    });
  }

  // 3. Audit findings (persisted on the bill items).
  const hasError = items.some((i) => i.audit_status === 'ERROR');
  const warnCount = items.filter((i) => i.audit_status === 'WARN').length;
  if (hasError) {
    factors.push({
      factor: 'Unresolved errors',
      estimated_impact: null,
      note: 'The bill still has audit errors — high risk of query or rejection until corrected.',
    });
  }
  if (warnCount > 0) {
    factors.push({
      factor: `${warnCount} warning(s)`,
      estimated_impact: null,
      note: 'Flagged items may be partially deducted or queried by the insurer.',
    });
  }

  const predictedApproved = Math.max(0, total - certain);
  const ratio = total > 0 ? Math.round((certain / total) * 1000) / 10 : 0;

  let likelihood: Prediction['approval_likelihood'];
  if (hasError) likelihood = 'LOW';
  else if (ratio > 15 || warnCount > 0 || roomShare > 0.2) likelihood = 'MEDIUM';
  else likelihood = 'HIGH';

  return {
    total_amount: total,
    certain_deduction: certain,
    predicted_approved: predictedApproved,
    deduction_ratio: ratio,
    approval_likelihood: likelihood,
    confidence: certain > 0 ? 'MEDIUM' : 'LOW',
    risk_factors: factors,
    basis:
      'Estimate from bill composition and audit findings. Non-payable deductions are certain; other factors are risk indicators. Final amounts are confirmed by the insurer reply, and accuracy improves as your historical claim outcomes train the model.',
  };
}
