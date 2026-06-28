// ============================================================================
// Q-Dispatch — demo seed data
// Inserts one demo claim (with intentional audit issues) when DB is empty.
// ============================================================================

import { countClaims, createClaim } from './db';
import { NewClaimInput } from './types';

const DEMO_CLAIM: NewClaimInput = {
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
    {
      description: 'Laparoscopic cholecystectomy',
      procedure_code: 'CPT 47562',
      quantity: 1,
      unit: 'procedure',
      amount: 42000,
    },
    {
      description: 'General anaesthesia',
      procedure_code: 'CPT 00790',
      quantity: 1,
      unit: 'procedure',
      amount: 12500,
    },
    {
      description: 'Room charges – General ward',
      procedure_code: 'HOSP-RMG',
      quantity: 6,
      unit: 'nights',
      amount: 9000,
    },
    {
      // Intentional ERROR — vague description, no code, no quantity.
      description: 'Medicine',
      procedure_code: null,
      quantity: null,
      unit: null,
      amount: 4200,
    },
    {
      // Intentional WARN — consumable kit with no quantity listed.
      description: 'Surgical kit (laparoscopic)',
      procedure_code: 'SKIT-LAP',
      quantity: null,
      unit: null,
      amount: 6800,
    },
    {
      description: 'IV fluids – Normal saline 500ml',
      procedure_code: 'DRUG-NS5',
      quantity: 8,
      unit: 'units',
      amount: 1600,
    },
    {
      description: 'Lab – LFT panel',
      procedure_code: 'LAB-LFT',
      quantity: 2,
      unit: 'tests',
      amount: 2400,
    },
    {
      description: 'Ultrasound abdomen',
      procedure_code: 'RAD-US',
      quantity: 1,
      unit: 'scan',
      amount: 1800,
    },
    {
      description: 'Nursing charges',
      procedure_code: 'NURS-GW',
      quantity: 6,
      unit: 'days',
      amount: 1200,
    },
  ],
  // Intentionally missing 'Operative / procedure notes' so the document
  // completeness check flags it during the audit.
  documents: [
    'PRE_AUTH',
    'DISCHARGE',
    'ITEMISED_BILL',
    'ID_POLICY',
    'PHARMACY_BILL',
    'INVESTIGATION',
  ],
};

export function seedIfEmpty(): void {
  if (countClaims() > 0) {
    return;
  }
  createClaim(DEMO_CLAIM);
  console.log('[seed] inserted demo claim for Ramesh Nair');
}
