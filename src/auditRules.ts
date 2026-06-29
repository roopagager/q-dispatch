// ============================================================================
// Q-Dispatch — deterministic audit rules
//
// Exact, code-based checks (no AI) for the rules that should never be a
// judgment call: invalid amounts, truncated/missing codes, consumables without
// quantity, and known non-payable items. The AI is reserved purely for the one
// judgment call (is the description vague?). This split raises precision (the AI
// can't false-flag a valid amount/code) and keeps recall exact on these rules.
// ============================================================================

import { AuditItemStatus, BillItem } from './types';

const CONSUMABLE =
  /\b(gloves?|syringes?|drapes?|bandages?|catheters?|gauze|cannulae?|cannula|dressings?)\b/i;

const NON_PAYABLE =
  /\b(attendant|telephone|phone\s*call|food|beverage|meals?|laundry|newspaper|visitor|toiletr|tv\s*charge)\b/i;

export interface DetFinding {
  status: AuditItemStatus;
  note: string;
}

const severity = (s: AuditItemStatus): number =>
  s === 'ERROR' ? 2 : s === 'WARN' ? 1 : 0;

type ItemInput = Pick<
  BillItem,
  'line_number' | 'description' | 'procedure_code' | 'quantity' | 'amount'
>;

/**
 * Returns the most-severe deterministic finding per line (or no entry if clean
 * by the deterministic rules). Notes from multiple matched rules are combined.
 */
export function deterministicFindings(
  items: ItemInput[]
): Map<number, DetFinding> {
  const out = new Map<number, DetFinding>();

  for (const it of items) {
    const findings: DetFinding[] = [];
    const desc = it.description || '';

    // Rule 5 — amount must be a positive number.
    if (!(typeof it.amount === 'number' && it.amount > 0)) {
      findings.push({
        status: 'ERROR',
        note: `Amount (${it.amount}) is not a positive value.`,
      });
    }

    // Rules 3 & 4 — procedure code missing (WARN) or truncated (ERROR).
    const code = (it.procedure_code || '').trim();
    if (code === '') {
      findings.push({ status: 'WARN', note: 'Procedure code is missing.' });
    } else if (code.replace(/\s+/g, '').length < 4) {
      findings.push({
        status: 'ERROR',
        note: `Procedure code '${code}' appears truncated (fewer than 4 characters).`,
      });
    }

    // Rule 2 — consumable item without a quantity.
    if (CONSUMABLE.test(desc) && it.quantity == null) {
      findings.push({
        status: 'WARN',
        note: 'Consumable item listed without a quantity.',
      });
    }

    // Rule 6 — known non-payable item.
    if (NON_PAYABLE.test(desc)) {
      findings.push({
        status: 'WARN',
        note: 'Item is commonly non-payable under insurance policies.',
      });
    }

    if (findings.length) {
      findings.sort((a, b) => severity(b.status) - severity(a.status));
      out.set(it.line_number, {
        status: findings[0].status,
        note: findings.map((f) => f.note).join(' '),
      });
    }
  }

  return out;
}

export function isNonPayable(description: string): boolean {
  return NON_PAYABLE.test(description || '');
}

export function isConsumable(description: string): boolean {
  return CONSUMABLE.test(description || '');
}

export { severity };
