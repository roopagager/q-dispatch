// ============================================================================
// Q-Dispatch — denial management: draft & send claim appeals
// ============================================================================

import { Router, Request, Response } from 'express';
import { getClaim, getBillItems, addAuditLog } from '../db';
import { draftAppeal } from '../ai';
import { sendAppeal } from '../mailer';

const router = Router();

function appealable(claim: ReturnType<typeof getClaim>): boolean {
  if (!claim) return false;
  if (claim.status !== 'REPLIED') return false;
  return (
    claim.tpa_decision === 'REJECTED' ||
    (typeof claim.deduction_amount === 'number' && claim.deduction_amount > 0)
  );
}

// POST /api/appeal/:claimId — generate an appeal draft
router.post('/appeal/:claimId', async (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }
  if (!appealable(claim)) {
    res.status(422).json({
      error:
        'Nothing to appeal — the claim must be REPLIED with a rejection or a deduction.',
    });
    return;
  }

  try {
    let text = await draftAppeal(claim, getBillItems(claim.id));
    // Fill in real identifiers locally (they were never sent to the AI).
    text = text
      .replace(/\[PATIENT_NAME\]/g, claim.patient_name)
      .replace(/\[POLICY_NO\]/g, claim.policy_number)
      .replace(/\[CLAIM_REF\]/g, claim.tracking_token || '—')
      .replace(/\[APPROVAL_REF\]/g, claim.approval_ref || 'N/A');
    res.json({ draft: text });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to draft appeal',
    });
  }
});

// POST /api/appeal/:claimId/send — email the (reviewed) appeal to the insurer
router.post('/appeal/:claimId/send', async (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }
  const text = String((req.body ?? {}).text ?? '').trim();
  if (!text) {
    res.status(400).json({ error: 'Appeal text is required' });
    return;
  }

  try {
    const { dispatchEmail } = await sendAppeal(claim, text);
    addAuditLog(claim.id, 'DISPATCH', {
      appeal_sent: true,
      to: dispatchEmail,
      at: new Date().toISOString(),
    });
    res.json({ ok: true, sent_to: dispatchEmail });
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error
          ? `Appeal email failed: ${err.message}`
          : 'Appeal email failed',
    });
  }
});

export default router;
