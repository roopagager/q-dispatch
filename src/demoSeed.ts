// ============================================================================
// Q-Dispatch — full demo roster seed (opt-in)
//
// Enabled by setting SEED_DEMO=full. Seeds one claim in every pipeline stage
// and every TPA decision path (PARTIAL / APPROVED+CLEARED / REJECTED /
// MORE_INFO) WITHOUT any live AI / SMTP / IMAP calls — ideal for a hosted
// demo (e.g. Railway) where reviewers should see the whole flow immediately.
//
// Runs only when the claims table is empty, so it never duplicates on restart.
// ============================================================================

import {
  countClaims,
  createClaim,
  getBillItems,
  updateBillItemAudit,
  updateClaimStatus,
  setClaimDispatched,
  setClaimReplied,
  setClaimCleared,
  addAuditLog,
  addLedgerEntry,
  upsertMonthlyInvoice,
} from './db';
import { generateToken } from './token';
import { AuditItemStatus, Claim, NewClaimInput, TPADecision } from './types';

const FEE_RATE = (() => {
  const r = Number(process.env.QAI_FEE_RATE);
  return Number.isFinite(r) && r > 0 ? r : 0.005;
})();

const inr = (n: number) => n.toLocaleString('en-IN');
const monthOf = (iso: string) => iso.slice(0, 7);

function audit(
  claimId: string,
  flags: Record<number, { status: AuditItemStatus; note: string }> = {}
): void {
  const items = getBillItems(claimId);
  const resultItems = items.map((it) => {
    const f = flags[it.line_number] || { status: 'OK' as AuditItemStatus, note: '' };
    updateBillItemAudit(it.id, f.status, f.note);
    return { line_number: it.line_number, status: f.status, note: f.note };
  });
  const errors = resultItems.filter((i) => i.status === 'ERROR').length;
  const issues = resultItems.filter((i) => i.status !== 'OK').length;
  updateClaimStatus(claimId, 'AUDITED');
  addAuditLog(claimId, 'AUDIT', {
    passed: errors === 0,
    issue_count: issues,
    items: resultItems,
    summary:
      errors > 0
        ? `${errors} blocking error(s) detected — these must be corrected before dispatch.`
        : issues > 0
          ? `${issues} warning(s) flagged for review. No blocking errors — cleared for dispatch.`
          : 'All line items validated successfully. The claim is cleared for dispatch.',
  });
}

function dispatch(claim: Claim, email: string, at: string): string {
  const token = generateToken(claim.insurer_code, claim.icd_code, new Date(at));
  setClaimDispatched(claim.id, token, email, at);
  addAuditLog(claim.id, 'DISPATCH', {
    token,
    dispatch_email: email,
    dispatched_at: at,
  });
  return token;
}

function reply(
  claimId: string,
  token: string,
  fields: {
    tpa_reply_raw: string;
    tpa_decision: TPADecision;
    approved_amount: number | null;
    deduction_amount: number | null;
    deduction_reasons: string[];
    documents_requested: string[];
    approval_ref: string | null;
  }
): void {
  setClaimReplied(claimId, fields);
  addAuditLog(claimId, 'REPLY', {
    token,
    parsed: fields,
    received_at: new Date().toISOString(),
  });
}

function clear(claim: Claim, approved: number, ref: string, clearedAt: string): void {
  const copay = Math.max(0, claim.total_amount - approved);
  const fee = Math.round(approved * FEE_RATE * 100) / 100;
  const month = monthOf(clearedAt);
  const feeBasis = `${(FEE_RATE * 100).toFixed(2).replace(/\.?0+$/, '')}% of ₹${inr(approved)} approved`;
  addLedgerEntry({
    claim_id: claim.id,
    txn_type: 'QAI_SERVICE_FEE',
    amount: fee,
    fee_basis: feeBasis,
    reference: ref,
    invoiced: 0,
    invoice_month: month,
  });
  addLedgerEntry({ claim_id: claim.id, txn_type: 'INSURER_PAYMENT', amount: approved, reference: ref });
  addLedgerEntry({ claim_id: claim.id, txn_type: 'COPAY', amount: copay, reference: ref });
  setClaimCleared(claim.id, copay, clearedAt);
  upsertMonthlyInvoice(month);
  addAuditLog(claim.id, 'CLEARANCE', {
    total_amount: claim.total_amount,
    approved_amount: approved,
    copay_amount: copay,
    qai_fee: fee,
    fee_basis: feeBasis,
    invoice_month: month,
    cleared_at: clearedAt,
  });
}

const make = (input: NewClaimInput) => createClaim(input);

export function seedFullDemoIfEmpty(): void {
  if (countClaims() > 0) return;

  // Stage 1 · DRAFT
  make({
    patient_name: 'Ramesh Nair',
    patient_dob: '1978-04-12',
    policy_number: 'SH-2024-77821',
    insurer: 'Star Health',
    icd_code: 'K80.2',
    diagnosis: 'Cholelithiasis — Laparoscopic Cholecystectomy',
    doctor_name: 'Dr. S. Menon MBBS MS',
    admission_date: '2025-06-12',
    discharge_date: '2025-06-18',
    total_amount: 81500,
    items: [
      { description: 'Laparoscopic cholecystectomy', procedure_code: 'CPT 47562', quantity: 1, unit: 'procedure', amount: 42000 },
      { description: 'General anaesthesia', procedure_code: 'CPT 00790', quantity: 1, unit: 'procedure', amount: 12500 },
      { description: 'Room charges – General ward', procedure_code: 'HOSP-RMG', quantity: 6, unit: 'nights', amount: 9000 },
      { description: 'Medicine', procedure_code: null, quantity: null, unit: null, amount: 4200 },
      { description: 'Surgical kit (laparoscopic)', procedure_code: 'SKIT-LAP', quantity: null, unit: null, amount: 6800 },
      { description: 'IV fluids – Normal saline 500ml', procedure_code: 'DRUG-NS5', quantity: 8, unit: 'units', amount: 1600 },
      { description: 'Lab – LFT panel', procedure_code: 'LAB-LFT', quantity: 2, unit: 'tests', amount: 2400 },
      { description: 'Ultrasound abdomen', procedure_code: 'RAD-US', quantity: 1, unit: 'scan', amount: 1800 },
      { description: 'Nursing charges', procedure_code: 'NURS-GW', quantity: 6, unit: 'days', amount: 1200 },
    ],
  });

  // Stage 2 · AUDITED (one WARN)
  const c2 = make({
    patient_name: 'Anita Desai',
    patient_dob: '1985-09-03',
    policy_number: 'CH-2025-44120',
    insurer: 'Care Health',
    icd_code: 'J18.9',
    diagnosis: 'Community-acquired pneumonia',
    doctor_name: 'Dr. R. Kapoor MD',
    admission_date: '2025-06-20',
    discharge_date: '2025-06-24',
    total_amount: 64000,
    items: [
      { description: 'Room charges – Semi-private', procedure_code: 'HOSP-RMSP', quantity: 4, unit: 'nights', amount: 24000 },
      { description: 'IV antibiotics – Piperacillin-Tazobactam 4.5g', procedure_code: 'DRUG-PTZ', quantity: 8, unit: 'vials', amount: 16000 },
      { description: 'Chest X-ray PA view', procedure_code: 'RAD-CXR', quantity: 2, unit: 'films', amount: 3000 },
      { description: 'Sterile gloves', procedure_code: 'CONS-GLV', quantity: null, unit: null, amount: 1000 },
      { description: 'Pulmonologist consultation', procedure_code: 'CONS-PUL', quantity: 4, unit: 'visits', amount: 12000 },
      { description: 'Oxygen therapy', procedure_code: 'RESP-O2', quantity: 3, unit: 'days', amount: 8000 },
    ],
  });
  audit(c2.id, {
    4: { status: 'WARN', note: 'Consumable (gloves) listed without a quantity — add count before submission.' },
  });

  // Stage 3a · DISPATCHED (awaiting reply)
  const c3 = make({
    patient_name: 'Vikram Rao',
    patient_dob: '1969-12-18',
    policy_number: 'HE-2025-90233',
    insurer: 'HDFC Ergo',
    icd_code: 'I20.0',
    diagnosis: 'Unstable angina — coronary angioplasty',
    doctor_name: 'Dr. P. Sharma DM Cardiology',
    admission_date: '2025-06-22',
    discharge_date: '2025-06-26',
    total_amount: 220000,
    items: [
      { description: 'Coronary angioplasty (PTCA) single vessel', procedure_code: 'CPT 92920', quantity: 1, unit: 'procedure', amount: 150000 },
      { description: 'Drug-eluting stent', procedure_code: 'IMPL-DES', quantity: 1, unit: 'unit', amount: 45000 },
      { description: 'ICU charges', procedure_code: 'HOSP-ICU', quantity: 2, unit: 'days', amount: 16000 },
      { description: 'Cardiac monitoring', procedure_code: 'MON-ECG', quantity: 3, unit: 'days', amount: 9000 },
    ],
  });
  audit(c3.id);
  dispatch(c3, 'claims@hdfcergo.com', '2025-06-26T09:15:00.000Z');

  // Stage 3b · REPLIED · PARTIAL (clearable live)
  const c4 = make({
    patient_name: 'Sunita Pillai',
    patient_dob: '1991-02-27',
    policy_number: 'NIA-2025-11876',
    insurer: 'New India',
    icd_code: 'O82',
    diagnosis: 'Delivery by elective caesarean section',
    doctor_name: 'Dr. M. Iyer MS OBG',
    admission_date: '2025-06-18',
    discharge_date: '2025-06-22',
    total_amount: 95000,
    items: [
      { description: 'Lower segment caesarean section', procedure_code: 'CPT 59510', quantity: 1, unit: 'procedure', amount: 55000 },
      { description: 'Spinal anaesthesia', procedure_code: 'CPT 00857', quantity: 1, unit: 'procedure', amount: 12000 },
      { description: 'Room charges – Private', procedure_code: 'HOSP-RMP', quantity: 4, unit: 'nights', amount: 20000 },
      { description: 'Neonatal care', procedure_code: 'NEO-CARE', quantity: 4, unit: 'days', amount: 8000 },
    ],
  });
  audit(c4.id);
  const t4 = dispatch(c4, 'claims@newindia.co.in', '2025-06-22T11:00:00.000Z');
  reply(c4.id, t4, {
    tpa_reply_raw: `Tracking reference: ${t4}\n\nThe above claim has been APPROVED on a partial basis.\nAuthorisation reference: NIA/AUTH/2025/55812\nApproved amount: INR 88,000\nDeducted amount: INR 7,000`,
    tpa_decision: 'PARTIAL',
    approved_amount: 88000,
    deduction_amount: 7000,
    deduction_reasons: [
      'Private room rent exceeds policy eligibility (capped at shared-room tariff)',
      'Non-medical neonatal consumables not payable',
    ],
    documents_requested: [],
    approval_ref: 'NIA/AUTH/2025/55812',
  });

  // Stage 3c · REPLIED · REJECTED
  const c5 = make({
    patient_name: 'Arjun Mehta',
    patient_dob: '1988-11-05',
    policy_number: 'SH-2025-62018',
    insurer: 'Star Health',
    icd_code: 'S72.0',
    diagnosis: 'Fracture neck of femur — internal fixation',
    doctor_name: 'Dr. K. Nair MS Ortho',
    admission_date: '2025-06-19',
    discharge_date: '2025-06-23',
    total_amount: 130000,
    items: [
      { description: 'Open reduction internal fixation (hip)', procedure_code: 'CPT 27236', quantity: 1, unit: 'procedure', amount: 90000 },
      { description: 'Orthopaedic implant – cannulated screws', procedure_code: 'IMPL-CS', quantity: 3, unit: 'units', amount: 25000 },
      { description: 'Room charges – Private', procedure_code: 'HOSP-RMP', quantity: 4, unit: 'nights', amount: 15000 },
    ],
  });
  audit(c5.id);
  const t5 = dispatch(c5, 'claims@starhealth.in', '2025-06-23T10:00:00.000Z');
  reply(c5.id, t5, {
    tpa_reply_raw: `Tracking reference: ${t5}\n\nWe regret to inform you that the above claim has been REJECTED.`,
    tpa_decision: 'REJECTED',
    approved_amount: 0,
    deduction_amount: 130000,
    deduction_reasons: [
      'Orthopaedic procedures fall within the 24-month policy waiting period',
      'Condition assessed as pre-existing and not disclosed at policy inception',
    ],
    documents_requested: [],
    approval_ref: null,
  });

  // Stage 3d · REPLIED · MORE_INFO
  const c6 = make({
    patient_name: 'Priya Menon',
    patient_dob: '1994-06-14',
    policy_number: 'CH-2025-71540',
    insurer: 'Care Health',
    icd_code: 'N20.0',
    diagnosis: 'Renal calculus — laser lithotripsy',
    doctor_name: 'Dr. A. Verma MCh Urology',
    admission_date: '2025-06-21',
    discharge_date: '2025-06-23',
    total_amount: 58000,
    items: [
      { description: 'Laser lithotripsy (RIRS)', procedure_code: 'CPT 52356', quantity: 1, unit: 'procedure', amount: 38000 },
      { description: 'DJ stent placement', procedure_code: 'IMPL-DJ', quantity: 1, unit: 'unit', amount: 9000 },
      { description: 'Room charges – Semi-private', procedure_code: 'HOSP-RMSP', quantity: 2, unit: 'nights', amount: 8000 },
      { description: 'Pharmacy', procedure_code: 'DRUG-MISC', quantity: 1, unit: 'lot', amount: 3000 },
    ],
  });
  audit(c6.id);
  const t6 = dispatch(c6, 'claims@carehealth.in', '2025-06-23T13:30:00.000Z');
  reply(c6.id, t6, {
    tpa_reply_raw: `Tracking reference: ${t6}\n\nThe claim is on hold pending additional documentation.`,
    tpa_decision: 'MORE_INFO',
    approved_amount: null,
    deduction_amount: null,
    deduction_reasons: [],
    documents_requested: [
      'Original signed discharge summary',
      'Itemised pharmacy bill with batch numbers',
      'Pre-authorisation form duly signed by the treating urologist',
      'Pre-operative ultrasound / CT-KUB report',
    ],
    approval_ref: null,
  });

  // Stage 4 · CLEARED
  const c7 = make({
    patient_name: 'Mohammed Iqbal',
    patient_dob: '1976-07-09',
    policy_number: 'SH-2025-30945',
    insurer: 'Star Health',
    icd_code: 'K35.80',
    diagnosis: 'Acute appendicitis — laparoscopic appendectomy',
    doctor_name: 'Dr. S. Menon MBBS MS',
    admission_date: '2025-06-15',
    discharge_date: '2025-06-18',
    total_amount: 72000,
    items: [
      { description: 'Laparoscopic appendectomy', procedure_code: 'CPT 44970', quantity: 1, unit: 'procedure', amount: 40000 },
      { description: 'General anaesthesia', procedure_code: 'CPT 00840', quantity: 1, unit: 'procedure', amount: 11000 },
      { description: 'Room charges – General ward', procedure_code: 'HOSP-RMG', quantity: 3, unit: 'nights', amount: 12000 },
      { description: 'IV fluids & medication', procedure_code: 'DRUG-IV', quantity: 6, unit: 'units', amount: 6000 },
      { description: 'Histopathology', procedure_code: 'LAB-HPE', quantity: 1, unit: 'test', amount: 3000 },
    ],
  });
  audit(c7.id);
  const ref7 = 'STAR/AUTH/2025/77104';
  const t7 = dispatch(c7, 'claims@starhealth.in', '2025-06-18T10:00:00.000Z');
  reply(c7.id, t7, {
    tpa_reply_raw: `Tracking reference: ${t7}\nClaim APPROVED. Authorisation: ${ref7}`,
    tpa_decision: 'APPROVED',
    approved_amount: 68000,
    deduction_amount: 4000,
    deduction_reasons: ['Proportionate deduction on pharmacy as per policy sub-limits'],
    documents_requested: [],
    approval_ref: ref7,
  });
  clear(c7, 68000, ref7, '2025-06-18T12:30:00.000Z');

  console.log('[demo-seed] full demo roster inserted (7 claims across all stages)');
}
