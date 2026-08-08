/**
 * ════════════════════════════════════════════════════════════════
 *  myAttendanceContract.test.ts
 *
 *  عقد «حضوري الشهري» (migration 0337).
 *  المرحلة 2 — الجولة الثالثة.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-my-attendance-0337.sql   39 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0337_my_attendance_month.sql');
/**
 * ★★★ درس مُكرَّر (أخطأتُ فيه في 0340 أيضاً): **المرجع هو آخر
 *   مايجريشن عدّل الدالة**، لا الذي أنشأها. `my_attendance_month_stats`
 *   و`my_attendance_streak` أُعيد إنشاؤهما في 0344 بمفردات صحيحة؛
 *   قراءة 0337 وحده تفحص نسخة **ميّتة** لا تصل إلى القاعدة أبداً.
 *   `my_attendance_month` وحدها ما زالت من 0337.
 */
const M44 = read('supabase/migrations/0344_attendance_status_vocabulary.sql');
const VERIFY = read('tools/dev/verify-my-attendance-0337.sql');
const SVC = read('src/services/sdk/AttendanceService.ts');
const PAGE = read('src/pages/employee/MyAttendancePage.tsx');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

/** الدوال التي أعاد 0344 إنشاءها — تُقرأ منه لا من 0337 */
const REDEFINED_IN_0344 = new Set([
  'my_attendance_month_stats',
  'my_attendance_streak',
]);

function fnBody(name: string): string {
  const src = REDEFINED_IN_0344.has(name) ? M44 : M;
  const s = src.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = src.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s, `${name}: لا تعريف`).toBeGreaterThan(-1);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(s);
  return src.slice(s, e);
}

/**
 * ★★ حارس ضد تكرار الخطأ: أي دالة يعيد 0344 إنشاءها **يجب** أن تكون
 *   في القائمة أعلاه، وإلا فحصنا نسخة ميّتة.
 */
describe('★★★ المرجع هو آخر مايجريشن عدّل الدالة', () => {
  it('كل دالة أعاد 0344 إنشاءها ومعرَّفة في 0337 مُدرَجة', () => {
    const in44 = [...M44.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    const overlap = in44.filter((n) => M.includes(`CREATE FUNCTION public.${n}(`));
    expect(overlap.sort()).toEqual([...REDEFINED_IN_0344].sort());
  });
});

describe('0337 — النطاق الزمني', () => {
  const body = fnBody('my_attendance_month');

  /**
   * ★★★ جوهر العطل: الصفحة حسبت startDate/endDate ولم تُمرّرهما
   *   لأي استعلام — فجلبت كل تاريخ الموظف (23 سجلاً بدل 3).
   */
  it('★★★ يُرشّح بحدود الشهر فعلاً', () => {
    expect(body).toMatch(/a\.shift_date >= v_from/);
    expect(body).toMatch(/a\.shift_date <\s+v_to/);
  });

  it('★★ الحدود تُحسب في القاعدة لا تُستقبَل نصّاً', () => {
    // تمرير تاريخين من المتصفح يعني الوثوق بمنطقته الزمنية
    expect(body).toMatch(/v_from := make_date\(v_y, v_m, 1\)/);
    expect(body).toMatch(/v_to\s+:= \(v_from \+ INTERVAL '1 month'\)::DATE/);
  });

  it('★ الحدّ الأعلى حصري (< لا <=) — لا تداخل بين الشهور', () => {
    expect(body).not.toMatch(/a\.shift_date <= v_to/);
  });

  it('★ شهر خارج المدى لا يُسقط الاستعلام', () => {
    expect(body).toMatch(/IF v_m < 1 OR v_m > 12 THEN RETURN; END IF;/);
    expect(body).toMatch(/IF v_y < 1900 OR v_y > 2200 THEN RETURN; END IF;/);
  });

  it('★ الافتراضي = الشهر الحالي', () => {
    expect(body).toMatch(/COALESCE\(p_year , EXTRACT\(YEAR {2}FROM current_date\)/);
    expect(body).toMatch(/COALESCE\(p_month, EXTRACT\(MONTH FROM current_date\)/);
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

describe('0337 — إحصاءات الشهر', () => {
  const body = fnBody('my_attendance_month_stats');

  /**
   * ★★★ تصحيح 0344: النسخة الأولى من هذه التأكيدات كانت **تنسخ نصّ
   *   المايجريشن حرفياً** وتطالب بمطابقته:
   *
   *     expect(body).toMatch(
   *       /…FILTER \(WHERE status IN \('في الوقت','متأخر','حاضر'\)\)/
   *     );
   *
   *   وهذا يقارن الدالة بنفسها — يمرّ مهما كان النصّ خاطئاً. وقد كان:
   *   المفردات الثلاث مختلقة ولا تُنتجها المنصّة إطلاقاً، فعادت
   *   الإحصاءات خاطئة (حضور 1 بدل 4) والاختبار «أخضر».
   *
   *   المفردات صارت تُشتقّ من attendance_status_bucket (0344)،
   *   وصحّتها مضمونة بمقارنة مستقلّة مع AttendanceStatus في
   *   src/test/attendanceVocabularyContract.test.ts.
   */
  it('★★ المتوسط على أيام الحضور — عبر التصنيف المركزي (0344)', () => {
    expect(body).toMatch(
      /sum\(total_hours\) FILTER \(WHERE bucket = 'present'\)/,
    );
    expect(body).toMatch(
      /NULLIF\(count\(\*\) FILTER \(WHERE bucket = 'present'\), 0\)/,
    );
  });

  it('★★★ ولا مفردة مختلقة باقية', () => {
    expect(body).not.toMatch(/'في الوقت'/);
    expect(body).not.toMatch(/'حاضر'/);
  });

  it('★ الحضور يشمل المتأخر (bucket=present)', () => {
    expect(body).toMatch(/count\(\*\) FILTER \(WHERE bucket = 'present'\)/);
  });

  /**
   * ★★ صفّ أصفار لا «لا شيء»: الواجهة تعرض بطاقات إحصاء دائماً،
   *   وغياب الصفّ يجعلها undefined فتظهر NaN.
   */
  it('★★ يُرجع صفّ أصفار للشهر الفارغ', () => {
    // ★ 0344 أضاف out_unknown ⇒ عشرة أعمدة لا تسعة
    expect(body).toMatch(/RETURN QUERY SELECT 0,0,0,0,0, 0::NUMERIC, 0::NUMERIC, 0, 0, 0;/);
  });

  it('★ لا قسمة على صفر', () => {
    expect(body).toMatch(/NULLIF\(count/);
    expect(body).toMatch(/COALESCE\(\s*\n?\s*round\(/);
  });

  it('★★ مقيّد بالمستأجر', () => {
    expect(body).toMatch(/a\.tenant_id = v_tenant/);
  });
});

describe('0337 — التتابع الحقيقي', () => {
  const body = fnBody('my_attendance_streak');

  /**
   * ★★★ الصفحة كانت تحسبه `Math.min(عدد غير الغائب, 7)` — عدٌّ لا
   *   تتابع. من حضر يوماً وغاب يوماً شهراً يحصل على 7 بينما أطول
   *   تتابع لديه 1.
   */
  it('★★★ يكسر السلسلة عند الغياب', () => {
    // ★ 0344: الشرط صار على التصنيف لا على النصّ الخام
    expect(body).toMatch(/IF r\.bucket = 'absent' THEN/);
    expect(body).toMatch(/v_running := 0;/);
  });

  it('★★ يُميّز التتابع الحالي عن الأطول', () => {
    expect(body).toMatch(/out_current_streak/);
    expect(body).toMatch(/out_longest_streak/);
    expect(body).toMatch(/v_cur\s+:= v_running/);
    expect(body).toMatch(/IF v_running > v_best THEN v_best := v_running/);
  });

  /**
   * ★★★ 'إجازة' مستثناة عمداً: ليست حضوراً ولا انقطاعاً. احتسابها
   *   حضوراً يُضخّم التتابع زوراً.
   */
  it("★★★ الإجازة لا تُحتسب حضوراً ولا تكسر (0344)", () => {
    expect(body).toMatch(
      /attendance_status_bucket\(a\.status\) IN \('present','absent'\)/,
    );
    expect(body).not.toMatch(/'present','absent','leave'/);
  });

  it('★ من الأحدث إلى الأقدم (التتابع الحالي هو ما قبل أول غياب)', () => {
    expect(body).toMatch(/ORDER BY a\.shift_date DESC/);
  });

  it('★ يُسجّل آخر غياب', () => {
    expect(body).toMatch(/out_last_absence/);
    expect(body).toMatch(/IF v_last IS NULL THEN v_last := r\.shift_date/);
  });

  it('★ صفّ أصفار لمن بلا سجلّ موظف', () => {
    expect(body).toMatch(/RETURN QUERY SELECT 0, 0, NULL::DATE;/);
  });

  it('★ حدّ أعلى للمسح (لا يمسح عقداً من السجلات)', () => {
    expect(body).toMatch(/LIMIT 400/);
  });
});

describe('0337 — الصلاحيات والفهارس', () => {
  it.each([
    'my_attendance_month(INTEGER,INTEGER)',
    'my_attendance_month_stats(INTEGER,INTEGER)',
    'my_attendance_streak()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it.each(['my_attendance_month', 'my_attendance_month_stats', 'my_attendance_streak'])(
    '%s — SECURITY INVOKER',
    (fn) => {
      const body = fnBody(fn);
      expect(body).toMatch(/SECURITY INVOKER/);
      expect(body).not.toMatch(/SECURITY DEFINER/);
    },
  );

  it.each(['idx_att_summary_emp_month', 'idx_att_logs_emp_date'])(
    '%s موجود وقابل لإعادة التشغيل',
    (idx) => {
      expect(M).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
    },
  );

  it('★ DROP قبل CREATE (درس 0320)', () => {
    for (const fn of ['my_attendance_month', 'my_attendance_month_stats',
                      'my_attendance_streak']) {
      const d = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const c = M.indexOf(`CREATE FUNCTION public.${fn}`);
      expect(d, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(d, `${fn}: DROP بعد CREATE`).toBeLessThan(c);
    }
  });
});

describe('0337 — طبقة SDK', () => {
  it.each(['my_attendance_month', 'my_attendance_month_stats', 'my_attendance_streak'])(
    'تستدعي %s عبر RPC',
    (fn) => {
      expect(SVC).toContain(`rpc('${fn}'`);
    },
  );

  it('★ الأنواع الثلاثة مُصدَّرة', () => {
    for (const t of ['MyAttendanceDay', 'MyAttendanceStats', 'MyAttendanceStreak']) {
      expect(SVC).toMatch(new RegExp(`export interface ${t}`));
      expect(read('src/services/sdk/index.ts')).toContain(t);
    }
  });

  it('★ بلا as any', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
  });

  it('★ حارس المعرّف الفارغ باقٍ (0333)', () => {
    expect(SVC).toMatch(/if \(!employeeId \|\| employeeId\.trim\(\) === ''\)/);
  });
});

describe('★★ الصفحة — النطاق والحسابات', () => {
  it('★★★ تمرّر الشهر للاستعلام', () => {
    expect(PAGE).toMatch(/attendanceService\.myMonth\(currentYear, currentMonth \+ 1\)/);
  });

  it('★★ الإحصاءات من القاعدة لا من عدّ المصفوفات', () => {
    expect(PAGE).toMatch(/statsRow\.totalHours/);
    expect(PAGE).toMatch(/statsRow\.avgHours/);
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/summaryData\.reduce\(/);
  });

  it('★★★ التتابع من القاعدة لا Math.min', () => {
    expect(PAGE).toMatch(/weeklyStreak: streakRow\.current/);
    expect(codeOnly(PAGE)).not.toMatch(/Math\.min\(summaryData/);
  });

  it('★ لا Math.random', () => {
    expect(codeOnly(PAGE)).not.toMatch(/Math\.random/);
  });

  it('★ بلا as any ولا confirm', () => {
    const code = codeOnly(PAGE);
    expect(code).not.toMatch(/\bas any\b/);
    expect(code).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
  });

  it('★ تعالج حالة «بلا سجلّ موظف»', () => {
    expect(PAGE).toMatch(/لا يوجد سجل موظف مرتبط بحسابك/);
  });
});

describe('0337 — الاختبار السلوكي', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-my-attendance-0337.sql'))).toBe(true);
  });

  it('★★★ يفحص أن التنقّل بين الشهور يعمل', () => {
    expect(VERIFY).toMatch(/التنقّل بين الشهور معطّل/);
  });

  it('★★ ويفحص أن النطاق ليس صورياً', () => {
    expect(VERIFY).toMatch(/شهر فارغ أعاد .* سجلاً ⇒ النطاق صوري/);
  });

  it('★★★ يفحص الفرق بين العدّ والتتابع', () => {
    expect(VERIFY).toMatch(/تناوب حضور\/غياب/);
    expect(VERIFY).toMatch(/الصيغة القديمة min\(7,7\)=7/);
  });

  it('★★ ويفحص أن فجوة العطلة لا تكسر التتابع', () => {
    expect(VERIFY).toMatch(/الفجوة تكسر/);
  });

  it('★★★ يوثّق التصحيحين الذاتيين', () => {
    expect(VERIFY).toMatch(/تصحيح ذاتي مُوثَّق/);
    expect(VERIFY).toMatch(/تصحيح ذاتي ثانٍ/);
  });

  it('★ يوثّق الحالات المُستخرَجة من المايجريشنات', () => {
    expect(VERIFY).toMatch(/بلا CHECK/);
    expect(VERIFY).toMatch(/'غائب'\(10\)/);
  });
});
