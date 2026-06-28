# Q-Dispatch — Pitch & Client Q&A

**Product:** Q-Dispatch — AI-powered hospital insurance claim dispatch platform
**By:** Quantum AI Ltd. (quantumai.co.uk)
**Live demo:** https://q-dispatch-production.up.railway.app/  ·  login `qdispatch_admin`

---

## A. The Product — what it is

**Q: In one line, what does Q-Dispatch do?**
It automates the entire cashless insurance claim process at a hospital billing counter — from checking the bill, to sending it to the insurer, to reading their reply, to telling the patient exactly what to pay — using AI.

**Q: What problem does it solve?**
Today, hospital billing staff manually check bills, email insurers, chase replies, and calculate patient payments. It's slow, error-prone, and claims get rejected for avoidable mistakes. Q-Dispatch does all of this in minutes, with an AI checking every line before it's sent.

**Q: What are the four stages?**
1. **Packet Assembly & Pre-Audit** — clerk enters the bill; AI validates every line item.
2. **Instant Dispatch** — the validated claim is emailed to the insurer with a unique tracking reference.
3. **Smart Inbox Surveillance** — the system watches the reply inbox and the AI reads the insurer's decision automatically.
4. **Counter Clearance** — it calculates the patient's copay and clears them for discharge.

---

## B. The AI

**Q: What AI does it use?**
Anthropic's Claude (model `claude-sonnet-4-6`) — a leading, enterprise-grade AI, the same family used by major companies.

**Q: What exactly does the AI do?**
Two things: (1) **audits the bill** before submission — flagging vague descriptions, missing quantities, bad procedure codes, zero amounts, and non-payable items; and (2) **reads the insurer's reply email** and extracts the decision, approved amount, deductions, and any documents requested.

**Q: Does the AI decide how much money the patient pays?**
**No.** This is important: the AI only *reads and flags*. The actual money calculation — patient pays = total bill − insurer approved amount — is done by **fixed, deterministic code**, not the AI. So the numbers are always exact and reproducible.

**Q: What if the AI makes a mistake?**
A human is always in control. The AI *suggests*; the clerk reviews and decides. Nothing is auto-submitted or auto-paid. Every AI action is logged with its full input and output, so it's fully auditable.

**Q: How accurate is it?**
It applies a strict, fixed rulebook to every line. In testing it correctly catches vague items (e.g. just "Medicine"), missing quantities, and ₹0 amounts every time. For anything uncertain in an insurer reply, it returns a confidence level so staff know when to double-check.

---

## C. Money, Fees & Billing

**Q: How does Quantum AI make money / what's the cost model?**
A **0.5% service fee on the insurer-approved amount** per claim.

**Q: Does the patient pay this fee?**
**Never.** This is a critical point. The 0.5% fee is a **hospital charge** — it is deducted from the reimbursement the hospital receives from the insurer. The patient only ever pays their normal copay (total bill − approved amount). The fee is never shown to or added for the patient. It appears only under "For hospital records."

**Q: How is the fee billed?**
Each claim's fee is logged to a ledger and bundled into a **monthly invoice** to the hospital. So the hospital gets one consolidated bill, not per-transaction charges.

**Q: Example?**
On a ₹1,00,000 bill where the insurer approves ₹77,000: patient pays ₹23,000, hospital is reimbursed ₹77,000, and Quantum AI's fee is ₹385 (0.5% of ₹77,000), logged to the hospital's monthly invoice.

---

## D. Data Privacy & Security

**Q: Where does patient data go? Is it safe?**
Patient and bill details are sent to Anthropic's API only to perform the analysis. Anthropic **does not train its models on API data**, and zero-retention options are available. A Data Processing Agreement can be put in place. We can also **de-identify** the patient name/DOB before the AI call, since the audit only needs the bill lines.

**Q: Is the data encrypted / secure in transit?**
Yes — the app runs over HTTPS, and all communication with the AI and the database is secured. Access requires a login.

**Q: Who can access the system?**
It's behind a login screen — no patient data is visible without signing in. Sessions expire after 8 hours.

**Q: Is it compliant with healthcare data rules?**
The architecture follows responsible-AI and data-minimisation principles. For a specific standard (e.g. your internal policy, IRDAI/NHCX guidelines, ISO/IEC 42001), we map the controls to that framework as part of onboarding.

---

## E. Integration & Workflow

**Q: How does it talk to insurers?**
It converts the validated bill into **NHCX-compatible JSON** and emails it to the insurer/TPA. Each claim gets a unique tracking reference (e.g. `QDX-2025-180625-SH-K802-T9X4`) so replies are matched automatically.

**Q: Which insurers are supported?**
The demo includes Star Health, Care Health, HDFC Ergo, and New India. Adding more insurers is just configuration.

**Q: What happens if a claim is wrong or gets rejected?**
Two safety nets: (1) the **AI blocks** wrong items before they're ever sent; (2) if the insurer still rejects or asks for more info, their reply email is **read automatically** and the app shows you the decision, the reasons, and exactly which documents to provide.

**Q: Does it read the insurer's reply automatically?**
Yes — it checks the reply inbox every 90 seconds, matches the tracking reference, and the AI parses the decision. No manual email-checking needed. (For the demo we use a "Simulate Reply" button; in production we connect the real inbox.)

---

## F. Deployment, Reliability & UAT

**Q: Where does it run?**
It's a cloud web app (currently hosted on Railway). Staff just open a link in a browser — nothing to install. It works on any device.

**Q: Is it reliable / always available?**
Yes — it's cloud-hosted and runs independently. It auto-restarts on failure.

**Q: Can the admin team test it (UAT)?**
Yes. We can stand up a dedicated UAT environment with a persistent database (so test data is kept) and live AI enabled, separate from production.

**Q: What's the tech behind it?**
Node.js + TypeScript backend, a clean single-page web interface, and a database that's ready to scale to PostgreSQL. The AI is Anthropic Claude.

---

## G. What's MVP vs. Production (be honest)

**Q: What's ready today?**
The full four-stage workflow, the live AI audit and reply-reading, the fee/ledger logic, login security, and a working cloud demo with example claims.

**Q: What's configured per-hospital for go-live?**
- Real email send/receive (SMTP/IMAP) and insurer email addresses
- Hospital name/branding (demo uses "Jubilee Hospital")
- Persistent database + backups, and user accounts/roles
- Connection to the live NHCX gateway if required (today it's NHCX-compatible JSON via email)

**Q: Roadmap / what's next?**
Multi-hospital support, role-based user accounts, direct NHCX gateway integration, analytics dashboard, and de-identification before AI calls for stricter privacy.

---

## H. Quick Demo Script (for the meeting)

1. **Log in** → show the clean four-stage pipeline.
2. **Anita Desai (AUDITED)** → AI flagged a missing quantity.
3. **The live moment:** open **Ramesh Nair (DRAFT)** → click **Save & Run AI Audit** → Claude flags the bad lines in real time.
4. **Sunita Pillai (REPLIED · PARTIAL)** → click **Clear to Counter** live → see patient copay.
5. **Arjun Mehta (REJECTED)** and **Priya Menon (MORE_INFO)** → show the system handles bad/queried claims.
6. **Mohammed Iqbal (CLEARED)** → "patient pays ₹4,000; our 0.5% fee is billed to the hospital, never the patient."

---

*Prepared for Quantum AI Ltd. — Q-Dispatch client demo.*
