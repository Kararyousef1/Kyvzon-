/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0344 — مفردات حالة الحضور · ربط الإجازة · طلبات التصحيح
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ لماذا هذا الملف موجود أصلاً؟
 *
 *   `src/test/myAttendanceContract.test.ts:87` كان يكتب:
 *
 *     expect(body).toMatch(
 *       /sum\(total_hours\) FILTER \(WHERE status IN \('في الوقت','متأخر','حاضر'\)\)/
 *     );
 *
 *   أي أنه **ينسخ نصّ المايجريشن ويطالب بمطابقته**. الدالة تساوي
 *   نفسها فيمرّ الاختبار مهما كان النصّ خاطئاً — ولو كتبتُ 'أبجد'
 *   لمرّ أيضاً بشرط كتابتها في الاختبار كذلك. وهذا ما حدث فعلاً:
 *   المفردات الثلاث في 0337 مختلقة ولا وجود لها في المنصّة، ومرّ
 *   الاختبار ثمانية أشهر.
 *
 *   لذلك هذا الملف **لا يقارن الدالة بنفسها**. يقارنها بالمصدر
 *   المستقلّ للحقيقة: `determineAttendanceStatus` في
 *   `src/utils/shiftCalculations.ts` و`AttendanceStatus` في
 *   `shiftTypes.ts` — وهما ما يُنتج القيم المكتوبة في العمود.
 *   السلوك نفسه مُختبَر على Postgres في
 *   `tools/dev/verify-attendance-vocabulary-0344.sql` (91 تأكيداً)
 *   وعبر RLS في `-rls.sh` (26 تأكيداً).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

/**
 * ★★★ يزيل التعليقات — نحرس الشيفرة لا الشرح.
 *
 *   بلا هذا سقطت خمسة تأكيدات لأن التوثيق **يقتبس العطل حرفياً**:
 *   0344 يشرح مفردات 0337 المختلقة، وleaveAttendanceLink يقتبس
 *   `if (dayOfWeek === 6)` القديم ليشرح الخطأ. حظرُ ذكر العطل يعني
 *   منعَ توثيقه — والتوثيق هو ما يمنع تكراره.
 */
function codeOnlyTs(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** ونظيره لـSQL: `--` حتى آخر السطر */
function codeOnlySql(src: string): string {
  return src.replace(/^\s*--.*$/gm, '');
}

const MIG = read('supabase/migrations/0344_attendance_status_vocabulary.sql');
const SHIFT_TYPES = read('src/utils/shiftTypes.ts');
const SHIFT_CALC = read('src/utils/shiftCalculations.ts');
const SHIFT_REPORTS = read('src/utils/shiftReports.ts');
const SERVICE = read('src/services/sdk/AttendanceService.ts');
const PAGE = read('src/pages/employee/MyAttendancePage.tsx');
const LINK = read('src/services/integrations/leaveAttendanceLink.ts');

/** المفردات الثماني — المرجع المستقلّ */
const VOCAB = [
  'حضور_بوقت', 'متأخر', 'زمنية_معتمدة', 'زمنية_انتظار',
  'غائب', 'مجاز', 'إجازة_انتظار', 'عطلة',
] as const;

/** المفردات المختلقة في 0337 */
const PHANTOM = ['في الوقت', 'حاضر'] as const;

describe('★★ المُجرِّدان يعملان فعلاً', () => {
  it('codeOnlyTs يزيل التعليقات ويُبقي الشيفرة', () => {
    expect(codeOnlyTs('/* as any */ const x = 1;')).not.toMatch(/as any/);
    expect(codeOnlyTs('// as any\nconst y = 2;')).not.toMatch(/as any/);
    expect(codeOnlyTs('const z = a as any;')).toMatch(/as any/);
  });

  it('codeOnlySql يزيل -- ويُبقي الشيفرة', () => {
    expect(codeOnlySql("-- 'في الوقت'\nSELECT 1;")).not.toMatch(/في الوقت/);
    expect(codeOnlySql("SELECT 'في الوقت';")).toMatch(/في الوقت/);
  });
});

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في 0344`).toBeGreaterThan(-1);
  const end = MIG.indexOf('END $$;', i);
  const alt = MIG.indexOf('$$;', i);
  return MIG.slice(i, end > -1 ? end : alt > -1 ? alt : MIG.length);
};

// ═══════════════════════════════════════════════════════════════════
describe('0344 — المفردات تُشتقّ من مصدر مستقلّ لا من نصّ المايجريشن', () => {
  /**
   * ★★★ الحارس الأهمّ: كل قيمة في `AttendanceStatus` (وهو النوع الذي
   *   تُرجعه determineAttendanceStatus) يجب أن تكون مُصنَّفة في
   *   attendance_status_bucket. لو أُضيفت حالة تاسعة إلى الشيفرة ولم
   *   تُضَف إلى القاعدة، يسقط هذا الاختبار.
   */
  const declared = (() => {
    const m = SHIFT_TYPES.match(/export type AttendanceStatus =([\s\S]*?);/);
    expect(m, 'تعريف AttendanceStatus غير موجود في shiftTypes.ts').toBeTruthy();
    return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  })();

  it('★★★ AttendanceStatus يُصرّح بثماني حالات بالضبط', () => {
    expect(declared.sort()).toEqual([...VOCAB].sort());
  });

  const bucket = fnBody('attendance_status_bucket');

  it.each(declared)('★★★ «%s» مُصنَّفة في attendance_status_bucket', (st) => {
    expect(
      bucket,
      `الحالة «${st}» تُنتجها المنصّة ولا تصنّفها القاعدة ⇒ ستُعدّ unknown`,
    ).toContain(`WHEN '${st}'`);
  });

  it('★★★ ولا حالة في القاعدة خارج ما تُنتجه المنصّة', () => {
    const inDb = [...bucket.matchAll(/WHEN '([^']+)'/g)].map((m) => m[1]);
    expect(inDb.sort()).toEqual([...declared].sort());
  });

  /**
   * ★★★ المفردات المختلقة في 0337 لا يجوز أن تعود بأي صورة —
   *   لا في القاعدة ولا في الصفحة ولا في الخدمة.
   */
  it.each(PHANTOM)('★★★ مفردة 0337 المختلقة «%s» غائبة عن شيفرة 0344', (ph) => {
    // ★ التعليق **يجب** أن يذكرها (يشرح العطل) — الشيفرة لا.
    expect(codeOnlySql(MIG).includes(`'${ph}'`)).toBe(false);
    expect(MIG.includes(ph), 'التوثيق يجب أن يشرح المفردة المختلقة').toBe(true);
  });

  it('★★ ولا في شيفرة الصفحة ولا الخدمة', () => {
    for (const ph of PHANTOM) {
      expect(codeOnlyTs(PAGE).includes(`'${ph}'`), `الصفحة تستعمل «${ph}»`).toBe(false);
      expect(codeOnlyTs(SERVICE).includes(`'${ph}'`), `الخدمة تستعمل «${ph}»`).toBe(false);
    }
  });

  /**
   * ★★ التصنيف يوافق دلالة determineAttendanceStatus: كل حالة تُعاد
   *   من فرع `IF (!hasPunch)` ليست حضوراً.
   */
  it('★★★ الحالات المُعادة قبل البصمة ليست present', () => {
    const noPunch = SHIFT_CALC.slice(
      SHIFT_CALC.indexOf('if (!hasPunch) {'),
      SHIFT_CALC.indexOf('const lateMinutes'),
    );
    const returned = [...noPunch.matchAll(/return '([^']+)'/g)].map((m) => m[1]);
    expect(returned.length, 'لم أجد فرع «لم يبصم»').toBeGreaterThan(0);
    for (const st of returned) {
      const m = bucket.match(new RegExp(`WHEN '${st}'\\s+THEN '(\\w+)'`));
      expect(m, `«${st}» غير مصنّفة`).toBeTruthy();
      expect(m![1], `«${st}» تُعاد بلا بصمة فلا يجوز أن تكون present`)
        .not.toBe('present');
    }
  });

  it('★★★ و«زمنية_انتظار» present لأنها تُعاد بعد بصمة', () => {
    expect(bucket).toMatch(/WHEN 'زمنية_انتظار'\s+THEN 'present'/);
    // تأكيد موجب على المصدر: تُعاد في فرع بعد hasPunch
    const afterPunch = SHIFT_CALC.slice(SHIFT_CALC.indexOf('const lateMinutes'));
    expect(afterPunch).toContain("return 'زمنية_انتظار'");
  });

  it('★ والدالة IMMUTABLE (صالحة للفهرسة والقيود)', () => {
    expect(bucket).toMatch(/LANGUAGE sql\s+IMMUTABLE/);
  });

  it('★★ والمجهول لا يُبتلع صامتاً', () => {
    expect(bucket).toMatch(/ELSE 'unknown'/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — STATUS_LABELS/COLORS تغطّي المفردات نفسها', () => {
  it.each(VOCAB)('★ «%s» لها تسمية ولون', (st) => {
    expect(SHIFT_REPORTS).toContain(`${st}:`);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — الإحصاءات تستدعي التصنيف ولا تكرّر القائمة', () => {
  const body = fnBody('my_attendance_month_stats');

  /**
   * ★★★ جوهر الدرس: تكرار القائمة أربع مرات في 0337 هو ما جعل الخطأ
   *   يتضاعف. الآن الاستدعاء مركزيّ.
   */
  it('★★★ لا قائمة حالات مكتوبة يدوياً داخل الدالة', () => {
    const manual = [...body.matchAll(/status IN \(([^)]*'[^)]*)\)/g)];
    expect(
      manual.map((m) => m[0]),
      'قائمة حالات مكرّرة داخل الدالة — استعمل attendance_status_bucket',
    ).toEqual([]);
  });

  it('★★ تستدعي attendance_status_bucket', () => {
    expect(body).toMatch(/public\.attendance_status_bucket\(a\.status\)/);
  });

  it('★★★ present يعتمد التصنيف لا نصّاً', () => {
    expect(body).toMatch(/count\(\*\) FILTER \(WHERE bucket = 'present'\)/);
  });

  it("★★ late هي 'متأخر' وحدها (زمنية_معتمدة حضور لا تأخير)", () => {
    expect(body).toMatch(/count\(\*\) FILTER \(WHERE status = 'متأخر'\)/);
  });

  it('★★★ leave لم يعد صفراً — يُحتسب فعلاً', () => {
    expect(body).toMatch(/count\(\*\) FILTER \(WHERE bucket = 'leave'\)/);
  });

  it('★★★ المتوسط على أيام الحضور — بسطاً ومقاماً', () => {
    expect(body).toMatch(
      /sum\(total_hours\) FILTER \(WHERE bucket = 'present'\)/,
    );
    expect(body).toMatch(
      /NULLIF\(count\(\*\) FILTER \(WHERE bucket = 'present'\), 0\)/,
    );
  });

  it('★★ unknown مُعاد للواجهة', () => {
    expect(body).toMatch(/count\(\*\) FILTER \(WHERE bucket = 'unknown'\)/);
    expect(MIG).toContain('out_unknown      INTEGER');
  });

  it('★★ صفّ أصفار للشهر غير الصالح (لا NaN في الواجهة)', () => {
    expect(body).toMatch(/RETURN QUERY SELECT 0,0,0,0,0, 0::NUMERIC, 0::NUMERIC, 0, 0, 0;/);
  });

  it('★★ مقيّد بالمستأجر والموظف', () => {
    expect(body).toMatch(/a\.tenant_id = v_tenant/);
    expect(body).toMatch(/a\.employee_id = v_emp/);
  });

  it('★ يستعمل current_user_employee_id (درس 0335)', () => {
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    expect(body).not.toMatch(/v_emp\s+UUID := auth\.uid\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — التتابع', () => {
  const body = fnBody('my_attendance_streak');

  it('★★★ يعتمد التصنيف لا قائمة نصّية', () => {
    expect(body).toMatch(
      /attendance_status_bucket\(a\.status\) IN \('present','absent'\)/,
    );
    for (const ph of PHANTOM) expect(body.includes(`'${ph}'`)).toBe(false);
  });

  it("★★★ 'leave' مُقصاة من الحلقة — لا تُحتسب ولا تكسر", () => {
    expect(body).not.toMatch(/IN \('present','absent','leave'\)/);
  });

  it('★★★ الغياب يكسر السلسلة', () => {
    expect(body).toMatch(/IF r\.bucket = 'absent' THEN/);
    expect(body).toMatch(/v_running := 0;/);
  });

  it('★ من الأحدث إلى الأقدم', () => {
    expect(body).toMatch(/ORDER BY a\.shift_date DESC/);
  });

  it('★★ مقيّد بالمستأجر والموظف', () => {
    expect(body).toMatch(/a\.tenant_id = v_tenant/);
    expect(body).toMatch(/a\.employee_id = v_emp/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — ربط الإجازة بالحضور', () => {
  const apply = fnBody('apply_leave_to_attendance');
  const revert = fnBody('revert_leave_from_attendance');

  it('★★★ القيد الثلاثيّ لا الثنائيّ', () => {
    expect(apply).toMatch(
      /ON CONFLICT \(tenant_id, employee_id, shift_date\)/,
    );
    expect(apply).not.toMatch(/ON CONFLICT \(employee_id, shift_date\)/);
  });

  it('★★★ tenant_id يُمرَّر في الإدراج', () => {
    expect(apply).toMatch(/VALUES \(v_tenant, p_employee_id, d, 'مجاز'/);
  });

  it('★★★ الجمعة DOW=5 لا 6', () => {
    expect(apply).toMatch(/EXTRACT\(DOW FROM d\) <> 5/);
    expect(apply).not.toMatch(/EXTRACT\(DOW FROM d\) <> 6/);
  });

  it('★★ العطلة الرسمية تُتخطّى', () => {
    expect(apply).toMatch(/FROM public\.holidays h/);
  });

  it('★★★ الصلاحية مفحوصة صراحةً (الدالة DEFINER)', () => {
    expect(apply).toMatch(/SECURITY DEFINER/);
    expect(apply).toMatch(/NOT IN\s*\n?\s*\('admin','hr','developer','it_admin','manager','supervisor','direct_manager'\)/);
    expect(apply).toMatch(/RAISE EXCEPTION 'غير مصرَّح/);
  });

  it('★★★ والمستأجر مفحوص (الدالة تتجاوز RLS)', () => {
    expect(apply).toMatch(/e\.tenant_id = v_tenant/);
    expect(apply).toMatch(/ليس ضمن هذا المستأجر/);
  });

  it('★★ حدّ أعلى للنطاق', () => {
    expect(apply).toMatch(/p_date_to - p_date_from > 400/);
    expect(apply).toMatch(/p_date_to < p_date_from/);
  });

  it('★★★ التراجع لا يحذف نهائياً', () => {
    expect(revert).toMatch(/UPDATE public\.attendance_summary/);
    expect(revert).not.toMatch(/DELETE FROM public\.attendance_summary/);
    expect(revert).toMatch(/SET status = 'غائب'/);
  });

  it('★★★ ولا يمسّ يوماً فيه بصمة', () => {
    expect(revert).toMatch(/AND a\.check_in IS NULL/);
  });

  it('★★ والمستأجر مفحوص في التراجع أيضاً', () => {
    expect(revert).toMatch(/ليس ضمن هذا المستأجر/);
    expect(revert).toMatch(/RAISE EXCEPTION 'غير مصرَّح/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — leaveAttendanceLink لم يعد يلمس Supabase', () => {
  it("★★★ لا .from('…') في الشيفرة", () => {
    expect(codeOnlyTs(LINK)).not.toMatch(/\.from\('[a-z_]+'\)/);
  });

  it('★★★ ولا rpc لدالة غير موجودة', () => {
    expect(codeOnlyTs(LINK)).not.toMatch(/rpc\(\s*'refresh_attendance_summary'/);
  });

  it('★★★ ولا حذف نهائي', () => {
    expect(codeOnlyTs(LINK)).not.toMatch(/\.delete\(\)/);
  });

  it('★★ يمرّ عبر SDK', () => {
    expect(LINK).toMatch(/attendanceService\.applyLeaveToAttendance/);
    expect(LINK).toMatch(/attendanceService\.revertLeaveFromAttendance/);
  });

  it('★★★ الجمعة getDay()===5 لا 6', () => {
    const code = codeOnlyTs(LINK);
    expect(code).toMatch(/dayOfWeek === 5/);
    // ★ 6 هو **السبت** — يوم عمل. الكود القديم تخطّاه وعالج الجمعة.
    expect(code).not.toMatch(/dayOfWeek === 6/);
    // والتعليق يقتبس العطل القديم عمداً
    expect(LINK).toMatch(/dayOfWeek === 6/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — الصفحة', () => {
  it('★★★ تعرض خانة الإجازات (كانت تسقط تماماً)', () => {
    expect(PAGE).toMatch(/stats\.leave/);
  });

  it('★★ وتعرض unknown حين يوجد', () => {
    expect(PAGE).toMatch(/stats\.unknown/);
  });

  it('★★★ وتعرض سجلّ طلبات التصحيح', () => {
    expect(PAGE).toMatch(/attendanceService\.myCorrections/);
    expect(PAGE).toMatch(/corrections\.map/);
  });

  it('★★ خريطة الألوان تغطّي الحالات الثماني', () => {
    const m = PAGE.match(/const STATUS_BG: Record<string, string> = \{([\s\S]*?)\};/);
    expect(m, 'STATUS_BG غير موجودة').toBeTruthy();
    for (const st of VOCAB) {
      expect(m![1], `«${st}» بلا لون في التقويم`).toContain(`'${st}'`);
    }
  });

  it('★★ وحالات hr_cases الخمس لها تسميات', () => {
    for (const st of ['open', 'in_review', 'waiting_employee', 'resolved', 'closed']) {
      expect(PAGE).toContain(`${st}:`);
    }
  });

  it('★ لا confirm/alert/prompt', () => {
    expect(codeOnlyTs(PAGE)).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });

  it('★ ولا as any في الشيفرة', () => {
    expect(codeOnlyTs(PAGE)).not.toMatch(/\bas any\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0344 — الصلاحيات والقيد', () => {
  it.each([
    'my_attendance_month_stats(INTEGER,INTEGER)',
    'my_attendance_streak()',
    'my_attendance_corrections(INTEGER)',
    'apply_leave_to_attendance(UUID,DATE,DATE)',
    'revert_leave_from_attendance(UUID,DATE,DATE)',
  ])('★★ anon محروم من %s', (sig) => {
    expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon;`);
  });

  it('★★ القيد يُدرج المفردات الثماني', () => {
    const m = MIG.match(/CHECK \(status IN \(([\s\S]*?)\)\) NOT VALID/);
    expect(m, 'قيد المفردات غير موجود').toBeTruthy();
    const listed = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(listed.sort()).toEqual([...VOCAB].sort());
  });

  it('★ والقيد NOT VALID (لا يُبطل التطبيق على بيانات قائمة)', () => {
    expect(MIG).toMatch(/\)\) NOT VALID;/);
  });

  it('★ والفهرس جزئيّ', () => {
    expect(MIG).toMatch(/WHERE case_type = 'attendance_correction';/);
  });
});
