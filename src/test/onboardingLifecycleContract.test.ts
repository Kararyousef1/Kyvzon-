/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0359 — سلامة التعريف وإنهاء الخدمة
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-onboarding-0359.sql`
 *   · العزل مُثبَت في `…-0359-rls.sh` بدور `authenticated` حقيقيّ
 *   · التغطية مُثبتة في `_invert_0359.py` — **52/52** عكساً أسقط
 *     الاختبار (+3 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: عمودٌ معدوم ·
 *   نداءان بلا معاملة · لا فرادة · سلسلة شرطية تبتلع نوعاً.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0359_onboarding_offboarding_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/OnboardingLifecycleService.ts');
const PAGE    = read('src/pages/hr/OnboardingPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs('/* employment_status */ const x=1;'))
      .not.toMatch(/employment_status/);
    expect(codeTs('// upsert\nconst y=1;')).not.toMatch(/upsert/);
    expect(codeTs('const s = e.employment_status;')).toMatch(/employment_status/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'employment_status مذكور';"))
      .not.toMatch(/employment_status/);
    expect(stmtSql('  AND o.status = \'completed\'')).toMatch(/o\.status/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** ★ درس 0355: على النصّ المُجرَّد */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = [
  'onboarding_start', 'onboarding_set_task', 'onboarding_board',
  'onboarding_summary', 'offboarding_execute', 'offboarding_board',
  'offboarding_update_checklist',
];

// ═══════════════════════════════════════════════════════════════
describe('0359 — بنية المايجريشن', () => {
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
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([\\s\\S]{0,200}?\\)[\\s\\n]*FROM PUBLIC`));
      expect(MIG_CODE, `${f}: anon`).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([\\s\\S]{0,200}?\\)[\\s\\n]*FROM anon`));
      expect(MIG_CODE, `${f}: authenticated`).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([\\s\\S]{0,200}?\\)[\\s\\n]*TO authenticated`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ① — employment_status عمود معدوم', () => {
  it('المايجريشن لا يذكره في الشيفرة', () => {
    expect(MIG_STMT).not.toMatch(/\bemployment_status\b/);
  });

  it('★★★ الخدمة لا تذكره', () => {
    expect(SVC_CODE).not.toMatch(/\bemployment_status\b/);
  });

  it('★★★ الصفحة لا تذكره', () => {
    expect(PAGE_CODE).not.toMatch(/\bemployment_status\b/);
  });

  it('★★★ التعطيل داخل دالة القاعدة نفسها (معاملة واحدة)', () => {
    const b = fnBody('offboarding_execute');
    expect(b).toMatch(/INSERT INTO public\.offboarding_records/);
    expect(b).toMatch(/UPDATE public\.employees[\s\S]{0,80}SET is_active = FALSE/);
  });

  it('★★ الصفحة تنفّذ نداءً واحداً لا نداءين', () => {
    expect(PAGE_CODE).toMatch(/onboardingLifecycleSdk\.offboard\(/);
    // ★ لا تحديث مباشر للموظف بعد التسجيل
    expect(PAGE_CODE).not.toMatch(/employeeService\.update/);
    expect(PAGE_CODE).not.toMatch(/is_active:\s*false/);
  });

  it('★★ الصفحة لا تستعمل الخدمات القديمة', () => {
    for (const s of ['onboardingTaskService', 'employeeOnboardingService',
                     'offboardingRecordService', 'employeeService']) {
      expect(PAGE_CODE, s).not.toMatch(new RegExp(`\\b${s}\\b`));
    }
  });

  it('★★★ كشف الحالة الشاذّة: سجلٌّ وموظفٌ نشط', () => {
    expect(fnBody('offboarding_board')).toMatch(/e\.is_active,/);
    expect(fnBody('onboarding_summary')).toMatch(
      /offboarding_records o[\s\S]{0,160}e\.is_active\)/);
    expect(SVC_CODE).toMatch(/stillActive:\s*boolean/);
    expect(SVC_CODE).toMatch(/orphanActive:\s*number/);
    expect(PAGE_CODE).toMatch(/rec\.stillActive/);
    expect(PAGE_CODE).toMatch(/summary\.orphanActive > 0/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ②/③ — بدء التعريف ذرّيّ وبلا مضاعفة', () => {
  it('الفهرس الفريد (مستأجر، موظف، مهمة)', () => {
    expect(MIG_CODE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_onboarding_emp_task/);
    expect(MIG_CODE).toMatch(/\(tenant_id, employee_id, task_id\)/);
  });

  it('★★★ ON CONFLICT DO NOTHING — الضغط مرّتين لا يُضاعف', () => {
    expect(fnBody('onboarding_start')).toMatch(
      /ON CONFLICT \(tenant_id, employee_id, task_id\) DO NOTHING/);
  });

  it('★★ إدراج واحد لكل المهامّ — لا حلقة', () => {
    const b = fnBody('onboarding_start');
    expect(b).toMatch(/INSERT INTO public\.employee_onboarding[\s\S]{0,200}SELECT v_tenant/);
    expect(b).not.toMatch(/FOR .* IN .* LOOP/);
  });

  it('المهامّ المعطَّلة خارج البدء', () => {
    expect(fnBody('onboarding_start')).toMatch(
      /FROM public\.onboarding_tasks t[\s\S]{0,90}t\.is_active/);
  });

  it('حارس «لا مهامّ مفعّلة»', () => {
    expect(fnBody('onboarding_start')).toMatch(/ONBOARDING_NO_TASKS/);
  });

  it('★★ الخدمة تُعيد عدد المُضاف — لا تدّعي النجاح دائماً', () => {
    expect(SVC_CODE).toMatch(/async start\(employeeId: string\): Promise<number>/);
    expect(PAGE_CODE).toMatch(/n > 0 \?/);
  });

  it('★ الصفحة لا تبني سجلّات المهامّ بنفسها', () => {
    expect(PAGE_CODE).not.toMatch(/task_id:/);
    expect(PAGE_CODE).not.toMatch(/\.upsert\(/);
    expect(PAGE_CODE).toMatch(/onboardingLifecycleSdk\.start\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ الأعطال ④/⑤/⑥ — القيود', () => {
  it('قيد حالة المهمة بالمفردات الأربع', () => {
    expect(MIG_CODE).toMatch(/employee_onboarding_status_chk/);
    const m = MIG_CODE.match(/CHECK \(status IN \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(listed.sort()).toEqual(
      ['completed', 'in_progress', 'pending', 'skipped']);
  });

  it('قيد نوع الإنهاء بالمفردات الأربع', () => {
    expect(MIG_CODE).toMatch(/offboarding_records_type_chk/);
    const m = MIG_CODE.match(/CHECK \(exit_type IN \(([^)]*)\)\)/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(listed.sort()).toEqual(
      ['end_contract', 'involuntary', 'retirement', 'voluntary']);
  });

  it('المفاتيح الأجنبية على الجدولين', () => {
    expect(MIG_CODE).toMatch(/employee_onboarding_employee_id_fkey/);
    expect(MIG_CODE).toMatch(/offboarding_records_employee_id_fkey/);
  });

  it('فرادة إنهاء الخدمة', () => {
    expect(MIG_CODE).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_per_employee/);
    expect(fnBody('offboarding_execute')).toMatch(/OFFBOARDING_DUPLICATE/);
  });

  it('★★★ العطل ⑤: كل الأنواع الأربعة لها تسمية — لا سلسلة شرطية', () => {
    const m = SVC_CODE.match(/export const EXIT_TYPES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s\n]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(
      ['end_contract', 'involuntary', 'retirement', 'voluntary']);
    for (const t of listed) {
      expect(SVC_CODE, `EXIT_TYPE_AR.${t}`).toMatch(new RegExp(`${t}:\\s*'[^']+'`));
    }
  });

  it('★★★ ولا سلسلة `? :` تبتلع end_contract في «تقاعد»', () => {
    expect(PAGE_CODE).not.toMatch(/exit_type === 'voluntary' \? /);
    expect(PAGE_CODE).not.toMatch(/: 'تقاعد'/);
    expect(PAGE_CODE).toMatch(/exitTypeLabel\(rec\.exitType\)/);
  });

  it('★ النوع المجهول يظهر بنصّه لا بـ«تقاعد»', () => {
    expect(SVC_CODE).toMatch(/EXIT_TYPE_AR\[t as ExitType\] \?\? t/);
  });

  it('★ الصفحة تشتقّ الأنواع من الثابت', () => {
    expect(PAGE_CODE).toMatch(/EXIT_TYPES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑦ — completed_by يُكتب', () => {
  it('القاعدة تكتبه من auth.uid()', () => {
    expect(fnBody('onboarding_set_task')).toMatch(
      /completed_by = CASE WHEN p_status = 'completed' THEN auth\.uid\(\)/);
  });

  it('★ ويُمسَح عند التراجع', () => {
    expect(fnBody('onboarding_set_task')).toMatch(
      /completed_by = CASE WHEN p_status = 'completed' THEN auth\.uid\(\)[\s\S]{0,60}ELSE NULL END/);
  });

  it('اللوحة تُعيد اسم مَن أتمّ', () => {
    expect(fnBody('onboarding_board')).toMatch(/pc\.full_name/);
    expect(fnBody('onboarding_board')).toMatch(/'completer'/);
  });

  it('★ الصفحة تعرضه', () => {
    expect(SVC_CODE).toMatch(/completer:\s*string/);
    expect(PAGE_CODE).toMatch(/task\.completer/);
  });

  it('التخطّي يحتاج سبباً ويُحفَظ', () => {
    expect(fnBody('onboarding_set_task')).toMatch(/ONBOARDING_NO_REASON/);
    expect(fnBody('onboarding_set_task')).toMatch(/skipped_reason = CASE WHEN/);
    expect(PAGE_CODE).toMatch(/skipReason\.trim\(\) === ''/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ العطل ⑧ — إجراءات ما بعد الإنهاء', () => {
  it('الدالة موجودة', () => {
    expect(MIG_CODE).toMatch(/CREATE FUNCTION public\.offboarding_update_checklist/);
  });

  it('تُحدّث الأعمدة الثلاثة', () => {
    const b = fnBody('offboarding_update_checklist');
    expect(b).toMatch(/access_revoked\s+= COALESCE\(p_access_revoked/);
    expect(b).toMatch(/is_final_settlement_done = COALESCE\(p_settlement_done/);
    expect(b).toMatch(/assets_returned\s+= COALESCE\(p_assets/);
  });

  it('اللوحة تُعيدها', () => {
    const b = fnBody('offboarding_board');
    expect(b).toMatch(/o\.access_revoked, o\.is_final_settlement_done, o\.assets_returned/);
    expect(b).toMatch(/o\.conducted_by/);
  });

  it('★ الصفحة تعرضها وتُحدّثها', () => {
    expect(PAGE_CODE).toMatch(/accessRevoked/);
    expect(PAGE_CODE).toMatch(/settlementDone/);
    expect(PAGE_CODE).toMatch(/onboardingLifecycleSdk\.updateChecklist\(/);
    expect(PAGE_CODE).toMatch(/rec\.assets\.length/);
  });

  it('conducted_by يُسجَّل عند الإنهاء', () => {
    expect(fnBody('offboarding_execute')).toMatch(/p_assets, auth\.uid\(\)\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ العطل ⑨ — الحذف ممنوع', () => {
  it('محفّز على سجلّ الإنهاء', () => {
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_block_offboarding_delete/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.offboarding_records/);
    expect(MIG_CODE).toMatch(/OFFBOARDING_IMMUTABLE/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/\.delete\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ المنطق المحسوب في القاعدة', () => {
  it('التقدّم يحتسب المتخطّى منجزاً', () => {
    expect(fnBody('onboarding_board')).toMatch(
      /\(a\.completed \+ a\.skipped\) \* 100\.0 \/ a\.total/);
  });

  it('★★ الإلزاميّ المتبقّي يستثني المتخطّى', () => {
    expect(fnBody('onboarding_board')).toMatch(
      /b\.is_mandatory[\s\S]{0,80}status NOT IN \('completed','skipped'\)/);
  });

  it('المهامّ مرتَّبة بـsort_order', () => {
    expect(fnBody('onboarding_board')).toMatch(/ORDER BY b\.sort_order, b\.title/);
  });

  it('★★ منع الإنهاء الذاتيّ', () => {
    expect(fnBody('offboarding_execute')).toMatch(/OFFBOARDING_SELF/);
    expect(fnBody('offboarding_execute')).toMatch(
      /v_self IS NOT NULL AND v_self = p_employee_id/);
  });

  it('حرّاس إنهاء الخدمة', () => {
    const b = fnBody('offboarding_execute');
    expect(b).toMatch(/OFFBOARDING_BAD_TYPE/);
    expect(b).toMatch(/OFFBOARDING_NO_REASON/);
    expect(b).toMatch(/OFFBOARDING_NO_DATE/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ NULL ≠ صفر (درس 0353)', () => {
  it('القاعدة لا تُحوّل المتوسّط إلى صفر', () => {
    expect(fnBody('onboarding_summary')).not.toMatch(/COALESCE\(round\(avg/);
    expect(fnBody('onboarding_summary')).toMatch(/round\(avg\(done \* 100\.0/);
  });

  it('الخدمة تُعلنه nullable', () => {
    expect(SVC_CODE).toMatch(/avgProgress:\s*number \| null/);
    expect(SVC_CODE).toMatch(/avgProgress:\s*numOrNull\(/);
  });

  it('★★ الصفحة تعرض نصّاً صريحاً لا صفراً', () => {
    expect(PAGE_CODE).toMatch(/avgProgress === null \? 'لا تعريف'/);
  });

  it('★ numOrNull لا يحوّل NULL إلى صفر', () => {
    expect(SVC_CODE).toMatch(/const numOrNull[\s\S]{0,200}return null/);
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

  it('القراءة محصورة بالطاقم', () => {
    for (const f of ['onboarding_board', 'onboarding_summary', 'offboarding_board']) {
      expect(fnBody(f), f).toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('الكتابة محصورة بـadmin و hr', () => {
    for (const f of ['onboarding_start', 'onboarding_set_task',
                     'offboarding_execute', 'offboarding_update_checklist']) {
      expect(fnBody(f), f).toMatch(/v_role NOT IN \('admin','hr'\)/);
    }
  });

  it('كل دالة تُرشِّح بالمستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: ترشيح`).toMatch(/tenant_id = v_tenant/);
    }
  });

  it('التحقّق أن الموظف من المستأجر نفسه', () => {
    for (const f of ['onboarding_start', 'offboarding_execute']) {
      expect(fnBody(f), f).toMatch(
        /FROM public\.employees e[\s\S]{0,140}e\.tenant_id = v_tenant/);
    }
  });

  it('اللوحتان لهما حدّ أعلى', () => {
    expect(fnBody('onboarding_board'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 200\), 1\)/);
    expect(fnBody('offboarding_board'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 200\), 1\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑩ — لا نقل جداول إلى المتصفّح', () => {
  it('الصفحة تمرّر حدوداً صريحة', () => {
    expect(PAGE_CODE).toMatch(/board\(search\.trim\(\) \|\| null, \d+\)/);
    expect(PAGE_CODE).toMatch(/limit:\s*\d+/);
  });

  it('★★ لا تجميع يدويّ في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/new Map\(/);
    expect(PAGE_CODE).not.toMatch(/grouped\[/);
    expect(PAGE_CODE).not.toMatch(/tasks\.find\(/);
    expect(PAGE_CODE).not.toMatch(/empMap/);
  });

  it('المهامّ تأتي مجمّعة من القاعدة', () => {
    expect(fnBody('onboarding_board')).toMatch(/jsonb_agg\(/);
    expect(SVC_CODE).toMatch(/function parseTasks/);
  });

  it('★ سلسلة الاسم في اللوحتين', () => {
    for (const f of ['onboarding_board', 'offboarding_board']) {
      expect(fnBody(f), f).toMatch(/COALESCE\(NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
      expect(fnBody(f), f).toMatch(/'موظف ' \|\| COALESCE\(e\.employee_code/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ سياسة المنصة — محظورات', () => {
  it('لا confirm/prompt/alert في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★★ لا as any ولا : any (كانت في أربعة مواضع)', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/:\s*any\b/);
    expect(SVC_CODE).not.toMatch(/:\s*any\b/);
    expect(PAGE_CODE).not.toMatch(/useState<any/);
    expect(PAGE_CODE).not.toMatch(/Record<string, any/);
  });

  it('★★ الصفحة لا تلمس Supabase مباشرةً', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★ اليوم بتوقيت بغداد', () => {
    expect(PAGE_CODE).toMatch(/timeZone:\s*'Asia\/Baghdad'/);
    expect(fnBody('onboarding_start')).not.toMatch(/CURRENT_DATE/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ التسجيل والترابط', () => {
  it('الخدمة مُصدَّرة من فهرس SDK', () => {
    expect(INDEX).toMatch(
      /export \{[\s\S]{0,300}onboardingLifecycleSdk[\s\S]{0,300}\} from '\.\/OnboardingLifecycleService'/);
    expect(INDEX).toMatch(/EXIT_TYPES/);
    expect(INDEX).toMatch(/ONBOARDING_TASK_STATUSES/);
  });

  it('الصفحة تستورد من الفهرس لا من الملف مباشرةً', () => {
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/services\/sdk'/);
    expect(PAGE_CODE).not.toMatch(/from '.*sdk\/OnboardingLifecycleService'/);
  });

  it('★ المكوّنات المشتركة من LoansPage لا مكرَّرة', () => {
    expect(PAGE_CODE).toMatch(
      /import \{ Modal, EmployeePicker, FormField, ModalActions \} from '\.\/LoansPage'/);
    for (const c of ['Modal', 'FormField', 'ModalActions', 'EmployeePicker']) {
      expect(PAGE_CODE, `${c} مكرَّر`).not.toMatch(
        new RegExp(`function ${c}\\s*\\(`));
    }
  });

  it('أدوات التحقق الثلاث موجودة', () => {
    for (const p of [
      'tools/dev/verify-onboarding-0359.sql',
      'tools/dev/verify-onboarding-0359-rls.sh',
      'tools/dev/_invert_0359.py',
    ]) {
      expect(existsSync(resolve(root, p)), p).toBe(true);
    }
  });
});
