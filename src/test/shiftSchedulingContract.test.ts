/**
 * ════════════════════════════════════════════════════════════════
 *  shiftSchedulingContract.test.ts — عقد جدولة الورديات (0368)
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-shift-scheduling-0368.sql` (47 تأكيداً)
 *      و`-rls.sh` (31 تأكيداً بدور `authenticated` حقيقيّ)
 *      و`_invert_0368.py` (55/55 عكساً).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0368_shift_scheduling_integrity.sql');
const SDK = read('src/services/sdk/ShiftScheduleService.ts');
const PAGE = read('src/pages/hr/ShiftSchedulingPage.tsx');
const INDEX = read('src/services/sdk/index.ts');

const migBody = MIG.replace(/^\s*--.*$/gm, '');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageBody = strip(PAGE);
const sdkBody = strip(SDK);

/** ★ النهاية `$$;` لا `\n$$;` (درس 0365) */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`, 'm',
  );
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  const body = (m as RegExpMatchArray)[0];
  expect(body.length, `جسم ${name} قصيرٌ مريب (${body.length})`).toBeGreaterThan(200);
  return body;
}

describe('0368 — ★★★★ العطل ①: schedule_id كان يكسر كل إدراج', () => {
  it('★★★★ العمود اكتسب افتراضيّاً', () => {
    expect(migBody).toMatch(
      /ALTER COLUMN schedule_id SET DEFAULT gen_random_uuid\(\)/,
    );
  });

  it('★★★★ shift_assign تملأ schedule_id صراحةً', () => {
    expect(fnBody('shift_assign')).toMatch(
      /COALESCE\(p_batch, gen_random_uuid\(\)\)/,
    );
  });

  it('★ العمود موثَّقٌ بسبب وجوده', () => {
    expect(MIG).toMatch(/COMMENT ON COLUMN public\.shift_assignments\.schedule_id/);
  });
});

describe('0368 — ★★★★ العطل ②: المفردات من structure_shifts', () => {
  it('★★★★ CHECK بالأكواد الأربعة لا بأسماء الواجهة', () => {
    expect(migBody).toMatch(
      /chk_shift_type_vocab[\s\S]{0,200}?'morning','evening','night','flexible'/,
    );
    // ★★★ الحارس: مفردات الصفحة القديمة ليست في القيد
    const chk = migBody.match(/chk_shift_type_vocab[\s\S]{0,300}?END \$\$;/);
    expect(chk).toBeTruthy();
    for (const bad of ['صباحي', 'مسائي', 'ليلي']) {
      expect((chk as RegExpMatchArray)[0], `مفردة الواجهة ${bad} عادت`)
        .not.toContain(bad);
    }
  });

  it('★★★★ اللوح يقرأ الاسم والأوقات من structure_shifts', () => {
    const b = fnBody('shift_week_board');
    expect(b).toMatch(/LEFT JOIN public\.structure_shifts s/);
    expect(b).toMatch(/COALESCE\(NULLIF\(btrim\(s\.name_ar\), ''\), a\.shift_type\)/);
    expect(b).toMatch(/to_char\(s\.start_time, 'HH24:MI'\)/);
    // ★ درس no-regex-spaces (0364): مسافاتٌ متتالية في regex ⇒ {n}
    expect(b).toMatch(/to_char\(s\.end_time, {3}'HH24:MI'\)/);
  });

  it('★★★ الانضمام يُرشّح بالمستأجر (قوالبٌ عامّةٌ أو خاصّة)', () => {
    expect(fnBody('shift_week_board')).toMatch(
      /AND \(s\.tenant_id IS NULL OR s\.tenant_id = a\.tenant_id\)/,
    );
  });

  it('★★ التنظيف يُحوّل الأسماء القديمة إلى الأكواد', () => {
    expect(migBody).toMatch(/SET shift_type = 'morning'[\s\S]{0,120}?'صباحي'/);
    expect(migBody).toMatch(/SET shift_type = 'evening'[\s\S]{0,120}?'مسائي'/);
    expect(migBody).toMatch(/SET shift_type = 'night'[\s\S]{0,120}?'ليلي'/);
  });
});

describe('0368 — المفاتيح والقيود', () => {
  it('★★★ FK **مركَّب** على الموظف لا مفرد', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(employee_id, tenant_id\)\s*\n?\s*REFERENCES public\.employees \(id, tenant_id\)/,
    );
    expect(migBody, 'FK مفرد عاد').not.toMatch(
      /FOREIGN KEY \(employee_id\)\s*\n?\s*REFERENCES public\.employees \(id\)/,
    );
  });

  it('★★ FK المُسنِد يشير إلى profiles', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(assigned_by, tenant_id\)\s*\n?\s*REFERENCES public\.profiles \(id, tenant_id\)/,
    );
  });

  it('★★★ tenant_id NOT NULL', () => {
    expect(migBody).toMatch(/ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it('★★★ القيود الثلاثة قائمة', () => {
    for (const c of ['chk_shift_type_vocab', 'chk_shift_status',
                     'chk_shift_cancelled_complete']) {
      expect(migBody, c + ' غائب').toContain(c);
    }
  });

  it('★★ أعمدة دورة الحياة أُضيفت', () => {
    for (const c of ['status', 'cancelled_at', 'cancelled_by', 'cancel_reason']) {
      expect(migBody, c + ' غائب').toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\b`),
      );
    }
  });
});

describe('0368 — ★★★★ المحفّز', () => {
  it('★★★★ العطل ⑨: حارس الإجازة المعتمدة', () => {
    const b = fnBody('tg_shift_assignment_guard');
    expect(b).toMatch(/SHIFT_ON_APPROVED_LEAVE/);
    // ★★★ الشروط الثلاثة: الموظف · المستأجر · الحالة «موافق»
    expect(b).toMatch(/l\.employee_id = NEW\.employee_id/);
    expect(b).toMatch(/l\.tenant_id {3}= NEW\.tenant_id/);
    expect(b).toMatch(/l\.status {6}= 'موافق'/);
  });

  it('★★★ العطل ⑩: حدُّ الراحة ثنائيُّ الاتّجاه', () => {
    const b = fnBody('tg_shift_assignment_guard');
    expect(b).toMatch(/SHIFT_NO_REST/);
    expect(b).toMatch(/v_prev = 'night' AND NEW\.shift_type = 'morning'/);
    expect(b).toMatch(/NEW\.shift_type = 'night' AND v_next = 'morning'/);
  });

  it('★★★ العطل ⑧: النافذة الزمنية — والحدود غير صارمةٍ بلا داعٍ', () => {
    const b = fnBody('tg_shift_assignment_guard');
    expect(b).toMatch(/SHIFT_DATE_TOO_OLD/);
    expect(b).toMatch(/SHIFT_DATE_TOO_FAR/);
    expect(b).toMatch(/NEW\.shift_date < v_today - 90/);
    expect(b).toMatch(/NEW\.shift_date > v_today \+ 365/);
    // ★ الحارس: <= يرفض اليوم -90 نفسه
    expect(b, 'الحدّ صار صارماً').not.toMatch(/NEW\.shift_date <= v_today - 90/);
    // ★★★ CHECK لا يصلح: CURRENT_DATE غير IMMUTABLE
    expect(migBody).not.toMatch(/CHECK\s*\([^)]*CURRENT_DATE/);
  });

  it('★★★ توقيت بغداد صريحاً — الخادم Etc/UTC', () => {
    expect(fnBody('tg_shift_assignment_guard')).toMatch(
      /AT TIME ZONE 'Asia\/Baghdad'/,
    );
  });

  it('★★ العطل ⑦: assigned_by يُملأ آلياً', () => {
    expect(fnBody('tg_shift_assignment_guard')).toMatch(
      /IF NEW\.assigned_by IS NULL THEN\s*\n\s*NEW\.assigned_by := auth\.uid\(\);/,
    );
  });

  it('★★ المحفّز يُجمّد المستأجر والموظف', () => {
    const b = fnBody('tg_shift_assignment_guard');
    expect(b).toMatch(/NEW\.tenant_id {3}:= OLD\.tenant_id/);
    expect(b).toMatch(/NEW\.employee_id := OLD\.employee_id/);
  });

  it('★★ الملغاة تُعفى من الحراسة (فتُعدَّل بلا اعتراض)', () => {
    expect(fnBody('tg_shift_assignment_guard')).toMatch(
      /IF NEW\.status = 'cancelled' THEN[\s\S]{0,120}?RETURN NEW;/,
    );
  });

  it('★★ العطل ⑪: منع الحذف النهائيّ', () => {
    expect(migBody).toMatch(/SHIFT_DELETE_BLOCKED/);
    expect(migBody).toMatch(
      /CREATE TRIGGER trg_block_shift_delete\s*\n?\s*BEFORE DELETE ON public\.shift_assignments/,
    );
  });
});

describe('0368 — الدوال الخمس', () => {
  const FNS = ['shift_week_board', 'shift_week_summary', 'shift_assign',
               'shift_cancel', 'shift_leave_conflicts'];

  it('★ الدوال الخمس مُعرَّفة ومسبوقةٌ بـDROP صريح', () => {
    for (const f of FNS) {
      expect(migBody, f + ' غائبة').toMatch(new RegExp(`CREATE FUNCTION public\\.${f}\\b`));
      expect(migBody, f + ' بلا DROP').toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\b`),
      );
    }
  });

  it('★★★ anon مُستثنى من كل دالة', () => {
    for (const f of FNS) {
      expect(migBody, f + ' بلا REVOKE عن anon').toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\b[^;]*FROM anon;`),
      );
    }
  });

  it('★★ كلُّ دالةٍ تُثبّت search_path', () => {
    for (const f of FNS) {
      expect(fnBody(f), f + ' بلا search_path').toMatch(/SET search_path TO 'public'/);
    }
  });

  it('★★★ اللوح والملخّص والكاشف SECURITY INVOKER', () => {
    for (const f of ['shift_week_board', 'shift_week_summary', 'shift_leave_conflicts']) {
      expect(fnBody(f), f + ' ليست INVOKER').toMatch(/SECURITY INVOKER/);
      expect(fnBody(f), f + ' صارت DEFINER — العزل يسقط')
        .not.toMatch(/SECURITY DEFINER/);
    }
  });

  it('★★★ حرّاس الدور في الإسناد والإلغاء', () => {
    expect(fnBody('shift_assign')).toMatch(/SHIFT_NOT_STAFF/);
    expect(fnBody('shift_cancel')).toMatch(/SHIFT_NOT_STAFF/);
    expect(fnBody('shift_cancel')).toMatch(/SHIFT_CANCEL_REASON_REQUIRED/);
  });

  it('★★★ ON CONFLICT يُحدّث ويُحيي الملغاة', () => {
    const b = fnBody('shift_assign');
    expect(b).toMatch(/ON CONFLICT \(employee_id, shift_date\) DO UPDATE/);
    expect(b).toMatch(/cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL/);
  });

  it('★★★ نافذة اللوح تحصر النتائج (لا ترشيح في المتصفّح)', () => {
    expect(fnBody('shift_week_board')).toMatch(
      /WHERE a\.shift_date >= v_from\s*\n\s*AND a\.shift_date < {2}v_from \+ v_days/,
    );
  });

  it('★★★ الاسم مُركَّب — full_name_ar فارغٌ بنيوياً', () => {
    for (const f of ['shift_week_board', 'shift_leave_conflicts']) {
      expect(fnBody(f), f + ' بلا اسمٍ مُركَّب').toMatch(
        /NULLIF\(btrim\(COALESCE\(e\.first_name,''\) \|\| ' ' \|\| COALESCE\(e\.last_name,''\)\), ''\)/,
      );
    }
  });

  it('★★★ ترتيب اللوح حتميّ', () => {
    expect(fnBody('shift_week_board')).toMatch(
      /ORDER BY a\.shift_date, e\.employee_code NULLS LAST, a\.id;/,
    );
  });

  it('★★★ عدّادات الملخّص تُسقط الملغاة', () => {
    const b = fnBody('shift_week_summary');
    expect(b).toMatch(/count\(DISTINCT shift_date\) FROM win WHERE status='scheduled'/);
    expect(b).toMatch(/count\(DISTINCT employee_id\) FROM win WHERE status='scheduled'/);
  });

  it('★★★★ عدّاد leave_conflict حيٌّ لا صفرٌ بنيويّ', () => {
    expect(fnBody('shift_week_summary')).toMatch(
      /w\.status='scheduled'[\s\S]{0,260}?l\.status {6}= 'موافق'/,
    );
  });

  it('★★ كاشف التعارضات يُسقط الملغاة', () => {
    expect(fnBody('shift_leave_conflicts')).toMatch(/WHERE a\.status = 'scheduled'/);
  });
});

describe('0368 — طبقة SDK', () => {
  it('★ مُصدَّرة من index.ts مع أنواعها', () => {
    expect(INDEX).toMatch(/shiftScheduleSdk[\s\S]{0,500}?from '\.\/ShiftScheduleService'/);
    expect(INDEX).toMatch(/ShiftRow, ShiftSummary/);
  });

  it('★★★★ أكواد SDK تطابق القيد وstructure_shifts', () => {
    const m = sdkBody.match(/SHIFT_CODES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const items = (m as RegExpMatchArray)[1].match(/'[a-z_]+'/g) ?? [];
    expect(items.length, 'الأكواد ليست أربعة').toBe(4);
    for (const it of items) {
      expect(migBody, `الكود ${it} في SDK وليس في القيد`).toContain(it);
    }
    // ★★★ ولا مفردةً عربيةً من الصفحة القديمة
    for (const bad of ['صباحي', 'مسائي', 'ليلي']) {
      expect((m as RegExpMatchArray)[1], `مفردة الواجهة ${bad} عادت`)
        .not.toContain(bad);
    }
  });

  it('★★ دوال العرض تُعيد النصّ الخامّ لا undefined', () => {
    for (const f of ['shiftCodeLabel', 'shiftStateLabel']) {
      expect(sdkBody, f + ' بلا احتياطيّ').toMatch(
        new RegExp(`${f} = \\(v: string\\): string =>[\\s\\S]{0,80}?\\?\\? v;`),
      );
    }
  });

  it('★★★ الخدمة لا تلمس الجدول مباشرةً', () => {
    expect(sdkBody).not.toMatch(/\.from\(\s*'shift_assignments'/);
    expect(sdkBody).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('★ صفر any في الخدمة', () => {
    expect(sdkBody).not.toMatch(/\bas any\b/);
    expect(sdkBody).not.toMatch(/:\s*any\b/);
    expect(sdkBody).not.toMatch(/any\[\]/);
  });
});

describe('0368 — الصفحة', () => {
  it('★★★★ العطل ①: الإسناد عبر shift_assign', () => {
    expect(pageBody).toMatch(/shiftScheduleSdk\.assign\(/);
    // ★ ولا أثرَ للخدمة القديمة التي كانت تكسر كل إدراج
    expect(pageBody, 'الخدمة القديمة عادت').not.toMatch(/shiftAssignmentService/);
    expect(pageBody).not.toMatch(/upsertAssignment/);
  });

  it('★★★★ العطل ②: الأكواد من SHIFT_CODES لا أسماءٌ مُبرمجة', () => {
    expect(pageBody).toMatch(/SHIFT_CODES\.map/);
    // ★★★ لا مفردةً عربيةً مُبرمجةً في نصّ الصفحة
    expect(pageBody, "'صباحي' عادت مُبرمجة").not.toMatch(/'صباحي'/);
    expect(pageBody, "'مسائي' عادت مُبرمجة").not.toMatch(/'مسائي'/);
    expect(pageBody, "'ليلي' عادت مُبرمجة").not.toMatch(/'ليلي'/);
    // ★★★ ولا أوقاتَ مكتوبةً يدوياً
    expect(pageBody, 'أوقاتٌ مُبرمجة').not.toMatch(/08:00 - 16:00|16:00 - 00:00/);
    // ★ بل تُقرأ من الصفّ
    expect(pageBody).toMatch(/cell\.startTime/);
    expect(pageBody).toMatch(/cell\.shiftNameAr/);
  });

  it('★★★ العطل ⑪: الإلغاء بديلاً عن الحذف', () => {
    expect(pageBody).toMatch(/shiftScheduleSdk\.cancel\(/);
    expect(pageBody).toMatch(/سبب الإلغاء مطلوب/);
  });

  it('★★★★ العطل ⑨: لافتة تعارض الإجازات', () => {
    expect(pageBody).toMatch(/shiftScheduleSdk\.leaveConflicts\(/);
    expect(pageBody).toMatch(/تتعارض مع إجازاتٍ معتمدة/);
    expect(pageBody).toMatch(/cell\.onLeave/);
  });

  it('★★★ العطلان ⑬/⑭: صفر any ولا ترشيح في المتصفّح', () => {
    expect(pageBody, 'useState<any[]> عاد').not.toMatch(/useState<any/);
    expect(pageBody).not.toMatch(/\bas any\b/);
    expect(pageBody).not.toMatch(/:\s*any\b/);
    expect(pageBody).not.toMatch(/any\[\]/);
    // ★ الترشيح بالتاريخ صار في القاعدة
    expect(pageBody, 'ترشيحٌ بالتاريخ في المتصفّح')
      .not.toMatch(/\.filter\([^)]*shift_date/);
    expect(pageBody, 'جلبُ كل الموظفين عاد').not.toMatch(/employeeService\.findAll/);
  });

  it('★★★ العطل ⑯: خريطةٌ واحدة بدل بحثٍ خطّيّ في حلقتين', () => {
    expect(pageBody).toMatch(/new Map<string, ShiftRow>/);
    expect(pageBody, 'البحث الخطّيّ عاد').not.toMatch(/assignments\.find\(/);
    expect(pageBody).not.toMatch(/getShiftForDay/);
  });

  it('★★★ توقيت بغداد في الواجهة', () => {
    expect(pageBody).toMatch(/timeZone: 'Asia\/Baghdad'/);
    expect(pageBody).toMatch(/function todayBaghdad/);
  });

  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(pageBody).not.toMatch(/from '.*supabase/);
  });

  it('★ الممنوعات: confirm/prompt/alert', () => {
    expect(pageBody).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
  });
});
