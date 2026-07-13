# ADR-0006: Error Handling & Logging Strategy

**Status:** Accepted  
**Date:** 2026-07-13  
**Deciders:** Platform Architect  
**Context:**  
The platform previously had inconsistent error handling and no structured logging. This made debugging difficult and increased the risk of silent failures in production.

**Decision:**  
We adopt a **unified error handling and logging strategy** with the following components:

### 1. Centralized Error Types
- Use `SdkError` and `SdkErrorCode` as the single source of truth for application errors.
- All services must throw `SdkError` (never raw errors).

### 2. Structured Logging
- All data access operations go through `BaseService<T>`, which now includes structured logging via the new `Logger` class.
- Log levels:
  - `debug`: Read operations (`findAll`, `findById`)
  - `info`: Write operations (`create`, `update`, `softDelete`)
  - `warn`: Destructive operations (`delete`)
  - `error`: Any failure

### 3. Error Logging
- Every `catch` block in `BaseService` logs the error with full context (table, action, tenant, error message).
- Added `logger.logError()` helper for complex error scenarios.

### 4. Tenant Context
- Every log entry is automatically enriched with the current `tenantId` when available.

**Consequences:**
- **Positive:**
  - Consistent error handling across the entire SDK layer
  - Excellent traceability in production
  - Foundation ready for alerting and monitoring tools (Sentry)

- **Negative:**
  - Slight performance overhead from logging (negligible in practice)

**Implementation Status:**
- Logger created (`src/services/utils/logger.ts`)
- Integrated into `BaseService` (8 methods instrumented)
- Auto tenant enrichment implemented

**References:**
- `src/services/utils/logger.ts`
- `src/services/sdk/BaseService.ts`
- ADR-0002, ADR-0004

---

**Next ADR:** ADR-0007 — Testing Strategy (Phase 2)