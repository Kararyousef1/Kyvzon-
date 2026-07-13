# 📘 Structured Logging Guide — Kyvzon Platform

**Version:** 1.0  
**Date:** 2026-07-13  
**Owner:** Platform Architect

---

## 1. Philosophy

We believe that **good logging is a first-class citizen** in the platform.  
Every important action should be traceable, especially in a multi-tenant environment.

**Core Principles:**
- Structured over free-text
- Context-rich (tenant, user, component, action)
- Appropriate log levels
- Zero noise in production

---

## 2. Logger API

### Basic Usage

```ts
import { logger } from '@/services/utils/logger';

// Simple logging
logger.info('User performed an action');

// With context
logger.info('Employee created', {
  component: 'EmployeeService',
  action: 'createEmployee',
  userId: '123',
});
```

### Child Logger (Recommended for Modules)

```ts
const employeeLogger = logger.child({
  component: 'EmployeeService',
  tenantId: 'abc',
});

employeeLogger.info('Employee updated', { action: 'updateEmployee', id: '456' });
```

### Error Logging

```ts
try {
  // ...
} catch (error) {
  logger.logError(error, 'Failed to process payroll', {
    component: 'PayrollService',
    action: 'processPayroll',
  });
}
```

---

## 3. Log Levels & When to Use Them

| Level   | Use Case                                      | Example |
|---------|-----------------------------------------------|---------|
| `debug` | Detailed information for development          | `findAll`, `findById`, query parameters |
| `info`  | Normal operational events                     | `create`, `update`, successful login |
| `warn`  | Potentially harmful situations                | `delete`, `softDelete`, permission denied |
| `error` | Error events that might still allow operation | Failed queries, validation errors |

---

## 4. Automatic Context Enrichment

The logger automatically adds:
- `tenantId` (from `localStorage`)
- Timestamp
- Log level

You should still provide meaningful context:
- `component`
- `action`
- `userId`
- Business-specific fields

---

## 5. Integration Standards

### In `BaseService` (Done)

All core methods are instrumented:
- Read operations → `debug`
- Write operations → `info`
- Destructive operations → `warn`
- Failures → `error` + context

### In Domain Services (Recommended Pattern)

```ts
async createEmployee(data: EmployeeInput) {
  logger.info('Creating new employee', {
    component: 'EmployeeService',
    action: 'createEmployee',
  });
  
  return this.create(...);
}
```

---

## 6. Production Considerations

- In production, `minLevel` is set to `info`
- Remote logging (Sentry) is disabled by default (can be enabled via `enableRemote`)
- Never log sensitive data (passwords, tokens, PII)

---

## 7. Future Enhancements

- Sentry integration (ADR-0004)
- Log sampling for high-volume operations
- Centralized log aggregation

---

**This document is the single source of truth for logging practices in Kyvzon.**