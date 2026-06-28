// ============================================================================
// Q-Dispatch — SQLite database layer (PostgreSQL-ready schema)
// All SQL lives here. Route files call typed functions only.
// ============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import {
  Claim,
  BillItem,
  AuditLog,
  LedgerEntry,
  MonthlyInvoice,
  ClaimStatus,
  TPADecision,
  AuditItemStatus,
  TxnType,
  NewClaimInput,
} from './types';

// ----------------------------------------------------------------------------
// Connection
// ----------------------------------------------------------------------------

// App root = one level above this file's dir (dist/ at runtime, src/ under ts-node).
const APP_ROOT = path.resolve(__dirname, '..');
const RAW_DB_PATH = process.env.DB_PATH || './data/qdispatch.db';
// Resolve a relative DB path against the app root so it is independent of cwd.
const DB_PATH = path.isAbsolute(RAW_DB_PATH)
  ? RAW_DB_PATH
  : path.resolve(APP_ROOT, RAW_DB_PATH);

// Ensure the data directory exists before opening the database file.
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS claims (
      id                  TEXT PRIMARY KEY,
      patient_name        TEXT NOT NULL,
      patient_dob         TEXT,
      policy_number       TEXT NOT NULL,
      insurer             TEXT NOT NULL,
      insurer_code        TEXT NOT NULL,
      icd_code            TEXT NOT NULL,
      diagnosis           TEXT NOT NULL,
      doctor_name         TEXT NOT NULL,
      admission_date      TEXT NOT NULL,
      discharge_date      TEXT NOT NULL,
      total_amount        REAL NOT NULL,
      status              TEXT NOT NULL DEFAULT 'DRAFT',
      tracking_token      TEXT,
      dispatch_email      TEXT,
      dispatched_at       TEXT,
      tpa_reply_raw       TEXT,
      tpa_decision        TEXT,
      approved_amount     REAL,
      deduction_amount    REAL,
      deduction_reasons   TEXT,
      documents_requested TEXT,
      approval_ref        TEXT,
      copay_amount        REAL,
      cleared_at          TEXT,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bill_items (
      id              TEXT PRIMARY KEY,
      claim_id        TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      line_number     INTEGER NOT NULL,
      description     TEXT NOT NULL,
      procedure_code  TEXT,
      quantity        REAL,
      unit            TEXT,
      amount          REAL NOT NULL,
      audit_status    TEXT,
      audit_note      TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          TEXT PRIMARY KEY,
      claim_id    TEXT NOT NULL,
      stage       TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ledger (
      id            TEXT PRIMARY KEY,
      claim_id      TEXT NOT NULL,
      txn_type      TEXT NOT NULL,
      amount        REAL NOT NULL,
      fee_basis     TEXT,
      reference     TEXT,
      invoiced      INTEGER DEFAULT 0,
      invoice_month TEXT,
      logged_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS monthly_invoices (
      id             TEXT PRIMARY KEY,
      invoice_month  TEXT NOT NULL,
      total_claims   INTEGER DEFAULT 0,
      total_approved REAL DEFAULT 0,
      fee_total      REAL DEFAULT 0,
      status         TEXT DEFAULT 'PENDING',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bill_items_claim ON bill_items(claim_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_claim ON audit_logs(claim_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_claim ON ledger(claim_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
  `);
}

// ----------------------------------------------------------------------------
// Insurer mapping (name <-> code <-> outbound email)
// ----------------------------------------------------------------------------

export const INSURERS: Record<string, { code: string; envKey: string }> = {
  'Star Health': { code: 'SH', envKey: 'INSURER_EMAIL_STAR' },
  'Care Health': { code: 'CH', envKey: 'INSURER_EMAIL_CARE' },
  'HDFC Ergo': { code: 'HE', envKey: 'INSURER_EMAIL_HDFC' },
  'New India': { code: 'NIA', envKey: 'INSURER_EMAIL_NIA' },
};

export function insurerCodeFor(insurer: string): string {
  const match = INSURERS[insurer];
  if (!match) {
    throw new Error(`Unknown insurer: ${insurer}`);
  }
  return match.code;
}

export function insurerEmailForCode(insurerCode: string): string {
  const entry = Object.values(INSURERS).find((i) => i.code === insurerCode);
  if (!entry) {
    throw new Error(`Unknown insurer code: ${insurerCode}`);
  }
  const email = process.env[entry.envKey];
  if (!email) {
    throw new Error(`Insurer email not configured (${entry.envKey})`);
  }
  return email;
}

// ----------------------------------------------------------------------------
// Claims
// ----------------------------------------------------------------------------

export function createClaim(input: NewClaimInput): Claim {
  const id = uuid();
  const insurerCode = insurerCodeFor(input.insurer);

  const insert = db.prepare(`
    INSERT INTO claims (
      id, patient_name, patient_dob, policy_number, insurer, insurer_code,
      icd_code, diagnosis, doctor_name, admission_date, discharge_date,
      total_amount, status
    ) VALUES (
      @id, @patient_name, @patient_dob, @policy_number, @insurer, @insurer_code,
      @icd_code, @diagnosis, @doctor_name, @admission_date, @discharge_date,
      @total_amount, 'DRAFT'
    )
  `);

  const insertItem = db.prepare(`
    INSERT INTO bill_items (
      id, claim_id, line_number, description, procedure_code, quantity, unit, amount
    ) VALUES (
      @id, @claim_id, @line_number, @description, @procedure_code, @quantity, @unit, @amount
    )
  `);

  const tx = db.transaction(() => {
    insert.run({
      id,
      patient_name: input.patient_name,
      patient_dob: input.patient_dob ?? null,
      policy_number: input.policy_number,
      insurer: input.insurer,
      insurer_code: insurerCode,
      icd_code: input.icd_code,
      diagnosis: input.diagnosis,
      doctor_name: input.doctor_name,
      admission_date: input.admission_date,
      discharge_date: input.discharge_date,
      total_amount: input.total_amount,
    });

    input.items.forEach((item, idx) => {
      insertItem.run({
        id: uuid(),
        claim_id: id,
        line_number: idx + 1,
        description: item.description,
        procedure_code: item.procedure_code ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        amount: item.amount,
      });
    });
  });

  tx();
  return getClaim(id)!;
}

export function getClaim(id: string): Claim | undefined {
  return db.prepare(`SELECT * FROM claims WHERE id = ?`).get(id) as
    | Claim
    | undefined;
}

export interface ClaimListRow extends Claim {
  item_count: number;
}

export function listClaims(): ClaimListRow[] {
  return db
    .prepare(
      `
      SELECT c.*, (
        SELECT COUNT(*) FROM bill_items b WHERE b.claim_id = c.id
      ) AS item_count
      FROM claims c
      ORDER BY c.created_at DESC, c.id DESC
    `
    )
    .all() as ClaimListRow[];
}

export function countClaims(): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM claims`).get() as {
    n: number;
  };
  return row.n;
}

export function listDispatchedClaims(): Claim[] {
  return db
    .prepare(`SELECT * FROM claims WHERE status = 'DISPATCHED'`)
    .all() as Claim[];
}

export function updateClaimStatus(id: string, status: ClaimStatus): void {
  db.prepare(
    `UPDATE claims SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, id);
}

export function setClaimDispatched(
  id: string,
  token: string,
  dispatchEmail: string,
  dispatchedAt: string
): void {
  db.prepare(
    `
    UPDATE claims
    SET status = 'DISPATCHED',
        tracking_token = ?,
        dispatch_email = ?,
        dispatched_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(token, dispatchEmail, dispatchedAt, id);
}

export function setClaimReplied(
  id: string,
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
  db.prepare(
    `
    UPDATE claims
    SET status = 'REPLIED',
        tpa_reply_raw = ?,
        tpa_decision = ?,
        approved_amount = ?,
        deduction_amount = ?,
        deduction_reasons = ?,
        documents_requested = ?,
        approval_ref = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(
    fields.tpa_reply_raw,
    fields.tpa_decision,
    fields.approved_amount,
    fields.deduction_amount,
    JSON.stringify(fields.deduction_reasons),
    JSON.stringify(fields.documents_requested),
    fields.approval_ref,
    id
  );
}

export function setClaimCleared(
  id: string,
  copayAmount: number,
  clearedAt: string
): void {
  db.prepare(
    `
    UPDATE claims
    SET status = 'CLEARED',
        copay_amount = ?,
        cleared_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `
  ).run(copayAmount, clearedAt, id);
}

// ----------------------------------------------------------------------------
// Bill items
// ----------------------------------------------------------------------------

export function getBillItems(claimId: string): BillItem[] {
  return db
    .prepare(
      `SELECT * FROM bill_items WHERE claim_id = ? ORDER BY line_number ASC`
    )
    .all(claimId) as BillItem[];
}

export function updateBillItemAudit(
  itemId: string,
  status: AuditItemStatus,
  note: string
): void {
  db.prepare(
    `UPDATE bill_items SET audit_status = ?, audit_note = ? WHERE id = ?`
  ).run(status, note, itemId);
}

export function hasErrorItems(claimId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bill_items WHERE claim_id = ? AND audit_status = 'ERROR'`
    )
    .get(claimId) as { n: number };
  return row.n > 0;
}

// ----------------------------------------------------------------------------
// Audit logs
// ----------------------------------------------------------------------------

export function addAuditLog(
  claimId: string,
  stage: AuditLog['stage'],
  payload: unknown
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, claim_id, stage, payload) VALUES (?, ?, ?, ?)`
  ).run(uuid(), claimId, stage, JSON.stringify(payload));
}

export function getAuditLogs(claimId: string): AuditLog[] {
  return db
    .prepare(
      `SELECT * FROM audit_logs WHERE claim_id = ? ORDER BY created_at ASC, id ASC`
    )
    .all(claimId) as AuditLog[];
}

// ----------------------------------------------------------------------------
// Ledger
// ----------------------------------------------------------------------------

export function addLedgerEntry(entry: {
  claim_id: string;
  txn_type: TxnType;
  amount: number;
  fee_basis?: string | null;
  reference?: string | null;
  invoiced?: number;
  invoice_month?: string | null;
}): void {
  db.prepare(
    `
    INSERT INTO ledger (
      id, claim_id, txn_type, amount, fee_basis, reference, invoiced, invoice_month
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    uuid(),
    entry.claim_id,
    entry.txn_type,
    entry.amount,
    entry.fee_basis ?? null,
    entry.reference ?? null,
    entry.invoiced ?? 0,
    entry.invoice_month ?? null
  );
}

export function listLedger(): LedgerEntry[] {
  return db
    .prepare(`SELECT * FROM ledger ORDER BY logged_at DESC, id DESC`)
    .all() as LedgerEntry[];
}

export interface LedgerSummary {
  total_fees_pending: number;
  total_fees_this_month: number;
  claim_count_this_month: number;
}

export function ledgerSummary(currentMonth: string): LedgerSummary {
  const pending = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM ledger WHERE txn_type = 'QAI_SERVICE_FEE' AND invoiced = 0`
    )
    .get() as { total: number };

  const thisMonth = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n
       FROM ledger WHERE txn_type = 'QAI_SERVICE_FEE' AND invoice_month = ?`
    )
    .get(currentMonth) as { total: number; n: number };

  return {
    total_fees_pending: pending.total,
    total_fees_this_month: thisMonth.total,
    claim_count_this_month: thisMonth.n,
  };
}

// ----------------------------------------------------------------------------
// Monthly invoices
// ----------------------------------------------------------------------------

export function upsertMonthlyInvoice(month: string): void {
  const existing = db
    .prepare(`SELECT id FROM monthly_invoices WHERE invoice_month = ?`)
    .get(month) as { id: string } | undefined;

  const agg = db
    .prepare(
      `SELECT COUNT(*) AS claims, COALESCE(SUM(amount), 0) AS fee_total
       FROM ledger WHERE txn_type = 'QAI_SERVICE_FEE' AND invoice_month = ?`
    )
    .get(month) as { claims: number; fee_total: number };

  const approvedAgg = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total_approved
       FROM ledger WHERE txn_type = 'INSURER_PAYMENT'
       AND claim_id IN (
         SELECT claim_id FROM ledger
         WHERE txn_type = 'QAI_SERVICE_FEE' AND invoice_month = ?
       )`
    )
    .get(month) as { total_approved: number };

  if (existing) {
    db.prepare(
      `UPDATE monthly_invoices
       SET total_claims = ?, total_approved = ?, fee_total = ?
       WHERE id = ?`
    ).run(agg.claims, approvedAgg.total_approved, agg.fee_total, existing.id);
  } else {
    db.prepare(
      `INSERT INTO monthly_invoices
       (id, invoice_month, total_claims, total_approved, fee_total, status)
       VALUES (?, ?, ?, ?, ?, 'PENDING')`
    ).run(
      uuid(),
      month,
      agg.claims,
      approvedAgg.total_approved,
      agg.fee_total
    );
  }
}

export function listMonthlyInvoices(): MonthlyInvoice[] {
  return db
    .prepare(`SELECT * FROM monthly_invoices ORDER BY invoice_month DESC`)
    .all() as MonthlyInvoice[];
}

export default db;
