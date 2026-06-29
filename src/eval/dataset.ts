// ============================================================================
// Q-Dispatch — audit eval golden dataset
//
// Each line carries an `expected` status (the correct audit outcome per the
// documented rules). The runner audits these with the live AI and scores the
// agent's predictions against these labels (precision / recall / accuracy).
// Add real anonymised claims here over time to grow the benchmark.
// ============================================================================

import { AuditItemStatus } from '../types';

export interface EvalLine {
  description: string;
  procedure_code?: string | null;
  quantity?: number | null;
  unit?: string | null;
  amount: number;
  expected: AuditItemStatus;
  rule?: string; // which rule this line exercises (for per-rule reporting)
}

export interface EvalCase {
  name: string;
  insurer: string;
  icd_code: string;
  diagnosis: string;
  items: EvalLine[];
}

const OK = 'OK' as AuditItemStatus;
const WARN = 'WARN' as AuditItemStatus;
const ERROR = 'ERROR' as AuditItemStatus;

export const GOLDEN: EvalCase[] = [
  {
    name: 'Clean cholecystectomy',
    insurer: 'Star Health',
    icd_code: 'K80.2',
    diagnosis: 'Cholelithiasis — laparoscopic cholecystectomy',
    items: [
      { description: 'Laparoscopic cholecystectomy', procedure_code: 'CPT 47562', quantity: 1, unit: 'procedure', amount: 42000, expected: OK },
      { description: 'General anaesthesia', procedure_code: 'CPT 00790', quantity: 1, unit: 'procedure', amount: 12500, expected: OK },
      { description: 'Room charges – General ward', procedure_code: 'HOSP-RMG', quantity: 6, unit: 'nights', amount: 9000, expected: OK },
      { description: 'IV fluids – Normal saline 500ml', procedure_code: 'DRUG-NS5', quantity: 8, unit: 'units', amount: 1600, expected: OK },
      { description: 'Ultrasound abdomen', procedure_code: 'RAD-US', quantity: 1, unit: 'scan', amount: 1800, expected: OK },
    ],
  },
  {
    name: 'Vague descriptions',
    insurer: 'Care Health',
    icd_code: 'J18.9',
    diagnosis: 'Pneumonia',
    items: [
      { description: 'Medicine', procedure_code: null, quantity: null, unit: null, amount: 4200, expected: ERROR, rule: 'vague' },
      { description: 'Drugs', procedure_code: null, quantity: null, unit: null, amount: 2100, expected: ERROR, rule: 'vague' },
      { description: 'Injection', procedure_code: null, quantity: 2, unit: 'units', amount: 800, expected: ERROR, rule: 'vague' },
      { description: 'Amoxicillin 500mg capsule', procedure_code: 'DRUG-AMX', quantity: 21, unit: 'caps', amount: 630, expected: OK },
    ],
  },
  {
    name: 'Consumables missing quantity',
    insurer: 'HDFC Ergo',
    icd_code: 'S72.0',
    diagnosis: 'Fracture femur',
    items: [
      { description: 'Sterile surgical gloves', procedure_code: 'CONS-GLV', quantity: null, unit: null, amount: 900, expected: WARN, rule: 'qty' },
      { description: 'Disposable syringes', procedure_code: 'CONS-SYR', quantity: null, unit: null, amount: 600, expected: WARN, rule: 'qty' },
      { description: 'Surgical drapes', procedure_code: 'CONS-DRP', quantity: 4, unit: 'units', amount: 1200, expected: OK },
    ],
  },
  {
    name: 'Procedure codes',
    insurer: 'New India',
    icd_code: 'O82',
    diagnosis: 'Caesarean section',
    items: [
      { description: 'Lower segment caesarean section', procedure_code: 'K8', quantity: 1, unit: 'procedure', amount: 55000, expected: ERROR, rule: 'truncated_code' },
      { description: 'Spinal anaesthesia', procedure_code: 'CP', quantity: 1, unit: 'procedure', amount: 12000, expected: ERROR, rule: 'truncated_code' },
      { description: 'Neonatal care', procedure_code: null, quantity: 4, unit: 'days', amount: 8000, expected: WARN, rule: 'missing_code' },
    ],
  },
  {
    name: 'Invalid amounts',
    insurer: 'Star Health',
    icd_code: 'K35.80',
    diagnosis: 'Appendicitis',
    items: [
      { description: 'Laparoscopic appendectomy', procedure_code: 'CPT 44970', quantity: 1, unit: 'procedure', amount: 0, expected: ERROR, rule: 'zero_amount' },
      { description: 'Histopathology', procedure_code: 'LAB-HPE', quantity: 1, unit: 'test', amount: -500, expected: ERROR, rule: 'negative_amount' },
      { description: 'General ward', procedure_code: 'HOSP-RMG', quantity: 3, unit: 'nights', amount: 4500, expected: OK },
    ],
  },
  {
    name: 'Non-payable items',
    insurer: 'Care Health',
    icd_code: 'I20.0',
    diagnosis: 'Angina',
    items: [
      { description: 'Attendant charges', procedure_code: 'MISC-ATT', quantity: 3, unit: 'days', amount: 1500, expected: WARN, rule: 'non_payable' },
      { description: 'Telephone charges', procedure_code: 'MISC-TEL', quantity: 1, unit: 'lot', amount: 300, expected: WARN, rule: 'non_payable' },
      { description: 'Food & beverages (attendant)', procedure_code: 'MISC-FOOD', quantity: 6, unit: 'meals', amount: 1200, expected: WARN, rule: 'non_payable' },
      { description: 'Coronary angioplasty (PTCA)', procedure_code: 'CPT 92920', quantity: 1, unit: 'procedure', amount: 150000, expected: OK },
    ],
  },
  {
    name: 'Mixed surgical kit',
    insurer: 'HDFC Ergo',
    icd_code: 'K40.9',
    diagnosis: 'Hernia repair',
    items: [
      { description: 'Surgical Kit', procedure_code: 'SKIT', quantity: null, unit: null, amount: 6800, expected: ERROR, rule: 'vague' },
      { description: 'Mesh implant (polypropylene)', procedure_code: 'IMPL-MESH', quantity: 1, unit: 'unit', amount: 9000, expected: OK },
      { description: 'Bandages', procedure_code: 'CONS-BND', quantity: null, unit: null, amount: 400, expected: WARN, rule: 'qty' },
      { description: 'Open inguinal hernia repair', procedure_code: 'CPT 49505', quantity: 1, unit: 'procedure', amount: 35000, expected: OK },
    ],
  },
  {
    name: 'Clean maternity',
    insurer: 'New India',
    icd_code: 'O80',
    diagnosis: 'Normal delivery',
    items: [
      { description: 'Normal vaginal delivery', procedure_code: 'CPT 59400', quantity: 1, unit: 'procedure', amount: 28000, expected: OK },
      { description: 'Epidural analgesia', procedure_code: 'CPT 62323', quantity: 1, unit: 'procedure', amount: 8000, expected: OK },
      { description: 'Private room', procedure_code: 'HOSP-RMP', quantity: 3, unit: 'nights', amount: 15000, expected: OK },
      { description: 'Paracetamol 650mg tablet', procedure_code: 'DRUG-PCM', quantity: 10, unit: 'tabs', amount: 200, expected: OK },
    ],
  },
  {
    name: 'Mixed dirty bill',
    insurer: 'Star Health',
    icd_code: 'N20.0',
    diagnosis: 'Renal calculus',
    items: [
      { description: 'Consumables', procedure_code: null, quantity: null, unit: null, amount: 3500, expected: ERROR, rule: 'vague' },
      { description: 'Newspaper', procedure_code: 'MISC-NEWS', quantity: 3, unit: 'days', amount: 90, expected: WARN, rule: 'non_payable' },
      { description: 'Laser lithotripsy (RIRS)', procedure_code: 'CPT 52356', quantity: 1, unit: 'procedure', amount: 38000, expected: OK },
      { description: 'DJ stent', procedure_code: 'IMPL-DJ', quantity: 0, unit: 'unit', amount: 0, expected: ERROR, rule: 'zero_amount' },
    ],
  },
  {
    name: 'Clean cardiac',
    insurer: 'HDFC Ergo',
    icd_code: 'I21.9',
    diagnosis: 'Myocardial infarction',
    items: [
      { description: 'Primary coronary angioplasty', procedure_code: 'CPT 92941', quantity: 1, unit: 'procedure', amount: 165000, expected: OK },
      { description: 'Drug-eluting stent (Xience)', procedure_code: 'IMPL-DES', quantity: 1, unit: 'unit', amount: 45000, expected: OK },
      { description: 'ICU monitoring', procedure_code: 'HOSP-ICU', quantity: 2, unit: 'days', amount: 16000, expected: OK },
      { description: 'Clopidogrel 75mg tablet', procedure_code: 'DRUG-CLP', quantity: 14, unit: 'tabs', amount: 280, expected: OK },
    ],
  },
];
