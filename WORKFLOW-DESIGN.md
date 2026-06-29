# Q-Dispatch — Workflow Design & Decisions Log

Purpose: agree the **complete** end-to-end workflow and lock every open decision
**before** the next build, so we ship all changes in one coherent release
instead of patching feature-by-feature.

How to use this doc: read the workflow, then go through **Part C — Decisions to
Lock** and mark each one. Once it's filled in, that's the build spec.

### North-star objective & principles  *(agreed)*
- **The agent's accuracy IS the product.** The single goal is a **first-pass-right submission** — clean, complete, correctly coded — so the claim is approved on the first pass with no queries or rejections. Everything else serves this. *(see C18)*
- **First-pass-right → speed.** Accuracy removes the query/rejection delays; a clean claim takes the insurer's fast path. The full **10-minute close** is real where the insurer auto-adjudicates (NHCX/digital); elsewhere accuracy still cuts hours/days of rework. *(see C19)*
- **Real product, not a dummy.** The demo must be the actual working system (real AI, real data, live cloud) — no faked/mock screens. Production-grade look and behaviour. *(see C20)*
- **Flag, don't block.** The agent advises; admin staff decide; every choice is logged. *(C12)*

---

## Part A — Actors

| Actor | Role |
|---|---|
| **Billing staff** | Enter patient, bill, and documents at the counter; fix flagged items |
| **Q-Dispatch AI agent** | Audit bill + documents, dispatch, read replies, calculate clearance |
| **Insurer / TPA** | Receives claim, replies with a decision |
| **Counter / patient** | Pays the copay at discharge |
| **Hospital management** | Sees quality insights and the monthly fee invoice |

---

## Part B — End-to-end workflow (every action)

### Stage 1 — Packet Assembly & Pre-Audit
1. **Staff:** enter patient + policy + insurer + diagnosis/ICD + itemised bill.
2. **Staff:** tick the supporting documents attached.
3. **Agent:** AI audits each bill line **thoroughly** (vague item, missing qty, bad code, ₹0, non-payable) — this is where we aim for *first-time-right*, because bill errors cost the most.
4. **Agent:** documents = **light reminder only** (a simple "did you attach these?" checklist). Authoritative document handling happens at Stage 3 from the insurer's actual reply (see C14). No strict per-insurer document enforcement upfront.
5. **Decision point — FLAG ONLY, staff decide (locked):**
   - The agent **flags** issues and missing items/documents but **never hard-blocks**. Admin staff stay in full control.
   - Staff can **fix** it or **leave it and proceed**; choices are **logged** (audit trail) so nobody is exposed if the insurer queries it later.
   - Flags are ranked by severity (error / warning) only as *guidance*, not as a gate.
6. **Auto-suggest (C13):** for a missing **procedure code** or empty **column**, the agent proposes a likely value the clerk accepts with one click — fills the gap fast instead of bouncing it back.
7. **Correction loop:** fix / attach / accept-suggestion → re-audit → done.

### Stage 2 — Instant Dispatch
6. **Agent:** convert validated claim to NHCX-compatible JSON.
7. **Agent:** generate tracking token, email the insurer, log submission, arm inbox.

### Stage 3 — Smart Inbox Surveillance
8. **Insurer:** replies by email (approve / partial / reject / more-info).
9. **Agent:** poll inbox, match token, AI parses decision + amounts + deductions + documents requested.
10. **Decision point:** more-info → surface the document list for staff to send.

### Stage 4 — Counter Clearance
11. **Agent:** copay = total − approved (deterministic; never AI).
12. **Agent:** log 0.5% service fee to the **hospital** ledger (never the patient).
13. **Counter:** patient pays copay; claim marked CLEARED.

### Cross-cutting
- **Management:** Audit Insights (staff quality) + monthly fee invoice.
- **Audit trail:** every agent action logged with full input/output.

---

## Part C — Decisions to Lock (fill these in)

> Mark each: ✅ decided (with the answer), or ❓ need input. Anything that needs
> source data (e.g. real insurer policies) note who provides it.

### C1. Per-insurer policy  *(narrowed — documents now reactive, see C14)*
- [x] **Documents:** no longer need per-insurer document checklists upfront — handled reactively from the insurer's reply. *(decided)*
- [ ] **Still per-insurer:** the correct **email address** per insurer (C5), and optionally any insurer-specific **bill formatting** the claim email should use.
- [ ] Optional later: per-insurer **bill rules** (e.g. room-rent caps, sub-limits) — only if you have them; not required for go-live.

### C2. Document catalog
- [ ] Final list of document types (current draft: pre-auth, discharge summary, itemised bill, ID/policy, pharmacy bill, investigation reports, operative notes, implant invoice).
- [ ] Any others your team uses? (e.g. MLC/police report, ICP/case sheet, prior consultation notes, NEFT/bank mandate.)

### C3. Blocking vs. warning rules
- [ ] Which findings **block** dispatch vs. just **warn**? (today: ERROR items + missing required docs block; warnings allow with acknowledgement.)

### C4. Users & roles
- [ ] Individual **staff accounts** (needed for per-staff insights & audit-by-user)?
- [ ] Roles: clerk vs. supervisor vs. management (who can dispatch / override / see fees)?

### C5. Real email (go-live)
- [ ] Outbound **SMTP** for real dispatch (sender mailbox + app password)?
- [ ] Inbound **IMAP** reply mailbox to monitor?
- [ ] Real **insurer/TPA email addresses** per insurer (or test mailboxes for UAT)?

### C6. Data privacy  🚨 **URGENT — currently over-claimed**
The spec states *"No PII retained by Quantum AI / data within the hospital perimeter"* — but **today patient data is sent to Anthropic's cloud API.** This must be fixed before any client/investor diligence, or the claim is false.
- [ ] **De-identify** patient name/DOB before the AI call (audit only needs bill lines) — closes the gap cheaply. **Highest priority.**
- [ ] Or **on-prem / local-model** option for the on-prem deployments the spec promises.
- [ ] DPA in place; DPDP Act 2023 data-retention stance documented.

### C7. Hospital & branding
- [ ] Single hospital or multi-hospital? (today "Jubilee Hospital" hardcoded.)
- [ ] Branding (logo, name, colours) — keep current amber/navy or adjust?

### C8. Fee & invoicing
- [ ] Confirm **0.5%** rate and that it's hospital-charged only.
- [ ] Monthly invoice: format, recipient, and whether it auto-generates.

### C9. Persistence & environments
- [ ] UAT environment with a **persistent volume** (so testers' data survives)?
- [ ] Backups / export?

### C10. Edit & correction flow
- [ ] Should staff be able to **edit a saved draft** (today re-audit uses stored data)? Add an update step?

### C11. Reporting
- [ ] Beyond Audit Insights: claim turnaround time, approval/rejection rates, deduction trends per insurer?

### C12. Staff experience & trust  *(critical for adoption)*
Risk: staff feel the system **wrongly blocks correct work** and blame the agent.
Mitigations to choose from:
- [ ] **Soft vs hard stops:** hard-block ONLY genuine errors (₹0, truncated code) and insurer-mandatory documents. Everything else is an **advisory warning** the clerk can accept and proceed.
- [ ] **Override with reason:** allow staff to override a flag with a one-line reason (logged), instead of being stuck. Supervisor override for hard stops.
- [ ] **Blame-free, helpful framing:** every flag explains *why the insurer would reject/deduct it* and suggests the fix — the agent **protects the clerk from a rejection**, it isn't policing them.
- [ ] **Precision first:** when the AI is unsure, it **warns (soft)**, never hard-blocks. Wrong/over-strict flags are the #1 cause of complaints — so per-insurer rules must be accurate (ties to C1).
- [ ] **"Disagree" feedback:** a one-click "this flag is wrong" that logs feedback and tunes the rules — gives staff a voice.
- [ ] **Insights = coaching, not surveillance:** per-staff data used for support/training, visible to management only, not punitive.
- [x] **Stance: FLAG ONLY** — agent advises, admin staff decide; nothing is hard-blocked. *(decided)*

### C13. Auto-suggest / auto-fill  *(your point)*
- [ ] **Missing procedure code:** agent suggests the likely code from the description (e.g. "Laparoscopic cholecystectomy" → CPT 47562); clerk **one-click accepts**. (~1–2s — it's an AI lookup, not truly milliseconds; confirm-before-use so a wrong code never silently goes to the insurer = upcoding/compliance risk.)
- [ ] **Missing column (unit / qty default / formatting):** low-risk fields **auto-filled instantly** (milliseconds, deterministic).
- [ ] **Rule:** suggest-and-confirm for anything that reaches the insurer (codes, amounts); silent auto-fill only for cosmetic/low-risk fields.

### C14. Missing-document handling  *(decided: reactive)*
- [x] **Documents are handled reactively** — the insurer's reply is the source of truth. *(decided)*
- [x] **Stage 1:** only a **light, optional reminder checklist** — never blocks, never strict per-insurer enforcement.
- [x] **Stage 3 (authoritative):** when the insurer replies MORE_INFO, the agent reads it and lists **exactly** which documents they want; staff send those.
- [ ] **Future:** real file **upload** so documents can attach to the claim email.
- **Impact:** removes the need for exact per-insurer document policies → **C1 narrows to bill-level rules only** (which we already do well).

### C15. HIS integration & auto-pull  *(vision — not built)*
- [ ] **Auto-trigger** on a clinical event (e.g. doctor signs the exit/discharge sheet) instead of the clerk starting it manually.
- [ ] **Auto-pull from the hospital HIS:** billing lines + procedure codes, doctor's notes, discharge summary, ICD-10, lab/imaging references.
- [ ] Needs: HIS vendor + integration method (HL7/FHIR, API, DB view, or file export). **Which HIS does the hospital run?**
- *Today:* clerk enters the bill manually (no HIS link).

### C16. Insurer approved-code-list & policy-schedule audit  *(vision — partial)*
- [ ] Audit codes against each **insurer's approved code list**, and line items against the **patient's policy schedule** (exclusions/sub-limits).
- [ ] Needs the actual code lists + policy schedules per insurer/policy — **source of truth?** (same data question as C1.)
- *Today:* audit uses general medical-billing rules (vague items, qty, truncated codes, common non-payables) — not insurer-specific code lists or per-policy exclusions.

### C17. Clinical-document ingestion  *(vision — not built)*
- [ ] Feed discharge summary / doctor's notes / lab & imaging reports into the audit (cross-check bill vs. clinical record).
- *Today:* audit reads bill lines only.

### C18. AGENT OPTIMISATION  *(the core priority — first-pass-right submission)*
**Progress:** ✅ Eval harness built (`npm run eval`). ✅ Deterministic/AI split shipped. **Measured benchmark: 100% recall, 100% precision, 100% F1, 97.4% exact accuracy** (38-line golden set). Remaining: self-verification pass, grow the dataset with real anonymised claims, grounding (C16), feedback loop.

Goal: maximise **recall** (catch every real rejection trigger) and **precision** (don't false-flag correct work). Levers, in order:
1. **Measure first — eval harness:** a test set of realistic claims with *known* issues + clean ones; measure precision/recall on every change. **You can't optimise what you don't measure.**
2. **Deterministic vs AI split:** move exact checks into code (amount math, ₹0/negative, date logic, code format/length, qty-vs-stay-days, duplicate/unbundled lines). Use the AI only for judgment (vague descriptions, clinical consistency, right-procedure). Removes a whole class of AI errors + false positives.
3. **Expand rule coverage** beyond today's 6: code↔description mismatch, ICD↔procedure consistency, quantity vs admission days, date inconsistencies, implant-without-invoice, pharmacy sanity, tariff anomalies.
4. **Self-verification pass:** agent re-checks its own flags ("is this really an issue or a false positive?") before showing the clerk — cuts the false flags that annoy staff (C12).
5. **Grounding with reference data** (when available): insurer approved code lists, CPT/ICD maps, policy exclusions via retrieval → checks against real lists, not just general knowledge. *(needs the data — C16.)*
6. **Feedback loop:** capture insurer outcomes (approved/queried/rejected + reason) and staff "disagree" clicks → refine rules continuously; the agent learns what actually prevents rejections at this hospital.
- **First build step (recommended):** the **eval harness** — a test set of realistic claims with known issues, scored on precision/recall — so accuracy becomes a *measurable number*, not a claim. Then levers 2–4 (no external data needed).

### C19. Speed & turnaround (SLA)
- [ ] **Hospital-side workflow** (assemble → audit → dispatch → parse reply → clear): target **under 10 minutes** of work; reply caught within 90s of arrival. *(Q-Dispatch controls this.)*
- [ ] **Insurer reply time** is outside our control: IRDAI targets ~1h cashless auth / ~3h discharge; often longer; minutes only where auto-adjudicated.
- [ ] **10-minute end-to-end close** = our accuracy **+** insurer auto-adjudication (NHCX/digital). Position accordingly — don't promise a 10-minute *insurer* reply.

### C20. Product quality / demo realism  *(agreed)*
- [x] Demo = the **real working system** (live cloud, real AI, real data) — no dummy/mock screens. *(decided)*
- [ ] **UI polish** to a modern, production-grade SaaS look (current UI is functional but basic).
- [ ] **HIS auto-pull built real** — agent ingests a real export format (FHIR/HL7/CSV), not a fake "pull" button. *(ties to C15.)*
- [ ] Optional: modern-framework UI rebuild for premium feel (bigger effort).

---

### C21. NHCX / ABDM Gateway dispatch  🔴 *(spec headline — not built)*
- [ ] Submit via **NHCX v1.2 / HL7 FHIR** through the ABDM NHCX Gateway instead of SMTP email.
- [ ] Needs NHCX certification/sandbox access. *Today: email via SMTP.* This is the spec's "why now" differentiator.

### C22. SaaS subscription & billing  🔴 *(spec revenue model — not built)*
- [ ] Per-hospital SaaS licence (₹8k–25k/mo) + auto-generated **monthly fee invoice** (0.5% rollup). *Today: fee logged, invoice not generated/sent.*

### C23. Deployment options  🟡
- [ ] **On-prem** option (spec promises data-stays-in-hospital). *Today: cloud (Railway) only.*
- [ ] Multi-hospital / white-label (today "Jubilee Hospital" hardcoded — ties C7).

### C24. Predictive approval score  🆕 *(market trend — stand out)*
- [ ] Before dispatch, predict **approval likelihood + expected deduction**, so the hospital knows what to expect.

### C25. Denial management / auto-appeal  🆕 *(spec Phase 4 — high ROI)*
- [ ] Auto-draft appeals for rejected/short-paid claims. 18–24% rejection rate → recovering these is major ROI.

### C26. Fraud / upcoding / duplicate detection  🆕
- [ ] Flag anomalies (duplicates, unbundling, upcoding) — protects the hospital's standing with insurers.

### C27. Real-time eligibility & coverage check  🆕
- [ ] Verify the policy is active and the procedure covered **before** discharge, not after.

### C28. Patient notifications  🆕
- [ ] **WhatsApp/SMS** to the patient: claim status + final copay.

### C29. RCM analytics dashboard  🆕 *(extends C11)*
- [ ] Rejection trends, deduction patterns per insurer, turnaround/SLA, **revenue-leakage recovered.**

### C30. Multi-channel submission fallback  🆕
- [ ] NHCX where available; **portal-RPA / email fallback** where the insurer isn't on NHCX yet (pragmatic for 2025–26).

---

## Part D — Consolidated build order (one release, sequenced)

Sequenced so the product becomes **honest first → real → standout**:

**Tier 0 — Honesty & foundation (do first)**
1. **Eval harness** (C18) — make accuracy a measured number.
2. **De-identification** (C6) 🚨 — close the privacy over-claim before any diligence.

**Tier 1 — Core accuracy (no external data needed)**
3. Deterministic/AI split + expanded rules + self-verification (C18).
4. Auto-suggest missing code / fill columns (C13).
5. Flag-only + logged overrides + "disagree" feedback (C12).

**Tier 2 — Make the spec real (the headline gaps)**
6. **NHCX/ABDM dispatch** (C21) + multi-channel fallback (C30).
7. **HIS connector / auto-pull** (C15) + clinical-doc ingestion (C17).
8. Live email for non-NHCX insurers (C5).

**Tier 3 — Productise**
9. Accounts & roles (C4), SaaS billing + invoice generation (C22), on-prem/multi-hospital (C23, C7).
10. RCM analytics dashboard (C29, C11).

**Tier 4 — Stand out (market trends)**
11. Predictive approval score (C24), denial auto-appeal (C25), fraud detection (C26), eligibility check (C27), patient notifications (C28).

**Data-dependent (slot in when sources arrive):** insurer approved-code-lists & policy schedules (C16), per-insurer bill rules (C1).

*Status: DRAFT — review Parts A/B/C together, then say "lock it" to freeze the spec and start Tier 0.*
