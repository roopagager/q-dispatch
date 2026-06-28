// ============================================================================
// Q-Dispatch — Stage 2: instant claim dispatch route
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  getClaim,
  getBillItems,
  hasErrorItems,
  setClaimDispatched,
  addAuditLog,
} from '../db';
import { generateToken } from '../token';
import { dispatchClaim } from '../mailer';

const router = Router();

// POST /api/dispatch/:claimId
router.post('/dispatch/:claimId', async (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  if (claim.status === 'DISPATCHED' || claim.status === 'REPLIED' || claim.status === 'CLEARED') {
    res.status(409).json({ error: `Claim already ${claim.status.toLowerCase()}` });
    return;
  }

  if (hasErrorItems(claim.id)) {
    res.status(422).json({
      error:
        'Dispatch blocked — one or more bill items have audit errors. Fix them and re-audit before dispatch.',
    });
    return;
  }

  const items = getBillItems(claim.id);
  const token = generateToken(claim.insurer_code, claim.icd_code);

  try {
    const { dispatchEmail } = await dispatchClaim(claim, items, token);
    const dispatchedAt = new Date().toISOString();

    setClaimDispatched(claim.id, token, dispatchEmail, dispatchedAt);
    addAuditLog(claim.id, 'DISPATCH', {
      token,
      dispatch_email: dispatchEmail,
      dispatched_at: dispatchedAt,
      item_count: items.length,
      total_amount: claim.total_amount,
    });

    res.json({
      token,
      dispatched_at: dispatchedAt,
      dispatch_email: dispatchEmail,
    });
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error
          ? `Dispatch email failed: ${err.message}`
          : 'Dispatch email failed',
    });
  }
});

export default router;
