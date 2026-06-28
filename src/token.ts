// ============================================================================
// Q-Dispatch — tracking token generator
// Format: QDX-{YYYY}-{DDMMYY}-{INSURER_CODE}-{ICD_SANITISED}-{RANDOM_4}
// Example: QDX-2025-180625-SH-K802-T9X4
// ============================================================================

import crypto from 'crypto';

const RANDOM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function random4(): string {
  let out = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    out += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Sanitise an ICD-10 code: remove dots and uppercase. K80.2 -> K802
 */
export function sanitiseIcd(icd: string): string {
  return icd.replace(/\./g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * Generate a tracking token. `date` defaults to now (the dispatch moment).
 */
export function generateToken(
  insurerCode: string,
  icdCode: string,
  date: Date = new Date()
): string {
  const yyyy = date.getFullYear();
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yy = String(date.getFullYear()).slice(-2);
  const ddmmyy = `${dd}${mm}${yy}`;

  return [
    'QDX',
    yyyy,
    ddmmyy,
    insurerCode.toUpperCase(),
    sanitiseIcd(icdCode),
    random4(),
  ].join('-');
}
