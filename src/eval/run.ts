// ============================================================================
// Q-Dispatch — audit eval runner
//
// Audits the golden dataset with the live AI and reports precision/recall/
// accuracy, so agent quality is a measured number, not a claim.
//
// Usage:  npm run build && ANTHROPIC_API_KEY=sk-ant-... npm run eval
// ============================================================================

import { loadEnv } from '../env';
loadEnv();

import { auditBill } from '../ai';
import { GOLDEN, EvalCase } from './dataset';
import { score, LineResult } from './score';
import { Claim, BillItem } from '../types';

function toClaim(c: EvalCase): Claim {
  const total = c.items.reduce((s, i) => s + (i.amount || 0), 0);
  return {
    id: 'eval',
    patient_name: 'EVAL',
    patient_dob: null,
    policy_number: 'EVAL',
    insurer: c.insurer,
    insurer_code: 'SH',
    icd_code: c.icd_code,
    diagnosis: c.diagnosis,
    doctor_name: 'EVAL',
    admission_date: '2025-01-01',
    discharge_date: '2025-01-02',
    total_amount: total,
    status: 'DRAFT',
    tracking_token: null,
    dispatch_email: null,
    dispatched_at: null,
    tpa_reply_raw: null,
    tpa_decision: null,
    approved_amount: null,
    deduction_amount: null,
    deduction_reasons: null,
    documents_requested: null,
    approval_ref: null,
    copay_amount: null,
    cleared_at: null,
    documents: null,
    created_at: '',
    updated_at: '',
  };
}

function toItems(c: EvalCase): BillItem[] {
  return c.items.map((it, idx) => ({
    id: `eval-${idx}`,
    claim_id: 'eval',
    line_number: idx + 1,
    description: it.description,
    procedure_code: it.procedure_code ?? null,
    quantity: it.quantity ?? null,
    unit: it.unit ?? null,
    amount: it.amount,
    audit_status: null,
    audit_note: null,
  }));
}

function bar(pct: number): string {
  const n = Math.round(pct / 5);
  return '█'.repeat(n) + '░'.repeat(20 - n);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '\nANTHROPIC_API_KEY is not set. Run:\n  ANTHROPIC_API_KEY=sk-ant-... npm run eval\n'
    );
    process.exit(1);
  }

  console.log(`\nQ-Dispatch — Audit Eval  (${GOLDEN.length} cases)\n`);

  const results: LineResult[] = [];
  for (const c of GOLDEN) {
    process.stdout.write(`  auditing: ${c.name} … `);
    try {
      const r = await auditBill(toClaim(c), toItems(c));
      const byLine = new Map(r.items.map((i) => [i.line_number, i.status]));
      c.items.forEach((it, idx) => {
        results.push({
          caseName: c.name,
          line: idx + 1,
          description: it.description,
          expected: it.expected,
          predicted: byLine.get(idx + 1) ?? 'OK',
          rule: it.rule,
        });
      });
      console.log('ok');
    } catch (err) {
      console.log('FAILED:', err instanceof Error ? err.message : err);
    }
  }

  const m = score(results);

  console.log('\n──────────────── RESULTS ────────────────');
  console.log(`Lines scored      : ${m.total_lines}`);
  console.log(`Exact accuracy    : ${bar(m.exact_accuracy)} ${m.exact_accuracy}%`);
  console.log(`Flag precision    : ${bar(m.flag_precision)} ${m.flag_precision}%   (few false alarms)`);
  console.log(`Flag recall       : ${bar(m.flag_recall)} ${m.flag_recall}%   (few misses)`);
  console.log(`Flag F1           : ${bar(m.flag_f1)} ${m.flag_f1}%`);
  console.log(`Severity accuracy : ${bar(m.severity_accuracy)} ${m.severity_accuracy}%   (right WARN vs ERROR)`);
  console.log(
    `Confusion         : TP=${m.confusion.tp} FP=${m.confusion.fp} FN=${m.confusion.fn} TN=${m.confusion.tn}`
  );

  console.log('\nPer-rule recall (did it catch each issue type):');
  for (const [rule, v] of Object.entries(m.per_rule)) {
    console.log(`  ${rule.padEnd(16)} ${v.caught}/${v.total}`);
  }

  if (m.misses.length) {
    console.log('\n⚠️  MISSES (should be flagged, agent said OK):');
    m.misses.forEach((x) => console.log(`  [${x.caseName}] "${x.description}" — expected ${x.expected}`));
  }
  if (m.false_alarms.length) {
    console.log('\n⚠️  FALSE ALARMS (should be OK, agent flagged):');
    m.false_alarms.forEach((x) => console.log(`  [${x.caseName}] "${x.description}" — predicted ${x.predicted}`));
  }
  if (m.mis_severity.length) {
    console.log('\nℹ️  WRONG SEVERITY (flagged, but WARN vs ERROR off):');
    m.mis_severity.forEach((x) =>
      console.log(`  [${x.caseName}] "${x.description}" — expected ${x.expected}, got ${x.predicted}`)
    );
  }
  console.log('\n─────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
