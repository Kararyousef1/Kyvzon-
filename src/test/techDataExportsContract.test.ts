/**
 * ════════════════════════════════════════════════════════════════
 *  techDataExportsContract.test.ts
 *
 *  عقد الصادرات الموحّدة وأحداث الناقلين (migration 0332).
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-tech-exports-0332.sql       78 تأكيداً
 *      tools/dev/verify-tech-exports-0332-rls.sh    16 عبر RLS حقيقي
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0332_tech_unified_exports_and_webhooks.sql');
const VERIFY = read('tools/dev/verify-tech-exports-0332.sql');
const RLS = read('tools/dev/verify-tech-exports-0332-rls.sh');
const SVC = read('src/services/sdk/TechIntegrationsService.ts');
const PAGE = read('src/pages/techportal/pages/DataExportsPage.tsx');
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

/** جسم دالة واحدة: من CREATE FUNCTION إلى COMMENT ON المقابل */
function fnBody(name: string): string {
  const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return M.slice(s, e);
}

describe('0332 — سجلّ الصادرات الموحّد', () => {
  const body = fnBody('tech_export_log');

  it('★ يقرأ المصادر الخمسة لا export_logs وحده (العطل ①)', () => {
    for (const t of [
      'finance_report_exports',
      'inventory_report_exports',
      'mrp_bom_export_requests',
      'mrp_manufacturing_export_requests',
      'export_logs',
    ]) {
      expect(body).toContain(`public.${t}`);
    }
  });

  it('★ أربعة UNION ALL تربط خمسة مصادر', () => {
    expect((body.match(/UNION ALL/g) ?? []).length).toBe(4);
  });

  it('★★ كل فرع مُقيَّد بمستأجر المستخدم — لا استثناء', () => {
    for (const alias of ['f', 'i', 'b', 'm', 'x']) {
      expect(body).toContain(`${alias}.tenant_id = v_tenant`);
    }
  });

  it('★ SECURITY INVOKER — يحترم RLS الجداول الخمسة لا يتجاوزها', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('★ يعود صفراً بلا مستأجر (لا يسرّب للمجهول)', () => {
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN; END IF;/);
  });

  it('★ الجدول الصحيح: inventory_periodic_report_runs لا inventory_report_runs', () => {
    expect(body).toContain('public.inventory_periodic_report_runs');
    expect(body).not.toMatch(/public\.inventory_report_runs\b/);
  });

  it('يحلّ المرجع من جدول التشغيل لا يعرض UUID خام', () => {
    expect(body).toMatch(/LEFT JOIN public\.finance_report_runs/);
    expect(body).toMatch(/rr\.report_name/);
  });

  it('يحلّ اسم الطالب (المساءلة تحتاج اسماً)', () => {
    expect(body).toMatch(/LEFT JOIN public\.profiles/);
  });

  it('★ error_message يُقرأ — كان يُكتب ولا يُقرأ', () => {
    expect(body).toMatch(/f\.error_message/);
  });

  it('الترشيحان اختياريان ومستقلّان', () => {
    expect(body).toMatch(/p_source IS NULL OR u\.src\s*=\s*p_source/);
    expect(body).toMatch(/p_status IS NULL OR u\.st\s*=\s*p_status/);
  });

  it('الحدّ والإزاحة مقصوصان', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_limit, 100\), 500\)\)/);
    expect(body).toMatch(/GREATEST\(0, COALESCE\(p_offset, 0\)\)/);
  });

  it('★ الحالات معرَّبة كلّها (ثماني قيم من قيود CHECK الأربعة)', () => {
    for (const st of ['requested', 'queued', 'processing', 'generating',
                      'ready', 'failed', 'cancelled', 'expired']) {
      expect(body).toContain(`WHEN '${st}'`);
    }
  });
});

describe('0332 — ملخّص الصادرات', () => {
  const body = fnBody('tech_export_summary');

  it('★ يبني فوق السجلّ الموحّد لا فوق export_logs', () => {
    expect(body).toMatch(/public\.tech_export_log\(NULL, NULL, 500, 0\)/);
  });

  it('★ يفصل الحالات: جاهز · معلّق · فاشل', () => {
    expect(body).toMatch(/FILTER \(WHERE r\.st = 'ready'\)/);
    expect(body).toMatch(/FILTER \(WHERE r\.st = 'failed'\)/);
    expect(body).toMatch(/FILTER \(WHERE r\.st IN \('requested','queued','processing','generating'\)\)/);
  });

  it('★ الفشل أولاً في الترتيب (التقني يبحث عن العطل)', () => {
    expect(body).toMatch(/ORDER BY count\(\*\) FILTER \(WHERE r\.st = 'failed'\) DESC/);
  });

  it('النافذة الزمنية مقصوصة ومطبَّقة', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_days, 30\), 365\)\)/);
    expect(body).toMatch(/r\.at\b|out_requested_at >= v_since/);
  });
});

describe('0332 — الصادرات المتعثّرة', () => {
  const body = fnBody('tech_export_failures');

  it('★ يلتقط الفاشل والعالق معاً (العطلان ②③)', () => {
    expect(body).toMatch(/e\.out_status = 'failed'/);
    expect(body).toMatch(/e\.out_status IN \('requested','queued','processing','generating'\)/);
  });

  it('★★ العتبة مطبَّقة فعلاً لا صورية', () => {
    expect(body).toMatch(/e\.out_requested_at < NOW\(\) - \(v_h \|\| ' hours'\)::INTERVAL/);
  });

  it('★ الحالة ready لا تُعدّ عالقة أبداً', () => {
    const cond = body.slice(body.indexOf('WHERE e.out_status'), body.indexOf('ORDER BY'));
    expect(cond).not.toMatch(/'ready'/);
  });

  it('يميّز failed من stuck بحقل صريح', () => {
    expect(body).toMatch(/THEN 'failed' ELSE 'stuck'/);
    expect(body).toMatch(/THEN 'فشل' ELSE 'عالق'/);
  });

  it('★ العمر محسوب في القاعدة لا في المتصفح', () => {
    expect(body).toMatch(/EXTRACT\(EPOCH FROM \(NOW\(\) - e\.out_requested_at\)\) \/ 3600\.0/);
  });

  it('★ الأقدم أولاً (الأطول تعثّراً أخطر)', () => {
    expect(body).toMatch(/ORDER BY e\.out_requested_at ASC/);
  });

  it('العتبة مقصوصة', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_stuck_hours, 6\), 720\)\)/);
  });
});

describe('0332 — أحداث ناقلي الشحن', () => {
  const body = fnBody('tech_carrier_webhooks');

  it('★ يستعمل received_at لا created_at (بنية الجدول مُحقَّقة)', () => {
    expect(body).toMatch(/w\.received_at/);
    expect(body).not.toMatch(/w\.created_at/);
  });

  it('★ يستعمل processed BOOLEAN لا status', () => {
    expect(body).toMatch(/w\.processed/);
    expect(body).not.toMatch(/w\.status/);
  });

  it('★★ LEFT JOIN — الناقل محذوف بـON DELETE SET NULL فلا تضيع أحداثه', () => {
    expect(body).toMatch(/LEFT JOIN public\.inventory_carriers/);
    expect(body).toMatch(/— ناقل محذوف —/);
  });

  it('مُقيَّد بالمستأجر', () => {
    expect(body).toMatch(/w\.tenant_id = v_tenant/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN; END IF;/);
  });

  it('★ غير المعالَج أولاً', () => {
    expect(body).toMatch(/ORDER BY w\.processed ASC/);
  });

  it('يعدّ مفاتيح الحمولة (الحمولة الفارغة عطل صامت)', () => {
    expect(body).toMatch(/jsonb_object_keys\(COALESCE\(w\.payload, '\{\}'::jsonb\)\)/);
  });

  it('الترشيح الثلاثي: الكل · معالَج · معلّق', () => {
    expect(body).toMatch(/p_processed IS NULL OR w\.processed = p_processed/);
  });
});

describe('0332 — ملخّص الناقلين', () => {
  const body = fnBody('tech_webhook_summary');

  it('★★ عمر **أقدم** عالق لا أحدثه', () => {
    expect(body).toMatch(/min\(w\.received_at\) FILTER \(WHERE NOT w\.processed\)/);
    expect(body).not.toMatch(/max\(w\.received_at\) FILTER \(WHERE NOT w\.processed\)/);
  });

  it('★ ناقل بلا عالق يعطي 0 لا NULL (COALESCE)', () => {
    expect(body).toMatch(/COALESCE\(\s*round\(EXTRACT/);
  });

  it('★ الأكثر تعليقاً أولاً', () => {
    expect(body).toMatch(/ORDER BY count\(\*\) FILTER \(WHERE NOT w\.processed\) DESC/);
  });

  it('★★ مُقيَّد بالمستأجر — تسريبه لا يُكشف بعدّ الصفوف', () => {
    expect(body).toMatch(/WHERE w\.tenant_id = v_tenant/);
  });

  it('النافذة مقصوصة', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_days, 7\), 365\)\)/);
  });
});

describe('0332 — الفهارس', () => {
  it.each([
    'idx_fin_report_exports_tenant_req',
    'idx_inv_report_exports_tenant_req',
    'idx_mrp_bom_exports_tenant_req',
    'idx_mrp_mfg_exports_tenant_req',
    'idx_export_logs_tenant_created',
    'idx_carrier_webhooks_tenant_pending',
    'idx_carrier_webhooks_tenant_received',
  ])('%s موجود وقابل لإعادة التشغيل', (idx) => {
    expect(M).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
  });

  it('★ فهرس العالق جزئي (الأقلية هي المستعلَم عنها بإلحاح)', () => {
    const s = M.indexOf('idx_carrier_webhooks_tenant_pending');
    expect(M.slice(s, s + 220)).toMatch(/WHERE NOT processed/);
  });
});

describe('0332 — الصلاحيات وقابلية إعادة التشغيل', () => {
  it.each([
    'tech_export_log(TEXT,TEXT,INTEGER,INTEGER)',
    'tech_export_summary(INTEGER)',
    'tech_export_failures(INTEGER)',
    'tech_carrier_webhooks(BOOLEAN,INTEGER,INTEGER)',
    'tech_webhook_summary(INTEGER)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★★ التوقيع القديم tech_export_log(INTEGER,INTEGER) مُسقَط صراحةً', () => {
    expect(M).toContain('DROP FUNCTION IF EXISTS public.tech_export_log(INTEGER, INTEGER);');
  });

  it('★ كل DROP قبل أي CREATE (درس 0320: OR REPLACE لا يغيّر نوع الإرجاع)', () => {
    const lastDrop = M.lastIndexOf('DROP FUNCTION IF EXISTS');
    const firstCreate = M.indexOf('CREATE FUNCTION public.');
    expect(lastDrop).toBeGreaterThan(-1);
    expect(lastDrop).toBeLessThan(firstCreate);
  });
});

describe('0332 — طبقة SDK', () => {
  it('يمرّ عبر RPC لا Supabase مباشرة', () => {
    for (const fn of ['tech_export_log', 'tech_export_summary', 'tech_export_failures',
                      'tech_carrier_webhooks', 'tech_webhook_summary']) {
      expect(SVC).toContain(`rpc('${fn}'`);
    }
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('★ exportLog يمرّر p_source وp_status (التوقيع الجديد)', () => {
    const s = SVC.indexOf("rpc('tech_export_log'");
    const chunk = SVC.slice(s, s + 300);
    expect(chunk).toMatch(/p_source:/);
    expect(chunk).toMatch(/p_status:/);
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });

  it('الأنواع الخمسة مُصدَّرة من فهرس SDK', () => {
    for (const t of ['ExportSource', 'ExportFailure',
                     'CarrierWebhookEvent', 'CarrierWebhookSummary']) {
      expect(SDK_INDEX).toContain(t);
    }
  });
});

describe('0332 — الصفحة', () => {
  it('الصفحة موجودة وتستعمل الخدمة', () => {
    expect(existsSync(resolve(root, 'src/pages/techportal/pages/DataExportsPage.tsx'))).toBe(true);
    expect(PAGE).toMatch(/techIntegrationsService\./);
  });

  it('★ لا تلمس Supabase مباشرة', () => {
    expect(codeOnly(PAGE)).not.toMatch(/supabase/);
  });

  it('★ بلا confirm/alert/prompt ولا محاكاة ولا as any ولا حذف', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bas any\b/);
    expect(code).not.toMatch(/\.delete\(\)/);
  });

  it('★ حالات فارغة مفسَّرة لا شاشة بيضاء', () => {
    expect(PAGE).toMatch(/لا صادرات مطابقة/);
    expect(PAGE).toMatch(/لا صادرة متعثّرة/);
    expect(PAGE).toMatch(/لا أحداث ناقلين/);
  });

  it('★★ لا إيحاء بنطاق المنصة — البوابة خاصة بالشركة المستأجِرة', () => {
    expect(PAGE).not.toMatch(/للمنصة|كل الشركات|جميع الشركات|المستأجرين|tenants/);
    expect(PAGE).toMatch(/شركتك/);
  });

  it('★ التبويبات الثلاثة موجودة', () => {
    for (const t of ["'exports'", "'failures'", "'carriers'"]) {
      expect(PAGE).toContain(t);
    }
  });

  it('★ العمر يُعرض من قيمة القاعدة لا يُحسب في المتصفح', () => {
    expect(PAGE).toMatch(/formatAge\(/);
    expect(codeOnly(PAGE)).not.toMatch(/Date\.now\(\)\s*-/);
  });
});

describe('0332 — التسجيل في المواضع الستة', () => {
  it('① AppRouter: lazy + Route', () => {
    expect(ROUTER).toContain("import('../pages/techportal/pages/DataExportsPage')");
    expect(ROUTER).toContain('path="data-exports"');
  });

  it('② Sidebar: عنصر التنقل + خريطة الوحدة', () => {
    expect(SIDEBAR).toContain("id: 'tech-data-exports'");
    expect(SIDEBAR).toContain("'tech-data-exports': 'tech_portal'");
  });

  it('③ الكتالوج: العنصر + قائمة tech', () => {
    expect(CATALOG).toContain("id: 'tech-data-exports'");
    const s = CATALOG.indexOf("'tech-integrations', 'tech-data-exports'");
    expect(s).toBeGreaterThan(-1);
  });

  it('④ الأدوار: it_admin وtech', () => {
    expect((PERMS.match(/'tech-data-exports',/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('⑤ ★ PERMISSION_KEYS (وإلا رفضه tsc)', () => {
    const s = PERMS.indexOf("'tech-integrations',     //");
    expect(s).toBeGreaterThan(-1);
    expect(PERMS.slice(s, s + 200)).toContain("'tech-data-exports'");
  });

  it('⑥ legacyRedirect: VIEW_TO_PATH (Sidebar يعتمده لتحويل id→مسار)', () => {
    expect(LEGACY).toContain("'tech-data-exports':            '/app/tech-portal/data-exports'");
  });
});

describe('0332 — الاختبارات السلوكية موجودة ومربوطة', () => {
  it('ملف الإثبات على Postgres موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-tech-exports-0332.sql'))).toBe(true);
  });

  it('★ يوثّق البنية المُحقَّقة لا المُخمَّنة', () => {
    expect(VERIFY).toContain('inventory_periodic_report_runs');
    expect(VERIFY).toContain('received_at');
    expect(VERIFY).toContain('processed BOOLEAN');
  });

  it('★★ يفحص التسريب بالمجموع لا بعدد الصفوف', () => {
    // تصحيح ذاتي: عدّ الصفوف لا يكشف التسريب حين يندمج المستأجران
    // في مجموعة GROUP BY واحدة (كلاهما carrier_id=NULL)
    expect(VERIFY).toMatch(/sum\(out_total\)/);
  });

  it('سكربت RLS الحقيقي موجود ويجرّب دورين ومستأجرين', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-tech-exports-0332-rls.sh'))).toBe(true);
    expect(RLS).toContain('SET ROLE authenticated');
    expect(RLS).toContain('entity_memberships');
    expect(RLS).toContain('current_user_is_staff');
  });
});
