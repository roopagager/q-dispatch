// ============================================================================
// Q-Dispatch — Stage 1: AI pre-audit route
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  getClaim,
  getBillItems,
  updateBillItemAudit,
  updateClaimStatus,
  updateClaimDocuments,
  getClaimDocuments,
  addAuditLog,
} from '../db';
import { auditBill } from '../ai';
import { evaluateDocuments } from '../documents';
import { AuditResponse } from '../types';

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

  // If the clerk submitted an updated document checklist, persist it first so
  // attaching a missing document and re-auditing reflects the change.
  const bodyDocs = (req.body ?? {}).documents;
  if (Array.isArray(bodyDocs)) {
    updateClaimDocuments(claim.id, bodyDocs.map((x: unknown) => String(x)));
  }
  const attachedDocs = Array.isArray(bodyDocs)
    ? bodyDocs.map((x: unknown) => String(x))
    : getClaimDocuments(claim);

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

    // Deterministic document-completeness check (the "agent catches missing
    // documents before submission" feature).
    const docCheck = evaluateDocuments(items, attachedDocs);

    const response: AuditResponse = {
      ...result,
      documents: docCheck.documents,
      missing_required: docCheck.missing_required,
      docs_complete: docCheck.complete,
    };

    updateClaimStatus(claim.id, 'AUDITED');
    addAuditLog(claim.id, 'AUDIT', response);

    res.json(response);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'AI audit failed',
    });
  }
});

export default router;
