/**
 * mrpRolesAdminContract.test.ts — عقد 0314 وشاشة أدوار التصنيع
 *
 * ═════════════════════════════════════════════════════════════════════════
 * يغطي ثلاث طبقات:
 *   ① المايجريشن 0314    — الدوال والامتياز المركزي والتضييق الأمني
 *   ② طبقة SDK          — لا تسريب Supabase للصفحة · ترجمة الأخطاء
 *   ③ التسجيل الخماسي   — الصفحة مسجَّلة في المواضع الخمسة
 *
 * ★ ويضيف حارساً دائماً ضد صنف خطأ مُكتشَف هذه الجولة:
 *   مفتاح صلاحية موجود في PERMISSION_KEYS وفي الشريط الجانبي لكنه غائب
 *   عن كتلة الدور ⇒ العنصر مخفيّ صامتاً. هذا ما أصاب 'admin-approval-rules'
 *   منذ جولة 0308 دون أن يكشفه أي اختبار.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  hasPermission,
} from '../core/constants/permissions';

const root = resolve(__dirname, '..', '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');

const MIG = read('supabase/migrations/0314_mrp_role_lifecycle_rpcs.sql');
const VERIFY = read('tools/dev/verify-mrp-role-lifecycle-0314.sql');
const SVC = read('src/services/sdk/MrpRoleService.ts');
const PAGE = read('src/pages/admin/MrpRolesAdminPage.tsx');
const PERMS = read('src/core/constants/permissions.ts');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const ROUTER = read('src/router/AppRouter.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');

/** يجرّد تعليقات SQL — ذكر نمط في التوثيق ليس استخداماً */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => {
      const i = l.indexOf('--');
      return i === -1 ? l : l.slice(0, i);
    })
    .join('\n');
}

/** يقتطع نطاق دالة لتفادي التقاط نمط من دالة مجاورة */
function fnScope(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start === -1) throw new Error(`${name} غير موجودة`);
  const c = sql.indexOf(`COMMENT ON FUNCTION public.${name}`, start);
  return sql.slice(start, c === -1 ? sql.length : c);
}

const MIG_CODE = stripSqlComments(MIG);

// ═══════════════════════════════════════════════════════════════════════
describe('0314 — الدوال الخمس', () => {
  const fns = [
    'mrp_role_catalog',
    'can_manage_mrp_roles',
    'assign_mrp_role',
    'revoke_mrp_role',
    'mrp_role_assignments_overview',
  ];

  it.each(fns)('%s معرَّفة', (fn) => {
    expect(MIG_CODE).toContain(`FUNCTION public.${fn}`);
  });

  it.each(fns)('%s تثبّت search_path', (fn) => {
    expect(fnScope(MIG_CODE, fn)).toContain('SET search_path = public');
  });

  it('الدوال الجديدة تُسقَط صراحةً (CREATE OR REPLACE لا يغيّر نوع الإرجاع)', () => {
    for (const fn of ['mrp_role_catalog', 'can_manage_mrp_roles', 'revoke_mrp_role', 'mrp_role_assignments_overview']) {
      expect(MIG_CODE, fn).toContain(`DROP FUNCTION IF EXISTS public.${fn}`);
    }
  });

  it('anon محروم صراحةً من كل دالة', () => {
    for (const fn of fns) {
      expect(MIG_CODE, fn).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]{0,40}FROM anon`));
    }
  });
});

describe('0314 — الامتياز المركزي والتضييق الأمني', () => {
  const scope = fnScope(MIG_CODE, 'can_manage_mrp_roles');

  it('★ المدير يحتاج وحدة mrp — لا يكفي دور manager الخام', () => {
    expect(scope).toContain("a.unit_key  = 'mrp'");
    expect(scope).toContain("a.base_role = 'manager'");
    expect(scope).toContain('portal_unit_assignments');
  });

  it('★ لا يُمنح الامتياز لدور manager مباشرةً', () => {
    // ظهور 'manager' في قائمة أدوار مسموحة = عودة الثغرة الأفقية
    expect(scope).not.toMatch(/current_user_role\(\)\s+IN\s*\([^)]*'manager'/);
  });

  it('يقبل أدوار المنصة و manufacturing', () => {
    expect(scope).toContain("'admin','developer','it_admin'");
    expect(scope).toContain("'manufacturing'");
  });

  it('assign و revoke يستعملان الامتياز المركزي لا شروطاً منسوخة', () => {
    for (const fn of ['assign_mrp_role', 'revoke_mrp_role']) {
      expect(fnScope(MIG_CODE, fn), fn).toContain('public.can_manage_mrp_roles()');
    }
  });
});

describe('0314 — السحب والأرشفة', () => {
  const scope = fnScope(MIG_CODE, 'revoke_mrp_role');

  it('لا حذف نهائي — تعطيل فقط', () => {
    expect(scope).toContain('SET is_active = FALSE');
    expect(scope).not.toMatch(/DELETE\s+FROM\s+public\.mrp_user_roles/);
  });

  it('★ يطابق plant_id=NULL بأمان عبر IS NOT DISTINCT FROM', () => {
    // "= p_plant_id" مع NULL يعطي NULL فلا يُطابق شيئاً
    expect(scope).toContain('IS NOT DISTINCT FROM');
  });

  it('يفلتر بالمستأجر', () => {
    expect(scope).toContain('m.tenant_id          = v_tenant');
  });
});

describe('0314 — الكتالوج مصدر حقيقة واحد', () => {
  const scope = fnScope(MIG_CODE, 'mrp_role_catalog');

  it('★ مُشتقّ من قيد CHECK لا من قائمة منسوخة', () => {
    expect(scope).toContain('pg_get_constraintdef');
    expect(scope).toContain('mrp_user_roles');
  });

  it('لا يحوي مصفوفة أدوار مكتوبة يدوياً', () => {
    expect(scope).not.toMatch(/ARRAY\s*\[\s*'mrp_planner'/);
    expect(scope).not.toMatch(/VALUES\s*\(\s*'mrp_planner'/);
  });

  it('يوثّق سبب عدم مطابقة البنية كاملةً (درس التشغيل)', () => {
    expect(MIG).toContain('اكتُشف بالتشغيل');
  });
});

describe('0314 — العزل والحرّاس', () => {
  it('overview يحرس بالامتياز داخل الاستعلام (لا خطأ يكشف الوجود)', () => {
    const scope = fnScope(MIG_CODE, 'mrp_role_assignments_overview');
    expect(scope).toContain('public.can_manage_mrp_roles()');
    expect(scope).toContain('m.tenant_id = public.current_user_tenant_id()');
  });

  it('assign يفحص انتماء المصنع للمستأجر', () => {
    expect(fnScope(MIG_CODE, 'assign_mrp_role')).toContain('PLANT_NOT_IN_TENANT');
  });

  it('المايجريشن يختبر التضييق سلوكياً لا نصّياً', () => {
    expect(MIG_CODE).toContain('horizontal escalation');
    expect(MIG_CODE).toContain('0314 failed: manager with mrp unit still denied');
  });

  it('يوثّق تصحيح الحارس الميت (OR TRUE) علناً', () => {
    expect(MIG).toContain('تأكيداً ميتاً يمرّ دائماً');
  });

  it('لا حِمل زائد على أي دالة', () => {
    expect(MIG_CODE).toMatch(/ASSERT v_cnt = 1, format\('0314 failed: %s overloads/);
  });
});

describe('0314 — الاختبار السلوكي', () => {
  it('يغطي التضييق الأمني ووحدة أخرى لا تكفي', () => {
    expect(VERIFY).toContain('تصعيد أفقي');
    expect(VERIFY).toContain('وحدة hr منحت امتياز إدارة أدوار التصنيع');
  });

  it('يغطي تمييز النطاق في السحب', () => {
    expect(VERIFY).toContain('السحب بلا مصنع سحب المُنطَّق بمصنع');
  });

  it('يغطي الأدوار المتعددة للمستخدم الواحد', () => {
    expect(VERIFY).toContain('الأدوار المتعددة لا تعمل');
  });

  it('يغطي العزل بين المستأجرين في العرض', () => {
    expect(VERIFY).toContain('تسرّب مستأجر: رأى');
  });

  it('يتحقق أن الكتالوج يطابق ما يقبله القيد', () => {
    expect(VERIFY).toContain('الكتالوج يحوي دوراً لا يقبله القيد');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('MrpRoleService — طبقة SDK', () => {
  it('كل دالة قاعدة لها غلاف', () => {
    for (const rpc of [
      'mrp_role_catalog',
      'can_manage_mrp_roles',
      'current_user_mrp_roles',
      'mrp_role_assignments_overview',
      'assign_mrp_role',
      'revoke_mrp_role',
    ]) {
      expect(SVC, rpc).toContain(`'${rpc}'`);
    }
  });

  it('★ الكتالوج يُقرأ من القاعدة لا من ثابت TS', () => {
    expect(SVC).toContain("supabase.rpc('mrp_role_catalog')");
    // لا مصفوفة تسميات مكتوبة يدوياً تنافس القاعدة
    expect(SVC).not.toMatch(/const MRP_ROLE_LABELS[^=]*=\s*\{/);
  });

  it('يترجم أخطاء القاعدة للعربية', () => {
    expect(SVC).toContain('NOT_AUTHORIZED_TO_ASSIGN_MRP_ROLE');
    expect(SVC).toContain('PLANT_NOT_IN_TENANT');
    expect(SVC).toContain('translateError');
  });

  it('revoke يعيد عدد الصفوف لا يبتلعه', () => {
    expect(SVC).toMatch(/async revoke\([\s\S]*?Promise<number>/);
  });

  it('canManage تفشل بأمان إلى false', () => {
    expect(SVC).toMatch(/if \(error\) return false;/);
  });
});

describe('MrpRolesAdminPage — الصفحة', () => {
  it('★ لا تلمس Supabase مباشرة', () => {
    expect(PAGE).not.toContain("from '../../services/supabase");
    expect(PAGE).not.toContain('supabase.from(');
    expect(PAGE).not.toContain('supabase.rpc(');
  });

  it('★ لا confirm() ولا prompt()', () => {
    // تصحيح: النسخة الأولى جرّدت أسطر // و * فقط، فالتقطت ذكر
    // «لا confirm()» داخل تعليق JSX ‎{/* … */}‎ وسقط الاختبار على
    // توثيق يقول إننا تجنّبناه. الذكرُ في التعليق ليس استخداماً.
    const code = PAGE
      .replace(/\/\*[\s\S]*?\*\//g, '')  // كتل /* */ وتشمل {/* */}
      .replace(/^\s*\/\/.*$/gm, '');     // أسطر //
    expect(code).not.toMatch(/(?<![\w.])confirm\s*\(/);
    expect(code).not.toMatch(/(?<![\w.])prompt\s*\(/);
  });

  it('حارس التجريد: يكشف confirm() حقيقياً خارج التعليقات', () => {
    // يمنع أن يصير التجريد فضفاضاً فيمرّ استعمال فعلي
    const injected = PAGE + '\nconst x = confirm("حقيقي");';
    const code = injected
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/(?<![\w.])confirm\s*\(/);
  });

  it('★ لا as any', () => {
    expect(PAGE).not.toMatch(/\bas any\b/);
  });

  it('تأكيد السحب داخل Modal', () => {
    expect(PAGE).toContain('تأكيد سحب الدور');
    expect(PAGE).toContain('revokeTarget');
  });

  it('تعرض شاشة واضحة لغير المخوَّل', () => {
    expect(PAGE).toContain('إدارة أدوار التصنيع غير متاحة لحسابك');
    expect(PAGE).toContain('canManage');
  });

  it('تشرح سبب وجود دورين (خشن ودقيق)', () => {
    expect(PAGE).toContain('profiles.role');
    expect(PAGE).toContain('أقل امتياز');
  });

  it('تُظهر المسحوبة بوسم لا تُخفيها نهائياً (التدقيق)', () => {
    expect(PAGE).toContain('showArchived');
    expect(PAGE).toContain('عرض المسحوبة');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('التسجيل في المواضع الخمسة', () => {
  it('① Sidebar.tsx', () => {
    expect(SIDEBAR).toContain("id: 'admin-mrp-roles'");
    expect(SIDEBAR).toContain("permKey: 'admin-mrp-roles'");
  });

  it('② hybridPagesCatalog.ts', () => {
    expect(CATALOG).toContain("id: 'admin-mrp-roles'");
  });

  it('③ AppRouter.tsx + legacyRedirect.ts', () => {
    expect(ROUTER).toContain('MrpRolesAdminPage');
    expect(ROUTER).toContain('path="mrp-roles"');
    expect(LEGACY).toContain("'admin-mrp-roles'");
    expect(LEGACY).toContain('/app/admin/mrp-roles');
  });

  it('④ permissions.ts — PERMISSION_KEYS', () => {
    expect(PERMS).toContain("'admin-mrp-roles',");
  });

  it('⑤ permissions.ts — كتلة admin (وليس المفتاح وحده)', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('admin-mrp-roles');
  });

  it('المسار في legacyRedirect يطابق المسار في AppRouter', () => {
    expect(LEGACY).toContain("'/app/admin/mrp-roles'");
    expect(ROUTER).toContain('path="mrp-roles"');
  });
});

// ═══════════════════════════════════════════════════════════════════════
describe('★ حارس دائم: مفاتيح الشريط الجانبي مقابل كتل الأدوار', () => {
  /**
   * صنف الخطأ: مفتاح في PERMISSION_KEYS وفي Sidebar لكنه غائب عن كتلة
   * الدور ⇒ hasPermission() يحجب العنصر صامتاً. أصاب 'admin-approval-rules'
   * منذ 0308 فلم يرَ المديرُ صفحةَ قواعد الاعتماد إطلاقاً.
   */
  const adminItems = [...SIDEBAR.matchAll(
    /\{\s*id:\s*'([^']+)',[^}]*?roles:\s*\[([^\]]*)\][^}]*?permKey:\s*'([^']+)'/g,
  )]
    .filter((m) => {
      const roles = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
      return roles.length === 1 && roles[0] === 'admin';
    })
    .map((m) => ({ id: m[1], permKey: m[3] }));

  it('استُخرجت عناصر admin من الشريط الجانبي', () => {
    expect(adminItems.length).toBeGreaterThan(3);
  });

  it('كل عنصر admin-only يراه المدير فعلاً', () => {
    const eff = getEffectivePermissions('admin' as never, null);
    const hidden = adminItems.filter((it) => !hasPermission(eff, it.permKey));
    expect(
      hidden.map((h) => `${h.id} (permKey=${h.permKey})`),
      'عناصر في شريط المدير لكنها محجوبة بـ hasPermission — مفتاحها غائب عن كتلة admin',
    ).toEqual([]);
  });

  it('admin-approval-rules صار مرئياً (إصلاح انحدار 0308)', () => {
    const eff = getEffectivePermissions('admin' as never, null);
    expect(hasPermission(eff, 'admin-approval-rules')).toBe(true);
  });

  it('admin-mrp-roles مرئي', () => {
    const eff = getEffectivePermissions('admin' as never, null);
    expect(hasPermission(eff, 'admin-mrp-roles')).toBe(true);
  });
});
