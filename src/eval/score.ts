// ============================================================================
// Q-Dispatch — audit eval scoring (pure, no AI/IO — unit-testable)
//
// "Flagged" = status is WARN or ERROR. We measure how well the agent
// distinguishes flagged from clean lines, plus exact-severity accuracy.
// ============================================================================

import { AuditItemStatus } from '../types';

export interface LineResult {
  caseName: string;
  line: number;
  description: string;
  expected: AuditItemStatus;
  predicted: AuditItemStatus;
  rule?: string;
}

export interface Metrics {
  total_lines: number;
  exact_accuracy: number; // predicted status === expected status
  flag_precision: number; // of lines flagged, how many should be flagged
  flag_recall: number; // of lines that should be flagged, how many were
  flag_f1: number;
  severity_accuracy: number; // among correctly-flagged lines, right WARN/ERROR
  confusion: { tp: number; fp: number; fn: number; tn: number };
  per_rule: Record<string, { total: number; caught: number }>;
  misses: LineResult[]; // should be flagged, agent said OK (false negatives)
  false_alarms: LineResult[]; // should be OK, agent flagged (false positives)
  mis_severity: LineResult[]; // flagged correctly but wrong WARN/ERROR
}

const isFlagged = (s: AuditItemStatus) => s !== 'OK';

function round(n: number): number {
  return Math.round(n * 1000) / 10; // -> percentage with 1 decimal
}

export function score(results: LineResult[]): Metrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let exact = 0;
  let correctlyFlagged = 0;
  let correctSeverity = 0;

  const perRule: Record<string, { total: number; caught: number }> = {};
  const misses: LineResult[] = [];
  const falseAlarms: LineResult[] = [];
  const misSeverity: LineResult[] = [];

  for (const r of results) {
    const eFlag = isFlagged(r.expected);
    const pFlag = isFlagged(r.predicted);

    if (r.expected === r.predicted) exact++;

    if (eFlag && pFlag) {
      tp++;
      correctlyFlagged++;
      if (r.expected === r.predicted) correctSeverity++;
      else misSeverity.push(r);
    } else if (!eFlag && pFlag) {
      fp++;
      falseAlarms.push(r);
    } else if (eFlag && !pFlag) {
      fn++;
      misses.push(r);
    } else {
      tn++;
    }

    if (r.rule) {
      if (!perRule[r.rule]) perRule[r.rule] = { total: 0, caught: 0 };
      perRule[r.rule].total++;
      if (pFlag) perRule[r.rule].caught++;
    }
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    total_lines: results.length,
    exact_accuracy: round(exact / Math.max(1, results.length)),
    flag_precision: round(precision),
    flag_recall: round(recall),
    flag_f1: round(f1),
    severity_accuracy: round(correctSeverity / Math.max(1, correctlyFlagged)),
    confusion: { tp, fp, fn, tn },
    per_rule: perRule,
    misses,
    false_alarms: falseAlarms,
    mis_severity: misSeverity,
  };
}
