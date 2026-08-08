/**
 * ════════════════════════════════════════════════════════════════
 *  serviceCenterContract.test.ts — عقد مركز خدمات HR (0367)
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-hr-service-center-0367.sql` (52 تأكيداً)
 *      و`-rls.sh` (34 تأكيداً بدور `authenticated` حقيقيّ)
 *      و`_invert_0367.py` (63/63 عكساً).
 *      ما يحرسه هنا هو **الانحدار**: أن يعود عطلٌ أُصلح.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0367_hr_service_center_integrity.sql');
const SDK = read('src/services/sdk/ServiceCenterService.ts');
const PAGE = read('src/pages/hr/HRServiceCenterPage.tsx');
const INDEX = read('src/services/sdk/index.ts');
/**
 * ★★ مصدر القيود القديمة: `hr_cases_channel_check` و
 *   `..._language_check` و`..._delivery_method_check` عُرِّفت في
 *   **0016** لا في 0367 (0367 لم تمسّها). تأكيدُ المفردات يجب أن
 *   يقرأ من الملفَّين معاً — قصرُه على 0367 أسقطه بثلاث مفرداتٍ
 *   سليمة (`tawathul`/`en`/`printed`…). خطأٌ في التأكيد لا في الكود.
 */
const MIG_0016 = read('supabase/migrations/0016_employee_self_service.sql');
const SCHEMA_SOURCE = MIG + '\n' + MIG_0016;

const migBody = MIG.replace(/^\s*--.*$/gm, '');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const pageBody = strip(PAGE);
const sdkBody = strip(SDK);

/**
 * ★ جسمُ دالةٍ من المايجريشن.
 * ★★ النهاية `$$;` لا `\n$$;` — دوال PL/pgSQL تنتهي بـ`END $$;` على
 *   السطر نفسه (درس 0365، أسقط أربعة عشر تأكيداً).
 */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    'm',
  );
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  const body = (m as RegExpMatchArray)[0];
  expect(body.length, `جسم ${name} قصيرٌ مريب (${body.length})`).toBeGreaterThan(200);
  return body;
}

/** ★ نصُّ سياسةٍ محدَّدة كما كُتب في المايجريشن */
function policyBody(name: string): string {
  const re = new RegExp(`CREATE POLICY ${name}\\b[\\s\\S]*?;`, 'm');
  const m = migBody.match(re);
  expect(m, `السياسة ${name} غير موجودة`).toBeTruthy();
  return (m as RegExpMatchArray)[0];
}

describe('0367 — ★★★★ الجدار الأمنيّ (الأعطال ①–⑤)', () => {
  it('★★★★ العطل ①: سياسة ALL على الخطابات أُسقطت', () => {
    // السياسة القديمة كانت polcmd='*' فالموظف يُحدّث ويحذف
    expect(migBody).toMatch(
      /DROP POLICY IF EXISTS kyvzon_letter_requests_write ON public\.employee_letter_requests;/,
    );
    // ★ الحارس: لا CREATE POLICY … FOR ALL على هذا الجدول
    const created = migBody.match(
      /CREATE POLICY \w+ ON public\.employee_letter_requests[\s\S]*?;/g,
    ) ?? [];
    expect(created.length, 'صفر سياسة أُنشئت').toBeGreaterThan(1);
    for (const p of created) {
      expect(p, 'سياسة ALL عادت').not.toMatch(/FOR ALL/);
    }
  });

  it('★★★★ العطل ①: تحديث الخطابات مقصورٌ على staff', () => {
    const p = policyBody('kyvzon_letter_requests_update');
    expect(p).toMatch(/FOR UPDATE/);
    expect(p).toMatch(/current_user_is_staff\(\)/);
    // ★★★ الحارس الحقيقيّ: لا شرط ملكيةٍ في UPDATE
    expect(p, 'شرط الملكية عاد إلى UPDATE — الموظف يُصدر خطابه')
      .not.toMatch(/employee_id = public\.current_user_employee_id\(\)/);
  });

  it('★★★ العطلان ②/③: تحديث الطلبات مقصورٌ على staff', () => {
    const p = policyBody('kyvzon_hr_cases_update');
    expect(p).toMatch(/FOR UPDATE/);
    expect(p).toMatch(/current_user_is_staff\(\)/);
    expect(p, 'الموظف يستطيع إغلاق شكواه من جديد')
      .not.toMatch(/employee_id = public\.current_user_employee_id\(\)/);
  });

  it('★ الموظف ما زال يُنشئ ويقرأ — الإصلاح لم يسلبه حقّه', () => {
    for (const n of ['kyvzon_hr_cases_insert', 'kyvzon_letter_requests_insert',
                     'kyvzon_hr_cases_select', 'kyvzon_letter_requests_select']) {
      expect(policyBody(n), n + ' حرم الموظف')
        .toMatch(/employee_id = public\.current_user_employee_id\(\)/);
    }
  });

  it('★★ العطل ⑤: الشرط الميّت `employee_id = auth.uid()` أُسقط', () => {
    // ★ صفوف employees حيث id = user_id = 0 (PROBE_1)
    const created = migBody.match(/CREATE POLICY[\s\S]*?;/g) ?? [];
    expect(created.length).toBeGreaterThan(4);
    for (const p of created) {
      expect(p, 'الشرط الميّت عاد').not.toMatch(/employee_id = auth\.uid\(\)/);
    }
  });

  it('★★★ العطلان ④/⑥: منع الحذف على الجدولين', () => {
    expect(migBody).toMatch(/SERVICE_CENTER_DELETE_BLOCKED/);
    expect(migBody).toMatch(
      /CREATE TRIGGER trg_block_hr_case_delete\s*\n?\s*BEFORE DELETE ON public\.hr_cases/,
    );
    expect(migBody).toMatch(
      /CREATE TRIGGER trg_block_letter_delete\s*\n?\s*BEFORE DELETE ON public\.employee_letter_requests/,
    );
  });
});

describe('0367 — المفاتيح والقيود', () => {
  it('★★★ FK **مركَّبة** على الجدولين — لا مفردة', () => {
    for (const c of ['fk_hr_cases_employee_tenant', 'fk_letter_employee_tenant']) {
      expect(migBody, c + ' غائب').toContain(c);
    }
    expect(migBody).toMatch(
      /FOREIGN KEY \(employee_id, tenant_id\)\s*\n?\s*REFERENCES public\.employees \(id, tenant_id\)/,
    );
    // ★★★ الحارس: FK مفرد يُمرّر العبور بين المستأجرين
    expect(migBody, 'FK مفرد على الموظف عاد').not.toMatch(
      /FOREIGN KEY \(employee_id\)\s*\n?\s*REFERENCES public\.employees \(id\)/,
    );
  });

  it('★★ FK المُسنَد إليه والمُراجِع تشيران إلى profiles', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(assigned_to, tenant_id\)\s*\n?\s*REFERENCES public\.profiles \(id, tenant_id\)/,
    );
    expect(migBody).toMatch(
      /FOREIGN KEY \(reviewed_by, tenant_id\)\s*\n?\s*REFERENCES public\.profiles \(id, tenant_id\)/,
    );
  });

  it('★★★ القيود الخمسة قائمة', () => {
    for (const c of [
      'chk_hr_cases_subject_present',
      'chk_hr_cases_resolved_complete',
      'chk_letter_ready_needs_document',
      'chk_letter_rejected_needs_reason',
      'chk_letter_delivered_complete',
    ]) {
      expect(migBody, c + ' غائب').toContain(c);
    }
  });

  it('★★★ العطل ⑪: btrim في قيد الموضوع والوصف معاً', () => {
    expect(migBody).toMatch(
      /chk_hr_cases_subject_present[\s\S]{0,200}?btrim\(subject\) <> ''\s*AND btrim\(description\) <> ''/,
    );
  });

  it('★★★ العطل ⑭: عمود سبب الرفض أُضيف — لم يكن موجوداً', () => {
    expect(migBody).toMatch(/ADD COLUMN IF NOT EXISTS rejection_reason\s+TEXT/);
    // ★ والقيد ثنائيّ الاتّجاه: سببٌ بلا رفضٍ ممنوعٌ أيضاً
    expect(migBody).toMatch(
      /chk_letter_rejected_needs_reason[\s\S]{0,320}?status <> 'rejected' AND rejection_reason IS NULL/,
    );
  });

  it('★★ أعمدة دورة الحياة أُضيفت', () => {
    for (const c of ['issued_at', 'delivered_at', 'first_response_at',
                     'closed_at', 'reopened_count']) {
      expect(migBody, c + ' غائب').toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\b`),
      );
    }
  });
});

describe('0367 — ★★★ المحفّزات (العطل ⑮)', () => {
  it('★★★ sla_due_at يُملأ بمهلٍ ثلاث — كان عموداً ميتاً', () => {
    const b = fnBody('tg_hr_case_guard');
    expect(b).toMatch(/WHEN 'urgent' THEN INTERVAL '4 hours'/);
    expect(b).toMatch(/WHEN 'normal' THEN INTERVAL '2 days'/);
    expect(b).toMatch(/ELSE\s+INTERVAL '5 days'/);
  });

  it('★★★ تغيّر الأولوية يُعيد حساب الاستحقاق', () => {
    expect(fnBody('tg_hr_case_guard')).toMatch(
      /IF NEW\.priority <> OLD\.priority THEN[\s\S]{0,260}?NEW\.sla_due_at :=/,
    );
  });

  it('★★★ first_response_at و resolved_at و closed_at آليّة', () => {
    const b = fnBody('tg_hr_case_guard');
    expect(b).toMatch(/NEW\.first_response_at := now\(\)/);
    expect(b).toMatch(/NEW\.resolved_at := COALESCE\(NEW\.resolved_at, now\(\)\)/);
    expect(b).toMatch(/NEW\.closed_at := COALESCE\(NEW\.closed_at, now\(\)\)/);
  });

  it('★★★ إعادة الفتح تُعدّ وتُفرغ الحلّ (فالقيد يبقى راضياً)', () => {
    const b = fnBody('tg_hr_case_guard');
    expect(b).toMatch(/NEW\.reopened_count := OLD\.reopened_count \+ 1/);
    expect(b).toMatch(/NEW\.resolved_at\s+:= NULL/);
    expect(b).toMatch(/NEW\.resolution_summary := NULL/);
  });

  it('★★ المحفّزان يُجمّدان المستأجر والموظف', () => {
    for (const f of ['tg_hr_case_guard', 'tg_letter_guard']) {
      const b = fnBody(f);
      expect(b, f + ' لا يُجمّد المستأجر').toMatch(/NEW\.tenant_id\s+:= OLD\.tenant_id/);
      expect(b, f + ' لا يُجمّد الموظف').toMatch(/NEW\.employee_id := OLD\.employee_id/);
    }
  });

  it('★★★ محفّز الخطابات يُفرغ السبب عند الخروج من «مرفوض»', () => {
    expect(fnBody('tg_letter_guard')).toMatch(
      /IF NEW\.status <> 'rejected' THEN\s*\n\s*NEW\.rejection_reason := NULL;/,
    );
  });
});

describe('0367 — الدوال العشر (العطل ⑯: كانت صفراً)', () => {
  const FNS = [
    'hr_case_board', 'letter_request_board', 'service_center_summary',
    'hr_case_open', 'hr_case_assign', 'hr_case_set_status',
    'letter_request_open', 'letter_request_issue',
    'letter_request_deliver', 'letter_request_reject',
  ];

  it('★ الدوال العشر مُعرَّفة ومسبوقةٌ بـDROP صريح', () => {
    for (const f of FNS) {
      expect(migBody, f + ' غائبة').toMatch(new RegExp(`CREATE FUNCTION public\\.${f}\\b`));
      expect(migBody, f + ' بلا DROP').toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\b`),
      );
    }
  });

  it('★★★ anon مُستثنى من كل دالة — REVOKE هو الحارس', () => {
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

  it('★★★★ العطل ①: letter_request_issue تشترط staff', () => {
    const b = fnBody('letter_request_issue');
    expect(b).toMatch(/SECURITY DEFINER/);
    expect(b).toMatch(/LETTER_NOT_STAFF/);
    expect(b).toMatch(/LETTER_DOCUMENT_REQUIRED/);
    expect(b).toMatch(/LETTER_ALREADY_CLOSED/);
  });

  it('★★★ العطل ⑬: لا تسليمَ لخطابٍ بلا ملفّ', () => {
    expect(fnBody('letter_request_deliver')).toMatch(/LETTER_NOT_ISSUED/);
  });

  it('★★★ العطلان ②/③: حرّاس الدور في الطلبات', () => {
    expect(fnBody('hr_case_set_status')).toMatch(/CASE_NOT_STAFF/);
    expect(fnBody('hr_case_assign')).toMatch(/CASE_NOT_STAFF/);
  });

  it('★★★ العطل ⑫: لا إغلاق بلا ملخّص', () => {
    expect(fnBody('hr_case_set_status')).toMatch(/CASE_SUMMARY_REQUIRED/);
  });

  it('★★★ حارسا الملكية: لا فتحَ ولا طلبَ باسم موظفٍ آخر', () => {
    expect(fnBody('hr_case_open')).toMatch(/CASE_NOT_OWNER/);
    expect(fnBody('letter_request_open')).toMatch(/LETTER_NOT_OWNER/);
  });

  it('★★★ اللوحان والملخّص SECURITY INVOKER — RLS تبقى سارية', () => {
    for (const f of ['hr_case_board', 'letter_request_board', 'service_center_summary']) {
      expect(fnBody(f), f + ' ليست INVOKER').toMatch(/SECURITY INVOKER/);
      expect(fnBody(f), f + ' صارت DEFINER — عزل المستأجر يسقط')
        .not.toMatch(/SECURITY DEFINER/);
    }
  });

  it('★★★ ترتيب لوح الطلبات حتميّ ويُقدّم المفتوح على المُغلق', () => {
    const b = fnBody('hr_case_board');
    expect(b).toMatch(
      /ORDER BY\s*\n\s*CASE WHEN c\.status IN \('resolved','closed'\) THEN 1 ELSE 0 END,/,
    );
    expect(b).toMatch(/CASE c\.priority WHEN 'urgent' THEN 0/);
    // ★★★ created_at قد يتساوى (درس 0362) ⇒ تذييلٌ بـid
    expect(b).toMatch(/c\.id DESC/);
  });

  it('★★★ الاسم مُركَّب في اللوحين — full_name_ar فارغٌ بنيوياً', () => {
    for (const f of ['hr_case_board', 'letter_request_board']) {
      expect(fnBody(f), f + ' بلا اسمٍ مُركَّب').toMatch(
        /NULLIF\(btrim\(COALESCE\(e\.first_name,''\) \|\| ' ' \|\| COALESCE\(e\.last_name,''\)\), ''\)/,
      );
    }
  });

  it('★★★ is_overdue يشترط ألّا يكون الطلب مُغلقاً', () => {
    expect(fnBody('hr_case_board')).toMatch(
      /c\.sla_due_at < now\(\)\s*\n\s*AND c\.status NOT IN \('resolved','closed'\)/,
    );
  });

  it('★★★ waiting_days بتوقيت بغداد صراحةً — الخادم Etc/UTC', () => {
    const b = fnBody('letter_request_board');
    expect(b).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
    // ★ والمُنجز بلا انتظار
    expect(b).toMatch(/WHEN l\.status IN \('delivered','rejected'\) THEN NULL/);
  });

  it('★★★ عدّاد المتأخّرات يشترط ألّا يكون مُغلقاً', () => {
    expect(fnBody('service_center_summary')).toMatch(
      /sla_due_at < now\(\)\s*\n\s*AND status NOT IN \('resolved','closed'\)/,
    );
  });
});

describe('0367 — طبقة SDK', () => {
  it('★ مُصدَّرة من index.ts مع أنواعها', () => {
    expect(INDEX).toMatch(/serviceCenterSdk[\s\S]{0,900}?from '\.\/ServiceCenterService'/);
    expect(INDEX).toMatch(/CaseRow, LetterRow, ServiceCenterSummary/);
  });

  it('★★★ المفردات في SDK تطابق CHECK في القاعدة حرفياً', () => {
    for (const arr of ['CASE_STATES', 'CASE_PRIORITIES', 'CASE_CHANNELS',
                       'LETTER_TYPES', 'LETTER_STATES',
                       'LETTER_LANGUAGES', 'LETTER_DELIVERIES']) {
      const m = sdkBody.match(new RegExp(`${arr} = \\[([\\s\\S]*?)\\] as const`));
      expect(m, arr + ' غير موجودة').toBeTruthy();
      const items = (m as RegExpMatchArray)[1].match(/'[a-z_]+'/g) ?? [];
      expect(items.length, arr + ' فارغة').toBeGreaterThan(1);
      // ★ الحارس: مفردةٌ في SDK ليست في القاعدة = شارةٌ لا تظهر أبداً
      for (const it of items) {
        expect(SCHEMA_SOURCE, `${arr}: ${it} في SDK وليست في أيّ CHECK`)
          .toContain(it);
      }
    }
  });

  it('★★ دوال العرض تُعيد النصّ الخامّ لا undefined', () => {
    for (const f of ['caseStateLabel', 'casePriorityLabel', 'caseChannelLabel',
                     'caseTypeLabel', 'letterTypeLabel', 'letterStateLabel',
                     'letterLanguageLabel', 'letterDeliveryLabel']) {
      expect(sdkBody, f + ' بلا احتياطيّ').toMatch(
        new RegExp(`${f} = \\(v: string\\): string =>[\\s\\S]{0,90}?\\?\\? v;`),
      );
    }
  });

  it('★★★ الخدمة لا تلمس الجدولين مباشرةً — كلُّ شيءٍ عبر rpc', () => {
    expect(sdkBody).not.toMatch(/\.from\(\s*'hr_cases'/);
    expect(sdkBody).not.toMatch(/\.from\(\s*'employee_letter_requests'/);
    expect(sdkBody).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('★ numOrNull يحفظ التمييز بين «صفر» و«غير مُقاس»', () => {
    expect(sdkBody).toMatch(/const numOrNull[\s\S]{0,200}?v === ''\) return null/);
  });

  it('★ صفر any في الخدمة', () => {
    expect(sdkBody).not.toMatch(/\bas any\b/);
    expect(sdkBody).not.toMatch(/:\s*any\b/);
    expect(sdkBody).not.toMatch(/any\[\]/);
  });
});

describe('0367 — الصفحة', () => {
  it('★★★★ العطل ①: الإصدار والتسليم عبر دوالٍ بحرّاس', () => {
    expect(pageBody).toMatch(/serviceCenterSdk\.issueLetter\(/);
    expect(pageBody).toMatch(/serviceCenterSdk\.deliverLetter\(/);
  });

  it('★★★ العطل ⑭: زرُّ الرفض موجود — لم يكن إطلاقاً', () => {
    expect(pageBody).toMatch(/serviceCenterSdk\.rejectLetter\(/);
    expect(pageBody).toMatch(/سبب الرفض مطلوب/);
  });

  it('★★★ العطلان ②/③: الإسناد وتغيير الحالة عبر الدوال', () => {
    expect(pageBody).toMatch(/serviceCenterSdk\.assignCase\(/);
    expect(pageBody).toMatch(/serviceCenterSdk\.setCaseStatus\(/);
  });

  it('★★★ زرّا الإنشاء موجودان — لم تكن الصفحة تسمح بتقديم طلب', () => {
    expect(pageBody).toMatch(/serviceCenterSdk\.openCase\(/);
    expect(pageBody).toMatch(/serviceCenterSdk\.openLetter\(/);
  });

  it('★★★ العطل ⑰: صفر any — كانت useState<any[]>([])', () => {
    expect(pageBody, 'useState<any[]> عاد').not.toMatch(/useState<any/);
    expect(pageBody).not.toMatch(/\bas any\b/);
    expect(pageBody).not.toMatch(/:\s*any\b/);
    expect(pageBody).not.toMatch(/any\[\]/);
  });

  it('★★★ العطل ⑱: لا جلبَ لكل الموظفين ولا Map يدويّ', () => {
    expect(pageBody, 'جلبُ كل الموظفين عاد').not.toMatch(/employeeService/);
    expect(pageBody, 'Map يدويّ عاد').not.toMatch(/new Map\(/);
    expect(pageBody, 'employeeMap عاد').not.toMatch(/employeeMap/);
  });

  it('★★★ العطلان ⑳/㉑: لا مفردةً تُعرض نصّاً خامّاً في التفاصيل', () => {
    const rows = pageBody.match(/<DetailRow[\s\S]*?\/>/g) ?? [];
    expect(rows.length, 'لا صفوف تفاصيل').toBeGreaterThan(10);
    for (const r of rows) {
      for (const f of ['priority', 'status', 'letterType', 'caseType',
                       'language', 'deliveryMethod', 'channel']) {
        expect(r, `${f} تُعرض خامّاً`).not.toMatch(
          new RegExp(`value=\\{[a-zA-Z]+\\.${f}\\}`),
        );
      }
    }
    // ★ وتُستعمل دوال العرض فعلاً
    expect(pageBody).toMatch(/casePriorityLabel\(String\(caseDetail\.priority\)\)/);
    expect(pageBody).toMatch(/letterLanguageLabel\(String\(letterDetail\.language\)\)/);
  });

  it('★★★ الصفحة لا تلمس Supabase', () => {
    expect(pageBody).not.toMatch(/from '.*supabase/);
    expect(pageBody).not.toMatch(/hrCaseService|employeeLetterRequestService/);
  });

  it('★ الممنوعات: confirm/prompt/alert', () => {
    expect(pageBody).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
  });

  it('★★ حرّاس الواجهة تسبق حرّاس القاعدة برسالةٍ مفهومة', () => {
    expect(pageBody).toMatch(/الموضوع مطلوب/);
    expect(pageBody).toMatch(/الوصف مطلوب/);
    expect(pageBody).toMatch(/ملخّص الحلّ مطلوب عند الإغلاق/);
    expect(pageBody).toMatch(/رابط ملفّ الخطاب مطلوب/);
  });
});
