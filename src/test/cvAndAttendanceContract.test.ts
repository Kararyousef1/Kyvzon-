/**
 * ════════════════════════════════════════════════════════════════
 *  cvAndAttendanceContract.test.ts
 *
 *  عقد إصلاح عطلَي المتصفح (migration 0333).
 *
 *  ★ هذان أول عطلين يُبلَّغان من **المتصفح** في هذا المشروع — كل ما
 *    سبقهما كان منطق قاعدة وفحصاً ثابتاً. نصّهما الحرفي من وحدة
 *    التحكّم:
 *
 *      [42703] column profiles.cv_data does not exist
 *      BaseService.findAll failed: attendance_logs
 *        error: invalid input syntax for type uuid: ""
 *
 *  الإثبات السلوكي في:
 *      tools/dev/verify-cv-and-attendance-0333.sql   52 تأكيداً
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0333_profiles_cv_data_and_attendance_scope.sql');
const VERIFY = read('tools/dev/verify-cv-and-attendance-0333.sql');
const ATT_SVC = read('src/services/sdk/AttendanceService.ts');
const USER_SVC = read('src/services/sdk/UserService.ts');
const ANALYTICS = read('src/pages/techportal/pages/AttendanceAnalytics.tsx');
const TALENT = read('src/pages/hr/TalentMarketPage.tsx');
const SDK_INDEX = read('src/services/sdk/index.ts');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0333 — العطل ①: profiles.cv_data', () => {
  it('★★ العمود يُضاف', () => {
    expect(M).toMatch(/ALTER TABLE public\.profiles\s*\n\s*ADD COLUMN IF NOT EXISTS cv_data JSONB/);
  });

  it('★★ NOT NULL DEFAULT {} — لأن الواجهة تستدعي Object.keys() عليه', () => {
    expect(M).toMatch(/cv_data JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('★ فهرس GIN للبحث داخل المهارات', () => {
    expect(M).toContain('CREATE INDEX IF NOT EXISTS idx_profiles_cv_data_gin');
    expect(M).toMatch(/USING GIN \(cv_data jsonb_path_ops\)/);
  });

  it('★ فهرس «من لديه سيرة» جزئي', () => {
    const i = M.indexOf('idx_profiles_has_cv');
    expect(i).toBeGreaterThan(-1);
    expect(M.slice(i, i + 200)).toMatch(/WHERE cv_data <> '\{\}'::jsonb/);
  });

  it('قابل لإعادة التشغيل', () => {
    expect(M).toContain('ADD COLUMN IF NOT EXISTS');
    expect((M.match(/CREATE INDEX IF NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('0333 — العطل ②: نطاق سجلّات الحضور', () => {
  it('★★ حارس المعرّف الفارغ في الخدمة', () => {
    const i = ATT_SVC.indexOf('async findLogsByEmployee');
    const body = ATT_SVC.slice(i, i + 900);
    expect(body).toMatch(/if \(!employeeId \|\| employeeId\.trim\(\) === ''\)/);
    expect(body).toMatch(/return \[\];/);
  });

  it('★★ الصفحة لم تعد تمرّر معرّفاً فارغاً', () => {
    expect(codeOnly(ANALYTICS)).not.toMatch(/findLogsByEmployee\(\s*''/);
  });

  it('★ الصفحة تستعمل دوال القاعدة الثلاث بدلاً منه', () => {
    expect(ANALYTICS).toContain('attendanceService.todayByHour()');
    expect(ANALYTICS).toContain('attendanceService.todayShiftSplit()');
    expect(ANALYTICS).toContain('attendanceService.last7Days()');
  });

  it('★ التجميع في القاعدة لا في المتصفح (لا جلب 1000 صفّ)', () => {
    expect(codeOnly(ANALYTICS)).not.toMatch(/limit:\s*1000/);
  });
});

describe('0333 — دوال الحضور', () => {
  function fnBody(name: string): string {
    const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
    const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
    expect(s).toBeGreaterThan(-1);
    expect(e).toBeGreaterThan(s);
    return M.slice(s, e);
  }

  it.each([
    'attendance_today_by_hour',
    'attendance_today_shift_split',
    'attendance_last_7_days',
    'hr_talent_profiles',
  ])('%s — SECURITY INVOKER ومقيّدة بالمستأجر', (fn) => {
    const body = fnBody(fn);
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/v_tenant UUID := public\.current_user_tenant_id\(\)/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN; END IF;/);
  });

  it('★★ التوزيع الساعي يُرجع 24 صفاً — LEFT JOIN لا JOIN', () => {
    const body = fnBody('attendance_today_by_hour');
    expect(body).toMatch(/generate_series\(0, 23\)/);
    expect(body).toMatch(/LEFT JOIN punches/);
    // درس 0327: حذف الساعات الصفرية يُزيح الرسم
    expect(body).not.toMatch(/\n\s+JOIN punches/);
  });

  it('★ يميّز الدخول من الخروج', () => {
    const body = fnBody('attendance_today_by_hour');
    expect(body).toMatch(/FILTER \(WHERE punches\.punch_type = 'in'\)/);
    expect(body).toMatch(/FILTER \(WHERE punches\.punch_type = 'out'\)/);
  });

  it('★ الورديات الثلاث كلها تظهر ولو فارغة', () => {
    const body = fnBody('attendance_today_shift_split');
    expect(body).toMatch(/VALUES \('morning'/);
    expect(body).toMatch(/LEFT JOIN classified/);
  });

  it('★★ present = موظفون متمايزون لا بصمات', () => {
    const body = fnBody('attendance_last_7_days');
    expect(body).toMatch(/count\(DISTINCT punches\.employee_id\)/);
  });

  it('★ سبعة أيام مبنيّة من generate_series (الإقصاء بنيوي)', () => {
    const body = fnBody('attendance_last_7_days');
    expect(body).toMatch(/generate_series\(6, 0, -1\)/);
    expect(body).toMatch(/LEFT JOIN punches/);
  });

  /**
   * ★ صدق مُوثَّق: شرط النافذة في WHERE لا يغيّر النتيجة — أُثبت
   *   بتوسيعه إلى 9999 يوماً فكان المخرَج مطابقاً. المايجريشن يوثّق
   *   ذلك صراحةً بدل ادّعاء حراسة غير قائمة.
   */
  it('★ المايجريشن يوثّق أن شرط النافذة للأداء لا للصحّة', () => {
    expect(M).toMatch(/لا يغيّران النتيجة/);
    expect(M).toMatch(/9999 يوماً/);
  });
});

describe('0333 — سجل المؤهلات', () => {
  it('★★ الصفحة لم تعد تلمس Supabase مباشرة', () => {
    expect(codeOnly(TALENT)).not.toMatch(/supabase\s*\n?\s*\.from\(/);
    expect(codeOnly(TALENT)).not.toMatch(/from '.*services\/supabase\/supabase'/);
  });

  it('★ تمرّ عبر SDK', () => {
    expect(TALENT).toContain('userService.talentProfiles(');
  });

  it('الخدمة تستدعي RPC', () => {
    expect(USER_SVC).toContain("rpc('hr_talent_profiles'");
  });

  it('★ hasCv وskillCount محسوبان في القاعدة', () => {
    const s = M.indexOf('CREATE FUNCTION public.hr_talent_profiles');
    const body = M.slice(s, M.indexOf('COMMENT ON FUNCTION public.hr_talent_profiles'));
    expect(body).toMatch(/out_has_cv\s+BOOLEAN/);
    expect(body).toMatch(/out_skill_count\s+INTEGER/);
    expect(body).toMatch(/jsonb_array_length/);
  });

  it('★★ البحث بالمهارة داخل مصفوفة JSONB', () => {
    const s = M.indexOf('CREATE FUNCTION public.hr_talent_profiles');
    const body = M.slice(s, M.indexOf('COMMENT ON FUNCTION public.hr_talent_profiles'));
    expect(body).toMatch(/jsonb_array_elements_text/);
    expect(body).toMatch(/ILIKE '%' \|\| p_skill \|\| '%'/);
  });

  it('★ jsonb_typeof يحرس من سيرة بشكل خاطئ', () => {
    const s = M.indexOf('CREATE FUNCTION public.hr_talent_profiles');
    const body = M.slice(s, M.indexOf('COMMENT ON FUNCTION public.hr_talent_profiles'));
    expect(body).toMatch(/jsonb_typeof\(p\.cv_data -> 'skills'\) = 'array'/);
  });

  it('النوع مُصدَّر من فهرس SDK', () => {
    expect(SDK_INDEX).toContain('TalentProfileRecord');
  });
});

describe('0333 — الصلاحيات', () => {
  it.each([
    'attendance_today_by_hour()',
    'attendance_today_shift_split()',
    'attendance_last_7_days()',
    'hr_talent_profiles(TEXT,INTEGER,INTEGER)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★ DROP قبل CREATE (درس 0320)', () => {
    for (const fn of ['attendance_today_by_hour', 'attendance_today_shift_split',
                      'attendance_last_7_days', 'hr_talent_profiles']) {
      const d = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}`);
      const c = M.indexOf(`CREATE FUNCTION public.${fn}`);
      expect(d, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(d, `${fn}: DROP بعد CREATE`).toBeLessThan(c);
    }
  });
});

describe('0333 — الاختبار السلوكي', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-cv-and-attendance-0333.sql'))).toBe(true);
  });

  it('★ يوثّق نصّ الخطأ الحرفي من المتصفح', () => {
    expect(M).toContain('column profiles.cv_data does not exist');
    expect(M).toContain('invalid input syntax for type uuid');
  });

  it('★★ يفحص عزل المستأجر في الاتجاهين', () => {
    expect(VERIFY).toMatch(/تسريب: ملف من شركة أخرى/);
    expect(VERIFY).toMatch(/تسريب معاكس/);
  });

  it('★ يفحص أن البحث فعّال لا صوري', () => {
    expect(VERIFY).toMatch(/مهارة غير موجودة/);
  });

  it('★ يوثّق التصحيح الذاتي لتأكيد النافذة', () => {
    expect(VERIFY).toMatch(/تصحيح ذاتي مُوثَّق/);
  });
});
