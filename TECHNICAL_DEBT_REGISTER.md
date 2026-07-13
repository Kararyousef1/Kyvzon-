# 📋 TECHNICAL DEBT REGISTER
**Platform:** Kyvzon HR Platform  
**Owner:** Platform Architect  
**Created:** 2026-07-13  
**Last Updated:** 2026-07-13  
**Version:** 1.0

---

## Purpose
This is the **single source of truth** for all known technical debt in the Kyvzon platform.  
All items must be reviewed during planning and before major releases.

---

## Legend

| Field          | Description |
|----------------|-------------|
| **ID**         | Unique identifier |
| **Category**   | Security / Architecture / Code Quality / Testing / DX / Data |
| **Severity**   | Critical / High / Medium / Low |
| **Effort**     | Estimated hours |
| **Status**     | Open / In Progress / Resolved / Accepted |
| **Owner**      | Responsible person/role |
| **Due**        | Target quarter or date |

---

## Active Technical Debt Items

### 🔴 Critical (Must be addressed in Phase 0 / Phase 1)

| ID       | Title                                              | Category      | Severity | Effort | Status     | Owner              | Due       | Notes |
|----------|----------------------------------------------------|---------------|----------|--------|------------|--------------------|-----------|-------|
| TD-001   | Supabase keys still present in `.env`              | Security      | Critical | 2h     | Open       | Platform Engineer  | Q3 2026   | Rotate keys + clean Git history |
| TD-002   | 2 Critical vulnerabilities in testing tools        | Security      | Critical | 4h     | Open       | Platform Engineer  | Q3 2026   | Vitest + @vitest/ui |
| TD-003   | No secrets management strategy                     | Security      | Critical | 8h     | Open       | Platform Engineer  | Q3 2026   | Doppler / Vercel Env recommended |
| TD-004   | Empty placeholder pages removed                    | Code Quality  | High     | Done   | Resolved   | Platform Engineer  | 2026-07-13 | Gatekeeper deleted, Movement has placeholder |

### 🟠 High Priority

| ID       | Title                                              | Category          | Severity | Effort   | Status     | Owner              | Due       | Notes |
|----------|----------------------------------------------------|-------------------|----------|----------|------------|--------------------|-----------|-------|
| TD-005   | HRDashboard.tsx is 34k lines (monolith)            | Architecture      | High     | 20h      | Open       | Platform Engineer  | Q3 2026   | Strangler Fig Pattern recommended |
| TD-006   | 49 separate migration files                        | Data              | High     | 10h      | Open       | Platform Engineer  | Q3 2026   | Consolidate into 6-8 files |
| TD-007   | Zero test coverage                                 | Testing           | High     | 40h+     | Open       | QA + Dev           | Q4 2026   | Start with SDK layer |
| TD-008   | No environment strategy (dev/staging/prod)         | DX / Security     | High     | 6h       | Open       | Platform Engineer  | Q3 2026   | `.env.development`, `.env.production` |
| TD-009   | Large `index.html` (19k lines)                     | Code Quality      | High     | 4h       | Open       | Frontend Lead      | Q3 2026   | Extract scripts |

### 🟡 Medium Priority

| ID       | Title                                              | Category          | Severity | Effort | Status | Owner              | Due       | Notes |
|----------|----------------------------------------------------|-------------------|----------|--------|--------|--------------------|-----------|-------|
| TD-010   | Duplicate `EmployeeDocumentRecord` type            | Code Quality      | Medium   | 1h     | Open   | Platform Engineer  | Q3 2026   | Clean in sdk.ts |
| TD-011   | Some pages still use local types instead of SDK    | Architecture      | Medium   | 12h    | Open   | Dev Team           | Q4 2026   | Wellness, Gatekeeper, HR pages |
| TD-012   | No observability / structured logging              | Observability     | Medium   | 16h    | Open   | Platform Engineer  | Q4 2026   | Sentry + custom logger |
| TD-013   | No Component Ownership model                       | DX                | Medium   | 4h     | Open   | Platform Engineer  | Q3 2026   | Assign owners to modules |
| TD-014   | No CI/CD pipeline                                  | DevOps            | Medium   | 12h    | Open   | DevOps             | Q4 2026   | GitHub Actions |

### 🟢 Low Priority / Accepted Debt

| ID       | Title                                              | Category     | Severity | Effort | Status   | Owner | Due     | Notes |
|----------|----------------------------------------------------|--------------|----------|--------|----------|-------|---------|-------|
| TD-015   | Some components missing `React.memo`               | Performance  | Low      | Ongoing| Accepted | Devs  | —       | Apply when needed |
| TD-016   | No Storybook                                       | DX           | Low      | 12h    | Open     | FE    | Q4 2026 | Nice to have |
| TD-017   | `noImplicitAny: false` in tsconfig                 | Code Quality | Low      | 8h     | Open     | Devs  | Q4 2026 | Gradual enablement |

---

## Summary Dashboard

| Severity   | Count | Resolved | Open |
|------------|-------|----------|------|
| **Critical** | 4     | 1        | 3    |
| **High**     | 5     | 0        | 5    |
| **Medium**   | 5     | 0        | 5    |
| **Low**      | 3     | 0        | 3    |
| **Total**    | **17**| **1**    | **16** |

---

## Governance Rules

1. **No new feature** can be added if it increases Critical or High debt without approval.
2. **Every sprint** must include at least 10% effort toward debt repayment.
3. **Debt items** must be reviewed in every Architecture Review meeting.
4. **New debt** must be logged here within 48 hours of discovery.

---

## Next Review Date
**2026-07-20** (Weekly review recommended during Phase 0)

---

**Document Owner:** Platform Architect  
**Approval:** Required for any item marked "Accepted"