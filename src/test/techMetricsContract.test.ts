/**
 * ════════════════════════════════════════════════════════════════
 *  techMetricsContract.test.ts
 *
 *  عقد قياسات بوابة التقنية الحقيقية (migration 0327).
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في
 *    tools/dev/verify-tech-metrics-0327.sql (35 تأكيداً على Postgres
 *    محلي). هذه الاختبارات تمنع **الانحدار** بالحذف السهو.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0327 = read('supabase/migrations/0327_tech_portal_real_metrics.sql');
const VERIFY = read('tools/dev/verify-tech-metrics-0327.sql');
const SVC = read('src/services/sdk/TechMetricsService.ts');
const ATT = read('src/services/sdk/AttendanceService.ts');
const DASH = read('src/pages/techportal/pages/TechDashboard.tsx');
const BIO = read('src/pages/techportal/pages/BiometricDevicesPage.tsx');
const SDK_INDEX = read('src/services/sdk/index.ts');

/** يُجرّد التعليقات — الفحص على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0327 — التوزيع الساعي الحقيقي', () => {
  const body = (() => {
    const s = M0327.indexOf('CREATE FUNCTION public.attendance_punches_hourly');
    const e = M0327.indexOf('COMMENT ON FUNCTION public.attendance_punches_hourly');
    return M0327.slice(s, e);
  })();

  it('★ يجمّع من punch_time الحقيقي لا من متوسط', () => {
    expect(body).toMatch(/date_trunc\('hour', a\.punch_time\)/);
    expect(body).toMatch(/FROM public\.attendance_logs a/);
  });

  it('★ الساعات الصفرية محفوظة (حذفها يزيح الرسم)', () => {
    expect(body).toMatch(/generate_series/);
    expect(body).toMatch(/LEFT JOIN punches/);
    expect(body).toMatch(/COALESCE\(p\.n_all, 0\)/);
  });

  it('يفرّق بين الدخول والخروج', () => {
    expect(body).toMatch(/FILTER \(WHERE a\.punch_type = 'in'\)/);
    expect(body).toMatch(/FILTER \(WHERE a\.punch_type = 'out'\)/);
  });

  it('★ النافذة مقصوصة بحدّين (لا استعلام مفتوح)', () => {
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_hours, 12\), 168\)\)/);
  });

  it('يحترم عزل المستأجر', () => {
    expect(body).toMatch(/a\.tenant_id = v_tenant/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN/);
  });

  it('مرتّب زمنياً', () => {
    expect(body).toMatch(/ORDER BY bk\.b/);
  });
});

describe('0327 — العدّ في القاعدة', () => {
  it('★ attendance_punch_count يعدّ بـcount(*) لا بجلب الصفوف', () => {
    const s = M0327.indexOf('CREATE FUNCTION public.attendance_punch_count');
    const e = M0327.indexOf('COMMENT ON FUNCTION public.attendance_punch_count');
    const body = M0327.slice(s, e);
    expect(body).toMatch(/count\(\*\)::INTEGER/);
    expect(body).toMatch(/GREATEST\(1, LEAST\(COALESCE\(p_hours, 12\), 168\)\)/);
  });
});

describe('0327 — تعطيل الجهاز بدل حذفه', () => {
  const body = (() => {
    const s = M0327.indexOf('CREATE FUNCTION public.deactivate_biometric_device');
    const e = M0327.indexOf('COMMENT ON FUNCTION public.deactivate_biometric_device');
    return M0327.slice(s, e);
  })();

  it('VOLATILE — الكتابة مستحيلة في STABLE (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });

  it('★ يُحدّث is_active ولا يحذف', () => {
    expect(body).toMatch(/SET is_active = p_active/);
    expect(codeOnly(body)).not.toMatch(/DELETE FROM/);
  });

  it('محصور بأدوار بوابة التقنية', () => {
    expect(body).toMatch(/'admin','it_admin','developer'/);
    expect(body).toMatch(/NOT_AUTHORIZED/);
  });

  it('يحترم المستأجر ويرفض الجهاز غير الموجود', () => {
    expect(body).toMatch(/tenant_id = v_tenant/);
    expect(body).toMatch(/DEVICE_NOT_FOUND/);
  });

  it('الاستدعاء المكرّر آمن', () => {
    expect(body).toMatch(/already_active/);
    expect(body).toMatch(/already_inactive/);
  });
});

describe('0327 — صحّة الأجهزة', () => {
  const body = (() => {
    const s = M0327.indexOf('CREATE FUNCTION public.biometric_devices_health');
    const e = M0327.indexOf('COMMENT ON FUNCTION public.biometric_devices_health');
    return M0327.slice(s, e);
  })();

  it('★ التأخّر مقيس مقابل sync_interval_minutes لا رقم ثابت', () => {
    expect(body).toMatch(/COALESCE\(d\.sync_interval_minutes, 5\) \* 2/);
  });

  it('★ الجهاز المعطَّل لا يُعدّ متأخّراً (لا ضجيج دائم)', () => {
    expect(body).toMatch(/WHEN NOT COALESCE\(d\.is_active, FALSE\) THEN FALSE/);
  });

  it('★ «لم يزامن قطّ» يُعيد NULL لا صفراً', () => {
    expect(body).toMatch(/WHEN d\.last_sync_at IS NULL THEN NULL/);
  });

  it('يعدّ بصمات اليوم للجهاز', () => {
    expect(body).toMatch(/a\.device_id = d\.id::TEXT/);
    expect(body).toMatch(/date_trunc\('day', NOW\(\)\)/);
  });
});

describe('0327 — الصلاحيات', () => {
  it.each([
    'attendance_punches_hourly(INTEGER)',
    'attendance_punch_count(INTEGER)',
    'deactivate_biometric_device(UUID, BOOLEAN)',
    'biometric_devices_health()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0327).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0327).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('كل الدوال SECURITY DEFINER مع search_path مثبَّت', () => {
    const definers = M0327.match(/SECURITY DEFINER/g) ?? [];
    const paths = M0327.match(/SET search_path = public/g) ?? [];
    expect(definers.length).toBe(4);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });
});

describe('0327 — طبقة SDK', () => {
  it('TechMetricsService يمرّ عبر RPC لا Supabase مباشرة', () => {
    expect(SVC).toMatch(/rpc\('deactivate_biometric_device'/);
    expect(SVC).toMatch(/rpc\('biometric_devices_health'/);
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });

  it('تغيير حالة الجهاز لا يُبتلع صامتاً', () => {
    const s = SVC.indexOf('async setDeviceActive');
    expect(SVC.slice(s, s + 500)).toMatch(/throw new Error\(error\.message\)/);
  });

  it('★ AttendanceService.punchesHourly يستدعي الدالة الحقيقية', () => {
    expect(ATT).toMatch(/rpc\('attendance_punches_hourly'/);
    expect(ATT).toMatch(/HourlyPunchBucket/);
  });

  it('★ countPunchesSince يعدّ في القاعدة لا بجلب 1000 صفّ', () => {
    const code = codeOnly(ATT);
    const s = code.indexOf('async countPunchesSince');
    const body = code.slice(s, s + 600);
    expect(body).toMatch(/rpc\('attendance_punch_count'/);
    expect(body).not.toMatch(/limit:\s*1000/);
    expect(body).not.toMatch(/rows\.length/);
  });

  it('مُسجَّل في فهرس SDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ techMetricsService \} from '\.\/TechMetricsService'/);
  });
});

describe('0327 — الصفحات', () => {
  it('★ TechDashboard بلا Math.random تنفيذي', () => {
    expect(codeOnly(DASH)).not.toMatch(/Math\.random/);
  });

  it('★ يستعمل التوزيع الحقيقي', () => {
    const code = codeOnly(DASH);
    expect(code).toMatch(/attendanceService\.punchesHourly\(/);
    expect(code).not.toMatch(/punchBuckets\[i\]\s*=/);
  });

  it('★ BiometricDevicesPage بلا confirm() ولا حذف نهائي', () => {
    const code = codeOnly(BIO);
    expect(code).not.toMatch(/(?<![.\w])confirm\s*\(/);
    expect(code).not.toMatch(/deleteDevice\(/);
  });

  it('يستعمل التعطيل عبر الخدمة ونافذة تأكيد', () => {
    const code = codeOnly(BIO);
    expect(code).toMatch(/techMetricsService\.setDeviceActive/);
    expect(code).toMatch(/deactivating/);
  });
});

describe('0327 — سياسة المنصة في بوابة التقنية', () => {
  const pages = readdirSync(resolve(root, 'src/pages/techportal/pages'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `src/pages/techportal/pages/${f}`);

  it('★ صفر confirm()/alert()/prompt() تنفيذي', () => {
    const bad: string[] = [];
    for (const p of pages) {
      if (/(?<![.\w])(confirm|alert|prompt)\s*\(/.test(codeOnly(read(p)))) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('★ صفر محاكاة في لوحات القياس', () => {
    const bad: string[] = [];
    for (const p of pages) {
      // TechSettingsPage يستعمل Math.random لتوليد مفاتيح واجهة فقط
      if (p.includes('TechSettingsPage')) continue;
      if (/Math\.random/.test(codeOnly(read(p)))) bad.push(p);
    }
    expect(bad).toEqual([]);
  });

  it('★ صفر حذف نهائي تنفيذي', () => {
    const bad: string[] = [];
    for (const p of pages) {
      if (/\.delete\(\)|deleteDevice\(/.test(codeOnly(read(p)))) bad.push(p);
    }
    expect(bad).toEqual([]);
  });
});

describe('0327 — الاختبار السلوكي نفسه', () => {
  it('يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0327: %\/35 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص أن الذروة لا تُسطَّح', () => {
    expect(VERIFY).toMatch(/الذروة = %s \(متوقَّع 20\)/);
    expect(VERIFY).toMatch(/التسطيح يُخفي الازدحام/);
  });

  it('★ يفحص المدخلات الشاذّة للنافذة', () => {
    expect(VERIFY).toMatch(/attendance_punches_hourly\(0\)/);
    expect(VERIFY).toMatch(/attendance_punches_hourly\(-5\)/);
    expect(VERIFY).toMatch(/attendance_punches_hourly\(100000\)/);
  });

  it('★ يفحص أن مجموع الرسم يطابق العدّ المستقل', () => {
    expect(VERIFY).toMatch(/مجموع الرسم=%s ≠ العدّ=%s/);
  });

  it('★ يفحص العزل بين المستأجرين في لوحة الأجهزة', () => {
    expect(VERIFY).toMatch(/لوحة الأجهزة تسرّب/);
    expect(VERIFY).toMatch(/ظهر جهاز شركة أخرى/);
  });

  it('يوثّق ملاحظات الأعمدة المُحقَّقة', () => {
    expect(VERIFY).toMatch(/shift_date NOT NULL/);
    expect(VERIFY).toMatch(/قيد فريد/);
  });
});
