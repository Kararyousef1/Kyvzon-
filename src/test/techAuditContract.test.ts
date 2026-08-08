/**
 * ════════════════════════════════════════════════════════════════
 *  techAuditContract.test.ts
 *
 *  عقد تطوير بوابة التقنية: السجلّ الموحّد · الأخطاء · المهام (0330).
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-tech-audit-0330.sql       38 تأكيداً
 *      tools/dev/verify-tech-audit-0330-rls.sh    عبر RLS حقيقي
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0330 = read('supabase/migrations/0330_tech_portal_unified_audit.sql');
const VERIFY = read('tools/dev/verify-tech-audit-0330.sql');
const SVC = read('src/services/sdk/TechAuditService.ts');
const AUDIT_PAGE = read('src/pages/techportal/pages/AuditTrailPage.tsx');
const ERROR_PAGE = read('src/pages/techportal/pages/ErrorLogsPage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const CATALOG = read('src/pages/hybridportal/hybridPagesCatalog.ts');
const PERMS = read('src/core/constants/permissions.ts');
const LEGACY = read('src/router/legacyRedirect.ts');
const SDK_INDEX = read('src/services/sdk/index.ts');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0330 — السجلّ الموحّد', () => {
  it('★ يجمع 15 جدول تدقيق', () => {
    for (const t of [
      'audit_logs', 'audit_vault', 'permission_audit_logs', 'contract_audit_log',
      'crm_audit_log', 'finance_audit_events', 'inventory_audit_log',
      'invoice_audit_log', 'movement_audit_events', 'mrp_audit_log',
      'po_audit_log', 'pr_audit_log', 'procurement_audit_events',
      'rfx_event_audit_log', 'supplier_audit_log',
    ]) {
      expect(M0330).toContain(`public.${t}`);
    }
  });

  it('★★ platform_audit_log مُستثنى عمداً (بيانات منصة — قرار 0328)', () => {
    const s = M0330.indexOf('CREATE OR REPLACE VIEW public.tech_audit_unified');
    const e = M0330.indexOf('COMMENT ON VIEW public.tech_audit_unified');
    expect(M0330.slice(s, e)).not.toContain('platform_audit_log');
  });

  it('★ يُطبّع أسماء الأعمدة المختلفة', () => {
    const s = M0330.indexOf('CREATE OR REPLACE VIEW public.tech_audit_unified');
    const e = M0330.indexOf('COMMENT ON VIEW public.tech_audit_unified');
    const body = M0330.slice(s, e);
    // الفاعل: actor_id · user_id · changed_by
    expect(body).toMatch(/COALESCE\(a\.actor_id, a\.user_id\)/);
    expect(body).toMatch(/p\.changed_by/);
    // الفعل: action · event_type
    expect(body).toMatch(/f\.event_type/);
    // الوقت: created_at · timestamp
    expect(body).toMatch(/v\."timestamp"/);
  });

  it('العرض محجوب عن anon', () => {
    expect(M0330).toMatch(/REVOKE ALL ON public\.tech_audit_unified FROM anon/);
    expect(M0330).toMatch(/GRANT SELECT ON public\.tech_audit_unified TO authenticated/);
  });
});

describe('0330 — دوال المستأجر', () => {
  it.each(['tech_audit_trail', 'tech_audit_modules', 'tech_error_log', 'tech_error_summary'])(
    '★ %s بـSECURITY INVOKER (تحترم RLS كل جدول)',
    (fn) => {
      const s = M0330.indexOf(`CREATE FUNCTION public.${fn}`);
      const e = M0330.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      const body = M0330.slice(s, e);
      expect(body).toMatch(/SECURITY INVOKER/);
      expect(body).not.toMatch(/SECURITY DEFINER/);
    },
  );

  it('★ الحدّ والإزاحة مقصوصان (لا استعلام مفتوح)', () => {
    expect(M0330).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_limit, 100\), 500\)\)/);
    expect(M0330).toMatch(/GREATEST\(0, COALESCE\(p_offset, 0\)\)/);
  });

  it('كلها تفلتر بالمستأجر', () => {
    for (const fn of ['tech_audit_trail', 'tech_audit_modules', 'tech_error_log']) {
      const s = M0330.indexOf(`CREATE FUNCTION public.${fn}`);
      const e = M0330.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      const body = M0330.slice(s, e);
      expect(body).toMatch(/current_user_tenant_id\(\)/);
      expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN/);
    }
  });

  it('★ ملخّص الأخطاء يُظهر كل مستوى ولو بصفر', () => {
    const s = M0330.indexOf('CREATE FUNCTION public.tech_error_summary');
    const e = M0330.indexOf('COMMENT ON FUNCTION public.tech_error_summary');
    const body = M0330.slice(s, e);
    expect(body).toMatch(/VALUES \('critical'\),\('high'\),\('medium'\),\('low'\)/);
    expect(body).toMatch(/LEFT JOIN/);
  });
});

describe('0330 — المهام المجدولة والعزل', () => {
  const body = (() => {
    const s = M0330.indexOf('CREATE FUNCTION public.tech_scheduled_jobs');
    const e = M0330.indexOf('COMMENT ON FUNCTION public.tech_scheduled_jobs');
    return M0330.slice(s, e);
  })();

  it('★★ لا تُعيد tenants_processed ولا details (نشاط بقية العملاء)', () => {
    expect(body).not.toMatch(/tenants_processed/);
    expect(body).not.toMatch(/j\.details/);
  });

  it('★ محصورة بتقنية الشركة (الجدول بلا tenant_id)', () => {
    expect(body).toMatch(/current_user_is_tenant_tech\(\)/);
    expect(body).toMatch(/IF NOT public\.current_user_is_tenant_tech\(\) THEN RETURN/);
  });

  it('السلامة تُقاس بآخر حالة + فشل 24 ساعة', () => {
    expect(body).toMatch(/= 'success'/);
    expect(body).toMatch(/INTERVAL '24 hours'/);
  });
});

describe('0330 — الصلاحيات', () => {
  it.each([
    'tech_audit_trail(TEXT,TEXT,INTEGER,INTEGER)',
    'tech_audit_modules()',
    'tech_error_log(TEXT,INTEGER,INTEGER)',
    'tech_error_summary(INTEGER)',
    'tech_scheduled_jobs()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0330).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0330).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO authenticated`));
  });

  it('★ المايجريشن قابل لإعادة التشغيل (DROP في المقدّمة)', () => {
    const dropAt = M0330.indexOf('DROP FUNCTION IF EXISTS public.tech_audit_trail');
    const createAt = M0330.indexOf('CREATE FUNCTION public.tech_audit_trail');
    expect(dropAt).toBeGreaterThan(-1);
    expect(dropAt).toBeLessThan(createAt);
  });
});

describe('0330 — طبقة SDK', () => {
  it('يمرّ عبر RPC لا Supabase مباشرة', () => {
    for (const fn of ['tech_audit_trail', 'tech_audit_modules', 'tech_error_log',
                      'tech_error_summary', 'tech_scheduled_jobs']) {
      expect(SVC).toContain(`rpc('${fn}'`);
    }
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('مُسجَّل في فهرس SDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ techAuditService \} from '\.\/TechAuditService'/);
  });
});

describe('0330 — الصفحتان الجديدتان', () => {
  it('الملفان موجودان', () => {
    expect(existsSync(resolve(root, 'src/pages/techportal/pages/AuditTrailPage.tsx'))).toBe(true);
    expect(existsSync(resolve(root, 'src/pages/techportal/pages/ErrorLogsPage.tsx'))).toBe(true);
  });

  it('تستعملان الخدمة لا Supabase مباشرة', () => {
    for (const src of [AUDIT_PAGE, ERROR_PAGE]) {
      expect(src).toMatch(/techAuditService\./);
      expect(codeOnly(src)).not.toMatch(/\.from\(/);
      expect(codeOnly(src)).not.toMatch(/supabase/);
    }
  });

  it('★ بلا confirm/alert/prompt ولا محاكاة ولا حذف نهائي', () => {
    for (const src of [AUDIT_PAGE, ERROR_PAGE]) {
      const code = codeOnly(src);
      expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
      expect(code).not.toMatch(/Math\.random/);
      expect(code).not.toMatch(/\.delete\(\)/);
      expect(code).not.toMatch(/\bas any\b/);
    }
  });

  it('★ تعرضان حالة فارغة مفسَّرة لا شاشة بيضاء', () => {
    expect(AUDIT_PAGE).toMatch(/لا أحداث مطابقة/);
    expect(ERROR_PAGE).toMatch(/لا أخطاء مُسجَّلة/);
  });

  it('★ لا إيحاء بنطاق المنصة', () => {
    for (const src of [AUDIT_PAGE, ERROR_PAGE]) {
      expect(src).not.toMatch(/للمنصة|كل الشركات|جميع الشركات/);
    }
    expect(AUDIT_PAGE).toMatch(/وحدات شركتك/);
  });
});

describe('0330 — التسجيل في المواضع المطلوبة', () => {
  it.each(['tech-audit-trail', 'tech-error-logs'])('%s مُسجَّل في كل المواضع', (id) => {
    // ① AppRouter
    expect(ROUTER).toMatch(new RegExp(`path="${id.replace('tech-', '')}"`));
    // ② Sidebar — العنصر + خريطة الوحدة
    expect(SIDEBAR).toContain(`id: '${id}'`);
    expect(SIDEBAR).toContain(`'${id}': 'tech_portal'`);
    // ③ hybridPagesCatalog
    expect(CATALOG).toContain(`id: '${id}'`);
    // ④ permissions — المفتاح + الأدوار
    expect(PERMS).toContain(`'${id}',`);
    // ⑤ VIEW_TO_PATH — الشريط الجانبي يعتمده لتحويل id → مسار
    expect(LEGACY).toContain(`'${id}':`);
  });

  it('★ الصفحتان في PERMISSION_KEYS (وإلا رفضهما tsc)', () => {
    const s = PERMS.indexOf("'tech-portal',");
    const block = PERMS.slice(s, s + 400);
    expect(block).toContain("'tech-audit-trail'");
    expect(block).toContain("'tech-error-logs'");
  });

  it('★ التسجيل في VIEW_TO_PATH مُعلَّل (الطبقة مهجورة)', () => {
    const i = LEGACY.indexOf("'tech-audit-trail':");
    const before = LEGACY.slice(Math.max(0, i - 400), i);
    expect(before).toMatch(/Sidebar|الشريط الجانبي/);
  });
});

describe('0330 — الاختبار السلوكي', () => {
  it('يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0330: %\/38 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص استثناء platform_audit_log', () => {
    expect(VERIFY).toMatch(/platform_audit_log ضمن السجلّ الموحّد/);
  });

  it('★ يفحص أن كل مستوى خطورة يظهر ولو بصفر', () => {
    expect(VERIFY).toMatch(/بطاقة مفقودة تُقرأ «لا مشكلة»/);
  });

  it('★ يفحص عدم كشف tenants_processed', () => {
    expect(VERIFY).toMatch(/الدالة تكشف tenants_processed/);
  });

  it('★ يفحص أن الموظف العادي محجوب عن المهام', () => {
    expect(VERIFY).toMatch(/موظف عادي يرى %s مهمة مجدولة/);
  });

  it('يوثّق ملاحظات الأعمدة المُحقَّقة', () => {
    expect(VERIFY).toMatch(/entity_table\s+NOT NULL/);
    expect(VERIFY).toMatch(/يستعملان `timestamp` لا `created_at`/);
  });
});
