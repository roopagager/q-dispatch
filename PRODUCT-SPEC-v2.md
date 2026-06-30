# QUANTUM AI LTD. — Product Specification & Investment Brief
## Q-Dispatch — AI-Powered Hospital Claim Dispatch & Clearance Platform

*Version 2.0 · Confidential · Quantum AI Ltd. · quantumai.co.uk*
*Live demo: https://q-dispatch-production.up.railway.app/*

> **Status legend:** ✅ Live & verified today · 🟡 Partial · 🛣️ Roadmap (clearly marked so nothing is over-claimed).

---

## 1. Executive Summary

India processes ~50 million cashless health-insurance claims a year. Most are handled by hospital billing clerks manually — keying data into insurer portals, uploading documents, reading reply emails, and calculating copay — averaging 45–90 minutes per patient with an 18–24% rejection rate.

Q-Dispatch is an AI agent at the discharge counter that owns the claim lifecycle: it ingests the bill, audits it, predicts the outcome, dispatches it, reads the insurer's reply, clears the counter, and even drafts appeals for rejections. The **hospital-side workflow runs in under 10 minutes**; total time-to-clear then depends on the insurer's response (instant where they auto-adjudicate via NHCX).

**Measured today (audit benchmark, 38 lines):** 100% recall (catches every rejection trigger), 100% precision, 97.4% exact accuracy.

| Metric | Before | With Q-Dispatch (today) | NHCX future |
|---|---|---|---|
| Hospital-side processing | 45–90 min | **< 10 min** ✅ | < 2 min |
| Insurer reply | 2–3 hrs (email) | tracked asynchronously ✅ | < 5 min (API) |
| Rejection triggers caught pre-submission | — | **100% on benchmark** ✅ | — |
| Copay calculation | manual, error-prone | instant, exact ✅ | instant |
| Clerk portal logins | 5–8 / claim | 0 ✅ | 0 |

---

## 2. The Problem

At every private-hospital billing counter: vague bill items ("Medicine", "Surgical Kit") trigger rejections; truncated/incorrect codes cause re-submissions; unstructured TPA reply emails bury the approved figures; clerks juggle 4–6 insurer portals with no claim visibility; and patients wait at the desk while cash flow and ward beds stay blocked.

---

## 3. The Solution — Q-Dispatch (what's built)

**Ingestion ✅** — Parses a real HIS export (HL7 FHIR R4 bundle or CSV billing export) into a claim packet for the clerk to review. *(Live auto-trigger from the HIS feed at discharge: 🛣️ at go-live; the parser that consumes it is built.)*

### Stage 1 — Packet Assembly & Pre-Audit ✅
- **AI pre-audit** flags vague descriptions, missing quantities, truncated/missing codes, ₹0/negative amounts, and non-payable items.
- **Hybrid engine:** exact rules run deterministically (in code); the AI handles only the vague-description judgement (temperature 0, repeatable). **Result: 100% recall, 100% precision on the benchmark.**
- **PHI de-identified** before any AI call (the audit sees bill lines + codes, never the patient's identity). ✅
- **Document completeness** check (flag-only; staff decide). ✅
- **Predictive approval score** — likely approved amount, certain (non-payable) deduction with exact figures, and explainable risk factors, *before* dispatch. ✅
- Findings are surfaced to the clerk to correct in seconds; the agent advises, the clerk decides, every choice is logged.

### Stage 2 — Instant Dispatch ✅
- Builds an **NHCX-aligned HL7 FHIR R4 Claim bundle** (NRCES profile) — viewable in the app. ✅
- **Multi-channel:** transmits via the **NHCX/ABDM gateway** when onboarded (`DISPATCH_CHANNEL=nhcx`), with **email fallback** today. 🟡
- Unique tracking token embedded; submission logged; inbox surveillance armed.

### Stage 3 — Smart Inbox Surveillance ✅
- Polls the reply inbox; the AI reads the TPA reply and extracts decision (approved/partial/rejected/more-info), approval reference, approved & deducted amounts, deduction reasons, and documents requested. *(Patient identifiers redacted before the AI call.)*

### Stage 4 — Automated Counter Clearance ✅
- Computes patient copay = total − approved (deterministic, never AI); pushes it to the counter.
- Logs the **0.5% Quantum AI fee to the hospital ledger** — deducted from the insurer reimbursement, **never charged to the patient**; bundled into a monthly invoice.

### Denial Management ✅
- For a rejected or short-paid claim, the agent **drafts a reasoned appeal letter** contesting each deduction; the clerk reviews/edits and sends. Human-in-the-loop, nothing auto-sent.

### Management ✅
- **Audit Insights** — staff data-entry quality (first-pass clean rate, common mistakes).
- **Eval harness** — agent accuracy is a measured number (`npm run eval`), not a claim.

---

## 4. Technical Architecture (true-to-build)

- **AI:** Anthropic **Claude (`claude-sonnet-4-6`)**, structured low-temperature (0) prompts → validated JSON.
- **Backend:** Node.js / TypeScript (Express), stateless API services.
- **Database & ledger:** SQLite today, **PostgreSQL-ready** schema; per-claim fee ledger + full audit trail.
- **Dispatch:** SMTP today → **NHCX / HL7 FHIR via ABDM gateway** 🛣️ (architected, activates on onboarding).
- **Inbound:** IMAP polling + AI parsing today → webhook push 🛣️.
- **HIS:** FHIR/CSV ingestion built; live HIS connector/auto-trigger 🛣️.
- **Deployment:** cloud SaaS (live on Railway) or on-premises; API-first for white-label.
- **The live background queue** keeps the counter moving while claims are tracked asynchronously.

---

## 5. Data Governance & Compliance (Privacy by Design)

Aligned with India's **DPDP Act, 2023**, on data-minimisation:
- **De-identified AI processing** — patient name/DOB are removed before any external AI call (the audit needs only bill lines + codes; reply parsing redacts identifiers). ✅
- **Purpose-limited retention** — claim, approval, and fee-ledger records retained as required for billing, audit, and regulatory queries; clinical free-text purged on a configurable schedule.
- **AI processor:** Anthropic — API data is not used to train models; a zero-retention processing arrangement can be configured.
- **Encryption** in transit (TLS) and at rest; full action-level **audit trail**; authenticated access (role-based access 🛣️).
- **Data residency:** deployable in an Indian region (cloud) or fully on-premises. A DPA is signed with each hospital.

> *Deliberately not claimed:* "zero database records / memory-only purge" — that is incompatible with the ledger and audit trail the product (and regulators) require.

---

## 6. Commercial Model

**Pure performance pricing:** ₹0 upfront, ₹0 subscription, a flat **0.5% of the approved claim value**, charged to the hospital (deducted from the insurer reimbursement, never the patient), invoiced monthly.

*Illustrative — 100-bed hospital:* ~240 cashless claims/month × ₹60,000 avg → ~₹72,000/month (₹8.64 lakh/yr) at 0.5%.

---

## 7. Roadmap

🛣️ Live NHCX gateway transmission (ABDM onboarding) · HIS auto-trigger/connector · clinical-document ingestion into the audit · accounts & roles · SaaS billing/invoice generation · on-prem packaging · RCM analytics dashboard · fraud/upcoding detection · real-time eligibility check · patient WhatsApp/SMS · agent self-verification + outcome feedback loop.

---

## 8. The Ask

Pilot partnership with 2–3 private hospitals (Hyderabad / Bangalore): free 90-day pilot, free HIS integration, pre-audit that cuts rejections from day one, and a guaranteed sub-10-minute hospital-side processing SLA (fee waived per claim if missed). In return: access to 10–20 cashless claims/week and feedback sessions.

*Contact: Ajay, Founder & CEO · hello@quantumai.co.uk · quantumai.co.uk*
*© 2025 Quantum AI Ltd. — Confidential.*
