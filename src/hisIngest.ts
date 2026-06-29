// ============================================================================
// Q-Dispatch — HIS ingestion
//
// Parses a REAL hospital-information-system export into a claim draft for the
// clerk to review. Two real formats are supported:
//   - FHIR R4 Bundle (the ABDM/NHCX-aligned modern HIS standard)
//   - CSV billing export (the pragmatic format most Indian HIS still produce)
//
// This is genuine parsing of real-format data — not a dummy form-fill. At
// go-live, the same parser is fed by the hospital's live HIS feed/webhook; the
// only thing that changes is the source of the bytes.
// ============================================================================

import { INSURERS } from './db';

export interface HisItem {
  description: string;
  procedure_code: string | null;
  quantity: number | null;
  unit: string | null;
  amount: number;
}

export interface HisDraft {
  patient_name: string;
  patient_dob: string | null;
  policy_number: string;
  insurer: string;
  icd_code: string;
  diagnosis: string;
  doctor_name: string;
  admission_date: string;
  discharge_date: string;
  items: HisItem[];
  source: 'fhir' | 'csv';
  warnings: string[];
}

function emptyDraft(source: 'fhir' | 'csv'): HisDraft {
  return {
    patient_name: '',
    patient_dob: null,
    policy_number: '',
    insurer: '',
    icd_code: '',
    diagnosis: '',
    doctor_name: '',
    admission_date: '',
    discharge_date: '',
    items: [],
    source,
    warnings: [],
  };
}

// Map a free-text insurer name onto one of the configured insurers.
function mapInsurer(name: string | undefined): string {
  if (!name) return '';
  const n = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(INSURERS, name)) return name;
  if (n.includes('star')) return 'Star Health';
  if (n.includes('care')) return 'Care Health';
  if (n.includes('hdfc') || n.includes('ergo')) return 'HDFC Ergo';
  if (n.includes('new india') || n === 'nia') return 'New India';
  return '';
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------------------------------
// CSV
// ----------------------------------------------------------------------------

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function colIndex(headers: string[], names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const idx = norm.indexOf(name);
    if (idx !== -1) return idx;
  }
  // partial match
  for (let i = 0; i < norm.length; i++) {
    if (names.some((nm) => norm[i].includes(nm))) return i;
  }
  return -1;
}

export function parseCsv(text: string): HisDraft {
  const draft = emptyDraft('csv');
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    draft.warnings.push('CSV has no data rows.');
    return draft;
  }
  const headers = rows[0];
  const iDesc = colIndex(headers, ['description', 'particular', 'item', 'service']);
  const iCode = colIndex(headers, ['procedure_code', 'code', 'cpt', 'hsn']);
  const iQty = colIndex(headers, ['quantity', 'qty', 'units']);
  const iUnit = colIndex(headers, ['unit', 'uom']);
  const iAmt = colIndex(headers, ['amount', 'value', 'total', 'rate', 'net']);

  if (iDesc === -1 || iAmt === -1) {
    draft.warnings.push(
      'CSV must have at least a description and an amount column.'
    );
    return draft;
  }

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const description = (cells[iDesc] || '').trim();
    const amount = toNum(cells[iAmt]);
    if (!description && amount === null) continue;
    draft.items.push({
      description,
      procedure_code: iCode !== -1 && cells[iCode]?.trim() ? cells[iCode].trim() : null,
      quantity: iQty !== -1 ? toNum(cells[iQty]) : null,
      unit: iUnit !== -1 && cells[iUnit]?.trim() ? cells[iUnit].trim() : null,
      amount: amount ?? 0,
    });
  }

  draft.warnings.push(
    'CSV billing exports carry line items only — complete patient, insurer and diagnosis details before audit.'
  );
  return draft;
}

// ----------------------------------------------------------------------------
// FHIR R4 Bundle
// ----------------------------------------------------------------------------

type AnyRec = Record<string, any>;

function resourcesOf(bundle: AnyRec, type: string): AnyRec[] {
  const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
  return entries
    .map((e: AnyRec) => e?.resource)
    .filter((r: AnyRec) => r && r.resourceType === type);
}

function humanName(name: AnyRec[] | undefined): string {
  if (!Array.isArray(name) || !name.length) return '';
  const n = name[0];
  if (n.text) return String(n.text);
  const given = Array.isArray(n.given) ? n.given.join(' ') : '';
  return [given, n.family].filter(Boolean).join(' ').trim();
}

export function parseFhirBundle(bundle: AnyRec): HisDraft {
  const draft = emptyDraft('fhir');

  // Patient
  const patient = resourcesOf(bundle, 'Patient')[0];
  if (patient) {
    draft.patient_name = humanName(patient.name);
    if (patient.birthDate) draft.patient_dob = String(patient.birthDate);
    const ids = Array.isArray(patient.identifier) ? patient.identifier : [];
    const policy =
      ids.find((id: AnyRec) => /policy/i.test(id?.system || ''))?.value ||
      ids[0]?.value;
    if (policy) draft.policy_number = String(policy);
  }

  // Coverage → policy + insurer
  const coverage = resourcesOf(bundle, 'Coverage')[0];
  if (coverage) {
    if (!draft.policy_number && coverage.subscriberId)
      draft.policy_number = String(coverage.subscriberId);
    const payorDisplay = coverage.payor?.[0]?.display;
    if (payorDisplay) draft.insurer = mapInsurer(payorDisplay);
  }

  // Payer organization
  if (!draft.insurer) {
    const orgs = resourcesOf(bundle, 'Organization');
    const payer = orgs.find((o: AnyRec) =>
      (o.type || []).some((t: AnyRec) =>
        (t.coding || []).some((c: AnyRec) => c.code === 'pay')
      )
    );
    if (payer?.name) draft.insurer = mapInsurer(payer.name);
  }

  // Practitioner → doctor
  const practitioner = resourcesOf(bundle, 'Practitioner')[0];
  if (practitioner) draft.doctor_name = humanName(practitioner.name);

  // Encounter → admission / discharge
  const encounter = resourcesOf(bundle, 'Encounter')[0];
  if (encounter?.period) {
    if (encounter.period.start)
      draft.admission_date = String(encounter.period.start).slice(0, 10);
    if (encounter.period.end)
      draft.discharge_date = String(encounter.period.end).slice(0, 10);
  }

  // Claim resource (preferred): diagnosis, items, insurer, dates
  const claim = resourcesOf(bundle, 'Claim')[0];
  if (claim) {
    const dx = claim.diagnosis?.[0]?.diagnosisCodeableConcept;
    const coding = dx?.coding?.[0];
    if (coding?.code) draft.icd_code = String(coding.code);
    if (dx?.text || coding?.display)
      draft.diagnosis = String(dx?.text || coding?.display);
    if (!draft.insurer && claim.insurer?.display)
      draft.insurer = mapInsurer(claim.insurer.display);
    if (claim.created && !draft.discharge_date)
      draft.discharge_date = String(claim.created).slice(0, 10);

    for (const it of claim.item || []) {
      const pos = it.productOrService || {};
      draft.items.push({
        description: String(pos.text || pos.coding?.[0]?.display || ''),
        procedure_code: pos.coding?.[0]?.code ? String(pos.coding[0].code) : null,
        quantity: it.quantity?.value != null ? Number(it.quantity.value) : null,
        unit: it.quantity?.unit ? String(it.quantity.unit) : null,
        amount: toNum(it.net?.value ?? it.unitPrice?.value) ?? 0,
      });
    }
  }

  // ChargeItem fallback when there's no Claim resource
  if (draft.items.length === 0) {
    for (const ci of resourcesOf(bundle, 'ChargeItem')) {
      draft.items.push({
        description: String(ci.code?.text || ci.code?.coding?.[0]?.display || ''),
        procedure_code: ci.code?.coding?.[0]?.code
          ? String(ci.code.coding[0].code)
          : null,
        quantity: ci.quantity?.value != null ? Number(ci.quantity.value) : null,
        unit: ci.quantity?.unit ? String(ci.quantity.unit) : null,
        amount: toNum(ci.priceOverride?.value ?? ci.totalPriceComponent?.[0]?.amount?.value) ?? 0,
      });
    }
  }

  // Condition fallback for diagnosis
  if (!draft.icd_code) {
    const cond = resourcesOf(bundle, 'Condition')[0];
    const c = cond?.code?.coding?.[0];
    if (c?.code) draft.icd_code = String(c.code);
    if (cond?.code?.text || c?.display)
      draft.diagnosis = String(cond?.code?.text || c?.display);
  }

  if (!draft.items.length)
    draft.warnings.push('No billable items (Claim.item / ChargeItem) found in the bundle.');
  if (!draft.insurer)
    draft.warnings.push('Insurer could not be matched — please select it.');

  return draft;
}

// ----------------------------------------------------------------------------
// Dispatcher
// ----------------------------------------------------------------------------

export function ingestHisExport(
  format: string,
  content: string | AnyRec
): HisDraft {
  if (format === 'csv') {
    if (typeof content !== 'string') {
      throw new Error('CSV content must be a string.');
    }
    return parseCsv(content);
  }
  if (format === 'fhir') {
    const bundle =
      typeof content === 'string' ? JSON.parse(content) : content;
    if (!bundle || bundle.resourceType !== 'Bundle') {
      throw new Error('FHIR content must be a Bundle resource.');
    }
    return parseFhirBundle(bundle);
  }
  throw new Error(`Unsupported HIS format: ${format} (use "fhir" or "csv").`);
}
