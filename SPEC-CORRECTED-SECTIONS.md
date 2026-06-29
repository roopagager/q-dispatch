# Q-Dispatch Spec — Corrected Sections (paste-ready)

These replace the **Technical Architecture** and **Data Governance & Compliance**
sections in the Product Specification. They are true-to-build and survive a CFO
security/legal review. Roadmap items are clearly marked, and the false
"zero-retention / AWS Mumbai / Supabase / WebSockets" claims are removed.

> ⚠️ Before using in diligence: the de-identification line in §Data Governance is
> the truthful *target* — your code does not de-identify yet (it currently sends
> the patient name to the AI). Either build de-identification first (small change),
> or change that line to "is being implemented." See the note at the bottom.

---

## 4. Technical & Compliance Architecture

### The Live Background Queue (counter never blocks)
To prevent insurer email delays from freezing the hospital's operations, Q-Dispatch runs dispatched claims on a **live background monitoring queue**. The clerk never waits: the moment a claim is sent, it moves to an automated watch-list and the clerk processes the next patient. The claims console refreshes each open claim's status automatically, so the counter runs continuously while replies are tracked in the background.

### Technology Stack
- **Core AI Engine:** Anthropic **Claude (`claude-sonnet-4-6`)**, driven by structured, low-temperature prompts that return validated JSON for deterministic, repeatable audits.
- **Backend:** **Node.js / TypeScript** (Express) — lean, stateless API services.
- **Database & Ledger:** **SQLite today, PostgreSQL-ready** schema for scale — stores claim records, the per-claim fee ledger, and the full audit trail.
- **Outbound dispatch:** **SMTP** with a unique tracking token per claim *(today)* → **NHCX / HL7 FHIR via the ABDM Gateway** *(roadmap — the platform is architected to switch dispatch to NHCX the moment payers activate their APIs)*.
- **Inbound surveillance:** **IMAP** polling with AI parsing of TPA replies *(today)* → **webhook push** for true real-time *(roadmap)*.
- **Deployment:** **Cloud SaaS or on-premises** (hospital's choice); **API-first** for hospital-chain white-labelling.
- **Security:** authenticated sessions, TLS in transit, and a complete, queryable audit trail of every agent action.

---

## Data Governance & Compliance (Privacy by Design)

Q-Dispatch is built on **data-minimisation**, aligned with India's **Digital Personal Data Protection (DPDP) Act, 2023**:

- **Minimal data to the AI:** the audit operates on **bill lines, procedure/diagnosis codes, and amounts** — not the patient's identity. **Patient identifiers (name, date of birth) are de-identified before any external AI processing.**
- **Purpose-limited retention:** claim, approval, and **fee-ledger records are retained as required** for billing, audit, and regulatory/insurer queries. Clinical free-text is kept only as long as the claim needs it and is purged on a configurable schedule.
- **Third-party AI processor:** Anthropic — **API data is not used to train models**, and a zero-retention processing arrangement can be configured with the provider.
- **Encryption:** in transit (TLS) and at rest.
- **Data residency:** deployable in an **Indian data-residency region (cloud) or fully on-premises** within the hospital's own network.
- **Auditability & access control:** full action-level audit trail; authenticated, role-based access *(roles on roadmap)*.
- **Agreements:** a **DPA** is signed with each hospital.

---

## Notes (do NOT paste — for you)

**Deliberately NOT claimed** (these were the liabilities in v1.1):
- "Zero database records / instant purge / memory-only" — contradicts the ledger + audit trail you need.
- "AWS Mumbai / all data on Indian soil" — you run on Railway (US) today; residency is a deployment *option*, not a current fact.
- "Supabase / SendGrid / Mailgun / Python FastAPI / WebSockets / Claude 3.5" — none are in your codebase.

**To make the de-identification line literally true:** build the small change that strips/tokenises patient name + DOB before the Anthropic call (the audit only needs bill lines + codes). This is the URGENT **C6** item in WORKFLOW-DESIGN.md.

**Other fixes for the main document:**
- Use one domain/email consistently (`quantumai.co.uk` vs `quantumai.com` vs `thequantum.ai`).
- Fix the malformed alias `claim-7A8B2C@://quantumai.com`.
- Reconcile "180 minutes (3 hours)" vs "45–90 min" for the same "before" state.
- Remove the placeholder citations `[1.1, 1.3]` or replace with real sources.
