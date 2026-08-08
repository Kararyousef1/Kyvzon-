/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0357 — سلامة دليل فريق العمل
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-team-directory-0357.sql`
 *   · العزل مُثبَت في `…-0357-rls.sh` بدور `authenticated` حقيقيّ
 *   · التغطية مُثبتة في `_invert_0357.py` — **31/31** عكساً أسقط
 *     الاختبار (+4 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: عمودٌ معدوم ·
 *   ربطٌ بمفتاح خطأ · قراءةٌ من جدول لا يملك البيانات · `any`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0357_team_directory_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/TeamDirectoryService.ts');
const PAGE    = read('src/pages/hr/TeamPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة: مُجرِّدٌ معطوب = حارسٌ كاذب ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs('/* mood_score */ const x=1;')).not.toMatch(/mood_score/);
    expect(codeTs('// mood_score\nconst y=1;')).not.toMatch(/mood_score/);
    expect(codeTs('const s = w.mood_score;')).toMatch(/mood_score/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'mood_score مذكور';")).not.toMatch(/mood_score/);
    expect(stmtSql('  AND w.score IS NOT NULL')).toMatch(/w\.score/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** ★ درس 0355: على النصّ المُجرَّد — وإلا التقط التوثيق */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = ['team_directory', 'team_summary', 'team_departments'];

// ═══════════════════════════════════════════════════════════════
describe('0357 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('كل دالة تُسقَط قبل إنشائها', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, f).toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\(`));
    }
  });

  it('كل دالة SECURITY DEFINER مع search_path مثبَّت', () => {
    for (const f of NEW_FNS) {
      const b = fnBody(f);
      expect(b, `${f}: SECURITY DEFINER`).toMatch(/SECURITY DEFINER/);
      expect(b, `${f}: search_path`).toMatch(/SET search_path = public/);
    }
  });

  it('كل دالة تُنزع من PUBLIC و anon وتُمنح لـauthenticated', () => {
    for (const f of NEW_FNS) {
      expect(MIG_CODE, `${f}: PUBLIC`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM PUBLIC`));
      expect(MIG_CODE, `${f}: anon`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*FROM anon`));
      expect(MIG_CODE, `${f}: authenticated`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\)[\\s\\n]*TO authenticated`));
    }
  });

  it('الفهارس الثلاثة', () => {
    for (const i of ['idx_wellness_emp_date', 'idx_emp_certs_emp',
                     'idx_incidents_reported_by']) {
      expect(MIG_CODE, i).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS ${i}`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ① — mood_score عمود معدوم', () => {
  it('المايجريشن لا يذكره في الشيفرة', () => {
    expect(MIG_STMT).not.toMatch(/\bmood_score\b/);
  });

  it('الخدمة لا تذكره', () => {
    expect(SVC_CODE).not.toMatch(/\bmood_score\b/);
  });

  it('★★★ الصفحة لا تذكره', () => {
    expect(PAGE_CODE).not.toMatch(/\bmood_score\b/);
  });

  it('القاعدة تقرأ العمود الحقيقيّ score', () => {
    expect(fnBody('team_directory')).toMatch(/avg\(w\.score\)/);
    expect(fnBody('team_summary')).toMatch(/avg\(w\.score\)/);
  });

  it('★★ ولا تقرأ stress/energy بدلاً منه', () => {
    expect(fnBody('team_directory')).not.toMatch(/avg\(w\.stress\)/);
    expect(fnBody('team_directory')).not.toMatch(/avg\(w\.energy\)/);
  });

  it('★★★ ولا `?? 0` يُخفي غياب القيمة', () => {
    // العطل كان `b.mood_score ?? 0` — الصفر يبتلع الخطأ صامتاً
    expect(PAGE_CODE).not.toMatch(/wellness\s*\?\?\s*0/);
    expect(SVC_CODE).not.toMatch(/out_wellness[^)]*\?\?\s*0/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ② — الربط بمفتاح profiles', () => {
  it('البلاغات تُربَط بـuser_id لا بـemployees.id', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/LEFT JOIN inc\s+ON inc\.profile_id\s+= b\.user_id/);
    expect(b).not.toMatch(/inc\.profile_id\s+= b\.id/);
  });

  it('الخدمة تُعلن userId فيميّزه عن id', () => {
    expect(SVC_CODE).toMatch(/userId:\s*string \| null/);
    expect(SVC_CODE).toMatch(/userId:\s*strOrNull\(r\.out_user_id\)/);
  });

  it('★★ الصفحة لا تُطابق معرّفات يدوياً أصلاً', () => {
    expect(PAGE_CODE).not.toMatch(/reported_by/);
    expect(PAGE_CODE).not.toMatch(/\.filter\(\s*\w+\s*=>\s*\w+\.employee_id/);
  });

  it('★ العطل ⑧: المؤرشف ليس مفتوحاً', () => {
    expect(fnBody('team_directory')).toMatch(/i\.archived_at IS NULL/);
    expect(fnBody('team_summary')).toMatch(/i\.archived_at IS NULL/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ③ — الاسم والبريد والهاتف والمسمّى', () => {
  it('سلسلة الاسم الرباعية', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/COALESCE\(NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/NULLIF\(btrim\(p\.full_name\), ''\)/);
    expect(b).toMatch(/'موظف ' \|\| COALESCE\(e\.employee_code/);
  });

  it('★★ البريد من auth.users (employees.email = NULL دائماً)', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/LEFT JOIN auth\.users\s+u ON u\.id = e\.user_id/);
    expect(b).toMatch(/NULLIF\(btrim\(u\.email\), ''\)/);
  });

  it('الهاتف والمسمّى من profiles', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/NULLIF\(btrim\(p\.phone\), ''\)/);
    expect(b).toMatch(/NULLIF\(btrim\(p\.position\), ''\)/);
  });

  it('★★ الصفحة لا تُولّد «U» للحرف الأول', () => {
    expect(PAGE_CODE).not.toMatch(/\|\|\s*'U'/);
    expect(PAGE_CODE).toMatch(/function initial\(name: string\)/);
  });

  it('★ ولا نصّ «بدون اسم»: الاسم مضمون من القاعدة', () => {
    expect(PAGE_CODE).not.toMatch(/بدون اسم/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ④ — الدور من profiles', () => {
  it('القاعدة تُفضّل profiles.role', () => {
    expect(fnBody('team_directory')).toMatch(
      /COALESCE\(NULLIF\(btrim\(p\.role\), ''\), NULLIF\(btrim\(e\.role\), ''\)/);
  });

  it('★★ خريطة الأدوار بدل سلسلة `? :` تنتهي بـ«موظف»', () => {
    expect(SVC_CODE).toMatch(/export const ROLE_AR: Record<string, string>/);
    for (const r of ['admin', 'hr', 'developer', 'it_admin', 'manager',
                     'supervisor', 'gatekeeper', 'employee']) {
      expect(SVC_CODE, `ROLE_AR.${r}`).toMatch(new RegExp(`${r}:\\s*'[^']+'`));
    }
  });

  it('★★★ الدور المجهول يظهر بنصّه لا بـ«موظف»', () => {
    expect(SVC_CODE).toMatch(/ROLE_AR\[r\] \?\? r/);
    // ولا سلسلة شرطية طويلة في الصفحة
    expect(PAGE_CODE).not.toMatch(/role === 'admin' \? /);
  });

  it('الصفحة تستعمل roleLabel/roleTone', () => {
    expect(PAGE_CODE).toMatch(/roleLabel\(role\)/);
    expect(PAGE_CODE).toMatch(/roleTone\(role\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑤ — on_leave من مصدر حقيقيّ', () => {
  it('CTE الإجازات بحالة موافق ومدى يغطّي اليوم', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/FROM public\.leaves l/);
    expect(b).toMatch(/l\.status = 'موافق'/);
    expect(b).toMatch(/l\.date_from <= v_today/);
    expect(b).toMatch(/l\.date_to\s+>= v_today/);
  });

  it('★★ inactive يسبق on_leave (موظف مفصول في إجازة = غير نشط)', () => {
    expect(fnBody('team_directory')).toMatch(
      /CASE WHEN NOT b\.is_active\s+THEN 'inactive'[\s\S]{0,120}WHEN lv\.employee_id IS NOT NULL THEN 'on_leave'/);
  });

  it('الخدمة تُصدّر الحالات الثلاث ولا رابعة', () => {
    const m = SVC_CODE.match(/export const TEAM_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(['active', 'inactive', 'on_leave']);
  });

  it('لكل حالة تسمية ولون — لا شيفرة ميتة', () => {
    for (const s of ['active', 'on_leave', 'inactive']) {
      expect(SVC_CODE, `TEAM_STATUS_AR.${s}`).toMatch(new RegExp(`${s}:\\s*'[^']+'`));
    }
    const tone = SVC_CODE.slice(SVC_CODE.indexOf('TEAM_STATUS_TONE'));
    for (const s of ['active', 'on_leave', 'inactive']) {
      expect(tone, `TEAM_STATUS_TONE.${s}`).toMatch(new RegExp(`${s}:`));
    }
  });

  it('★ الصفحة تشتقّ المرشّحات من الثوابت', () => {
    expect(PAGE_CODE).toMatch(/TEAM_STATUSES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑥ — لا نقل جداول إلى المتصفّح', () => {
  it('الدليل له حدّ أعلى', () => {
    expect(fnBody('team_directory'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 300\), 1\)/);
  });

  it('الصفحة تمرّر حدّاً صريحاً', () => {
    expect(PAGE_CODE).toMatch(/limit:\s*\d+/);
  });

  it('★★ الصفحة لا تستدعي خدمات الجداول الخام', () => {
    for (const s of ['employeeService', 'departmentService', 'incidentService',
                     'wellnessEntryService', 'certificationService']) {
      expect(PAGE_CODE, s).not.toMatch(new RegExp(`\\b${s}\\b`));
    }
  });

  it('★★ ولا filter داخل map', () => {
    expect(PAGE_CODE).not.toMatch(/\.filter\([\s\S]{0,200}\)\.length/);
    expect(PAGE_CODE).not.toMatch(/new Map\(/);
  });

  it('البحث والترشيح في القاعدة لا في المتصفّح', () => {
    expect(PAGE_CODE).not.toMatch(/toLowerCase\(\)\.includes/);
    expect(SVC_CODE).toMatch(/p_search:/);
    expect(SVC_CODE).toMatch(/p_department_id:/);
    expect(SVC_CODE).toMatch(/p_status:/);
  });

  it('★ البحث يشمل البريد والهاتف والمسمّى', () => {
    const b = fnBody('team_directory');
    expect(b).toMatch(/f\.email\s+ILIKE/);
    expect(b).toMatch(/f\.phone\s+ILIKE/);
    expect(b).toMatch(/f\.position\s+ILIKE/);
  });

  it('★ الترشيح بمعرّف القسم لا باسمه', () => {
    expect(SVC_CODE).toMatch(/departmentId\?: string \| null/);
    expect(PAGE_CODE).toMatch(/departmentId: deptFilter === 'all' \? null : deptFilter/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ NULL ≠ صفر (درس 0353)', () => {
  it('الخدمة تُعلن الصحة nullable', () => {
    expect(SVC_CODE).toMatch(/wellness:\s*number \| null/);
    expect(SVC_CODE).toMatch(/avgWellness:\s*number \| null/);
  });

  it('★ numOrNull لا يحوّل NULL إلى صفر', () => {
    expect(SVC_CODE).toMatch(/const numOrNull[\s\S]{0,200}return null/);
    expect(SVC_CODE).toMatch(/wellness:\s*numOrNull\(/);
    expect(SVC_CODE).toMatch(/avgWellness:\s*numOrNull\(/);
  });

  it('★★ الصفحة تعرض نصّاً صريحاً لا صفراً', () => {
    expect(PAGE_CODE).toMatch(/wellness === null \? 'لا قياس صحّي'/);
    expect(PAGE_CODE).toMatch(/avgWellness === null \? 'لا قياس'/);
  });

  it('★★★ شريط الصحة فارغ لا أحمر ممتلئ حين NULL', () => {
    expect(PAGE_CODE).toMatch(/value === null \? '0%'/);
    expect(PAGE_CODE).toMatch(/if \(v === null\) return 'bg-slate-300'/);
  });

  it('القاعدة لا تُحوّل المتوسّط إلى صفر', () => {
    expect(fnBody('team_directory')).not.toMatch(/COALESCE\(avg\(w\.score\)/);
    expect(fnBody('team_summary')).not.toMatch(/COALESCE\(round\(avg/);
  });

  it('★★ متوسّط المتوسّطات لا متوسّط الصفوف', () => {
    // موظفٌ سجّل ثلاثين مرة لا يُرجّح على من سجّل مرّة
    const b = fnBody('team_summary');
    // ★ الاستعلام الفرعيّ: متوسّط لكل موظف ثم متوسّط المتوسّطات
    expect(b, 'avg(m.a)').toMatch(/avg\(m\.a\)/);
    expect(b, 'استعلام فرعيّ مُجمَّع').toMatch(/avg\(w\.score\) AS a/);
    expect(b, 'التجميع بالموظف').toMatch(/GROUP BY w\.employee_id\) m/);
    // ★ ولا متوسّط مباشر على الصفوف
    expect(b, 'متوسّط الصفوف').not.toMatch(/round\(avg\(w\.score\), 1\) AS avg_all/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العزل والأدوار', () => {
  it('كل دالة تفحص المستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: v_tenant`)
        .toMatch(/v_tenant\s+UUID\s*:=\s*public\.current_user_tenant_id\(\)/);
      expect(fnBody(f), `${f}: حارس NULL`).toMatch(/IF v_tenant IS NULL THEN/);
    }
  });

  it('★★ كل دالة تحرس الدور — سياسة employees بلا تمييز دور', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: staff`)
        .toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('كل دالة تُرشِّح بالمستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: ترشيح`).toMatch(/tenant_id = v_tenant/);
    }
  });

  it('★ team_summary تُرشِّح كل مصدر على حدة (لا base يحميها)', () => {
    const b = fnBody('team_summary');
    for (const t of ['w.tenant_id = v_tenant', 'i.tenant_id = v_tenant',
                     'c.tenant_id = v_tenant', 'l.tenant_id = v_tenant',
                     'd.tenant_id = v_tenant', 'e.tenant_id = v_tenant']) {
      expect(b, t).toContain(t);
    }
  });

  it('حارس مفردات الحالة', () => {
    expect(fnBody('team_directory')).toMatch(/TEAM_BAD_STATUS/);
    expect(fnBody('team_directory')).toMatch(
      /p_status NOT IN \('active','inactive','on_leave'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ توقيت بغداد', () => {
  it('كل دالة تحسب اليوم بتوقيت بغداد', () => {
    for (const f of ['team_directory', 'team_summary']) {
      expect(fnBody(f), f).toMatch(
        /v_today\s+DATE := \(NOW\(\) AT TIME ZONE 'Asia\/Baghdad'\)::DATE/);
    }
  });

  it('★★ ولا CURRENT_DATE في أيّ حساب', () => {
    expect(MIG_STMT).not.toMatch(/\bCURRENT_DATE\b/);
  });

  it('الشهادة السارية تُقاس بـv_today لا بـnow()', () => {
    expect(fnBody('team_directory')).toMatch(/c\.expiry_date >= v_today/);
    expect(fnBody('team_summary')).toMatch(/c\.expiry_date >= v_today/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ سياسة المنصة — محظورات', () => {
  it('لا confirm/prompt/alert في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★★ لا as any ولا : any (كان Record<string, any>)', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/:\s*any\b/);
    expect(SVC_CODE).not.toMatch(/:\s*any\b/);
  });

  it('★★ الصفحة لا تلمس Supabase مباشرةً', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★ ولا console.error يبتلع الخطأ', () => {
    expect(PAGE_CODE).not.toMatch(/console\.error/);
  });

  it('الدليل للقراءة فقط — لا كتابة ولا حذف', () => {
    expect(SVC_CODE).not.toMatch(/\.delete\(/);
    expect(SVC_CODE).not.toMatch(/\.insert\(/);
    expect(SVC_CODE).not.toMatch(/\.update\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ التسجيل والترابط', () => {
  it('الخدمة مُصدَّرة من فهرس SDK', () => {
    expect(INDEX).toMatch(
      /export \{[\s\S]{0,300}teamDirectoryService[\s\S]{0,300}\} from '\.\/TeamDirectoryService'/);
    expect(INDEX).toMatch(/TEAM_STATUSES/);
    expect(INDEX).toMatch(/roleLabel/);
  });

  it('الصفحة تستورد من الفهرس لا من الملف مباشرةً', () => {
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/services\/sdk'/);
    expect(PAGE_CODE).not.toMatch(/from '.*sdk\/TeamDirectoryService'/);
  });

  it('أدوات التحقق الثلاث موجودة', () => {
    for (const p of [
      'tools/dev/verify-team-directory-0357.sql',
      'tools/dev/verify-team-directory-0357-rls.sh',
      'tools/dev/_invert_0357.py',
    ]) {
      expect(existsSync(resolve(root, p)), p).toBe(true);
    }
  });
});
