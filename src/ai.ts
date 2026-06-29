// ============================================================================
// Q-Dispatch — Anthropic Claude integration
// Model: claude-sonnet-4-6 | max_tokens: 1500
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import {
  Claim,
  BillItem,
  AuditResult,
  TPAParseResult,
  AuditItemStatus,
  TPADecision,
} from './types';
import { deterministicFindings, severity } from './auditRules';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;

// Lazily construct the client so a missing key never crashes the server at
// boot, and the failure surfaces as a clear, actionable error at call time.
let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to your environment (.env for local dev, or Railway variables in production) to enable AI audit and reply parsing.'
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Pull the first text block out of a Claude message response.
 */
function extractText(message: Anthropic.Messages.Message): string {
  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      parts.push(block.text);
    }
  }
  return parts.join('\n').trim();
}

/**
 * Extract a JSON object/array from a model response that may (despite
 * instructions) include stray prose or markdown fences.
 */
function extractJson<T>(raw: string): T {
  let text = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Fall back to the first {...} or [...] span.
    const objStart = text.indexOf('{');
    const arrStart = text.indexOf('[');
    let start = -1;
    let openCh = '{';
    let closeCh = '}';
    if (objStart === -1 && arrStart === -1) {
      throw new Error('No JSON found in model response');
    }
    if (
      arrStart !== -1 &&
      (objStart === -1 || arrStart < objStart)
    ) {
      start = arrStart;
      openCh = '[';
      closeCh = ']';
    } else {
      start = objStart;
    }
    const end = text.lastIndexOf(closeCh);
    if (end <= start) {
      throw new Error('Malformed JSON in model response');
    }
    void openCh;
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
}

async function createMessage(
  system: string,
  userContent: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0, // deterministic, repeatable audits
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  return extractText(message);
}

// ----------------------------------------------------------------------------
// FUNCTION 1 — auditBill
// ----------------------------------------------------------------------------

// The AI is reserved for the ONE judgment call — is the description vague?
// All exact rules (amount, code, quantity, non-payable) run deterministically
// in ./auditRules, which removes the AI's false-positive surface and keeps
// recall exact on those rules.
const VAGUE_SYSTEM = `You are a senior medical billing auditor. For each bill line, decide ONLY one thing: is the DESCRIPTION too vague or generic to identify what was actually provided?

Mark vague = true ONLY for generic catch-all terms that carry no specific drug name, dose, procedure, or detail — for example: "Medicine", "Drugs", "Consumables", "Surgical Kit", "Injection", "Charges", "Sundry", "Miscellaneous", "Disposables".

Mark vague = false for anything specific, even if short. Named procedures and surgeries, named investigations / scans / lab panels, named drugs (with or without strength), named rooms, anaesthesia, consultations, nursing, and oxygen/IV-fluid lines are all SPECIFIC and acceptable — never flag them.

Return ONLY valid JSON: {"items":[{"line_number": number, "vague": boolean, "note": string}]}.
"note" is a short reason ONLY when vague=true, otherwise an empty string. Include every line exactly once. No prose, no markdown.`;

async function aiVagueCheck(
  items: BillItem[]
): Promise<Map<number, { vague: boolean; note: string }>> {
  // De-identified: we send only line numbers + descriptions, no patient data.
  const userContent = JSON.stringify({
    items: items.map((i) => ({
      line_number: i.line_number,
      description: i.description,
    })),
  });

  const result = new Map<number, { vague: boolean; note: string }>();
  for (const it of items) result.set(it.line_number, { vague: false, note: '' });

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await createMessage(VAGUE_SYSTEM, userContent);
      const parsed = extractJson<{
        items?: Array<{ line_number: number; vague: boolean; note?: string }>;
      }>(raw);
      for (const p of parsed.items ?? []) {
        const ln = Number(p.line_number);
        if (result.has(ln)) {
          result.set(ln, {
            vague: p.vague === true,
            note: typeof p.note === 'string' ? p.note : '',
          });
        }
      }
      return result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `auditBill failed after retry: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

export async function auditBill(
  claim: Claim,
  items: BillItem[]
): Promise<AuditResult> {
  void claim; // claim context not needed for the de-identified line audit
  // Deterministic rules (exact) + AI vague-check (judgment), merged per line.
  const det = deterministicFindings(items);
  const vague = await aiVagueCheck(items);

  const resultItems = items.map((item) => {
    const notes: string[] = [];
    let status: AuditItemStatus = 'OK';

    const v = vague.get(item.line_number);
    if (v?.vague) {
      status = 'ERROR';
      notes.push(
        v.note ||
          "Description is too vague to identify what was provided (add drug name / dose / specifics)."
      );
    }

    const d = det.get(item.line_number);
    if (d) {
      if (severity(d.status) > severity(status)) status = d.status;
      notes.push(d.note);
    }

    return {
      line_number: item.line_number,
      status,
      note: notes.filter(Boolean).join(' '),
    };
  });

  const errorCount = resultItems.filter((i) => i.status === 'ERROR').length;
  const issueCount = resultItems.filter((i) => i.status !== 'OK').length;

  return {
    passed: errorCount === 0,
    issue_count: issueCount,
    items: resultItems,
    summary:
      errorCount > 0
        ? `${errorCount} blocking error(s) found. Resolve before dispatch.`
        : issueCount > 0
          ? `${issueCount} warning(s) found. Review before dispatch.`
          : 'All line items validated successfully.',
  };
}

// ----------------------------------------------------------------------------
// FUNCTION 2 — parseTPAReply
// ----------------------------------------------------------------------------

const TPA_SYSTEM = `You are a TPA claims analyst at an Indian hospital.
Read this insurance company reply email and extract the claim decision.
Look for: approval/rejection decision, authorisation reference number, approved rupee amount, deducted rupee amount, reasons for any deductions, and any documents being requested.
Return ONLY valid JSON matching this schema:
{
  "decision": "APPROVED" | "PARTIAL" | "REJECTED" | "MORE_INFO",
  "approval_ref": string | null,
  "approved_amount": number | null,      // rupees, numeric only, no symbols or commas
  "deduction_amount": number | null,     // rupees, numeric only, no symbols or commas
  "deduction_reasons": string[],
  "documents_requested": string[],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}
No prose, no markdown.`;

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[₹$,\s]/g, '');
    if (cleaned === '') return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => String(x)).filter((s) => s.trim() !== '');
  }
  if (typeof v === 'string' && v.trim() !== '') {
    return [v.trim()];
  }
  return [];
}

function normaliseTPAResult(parsed: Partial<TPAParseResult>): TPAParseResult {
  const validDecisions: TPADecision[] = [
    'APPROVED',
    'PARTIAL',
    'REJECTED',
    'MORE_INFO',
  ];
  const decision = validDecisions.includes(parsed.decision as TPADecision)
    ? (parsed.decision as TPADecision)
    : 'MORE_INFO';

  const validConfidence = ['HIGH', 'MEDIUM', 'LOW'] as const;
  const confidence = validConfidence.includes(
    parsed.confidence as (typeof validConfidence)[number]
  )
    ? (parsed.confidence as TPAParseResult['confidence'])
    : 'LOW';

  return {
    decision,
    approval_ref:
      typeof parsed.approval_ref === 'string' && parsed.approval_ref.trim()
        ? parsed.approval_ref.trim()
        : null,
    approved_amount: toNumberOrNull(parsed.approved_amount),
    deduction_amount: toNumberOrNull(parsed.deduction_amount),
    deduction_reasons: toStringArray(parsed.deduction_reasons),
    documents_requested: toStringArray(parsed.documents_requested),
    confidence,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Redact known patient identifiers (name, policy number) from text before it is
 * sent to the external AI. The reply parser only needs the decision and amounts,
 * not the patient's identity.
 */
export function redactIdentifiers(text: string, terms: string[]): string {
  let out = text;
  for (const term of terms) {
    const t = (term || '').trim();
    if (t.length < 3) continue; // don't redact trivially short strings
    out = out.replace(new RegExp(escapeRegExp(t), 'gi'), '[REDACTED]');
  }
  return out;
}

export async function parseTPAReply(
  emailBody: string,
  trackingToken: string,
  redactTerms: string[] = []
): Promise<TPAParseResult> {
  const safeBody = redactIdentifiers(emailBody, redactTerms);
  const userContent = `Tracking token: ${trackingToken}\n\nEmail body:\n${safeBody}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await createMessage(TPA_SYSTEM, userContent);
      const parsed = extractJson<Partial<TPAParseResult>>(raw);
      return normaliseTPAResult(parsed);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `parseTPAReply failed after retry: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}
