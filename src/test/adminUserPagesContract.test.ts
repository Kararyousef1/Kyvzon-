/**
 * ════════════════════════════════════════════════════════════════
 *  adminUserPagesContract.test.ts
 *
 *  حارس تطابق قوائم الصفحات — يمنع تكرار عطل مُقاس.
 *
 *  ═══ العطل الذي أوجد هذا الحارس ═══════════════════════════════
 *
 *  `AdminEmployeesPage.tsx` يحمل `PORTAL_PAGES` — قائمة **مكتوبة
 *  يدوياً** لصفحات كل بوابة، تُستعمل في الخطوة الثالثة من إضافة
 *  مستخدم لبناء `custom_permissions.allowed_pages`.
 *
 *  وهي منفصلة تماماً عن `hybridPagesCatalog.ts`. فكلّما أُضيفت صفحة
 *  جديدة ونُسيت هنا، لا تُمنح لأي مستخدم جديد — و`Sidebar.tsx` يُرجِع
 *  `allowedPages.includes(item.id)` فتختفي من الشريط الجانبي **تماماً**
 *  لكل من له `allowed_pages`.
 *
 *  القياس وقت الاكتشاف:
 *      tech_portal:  7 من 11   ← نقص 4 (0330 · 0331 · 0332)
 *      admin:       12 من 14   ← نقص admin-permissions · admin-mrp-roles
 *      hr:          26 من 27   ← نقص hr-leave-requests
 *
 *  ملاحظة الصفحات «الزائدة»: بعض الوحدات تحوي في `PORTAL_PAGES` صفحات
 *  أكثر من الكتالوج (mrp · inventory · crm · marketing · tawathul).
 *  هذا **ليس عطلاً**: الكتالوج يخدم الخطة الهجينة وحدها ولا يلزم أن
 *  يُدرج كل صفحة. الاتجاه الخطير واحد فقط:
 *      صفحة في الكتالوج وغائبة عن إدارة المستخدمين.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const ADMIN_EMP = read('src/pages/admin/AdminEmployeesPage.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const PERMS = read('src/core/constants/permissions.ts');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');

/** صفحات كل وحدة كما تراها الخطوة الثالثة في إدارة المستخدمين */
function adminPagesByModule(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = /portalLabel: '[^']+', moduleKey: '([^']+)',\s*\n\s*pages: \[([\s\S]*?)\n {4}\],/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ADMIN_EMP)) !== null) {
    const mod = m[1];
    const ids = [...m[2].matchAll(/\{ id: '([^']+)'/g)].map((x) => x[1]);
    if (!out.has(mod)) out.set(mod, new Set());
    for (const id of ids) out.get(mod)!.add(id);
  }
  return out;
}

/** صفحات كل وحدة في كتالوج الخطة الهجينة */
function catalogPagesByModule(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of CATALOG.matchAll(/\{ id: '([^']+)',[^\n]*module: '([^']+)'/g)) {
    const [, id, mod] = m;
    if (!out.has(mod)) out.set(mod, new Set());
    out.get(mod)!.add(id);
  }
  return out;
}

const ADMIN = adminPagesByModule();
const CAT = catalogPagesByModule();

describe('تطابق قوائم الصفحات — إدارة المستخدمين ↔ الكتالوج', () => {
  it('★ الاستخراج نفسه يعمل (وإلا مرّ الحارس فارغاً)', () => {
    expect(ADMIN.size).toBeGreaterThan(10);
    expect(CAT.size).toBeGreaterThan(5);
    expect(ADMIN.get('tech_portal')?.size ?? 0).toBeGreaterThan(0);
  });

  it('★★ لا صفحة في الكتالوج غائبة عن إدارة المستخدمين', () => {
    const gaps: string[] = [];
    for (const [mod, catIds] of CAT) {
      const adminIds = ADMIN.get(mod) ?? new Set<string>();
      for (const id of catIds) {
        if (!adminIds.has(id)) gaps.push(`${mod} → ${id}`);
      }
    }
    expect(
      gaps,
      `صفحات لا تُمنح لأي مستخدم جديد ⇒ تختفي من الشريط الجانبي:\n  ${gaps.join('\n  ')}`,
    ).toEqual([]);
  });
});

describe('★ بوابة التقنية — الصفحات الإحدى عشرة في كل موضع', () => {
  const TECH_PAGES = [
    'tech-dashboard',
    'biometric-devices',
    'sync-logs',
    'attendance-analytics',
    'system-health',
    'security-events',
    'tech-audit-trail',
    'tech-error-logs',
    'tech-integrations',
    'tech-data-exports',
    'tech-settings',
  ] as const;

  it('العدد أحد عشر لا أقل', () => {
    expect(ADMIN.get('tech_portal')?.size).toBe(11);
    expect(CAT.get('tech_portal')?.size).toBe(11);
  });

  it.each(TECH_PAGES)('%s في إدارة المستخدمين (الخطوة الثالثة)', (id) => {
    expect(ADMIN.get('tech_portal')!.has(id)).toBe(true);
  });

  it.each(TECH_PAGES)('%s في كتالوج الخطة الهجينة', (id) => {
    expect(CAT.get('tech_portal')!.has(id)).toBe(true);
  });

  it.each(TECH_PAGES)('%s في عنصر تنقّل الشريط الجانبي', (id) => {
    expect(SIDEBAR).toContain(`id: '${id}'`);
  });

  it.each(TECH_PAGES)('%s في خريطة وحدة الشريط الجانبي', (id) => {
    expect(SIDEBAR).toContain(`'${id}': 'tech_portal'`);
  });

  it.each(TECH_PAGES)('%s في VIEW_TO_PATH', (id) => {
    expect(LEGACY).toContain(`'${id}':`);
  });

  /**
   * ★ الصفحات الأربع الجديدة وحدها هي ما يحتاج PERMISSION_KEYS.
   *   السبع القديمة تُمنح عبر مسار مختلف (allowed_pages مباشرة).
   */
  it.each(['tech-audit-trail', 'tech-error-logs', 'tech-integrations', 'tech-data-exports'])(
    '%s في PERMISSION_KEYS (وإلا رفضه tsc)',
    (id) => {
      expect(PERMS).toContain(`'${id}',`);
    },
  );

  it('★★ الصفحات الأربع الجديدة مسجّلة لدورَي it_admin وtech', () => {
    for (const id of ['tech-audit-trail', 'tech-error-logs',
                      'tech-integrations', 'tech-data-exports']) {
      // مرة في PERMISSION_KEYS + مرة لكل دور = 3 على الأقل
      const n = (PERMS.match(new RegExp(`'${id}',`, 'g')) ?? []).length;
      expect(n, `${id} مذكور ${n} مرة فقط`).toBeGreaterThanOrEqual(3);
    }
  });

  it('★ كل مسار له <Route> في AppRouter', () => {
    for (const p of ['dashboard', 'biometric', 'sync-logs', 'attendance-analytics',
                     'system-health', 'security-events', 'audit-trail', 'error-logs',
                     'integrations', 'data-exports', 'settings']) {
      expect(ROUTER, `المسار ${p} بلا Route`).toContain(`path="${p}"`);
    }
  });
});

describe('★ ما لا يجوز أن يظهر في بوابة التقنية', () => {
  const PAGES = [
    'src/pages/techportal/pages/TechDashboard.tsx',
    'src/pages/techportal/pages/BiometricDevicesPage.tsx',
    'src/pages/techportal/pages/SyncLogsPage.tsx',
    'src/pages/techportal/pages/AttendanceAnalytics.tsx',
    'src/pages/techportal/pages/SystemHealthPage.tsx',
    'src/pages/techportal/pages/SecurityEventsPage.tsx',
    'src/pages/techportal/pages/AuditTrailPage.tsx',
    'src/pages/techportal/pages/ErrorLogsPage.tsx',
    'src/pages/techportal/pages/IntegrationsPage.tsx',
    'src/pages/techportal/pages/DataExportsPage.tsx',
    'src/pages/techportal/pages/TechSettingsPage.tsx',
  ];

  function codeOnly(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it.each(PAGES)('%s بلا confirm/alert/prompt ولا as any', (path) => {
    const code = codeOnly(read(path));
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(code).not.toMatch(/\bas any\b/);
  });

  it.each(PAGES)('%s لا تلمس Supabase مباشرة', (path) => {
    expect(codeOnly(read(path))).not.toMatch(/supabase/);
  });

  /**
   * ★★ البوابة خاصة بالشركة المستأجِرة. أي لفظ يوحي بنطاق المنصة
   *   تسريبٌ لمعلومة عن نظام المنصة داخل بوابة العميل.
   */
  it.each(PAGES)('%s لا توحي بنطاق المنصة', (path) => {
    const src = read(path);
    expect(src).not.toMatch(/كل الشركات|جميع الشركات|كل المستأجرين|جميع المستأجرين/);
  });
});
