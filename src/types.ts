// ============================================================================
// Q-Dispatch — shared type definitions
// ============================================================================

export type ClaimStatus =
  | 'DRAFT'
  | 'AUDITED'
  | 'DISPATCHED'
  | 'REPLIED'
  | 'CLEARED';

export type TPADecision = 'APPROVED' | 'PARTIAL' | 'REJECTED' | 'MORE_INFO';

export type AuditItemStatus = 'OK' | 'WARN' | 'ERROR';

export type TxnType = 'QAI_SERVICE_FEE' | 'COPAY' | 'INSURER_PAYMENT';

// ----------------------------------------------------------------------------
// Database row shapes
// ----------------------------------------------------------------------------

export interface Claim {
  id: string;
  patient_name: string;
  patient_dob: string | null;
  policy_number: string;
  insurer: string;
  insurer_code: string;
  icd_code: string;
  diagnosis: string;
  doctor_name: string;
  admission_date: string;
  discharge_date: string;
  total_amount: number;
  status: ClaimStatus;
  tracking_token: string | null;
  dispatch_email: string | null;
  dispatched_at: string | null;
  tpa_reply_raw: string | null;
  tpa_decision: TPADecision | null;
  approved_amount: number | null;
  deduction_amount: number | null;
  deduction_reasons: string | null; // JSON array of strings
  documents_requested: string | null; // JSON array of strings
  approval_ref: string | null;
  copay_amount: number | null;
  cleared_at: string | null;
  documents: string | null; // JSON array of attached document keys
  created_at: string;
  updated_at: string;
}

export interface BillItem {
  id: string;
  claim_id: string;
  line_number: number;
  description: string;
  procedure_code: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number;
  audit_status: AuditItemStatus | null;
  audit_note: string | null;
}

export interface AuditLog {
  id: string;
  claim_id: string;
  stage: 'AUDIT' | 'DISPATCH' | 'REPLY' | 'CLEARANCE';
  payload: string; // full JSON of what happened
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  claim_id: string;
  txn_type: TxnType;
  amount: number;
  fee_basis: string | null;
  reference: string | null;
  invoiced: number; // 0 = pending, 1 = on monthly invoice
  invoice_month: string | null; // "2025-06"
  logged_at: string;
}

export interface MonthlyInvoice {
  id: string;
  invoice_month: string;
  total_claims: number;
  total_approved: number;
  fee_total: number;
  status: 'PENDING' | 'SENT' | 'PAID';
  created_at: string;
}

// ----------------------------------------------------------------------------
// AI result shapes
// ----------------------------------------------------------------------------

export interface AuditResult {
  passed: boolean;
  issue_count: number;
  items: Array<{
    line_number: number;
    status: AuditItemStatus;
    note: string;
  }>;
  summary: string;
}

export interface DocumentFinding {
  key: string;
  label: string;
  required: boolean;
  attached: boolean;
  status: 'OK' | 'MISSING' | 'NOT_REQUIRED';
  note: string;
}

/** Full audit response returned by the audit route: AI line-item audit +
 *  deterministic document-completeness check. */
export interface AuditResponse extends AuditResult {
  documents: DocumentFinding[];
  missing_required: string[];
  docs_complete: boolean;
}

export interface TPAParseResult {
  decision: TPADecision;
  approval_ref: string | null;
  approved_amount: number | null;
  deduction_amount: number | null;
  deduction_reasons: string[];
  documents_requested: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

// ----------------------------------------------------------------------------
// API payload shapes
// ----------------------------------------------------------------------------

export interface NewBillItemInput {
  description: string;
  procedure_code?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount: number;
}

export interface NewClaimInput {
  patient_name: string;
  patient_dob?: string | null;
  policy_number: string;
  insurer: string;
  icd_code: string;
  diagnosis: string;
  doctor_name: string;
  admission_date: string;
  discharge_date: string;
  total_amount: number;
  items: NewBillItemInput[];
  documents?: string[]; // attached document keys
}

export interface ClaimWithItems extends Claim {
  items: BillItem[];
}
