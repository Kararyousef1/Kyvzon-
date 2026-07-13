# ADR-0003: Multi-Tenancy Strategy

**Status:** Accepted  
**Date:** 2026-07-13  
**Context:**  
Kyvzon is designed as a multi-tenant SaaS platform. Proper tenant isolation is critical for security, data integrity, and compliance.

**Decision:**  
We enforce **tenant isolation at two layers**:

1. **Application Layer** — `BaseService<T>` automatically injects `tenant_id` using `injectTenantId()` and `addTenantFilter()`.
2. **Database Layer** — Row Level Security (RLS) policies in Supabase enforce tenant isolation at the database level.

**Key Rules:**
- `tenant_id` is **never** accepted from user input.
- All queries go through `BaseService`.
- RLS policies are the final security boundary.

**Consequences:**
- **Positive:** Strong security posture, easy to scale to new tenants.
- **Negative:** Requires careful RLS policy management.

**References:**
- `src/services/sdk/BaseService.ts`
- `requireTenantId()` function

---

**Related:** ADR-0002 (SDK Layer)