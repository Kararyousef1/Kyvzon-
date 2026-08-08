/**
 * ════════════════════════════════════════════════════════════════
 *  healthSafetyContract.test.ts — عقد الصحة والسلامة (0369)
 *
 *  ★★★ فحصٌ **ثابت** على النصّ: لا Postgres ولا متصفّح.
 *      السلوك يُثبته `verify-health-safety-0369.sql` (44 تأكيداً)
 *      و`-rls.sh` (30 تأكيداً بدور `authenticated` حقيقيّ)
 *      و`_invert_0369.py` (53/53 عكساً + مكافئٌ موثَّق).
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG = read('supabase/migrations/0369_health_safety_integrity.sql');
const SDK = read('src/services/sdk/OccupationalSafetyService.ts');
const PAGE = read('src/pages/hr/HealthSafetyPage.tsx');
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
  expect(body.length, `جسم ${name} قصيرٌ مريب`).toBeGreaterThan(200);
  return body;
}

describe('0369 — ★★★★ العطل ①: تصنيفات السلامة', () => {
  it('★★★★ التصنيفات الثلاثة أُضيفت إلى CHECK', () => {
    const chk = migBody.match(/ADD CONSTRAINT incidents_category_check[\s\S]*?\);/);
    expect(chk).toBeTruthy();
    const body = (chk as RegExpMatchArray)[0];
    for (const c of ['work_injury', 'near_miss', 'security_incident']) {
      expect(body, `التصنيف ${c} غائب`).toContain(`'${c}'`);
    }
  });

  it('★★★ والسبعة الأصلية باقية — لا انحدار', () => {
    const chk = migBody.match(/ADD CONSTRAINT incidents_category_check[\s\S]*?\);/);
    const body = (chk as RegExpMatchArray)[0];
    for (const c of ['technical', 'hr', 'management', 'workplace',
                     'salary', 'safety', 'other']) {
      expect(body, `التصنيف الأصليّ ${c} سقط`).toContain(`'${c}'`);
    }
  });

  it('★★★ health_safety لم يُضَف — كان شيفرةً ميتة', () => {
    const chk = migBody.match(/ADD CONSTRAINT incidents_category_check[\s\S]*?\);/);
    expect((chk as RegExpMatchArray)[0], 'health_safety أُضيف بلا داعٍ')
      .not.toContain('health_safety');
  });

  it('★★★★ اللوح يُرشّح بالتصنيفات الأربعة', () => {
    expect(fnBody('safety_incident_board')).toMatch(
      /i\.category IN \('safety','work_injury','near_miss','security_incident'\)/,
    );
  });
});

describe('0369 — المفاتيح والقيود', () => {
  it('★★★★ FK الحادث **مركَّب** و RESTRICT', () => {
    expect(migBody).toMatch(
      /FOREIGN KEY \(incident_id, tenant_id\)\s*\n?\s*REFERENCES public\.incidents \(id, tenant_id\) ON DELETE RESTRICT/,
    );
    // ★★★ القيد القديم SET NULL أُسقط
    expect(migBody).toMatch(
      /DROP CONSTRAINT IF EXISTS corrective_actions_incident_id_fkey/,
    );
    expect(migBody, 'FK مفرد عاد').not.toMatch(
      /FOREIGN KEY \(incident_id\)\s*\n?\s*REFERENCES public\.incidents \(id\)/,
    );
  });

  it('★★★ المفاتيح الثلاثة إلى profiles مركَّبة', () => {
    for (const c of ['fk_capa_owner_tenant', 'fk_capa_creator_tenant',
                     'fk_capa_completer_tenant']) {
      expect(migBody, c + ' غائب').toContain(c);
    }
    expect(migBody).toMatch(
      /FOREIGN KEY \(owner_id, tenant_id\)\s*\n?\s*REFERENCES public\.profiles \(id, tenant_id\)/,
    );
  });

  it('★ الفهرس الفريد على incidents(id, tenant_id) يسبق FK', () => {
    const idx = migBody.indexOf('uq_incidents_id_tenant');
    const fk = migBody.indexOf('fk_capa_incident_tenant');
    expect(idx).toBeGreaterThan(-1);
    expect(idx, 'الفهرس بعد المفتاح ⇒ المايجريشن تفشل').toBeLessThan(fk);
  });

  it('★★★ القيود الثلاثة قائمة', () => {
    for (const c of ['chk_capa_title_present', 'chk_capa_completed_complete',
                     'chk_capa_cancelled_complete']) {
      expect(migBody, c + ' غائب').toContain(c);
    }
  });

  it('★★★ قيدا الإنجاز والإلغاء ثنائيّا الاتّجاه', () => {
    expect(migBody).toMatch(
      /chk_capa_completed_complete[\s\S]{0,320}?status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL/,
    );
    expect(migBody).toMatch(
      /chk_capa_cancelled_complete[\s\S]{0,420}?status <> 'cancelled' AND cancelled_at IS NULL/,
    );
  });

  it('★★ أعمدة دورة الحياة أُضيفت', () => {
    for (const c of ['cancel_reason', 'cancelled_at', 'cancelled_by',
                     'started_at', 'verification_note']) {
      expect(migBody, c + ' غائب').toMatch(
        new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${c}\\b`),
      );
    }
  });
});

describe('0369 — المحفّزات', () => {
  it('★★★★ إفراغُ الحقول عند التحديث **وحده** — لا في INSERT', () => {
    const b = fnBody('tg_capa_guard');
    // ★★★★ أوّل صياغةٍ أفرغت في INSERT أيضاً فابتلعت التناقض صامتاً.
    //   أسقطها تأكيدي 2.5b. الحارس: الإفراغ داخل IF TG_OP = 'UPDATE'.
    expect(b).toMatch(
      /IF TG_OP = 'UPDATE' THEN\s*\n\s*IF NEW\.status <> 'completed' THEN/,
    );
  });

  it('★★★ لحظات الدورة آلية', () => {
    const b = fnBody('tg_capa_guard');
    expect(b).toMatch(/NEW\.started_at := now\(\)/);
    expect(b).toMatch(/NEW\.completed_at := COALESCE\(NEW\.completed_at, now\(\)\)/);
    expect(b).toMatch(/NEW\.completed_by := COALESCE\(NEW\.completed_by, auth\.uid\(\)\)/);
  });

  it('★★ حارس الاستحقاق القديم — وغيرُ صارمٍ بلا داعٍ', () => {
    const b = fnBody('tg_capa_guard');
    expect(b).toMatch(/CAPA_DUE_TOO_OLD/);
    expect(b).toMatch(/NEW\.due_date < v_today - 365/);
    expect(b, 'الحدّ صار صارماً').not.toMatch(/NEW\.due_date <= v_today - 365/);
  });

  it('★★★ توقيت بغداد صريحاً', () => {
    expect(fnBody('tg_capa_guard')).toMatch(/AT TIME ZONE 'Asia\/Baghdad'/);
  });

  it('★★ المحفّز يُجمّد المستأجر والمُنشئ', () => {
    const b = fnBody('tg_capa_guard');
    // ★ درس no-regex-spaces (0364/0368): مسافتان في regex ⇒ {2}
    expect(b).toMatch(/NEW\.tenant_id {2}:= OLD\.tenant_id/);
    expect(b).toMatch(/NEW\.created_by := COALESCE\(OLD\.created_by, NEW\.created_by\)/);
  });

  it('★★ منع الحذف — نظير trg_block_incident_delete (0338)', () => {
    expect(migBody).toMatch(/CAPA_DELETE_BLOCKED/);
    expect(migBody).toMatch(
      /CREATE TRIGGER trg_block_capa_delete\s*\n?\s*BEFORE DELETE ON public\.corrective_actions/,
    );
  });
});

describe('0369 — الدوال السبع', () => {
  const FNS = ['safety_incident_board', 'capa_board', 'health_safety_summary',
               'capa_open', 'capa_start', 'capa_complete', 'capa_cancel'];

  it('★ الدوال السبع مُعرَّفة ومسبوقةٌ بـDROP', () => {
    for (const f of FNS) {
      expect(migBody, f + ' غائبة').toMatch(new RegExp(`CREATE FUNCTION public\\.${f}\\b`));
      expect(migBody, f + ' بلا DROP').toMatch(
        new RegExp(`DROP FUNCTION IF EXISTS public\\.${f}\\b`),
      );
    }
  });

  it('★★★ anon مُستثنى من كل دالة', () => {
    for (const f of FNS) {
      expect(migBody, f + ' بلا REVOKE').toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\b[^;]*FROM anon;`),
      );
    }
  });

  it('★★ كلُّ دالةٍ تُثبّت search_path', () => {
    for (const f of FNS) {
      expect(fnBody(f), f + ' بلا search_path').toMatch(/SET search_path TO 'public'/);
    }
  });

  it('★★★ اللوحان والملخّص SECURITY INVOKER', () => {
    for (const f of ['safety_incident_board', 'capa_board', 'health_safety_summary']) {
      expect(fnBody(f), f + ' ليست INVOKER').toMatch(/SECURITY INVOKER/);
      expect(fnBody(f), f + ' صارت DEFINER').not.toMatch(/SECURITY DEFINER/);
    }
  });

  it('★★★★ needs_capa يستثني الملغى', () => {
    expect(fnBody('safety_incident_board')).toMatch(
      /NOT EXISTS \(SELECT 1 FROM public\.corrective_actions a[\s\S]{0,180}?a\.status <> 'cancelled'\)\)/,
    );
  });

  it('★★★★ الإبلاغ المجهول محميّ (درس 0338)', () => {
    expect(fnBody('safety_incident_board')).toMatch(
      /CASE WHEN i\.is_anonymous THEN 'مُبلِّغ مجهول'/,
    );
  });

  it('★★ اللوح يستثني المؤرشف', () => {
    expect(fnBody('safety_incident_board')).toMatch(/i\.archived_at IS NULL/);
    expect(fnBody('health_safety_summary')).toMatch(/archived_at IS NULL/);
  });

  it('★★★ is_overdue يشترط ألّا يكون مُنجَزاً', () => {
    expect(fnBody('capa_board')).toMatch(
      /a\.due_date < v_today\s*\n\s*AND a\.status IN \('open','in_progress'\)/,
    );
  });

  it('★★★ ترتيب اللوحين حتميّ', () => {
    expect(fnBody('safety_incident_board')).toMatch(
      /ORDER BY\s*\n\s*CASE WHEN i\.status IN \('resolved','closed'\) THEN 1 ELSE 0 END,/,
    );
    expect(fnBody('capa_board')).toMatch(
      /ORDER BY\s*\n\s*CASE WHEN a\.status IN \('completed','cancelled'\) THEN 1 ELSE 0 END,/,
    );
    expect(fnBody('safety_incident_board')).toMatch(/i\.id DESC/);
    expect(fnBody('capa_board')).toMatch(/a\.id DESC/);
  });

  it('★★★ حرّاس القرار', () => {
    expect(fnBody('capa_open')).toMatch(/CAPA_NOT_STAFF/);
    expect(fnBody('capa_open')).toMatch(/CAPA_TITLE_REQUIRED/);
    expect(fnBody('capa_complete')).toMatch(/CAPA_CANCELLED/);
    expect(fnBody('capa_cancel')).toMatch(/CAPA_CANCEL_REASON_REQUIRED/);
    expect(fnBody('capa_cancel')).toMatch(/CAPA_ALREADY_COMPLETED/);
  });

  it('★★★ عدّاد فجوة CAPA حيٌّ لا صفرٌ بنيويّ', () => {
    expect(fnBody('health_safety_summary')).toMatch(
      /severity IN \('high','critical'\)[\s\S]{0,300}?a\.status <> 'cancelled'\)\)::INTEGER/,
    );
  });
});

describe('0369 — السياسات', () => {
  it('★★★ البوّابة على وحدة hr و RESTRICTIVE', () => {
    const p = migBody.match(
      /CREATE POLICY hybrid_gate_corrective_actions[\s\S]*?;/,
    );
    expect(p).toBeTruthy();
    const body = (p as RegExpMatchArray)[0];
    expect(body).toMatch(/AS RESTRICTIVE/);
    expect(body).toMatch(/hybrid_allows_module\('hr'\)/);
    expect(body, 'البوّابة ما زالت على admin').not.toMatch(/'admin'/);
  });

  it('★★★ المالك يقرأ إجراءه · و ALL أُسقطت', () => {
    expect(migBody).toMatch(
      /kyvzon_corrective_actions_select[\s\S]{0,220}?owner_id = auth\.uid\(\)/,
    );
    expect(migBody).toMatch(
      /DROP POLICY IF EXISTS kyvzon_corrective_actions_write/,
    );
    const created = migBody.match(
      /CREATE POLICY \w+ ON public\.corrective_actions[\s\S]*?;/g,
    ) ?? [];
    for (const p of created) {
      if (p.includes('RESTRICTIVE')) continue;
      expect(p, 'سياسة ALL بيرمِسِف عادت').not.toMatch(/FOR ALL/);
    }
  });

  it('★★★ الكتابة تبقى للموارد البشرية وحدها', () => {
    for (const n of ['kyvzon_corrective_actions_insert',
                     'kyvzon_corrective_actions_update']) {
      const p = migBody.match(new RegExp(`CREATE POLICY ${n}[\\s\\S]*?;`));
      expect(p, n + ' غائبة').toBeTruthy();
      expect((p as RegExpMatchArray)[0]).toMatch(/current_user_is_staff\(\)/);
      expect((p as RegExpMatchArray)[0], n + ' فتحت للمالك')
        .not.toMatch(/owner_id = auth\.uid\(\)/);
    }
  });
});

describe('0369 — طبقة SDK', () => {
  it('★ مُصدَّرة من index.ts مع أنواعها', () => {
    expect(INDEX).toMatch(
      /occupationalSafetySdk[\s\S]{0,900}?from '\.\/OccupationalSafetyService'/,
    );
    expect(INDEX).toMatch(/SafetyIncidentRow, CapaRow, HealthSafetySummary/);
  });

  it('★★★★ المفردات في SDK تطابق القاعدة', () => {
    const cats = sdkBody.match(/SAFETY_CATEGORIES = \[([\s\S]*?)\] as const/);
    expect(cats).toBeTruthy();
    const items = (cats as RegExpMatchArray)[1].match(/'[a-z_]+'/g) ?? [];
    expect(items.length, 'التصنيفات ليست أربعة').toBe(4);
    for (const it of items) {
      expect(migBody, `التصنيف ${it} في SDK وليس في CHECK`).toContain(it);
    }
    // ★★★ ولا health_safety
    expect((cats as RegExpMatchArray)[1], 'health_safety عاد')
      .not.toContain('health_safety');
  });

  it('★★ دوال العرض تُعيد النصّ الخامّ', () => {
    for (const f of ['safetyCategoryLabel', 'safetySeverityLabel',
                     'safetyStateLabel', 'capaStateLabel', 'capaPriorityLabel']) {
      expect(sdkBody, f + ' بلا احتياطيّ').toMatch(
        new RegExp(`${f} = \\(v: string\\): string =>[\\s\\S]{0,90}?\\?\\? v;`),
      );
    }
  });

  it('★★★ الخدمة لا تلمس الجدولين مباشرةً', () => {
    expect(sdkBody).not.toMatch(/\.from\(\s*'corrective_actions'/);
    expect(sdkBody).not.toMatch(/\.from\(\s*'incidents'/);
    expect(sdkBody).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it('★ numOrNull يحفظ التمييز · وصفر any', () => {
    expect(sdkBody).toMatch(/const numOrNull[\s\S]{0,200}?v === ''\) return null/);
    expect(sdkBody).not.toMatch(/\bas any\b/);
    expect(sdkBody).not.toMatch(/:\s*any\b/);
    expect(sdkBody).not.toMatch(/any\[\]/);
  });
});

describe('0369 — الصفحة', () => {
  it('★★★★ العطل ①: التصنيفات من SAFETY_CATEGORIES لا مُبرمجة', () => {
    // ★★★ لا مفردةً إنجليزيةً مُبرمجةً في نصّ الصفحة
    expect(pageBody, "safetyCategories عادت").not.toMatch(/safetyCategories/);
    expect(pageBody, "'health_safety' عاد").not.toMatch(/'health_safety'/);
    expect(pageBody, "'work_injury' مُبرمج").not.toMatch(/'work_injury'/);
    expect(pageBody, "'near_miss' مُبرمج").not.toMatch(/'near_miss'/);
    // ★ بل تُقرأ من الصفّ عبر دالة العرض
    expect(pageBody).toMatch(/safetyCategoryLabel\(String\(/);
  });

  it('★★★★ العطل ⑨: لافتة فجوة CAPA', () => {
    expect(pageBody).toMatch(/needsCapa/);
    expect(pageBody).toMatch(/حادثاً جسيماً مفتوحاً بلا إجراءٍ تصحيحيّ/);
  });

  it('★★★ العطل ⑦: زرُّ الإلغاء موجود', () => {
    expect(pageBody).toMatch(/occupationalSafetySdk\.cancelAction\(/);
    expect(pageBody).toMatch(/سبب الإلغاء مطلوب/);
  });

  it('★★★ دورة CAPA كاملة عبر الدوال', () => {
    expect(pageBody).toMatch(/occupationalSafetySdk\.openAction\(/);
    expect(pageBody).toMatch(/occupationalSafetySdk\.startAction\(/);
    expect(pageBody).toMatch(/occupationalSafetySdk\.completeAction\(/);
  });

  it('★★★ العطل ⑩: التأخّر مرئيّ', () => {
    expect(pageBody).toMatch(/row\.isOverdue/);
    expect(pageBody).toMatch(/تجاوز موعد استحقاقه/);
  });

  it('★★★ العطلان ⑮/⑯: صفر any ولا Map يدويّ', () => {
    expect(pageBody, 'useState<any[]> عاد').not.toMatch(/useState<any/);
    expect(pageBody).not.toMatch(/\bas any\b/);
    expect(pageBody).not.toMatch(/:\s*any\b/);
    expect(pageBody).not.toMatch(/any\[\]/);
    expect(pageBody, 'employeeMap عاد').not.toMatch(/employeeMap/);
    expect(pageBody, 'employeeService عاد').not.toMatch(/employeeService/);
  });

  it('★★★ العطل ⑰: لا ترشيح في المتصفّح', () => {
    expect(pageBody, 'ترشيحٌ بالتصنيف في المتصفّح')
      .not.toMatch(/\.filter\([^)]*category/);
    expect(pageBody).toMatch(/occupationalSafetySdk\.incidents\(/);
  });

  it('★★★ العطل ⑲: لا slice يُخفي البقيّة', () => {
    expect(pageBody, '.slice عاد').not.toMatch(/\.slice\(0,\s*12\)/);
  });

  it('★★★ العطل ⑳: كل نداءٍ داخل try/catch', () => {
    // ★ الصفحة القديمة: completeAction(...).then(loadData) بلا catch
    expect(pageBody, 'نداءٌ بـ.then بلا catch')
      .not.toMatch(/\.then\(load/);
  });

  it('★★★ العطل ⑱: لا مفردةً تُعرض خامّةً في التفاصيل', () => {
    const rows = pageBody.match(/<DetailRow[\s\S]*?\/>/g) ?? [];
    expect(rows.length, 'لا صفوف تفاصيل').toBeGreaterThan(10);
    for (const r of rows) {
      for (const f of ['category', 'severity', 'status', 'priority']) {
        expect(r, `${f} تُعرض خامّاً`).not.toMatch(
          new RegExp(`value=\\{[a-zA-Z]+\\.${f}\\}`),
        );
      }
    }
  });

  it('★★★ الصفحة لا تلمس Supabase ولا الخدمات القديمة', () => {
    expect(pageBody).not.toMatch(/from '.*supabase/);
    expect(pageBody).not.toMatch(/incidentService|correctiveActionService/);
  });

  it('★★ توقيت بغداد · والممنوعات', () => {
    expect(pageBody).toMatch(/timeZone: 'Asia\/Baghdad'/);
    expect(pageBody).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
  });
});
