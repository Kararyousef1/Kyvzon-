/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0354 — خصوصية سجل المؤهلات
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ العطل ① (تسريب السِيَر) **لا يُثبَت هنا إطلاقاً**: الفحص الثابت
 *   لا يرى RLS ولا الأدوار. إثباته وسدّه في
 *   `tools/dev/verify-talent-market-0354-rls.sh` بدور `authenticated`
 *   حقيقي (15 تأكيداً). وهذا الملف يحرس ألّا يعود **السبب الجذري**:
 *   دالة بلا حارس دور تُرجع `cv_data` كاملاً لكل صفّ.
 *
 *   السلوك مُختبَر في `verify-talent-market-0354.sql` (39 تأكيداً)
 *   وعُكِس في `_invert_0354.py` (15/15 + 1 EQUIVALENT مُثبَت).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0354_talent_market_privacy.sql');
const SERVICE = read('src/services/sdk/UserService.ts');
const PAGE    = read('src/pages/hr/TalentMarketPage.tsx');

const codeTs  = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* cv_data */ const x=1;')).not.toMatch(/cv_data/);
    expect(codeTs('const y = t.cv_data;')).toMatch(/cv_data/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'is_staff مذكور';")).not.toMatch(/is_staff/);
    expect(stmtSql('IF NOT public.current_user_is_staff() THEN')).toMatch(/is_staff/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT توثيقي`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

const FNS = [
  'hr_talent_profiles',
  'hr_talent_profile_detail',
  'hr_talent_skill_stats',
];

// ═══════════════════════════════════════════════════════════════════
describe('0354 — العطل ①: السبب الجذري للتسريب', () => {
  it('★★★ كل دالة تحرس الدور صراحةً', () => {
    for (const fn of ['hr_talent_profiles', 'hr_talent_skill_stats']) {
      expect(codeSql(fnBody(fn)), `${fn}: بلا حارس دور`)
        .toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('★★★ التفاصيل: الموظف يرى سيرته هو فقط', () => {
    const body = codeSql(fnBody('hr_talent_profile_detail'));
    expect(body).toMatch(/NOT v_staff AND p_profile_id IS DISTINCT FROM v_self/);
    expect(body).toMatch(/v_self\s+UUID\s+:= auth\.uid\(\)/);
  });

  it('★★★ القائمة لا تُصرّح بـcv_data إطلاقاً', () => {
    const sig = MIG.slice(MIG.indexOf('CREATE FUNCTION public.hr_talent_profiles'),
                          MIG.indexOf('LANGUAGE plpgsql'));
    expect(sig, 'القائمة ما زالت تُعيد السيرة').not.toMatch(/out_cv_data/);
    expect(sig, 'أسماء المهارات مفقودة').toMatch(/out_skills\s+TEXT\[\]/);
  });

  it('★★★ الخدمة لا تُصرّح بـcv_data في نوع القائمة', () => {
    const i = SVC_CODE.indexOf('export interface TalentProfileRecord');
    const seg = SVC_CODE.slice(i, i + 500);
    expect(seg, 'النوع ما زال يحمل cv_data').not.toMatch(/cv_data/);
    expect(seg).toMatch(/skills:\s*string\[\]/);
  });

  it('★★★ الصفحة لا تقرأ cv_data في بطاقات القائمة', () => {
    // كان: const cv = extractCvData(talent.cv_data) داخل map
    expect(PAGE_CODE).not.toMatch(/extractCvData\(talent\.cv_data\)/);
    expect(PAGE_CODE).not.toMatch(/extractCvData\(t\.cv_data\)/);
    expect(PAGE_CODE).toMatch(/talent\.skills/);
    expect(PAGE_CODE).toMatch(/Boolean\(talent\.hasCv\)/);
  });

  it('التفاصيل تُطلَب بفعل صريح لا مع القائمة', () => {
    expect(PAGE_CODE).toMatch(/openPreview/);
    expect(SVC_CODE).toContain("'hr_talent_profile_detail'");
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0354 — العطل ②: البحث والإحصاءات في القاعدة', () => {
  it('★★★ الصفحة لا تُرشّح 500 صفّ في الذاكرة', () => {
    // كان: talents.filter((t) => { … skills.some(…) })
    expect(PAGE_CODE).not.toMatch(/talents\.filter\(/);
    // ★ البحث الحرّ يُمرَّر كـ`text` — و`skill` مُعامل مستقلّ بدلالة أضيق
    expect(PAGE_CODE).toMatch(/text:\s*search\.trim\(\)/);
  });

  it('★★★ p_skill و p_text مُعاملان مستقلّان', () => {
    const body = codeSql(fnBody('hr_talent_profiles'));
    expect(body).toMatch(/s\.nm ILIKE/);
    expect(body).toMatch(/b\.full_name, ''\) ILIKE/);
    expect(body).toMatch(/b\.position, ''\)\s+ILIKE/);
    // ★ توسيع p_skill ليشمل الاسم جعل سيرةً مؤرشفة تُطابق البحث
    //   (كشفه 4.8 في verify-cv-profile-0336). الفصل يمنع تكراره.
    // ★ الشرطان في كتلتَي AND منفصلتين: كتلة v_q لا تذكر full_name.
    //   (نسختي الأولى امتدّت عبر `)` إلى كتلة v_txt وأسقطت الاختبار
    //    على شيفرة سليمة — أداةُ القياس كانت الخاطئة.)
    const qBlock = body.slice(body.indexOf('v_q IS NULL'),
                              body.indexOf('v_txt IS NULL'));
    expect(qBlock, 'p_skill يُطابق الاسم — يكسر عقده منذ 0336')
      .not.toMatch(/full_name/);
    expect(body).toMatch(/v_txt\s+TEXT/);
  });

  it('★★★ الإحصاءات لم تعد تُحسب في المتصفح', () => {
    // كان: skillMap/posMap/langMap على 500 سيرة
    expect(PAGE_CODE).not.toMatch(/skillMap/);
    expect(PAGE_CODE).not.toMatch(/posMap/);
    expect(PAGE_CODE).not.toMatch(/langMap/);
    expect(PAGE_CODE).toMatch(/talentSkillStats/);
  });

  it('العدد الكلّي يُعاد من القاعدة (ترقيم صحيح)', () => {
    expect(MIG_CODE).toMatch(/out_total_count\s+BIGINT/);
    expect(SVC_CODE).toMatch(/totalCount/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0354 — الأرشيف لا يُعاد', () => {
  it('القائمة والتفاصيل تحذفان __archived', () => {
    for (const fn of ['hr_talent_profiles', 'hr_talent_profile_detail']) {
      expect(codeSql(fnBody(fn)), `${fn}: الأرشيف يُعاد`)
        .toMatch(/- '__archived'/);
    }
  });

  it('★★★ حارس نوع languages قبل الفكّ', () => {
    // شكل cv_data غير محروس بقيد ⇒ صفّ شاذّ يُسقط الدالة
    const body = codeSql(fnBody('hr_talent_skill_stats'));
    expect(body).toMatch(/jsonb_typeof\(b\.cv -> 'languages'\) = 'array'/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0354 — الأمان والخصائص', () => {
  it('الدوال الثلاث DEFINER · STABLE · search_path', () => {
    for (const fn of FNS) {
      const body = fnBody(fn);
      expect(body, `${fn}: ليست DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(body, `${fn}: ليست STABLE`).toMatch(/\bSTABLE\b/);
      expect(body, `${fn}: بلا search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُرشّح بالمستأجر', () => {
    for (const fn of FNS) {
      const body = codeSql(fnBody(fn));
      expect(body, `${fn}: لا يقرأ المستأجر`)
        .toMatch(/v_tenant UUID\s+:= public\.current_user_tenant_id\(\)/);
      expect(body, `${fn}: لا يُرشّح بالمستأجر`).toMatch(/tenant_id = v_tenant/);
    }
  });

  it('★★★ REVOKE من anon و PUBLIC على الثلاث', () => {
    // درس 0353: DROP يُسقط الصلاحيات و CREATE يمنح PUBLIC
    for (const fn of FNS) {
      expect(MIG_CODE, `${fn}: بلا REVOKE من PUBLIC`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC`));
      expect(MIG_CODE, `${fn}: بلا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
    }
  });

  it('DROP صريح قبل كل CREATE', () => {
    for (const fn of FNS) {
      expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    }
    expect(MIG_CODE).not.toMatch(/CREATE OR REPLACE FUNCTION public\.hr_talent_/);
  });

  it('★★★ لا كتابة ولا حذف في المايجريشن', () => {
    expect(MIG_STMT).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(MIG_STMT).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(MIG_STMT).not.toMatch(/\bTRUNCATE\b/i);
    expect(MIG_STMT).not.toMatch(/\bUPDATE\s+public\./i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0354 — حدود الطبقات والنظافة', () => {
  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★★ لا as any ولا confirm/prompt/alert', () => {
    expect(PAGE_CODE).not.toMatch(/\bas\s+any\b/);
    expect(PAGE_CODE).not.toMatch(/\bconfirm\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\bprompt\s*\(/);
    expect(PAGE_CODE).not.toMatch(/(?<![\w.])alert\s*\(/);
  });

  it('الخدمة تستدعي الدوال الثلاث', () => {
    for (const fn of FNS) {
      expect(SVC_CODE, `الخدمة لا تستدعي ${fn}`).toContain(`'${fn}'`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0354 — أدوات التحقق', () => {
  it('الملفات الثلاثة موجودة', () => {
    for (const f of [
      'tools/dev/verify-talent-market-0354.sql',
      'tools/dev/verify-talent-market-0354-rls.sh',
      'tools/dev/_invert_0354.py',
    ]) {
      expect(existsSync(resolve(root, f)), `${f} مفقود`).toBe(true);
    }
  });

  it('★★★ سكربت RLS يُثبت المنع بدور authenticated', () => {
    const sh = read('tools/dev/verify-talent-market-0354-rls.sh');
    expect(sh).toMatch(/SET ROLE authenticated/);
    expect(sh).toMatch(/request\.jwt\.claim\.sub/);
    // ويحرس أن التنظيف نجح قبل القياس
    expect(sh).toMatch(/التنظيف فشل/);
    // ويجرّب anon صراحةً
    expect(sh).toMatch(/SET ROLE anon/);
  });

  it('★★★ العيّنة تستعمل شكل الأرشيف الحقيقي', () => {
    // `archive_my_cv` تُنتج {"__archived":{cv,archived_at}} فقط
    const v = read('tools/dev/verify-talent-market-0354.sql');
    expect(v).toMatch(/"__archived":\{"cv"/);
    expect(v).toMatch(/عيّنتي الأولى كانت خاطئة/);
  });

  it('★★★ سكربت العكس يقيس بعض العكوس بـRLS', () => {
    // ملف الـSQL يعمل بـBYPASSRLS فلا يرى تسريب الأدوار
    const inv = read('tools/dev/_invert_0354.py');
    expect(inv).toMatch(/RLS_CHECK/);
    expect(inv).toMatch(/if old not in original/);
    expect(inv).toMatch(/assert broken != original/);
    expect(inv).toMatch(/EQUIVALENT_INVERSIONS/);
  });
});
