# Q-Dispatch — Spec Coverage & Gap Analysis

Source: `Q-Dispatch-Product-Spec.docx` (Product Specification & Investment Brief, v1.0).
Compared against: the **built MVP** (live on Railway) + the workflow design.
Legend: ✅ built & matches · 🟡 partial · 🔴 in spec, not built · 🆕 add (market trend).

---

## 1. What's BUILT and matches the spec ✅
- **Stage 3 — Inbox surveillance + AI reply parsing**: decision (approve/partial/reject/more-info), approval ref, approved amount, deductions, deduction reasons, documents requested. **Exactly as specced.**
- **Stage 4 — Counter clearance**: copay calc, payment breakdown, approval ref, **0.5% fee to hospital ledger, never the patient.** Exactly as specced.
- **AI Audit Engine** — Claude Sonnet.
- **Clearance Engine** — Node.js / TypeScript.
- **Ledger Service** — SQLite (PostgreSQL-ready) + monthly invoice rollup.
- **Pre-audit flags** — vague descriptions, missing quantities, truncated/missing codes, common non-payables.
- Tracking token, submission logging, full audit trail, login/auth, 4 insurers configured.
- **Bonus (beyond spec):** Audit Insights (staff-quality report) + document-completeness check.

## 2. PARTIAL — built, but the spec wants more 🟡
| Spec | Today | Gap |
|---|---|---|
| Audit **against insurer's approved code list & policy schedule** | General medical-billing rules | No insurer code lists / per-policy exclusions |
| Procedure code **mismatch** | Flags *truncated/missing* only | No "not in approved list" check |
| Items **excluded under patient's policy** | Flags *common* non-payables | No per-policy exclusion/sub-limit data |
| Deploy **on-prem OR cloud** | Cloud (Railway) only | On-prem option not packaged |
| **White-label / API-first** | Partial | Not productised |
| Monthly invoice | **Logged** | Not generated/sent |

## 3. IN THE SPEC, NOT BUILT — the real gaps 🔴
These are the difference between the investment brief (vision) and the working MVP:
1. **HIS Connector / auto-pull (Stage 1 trigger):** spec says it crawls the HIS for bill + notes + discharge summary + ICD + diagnostics the moment the doctor signs. **Today: clerk enters the bill manually.** *(C15/C17)*
2. **NHCX / ABDM Gateway dispatch (HL7 FHIR / NHCX v1.2):** the headline differentiator and the "why now." **Today: we email the claim via SMTP — not NHCX-native.** *(biggest gap)*
3. **Clinical-document ingestion** into the audit (notes, discharge summary, labs).
4. **SaaS subscription/billing** system — not built.
5. **On-prem deployment + data-stays-in-hospital-network** — cloud only today.
6. **DPDP "no PII retained / processed within hospital perimeter":** today patient data is sent to Anthropic's cloud API. **De-identification not built.** *(C6 — also a compliance + honesty issue, see §5)*
7. **AI denial management / auto-appeal** (spec Phase 4) — future.

## 4. MISSING per market trends — add these to stand out 🆕
Modern revenue-cycle-management (RCM) / health-claims trends the spec doesn't cover:
- **Predictive approval score** — before dispatch, the agent predicts approval likelihood + expected deduction, so the hospital knows what to expect. *(predictive RCM — strong differentiator)*
- **Fraud / upcoding / duplicate detection** — flags anomalies; protects the hospital's standing with insurers.
- **Real-time eligibility & coverage check** — verify the policy is active and the procedure is covered *before* discharge, not after.
- **Patient WhatsApp/SMS** — claim status + final copay sent to the patient. *(patient engagement trend)*
- **RCM analytics dashboard** — rejection trends, deduction patterns per insurer, turnaround/SLA, **revenue-leakage recovered.**
- **Multi-channel submission fallback** — NHCX where available, portal-RPA / email where the insurer isn't on NHCX yet (pragmatic for 2025-26).
- **Denial management / auto-appeal** — pull spec's Phase 4 forward; insurers reject 18-24%, recovering those is huge ROI.
- **Privacy-preserving AI** — de-identify before the AI call, or on-prem/local model option. *(trend + fixes §3.6)*

## 5. "NO HIDDEN" — transparency as a differentiator 🔒
Make transparency an explicit selling point — and make sure every claim is true.
- **No hidden cost to the patient:** 0.5% fee is hospital-only, never on the patient bill. ✅ built — surface it visibly ("patient sees one number").
- **No hidden pricing:** SaaS + 0.5% + setup all stated up front. ✅ in spec.
- **No hidden AI decisions:** every flag explained + logged; "disagree" feedback. ✅ aligned.
- **No hidden data use:** state exactly what leaves the hospital, de-identified, DPDP-compliant. 🔴 **needs de-identification** to be true.

### ⚠️ Claims to align with reality (so nothing is "hidden" if a client/investor probes)
| Spec claim | Reality today | Fix |
|---|---|---|
| "**under 3 min** / guaranteed 3-minute processing" | Hospital-side yes; total depends on insurer | Frame as *hospital-side* time; full close needs insurer auto-adjudication |
| "Rejection rate **< 4%**" | Not yet measured | Build the **eval harness** (C18) to prove the number |
| "**No PII retained** / within hospital perimeter" | PII goes to Anthropic cloud today | **De-identify** (C6) or on-prem model |
| "**NHCX-native** submission" | Email via SMTP today | Build NHCX/ABDM dispatch |
| "Crawls the **HIS**" | Manual entry today | Build HIS connector |
| "ISO 27001-aligned" | Not implemented | Mark as roadmap |

---

## Bottom line
- **The brain + the back half (Stages 3-4, ledger, audit) are real and match the spec.**
- **The front half (HIS auto-pull) and the rails (NHCX dispatch) are the vision, not built** — and they're the two things the spec leans on hardest.
- **Biggest credibility risk:** the privacy claim ("no PII retained") vs. sending data to a cloud LLM — fix with de-identification **before** any client/investor diligence.
- **To stand out:** add predictive approval score + denial auto-appeal + analytics — these are where the market is going and the spec stops short.

*Recommended build order: eval harness → de-identification (close the privacy gap) → NHCX dispatch → HIS connector → predictive/denial modules.*
