/**
 * ═════════════════════════════════════════════════════════════════════════
 *  constants.test.ts — يضمن أن ROLE_DEFAULT_PATH يغطي كل الأدوار المدعومة
 *  ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { ROLE_DEFAULT_PATH, getDefaultPathForRole } from '../../router/constants';

describe('ROLE_DEFAULT_PATH', () => {
  it('يغطي كل الأدوار المدعومة في التطبيق', () => {
    const supportedRoles = [
      'developer', 'hr', 'admin', 'employee',
      'gatekeeper', 'supervisor', 'manager', 'it_admin',
    ];
    for (const role of supportedRoles) {
      expect(ROLE_DEFAULT_PATH[role], `الدور "${role}" يحتاج default path`).toBeDefined();
    }
  });

  it('كل المسارات تبدأ بـ /app أو /dev', () => {
    for (const [role, path] of Object.entries(ROLE_DEFAULT_PATH)) {
      const ok = path.startsWith('/app') || path === '/dev';
      expect(ok, `${role} → ${path}`).toBe(true);
    }
  });
});

describe('getDefaultPathForRole()', () => {
  it('يعيد المسار الصحيح لكل دور معروف', () => {
    expect(getDefaultPathForRole('hr')).toBe('/app/hr');
    expect(getDefaultPathForRole('admin')).toBe('/app/admin');
    expect(getDefaultPathForRole('developer')).toBe('/dev');
    expect(getDefaultPathForRole('gatekeeper')).toBe('/app/gatekeeper');
  });

  it('يعيد /app/employee للأدوار غير المعروفة (fallback آمن)', () => {
    expect(getDefaultPathForRole('unknown_role')).toBe('/app/employee');
    expect(getDefaultPathForRole('')).toBe('/app/employee');
    expect(getDefaultPathForRole(undefined)).toBe('/app/employee');
  });

  it('يتعامل مع supervisor و manager بشكل صحيح', () => {
    // supervisor يذهب لصفحة الموظف (كما كان في المنطق القديم)
    expect(getDefaultPathForRole('supervisor')).toBe('/app/employee');
    // manager له dashboard خاص
    expect(getDefaultPathForRole('manager')).toBe('/app/manager');
  });
});
