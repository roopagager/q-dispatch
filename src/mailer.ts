// ============================================================================
// Q-Dispatch — outbound claim email (Nodemailer / SMTP)
// ============================================================================

import nodemailer, { Transporter } from 'nodemailer';
import { Claim, BillItem } from './types';
import { insurerEmailForCode } from './db';

const HOSPITAL_NAME = 'Jubilee Hospital';

let cachedTransport: Transporter | null = null;

function transport(): Transporter {
  if (cachedTransport) return cachedTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // SSL on 465, STARTTLS otherwise
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

// ----------------------------------------------------------------------------
// Formatting helpers
// ----------------------------------------------------------------------------

function formatINR(amount: number): string {
  // Indian grouping (e.g. 81500 -> 81,500)
  return amount.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
}

function plainItem(i: BillItem): string {
  const qty =
    i.quantity != null ? `${i.quantity}${i.unit ? ' ' + i.unit : ''}` : '-';
  const code = i.procedure_code || '-';
  return `${String(i.line_number).padStart(2, ' ')}. ${i.description} | code: ${code} | qty: ${qty} | ₹${formatINR(i.amount)}`;
}

function buildPlainBody(
  claim: Claim,
  items: BillItem[],
  token: string
): string {
  const lines = items.map(plainItem).join('\n');
  return `${HOSPITAL_NAME} — Cashless Insurance Claim Submission

PATIENT DETAILS
  Name           : ${claim.patient_name}
  Date of birth  : ${claim.patient_dob || 'N/A'}
  Policy number  : ${claim.policy_number}
  Insurer        : ${claim.insurer}

CLINICAL
  Diagnosis      : ${claim.diagnosis}
  ICD-10 code    : ${claim.icd_code}
  Treating doctor: ${claim.doctor_name}
  Admission      : ${claim.admission_date}
  Discharge      : ${claim.discharge_date}

ITEMISED BILL
${lines}

  TOTAL CLAIM AMOUNT: ₹${formatINR(claim.total_amount)}

TRACKING REFERENCE: ${token}

Please reply to this email quoting the tracking reference above so that our
system can match your decision to this claim.

Submitted via Q-Dispatch | Quantum AI Ltd. | quantumai.co.uk`;
}

function buildHtmlBody(
  claim: Claim,
  items: BillItem[],
  token: string
): string {
  const rows = items
    .map((i) => {
      const qty =
        i.quantity != null
          ? `${i.quantity}${i.unit ? ' ' + i.unit : ''}`
          : '—';
      return `<tr>
        <td style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">${i.line_number}</td>
        <td style="padding:6px 10px;border:1px solid #e2e2e2;">${escapeHtml(i.description)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e2e2;">${escapeHtml(i.procedure_code || '—')}</td>
        <td style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">${escapeHtml(qty)}</td>
        <td style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">₹${formatINR(i.amount)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html><body style="font-family:Arial,system-ui,sans-serif;color:#1A2233;margin:0;padding:24px;background:#F5F5F5;">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e2e2e2;">
    <div style="background:#1A2233;color:#fff;padding:18px 24px;">
      <span style="background:#BA7517;color:#fff;font-weight:bold;padding:4px 10px;border-radius:999px;font-size:13px;letter-spacing:0.5px;">Q-DISPATCH</span>
      <span style="margin-left:10px;font-size:14px;">${HOSPITAL_NAME}</span>
    </div>
    <div style="padding:24px;">
      <h2 style="margin:0 0 16px;font-size:18px;">Cashless Insurance Claim Submission</h2>

      <h3 style="font-size:14px;color:#BA7517;margin:18px 0 6px;">Patient details</h3>
      <table style="font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Name</td><td><strong>${escapeHtml(claim.patient_name)}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Date of birth</td><td>${escapeHtml(claim.patient_dob || 'N/A')}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Policy number</td><td>${escapeHtml(claim.policy_number)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Insurer</td><td>${escapeHtml(claim.insurer)}</td></tr>
      </table>

      <h3 style="font-size:14px;color:#BA7517;margin:18px 0 6px;">Clinical</h3>
      <table style="font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Diagnosis</td><td>${escapeHtml(claim.diagnosis)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">ICD-10 code</td><td><strong>${escapeHtml(claim.icd_code)}</strong></td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Treating doctor</td><td>${escapeHtml(claim.doctor_name)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Admission</td><td>${escapeHtml(claim.admission_date)}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;color:#666;">Discharge</td><td>${escapeHtml(claim.discharge_date)}</td></tr>
      </table>

      <h3 style="font-size:14px;color:#BA7517;margin:18px 0 6px;">Itemised bill</h3>
      <table style="font-size:13px;border-collapse:collapse;width:100%;">
        <thead>
          <tr style="background:#FAEEDA;">
            <th style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">#</th>
            <th style="padding:6px 10px;border:1px solid #e2e2e2;text-align:left;">Description</th>
            <th style="padding:6px 10px;border:1px solid #e2e2e2;text-align:left;">Code</th>
            <th style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">Qty</th>
            <th style="padding:6px 10px;border:1px solid #e2e2e2;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr>
            <td colspan="4" style="padding:8px 10px;border:1px solid #e2e2e2;text-align:right;font-weight:bold;">Total claim amount</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;text-align:right;font-weight:bold;">₹${formatINR(claim.total_amount)}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin:20px 0;padding:12px 16px;background:#FAEEDA;border-left:4px solid #BA7517;border-radius:4px;">
        <div style="font-size:12px;color:#666;">Tracking reference</div>
        <div style="font-size:16px;font-weight:bold;letter-spacing:0.5px;">${escapeHtml(token)}</div>
        <div style="font-size:12px;color:#666;margin-top:6px;">Please quote this reference in your reply so we can match your decision automatically.</div>
      </div>
    </div>
    <div style="padding:14px 24px;background:#1A2233;color:#cfd6e4;font-size:12px;text-align:center;">
      Submitted via Q-Dispatch | Quantum AI Ltd. | quantumai.co.uk
    </div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export async function sendAppeal(
  claim: Claim,
  appealText: string
): Promise<{ dispatchEmail: string }> {
  const dispatchEmail = insurerEmailForCode(claim.insurer_code);
  const subject = `Appeal / Representation — Claim ${claim.tracking_token || ''} — ${claim.patient_name} — Policy ${claim.policy_number}`;

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: dispatchEmail,
    subject,
    text: `${appealText}\n\n— Submitted via Q-Dispatch | Quantum AI Ltd. | quantumai.co.uk`,
  });

  return { dispatchEmail };
}

export async function dispatchClaim(
  claim: Claim,
  items: BillItem[],
  token: string
): Promise<{ dispatchEmail: string }> {
  const dispatchEmail = insurerEmailForCode(claim.insurer_code);

  const subject = `Cashless Claim Submission — ${claim.patient_name} — Policy ${claim.policy_number} — Ref: ${token}`;

  await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: dispatchEmail,
    subject,
    text: buildPlainBody(claim, items, token),
    html: buildHtmlBody(claim, items, token),
  });

  return { dispatchEmail };
}
