/**
 * ═════════════════════════════════════════════════════════════════════════
 *  legacyRedirect.test.ts — يضمن أن كل view id قديم له مسار جديد
 *  ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { VIEW_TO_PATH, legacyViewToPath } from '../../router/legacyRedirect';

describe('legacyRedirect: VIEW_TO_PATH', () => {
  it('يحوي كل الـ view IDs المستخدمة تاريخياً في التطبيق', () => {
    // قائمة view IDs التي يجب أن تُغطى
    const requiredIds = [
      // Employee core
      'employee-dashboard', 'employee-problems', 'new-problem',
      'employee-wellness', 'employee-ai-chat', 'employee-profile',
      'employee-attendance', 'employee-leave-requests',
      // HR
      'hr-dashboard', 'hr-attendance', 'hr-payroll', 'hr-reports',
      // Admin
      'admin-dashboard', 'admin-employees', 'admin-settings',
      // Roles
      'gatekeeper-portal', 'developer-dashboard', 'tech-portal',
      // Kiosk
      'kiosk-mode',
    ];

    for (const id of requiredIds) {
      expect(VIEW_TO_PATH[id], `view "${id}" must have a mapping`).toBeDefined();
      expect(VIEW_TO_PATH[id]).toMatch(/^\/(app\/|dev|)/);
    }
  });

  it('كل المسارات تبدأ بـ /app/ أو /dev', () => {
    for (const [view, target] of Object.entries(VIEW_TO_PATH)) {
      const valid = target.startsWith('/app/') || target === '/dev' || target === '/app';
      expect(valid, `view ${view} → ${target} يجب أن يبدأ بـ /app/ أو /dev`).toBe(true);
    }
  });

  it('لا يوجد مسار مكرر بشكل خطير (سيتم لصقه بـ id أطول)', () => {
    // بعض التكرار مسموح (aliases) — نتحقق فقط من التكرارات الغريبة
    // مثلاً "employee-requests" و "employee-leave-requests" كلاهما → /app/employee/leave-requests: OK
    const pathCounts = new Map<string, string[]>();
    for (const [view, path] of Object.entries(VIEW_TO_PATH)) {
      if (!pathCounts.has(path)) pathCounts.set(path, []);
      pathCounts.get(path)!.push(view);
    }
    // يجب ألا يزيد أي path عن 4 aliases (dashboard / analytics / sentiment / predictions مثلاً)
    for (const [p, views] of pathCounts) {
      expect(views.length, `${p} له ${views.length} aliases: ${views.join(', ')}`).toBeLessThanOrEqual(4);
    }
  });
});

describe('legacyViewToPath()', () => {
  it('يعيد المسار الصحيح لـ view معروف', () => {
    expect(legacyViewToPath('hr-attendance')).toBe('/app/hr/attendance');
    expect(legacyViewToPath('employee-dashboard')).toBe('/app/employee');
    expect(legacyViewToPath('developer-dashboard')).toBe('/dev');
  });

  it('يعيد null لـ view غير معروف', () => {
    expect(legacyViewToPath('unknown-view-xyz')).toBeNull();
    expect(legacyViewToPath('')).toBeNull();
    expect(legacyViewToPath(null)).toBeNull();
    expect(legacyViewToPath(undefined)).toBeNull();
  });
});
