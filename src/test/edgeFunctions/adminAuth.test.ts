/**
 * ═════════════════════════════════════════════════════════════════════════
 *  adminAuth.test.ts — اختبار الأجزاء pure من adminAuth.ts
 *
 *  الأجزاء غير-pure (requireAdmin, targetInCallerTenant, audit) تعتمد
 *  على Supabase runtime → تُختبر عبر E2E من الواجهة.
 *
 *  ⚠️ تصحيح 2026-08-04:
 *  كانت هذه المجموعات منسوخة يدوياً هنا مع تعليق «طابق مع adminAuth.ts».
 *  النسخ اليدوي فشل بالضبط كما هو متوقع: الاختبار بقي على 9 أدوار بينما
 *  المصدر وصل إلى 13، ثم أُضيفت ثلاثة أدوار لبوابة الحركة إلى قيد القاعدة
 *  في 0288 دون أن يلاحظ أي اختبار. لذلك صار الاختبار الآن يقرأ الملفات
 *  الحقيقية (Edge Function + المايجريشن) نصّاً ويقارن بينها، فلا يمكن أن
 *  تنحرف الثلاثة مصادر مرة أخرى دون فشل أحمر.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const ADMIN_AUTH_PATH = resolve(ROOT, 'supabase/functions/_shared/adminAuth.ts');
const CREATE_USER_PATH = resolve(ROOT, 'supabase/functions/admin-create-user/index.ts');
const MIGRATION_0288_PATH = resolve(
  ROOT,
  'supabase/migrations/0288_movement_profile_roles_constraint.sql',
);

const adminAuthSource = readFileSync(ADMIN_AUTH_PATH, 'utf8');
const createUserSource = readFileSync(CREATE_USER_PATH, 'utf8');
const migration0288Source = readFileSync(MIGRATION_0288_PATH, 'utf8');

/** يستخرج أعضاء `new Set([...])` المُسنَد إلى اسم مُعطى من مصدر TypeScript. */
function parseRoleSet(source: string, name: string): Set<string> {
  const match = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*=\\s*new\\s+Set\\(\\[([\\s\\S]*?)\\]\\)`,
  ).exec(source);
  if (!match) throw new Error(`تعذّر العثور على ${name} في المصدر`);
  return new Set(
    Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]),
  );
}

/** يستخرج قائمة الأدوار من قيد profiles_role_check في المايجريشن. */
function parseCheckConstraintRoles(sql: string): Set<string> {
  const match = /ADD\s+CONSTRAINT\s+profiles_role_check\s+CHECK\s*\(\s*role\s+IN\s*\(([\s\S]*?)\)\s*\)\s*;/i
    .exec(sql);
  if (!match) throw new Error('تعذّر العثور على قيد profiles_role_check في 0288');
  const withoutComments = match[1].replace(/--[^\n]*/g, '');
  return new Set(
    Array.from(withoutComments.matchAll(/'([^']+)'/g)).map((m) => m[1]),
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const TARGET_ROLES = parseRoleSet(adminAuthSource, 'TARGET_ROLES');
const CALLER_ROLES = parseRoleSet(adminAuthSource, 'CALLER_ROLES');
const PLATFORM_ROLES = parseRoleSet(adminAuthSource, 'PLATFORM_ROLES');
const DB_ROLES = parseCheckConstraintRoles(migration0288Source);

/** أدوار بوابة الحركة واللوجستيات (0270-0299). */
const MOVEMENT_PORTAL_ROLES = ['employee_movement', 'logistics', 'movement_manager'] as const;

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

  it('TARGET_ROLES يشمل دور التسويق (بوابة التسويق)', () => {
    expect(TARGET_ROLES.has('marketing')).toBe(true);
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

describe('adminAuth — تطابق الأدوار بين Edge Function وقاعدة البيانات', () => {
  it.each(MOVEMENT_PORTAL_ROLES)(
    'TARGET_ROLES يشمل دور بوابة الحركة «%s»',
    (role) => {
      expect(TARGET_ROLES.has(role)).toBe(true);
    },
  );

  it.each(MOVEMENT_PORTAL_ROLES)(
    'قيد profiles_role_check يشمل دور بوابة الحركة «%s»',
    (role) => {
      expect(DB_ROLES.has(role)).toBe(true);
    },
  );

  it('كل دور في TARGET_ROLES مقبول في قيد profiles_role_check', () => {
    const rejectedByDb = [...TARGET_ROLES].filter((role) => !DB_ROLES.has(role));
    expect(rejectedByDb).toEqual([]);
  });

  it('كل دور في CALLER_ROLES مقبول في قيد profiles_role_check', () => {
    const rejectedByDb = [...CALLER_ROLES].filter((role) => !DB_ROLES.has(role));
    expect(rejectedByDb).toEqual([]);
  });

  it('قيد القاعدة = TARGET_ROLES ∪ PLATFORM_ROLES بالضبط (لا دور يتيم)', () => {
    const expected = new Set([...TARGET_ROLES, ...PLATFORM_ROLES]);
    const orphansInDb = [...DB_ROLES].filter((role) => !expected.has(role));
    expect(orphansInDb).toEqual([]);
    expect(DB_ROLES.size).toBe(expected.size);
  });
});

describe('adminAuth — مصدر واحد للأدوار (منع تكرار الانحراف)', () => {
  it('admin-create-user يستورد TARGET_ROLES بدل إعادة تعريفها محلياً', () => {
    expect(createUserSource).toMatch(
      /import\s*\{[^}]*\bTARGET_ROLES\b[^}]*\}\s*from\s*'\.\.\/_shared\/adminAuth\.ts'/,
    );
    expect(createUserSource).not.toMatch(/const\s+TARGET_ROLES\s*=\s*new\s+Set/);
  });

  it('admin-create-user يستورد CALLER_ROLES بدل إعادة تعريفها محلياً', () => {
    expect(createUserSource).toMatch(
      /import\s*\{[^}]*\bCALLER_ROLES\b[^}]*\}\s*from\s*'\.\.\/_shared\/adminAuth\.ts'/,
    );
    expect(createUserSource).not.toMatch(/const\s+CALLER_ROLES\s*=\s*new\s+Set/);
  });

  it('لا Edge Function أخرى تُعيد تعريف مجموعات الأدوار محلياً', () => {
    expect(adminAuthSource).toMatch(/export\s+const\s+TARGET_ROLES/);
    expect(adminAuthSource).toMatch(/export\s+const\s+CALLER_ROLES/);
    expect(adminAuthSource).toMatch(/export\s+const\s+PLATFORM_ROLES/);
  });
});
