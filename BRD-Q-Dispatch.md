# Business Requirements Document (BRD) — Q-Dispatch

| | |
|---|---|
| **Product** | Q-Dispatch — AI-Powered Hospital Claim Dispatch & Clearance Platform |
| **Owner** | Quantum AI Ltd. (quantumai.co.uk) |
| **Version** | 1.0 |
| **Status legend** | ✅ Built & live · 🟡 Partial · 🛣️ Roadmap |
| **Priority** | MoSCoW — **M**ust / **S**hould / **C**ould / **W**on't (this release) |

---

## 1. Purpose
Define the business and functional requirements for Q-Dispatch — an AI agent that automates the cashless insurance claim lifecycle at a private-hospital discharge counter, from bill assembly to patient payment.

## 2. Business Context & Problem
Indian private hospitals process cashless claims manually: clerks key data into 4–6 insurer portals, upload documents, read unstructured TPA reply emails, and calculate copay by hand. This averages 45–90 minutes per patient and carries an **18–24% rejection rate**, delaying reimbursement, blocking ward beds, and frustrating patients. NHCX (ABDM) is standardising claim APIs, but <1% of hospitals can use them — creating a timing opportunity for a translation layer.

## 3. Business Objectives (measurable)
| ID | Objective | Target |
|---|---|---|
| BO-1 | Cut hospital-side claim processing time | From 45–90 min to **< 10 min** |
| BO-2 | Reduce avoidable claim rejections | Catch **≥ 95%** of rejection triggers pre-submission (measured: 100% recall on benchmark) |
| BO-3 | Eliminate manual portal work | **0** insurer-portal logins per claim |
| BO-4 | Accurate, instant patient copay | **0** copay calculation errors |
| BO-5 | Monetise sustainably without buyer friction | **0.5%** performance fee, ₹0 upfront |
| BO-6 | Recover revenue from denials | Auto-draft appeals for rejected / short-paid claims |

## 4. Stakeholders
| Stakeholder | Interest |
|---|---|
| Billing / counter staff | Faster, error-free claims; not blamed for AI flags |
| Hospital management / CFO | Reduced rejections, faster cash flow, transparent fees |
| Patient | Fast discharge, clear copay, no hidden charges |
| Insurer / TPA | Clean, standards-compliant claims; fewer re-submissions |
| Quantum AI Ltd. | Adoption, fee revenue, defensible/compliant product |
| Regulator (IRDAI / DPDP) | Data protection, auditability, fair billing |

## 5. Scope
**In scope (this release):** the four-stage claim lifecycle (assembly/pre-audit → dispatch → surveillance → clearance), HIS export ingestion (FHIR/CSV), AI audit, document check, predictive score, NHCX-ready FHIR generation, denial appeal drafting, fee ledger, audit insights, login.
**Out of scope (this release):** live NHCX gateway transmission (needs ABDM onboarding), live HIS auto-trigger/connector, multi-hospital/white-label, accounts & roles, SaaS billing automation, patient notifications, on-prem packaging. *(All on the roadmap — see NFR & Delivery Plan.)*

## 6. Business Requirements
| ID | Requirement | Priority |
|---|---|---|
| BR-1 | Validate every bill line before submission to prevent rejections | M |
| BR-2 | Submit claims in the insurer's required standard format | M |
| BR-3 | Read insurer replies automatically and extract the decision | M |
| BR-4 | Calculate and display the exact patient copay | M |
| BR-5 | Charge the 0.5% fee to the hospital only — never the patient | M |
| BR-6 | Keep a complete audit trail of every action | M |
| BR-7 | Protect patient personal data (DPDP-aligned) | M |
| BR-8 | Let staff stay in control — agent advises, human decides | M |
| BR-9 | Predict the likely approval/deduction before dispatch | S |
| BR-10 | Auto-draft appeals for rejected/short-paid claims | S |
| BR-11 | Show management staff data-entry quality insights | S |
| BR-12 | Ingest the hospital's existing HIS export | S |

## 7. Functional Requirements

### Stage 1 — Packet Assembly & Pre-Audit
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-1.1 | Capture patient, policy, insurer, ICD-10, diagnosis, doctor, dates, itemised bill | M | ✅ |
| FR-1.2 | Ingest an HIS export (FHIR R4 bundle / CSV) into the claim | S | ✅ |
| FR-1.3 | AI audit flags vague descriptions (judgement) | M | ✅ |
| FR-1.4 | Deterministic checks: ₹0/negative amount, truncated/missing code, consumable-no-qty, non-payable | M | ✅ |
| FR-1.5 | De-identify patient identity before any AI call | M | ✅ |
| FR-1.6 | Document-completeness check (flag, not block) | S | ✅ |
| FR-1.7 | Predictive approval score (likely approved, certain deduction, risk factors) | S | ✅ |
| FR-1.8 | Surface flags to clerk; allow fix or proceed-with-logged-reason | M | ✅ |

### Stage 2 — Dispatch
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-2.1 | Generate a unique tracking token per claim | M | ✅ |
| FR-2.2 | Build an NHCX-aligned HL7 FHIR R4 claim bundle | M | ✅ |
| FR-2.3 | Transmit via NHCX/ABDM gateway when onboarded | S | 🛣️ |
| FR-2.4 | Email dispatch as fallback / non-NHCX insurers | M | ✅ |
| FR-2.5 | Log dispatch + arm inbox surveillance | M | ✅ |

### Stage 3 — Smart Inbox Surveillance
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-3.1 | Poll the reply inbox and match the tracking token | M | ✅ |
| FR-3.2 | AI parses decision, ref, approved/deducted amounts, reasons, documents requested | M | ✅ |
| FR-3.3 | Redact patient identifiers before the AI parse | M | ✅ |
| FR-3.4 | Webhook (push) reply ingestion | C | 🛣️ |

### Stage 4 — Counter Clearance
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-4.1 | Copay = total − approved (deterministic) | M | ✅ |
| FR-4.2 | Push copay + breakdown to the counter | M | ✅ |
| FR-4.3 | Log 0.5% fee to hospital ledger (never patient); monthly invoice rollup | M | ✅ |
| FR-4.4 | Mark claim CLEARED with timestamp | M | ✅ |

### Cross-cutting
| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-5.1 | Denial management — draft & send appeal (human-in-the-loop) | S | ✅ |
| FR-5.2 | Audit Insights — staff quality report | S | ✅ |
| FR-5.3 | Eval harness — measurable agent accuracy | S | ✅ |
| FR-5.4 | Authenticated access; full audit trail | M | ✅ |
| FR-5.5 | Accounts & role-based access (clerk/supervisor/management) | S | 🛣️ |

## 8. Assumptions
- Hospitals can provide a bill/clinical export (FHIR or CSV) or enter data manually.
- Insurers/TPAs respond by email today; NHCX APIs adopted progressively.
- A valid Anthropic API key and (for live dispatch) SMTP/IMAP credentials are configured.

## 9. Constraints
- Insurer reply time is outside Q-Dispatch's control (regulatory target ~1–3 hrs).
- Live NHCX transmission requires ABDM participant onboarding/certification.
- Per-insurer code lists / policy schedules require source data from the hospital/TPA.

## 10. Dependencies
Anthropic Claude API · hospital HIS (for auto-pull) · ABDM NHCX gateway · insurer/TPA mailboxes · SMTP/IMAP provider · hosting (cloud or on-prem).

## 11. Success Criteria / KPIs
Hospital-side time < 10 min · first-pass clean rate ↑ · rejection rate < 4% target · 100% rejection-trigger recall (measured) · 0 copay errors · adoption (claims/day) · fee revenue per hospital.

## 12. Key Risks (summary — see Delivery Plan for mitigations)
Staff resistance to flags (mitigated: flag-only + override + accuracy) · insurer-dependent turnaround · PHI/privacy compliance · NHCX/HIS integration timelines · over-claiming in collateral (mitigated: honest status labels).
