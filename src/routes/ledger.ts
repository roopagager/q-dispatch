// ============================================================================
// Q-Dispatch — ledger & monthly-invoice reporting routes
// ============================================================================

import { Router, Request, Response } from 'express';
import { listLedger, ledgerSummary, listMonthlyInvoices } from '../db';

const router = Router();

function currentMonth(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// GET /api/ledger
router.get('/', (_req: Request, res: Response) => {
  res.json(listLedger());
});

// GET /api/ledger/summary
router.get('/summary', (_req: Request, res: Response) => {
  res.json(ledgerSummary(currentMonth()));
});

// GET /api/ledger/invoices
router.get('/invoices', (_req: Request, res: Response) => {
  res.json(listMonthlyInvoices());
});

export default router;
