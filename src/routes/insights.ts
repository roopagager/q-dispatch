// ============================================================================
// Q-Dispatch — audit insights route (staff data-entry quality)
// ============================================================================

import { Router, Request, Response } from 'express';
import { auditInsights } from '../db';

const router = Router();

// GET /api/insights
router.get('/', (_req: Request, res: Response) => {
  res.json(auditInsights());
});

export default router;
