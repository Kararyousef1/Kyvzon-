# ADR-0001: Record Architecture Decisions

**Status:** Accepted  
**Date:** 2026-07-13  
**Deciders:** Platform Architect  
**Context:**  
The Kyvzon platform has grown significantly in complexity (SDK layer, multi-tenant architecture, multiple roles). Without a formal way to record architectural decisions, knowledge is lost over time and future changes become risky.

**Decision:**  
We will use **Architecture Decision Records (ADRs)** to document all significant architectural decisions.

**Consequences:**
- Positive: Better traceability, easier onboarding, reduced risk of reversing good decisions.
- Negative: Slight overhead in documentation.

**References:**
- https://adr.github.io/
- Michael Nygard's ADR format

---

**Next ADR:** ADR-0002 — SDK Layer Architecture