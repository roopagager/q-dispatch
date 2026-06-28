// ============================================================================
// Q-Dispatch — document completeness rules
//
// Compliance checks should be deterministic (not AI-guessed), so the required
// document set is derived from fixed rules based on the claim's bill lines.
// The AI handles the messy bill-text audit; this module verifies the paperwork.
// ============================================================================

import { BillItem } from './types';

export interface DocCatalogItem {
  key: string;
  label: string;
}

// The full checklist offered to the clerk in the UI.
export const DOC_CATALOG: DocCatalogItem[] = [
  { key: 'PRE_AUTH', label: 'Pre-authorisation form' },
  { key: 'DISCHARGE', label: 'Discharge summary' },
  { key: 'ITEMISED_BILL', label: 'Itemised hospital bill' },
  { key: 'ID_POLICY', label: 'Patient ID & policy copy' },
  { key: 'PHARMACY_BILL', label: 'Itemised pharmacy bill' },
  { key: 'INVESTIGATION', label: 'Investigation / diagnostic reports' },
  { key: 'OPERATIVE_NOTES', label: 'Operative / procedure notes' },
  { key: 'IMPLANT_INVOICE', label: 'Implant invoice & sticker' },
];

const LABEL_BY_KEY = new Map(DOC_CATALOG.map((d) => [d.key, d.label]));

export interface DocumentFinding {
  key: string;
  label: string;
  required: boolean;
  attached: boolean;
  status: 'OK' | 'MISSING' | 'NOT_REQUIRED';
  note: string;
}

export interface DocumentResult {
  documents: DocumentFinding[];
  missing_required: string[]; // labels of required-but-missing docs
  complete: boolean;
}

/**
 * Determine which documents are required for this claim, based on the bill
 * lines, and compare against what the clerk marked as attached.
 */
export function evaluateDocuments(
  items: Pick<BillItem, 'description' | 'procedure_code' | 'unit'>[],
  attached: string[]
): DocumentResult {
  const attachedSet = new Set(attached);
  const text = items
    .map((i) =>
      `${i.description || ''} ${i.procedure_code || ''} ${i.unit || ''}`.toLowerCase()
    )
    .join(' | ');

  // Always required for any cashless claim.
  const required = new Set<string>([
    'PRE_AUTH',
    'DISCHARGE',
    'ITEMISED_BILL',
    'ID_POLICY',
  ]);

  // Conditionally required, inferred from the bill contents.
  if (/cpt|procedure|surger|ectomy|otomy|plasty|angioplasty|section|appendect|cholecystect/.test(text)) {
    required.add('OPERATIVE_NOTES');
  }
  if (/stent|implant|prosthes|screw|plate|graft|\bdes\b|cannulated/.test(text)) {
    required.add('IMPLANT_INVOICE');
  }
  if (/medicine|drug|pharmac|iv flu|injection|saline|antibiotic|infusion/.test(text)) {
    required.add('PHARMACY_BILL');
  }
  if (/lab|x-ray|xray|ultrasound|\bscan\b|\bct\b|mri|histopath|panel|\btest\b|radiolog|cxr|lft/.test(text)) {
    required.add('INVESTIGATION');
  }

  const documents: DocumentFinding[] = DOC_CATALOG.map((d) => {
    const req = required.has(d.key);
    const att = attachedSet.has(d.key);
    let status: DocumentFinding['status'];
    let note = '';
    if (!req) {
      status = att ? 'OK' : 'NOT_REQUIRED';
    } else if (att) {
      status = 'OK';
    } else {
      status = 'MISSING';
      note = 'Required for this claim but not attached — attach before dispatch.';
    }
    return { key: d.key, label: d.label, required: req, attached: att, status, note };
  });

  const missingRequired = documents
    .filter((d) => d.status === 'MISSING')
    .map((d) => d.label);

  return {
    documents,
    missing_required: missingRequired,
    complete: missingRequired.length === 0,
  };
}

export function docLabel(key: string): string {
  return LABEL_BY_KEY.get(key) || key;
}
