// ============================================================================
// Q-Dispatch — predictive approval score route
// ============================================================================

import { Router, Request, Response } from 'express';
import { getClaim, getBillItems } from '../db';
import { predictApproval } from '../predict';

const router = Router();

// POST /api/predict/:claimId
router.post('/predict/:claimId', (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }
  const items = getBillItems(claim.id);
  res.json(predictApproval(claim, items));
});

export default router;
