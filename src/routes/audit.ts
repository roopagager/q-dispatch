// ============================================================================
// Q-Dispatch — Stage 1: AI pre-audit route
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  getClaim,
  getBillItems,
  updateBillItemAudit,
  updateClaimStatus,
  addAuditLog,
} from '../db';
import { auditBill } from '../ai';

const router = Router();

// POST /api/audit/:claimId
router.post('/audit/:claimId', async (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  const items = getBillItems(claim.id);
  if (items.length === 0) {
    res.status(400).json({ error: 'Claim has no bill items to audit' });
    return;
  }

  try {
    const result = await auditBill(claim, items);

    // Persist per-item audit status onto the matching bill_item rows.
    const byLine = new Map(result.items.map((i) => [i.line_number, i]));
    for (const item of items) {
      const r = byLine.get(item.line_number);
      if (r) {
        updateBillItemAudit(item.id, r.status, r.note);
      } else {
        updateBillItemAudit(item.id, 'OK', '');
      }
    }

    updateClaimStatus(claim.id, 'AUDITED');
    addAuditLog(claim.id, 'AUDIT', result);

    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'AI audit failed',
    });
  }
});

export default router;
