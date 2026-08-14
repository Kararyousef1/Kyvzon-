/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0358 — سلامة دورة حياة المكافآت
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-bonus-lifecycle-0358.sql`
 *   · العزل مُثبَت في `…-0358-rls.sh` بدور `authenticated` حقيقيّ
 *   · التغطية مُثبتة في `_invert_0358.py` — **43/43** عكساً أسقط
 *     الاختبار (+3 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: مفردةٌ عربية في
 *   عمود إنجليزيّ · نصٌّ في عمود UUID · حقلان للمبلغ · حذفٌ نهائيّ.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0358_bonus_lifecycle_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/BonusService.ts');
const PAGE    = read('src/pages/hr/BonusesPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* 'موافق' */ const x=1;")).not.toMatch(/موافق/);
    expect(codeTs("// approveBonus\nconst y=1;")).not.toMatch(/approveBonus/);
    expect(codeTs("const s = b.status === 'approved';")).toMatch(/approved/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'موافق مذكور';")).not.toMatch(/موافق/);
    expect(stmtSql("  AND b.status = 'approved'")).toMatch(/b\.status/);
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

const NEW_FNS = ['bonus_summary', 'bonus_board', 'bonus_create',
                 'bonus_decide', 'bonus_archive'];

// ═══════════════════════════════════════════════════════════════
describe('0358 — بنية المايجريشن', () => {
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

  it('أعمدة الأرشفة والقرار', () => {
    for (const c of ['archived_at', 'archive_reason', 'decided_at', 'decision_note']) {
      expect(MIG_CODE, c).toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ① — لا نصّ في عمود UUID', () => {
  it('القاعدة تكتب auth.uid() لا سلسلة', () => {
    expect(fnBody('bonus_decide'))
      .toMatch(/approved_by\s+= CASE WHEN p_decision IN \('approved','paid'\)[\s\S]{0,120}auth\.uid\(\)/);
  });

  it('★★★ الصفحة لا تُمرّر معتمِداً إطلاقاً', () => {
    expect(PAGE_CODE).not.toMatch(/"system"/);
    expect(PAGE_CODE).not.toMatch(/'system'/);
    expect(PAGE_CODE).not.toMatch(/approvedBy/);
  });

  it('الخدمة لا تقبل معتمِداً من المتصفّح', () => {
    expect(SVC_CODE).not.toMatch(/p_approved_by/);
    const decide = SVC_CODE.slice(SVC_CODE.indexOf('async decide('));
    expect(decide.slice(0, 500)).not.toMatch(/approved_by/);
  });

  it('الصفحة لا تستعمل الخدمة القديمة المعطوبة', () => {
    expect(PAGE_CODE).not.toMatch(/\bbonusService\b/);
    expect(PAGE_CODE).not.toMatch(/approveBonus|cancelBonus|findAllBonuses/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ② — لا مفردة عربية في عمود الحالة', () => {
  const AR_WORDS = ['موافق', 'ملغي'];

  it('المايجريشن لا يكتب مفردة عربية كحالة (خارج التطبيع)', () => {
    // ★ التطبيع يذكرها في `WHERE status IN (…)` وهو مقصود — نفحص
    //   عدم كتابتها في CHECK أو في القيمة المُسنَدة.
    const chk = MIG_CODE.match(/CHECK \(status IN \(([^)]*)\)\)/);
    expect(chk, 'قيد الحالة غير موجود').toBeTruthy();
    for (const w of AR_WORDS) {
      expect((chk as RegExpMatchArray)[1], w).not.toContain(w);
    }
  });

  it('القيد يذكر المفردات الأربع الإنجليزية بالضبط', () => {
    const chk = MIG_CODE.match(/CHECK \(status IN \(([^)]*)\)\)/);
    const listed = (chk as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/'/g, ''));
    expect(listed.sort()).toEqual(['approved', 'cancelled', 'paid', 'pending']);
  });

  it('★ والتطبيع يحوّل العربية القائمة (لا يتركها)', () => {
    expect(MIG_CODE).toMatch(/SET status = 'approved'[\s\S]{0,80}'موافق'/);
    expect(MIG_CODE).toMatch(/SET status = 'cancelled'[\s\S]{0,120}'ملغي'/);
  });

  it('الخدمة تُصدّر المفردات الأربع ولا خامسة', () => {
    const m = SVC_CODE.match(/export const BONUS_STATUSES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(['approved', 'cancelled', 'paid', 'pending']);
  });

  it('لكل مفردة تسمية ولون — لا undefined في الشارة', () => {
    for (const s of ['pending', 'approved', 'paid', 'cancelled']) {
      expect(SVC_CODE, `BONUS_STATUS_AR.${s}`).toMatch(
        new RegExp(`${s}:\\s*'[^']+'`));
    }
    const tone = SVC_CODE.slice(SVC_CODE.indexOf('BONUS_STATUS_TONE'));
    for (const s of ['pending', 'approved', 'paid', 'cancelled']) {
      expect(tone, `BONUS_STATUS_TONE.${s}`).toMatch(new RegExp(`${s}:`));
    }
  });

  it('★★ الصفحة لا تقارن الحالة بمفردة عربية', () => {
    for (const w of AR_WORDS) {
      expect(PAGE_CODE, w).not.toMatch(new RegExp(`status[^;]{0,20}'${w}'`));
    }
  });

  it('★ ولا تستعمل PAYROLL_STATUS_LABELS (العطل ⑪)', () => {
    expect(PAGE_CODE).not.toMatch(/PAYROLL_STATUS_LABELS/);
    expect(PAGE_CODE).not.toMatch(/PAYROLL_STATUS_COLORS/);
    expect(PAGE_CODE).toMatch(/BONUS_STATUS_AR\[/);
  });

  it('حارس اللوحة يعكس CHECK نصّاً', () => {
    expect(fnBody('bonus_board')).toMatch(
      /p_status NOT IN \('pending','approved','cancelled','paid'\)/);
    expect(fnBody('bonus_board')).toMatch(/BONUS_BAD_STATUS/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ③ — مبلغ واحد لا اثنان', () => {
  it('المحفّز يجعل bonus_amount مرآة غير مشروطة', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.sync_bonus_amount_fields');
    expect(i).toBeGreaterThan(-1);
    const body = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    // ★ إسناد مباشر لا داخل IF
    expect(body).toMatch(/\n\s*NEW\.bonus_amount := NEW\.amount;/);
    // ★ والاتجاه الآخر مشروط (للإدراج بـbonus_amount وحده)
    expect(body).toMatch(/IF NEW\.amount IS NULL AND NEW\.bonus_amount IS NOT NULL THEN/);
  });

  it('★★ الخدمة تُرسل amount لا bonus_amount', () => {
    expect(SVC_CODE).toMatch(/p_amount:\s*input\.amount/);
    expect(SVC_CODE).not.toMatch(/bonus_amount/);
  });

  it('★★ الصفحة لا تذكر bonus_amount', () => {
    expect(PAGE_CODE).not.toMatch(/bonus_amount/);
  });

  it('القاعدة تكتب amount وحده عند الإنشاء', () => {
    const b = fnBody('bonus_create');
    expect(b).toMatch(/\(tenant_id, employee_id, bonus_type, amount, reason,/);
    expect(b).not.toMatch(/bonus_amount/);
  });

  it('bonus_date يتبع period_start', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.sync_bonus_amount_fields');
    const body = MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i));
    expect(body).toMatch(/IF NEW\.period_start IS NOT NULL THEN[\s\S]{0,80}NEW\.bonus_date := NEW\.period_start/);
    // ★ وبتوقيت بغداد حين لا فترة
    expect(body).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ الأعطال ④/⑤/⑥ — القيود', () => {
  it('قيد المبلغ الموجب', () => {
    expect(MIG_CODE).toMatch(/bonuses_amount_pos/);
    expect(MIG_CODE).toMatch(/CHECK \(amount > 0\)/);
  });

  it('قيد النوع بالمفردات الستّ', () => {
    expect(MIG_CODE).toMatch(/bonuses_type_chk/);
    const m = MIG_CODE.match(/CHECK \(bonus_type IN \(([\s\S]*?)\)\)/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s\n]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(
      ['annual', 'other', 'overtime', 'performance', 'referral', 'spot']);
  });

  it('FK على الموظف', () => {
    expect(MIG_CODE).toMatch(/bonuses_employee_id_fkey/);
    expect(MIG_CODE).toMatch(
      /FOREIGN KEY \(employee_id\) REFERENCES public\.employees\(id\)/);
  });

  it('قيد مدى الفترة', () => {
    expect(MIG_CODE).toMatch(/bonuses_period_chk/);
    expect(MIG_CODE).toMatch(/period_end >= period_start/);
  });

  it('حرّاس bonus_create', () => {
    const b = fnBody('bonus_create');
    expect(b).toMatch(/BONUS_BAD_AMOUNT/);
    expect(b).toMatch(/BONUS_BAD_TYPE/);
    expect(b).toMatch(/BONUS_NO_REASON/);
    expect(b).toMatch(/BONUS_BAD_PERIOD/);
  });

  it('★★ الصفحة تحرس المبلغ قبل الإرسال', () => {
    expect(PAGE_CODE).toMatch(/Number\.isFinite\(amount\)/);
    expect(PAGE_CODE).toMatch(/amount <= 0/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑦ — الأرشفة بدل الحذف', () => {
  it('محفّز يمنع الحذف', () => {
    expect(MIG_CODE).toMatch(/CREATE TRIGGER trg_block_bonus_delete/);
    expect(MIG_CODE).toMatch(/BEFORE DELETE ON public\.bonuses/);
    expect(MIG_CODE).toMatch(/BONUS_IMMUTABLE/);
  });

  it('دالة أرشفة بسبب إلزاميّ', () => {
    expect(fnBody('bonus_archive')).toMatch(/BONUS_NO_REASON/);
    expect(fnBody('bonus_archive')).toMatch(/archived_at = NOW\(\)/);
  });

  it('المؤرشف لا يُبَتّ فيه', () => {
    expect(fnBody('bonus_decide')).toMatch(/BONUS_ARCHIVED/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE).not.toMatch(/\.delete\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
    expect(SVC_CODE).toMatch(/async archive\(/);
    expect(PAGE_CODE).toMatch(/bonusSdk\.archive\(/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑧ — الفترة تُمرَّر فعلاً', () => {
  it('الدالة تقبل الفترة وتكتبها', () => {
    const b = fnBody('bonus_create');
    expect(b).toMatch(/p_period_start DATE DEFAULT NULL/);
    expect(b).toMatch(/p_period_start, p_period_end/);
  });

  it('★★ الخدمة تمرّرها', () => {
    expect(SVC_CODE).toMatch(/p_period_start:\s*input\.periodStart/);
    expect(SVC_CODE).toMatch(/p_period_end:\s*input\.periodEnd/);
  });

  it('★★ الصفحة تمرّرها', () => {
    expect(PAGE_CODE).toMatch(/periodStart:\s*form\.period_start/);
    expect(PAGE_CODE).toMatch(/periodEnd:\s*form\.period_end/);
  });

  it('★ والصفحة تحرس المدى قبل الإرسال', () => {
    expect(PAGE_CODE).toMatch(/period_end < form\.period_start/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ العطل ⑨ — الأنواع الستّة كلها في الفلترة', () => {
  it('الخدمة تُصدّر الأنواع الستّة', () => {
    const m = SVC_CODE.match(/export const BONUS_TYPES = \[([\s\S]*?)\] as const/);
    expect(m).toBeTruthy();
    const listed = (m as RegExpMatchArray)[1]
      .split(',').map((s) => s.trim().replace(/['\s\n]/g, '')).filter(Boolean);
    expect(listed.sort()).toEqual(
      ['annual', 'other', 'overtime', 'performance', 'referral', 'spot']);
  });

  it('لكل نوع تسمية عربية', () => {
    for (const t of ['performance', 'overtime', 'annual', 'spot', 'referral', 'other']) {
      expect(SVC_CODE, `BONUS_TYPE_AR.${t}`).toMatch(new RegExp(`${t}:\\s*'[^']+'`));
    }
  });

  it('★★ الصفحة تشتقّ الأزرار من الثابت — لا قائمة مكتوبة', () => {
    expect(PAGE_CODE).toMatch(/BONUS_TYPES\.map/);
    // ★ ولا مصفوفة أنواع مكتوبة يدوياً (كانت خمسة من ستّة)
    expect(PAGE_CODE).not.toMatch(
      /\['performance', 'overtime', 'annual', 'spot', 'other'\]/);
  });

  it('★ والحالات كذلك', () => {
    expect(PAGE_CODE).toMatch(/BONUS_STATUSES\.map/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ انتقالات الحالة', () => {
  it('جدول الانتقالات في القاعدة', () => {
    const b = fnBody('bonus_decide');
    expect(b).toMatch(/WHEN 'pending'\s+THEN p_decision IN \('approved','cancelled'\)/);
    expect(b).toMatch(/WHEN 'approved' THEN p_decision IN \('paid','cancelled'\)/);
    expect(b).toMatch(/ELSE FALSE/);
    expect(b).toMatch(/BONUS_BAD_TRANSITION/);
  });

  it('جدول الواجهة يمنع الدفع اليدوي بعد تكامل 0377', () => {
    const m = SVC_CODE.match(
      /BONUS_TRANSITIONS: Record<BonusDbStatus, BonusDbStatus\[\]> = \{([\s\S]*?)\};/);
    expect(m).toBeTruthy();
    const t = (m as RegExpMatchArray)[1];
    expect(t).toMatch(/pending:\s*\['approved', 'cancelled'\]/);
    expect(t).toMatch(/approved:\s*\['cancelled'\]/);
    expect(t).not.toMatch(/approved:\s*\[[^\]]*'paid'/);
    expect(t).toMatch(/paid:\s*\[\]/);
    expect(t).toMatch(/cancelled:\s*\[\]/);
  });

  it('★ الصفحة تعرض الانتقالات المسموحة فقط', () => {
    expect(PAGE_CODE).toMatch(/BONUS_TRANSITIONS\[bonus\.status\]/);
  });

  it('سبب الإلغاء إلزاميّ في الطبقتين', () => {
    expect(fnBody('bonus_decide')).toMatch(/BONUS_NO_NOTE/);
    expect(PAGE_CODE).toMatch(/note\.trim\(\) === ''/);
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
    for (const f of ['bonus_summary', 'bonus_board']) {
      expect(fnBody(f), f).toMatch(/IF NOT public\.current_user_is_staff\(\) THEN/);
    }
  });

  it('الكتابة محصورة بـadmin و hr', () => {
    for (const f of ['bonus_create', 'bonus_decide', 'bonus_archive']) {
      expect(fnBody(f), f).toMatch(/v_role NOT IN \('admin','hr'\)/);
    }
  });

  it('كل دالة تُرشِّح بالمستأجر', () => {
    for (const f of NEW_FNS) {
      expect(fnBody(f), `${f}: ترشيح`).toMatch(/tenant_id = v_tenant/);
    }
  });

  it('الإنشاء يتحقّق أن الموظف من المستأجر نفسه', () => {
    expect(fnBody('bonus_create'))
      .toMatch(/FROM public\.employees e[\s\S]{0,140}e\.tenant_id = v_tenant/);
  });

  it('الملخّص واللوحة يستبعدان المؤرشف افتراضياً', () => {
    expect(fnBody('bonus_summary')).toMatch(/b\.archived_at IS NULL/);
    expect(fnBody('bonus_board')).toMatch(/p_include_archived OR b\.archived_at IS NULL/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطل ⑩ — لا نقل جداول إلى المتصفّح', () => {
  it('اللوحة لها حدّ أعلى', () => {
    expect(fnBody('bonus_board'))
      .toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 200\), 1\)/);
  });

  it('الصفحة تمرّر حدّاً صريحاً', () => {
    expect(PAGE_CODE).toMatch(/limit:\s*\d+/);
  });

  it('★★ لا ربط بخريطة في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/new Map<string, EmployeeSummary>/);
    expect(PAGE_CODE).not.toMatch(/WithEmployee/);
    expect(PAGE_CODE).not.toMatch(/employeeService\.findAll/);
  });

  it('البطاقات محسوبة في القاعدة', () => {
    expect(PAGE_CODE).toMatch(/bonusSdk\.summary\(\)/);
    expect(PAGE_CODE).not.toMatch(/\.reduce\(\(s, b\)/);
  });

  it('الاسم والقسم والمعتمِد من القاعدة', () => {
    const b = fnBody('bonus_board');
    expect(b).toMatch(/COALESCE\(NULLIF\(btrim\(e\.full_name_ar\), ''\)/);
    expect(b).toMatch(/'موظف ' \|\| COALESCE\(e\.employee_code/);
    expect(b).toMatch(/ap\.full_name/);
  });

  it('مبلغ الشهر بتوقيت بغداد', () => {
    expect(fnBody('bonus_summary')).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
    expect(fnBody('bonus_summary')).toMatch(/date_trunc\('month', v_today\)/);
  });

  it('★ الملغاة خارج مبلغ الشهر وعدّ الموظفين', () => {
    const b = fnBody('bonus_summary');
    expect(b).toMatch(/WHERE b\.status IN \('approved','paid'\)[\s\S]{0,90}date_trunc/);
    expect(b).toMatch(/count\(DISTINCT b\.employee_id\) FILTER \([\s\S]{0,60}'approved','paid'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ سياسة المنصة — محظورات', () => {
  it('لا confirm/prompt/alert في الصفحة', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★★ لا as any ولا : any', () => {
    expect(SVC_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/\bas any\b/);
    expect(PAGE_CODE).not.toMatch(/:\s*any\b/);
    expect(SVC_CODE).not.toMatch(/:\s*any\b/);
  });

  it('★★ الصفحة لا تلمس Supabase مباشرةً', () => {
    expect(PAGE_CODE).not.toMatch(/from ['"].*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★ اليوم بتوقيت بغداد في الصفحة أيضاً', () => {
    expect(PAGE_CODE).toMatch(/timeZone:\s*'Asia\/Baghdad'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ التسجيل والترابط', () => {
  it('الخدمة مُصدَّرة من فهرس SDK', () => {
    expect(INDEX).toMatch(
      /export \{[\s\S]{0,300}bonusSdk[\s\S]{0,300}\} from '\.\/BonusService'/);
    expect(INDEX).toMatch(/BONUS_STATUSES/);
    expect(INDEX).toMatch(/BONUS_TYPES/);
  });

  it('الصفحة تستورد من الفهرس لا من الملف مباشرةً', () => {
    expect(PAGE_CODE).toMatch(/from '\.\.\/\.\.\/services\/sdk'/);
    expect(PAGE_CODE).not.toMatch(/from '.*sdk\/BonusService'/);
  });

  it('★ المكوّنات المشتركة من LoansPage لا مكرَّرة', () => {
    expect(PAGE_CODE).toMatch(
      /import \{ Modal, FormField, ModalActions, EmployeePicker \} from '\.\/LoansPage'/);
    for (const c of ['Modal', 'FormField', 'ModalActions', 'EmployeePicker']) {
      expect(PAGE_CODE, `${c} مكرَّر`).not.toMatch(
        new RegExp(`function ${c}\\s*\\(`));
    }
  });

  it('أدوات التحقق الثلاث موجودة', () => {
    for (const p of [
      'tools/dev/verify-bonus-lifecycle-0358.sql',
      'tools/dev/verify-bonus-lifecycle-0358-rls.sh',
      'tools/dev/_invert_0358.py',
    ]) {
      expect(existsSync(resolve(root, p)), p).toBe(true);
    }
  });
});
