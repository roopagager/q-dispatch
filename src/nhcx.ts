// ============================================================================
// Q-Dispatch — NHCX / HL7 FHIR R4 claim bundle
//
// Builds the NHCX-compatible FHIR Claim Bundle that the ABDM National Health
// Claims Exchange expects. The bundle generation is real and standards-aligned;
// transmitting it to the live NHCX gateway requires ABDM participant onboarding
// (credentials + endpoint), wired here behind NHCX_ENDPOINT so it activates the
// moment those are available. Until then, dispatch falls back to email.
//
// NOTE on privacy: unlike the AI audit (which is de-identified), the claim sent
// to the INSURER legitimately includes patient identity — the insurer needs it
// to adjudicate. De-identification applies only to third-party AI processing.
// ============================================================================

import https from 'https';
import { Claim, BillItem } from './types';

const HOSPITAL_NAME = 'Jubilee Hospital';
const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';
const NRCES_CLAIM_PROFILE =
  'https://nrces.in/ndhm/fhir/r4/StructureDefinition/Claim';

export interface FhirBundle {
  resourceType: 'Bundle';
  type: string;
  meta: { profile: string[] };
  timestamp: string;
  entry: Array<{ fullUrl: string; resource: Record<string, unknown> }>;
}

/**
 * Build an NHCX-aligned FHIR R4 Claim Bundle for a validated claim.
 * Deterministic (ids derived from the claim id) so the payload is repeatable.
 */
export function buildNhcxClaimBundle(
  claim: Claim,
  items: BillItem[]
): FhirBundle {
  const pid = `patient-${claim.id}`;
  const cid = `coverage-${claim.id}`;
  const provId = 'org-provider';
  const insId = `org-insurer-${claim.insurer_code}`;
  const claimId = `claim-${claim.id}`;
  const created =
    claim.dispatched_at || claim.updated_at || claim.created_at || '';

  const patient = {
    resourceType: 'Patient',
    id: pid,
    name: [{ text: claim.patient_name }],
    ...(claim.patient_dob ? { birthDate: claim.patient_dob } : {}),
    identifier: [
      {
        system: 'https://quantumai.co.uk/fhir/policy-number',
        value: claim.policy_number,
      },
    ],
  };

  const coverage = {
    resourceType: 'Coverage',
    id: cid,
    status: 'active',
    subscriberId: claim.policy_number,
    beneficiary: { reference: `Patient/${pid}` },
    payor: [{ reference: `Organization/${insId}`, display: claim.insurer }],
  };

  const providerOrg = {
    resourceType: 'Organization',
    id: provId,
    name: HOSPITAL_NAME,
    type: [
      {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'prov',
            display: 'Healthcare Provider',
          },
        ],
      },
    ],
  };

  const insurerOrg = {
    resourceType: 'Organization',
    id: insId,
    name: claim.insurer,
    type: [
      {
        coding: [
          {
            system:
              'http://terminology.hl7.org/CodeSystem/organization-type',
            code: 'pay',
            display: 'Payer',
          },
        ],
      },
    ],
  };

  const claimResource = {
    resourceType: 'Claim',
    id: claimId,
    meta: { profile: [NRCES_CLAIM_PROFILE] },
    ...(claim.tracking_token
      ? {
          identifier: [
            {
              system: 'https://quantumai.co.uk/fhir/tracking-token',
              value: claim.tracking_token,
            },
          ],
        }
      : {}),
    status: 'active',
    type: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/claim-type',
          code: 'institutional',
          display: 'Institutional',
        },
      ],
    },
    use: 'preauthorization',
    patient: { reference: `Patient/${pid}`, display: claim.patient_name },
    created,
    insurer: { reference: `Organization/${insId}`, display: claim.insurer },
    provider: { reference: `Organization/${provId}`, display: HOSPITAL_NAME },
    priority: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/processpriority',
          code: 'normal',
        },
      ],
    },
    diagnosis: [
      {
        sequence: 1,
        diagnosisCodeableConcept: {
          coding: [
            {
              system: ICD10_SYSTEM,
              code: claim.icd_code,
              display: claim.diagnosis,
            },
          ],
          text: claim.diagnosis,
        },
      },
    ],
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: { reference: `Coverage/${cid}` },
      },
    ],
    item: items.map((it) => ({
      sequence: it.line_number,
      productOrService: {
        ...(it.procedure_code
          ? {
              coding: [
                {
                  system: 'https://quantumai.co.uk/fhir/procedure-code',
                  code: it.procedure_code,
                  display: it.description,
                },
              ],
            }
          : {}),
        text: it.description,
      },
      ...(it.quantity != null
        ? {
            quantity: {
              value: it.quantity,
              ...(it.unit ? { unit: it.unit } : {}),
            },
          }
        : {}),
      net: { value: it.amount, currency: 'INR' },
    })),
    total: { value: claim.total_amount, currency: 'INR' },
  };

  const wrap = (resource: Record<string, unknown>) => ({
    fullUrl: `urn:uuid:${resource.resourceType}-${resource.id}`,
    resource,
  });

  return {
    resourceType: 'Bundle',
    type: 'collection',
    meta: { profile: [NRCES_CLAIM_PROFILE] },
    timestamp: created,
    entry: [
      wrap(claimResource),
      wrap(patient),
      wrap(coverage),
      wrap(providerOrg),
      wrap(insurerOrg),
    ],
  };
}

export interface NhcxResult {
  status: number;
  body: string;
}

/**
 * POST a FHIR bundle to a configured NHCX gateway endpoint. Only used when
 * NHCX_ENDPOINT is set (i.e. once ABDM onboarding is complete).
 */
export function postToNhcx(
  bundle: FhirBundle,
  endpoint: string,
  apiKey?: string
): Promise<NhcxResult> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return reject(new Error(`Invalid NHCX_ENDPOINT: ${endpoint}`));
    }
    const payload = JSON.stringify(bundle);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/fhir+json',
          'Content-Length': Buffer.byteLength(payload),
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        timeout: 15000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () =>
          resolve({ status: res.statusCode || 0, body })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('NHCX request timed out'));
    });
    req.write(payload);
    req.end();
  });
}

export function isNhcxEnabled(): boolean {
  return (
    process.env.DISPATCH_CHANNEL === 'nhcx' && !!process.env.NHCX_ENDPOINT
  );
}
