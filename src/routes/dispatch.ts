// ============================================================================
// Q-Dispatch — Stage 2: instant claim dispatch route
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  getClaim,
  getBillItems,
  hasErrorItems,
  getClaimDocuments,
  setClaimDispatched,
  addAuditLog,
} from '../db';
import { generateToken } from '../token';
import { dispatchClaim } from '../mailer';
import { evaluateDocuments } from '../documents';
import { buildNhcxClaimBundle, postToNhcx, isNhcxEnabled } from '../nhcx';

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

  // Block dispatch until all required supporting documents are attached.
  const docCheck = evaluateDocuments(items, getClaimDocuments(claim));
  if (!docCheck.complete) {
    res.status(422).json({
      error: `Dispatch blocked — missing required documents: ${docCheck.missing_required.join(
        ', '
      )}. Attach them and re-audit before dispatch.`,
      missing_required: docCheck.missing_required,
    });
    return;
  }

  const token = generateToken(claim.insurer_code, claim.icd_code);
  const dispatchedAt = new Date().toISOString();

  // Generate the NHCX-compatible FHIR R4 claim bundle (always — this proves
  // NHCX-readiness and is the payload the gateway will carry).
  const bundle = buildNhcxClaimBundle(
    { ...claim, tracking_token: token, dispatched_at: dispatchedAt },
    items
  );

  try {
    let channel: string;
    let target: string;

    if (isNhcxEnabled()) {
      // NHCX gateway transport (active once ABDM onboarding is configured).
      const result = await postToNhcx(
        bundle,
        process.env.NHCX_ENDPOINT as string,
        process.env.NHCX_API_KEY
      );
      if (result.status >= 200 && result.status < 300) {
        channel = 'NHCX';
        target = process.env.NHCX_ENDPOINT as string;
      } else {
        // Gateway error → multi-channel fallback to email.
        const { dispatchEmail } = await dispatchClaim(claim, items, token);
        channel = 'EMAIL (NHCX fallback)';
        target = dispatchEmail;
      }
    } else {
      const { dispatchEmail } = await dispatchClaim(claim, items, token);
      channel = 'EMAIL';
      target = dispatchEmail;
    }

    setClaimDispatched(claim.id, token, target, dispatchedAt);
    addAuditLog(claim.id, 'DISPATCH', {
      token,
      channel,
      dispatch_target: target,
      dispatched_at: dispatchedAt,
      item_count: items.length,
      total_amount: claim.total_amount,
      fhir_profile: bundle.meta.profile[0],
      nhcx_bundle_generated: true,
    });

    res.json({
      token,
      dispatched_at: dispatchedAt,
      dispatch_email: target,
      channel,
      nhcx_ready: true,
    });
  } catch (err) {
    res.status(502).json({
      error:
        err instanceof Error
          ? `Dispatch failed: ${err.message}`
          : 'Dispatch failed',
    });
  }
});

export default router;
