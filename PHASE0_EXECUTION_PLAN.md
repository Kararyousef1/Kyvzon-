# 🚨 Phase 0 — Immediate Risk Mitigation Execution Plan
**Platform Engineer:** 30+ years experience  
**Duration:** 5–7 working days  
**Risk Level:** Critical (must be completed before any new feature work)

---

## 1. Executive Summary

**Objective:**  
Eliminate all critical security and operational risks that currently expose the platform and its customers.

**Why This Phase is Non-Negotiable:**  
The `.env` file containing production Supabase keys and OpenRouter API key is committed in the repository. This is a **Category 5 security incident**.

**Success Criteria:**
- All secrets rotated
- `.env` removed from Git history
- Vulnerability report generated and action plan created
- Platform hygiene baseline established

---

## 2. Risk Register (Current State)

| Risk ID | Description                              | Severity | Likelihood | Impact     | Owner     | Status    |
|---------|------------------------------------------|----------|------------|------------|-----------|-----------|
| R001    | Supabase keys leaked in Git              | Critical | High       | Catastrophic | Platform  | Open      |
| R002    | OpenRouter API key exposed               | Critical | High       | High       | Platform  | Open      |
| R003    | 8 npm vulnerabilities (2 critical)       | High     | High       | High       | Platform  | Open      |
| R004    | No secrets management strategy           | High     | Medium     | High       | Platform  | Open      |
| R005    | Empty/placeholder pages in production    | Medium   | High       | Medium     | Platform  | Open      |
| R006    | No rollback strategy for security fixes  | High     | Medium     | High       | Platform  | Open      |

---

## 3. Detailed Work Breakdown

### Task 0.1 — Secrets Rotation & Leak Remediation (Day 1)

**Owner:** Platform Engineer + Client

**Steps:**

1. **Immediate Actions (Today)**
   - Rotate all Supabase keys (URL, Anon Key, Service Role Key)
   - Rotate OpenRouter API key
   - Update all environments (dev, staging, prod)

2. **Git History Cleanup**
   - Use `git filter-repo` or BFG to remove `.env` from history
   - Force push to main branch (with team coordination)

3. **Verification**
   - Confirm keys no longer appear in Git history
   - Run `git log --all --full-history -- .env`

**Rollback Plan:**
- Keep old keys active for 48 hours as fallback
- Document old keys in secure vault (one-time use)

**Deliverable:**  
`SECRETS_ROTATION_REPORT.md`

---

### Task 0.2 — Dependency Security Audit (Day 1–2)

**Steps:**

1. Run full audit:
   ```bash
   npm audit
   npm audit fix --dry-run
   ```

2. Classify vulnerabilities:
   - Critical / High → Must fix in Phase 0
   - Medium → Phase 1
   - Low → Phase 2

3. Create `DEPENDENCY_VULNERABILITY_REGISTER.md`

4. Decide on update strategy:
   - Patch only (safe)
   - Minor updates (with testing)
   - Major updates (with breaking change analysis)

**Deliverable:**  
`DEPENDENCY_AUDIT_REPORT.md` + prioritized fix list

---

### Task 0.3 — Environment Strategy Formalization (Day 2)

**Current Problem:**  
Mix of `.env`, `.env.local`, `.env.example` with real keys.

**Recommended Structure:**

```
.env.development
.env.staging
.env.production
.env.example          ← Safe template only
```

**Actions:**
- Create `.env.example` with placeholder values only
- Add strict `.gitignore` rules
- Document environment variable schema

**Deliverable:**  
`ENVIRONMENT_VARIABLES_SPEC.md`

---

### Task 0.4 — Platform Hygiene Baseline (Day 3)

**Tasks:**

1. **Empty Pages Audit**
   - Identify all zero-byte or placeholder pages
   - Decide: Remove, Implement, or Mark as "Coming Soon"

2. **Component Ownership Model**
   - Assign ownership to major modules (HR, Employee, Admin, etc.)

3. **Technical Debt Register v1**
   - Create living document for all known debt

**Deliverable:**  
`PLATFORM_HYGIENE_REPORT.md`

---

### Task 0.5 — Observability Foundation (Day 4)

Even in Phase 0 we start basic instrumentation:

- Add basic error boundary improvements
- Introduce structured logging helper in SDK
- Prepare Sentry integration plan (without full implementation)

---

## 4. Communication & Governance

### Daily Standups (15 min)
- Risk status
- Blockers
- Decisions needed

### Decision Log
All architectural and security decisions will be recorded in `DECISIONS.md`

### Escalation Path
- Critical security issues → Immediate client notification
- Any change requiring key rotation → 24h notice

---

## 5. Resource Requirements

| Role                    | Involvement     | Days |
|-------------------------|-----------------|------|
| Platform Engineer       | Lead            | 5    |
| Client / Product Owner  | Decision maker  | 2    |
| DevOps / Infra (if any) | Support         | 1    |

---

## 6. Go / No-Go Criteria for Phase 1

**Phase 0 is considered complete only when:**

- [ ] All critical secrets rotated and verified
- [ ] `.env` removed from Git history
- [ ] Vulnerability report created with action plan
- [ ] Environment strategy documented
- [ ] Technical Debt Register initialized
- [ ] Client sign-off received

---

## 7. Recommended Next Action

**I recommend we execute Phase 0 immediately.**

**Decision Needed from You:**

Please reply with one of the following:

**A.** Approve **Phase 0 Execution Plan** and authorize me to begin detailed task breakdown and risk mitigation.

**B.** Modify priorities (e.g., focus only on secrets first).

**C.** Request a **Risk Assessment Workshop** before starting.

---

**As your Platform Architect, my strong recommendation is Option A.**

Ready when you are.