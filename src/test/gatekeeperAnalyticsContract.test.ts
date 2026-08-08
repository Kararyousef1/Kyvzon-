/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0350 — عزل البوابة وتحليلات الحركة
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج: **لا نقارن الدالة بنفسها.** كل تأكيد بنيوي يقارن
 *   مصدرين مستقلّين — تعريف الجدول من مايجريشن المخطط الأصلي مقابل
 *   ما تدّعيه الشيفرة.
 *
 *   العطل ① بالذات (تسريب بين المستأجرين) **لا يُثبَت هنا إطلاقاً**:
 *   الفحص الثابت لا يرى RLS. إثباته وسدّه في
 *   `tools/dev/verify-gatekeeper-analytics-0350-rls.sh` بدور
 *   `authenticated` حقيقي (15 تأكيداً). وهذا الملف يحرس ألّا يعود
 *   السبب الجذري: `NoTenantBaseService` وحذف `tenant_id`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0350_gatekeeper_tenant_isolation_and_analytics.sql');
const SERVICE = read('src/services/sdk/GatekeeperAnalyticsService.ts');
const GKSVC   = read('src/services/sdk/GatekeeperService.ts');
const PAGE    = read('src/pages/hr/HRMovementAnalyticsPage.tsx');

const codeTs  = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* NoTenantBaseService */ const x=1;')).not.toMatch(/NoTenantBaseService/);
    expect(codeTs('class A extends NoTenantBaseService {}')).toMatch(/NoTenantBaseService/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'tenant_id IS NULL خطأ';")).not.toMatch(/IS NULL/);
    expect(stmtSql('CREATE POLICY p ON t USING (tenant_id IS NULL);')).toMatch(/IS NULL/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);
const GK_CODE   = codeTs(GKSVC);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

const FNS = [
  'gatekeeper_movement_analytics',
  'gatekeeper_visitor_analytics',
  'gatekeeper_session_archive',
  'gatekeeper_shift_movements',
];

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ①: السبب الجذري للتسريب', () => {
  /**
   * ★★★ مصدر مستقلّ: تعريف الجدولين من مايجريشن المخطط.
   *   الترويسة القديمة ادّعت أنهما «بدون عمود tenant_id».
   */
  it('★★★ الجدولان يحويان tenant_id فعلاً — الادعاء القديم كان خاطئاً', () => {
    const files = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f < '0350')
      .map((f) => read(`supabase/migrations/${f}`))
      .join('\n');

    for (const tbl of ['gatekeeper_sessions', 'gatekeeper_visitor_logs']) {
      const i = files.search(
        new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${tbl}`));
      expect(i, `تعريف ${tbl} غير موجود`).toBeGreaterThan(-1);
      const body = files.slice(i, files.indexOf(');', i));
      expect(body, `${tbl}: لا عمود tenant_id`).toMatch(/tenant_id\s+UUID/i);
    }
  });

  it('★★★ NoTenantBaseService أُزيل ولا صنف يرث منه', () => {
    // كان يحذف tenant_id عند الإدراج ⇒ صفوف بلا مالك يراها الجميع
    expect(GK_CODE).not.toMatch(/class\s+NoTenantBaseService/);
    expect(GK_CODE).not.toMatch(/extends\s+NoTenantBaseService/);
  });

  it('★★★ لا تجاوز لـ addTenantFilter ولا حذف لـ tenant_id', () => {
    expect(GK_CODE).not.toMatch(/override\s+addTenantFilter/);
    expect(GK_CODE).not.toMatch(/override\s+injectTenantId/);
    expect(GK_CODE).not.toMatch(/const\s*\{\s*tenant_id:\s*_\s*,/);
  });

  it('★★★ countVisitorsSince يُرشّح بالمستأجر', () => {
    const i = GK_CODE.indexOf('countVisitorsSince');
    expect(i).toBeGreaterThan(-1);
    const seg = GK_CODE.slice(i, i + 700);
    expect(seg, 'استعلام مباشر بلا ترشيح مستأجر').toMatch(/getCurrentTenantId\(\)/);
    expect(seg).toMatch(/\.eq\('tenant_id'/);
  });

  it('★★★ المايجريشن يفرض NOT NULL ويحذف الفرع المتساهل', () => {
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.gatekeeper_sessions\s+ALTER COLUMN tenant_id SET NOT NULL/);
    expect(MIG_CODE).toMatch(
      /ALTER TABLE public\.gatekeeper_visitor_logs\s+ALTER COLUMN tenant_id SET NOT NULL/);
    expect(MIG_CODE).toMatch(/SET DEFAULT public\.current_user_tenant_id\(\)/);

    // ولا سياسة **مُنشأة** تسمح بمرور NULL
    const created = MIG_CODE.split('CREATE POLICY').slice(1).join('CREATE POLICY');
    expect(created, 'سياسة جديدة ما زالت تسمح بمرور tenant_id IS NULL')
      .not.toMatch(/tenant_id IS NULL/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ②: fromDate المُهمَل', () => {
  it('★★★ findVisitorLogs تستعمل fromDate فعلاً', () => {
    const i = GK_CODE.indexOf('findVisitorLogs');
    expect(i).toBeGreaterThan(-1);
    const seg = GK_CODE.slice(i, i + 1200);
    expect(seg, 'fromDate يُعلَن ولا يُستعمل').toMatch(/options\?\.fromDate/);
    expect(seg, 'لا شرط gte على check_in_time').toMatch(/check_in_time[\s\S]{0,60}gte/);
    expect(seg, 'يجب findWhere لا findAll — النطاقات لا تُدعم بـeq')
      .toMatch(/findWhere/);
  });

  it('الدالة تُرشّح النطاق في القاعدة', () => {
    const body = stmtSql(fnBody('gatekeeper_visitor_analytics'));
    expect(body).toMatch(/check_in_time\s*>=\s*p_from/);
    expect(body).toMatch(/check_in_time\s*<=\s*p_to/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ③+⑥+⑨: أعمدة غير موجودة', () => {
  it('★★★ الصفحة لم تعد تقرأ كائن visitor المعدوم', () => {
    // ★ التعبير يجب أن يستهدف **الكائن المُضمَّن** `visitor` وحده،
    //   لا الحقول المشروعة `visitorName`/`visitorPhone`.
    //   (نسختي الأولى `/v\.visitor/` طابقت `v.visitorName` وأسقطت
    //    الاختبار على شيفرة سليمة — أداةُ القياس هي التي كانت خاطئة.)
    expect(PAGE_CODE).not.toMatch(/\bvisitor\?\./);
    expect(PAGE_CODE).not.toMatch(/\.visitor\s*[?.]/);
    expect(PAGE_CODE).not.toMatch(/\.visitor\b(?!Name|Phone)/);
  });

  it('★★★ لا قراءة لأعمدة غير موجودة في المخطط', () => {
    for (const col of ['customer_email', 'session_name', 'gatekeeper_name', 'visitor_count']) {
      expect(PAGE_CODE, `العمود المعدوم ${col} ما زال يُقرأ`)
        .not.toMatch(new RegExp(`\\.${col}\\b`));
    }
  });

  it('الدالة تُرجع الأعمدة المسطّحة الحقيقية', () => {
    const body = codeSql(fnBody('gatekeeper_visitor_analytics'));
    for (const col of ['visitor_name', 'visitor_phone', 'id_number', 'purpose', 'host_name']) {
      expect(body, `العمود ${col} غير مقروء`).toContain(`v.${col}`);
    }
    // company/location غير موجودين — يجب ألّا يُذكرا
    expect(stmtSql(body)).not.toMatch(/v\.company/);
    expect(stmtSql(body)).not.toMatch(/v\.location/);
  });

  it('الصفحة تقرأ حقول الخدمة المُصرَّحة', () => {
    expect(PAGE_CODE).toMatch(/visitorName/);
    expect(PAGE_CODE).toMatch(/visitorPhone/);
    expect(PAGE_CODE).toMatch(/hostName/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ④: حصر الوردية بنهايتها', () => {
  it('★★★ عدّ حركات الوردية له حدّ أعلى', () => {
    const body = stmtSql(fnBody('gatekeeper_session_archive'));
    expect(body).toMatch(/departure_at\s*>=\s*s\.started_at/);
    expect(body, 'لا حدّ أعلى — عاد العطل ④')
      .toMatch(/departure_at\s*<\s*COALESCE\(s\.ended_at, NOW\(\)\)/);
  });

  it('★★★ gatekeeper_shift_movements محصورة بين v_start و v_end', () => {
    const body = stmtSql(fnBody('gatekeeper_shift_movements'));
    expect(body).toMatch(/departure_at\s*>=\s*v_start/);
    expect(body).toMatch(/departure_at\s*<\s*v_end/);
  });

  it('الصفحة لم تعد تُمرّر fromDate عارياً لأرشيف الوردية', () => {
    expect(PAGE_CODE).not.toMatch(/findMovements\(\s*\{\s*fromDate:\s*session/);
    expect(PAGE_CODE).toMatch(/shiftMovements/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ⑤: المخالفة من العمود لا من النصّ', () => {
  it('★★★ الوسم النصّي اختفى من الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/VIOLATION_FLAG/);
    expect(PAGE_CODE).not.toMatch(/notes\?\.includes/);
    expect(PAGE_CODE).not.toMatch(/مخالفة مسار 🚨/);
  });

  it('الدالتان تقرآن route_violation المنطقي', () => {
    for (const fn of ['gatekeeper_movement_analytics', 'gatekeeper_shift_movements']) {
      const body = stmtSql(fnBody(fn));
      expect(body, `${fn}: لا يقرأ route_violation`).toMatch(/m\.route_violation/);
      expect(body, `${fn}: عاد اشتقاق المخالفة من النصّ`)
        .not.toMatch(/notes\s+LIKE/i);
    }
  });

  it('الصفحة تعرض المخالفة من الحقل المنطقي', () => {
    expect(PAGE_CODE).toMatch(/routeViolation/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ⑦: Realtime عبر SDK ومحصور بالمستأجر', () => {
  it('★★★ الصفحة لا تستورد supabase ولا تفتح قناة', () => {
    expect(PAGE_CODE).not.toMatch(/from\s+['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
    expect(PAGE_CODE).not.toMatch(/\.channel\(/);
    expect(PAGE_CODE).not.toMatch(/postgres_changes/);
    expect(PAGE_CODE).not.toMatch(/removeChannel/);
  });

  it('★★★ اسم القناة يحمل المستأجر والمُرشِّح يُرشّح به', () => {
    expect(SVC_CODE).toMatch(/channel\(`gatekeeper-alerts-\$\{tenantId\}`\)/);
    expect(SVC_CODE).toMatch(/filter:\s*`tenant_id=eq\.\$\{tenantId\}`/);
    // الاسم العالميّ القديم يجب ألّا يعود
    expect(SVC_CODE).not.toMatch(/'gatekeeper_alerts'/);
  });

  it('★★★ المُستقبِل يُعيد التحقّق من المستأجر (دفاع في العمق)', () => {
    expect(SVC_CODE).toMatch(/String\(row\.tenant_id \?\? ''\) !== tenantId/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — العطل ⑧: البحث يُنفَّذ', () => {
  it('★★★ البحث يُرسَل إلى القاعدة لا يُهمَل', () => {
    expect(PAGE_CODE).toMatch(/sessionArchive\(archiveSearch\)/);
    expect(SVC_CODE).toMatch(/p_search:/);
  });

  it('الدالة تُرشِّح بالاسم والتاريخ', () => {
    const body = codeSql(fnBody('gatekeeper_session_archive'));
    expect(body).toMatch(/p\.full_name ILIKE/);
    expect(body).toMatch(/to_char\(s\.started_at AT TIME ZONE 'Asia\/Baghdad'/);
    // ★ درس مُثبَت: EXTRACT/to_char بلا منطقة يستعملان منطقة الخادم (UTC)
    expect(body, 'التاريخ بلا منطقة زمنية صريحة').not.toMatch(
      /to_char\(s\.started_at,/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — الأمان والخصائص', () => {
  it('الدوال الأربع DEFINER · STABLE · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: ليست STABLE`).toMatch(/\bSTABLE\b/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُرشّح بالمستأجر وتشترط staff', () => {
    for (const fn of FNS) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: لا يقرأ المستأجر`)
        .toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
      expect(body, `${fn}: لا يحرس الدور`)
        .toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
      expect(body, `${fn}: لا يحرس المستأجر الفارغ`).toMatch(/IF v_tenant IS NULL THEN/);
      expect(body, `${fn}: لا يُرشّح بالمستأجر`).toMatch(/tenant_id\s*=\s*v_tenant/);
    }
  });

  it('DROP صريح قبل كل CREATE', () => {
    for (const fn of FNS) {
      expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    }
    expect(MIG_CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.gatekeeper_/);
  });

  it('GRANT لـ authenticated على الأربع', () => {
    // ★ بعض عبارات GRANT تلتفّ على سطرين — نسمح بفاصل أسطر
    for (const fn of FNS) {
      expect(MIG_CODE, `${fn}: لا GRANT`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*TO authenticated`));
    }
  });

  it('★★★ فرض NOT NULL محروس بفحص أيتام لا صامت', () => {
    expect(MIG_CODE).toMatch(/تعذّر فرض NOT NULL/);
    expect(MIG_CODE).toMatch(/RAISE EXCEPTION/);
  });

  it('★★★ لا حذف نهائي', () => {
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — حدود الطبقات والنظافة', () => {
  it('الصفحة تستعمل خدمة التحليلات', () => {
    expect(PAGE_CODE).toMatch(/gatekeeperAnalyticsService/);
    expect(PAGE_CODE).toMatch(/subscribeHandoverAlerts/);
  });

  it('الخدمة تستدعي الدوال الأربع بأسمائها', () => {
    for (const fn of FNS) {
      expect(SVC_CODE, `الخدمة لا تستدعي ${fn}`).toContain(`'${fn}'`);
    }
  });

  it('★★★ لا as any ولا confirm/prompt/alert', () => {
    for (const [name, src] of [
      ['الصفحة', PAGE_CODE], ['خدمة التحليلات', SVC_CODE],
    ] as const) {
      expect(src, `${name}: as any`).not.toMatch(/\bas\s+any\b/);
      expect(src, `${name}: confirm`).not.toMatch(/\bconfirm\s*\(/);
      expect(src, `${name}: prompt`).not.toMatch(/\bprompt\s*\(/);
      expect(src, `${name}: alert(`).not.toMatch(/(?<![\w.])alert\s*\(/);
    }
  });

  it('★★★ المدة null لا صفر لمن لم يعد', () => {
    // الصفر يعني «عاد فوراً» — والغياب ليس صفراً
    expect(SVC_CODE).toMatch(/nullableNum/);
    expect(PAGE_CODE).toMatch(/secs === null/);
    expect(PAGE_CODE).toMatch(/في الخارج/);
  });

  it('رمز التسليم تشفيري لا Math.random', () => {
    expect(PAGE_CODE).toMatch(/crypto\.getRandomValues/);
    expect(PAGE_CODE).not.toMatch(/Math\.random/);
    // طرح معياري يمنع انحياز %
    expect(PAGE_CODE).toMatch(/while \(v >= LIMIT\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0350 — أدوات التحقق', () => {
  it('الملفات الثلاثة موجودة', () => {
    for (const f of [
      'tools/dev/verify-gatekeeper-analytics-0350.sql',
      'tools/dev/verify-gatekeeper-analytics-0350-rls.sh',
      'tools/dev/_invert_0350.py',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} مفقود`).toBe(true);
    }
  });

  it('★★★ سكربت RLS يُثبت العزل بدور authenticated لا بـpostgres', () => {
    const sh = read('tools/dev/verify-gatekeeper-analytics-0350-rls.sh');
    expect(sh).toMatch(/SET ROLE authenticated/);
    expect(sh).toMatch(/request\.jwt\.claim\.sub/);
    // ويحرس أن التنظيف نجح فعلاً قبل القياس
    expect(sh).toMatch(/التنظيف فشل/);
  });

  it('★★★ سكربت العكس يتحقق أن الاستبدال طابق', () => {
    const inv = read('tools/dev/_invert_0350.py');
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/NO_MATCH/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/SURVIVED/);
    // ★ وعكوس DDL منفصلة لأن ALTER لا يُعكَس بإعادة التطبيق
    expect(inv).toMatch(/DDL_INVERSIONS/);
  });

  it('ملف التحقق يحمل حرّاس SENTINEL للأعطال', () => {
    const v = read('tools/dev/verify-gatekeeper-analytics-0350.sql');
    for (const s of ['SENTINEL_S1', 'SENTINEL_S3', 'SENTINEL_V1',
                     'SENTINEL_V3', 'SENTINEL_A2', 'SENTINEL_A7', 'SENTINEL_M2']) {
      expect(v, `الحارس ${s} مفقود`).toContain(s);
    }
    expect(v).toContain('ROLLBACK');
  });
});
