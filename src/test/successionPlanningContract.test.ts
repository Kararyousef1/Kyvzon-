/**
 * ════════════════════════════════════════════════════════════════
 *  عقد 0361 — سلامة تخطيط التعاقب
 * ════════════════════════════════════════════════════════════════
 *
 * ★★★ ما **لا** يُثبَت هنا: الفحص الثابت لا يرى RLS ولا يشغّل SQL.
 *   · السلوك مُختبَر في `tools/dev/verify-succession-planning-0361.sql`
 *     — **115** تأكيداً بأرقام محسوبة يدوياً
 *   · العزل مُثبَت في `…-0361-rls.sh` بدور `authenticated` حقيقيّ
 *     — **42** فحصاً
 *   · التغطية مُثبتة في `_invert_0361.py` — **37/37** عكساً أسقط
 *     الاختبار (+3 تكافؤات مُثبتة)
 *
 *   هذا الملف يحرس ألّا تعود **الأسباب الجذرية**: ترتيبٌ أبجديّ يُقصي
 *   الأجهز · مفاتيح أجنبية ناقصة تسمح بشاغلٍ من شركةٍ أخرى · خلافةُ
 *   النفس · درجةٌ تناقض مستواها · `status` بلا أثر · حذفٌ نهائيّ ·
 *   1+N نداءً.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const MIG_PATH = 'supabase/migrations/0361_succession_planning_integrity.sql';
const MIG     = read(MIG_PATH);
const SERVICE = read('src/services/sdk/SuccessionPlanningService.ts');
const PAGE    = read('src/pages/hr/SuccessionPlanningPage.tsx');
const INDEX   = read('src/services/sdk/index.ts');

const codeTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const codeSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
const stmtSql = (s: string) => codeSql(s).replace(/'(?:[^']|'')*'/g, " '' ");

// ── ★ المُجرِّدات نفسها مُختبَرة (درس 0355) ──
describe('★★ المُجرِّدات تعمل فعلاً', () => {
  it('codeTs يُسقط التعليق ويُبقي الشيفرة', () => {
    expect(codeTs("/* findByPosition */ const x=1;")).not.toMatch(/findByPosition/);
    expect(codeTs("// readiness_level\nconst y=1;")).not.toMatch(/readiness_level/);
    expect(codeTs("const s = c.rank === 1;")).toMatch(/rank/);
  });
  it('stmtSql يُسقط السلاسل ويُبقي المعرّفات', () => {
    expect(stmtSql("COMMENT ON X IS 'ready_now مذكور';")).not.toMatch(/ready_now/);
    expect(stmtSql("  AND c.status = 'active'")).toMatch(/c\.status/);
    expect(stmtSql("SELECT 'it''s ok' AS x;")).not.toMatch(/ok/);
  });
});

const MIG_CODE  = codeSql(MIG);
const MIG_STMT  = stmtSql(MIG);
const PAGE_CODE = codeTs(PAGE);
const SVC_CODE  = codeTs(SERVICE);

/** ★ درس 0355: على النصّ المُجرَّد من التعليقات */
const fnBody = (name: string): string => {
  const i = MIG_CODE.indexOf(`CREATE FUNCTION public.${name}`);
  expect(i, `الدالة ${name} غير موجودة في ${MIG_PATH}`).toBeGreaterThan(-1);
  const j = MIG_CODE.indexOf('$$;', i);
  expect(j, `نهاية ${name} غير موجودة`).toBeGreaterThan(i);
  return MIG_CODE.slice(i, j);
};

const NEW_FNS = [
  'succession_readiness_rank', 'succession_board', 'succession_summary',
  'succession_position_upsert', 'succession_candidate_nominate',
  'succession_candidate_set_status', 'succession_position_close',
];

const LEVELS = ['ready_now', 'ready_6_months', 'ready_12_months', 'future_potential'];
const RISKS  = ['critical', 'high', 'medium', 'low'];

// ═══════════════════════════════════════════════════════════════
describe('0361 — بنية المايجريشن', () => {
  it('الملف موجود', () => {
    expect(existsSync(resolve(root, MIG_PATH))).toBe(true);
  });

  it('معاملة واحدة BEGIN/COMMIT', () => {
    expect(MIG_CODE).toMatch(/^\s*BEGIN;/m);
    expect(MIG_CODE).toMatch(/^\s*COMMIT;\s*$/m);
  });

  it.each(NEW_FNS)('%s مُعرَّفة بـDROP صريح قبلها', (fn) => {
    // ★ CREATE OR REPLACE لا يغيّر نوع الإرجاع ⇒ DROP إلزاميّ
    expect(MIG_CODE).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`));
    expect(MIG_CODE).toMatch(new RegExp(`CREATE FUNCTION public\\.${fn}\\(`));
  });

  it.each(NEW_FNS.filter((f) => f !== 'succession_readiness_rank'))(
    '%s تُثبّت search_path', (fn) => {
      expect(fnBody(fn)).toMatch(/SET search_path = public/);
    });

  it.each(NEW_FNS)('%s: REVOKE عن anon موجود', (fn) => {
    // ★★★ 0268 يمنح authenticated EXECUTE على كل دالة جديدة تلقائياً
    //   (pg_default_acl) ⇒ REVOKE عن anon هو الحارس الحقيقيّ لا GRANT.
    const i = MIG_CODE.indexOf(`REVOKE ALL ON FUNCTION public.${fn}(`);
    expect(i, `REVOKE مفقود لـ${fn}`).toBeGreaterThan(-1);
    expect(MIG_CODE.slice(i, i + 600)).toMatch(/FROM anon;/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ①: «جاهز الآن» لم يعد يُقصى', () => {
  it('رتبة الجاهزية منطقية في القاعدة — ready_now = 1', () => {
    const b = fnBody('succession_readiness_rank');
    expect(b).toMatch(/WHEN 'ready_now'\s+THEN 1/);
    expect(b).toMatch(/WHEN 'future_potential' THEN 4/);
  });

  it('الدالة IMMUTABLE (تصلح داخل ORDER BY وفهرس)', () => {
    expect(fnBody('succession_readiness_rank')).toMatch(/LANGUAGE sql IMMUTABLE/);
  });

  it('★★★ واللوح يرتّب بها لا أبجدياً', () => {
    const b = fnBody('succession_board');
    expect(b).toMatch(/ORDER BY public\.succession_readiness_rank\(c\.readiness_level\)/);
    expect(b).toMatch(/c\.readiness_score DESC/);
    // العطل: ORDER BY readiness_level وحده
    expect(b, 'الترتيب الأبجديّ عاد').not.toMatch(/ORDER BY c\.readiness_level\s*$/m);
  });

  it('★ والرتبة تُصدَّر في JSONB ليعرفها العميل', () => {
    expect(fnBody('succession_board')).toMatch(/'rank', public\.succession_readiness_rank/);
    expect(SVC_CODE).toMatch(/rank:\s*num\(c\.rank\)/);
  });

  it('★★ والخدمة تُطابق الرتبة نفسها (مصدرٌ واحد للحقيقة)', () => {
    expect(SVC_CODE).toMatch(/READINESS_RANK[\s\S]{0,200}ready_now:\s*1/);
    expect(SVC_CODE).toMatch(/future_potential:\s*4/);
  });

  it('★★★ والصفحة لا ترتّب بنفسها — تعرض ما جاء مرتَّباً', () => {
    expect(PAGE_CODE).toMatch(/p\.candidates\.slice\(0, 3\)/);
    expect(PAGE_CODE, 'ترتيبٌ يدويّ عاد').not.toMatch(/\.sort\(/);
    expect(PAGE_CODE, 'orderBy readiness_level عاد')
      .not.toMatch(/orderBy:\s*'readiness_level'/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ②/③: الشاغل والقسم من المستأجر نفسه', () => {
  it('FK مركَّب على الشاغل', () => {
    expect(MIG_CODE).toMatch(/critical_positions_incumbent_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(incumbent_employee_id, tenant_id\)/);
    expect(MIG_CODE).toMatch(/REFERENCES public\.employees \(id, tenant_id\)/);
  });

  it('FK مركَّب على القسم', () => {
    expect(MIG_CODE).toMatch(/critical_positions_department_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(department_id, tenant_id\)/);
  });

  it('★ والفهارس الفريدة التي تجعلهما ممكنَين', () => {
    expect(MIG_CODE).toMatch(/uq_employees_id_tenant|uq_critical_positions_id_tenant/);
    expect(MIG_CODE).toMatch(/uq_departments_id_tenant/);
  });

  it('★★ ON DELETE SET NULL — حذف الموظف لا يُبيد المنصب', () => {
    const i = MIG_CODE.indexOf('critical_positions_incumbent_tenant_fkey');
    expect(MIG_CODE.slice(i, i + 400)).toMatch(/ON DELETE SET NULL/);
  });

  it('والدالة تحرسهما برمزين صريحين', () => {
    const b = fnBody('succession_position_upsert');
    expect(b).toMatch(/SUCCESSION_INCUMBENT_NOT_FOUND/);
    expect(b).toMatch(/SUCCESSION_DEPARTMENT_NOT_FOUND/);
    expect(b).toMatch(/e\.tenant_id = v_tenant/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ④/⑤/⑥: المرشّح والمنصب من المستأجر نفسه', () => {
  it('FK مركَّب على المرشّح', () => {
    expect(MIG_CODE).toMatch(/succession_candidates_employee_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(employee_id, tenant_id\)/);
  });

  it('FK مركَّب على المنصب', () => {
    expect(MIG_CODE).toMatch(/succession_candidates_position_tenant_fkey/);
    expect(MIG_CODE).toMatch(/FOREIGN KEY \(critical_position_id, tenant_id\)/);
  });

  it('★★★ والقيد القديم (CASCADE) أُسقط صراحةً — العطل ⑪', () => {
    expect(MIG_CODE).toMatch(
      /DROP CONSTRAINT IF EXISTS succession_candidates_critical_position_id_fkey/);
    // ★ التعريف مقسومٌ على أسطر: نأخذ آخر ذكرٍ للاسم (داخل ADD CONSTRAINT)
    //   لا أوّله (داخل DROP CONSTRAINT IF EXISTS).
    const i = MIG_CODE.lastIndexOf('succession_candidates_position_tenant_fkey');
    expect(i, 'تعريف القيد غير موجود').toBeGreaterThan(-1);
    const def = MIG_CODE.slice(i, i + 400);
    expect(def).toMatch(/FOREIGN KEY \(critical_position_id, tenant_id\)/);
    expect(def).toMatch(/ON DELETE RESTRICT/);
    expect(def).not.toMatch(/ON DELETE CASCADE/);
  });

  it('والدالة تحرسهما برمزين صريحين', () => {
    const b = fnBody('succession_candidate_nominate');
    expect(b).toMatch(/SUCCESSION_POSITION_NOT_FOUND/);
    expect(b).toMatch(/SUCCESSION_EMPLOYEE_NOT_FOUND/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑦: خلافة النفس ممنوعة', () => {
  it('محفّز على المرشّحين برمز صريح', () => {
    expect(MIG_CODE).toMatch(/tg_succession_guard_self/);
    expect(MIG_CODE).toMatch(/SUCCESSION_SELF_NOMINATION/);
    expect(MIG_CODE).toMatch(/BEFORE INSERT OR UPDATE ON public\.succession_candidates/);
  });

  it('★★ والحارس المعاكس: المرشّح النشط لا يصير شاغلاً', () => {
    expect(MIG_CODE).toMatch(/tg_position_guard_incumbent/);
    expect(MIG_CODE).toMatch(/SUCCESSION_INCUMBENT_IS_CANDIDATE/);
    expect(MIG_CODE).toMatch(/BEFORE UPDATE OF incumbent_employee_id/);
  });

  it('★ والمحفّز يملأ nominated_by من auth.uid()', () => {
    const i = MIG_CODE.indexOf('CREATE OR REPLACE FUNCTION public.tg_succession_guard_self');
    expect(MIG_CODE.slice(i, MIG_CODE.indexOf('$$;', i)))
      .toMatch(/NEW\.nominated_by := COALESCE\(NEW\.nominated_by, auth\.uid\(\)\)/);
  });

  it('★ والصفحة تُخبر المستخدم بالقاعدة قبل أن يصطدم بها', () => {
    expect(PAGE_CODE).toMatch(/لا يُرشَّح لخلافة نفسه/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ العطلان ⑧/⑨: الدرجة تتّسق مع المستوى وليست فارغة', () => {
  it('قيد الاتّساق في القاعدة بحدوده الثلاثة', () => {
    expect(MIG_CODE).toMatch(/succession_candidates_score_level_chk/);
    expect(MIG_CODE).toMatch(/'ready_now'\s+AND readiness_score >= 80/);
    expect(MIG_CODE).toMatch(/'ready_6_months'\s+AND readiness_score >= 60/);
    expect(MIG_CODE).toMatch(/'ready_12_months'\s+AND readiness_score >= 40/);
  });

  it('والدالة ترمي رمزاً مفهوماً قبل القيد', () => {
    expect(fnBody('succession_candidate_nominate'))
      .toMatch(/SUCCESSION_SCORE_LEVEL_MISMATCH/);
    expect(fnBody('succession_candidate_nominate')).toMatch(/SUCCESSION_SCORE_RANGE/);
  });

  it('★★ readiness_score صار NOT NULL — «غير مُقاس» ليس «صفراً»', () => {
    expect(MIG_CODE).toMatch(
      /ALTER COLUMN readiness_score SET NOT NULL/);
    expect(MIG_CODE).toMatch(/ALTER COLUMN readiness_score SET DEFAULT 25/);
  });

  it('★★ والحدود نفسها في الخدمة — مصدرٌ واحد لا أرقامٌ سحرية', () => {
    expect(SVC_CODE).toMatch(/READINESS_MIN_SCORE[\s\S]{0,200}ready_now:\s*80/);
    expect(SVC_CODE).toMatch(/ready_6_months:\s*60/);
    expect(SVC_CODE).toMatch(/ready_12_months:\s*40/);
    expect(SVC_CODE).toMatch(/export const minScoreFor/);
  });

  it('★★★ والصفحة تمنع التناقض قبل النداء وتُصحّح الدرجة تلقائياً', () => {
    expect(PAGE_CODE).toMatch(/minScoreFor\(candidateForm\.level\)/);
    expect(PAGE_CODE).toMatch(/Math\.max\(candidateForm\.score, min\)/);
    expect(PAGE_CODE, 'رقمٌ سحريّ في الصفحة').not.toMatch(/>= 80|score < 80/);
  });

  it('★ ولا `?? 0` يُخفي غياب القياس (درس 0353)', () => {
    expect(PAGE_CODE, '|| 0 على الدرجة عاد')
      .not.toMatch(/readiness_score \|\| 0|score \|\| 0/);
    expect(SVC_CODE).toMatch(/avgScore:\s*numOrNull/);
    expect(SVC_CODE).toMatch(/bestRank:\s*numOrNull/);
    expect(PAGE_CODE).toMatch(/avgScore == null/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ⑩/⑪: الحذف ممنوع ولا إبادة بالتتالي', () => {
  it('محفّز BEFORE DELETE على الجدولين', () => {
    expect(MIG_CODE).toMatch(/tg_block_succession_delete/);
    expect(MIG_CODE).toMatch(/SUCCESSION_DELETE_BLOCKED/);
    expect(MIG_CODE).toMatch(/trg_block_succession_candidate_delete/);
    expect(MIG_CODE).toMatch(/trg_block_critical_position_delete/);
  });

  it('★ لا حذف في الخدمة ولا في الصفحة', () => {
    expect(SVC_CODE, 'delete عاد للخدمة').not.toMatch(/\.delete\(/);
    expect(PAGE_CODE, 'delete عاد للصفحة').not.toMatch(/\.delete\(|deletePosition/);
    expect(SVC_CODE).toMatch(/setCandidateStatus/);
    expect(SVC_CODE).toMatch(/setPositionStatus/);
  });

  it('★★ ولا confirm/alert/prompt (سياسة المنصة)', () => {
    for (const banned of ['confirm(', 'alert(', 'prompt(']) {
      expect(PAGE_CODE, `${banned} عاد`).not.toContain(banned);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطلان ⑫/⑬: status يعمل فعلاً', () => {
  it('اللوح يفلتر status المنصب', () => {
    expect(fnBody('succession_board'))
      .toMatch(/p_status IS NULL OR p\.status = p_status/);
  });

  it('★★★ واللوح يستبعد المرشّح المعطَّل', () => {
    expect(fnBody('succession_board'))
      .toMatch(/c\.tenant_id = v_tenant AND c\.status = 'active'/);
  });

  it('والملخّص يستبعد المغلق والمعطَّل معاً', () => {
    const b = fnBody('succession_summary');
    expect(b).toMatch(/act AS \(SELECT \* FROM pos WHERE status = 'active'\)/);
    expect(b).toMatch(/c\.status = 'active'/);
  });

  it('★★ ويعدّ المغلق منفصلاً بدل إخفائه', () => {
    expect(fnBody('succession_summary')).toMatch(/out_closed/);
    expect(PAGE_CODE).toMatch(/summary\.closed/);
  });

  it('★★★ والصفحة تفصل تبويبين لا تخلط', () => {
    expect(PAGE_CODE).toMatch(/useState<PositionStatus>\('active'\)/);
    expect(PAGE_CODE).toMatch(/\['active', 'closed'\]/);
  });

  it('★★ والمكشوف-الحرج رقمٌ مستقلّ عن المكشوف', () => {
    const b = fnBody('succession_summary');
    expect(b).toMatch(/out_critical_uncovered/);
    expect(b).toMatch(/a\.risk_level IN \('critical','high'\)/);
    expect(PAGE_CODE).toMatch(/criticalUncovered/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العطل ⑭: استعلامٌ واحد لا 1+N', () => {
  it('الصفحة لا تستدعي findByPosition في حلقة', () => {
    expect(PAGE_CODE, 'findByPosition عاد').not.toMatch(/findByPosition/);
    expect(PAGE_CODE, 'successionCandidateService عاد')
      .not.toMatch(/successionCandidateService|criticalPositionService/);
    expect(PAGE_CODE).toMatch(/successionPlanningSdk\.board\(/);
  });

  it('★★ ولا تجلب كل الموظفين لبناء Map', () => {
    expect(PAGE_CODE).not.toMatch(/new Map\(employees\.map/);
    expect(PAGE_CODE).not.toMatch(/employeeMap/);
    expect(PAGE_CODE).not.toMatch(/departmentMap/);
    expect(PAGE_CODE).not.toMatch(/employeeService\.findAll/);
  });

  it('★ واللوح يُعيد المرشّحين في JSONB واحد', () => {
    const b = fnBody('succession_board');
    expect(b).toMatch(/jsonb_agg/);
    expect(b).toMatch(/out_candidates\s+JSONB|out_candidates/);
  });

  it('★ والصفحة تفكّه بلا any', () => {
    expect(SVC_CODE).toMatch(/function parseCandidates/);
    expect(SVC_CODE).toMatch(/SuccessionCandidate\[\]/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ المفردات والترتيب الحتميّ', () => {
  it.each(LEVELS)('المستوى %s في الخدمة', (l) => {
    expect(SVC_CODE, `${l} غائب`).toContain(`'${l}'`);
  });

  it.each(RISKS)('مستوى الخطر %s في الخدمة', (r) => {
    expect(SVC_CODE, `${r} غائب`).toContain(`'${r}'`);
  });

  it('★ والصفحة تشتقّ القوائم من المصدر لا تكتبها يدوياً', () => {
    expect(PAGE_CODE).toMatch(/READINESS_LEVELS\.map/);
    expect(PAGE_CODE).toMatch(/RISK_LEVELS\.map/);
    expect(PAGE_CODE, 'قائمة يدوية عادت')
      .not.toMatch(/'ready_now',\s*'ready_6_months'/);
  });

  it('★★★ ORDER BY حتميّ بمفاتيح متعددة (درس 0357)', () => {
    const b = fnBody('succession_board');
    expect(b).toMatch(/ORDER BY \(COALESCE\(c\.total,0\) = 0\) DESC/);
    expect(b).toMatch(/b\.created_at DESC, b\.id DESC/);
  });

  it('★ والحدّ الأعلى محصور (لا LIMIT مفتوح)', () => {
    expect(fnBody('succession_board'))
      .toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 200\), 1\), 500\)/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★★ العزل والحرّاس', () => {
  it('لا سياسة PERMISSIVE جديدة على الجدولين (درس 0355)', () => {
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_critical_positions/);
    expect(MIG_STMT).not.toMatch(/CREATE POLICY hybrid_gate_succession_candidates/);
  });

  it.each(NEW_FNS.filter((f) => f !== 'succession_readiness_rank'))(
    '%s تُرشِّح المستأجر', (fn) => {
      expect(fnBody(fn)).toMatch(/current_user_tenant_id\(\)/);
    });

  it.each(NEW_FNS.filter((f) => f !== 'succession_readiness_rank'))(
    '%s تحرس الدور', (fn) => {
      expect(fnBody(fn)).toMatch(/current_user_is_staff\(\)/);
    });

  it('★★ الكتابة تحتاج auth.uid() صريحاً', () => {
    for (const fn of ['succession_position_upsert', 'succession_candidate_nominate',
                      'succession_candidate_set_status', 'succession_position_close']) {
      expect(fnBody(fn), `${fn} بلا حارس auth`).toMatch(/auth\.uid\(\) IS NULL/);
    }
  });

  it('★ والتحديثان يتحقّقان من ROW_COUNT لا يصمتان', () => {
    for (const fn of ['succession_candidate_set_status', 'succession_position_close']) {
      expect(fnBody(fn)).toMatch(/GET DIAGNOSTICS v_n = ROW_COUNT/);
      expect(fnBody(fn)).toMatch(/IF v_n = 0 THEN RAISE EXCEPTION/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★ نظافة الطبقة والصفحة', () => {
  it('الخدمة مُصدَّرة من index', () => {
    expect(INDEX).toMatch(/successionPlanningSdk/);
    expect(INDEX).toMatch(/from '\.\/SuccessionPlanningService'/);
  });

  it('الصفحة لا تلمس Supabase', () => {
    expect(PAGE_CODE).not.toMatch(/from '.*supabase/);
    expect(PAGE_CODE).not.toMatch(/supabase\./);
  });

  it('★★★ ولا any في الطبقة ولا في الصفحة (كان any[] مرّتين)', () => {
    for (const [name, code] of [['الخدمة', SVC_CODE], ['الصفحة', PAGE_CODE]] as const) {
      expect(code, `as any في ${name}`).not.toMatch(/\bas any\b/);
      expect(code, `: any في ${name}`).not.toMatch(/:\s*any\b/);
      expect(code, `any[] في ${name}`).not.toMatch(/any\[\]/);
    }
  });

  it('★ أزرار العمل مُعطَّلة أثناء التنفيذ (لا نقرٌ مزدوج)', () => {
    expect(PAGE_CODE).toMatch(/disabled=\{busyId ===/);
    expect(PAGE_CODE).toMatch(/setSaving\(true\)/);
    expect(PAGE_CODE).toMatch(/if \(!saving\)/);
  });

  it('★ والبحث مُهدَّأ (لا نداءٌ لكل حرف)', () => {
    expect(PAGE_CODE).toMatch(/setTimeout\(\(\) => \{ void load\(\); \}, 250\)/);
    expect(PAGE_CODE).toMatch(/clearTimeout/);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('★★ أدوات التحقّق موجودة ومربوطة', () => {
  it.each([
    'tools/dev/verify-succession-planning-0361.sql',
    'tools/dev/verify-succession-planning-0361-rls.sh',
    'tools/dev/_invert_0361.py',
  ])('%s موجود', (p) => {
    expect(existsSync(resolve(root, p))).toBe(true);
  });

  it('★ سكربت العكس يشير إلى مايجريشن 0361 نفسه', () => {
    const inv = read('tools/dev/_invert_0361.py');
    expect(inv).toContain('0361_succession_planning_integrity.sql');
    expect(inv).toContain('verify-succession-planning-0361.sql');
    expect(inv).toContain('verify-succession-planning-0361-rls.sh');
  });

  it('★★ والمسبار حُذف قبل الكوميت', () => {
    expect(existsSync(resolve(root, 'tools/dev/_probe_0361.sql'))).toBe(false);
  });
});
