/**
 * ════════════════════════════════════════════════════════════════
 *  disciplinaryContract.test.ts — عقد الإجراءات التأديبية (0365)
 *
 *  ★★★ هذا فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-disciplinary-0365.sql` (53 تأكيداً)
 *      و`verify-disciplinary-0365-rls.sh` (34 تأكيداً بدور
 *      `authenticated` حقيقيّ) و`_invert_0365.py` (58/58 عكساً).
 *      ما يحرسه هنا هو **الانحدار**: أن يعود عطلٌ أُصلح.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0365_disciplinary_integrity.sql');
const SDK = read('src/services/sdk/DisciplinaryService.ts');
const PAGE = read('src/pages/hr/DisciplinaryPage.tsx');
const INDEX = read('src/services/sdk/index.ts');

/** ★ نصُّ المايجريشن مُجرَّداً من التعليقات (درس 0355) */
const migBody = MIG.replace(/^\s*--.*$/gm, '');
/** ★ نصُّ الصفحة مُجرَّداً من التعليقات */
const pageBody = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sdkBody = SDK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * ★ جسمُ دالةٍ محدَّدة من المايجريشن، مُجرَّداً من التعليقات.
 *
 * ★★ سقط أوّلاً في **أربعة عشر** تأكيداً: كتبتُ النهاية `\n$$;`
 *   بينما دوال PL/pgSQL تنتهي بـ`END $$;` على السطر نفسه. وهو
 *   نظيرُ درس 0355 — `fnBody` يجب أن تُطابق الشكل الفعليّ لا المتوقَّع.
 *   الحدُّ الآن `\$\$;` أينما وقع، وهو أوّل `$$;` بعد رأس الدالة.
 */
function fnBody(name: string): string {
  const re = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    'm',
  );
  const m = migBody.match(re);
  expect(m, `الدالة ${name} غير موجودة`).toBeTruthy();
  const body = (m as RegExpMatchArray)[0];
  // ★ حارسٌ على الحارس: جسمٌ أقصر من ٢٠٠ حرف = التقاطٌ خاطئ لا دالة
  expect(body.length, `جسم ${name} قصيرٌ مريب (${body.length})`).toBeGreaterThan(200);
  return body;
}

describe('0365 — المايجريشن: القيود والمفاتيح', () => {
  it('★★★ FK على الموظف **مركَّب** (id, tenant_id) لا مفرد — العطل ③', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(employee_id, tenant_id\)\s*\n?\s*REFERENCES public\.employees \(id, tenant_id\)/,
    );
    // ★ الحارس الحقيقيّ: لا FK مفرد على الموظف
    expect(migBody).not.toMatch(
      /FOREIGN KEY \(employee_id\)\s*\n?\s*REFERENCES public\.employees \(id\)/,
    );
  });

  it('★★★ FK على المُصدِر مركَّب ويشير إلى profiles لا employees — العطل ②', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(issued_by, tenant_id\)\s*\n?\s*REFERENCES public\.profiles \(id, tenant_id\)/,
    );
    expect(migBody).not.toMatch(/FOREIGN KEY \(issued_by[^)]*\)[\s\S]{0,60}?REFERENCES public\.employees/);
  });

  it('★ الفهرس الفريد على profiles(id, tenant_id) يسبق FK المُصدِر', () => {
    const idx = migBody.indexOf('uq_profiles_id_tenant');
    const fk = migBody.indexOf('fk_disciplinary_issuer_tenant');
    expect(idx).toBeGreaterThan(-1);
    expect(idx, 'الفهرس بعد المفتاح ⇒ المايجريشن تفشل').toBeLessThan(fk);
  });

  it('★★★ tenant_id يصير NOT NULL — العطل ④', () => {
    expect(migBody).toMatch(/ALTER COLUMN tenant_id SET NOT NULL/);
  });

  it('★★★ CHECK للأنواع الخمسة — العطل ⑤', () => {
    expect(migBody).toMatch(/chk_disciplinary_type[\s\S]{0,200}?verbal_warning[\s\S]{0,120}?termination/);
  });

  it('★★★ CHECK لدرجات الخطورة الأربع — العطل ⑥', () => {
    expect(migBody).toMatch(/chk_disciplinary_severity[\s\S]{0,200}?'low','medium','high','critical'/);
  });

  it('★★★ CHECK للحالات الخمس — العطل ⑦', () => {
    expect(migBody).toMatch(
      /chk_disciplinary_status[\s\S]{0,220}?'active','appealed','overturned','expired','revoked'/,
    );
  });

  it('★★★ CHECK للسبب بـbtrim — العطل ⑩ (NOT NULL لا يمنع المسافات)', () => {
    expect(migBody).toMatch(/chk_disciplinary_reason_present[\s\S]{0,140}?btrim\(reason\) <> ''/);
  });

  it('★★★ CHECK لتسلسل التواريخ — العطل ⑨', () => {
    expect(migBody).toMatch(
      /chk_disciplinary_valid_until_after_incident[\s\S]{0,180}?valid_until >= incident_date/,
    );
  });

  it('★★★★ الثغرة الثلاثية: IS NOT DISTINCT FROM لا `=` — أسقطها التأكيد 5.6', () => {
    const chk = migBody.match(
      /chk_disciplinary_overturned_needs_appeal[\s\S]{0,300}?END \$\$;/,
    );
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    expect(body, 'IS NOT DISTINCT FROM غائب').toMatch(
      /appeal_decision IS NOT DISTINCT FROM 'overturned'/,
    );
    // ★ الحارس: `=` يُعيد NULL حين يكون العمود معدوماً، و CHECK يقبل NULL
    expect(body, "`=` عاد فتعود الثغرة").not.toMatch(/appeal_decision = 'overturned'/);
  });

  it('★★ القيود الأخرى لدورة الحياة قائمة', () => {
    for (const c of [
      'chk_disciplinary_appeal_coherent',
      'chk_disciplinary_appeal_decision',
      'chk_disciplinary_appeal_decided_complete',
      'chk_disciplinary_revoked_complete',
      'chk_disciplinary_expired_complete',
      'chk_disciplinary_appealed_state',
    ]) {
      expect(migBody, c + ' غائب').toContain(c);
    }
  });

  it('★★ أعمدة دورة الحياة العشرة أُضيفت — العطل ⑬', () => {
    for (const col of [
      'acknowledged_at', 'appealed_at', 'appeal_reason', 'appeal_decision',
      'appeal_decided_by', 'appeal_decided_at', 'revoked_at', 'revoked_by',
      'revocation_reason', 'expired_at',
    ]) {
      expect(migBody, col + ' غائب').toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`),
      );
    }
  });
});

describe('0365 — المحفّزات', () => {
  it('★★★ حارس الواقعة المستقبلية في المحفّز لا في CHECK — العطل ⑧', () => {
    const body = fnBody('tg_disciplinary_guard');
    expect(body).toMatch(/DISCIPLINARY_FUTURE_INCIDENT/);
    // ★★★ CURRENT_DATE غير IMMUTABLE ⇒ لا يصلح في CHECK
    expect(migBody, 'CURRENT_DATE في CHECK يُفشل المايجريشن')
      .not.toMatch(/CHECK\s*\([^)]*CURRENT_DATE/);
  });

  it('★★★ المحفّز يستعمل توقيت بغداد صراحةً — الخادم Etc/UTC', () => {
    expect(fnBody('tg_disciplinary_guard')).toMatch(
      /AT TIME ZONE 'Asia\/Baghdad'/,
    );
  });

  it('★★★ حارس العقاب الذاتيّ يترجم profiles.id ← employees.id — العطل ⑪', () => {
    const body = fnBody('tg_disciplinary_guard');
    expect(body).toMatch(/DISCIPLINARY_SELF_ISSUE/);
    // ★★★ المقارنة المباشرة تنجح دائماً لاختلاف العنوانين ⇒ لا تكفي
    expect(body, 'الترجمة عبر employees.user_id غائبة').toMatch(
      /FROM public\.employees e\s*\n\s*WHERE e\.user_id = NEW\.issued_by/,
    );
  });

  it('★★★ محفّز منع الحذف قائم — العطل ⑮', () => {
    expect(migBody).toMatch(/DISCIPLINARY_DELETE_BLOCKED/);
    expect(migBody).toMatch(
      /CREATE TRIGGER trg_block_disciplinary_delete\s*\n?\s*BEFORE DELETE ON public\.disciplinary_actions/,
    );
  });
});

describe('0365 — الدوال الثماني', () => {
  const FNS = [
    'disciplinary_expire_due', 'disciplinary_board', 'disciplinary_summary',
    'disciplinary_issue', 'disciplinary_acknowledge', 'disciplinary_appeal',
    'disciplinary_appeal_decide', 'disciplinary_revoke',
  ];

  it('★ الدوال الثماني مُعرَّفة', () => {
    for (const f of FNS) {
      expect(migBody, f + ' غائبة').toMatch(
        new RegExp(`CREATE FUNCTION public\\.${f}\\b`),
      );
    }
  });

  it('★★ كل دالة مسبوقةٌ بـDROP صريح — CREATE OR REPLACE لا يغيّر نوع الإرجاع', () => {
    for (const f of FNS) {
      expect(migBody, f + ' بلا DROP').toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\b`),
      );
    }
  });

  it('★★★ anon مُستثنى من كل دالة — REVOKE هو الحارس لا GRANT', () => {
    for (const f of FNS) {
      expect(migBody, f + ' بلا REVOKE عن anon').toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\b[^;]*FROM anon;`),
      );
    }
  });

  it('★★★ العطل ⑯: disciplinary_appeal هي SECURITY DEFINER', () => {
    // ★ الموظف لا يملك UPDATE على الجدول (السياسة تشترط staff)
    //   ⇒ الدالة وحدها تفتح له حقّه، ولا تفتح غيره.
    expect(fnBody('disciplinary_appeal')).toMatch(/SECURITY DEFINER/);
    expect(fnBody('disciplinary_appeal')).toMatch(/DISCIPLINARY_NOT_OWNER/);
  });

  it('★★★ التعليل إلزاميّ في البتّ — تعميمُ العطل ⑲ في 0363', () => {
    expect(fnBody('disciplinary_appeal_decide')).toMatch(/DISCIPLINARY_RESPONSE_REQUIRED/);
  });

  it('★★★ «مُخفَّف» يُنزل الخطورة فعلياً لا لفظاً', () => {
    const body = fnBody('disciplinary_appeal_decide');
    expect(body).toMatch(/WHEN 'critical' THEN 'high'/);
    expect(body).toMatch(/WHEN 'high'\s+THEN 'medium'/);
  });

  it('★★★ اللوح والملخّص SECURITY INVOKER — RLS تبقى سارية', () => {
    expect(fnBody('disciplinary_board')).toMatch(/SECURITY INVOKER/);
    expect(fnBody('disciplinary_summary')).toMatch(/SECURITY INVOKER/);
    // ★ الحارس: DEFINER هنا يُسقط عزل المستأجر في اللوح
    expect(fnBody('disciplinary_board')).not.toMatch(/SECURITY DEFINER/);
  });

  it('★★★ ترتيب اللوح حتميّ — created_at قد يتساوى (درس 0362)', () => {
    expect(fnBody('disciplinary_board')).toMatch(
      /ORDER BY d\.incident_date DESC, d\.created_at DESC, d\.id DESC/,
    );
  });

  it('★★★ اسم الموظف مُركَّب — full_name_ar فارغٌ بنيوياً (PROBE_16)', () => {
    expect(fnBody('disciplinary_board')).toMatch(
      /NULLIF\(btrim\(COALESCE\(e\.first_name,''\) \|\| ' ' \|\| COALESCE\(e\.last_name,''\)\), ''\)/,
    );
  });

  it('★★★ can_appeal يحرس الملكية والحالة والتكرار معاً', () => {
    expect(fnBody('disciplinary_board')).toMatch(
      /v_me IS NOT NULL AND v_me = d\.employee_id\s*\n\s*AND d\.status = 'active' AND d\.is_appealed = FALSE/,
    );
  });

  it('★★★ expire_due مرشَّحةٌ بالمستأجر وحدُّها صارم (< لا <=)', () => {
    const body = fnBody('disciplinary_expire_due');
    expect(body).toMatch(/WHERE tenant_id = v_tenant/);
    expect(body).toMatch(/valid_until < v_today/);
    expect(body, 'الحدّ صار <= فينتهي أجلُ اليوم قبل أوانه')
      .not.toMatch(/valid_until <= v_today/);
    expect(body).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
  });

  it('★★ كلُّ دالةٍ تُثبّت search_path', () => {
    for (const f of FNS) {
      expect(fnBody(f), f + ' بلا search_path').toMatch(/SET search_path TO 'public'/);
    }
  });

  it('★★★ الإصدار يأخذ المُصدِر من auth.uid() لا من المتصفّح', () => {
    expect(fnBody('disciplinary_issue')).toMatch(/auth\.uid\(\), 'active'\)/);
  });
});

describe('0365 — طبقة SDK', () => {
  it('★ الخدمة مُصدَّرة من index.ts مع أنواعها', () => {
    expect(INDEX).toMatch(/disciplinarySdk[\s\S]{0,600}?from '\.\/DisciplinaryService'/);
    expect(INDEX).toMatch(/DisciplinaryRow, DisciplinarySummary, DisciplinaryInput/);
  });

  it('★★★ المفردات في SDK تطابق CHECK في القاعدة حرفياً', () => {
    // النوع
    const kinds = ['verbal_warning', 'written_warning', 'suspension', 'demotion', 'termination'];
    for (const k of kinds) expect(sdkBody, k + ' غائب').toContain(`'${k}'`);
    // الحالة — خمسٌ لا ثلاث
    for (const s of ['active', 'appealed', 'overturned', 'expired', 'revoked']) {
      expect(sdkBody, s + ' غائب').toContain(`'${s}'`);
    }
    // ★ الحارس: مفردةٌ في SDK ليست في القاعدة = شارةٌ لا تظهر أبداً
    const stateArr = sdkBody.match(/DISCIPLINARY_STATES = \[([\s\S]*?)\] as const/);
    expect(stateArr).toBeTruthy();
    for (const s of (stateArr as RegExpMatchArray)[1].match(/'[a-z_]+'/g) ?? []) {
      expect(migBody, `الحالة ${s} في SDK وليست في CHECK`).toContain(s);
    }
  });

  it('★★ دوال العرض تُعيد النصّ الخامّ لا undefined عند مفردةٍ مجهولة', () => {
    for (const f of [
      'disciplinaryKindLabel', 'disciplinarySeverityLabel',
      'disciplinaryStateLabel', 'appealDecisionLabel',
    ]) {
      expect(sdkBody, f + ' بلا احتياطيّ').toMatch(
        new RegExp(`${f} = \\(v: string\\): string =>[\\s\\S]{0,90}?\\?\\? v;`),
      );
    }
  });

  it('★ numOrNull يحفظ التمييز بين «صفر يوم» و«بلا أجل»', () => {
    expect(sdkBody).toMatch(/const numOrNull[\s\S]{0,200}?v === ''\) return null/);
  });

  it('★★★ الخدمة لا تُنشئ صفوفاً مباشرةً — كلُّ كتابةٍ عبر rpc', () => {
    expect(sdkBody, 'وصولٌ مباشر إلى الجدول')
      .not.toMatch(/supabase\s*\n?\s*\.from\(\s*'disciplinary_actions'/);
    expect(sdkBody).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('★ صفر any في الخدمة', () => {
    expect(sdkBody).not.toMatch(/\bas any\b/);
    expect(sdkBody).not.toMatch(/:\s*any\b/);
    expect(sdkBody).not.toMatch(/any\[\]/);
  });
});

describe('0365 — الصفحة', () => {
  it('★★★ العطل ⑯: زرُّ التظلّم موجودٌ ومربوطٌ بالدالة', () => {
    expect(pageBody, 'زرّ التظلّم غائب').toMatch(/disciplinarySdk\.appeal\(/);
    expect(pageBody, 'canAppeal لا يحكم ظهور الزرّ').toMatch(/row\.canAppeal &&/);
  });

  it('★★★ العطل ⑮: لا حذف — الإلغاء الإداريّ بديلاً', () => {
    expect(pageBody).toMatch(/disciplinarySdk\.revoke\(/);
    expect(pageBody, 'حذفٌ عاد').not.toMatch(/\.delete\(|deleteAction|removeAction/);
  });

  it('★★★ العطل ⑭: زرُّ ترحيل المنقضية موجود', () => {
    expect(pageBody).toMatch(/disciplinarySdk\.expireDue\(/);
  });

  it('★★ دورة التظلّم كاملة: بتٌّ وإقرار اطّلاع', () => {
    expect(pageBody).toMatch(/disciplinarySdk\.decideAppeal\(/);
    expect(pageBody).toMatch(/disciplinarySdk\.acknowledge\(/);
  });

  it('★★★ الصفحة لا تلمس Supabase ولا تستورد خدمة الموظفين', () => {
    expect(pageBody).not.toMatch(/from '.*supabase/);
    // ★ العطل ⑯ القديم: جلبت **كل** الموظفين وبنت Map يدوياً
    expect(pageBody, 'جلبُ كل الموظفين عاد').not.toMatch(/employeeService\.findAll/);
    expect(pageBody, 'ربطٌ يدويّ عاد').not.toMatch(/new Map<string,\s*EmployeeSummary>/);
  });

  it('★★★ لا تُرسل issued_by من المتصفّح — auth.uid() في القاعدة', () => {
    expect(pageBody, 'issued_by من المتصفّح يُزوَّر').not.toMatch(/issued_by/);
  });

  it('★★★ الحالة والخطورة تُعرضان بالعربية لا نصّاً خامّاً', () => {
    // ★ العطل في الصفحة القديمة: <DetailRow label="الخطورة" value={selected.severity} />
    //
    // ★★ تصحيحُ تأكيدٍ منّي: صُغتُه أوّلاً `value=\{[a-zA-Z]+\.severity\}`
    //   فأمسك `value={form.severity}` وهو **ربطُ عنصر <select> لا عرضٌ
    //   للمستخدم** — تأكيدٌ أوسع من قصده يُسقط شيفرةً سليمة.
    //   الحدُّ الآن على `<DetailRow …>` وحدها، وهي موضع العرض فعلاً.
    const detailRows = pageBody.match(/<DetailRow[\s\S]*?\/>/g) ?? [];
    expect(detailRows.length, 'لا صفوف تفاصيل').toBeGreaterThan(5);
    for (const rowTag of detailRows) {
      expect(rowTag, 'severity تُعرض خامّاً').not.toMatch(/value=\{[a-zA-Z]+\.severity\}/);
      expect(rowTag, 'status تُعرض خامّاً').not.toMatch(/value=\{[a-zA-Z]+\.status\}/);
      expect(rowTag, 'kind تُعرض خامّاً').not.toMatch(/value=\{[a-zA-Z]+\.kind\}/);
    }
    expect(pageBody).toMatch(/disciplinarySeverityLabel\(String\(detail\.severity\)\)/);
    expect(pageBody).toMatch(/disciplinaryStateLabel\(String\(detail\.status\)\)/);
  });

  it('★★★ توقيت بغداد في الواجهة — لا new Date() لليوم', () => {
    expect(pageBody).toMatch(/timeZone: 'Asia\/Baghdad'/);
    expect(pageBody).toMatch(/function todayBaghdad/);
    // ★ الحدّ الأعلى لحقل التاريخ يستعمله فعلاً
    expect(pageBody).toMatch(/max=\{todayBaghdad\(\)\}/);
  });

  it('★ الممنوعات: confirm/prompt/alert/any', () => {
    expect(pageBody).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
    expect(pageBody).not.toMatch(/\bas any\b/);
    expect(pageBody).not.toMatch(/:\s*any\b/);
    expect(pageBody).not.toMatch(/any\[\]/);
  });

  it('★★ حرّاس الواجهة تسبق حرّاس القاعدة برسالةٍ مفهومة', () => {
    expect(pageBody).toMatch(/تاريخ الواقعة لا يكون في المستقبل/);
    expect(pageBody).toMatch(/نهاية الصلاحية لا تسبق تاريخ الواقعة/);
    expect(pageBody).toMatch(/سبب التظلّم مطلوب/);
    expect(pageBody).toMatch(/تعليل القرار مطلوب/);
    expect(pageBody).toMatch(/سبب الإلغاء مطلوب/);
  });
});
