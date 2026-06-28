// ============================================================================
// Q-Dispatch — claim CRUD routes
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  createClaim,
  getClaim,
  getBillItems,
  listClaims,
  getAuditLogs,
  INSURERS,
} from '../db';
import { NewBillItemInput, NewClaimInput } from '../types';

const router = Router();

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function parseItems(raw: unknown): NewBillItemInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: NewBillItemInput[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) return null;
    const obj = r as Record<string, unknown>;
    const description = String(obj.description ?? '').trim();
    const amount = Number(obj.amount);
    if (!description) return null;
    if (!Number.isFinite(amount)) return null;
    items.push({
      description,
      procedure_code:
        obj.procedure_code != null && String(obj.procedure_code).trim() !== ''
          ? String(obj.procedure_code).trim()
          : null,
      quantity:
        obj.quantity != null && obj.quantity !== '' && Number.isFinite(Number(obj.quantity))
          ? Number(obj.quantity)
          : null,
      unit:
        obj.unit != null && String(obj.unit).trim() !== ''
          ? String(obj.unit).trim()
          : null,
      amount,
    });
  }
  return items;
}

// POST /api/claims
router.post('/', (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>;

  const patient_name = String(b.patient_name ?? '').trim();
  const policy_number = String(b.policy_number ?? '').trim();
  const insurer = String(b.insurer ?? '').trim();
  const icd_code = String(b.icd_code ?? '').trim();
  const diagnosis = String(b.diagnosis ?? '').trim();
  const doctor_name = String(b.doctor_name ?? '').trim();
  const admission_date = String(b.admission_date ?? '').trim();
  const discharge_date = String(b.discharge_date ?? '').trim();

  if (!patient_name) return badRequest(res, 'patient_name is required');
  if (!policy_number) return badRequest(res, 'policy_number is required');
  if (!insurer || !(insurer in INSURERS)) {
    return badRequest(
      res,
      `insurer must be one of: ${Object.keys(INSURERS).join(', ')}`
    );
  }
  if (!icd_code) return badRequest(res, 'icd_code is required');
  if (!diagnosis) return badRequest(res, 'diagnosis is required');
  if (!doctor_name) return badRequest(res, 'doctor_name is required');
  if (!admission_date) return badRequest(res, 'admission_date is required');
  if (!discharge_date) return badRequest(res, 'discharge_date is required');

  const items = parseItems(b.items);
  if (!items) {
    return badRequest(res, 'items must be a non-empty array of valid bill items');
  }

  const computedTotal = items.reduce((sum, i) => sum + i.amount, 0);
  const providedTotal = Number(b.total_amount);
  const total_amount = Number.isFinite(providedTotal)
    ? providedTotal
    : computedTotal;

  const input: NewClaimInput = {
    patient_name,
    patient_dob:
      b.patient_dob != null && String(b.patient_dob).trim() !== ''
        ? String(b.patient_dob).trim()
        : null,
    policy_number,
    insurer,
    icd_code,
    diagnosis,
    doctor_name,
    admission_date,
    discharge_date,
    total_amount,
    items,
  };

  try {
    const claim = createClaim(input);
    const claimItems = getBillItems(claim.id);
    res.status(201).json({ ...claim, items: claimItems });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to create claim',
    });
  }
});

// GET /api/claims
router.get('/', (_req: Request, res: Response) => {
  res.json(listClaims());
});

// GET /api/claims/:id
router.get('/:id', (req: Request, res: Response) => {
  const claim = getClaim(req.params.id);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }
  res.json({
    ...claim,
    items: getBillItems(claim.id),
    audit_logs: getAuditLogs(claim.id),
  });
});

export default router;
