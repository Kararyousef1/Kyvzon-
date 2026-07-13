# ADR-0004: Observability Strategy

**Status:** Proposed  
**Date:** 2026-07-13  
**Deciders:** Platform Architect  
**Context:**  
The platform currently has very limited visibility into production issues. When errors occur, debugging is slow and relies heavily on manual investigation. As the platform scales, this becomes unsustainable.

**Decision:**  
We will implement a **layered observability strategy** with the following components:

1. **Error Tracking** — Sentry (primary)
2. **Structured Logging** — Custom lightweight logger in SDK layer
3. **Performance Monitoring** — Sentry Performance + custom metrics on critical paths
4. **Future** — OpenTelemetry (when backend services are introduced)

**Implementation Plan:**
- Integrate Sentry in `App.tsx` and critical services
- Create `src/services/utils/logger.ts` with levels (info, warn, error)
- Instrument `BaseService` with request/response logging (optional, behind feature flag)
- Add health check endpoint (future)

**Consequences:**
- **Positive:**
  - Fast detection of production issues
  - Better understanding of user experience
  - Foundation for SLOs and alerting

- **Negative:**
  - Additional dependency and cost
  - Requires training on Sentry dashboards

**Alternatives Considered:**
- Only console logging → Rejected (no production visibility)
- Full OpenTelemetry now → Rejected (overkill for current stack)
- Highlight.io → Considered but Sentry has better React support

**References:**
- Sentry documentation
- ADR-0002 (SDK Layer)

---

**Related ADRs:** ADR-0002, ADR-0003

**Next:** ADR-0005 — Component Ownership Model