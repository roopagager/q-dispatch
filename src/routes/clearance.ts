// ============================================================================
// Q-Dispatch — Stage 4: automated counter clearance route
//
// CRITICAL: the Quantum AI 0.5% service fee is a HOSPITAL charge. It is never
// added to the patient copay and never shown to the patient as owed. It is
// deducted from the insurer reimbursement and logged to the monthly invoice.
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  getClaim,
  addLedgerEntry,
  setClaimCleared,
  addAuditLog,
  upsertMonthlyInvoice,
} from '../db';

const router = Router();

const FEE_RATE = (() => {
  const r = Number(process.env.QAI_FEE_RATE);
  return Number.isFinite(r) && r > 0 ? r : 0.005;
})();

function currentInvoiceMonth(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatINR(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// POST /api/clear/:claimId
router.post('/clear/:claimId', (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  if (claim.status !== 'REPLIED') {
    res.status(409).json({
      error: `Claim must be REPLIED to clear (current: ${claim.status})`,
    });
    return;
  }

  if (claim.tpa_decision === 'REJECTED' || claim.tpa_decision === 'MORE_INFO') {
    res.status(422).json({
      error: `Cannot clear a ${claim.tpa_decision} claim`,
    });
    return;
  }

  const approvedAmount = Number(claim.approved_amount ?? 0);
  if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) {
    res.status(422).json({
      error: 'Claim has no valid approved amount to clear against',
    });
    return;
  }

  const totalAmount = claim.total_amount;
  const copay = Math.max(0, totalAmount - approvedAmount);
  const qaiFee = Math.round(approvedAmount * FEE_RATE * 100) / 100;
  const invoiceMonth = currentInvoiceMonth();
  const feePct = `${(FEE_RATE * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
  const feeBasis = `${feePct} of ₹${formatINR(approvedAmount)} approved`;
  const clearedAt = new Date().toISOString();

  try {
    // Hospital-charged service fee — logged for the monthly invoice only.
    addLedgerEntry({
      claim_id: claim.id,
      txn_type: 'QAI_SERVICE_FEE',
      amount: qaiFee,
      fee_basis: feeBasis,
      reference: claim.approval_ref,
      invoiced: 0,
      invoice_month: invoiceMonth,
    });

    // Money the insurer reimburses to the hospital.
    addLedgerEntry({
      claim_id: claim.id,
      txn_type: 'INSURER_PAYMENT',
      amount: approvedAmount,
      reference: claim.approval_ref,
    });

    // What the patient pays at the counter.
    addLedgerEntry({
      claim_id: claim.id,
      txn_type: 'COPAY',
      amount: copay,
      reference: claim.approval_ref,
    });

    setClaimCleared(claim.id, copay, clearedAt);
    upsertMonthlyInvoice(invoiceMonth);

    addAuditLog(claim.id, 'CLEARANCE', {
      total_amount: totalAmount,
      approved_amount: approvedAmount,
      copay_amount: copay,
      qai_fee: qaiFee,
      fee_basis: feeBasis,
      invoice_month: invoiceMonth,
      cleared_at: clearedAt,
    });

    res.json({
      copay_amount: copay,
      approved_amount: approvedAmount,
      qai_fee: qaiFee,
      total_amount: totalAmount,
      approval_ref: claim.approval_ref,
      invoice_month: invoiceMonth,
      fee_note: `₹${formatINR(qaiFee)} service fee logged to your monthly invoice`,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Clearance failed',
    });
  }
});

export default router;
