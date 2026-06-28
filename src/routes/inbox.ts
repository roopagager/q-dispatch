// ============================================================================
// Q-Dispatch — Stage 3: simulate-reply route (MVP manual injection)
// Mirrors exactly what the real IMAP poller does when a reply matches.
// ============================================================================

import { Router, Request, Response } from 'express';
import { getClaim } from '../db';
import { applyReplyToClaim } from '../inbox';

const router = Router();

// POST /api/simulate-reply/:claimId
router.post('/simulate-reply/:claimId', async (req: Request, res: Response) => {
  const claim = getClaim(req.params.claimId);
  if (!claim) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  if (claim.status !== 'DISPATCHED' && claim.status !== 'REPLIED') {
    res.status(409).json({
      error: `Claim must be DISPATCHED before a reply can be parsed (current: ${claim.status})`,
    });
    return;
  }

  if (!claim.tracking_token) {
    res.status(409).json({ error: 'Claim has no tracking token' });
    return;
  }

  const emailBody = String((req.body ?? {}).email_body ?? '').trim();
  if (!emailBody) {
    res.status(400).json({ error: 'email_body is required' });
    return;
  }

  try {
    const parsed = await applyReplyToClaim(
      claim.id,
      emailBody,
      claim.tracking_token
    );
    res.json(parsed);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to parse reply',
    });
  }
});

export default router;
