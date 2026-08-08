/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0347 — بوابة الحارس
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ المنهج (درس 0344): لا نقارن الدالة بنفسها. الأعطال هنا تعارضٌ
 *   بين ما تكتبه الشيفرة وما يُصرّح به المخطط — فالحارس مقارنة
 *   مصدرين مستقلّين.
 *
 *   السلوك مُختبَر على Postgres في `tools/dev/verify-kiosk-punch-0347.sql`
 *   (90 تأكيداً) وعبر RLS في `-rls.sh`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG     = read('supabase/migrations/0347_kiosk_punch_and_summary.sql');
const SCHEMA  = read('supabase/migrations/0002_employee_features.sql');
const SERVICE = read('src/services/sdk/KioskService.ts');
const PAGE    = read('src/pages/hr/KioskPage.tsx');
const SHIFTCFG = read('src/utils/shiftConfig.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs', () => {
    expect(codeTs('/* check_in */ const x=1;')).not.toMatch(/check_in/);
    expect(codeTs("const y='check_in';")).toMatch(/check_in/);
  });
  it('stmtSql', () => {
    expect(stmtSql("COMMENT ON X IS 'length % 2 خطأ';")).not.toMatch(/length/);
    expect(stmtSql('SELECT a.punch_type FROM x;')).toMatch(/punch_type/);
  });
});

const MIG_CODE  = codeSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

const fnBody = (name: string): string => {
  const i = MIG.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة`).toBeGreaterThan(-1);
  const e = MIG.indexOf(`COMMENT ON FUNCTION public.${name}`, i);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(i);
  return MIG.slice(i, e);
};

// ═══════════════════════════════════════════════════════════════════
describe('0347 — العطل ①: كل بصمة تُسجَّل «دخولاً»', () => {
  it('★★★ العمود DEFAULT check-in — فالإغفال يعني «دخول»', () => {
    const m = SCHEMA.match(/punch_type TEXT NOT NULL DEFAULT '([^']+)'/);
    expect(m, 'تعريف punch_type غير موجود').toBeTruthy();
    expect(m![1]).toBe('check-in');
  });

  it('★★★ الصفحة لم تعد تكتب البصمة مباشرة', () => {
    expect(PAGE_CODE).not.toMatch(/attendanceService\.create/);
    expect(PAGE_CODE).toMatch(/kioskService\.punch\(/);
  });

  it('★★★ والمايجريشن يمرّر punch_type و shift_type صراحةً', () => {
    const b = fnBody('kiosk_punch');
    expect(b).toMatch(/\(tenant_id, employee_id, punch_time, punch_type, shift_type,/);
    expect(b).toMatch(/v_type, v_shift,/);
  });

  it('★★ والقيم بشرطة لا شرطة سفلية', () => {
    const allowed = SCHEMA.match(/CHECK \(punch_type IN \(([^)]*)\)\)/);
    const vals = [...allowed![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(vals.sort()).toEqual(['check-in', 'check-out', 'in', 'out']);
    expect(/'check_in'|'check_out'/.test(stmtSql(MIG))).toBe(false);
    expect(/'check_in'|'check_out'/.test(PAGE_CODE)).toBe(false);
    expect(/'check_in'|'check_out'/.test(SVC_CODE)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — العطل ②: الملخّص لم يكن يُكتب من البصمات', () => {
  it('★★★ محفّز على attendance_logs موجود الآن', () => {
    expect(MIG).toMatch(/CREATE TRIGGER trg_refresh_attendance_summary/);
    expect(MIG).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.attendance_logs/);
  });

  it('★★★ ودالة refresh_attendance_summary مُعرَّفة فعلاً', () => {
    expect(MIG).toMatch(/CREATE FUNCTION public\.refresh_attendance_summary/);
  });

  it('★★ وهي DEFINER (سياسة INSERT تشترط staff)', () => {
    expect(fnBody('refresh_attendance_summary')).toMatch(/SECURITY DEFINER/);
  });

  it('★★★ ولا تمسّ قرار الإجازة الإداريّ', () => {
    const b = fnBody('refresh_attendance_summary');
    expect(b).toMatch(/IN \('مجاز','إجازة_انتظار','عطلة'\)/);
    expect(b).toMatch(/IF COALESCE\(v_locked, FALSE\) THEN RETURN; END IF;/);
  });

  it('★★★ والإحصائيات لم تعد تقرأ الملخّص وحده', () => {
    const b = fnBody('kiosk_stats');
    expect(b).toMatch(/FROM public\.kiosk_board\(NULL, 1000\)/);
    // الإجازة وحدها من الملخّص — وهو مصدرها الشرعيّ
    expect(b).toMatch(/a\.status IN \('مجاز','إجازة_انتظار','عطلة'\)/);
  });

  it('★★ والصفحة تمرّ عبر kioskService.stats', () => {
    expect(PAGE_CODE).toMatch(/kioskService\.stats\(\)/);
    expect(PAGE_CODE).not.toMatch(/attendanceSummaryService/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — العطل ③: النوع من العدّ لا من آخر بصمة', () => {
  it('★★★ الصفحة لم تعد تستنتج النوع بالتناوب', () => {
    expect(PAGE_CODE).not.toMatch(/length % 2/);
    expect(PAGE_CODE).not.toMatch(/getLastAction/);
  });

  it('★★★ والقاعدة تقرأ نوع آخر بصمة', () => {
    const b = fnBody('kiosk_punch');
    expect(b).toMatch(/ORDER BY l\.punch_time DESC/);
    expect(b).toMatch(/WHEN v_lastty IN \('in','check-in'\)\s+THEN 'check-out'/);
  });

  it('★★★ واللوحة كذلك', () => {
    const b = fnBody('kiosk_board');
    expect(b).toMatch(/WHEN p\.last_type IN \('in','check-in'\) THEN 'check-out'/);
    expect(b).not.toMatch(/p\.n % 2 = 0\s+THEN 'check-in'/);
  });

  it('★★★ والحالة تتبع آخر بصمة لا وجود بصمة خروج', () => {
    // ★ عطل اكتشفه الاختبار: من خرج ثم عاد كان يظهر «منصرف»
    const b = fnBody('kiosk_board');
    expect(b).toMatch(/WHEN p\.last_type IN \('out','check-out'\)\s+THEN 'منصرف'/);
  });

  it('★★ ونافذة ارتداد 60 ثانية', () => {
    const b = fnBody('kiosk_punch');
    expect(b).toMatch(/< INTERVAL '60 seconds'/);
    expect(b).toMatch(/v_n, TRUE;/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — العطل ④: لامبدا مشوّهة', () => {
  it('★★★ لا معامل باسم نوع', () => {
    expect(PAGE_CODE).not.toMatch(/\(s: any\s*,\s*EmployeeStatus\)/);
  });
  it('★ ولا as any', () => {
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — الوردية والمنطقة الزمنية', () => {
  const b = fnBody('shift_for_punch');

  /**
   * ★★★ النوافذ تُشتقّ من `shiftConfig.ts` — مصدر مستقلّ.
   */
  it('★★★ النوافذ تطابق DEFAULT_SHIFT_WINDOWS', () => {
    const m = SHIFTCFG.match(/DEFAULT_SHIFT_WINDOWS: ShiftWindows = \{([\s\S]*?)\};/);
    expect(m, 'DEFAULT_SHIFT_WINDOWS غير موجودة').toBeTruthy();
    expect(m![1]).toMatch(/صباحي: \{ from: '06:00'/);
    expect(m![1]).toMatch(/مسائي: \{ from: '14:00'/);
    expect(m![1]).toMatch(/ليلي: \{ from: '22:00'/);
    // والمايجريشن يستعمل الحدود نفسها
    expect(b).toMatch(/h >= 22 OR h < 6/);
    expect(b).toMatch(/h < 14/);
  });

  it('★★★★ الساعة بتوقيت بغداد لا بمنطقة الخادم', () => {
    // عطل اكتشفه الاختبار: الخادم على UTC ⇒ 07:00+03 تُقرأ 04:00 «ليلي»
    expect(b).toMatch(/p_at AT TIME ZONE 'Asia\/Baghdad'/);
    expect(b).not.toMatch(/EXTRACT\(HOUR FROM p_at\)\)::INT/);
  });

  it('★★★ وبداية الوردية في حساب التأخير كذلك', () => {
    const r = fnBody('refresh_attendance_summary');
    expect(r).toMatch(/END\) AT TIME ZONE 'Asia\/Baghdad'\)/);
  });

  it('★★ الليلي يُختبَر أولاً (نافذة تعبر منتصف الليل)', () => {
    const night = b.indexOf("THEN 'ليلي'");
    const morning = b.indexOf("THEN 'صباحي'");
    expect(night).toBeLessThan(morning);
  });

  it('★ IMMUTABLE', () => {
    expect(b).toMatch(/LANGUAGE sql\s+IMMUTABLE/);
  });

  it('★★ وفترة السماح 15 دقيقة من shiftConfig', () => {
    expect(SHIFTCFG).toMatch(/gracePeriodMinutes: 15/);
    expect(fnBody('refresh_attendance_summary')).toMatch(/- 15,/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — الملخّص المحسوب', () => {
  const b = fnBody('refresh_attendance_summary');

  it('★★★ الخروج من آخر بصمة **إن تعدّدت** فقط', () => {
    expect(b).toMatch(/IF v_out IS NULL AND v_count > 1 THEN v_out := v_last; END IF;/);
  });

  it('★★★ والساعات صفر لمن لم ينصرف', () => {
    expect(b).toMatch(/WHEN v_out IS NULL THEN 0/);
    expect(b).not.toMatch(/COALESCE\(v_out, NOW\(\)\)/);
  });

  it('★★ والحالة من المفردات الثماني (0344)', () => {
    expect(b).toMatch(/v_status := CASE WHEN v_late > 0 THEN 'متأخر' ELSE 'حضور_بوقت' END;/);
  });

  it('★★ والقيد الثلاثيّ في ON CONFLICT', () => {
    expect(b).toMatch(/ON CONFLICT \(tenant_id, employee_id, shift_date\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — اللوحة والصفحة', () => {
  const b = fnBody('kiosk_board');

  it('★★ الاسم بأولوية (درس 0346)', () => {
    expect(b).toMatch(/NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/NULLIF\(btrim\(pr\.full_name\), ''\)/);
  });

  it('★★ is_active لا status (درس 0345)', () => {
    expect(b).toMatch(/AND e\.is_active/);
    expect(b).not.toMatch(/e\.status/);
  });

  it('★★ مقيّدة بالمستأجر واليوم', () => {
    expect(b).toMatch(/l\.tenant_id = v_tenant AND l\.shift_date = v_day/);
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
  });

  it('★★★ والصفحة تعرض الوردية (كانت «—» أبداً)', () => {
    expect(PAGE_CODE).toMatch(/emp\.shiftType/);
  });

  it('★★★ وبطاقة «المنصرفون» أُضيفت', () => {
    expect(PAGE_CODE).toMatch(/stats\.left/);
    expect(PAGE_CODE).toMatch(/stats\.present/);
    expect(PAGE_CODE).toMatch(/stats\.absent/);
    expect(PAGE_CODE).toMatch(/stats\.onLeave/);
  });

  it('★ لا confirm/alert/prompt · ولا لمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/(?<![.\w])(confirm|alert|prompt)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/\.from\('[a-z_]+'\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('0347 — الأمان', () => {
  it('★★★ kiosk_punch DEFINER وتفحص الدور', () => {
    const b = fnBody('kiosk_punch');
    expect(b).toMatch(/SECURITY DEFINER/);
    expect(b).toMatch(/RAISE EXCEPTION 'غير مصرَّح بتسجيل البصمات/);
    expect(b).toMatch(/e\.tenant_id = v_tenant AND e\.is_active/);
  });

  it('★★★ والقارئتان INVOKER — RLS هو الحارس', () => {
    expect(fnBody('kiosk_board')).toMatch(/SECURITY INVOKER/);
    expect(fnBody('kiosk_stats')).toMatch(/SECURITY INVOKER/);
  });

  it.each([
    'kiosk_punch(UUID,TEXT,TEXT)',
    'kiosk_board(TEXT,INTEGER)',
    'kiosk_stats()',
    'refresh_attendance_summary(UUID,DATE)',
  ])('★★ anon محروم من %s', (sig) => {
    expect(MIG).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon;`);
  });

  it('★★ search_path مثبَّت على الخمس', () => {
    expect((MIG_CODE.match(/SET search_path = public/g) || []).length).toBe(5);
  });

  it('★★ والخدمة ترمي عند فشل البصمة لا تبتلعه', () => {
    expect(SVC_CODE).toMatch(/throw SdkError\.fromSupabaseError\(error\)/);
    // ★ الابتلاع الصامت كان في الصفحة القديمة (catch يتجاهل duplicate)
    expect(PAGE_CODE).not.toMatch(/insertErr\.message\?\.includes\('duplicate'\)/);
  });
});
