# ADR-0002: SDK Layer Architecture using Generic BaseService<T>

**Status:** Accepted  
**Date:** 2026-07-13  
**Context:**  
The platform previously suffered from 329 TypeScript errors and heavy use of `any` across 31 services. A unified, type-safe data access layer was needed.

**Decision:**  
We adopted a **Generic BaseService<T>** pattern where:

- Every service extends `BaseService<RecordType>`
- All CRUD operations are strongly typed
- Tenant injection is handled centrally in `BaseService`
- `SdkError` class provides structured error handling

**Consequences:**
- **Positive:**
  - 100% type safety in the SDK layer
  - Single source of truth for data access
  - Easy to add new tables with minimal code
  - Centralized tenant security logic

- **Negative:**
  - Slight learning curve for new developers
  - Requires discipline when adding new methods

**Alternatives Considered:**
- Direct Supabase client usage in components → Rejected (high duplication and security risk)
- Repository pattern per table → Rejected (more boilerplate than needed)

**References:**
- `src/services/sdk/BaseService.ts`
- `src/shared/types/sdk.ts` (50+ Record types)

---

**Related ADRs:** ADR-0003 (Multi-Tenancy)