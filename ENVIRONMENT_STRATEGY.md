# 🌍 ENVIRONMENT STRATEGY — Kyvzon Platform
**Document Type:** Platform Standard  
**Version:** 1.0  
**Date:** 2026-07-13  
**Owner:** Platform Architect

---

## 1. Overview

This document defines the official strategy for managing environment variables across all environments in the Kyvzon platform.

**Current Problem:**
- Real secrets are committed in `.env`
- No clear separation between environments
- High risk of leaking production credentials

---

## 2. Environment Tiers

| Environment   | Purpose                    | Branch     | Secrets Source          | Notes |
|---------------|----------------------------|------------|-------------------------|-------|
| **Local**     | Developer machines         | —          | `.env.local`            | Never committed |
| **Development** | Feature development     | `develop`  | `.env.development`      | Shared dev keys |
| **Staging**   | Pre-production testing     | `staging`  | `.env.staging`          | Production-like |
| **Production**| Live system                | `main`     | Platform secrets manager| Strictest rules |

---

## 3. File Naming Convention (Strict)

```
.env.example              ← Template only (safe to commit)
.env.local                ← Developer overrides (gitignored)
.env.development          ← Development environment
.env.staging              ← Staging environment
.env.production           ← Production (never in repo)
```

**Rule:** Never commit any file starting with `.env` except `.env.example`.

---

## 4. Recommended Implementation

### 4.1 Current State (After Cleanup)

- `.env` → Contains real Supabase keys (Risk)
- `.env.example` → Cleaned (Good)
- `.gitignore` → Already protects most `.env*` files

### 4.2 Required Changes

1. **Rename** current `.env` → `.env.development`
2. **Create** `.env.example` with placeholders only (already done)
3. **Add** `.env.development` and `.env.staging` to `.gitignore`
4. **Document** all required variables

---

## 5. Required Environment Variables

### Core (Supabase)

| Variable                        | Required | Description                     | Sensitive |
|--------------------------------|----------|----------------------------------|---------|
| `VITE_SUPABASE_URL`            | Yes      | Supabase project URL             | Yes     |
| `VITE_SUPABASE_ANON_KEY`       | Yes      | Public anon key                  | Yes     |
| `VITE_SUPABASE_SERVICE_KEY`    | No*      | Service role key (admin only)    | Yes     |

### Application

| Variable              | Required | Default     |
|-----------------------|----------|-------------|
| `VITE_APP_NAME`       | Yes      | Kyvzon HR   |
| `VITE_APP_VERSION`    | Yes      | 3.0.0       |
| `VITE_APP_ENV`        | Yes      | development |

### AI (Currently Disabled)

| Variable                    | Status     | Notes |
|-----------------------------|------------|-------|
| `VITE_OPENROUTER_API_KEY`   | Disabled   | To be re-added later |
| `VITE_GROQ_API_KEY`         | Disabled   | — |
| `VITE_CLAUDE_API_KEY`       | Disabled   | — |
| `VITE_OPENAI_API_KEY`       | Disabled   | — |

---

## 6. Action Plan (Recommended)

| Step | Action | Owner | Priority |
|------|--------|-------|----------|
| 1    | Rename `.env` → `.env.development` | Platform Engineer | High |
| 2    | Update `.gitignore` | Platform Engineer | High |
| 3    | Create `.env.staging` template | Platform Engineer | Medium |
| 4    | Rotate Supabase keys | Client | Critical |
| 5    | Move production secrets to secrets manager | Platform + DevOps | High |

---

## 7. Security Rules

1. **Never** commit real keys to Git.
2. **Rotate** all keys every 90 days.
3. **Use** different keys per environment.
4. **Audit** `.env` files before every release.

---

**Document Status:** Ready for implementation

**Next Action:** Execute the rename and `.gitignore` update (can be done independently).