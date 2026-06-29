// ============================================================================
// Q-Dispatch — HIS ingestion route (parse an HIS export into a claim draft)
// ============================================================================

import { Router, Request, Response } from 'express';
import { ingestHisExport } from '../hisIngest';

const router = Router();

// POST /api/his/parse  { format: 'fhir' | 'csv', content: string | object }
router.post('/his/parse', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { format?: string; content?: unknown };
  const format = String(body.format || '').toLowerCase();
  if (!format) {
    res.status(400).json({ error: 'format is required ("fhir" or "csv")' });
    return;
  }
  if (body.content === undefined || body.content === null || body.content === '') {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  try {
    const draft = ingestHisExport(format, body.content as string | object);
    res.json(draft);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Failed to parse HIS export',
    });
  }
});

export default router;
