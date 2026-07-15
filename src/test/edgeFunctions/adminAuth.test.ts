/**
 * ═════════════════════════════════════════════════════════════════════════
 *  adminAuth.test.ts — اختبار الأجزاء pure من adminAuth.ts
 *
 *  الأجزاء غير-pure (requireAdmin, targetInCallerTenant, audit) تعتمد
 *  على Supabase runtime → تُختبر عبر E2E من الواجهة.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';

// نسخة inline من isUuid + الأدوار (طابق مع _shared/adminAuth.ts)
function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const TARGET_ROLES = new Set(['employee', 'supervisor', 'manager', 'hr', 'gatekeeper', 'admin']);
const CALLER_ROLES = new Set(['admin', 'developer', 'it_admin']);
const PLATFORM_ROLES = new Set(['developer', 'it_admin']);

describe('adminAuth — isUuid()', () => {
  it('يقبل UUID v4 صحيح', () => {
    expect(isUuid('a1b2c3d4-e5f6-4789-abcd-1234567890ab')).toBe(true);
    expect(isUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
  });

  it('يرفض strings غير UUID', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('12345678-1234-1234-1234-12345678901')).toBe(false);
    expect(isUuid('a1b2c3d4e5f647890abcd1234567890ab')).toBe(false);
  });

  it('يرفض القيم غير-string', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(12345)).toBe(false);
    expect(isUuid({})).toBe(false);
  });

  it('يرفض SQL injection attempts', () => {
    expect(isUuid("'; DROP TABLE profiles; --")).toBe(false);
    expect(isUuid('1 OR 1=1')).toBe(false);
  });
});

describe('adminAuth — Role sets', () => {
  it('TARGET_ROLES لا يحوي أدوار منصة', () => {
    expect(TARGET_ROLES.has('developer')).toBe(false);
    expect(TARGET_ROLES.has('it_admin')).toBe(false);
  });

  it('CALLER_ROLES = admin/developer/it_admin', () => {
    expect(CALLER_ROLES.has('admin')).toBe(true);
    expect(CALLER_ROLES.has('developer')).toBe(true);
    expect(CALLER_ROLES.has('it_admin')).toBe(true);
    expect(CALLER_ROLES.has('employee')).toBe(false);
    expect(CALLER_ROLES.has('hr')).toBe(false);
  });

  it('PLATFORM_ROLES = developer/it_admin فقط', () => {
    expect(PLATFORM_ROLES.has('developer')).toBe(true);
    expect(PLATFORM_ROLES.has('it_admin')).toBe(true);
    expect(PLATFORM_ROLES.has('admin')).toBe(false);
    expect(PLATFORM_ROLES.has('hr')).toBe(false);
  });

  it('كل دور في PLATFORM_ROLES هو في CALLER_ROLES (لكن العكس ليس صحيحاً)', () => {
    for (const role of PLATFORM_ROLES) {
      expect(CALLER_ROLES.has(role)).toBe(true);
    }
    // admin caller لكنه ليس platform
    expect(CALLER_ROLES.has('admin')).toBe(true);
    expect(PLATFORM_ROLES.has('admin')).toBe(false);
  });
});

describe('adminAuth — Escalation prevention logic', () => {
  /**
   * محاكاة المنطق في admin-update-role:
   * يجب أن يمنع رفع مستخدم إلى دور منصة، حتى لو المستدعي developer.
   */
  function canAssignRole(newRole: string, callerRole: string, targetRole: string): { allowed: boolean; reason?: string } {
    // 1) newRole يجب أن يكون في TARGET_ROLES
    if (!TARGET_ROLES.has(newRole)) return { allowed: false, reason: 'target_role_invalid' };
    // 2) newRole لا يجوز أن يكون دور منصة
    if (PLATFORM_ROLES.has(newRole)) return { allowed: false, reason: 'platform_role_forbidden' };
    // 3) لا يجوز تعديل مستخدم منصة إلا من developer
    if (PLATFORM_ROLES.has(targetRole) && callerRole !== 'developer') {
      return { allowed: false, reason: 'target_is_platform' };
    }
    return { allowed: true };
  }

  it('admin يستطيع ترقية employee إلى hr', () => {
    expect(canAssignRole('hr', 'admin', 'employee').allowed).toBe(true);
  });

  it('admin لا يستطيع ترقية نفسه أو غيره إلى developer', () => {
    const r = canAssignRole('developer', 'admin', 'employee');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('target_role_invalid');
  });

  it('حتى developer لا يستطيع رفع مستخدم إلى it_admin عبر هذه الواجهة', () => {
    const r = canAssignRole('it_admin', 'developer', 'employee');
    expect(r.allowed).toBe(false);
  });

  it('admin لا يستطيع تعديل دور developer آخر', () => {
    const r = canAssignRole('employee', 'admin', 'developer');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('target_is_platform');
  });

  it('developer يستطيع تخفيض developer آخر إلى admin', () => {
    // ملاحظة: لا يزال يفشل لأن admin ليس TARGET_ROLE للـ developer promotion
    // لكن admin هو TARGET_ROLE عادي، لذا يجب أن ينجح
    expect(canAssignRole('admin', 'developer', 'developer').allowed).toBe(true);
  });
});
