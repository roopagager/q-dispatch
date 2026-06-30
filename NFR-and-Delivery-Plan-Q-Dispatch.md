# Non-Functional Requirements (NFR) & Delivery Plan — Q-Dispatch

| | |
|---|---|
| **Product** | Q-Dispatch — Quantum AI Ltd. |
| **Version** | 1.0 |
| **Status** | ✅ Met today · 🟡 Partial · 🛣️ Roadmap |

Each NFR is specific and testable. Where a value is **measured**, it's noted; otherwise it's a **target** to verify.

---

## 1. Non-Functional Requirements

### 1.1 Performance
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-PERF-1 | Hospital-side processing (assemble → audit → dispatch → clear) | < 10 minutes of work | ✅ |
| NFR-PERF-2 | AI audit response time | < 5 s (p95) per claim | ✅ |
| NFR-PERF-3 | Deterministic checks, copay, ledger, FHIR build | < 100 ms | ✅ (measured ms) |
| NFR-PERF-4 | Insurer reply detected after arrival | within one poll cycle (≤ 90 s) | ✅ |
| NFR-PERF-5 | UI screen interactions | < 300 ms (excl. AI calls) | ✅ |

### 1.2 Scalability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-SCAL-1 | Claims per hospital/day | ≥ 50 sustained | ✅ |
| NFR-SCAL-2 | Database path to scale | PostgreSQL-ready schema (SQLite → Postgres) | 🟡 |
| NFR-SCAL-3 | Multi-hospital / multi-tenant | isolated data per hospital | 🛣️ |
| NFR-SCAL-4 | Stateless API services (horizontal scale) | yes | ✅ |

### 1.3 Availability & Reliability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-AVL-1 | Service uptime | ≥ 99.5% | 🟡 (cloud-hosted, auto-restart) |
| NFR-AVL-2 | Auto-restart on failure | yes | ✅ |
| NFR-AVL-3 | A failed inbox poll must not crash the server | graceful | ✅ |
| NFR-AVL-4 | AI/SMTP/IMAP failures return clear errors, never silent | yes | ✅ |
| NFR-AVL-5 | Data durability (persistent volume / backups) | no claim loss | 🛣️ (volume/backup to configure) |

### 1.4 Security
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-SEC-1 | Authenticated access; login before any patient data | yes | ✅ |
| NFR-SEC-2 | Session expiry | 8 hours; httpOnly cookie | ✅ |
| NFR-SEC-3 | Credential comparison | timing-safe | ✅ |
| NFR-SEC-4 | Transport encryption | TLS/HTTPS in transit | ✅ |
| NFR-SEC-5 | Secrets never hardcoded | env only | ✅ |
| NFR-SEC-6 | Encryption at rest | enabled | 🟡 (provider/on-prem dependent) |
| NFR-SEC-7 | Role-based access control | clerk/supervisor/management | 🛣️ |

### 1.5 Privacy & Compliance
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-PRIV-1 | De-identify patient name/DOB before any external AI call | enforced | ✅ |
| NFR-PRIV-2 | DPDP Act 2023 alignment (minimisation, purpose limitation) | yes | ✅ |
| NFR-PRIV-3 | AI processor does not train on data; zero-retention configurable | yes | ✅ |
| NFR-PRIV-4 | Configurable data retention; clinical free-text purge schedule | yes | 🟡 |
| NFR-PRIV-5 | Data residency (Indian region / on-prem) | option available | 🛣️ |
| NFR-PRIV-6 | DPA signed per hospital | process | 🛣️ |

### 1.6 Accuracy & Quality (the core)
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-ACC-1 | Recall on rejection triggers | ≥ 95% | ✅ **100% measured** |
| NFR-ACC-2 | Precision (low false alarms) | ≥ 90% | ✅ **100% measured** |
| NFR-ACC-3 | Deterministic rules are exact & repeatable | yes (temperature 0) | ✅ |
| NFR-ACC-4 | Copay / fee math correctness | 100% | ✅ |
| NFR-ACC-5 | Accuracy is continuously measured | eval harness | ✅ |

### 1.7 Usability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-USE-1 | Agent advises; staff decide (flag-not-block) | yes | ✅ |
| NFR-USE-2 | Every flag explains *why* + suggests the fix | yes | ✅ |
| NFR-USE-3 | Overrides logged with reason | yes (design) | 🟡 |
| NFR-USE-4 | Currency in Indian format; clear copay headline | yes | ✅ |
| NFR-USE-5 | Browser-based, no install; works on counter terminal | yes | ✅ |
| NFR-USE-6 | WCAG 2.1 AA accessibility | conform | 🛣️ |

### 1.8 Interoperability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-INT-1 | Generate NHCX-aligned HL7 FHIR R4 (NRCES profile) | yes | ✅ |
| NFR-INT-2 | Ingest FHIR R4 bundle and CSV exports | yes | ✅ |
| NFR-INT-3 | Multi-channel dispatch (NHCX / email fallback) | yes | 🟡 |
| NFR-INT-4 | Live ABDM NHCX gateway + HIS connector | onboarding | 🛣️ |

### 1.9 Maintainability & Observability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-MNT-1 | Strongly-typed codebase (TypeScript strict, 0 errors) | yes | ✅ |
| NFR-MNT-2 | Modular (deterministic rules / AI / routes separated) | yes | ✅ |
| NFR-MNT-3 | Automated accuracy benchmark (`npm run eval`) | yes | ✅ |
| NFR-MNT-4 | Full action-level audit log for support & regulators | yes | ✅ |
| NFR-MNT-5 | Structured operational logging | yes | ✅ |

### 1.10 Portability
| ID | Requirement | Target | Status |
|---|---|---|---|
| NFR-PORT-1 | Cloud SaaS deployment | yes (live) | ✅ |
| NFR-PORT-2 | On-premises deployment | yes | 🛣️ |
| NFR-PORT-3 | Config via environment variables | yes | ✅ |

---

## 2. Delivery Plan

### 2.1 Phasing (aligned to spec roadmap)
| Phase | Scope | Status |
|---|---|---|
| **P0 — Core MVP** | 4-stage pipeline, audit, dispatch (email), clearance, ledger, login | ✅ Done |
| **P1 — Trust & accuracy** | De-identification, eval harness, deterministic/AI split, document check, predictive score, insights | ✅ Done |
| **P2 — Standards & ingestion** | NHCX FHIR generation, HIS FHIR/CSV ingestion, denial auto-appeal | ✅ Done |
| **P3 — Go-live integration** | Live NHCX gateway (ABDM onboarding), live HIS connector/auto-trigger, real SMTP/IMAP, persistent volume + backups | 🛣️ |
| **P4 — Productise** | Accounts & roles, SaaS/invoice automation, on-prem packaging, RCM analytics dashboard, audit-by-user | 🛣️ |
| **P5 — Differentiators** | Fraud/upcoding detection, real-time eligibility, patient WhatsApp/SMS, agent self-verification + outcome feedback loop | 🛣️ |

### 2.2 Milestones
- M1 ✅ Working MVP deployed (cloud).
- M2 ✅ Measured accuracy baseline (100% recall / 100% precision) + privacy by design.
- M3 ✅ NHCX-ready + HIS ingestion + denial management.
- M4 🛣️ Pilot-ready: NHCX onboarding, HIS connector, persistence, roles — **2–3 hospital pilot (Hyderabad, Q3 2025)**.
- M5 🛣️ Production: 10 hospitals, 3 insurer integrations.

### 2.3 Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Staff resist / blame the agent | Flag-only stance, override-with-reason, explainable flags, high precision (measured) |
| Insurer reply latency hurts "10-min" promise | Position 10 min as hospital-side; SLA waives fee only for hospital-side miss |
| PHI exposure / DPDP non-compliance | De-identification before AI (done); residency + DPA on roadmap |
| NHCX/HIS integration delay | Email + FHIR/CSV work today; gateway/connector architected, activate on onboarding |
| Over-claiming in collateral | Honest LIVE/PARTIAL/ROADMAP labels across all docs |
| Single-hospital data isolation at scale | Multi-tenant + Postgres in P4 |

### 2.4 Acceptance / Definition of Done (per feature)
TypeScript compiles (0 errors) · unit/eval verified · deployed & verified on live cloud · no PHI sent to AI · audit-logged · documented · honest status labelled.

---
*Quantum AI Ltd. — Q-Dispatch · Confidential.*
