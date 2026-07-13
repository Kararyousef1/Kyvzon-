# ADR-0005: Component Ownership Model

**Status:** Accepted  
**Date:** 2026-07-13  
**Deciders:** Platform Architect  
**Context:**  
As the platform grows, it is becoming difficult to know who is responsible for different parts of the system. This leads to slow decision-making and unclear accountability.

**Decision:**  
We adopt a **Component Ownership Model** where every major module has a clear owner.

**Ownership Matrix:**

| Module / Area              | Owner Role              | Responsibilities |
|---------------------------|-------------------------|------------------|
| **SDK Layer**             | Platform Architect      | BaseService, Types, Tenant logic |
| **HR Module**             | HR Product Owner        | Attendance, Payroll, Performance, Reports |
| **Employee Experience**   | Employee Success Lead   | Wellness, Leave, Profile, Training |
| **Admin Module**          | Platform Engineer       | Settings, Audit Log, Permissions |
| **Gatekeeper & Security** | Security Lead           | Movements, Visitor logs |
| **Core (Auth, Tenant)**   | Platform Architect      | Authentication, Multi-tenancy |
| **Shared Components**     | Frontend Lead           | Reusable UI components |

**Rules:**
- Every new feature must have an assigned owner before development starts.
- Owners are responsible for code quality and technical debt in their area.
- Major changes require approval from the module owner.

**Consequences:**
- **Positive:** Clear accountability, faster decisions, better code quality.
- **Negative:** Requires cultural adoption and may slow down very small changes.

**References:**
- TD-013 in Technical Debt Register

---

**Next ADR:** ADR-0006 — Error Handling Strategy