# 🏛️ Kyvzon Platform Standards & Conventions
**Version:** 1.0  
**Last Updated:** 2026-07-13  
**Owner:** Platform Architect

---

## 1. Purpose

This document defines the official standards, conventions, and best practices for the Kyvzon platform. All contributors must follow these guidelines.

---

## 2. Folder Structure (Strict)

```
src/
├── core/                  # Core platform concerns (Auth, Tenant, Stores)
│   ├── stores/
│   ├── tenant/
│   └── constants/
├── services/
│   └── sdk/               # All data access must go through SDK
├── shared/
│   ├── components/        # Reusable UI components
│   ├── hooks/
│   └── types/
├── pages/                 # Route-level pages only
│   ├── hr/
│   ├── employee/
│   ├── admin/
│   └── ...
├── modules/               # Feature modules (e.g. tawathul)
└── utils/
```

**Rules:**
- Never put business logic in `pages/` directly.
- All data access → `services/sdk/`
- Shared components → `shared/components/`

---

## 3. Naming Conventions

| Type                    | Convention                     | Example |
|-------------------------|--------------------------------|---------|
| **Components**          | PascalCase                     | `EmployeeCard.tsx` |
| **Services**            | PascalCase + Service           | `WellnessService.ts` |
| **Types / Interfaces**  | PascalCase + Record            | `EmployeeRecord` |
| **Hooks**               | camelCase + use                | `useTenant` |
| **Files**               | PascalCase for components      | `HRDashboard.tsx` |
| **Constants**           | UPPER_SNAKE_CASE               | `MAX_FILE_SIZE` |

---

## 4. TypeScript Rules

- **Always** use types from `shared/types/sdk.ts` when available.
- Prefer `interface` over `type` for public records.
- Never use `any` in new code (use `unknown` instead).
- All services must extend `BaseService<T>`.

---

## 5. Component Guidelines

- All new pages must be wrapped with `AppErrorBoundary`.
- Use `Suspense` + `lazy` for all route-level components.
- Prefer composition over inheritance.
- Keep components under **300 lines** when possible.

---

## 6. Commit Message Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

**Example:**
```
feat(sdk): add findByEmployee method to AttendanceService

Closes #124
```

---

## 7. ADR Process

1. Create new ADR in `docs/adr/`
2. Use the template in `ADR_TEMPLATE.md`
3. Update `INDEX.md`
4. Link the ADR in relevant code comments when possible

---

## 8. Security Rules

- Never commit secrets.
- All tenant filtering must go through `BaseService`.
- Use `requireTenantId()` before any write operation.

---

## 9. Testing Strategy (Future)

- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`
- Minimum coverage target: 60% (SDK layer first)

---

**This document is binding.** Any deviation requires an ADR.