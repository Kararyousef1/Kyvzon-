/**
 * multilevelApprovalsContract.test.ts
 *
 * عقد الاعتماد متعدد المستويات (0309).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① كسر التوافق الخلفي — طلب بلا خطوات يجب أن يعمل بالمسار القديم
 *   ② إنهاء الطلب في المستوى الأول (العيب الذي أُصلح)
 *   ③ بتّ من ليس صاحب الخطوة النشطة
 *   ④ بناء خطوة معلَّقة بلا معتمِد ⇒ طلب مجمَّد للأبد
 *   ⑤ رسالة «تمت الموافقة» عند الانتقال لمستوى تالٍ (تضليل)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0309 = read('supabase/migrations/0309_multilevel_approval_engine.sql');
const SERVICE = read('src/services/sdk/UnifiedApprovalService.ts');
const MGR_PAGE = read('src/pages/manager/ManagerApprovalsPage.tsx');
const UNIT_PAGE = read('src/pages/manager/units/UnitApprovalsPage.tsx');
const VERIFY = read('tools/dev/verify-multilevel-approvals-0309.sql');

const NINE_MODULES = [
  'hr', 'procurement', 'finance', 'contracts',
  'movement', 'inventory', 'mrp', 'crm', 'general',
] as const;

describe('0309 — جدول الخطوات', () => {
  it('يُنشئ unified_approval_steps مع RLS', () => {
    expect(M0309).toMatch(/CREATE TABLE IF NOT EXISTS public\.unified_approval_steps/);
    expect(M0309).toMatch(/ALTER TABLE public\.unified_approval_steps ENABLE ROW LEVEL SECURITY/);
    expect(M0309).toMatch(/CREATE POLICY kyvzon_unified_approval_steps_all/);
  });

  it('لا يلمس جداول البوابات التسعة بتعديل بنيوي', () => {
    expect(M0309).not.toMatch(/ALTER TABLE public\.(hr|procurement|financial|contract|employee_movement|inventory|mrp|crm)_?\w*\s+ADD COLUMN/i);
  });

  it('يمنع تكرار نفس الخطوة', () => {
    expect(M0309).toMatch(/uq_unified_step UNIQUE \(tenant_id, source_module, source_id, step_order\)/);
  });

  it('يغطي المصادر التسعة في القيد', () => {
    const m = /source_module\s+VARCHAR\(\d+\) NOT NULL[\s\S]{0,200}?CHECK \(source_module IN \(([\s\S]*?)\)\)/.exec(M0309);
    expect(m).not.toBeNull();
    const keys = new Set(Array.from(m![1].matchAll(/'([^']+)'/g)).map((x) => x[1]));
    for (const mod of NINE_MODULES) {
      expect(keys.has(mod), `${mod} مفقود`).toBe(true);
    }
  });

  it('فهرس جزئي للخطوات النشطة (أداء الصندوق)', () => {
    expect(M0309).toMatch(/idx_unified_steps_active[\s\S]{0,180}WHERE status = 'active'/);
  });
});

describe('0309 — بناء السلسلة', () => {
  const FN = (() => {
    const s = M0309.indexOf('FUNCTION public.build_approval_steps');
    return M0309.slice(s, M0309.indexOf('COMMENT ON FUNCTION public.build_approval_steps'));
  })();

  it('يقرأ من resolve_approval_chain', () => {
    expect(FN).toMatch(/FROM public\.resolve_approval_chain\(p_unit_key, p_department_id, p_amount\)/);
  });

  it('آمن للتكرار — لا يبني مرتين', () => {
    expect(FN).toMatch(/IF v_count > 0 THEN\s+RETURN v_count;/);
  });

  it('🔴 يتخطّى المستوى بلا شاغل (لا يُجمّد الطلب)', () => {
    expect(FN).toMatch(/IF r\.out_approver_id IS NULL THEN\s+CONTINUE;/);
  });

  it('الخطوة الأولى نشطة والباقي معلَّق', () => {
    expect(FN).toMatch(/CASE WHEN v_order = 1 THEN 'active' ELSE 'pending' END/);
  });
});

describe('0309 — القرار متعدد المستويات', () => {
  const FN = (() => {
    const s = M0309.indexOf('FUNCTION public.unified_approval_decide');
    return M0309.slice(s, M0309.indexOf('COMMENT ON FUNCTION public.unified_approval_decide'));
  })();

  it('يُسقط التوقيع القديم (تغيّر نوع الإرجاع)', () => {
    expect(M0309).toMatch(/DROP FUNCTION IF EXISTS public\.unified_approval_decide\(TEXT, UUID, TEXT, TEXT\)/);
  });

  it('يُرجع TEXT لا VOID', () => {
    expect(FN).toMatch(/RETURNS TEXT/);
  });

  it('🔴 صاحب الخطوة النشطة وحده يبتّ', () => {
    expect(FN).toMatch(/v_active\.approver_id IS DISTINCT FROM auth\.uid\(\)/);
    expect(FN).toMatch(/NOT_YOUR_STEP/);
  });

  it('🔴 الموافقة غير الأخيرة تُرجع pending ولا تكتب في البوابة', () => {
    // RETURN 'pending' يجب أن يسبق كتلة CASE التي تكتب الحالة النهائية
    const earlyReturn = FN.indexOf("RETURN 'pending';");
    const caseBlock = FN.indexOf('CASE p_source_module');
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(earlyReturn).toBeLessThan(caseBlock);
  });

  it('الرفض يتخطّى الخطوات المتبقية', () => {
    expect(FN).toMatch(/SET status = 'skipped'[\s\S]{0,220}status = 'pending'/);
  });

  it('🔴 التوافق الخلفي: بلا خطوات يعمل المسار القديم', () => {
    expect(FN).toMatch(/IF v_steps > 0 THEN/);
    expect(FN).toMatch(/ELSE[\s\S]{0,400}has_portal_unit\('manager', v_unit\)/);
    expect(FN).toMatch(/is_in_my_team\(v_requester\)/);
  });

  it('يوجّه للمصادر التسعة', () => {
    for (const mod of NINE_MODULES) {
      expect(FN).toMatch(new RegExp(`WHEN '${mod}' THEN`));
    }
  });

  it('حارس يتحقق من تغطية التسعة', () => {
    expect(M0309).toMatch(/0309 failed: decide covers %s\/9 modules/);
  });
});

describe('0309 — صندوق الوارد يحترم الخطوات', () => {
  const FN = (() => {
    const s = M0309.indexOf('FUNCTION public.my_approval_inbox');
    return M0309.slice(s, M0309.indexOf('COMMENT ON FUNCTION public.my_approval_inbox'));
  })();

  it('يُسقط التوقيع القديم (تغيّرت الأعمدة)', () => {
    expect(M0309).toMatch(/DROP FUNCTION IF EXISTS public\.my_approval_inbox\(TEXT\)/);
  });

  it('🔴 الطلب بخطوات يظهر لصاحب النشطة وحده', () => {
    expect(FN).toMatch(/si\.active_approver = auth\.uid\(\)::TEXT/);
  });

  it('الطلب بلا خطوات يتبع المسار القديم', () => {
    expect(FN).toMatch(/si\.source_id IS NULL[\s\S]{0,200}has_portal_unit\('manager', u\.unit_key\)/);
  });

  it('يُرجع المستوى والإجمالي', () => {
    expect(FN).toMatch(/out_step_order/);
    expect(FN).toMatch(/out_total_steps/);
    expect(FN).toMatch(/COALESCE\(si\.total_steps, 1\)/);
  });
});

describe('UnifiedApprovalService — طبقة SDK', () => {
  it('decide يُرجع الحالة لا void', () => {
    expect(SERVICE).toMatch(/Promise<'approved' \| 'rejected' \| 'pending'>/);
  });

  it('يوفّر findSteps و buildSteps', () => {
    expect(SERVICE).toMatch(/rpc\('approval_steps_for'/);
    expect(SERVICE).toMatch(/rpc\('build_approval_steps'/);
  });

  it('يحمل stepOrder و totalSteps', () => {
    expect(SERVICE).toMatch(/stepOrder: Number\(r\.out_step_order \?\? 1\)/);
    expect(SERVICE).toMatch(/totalSteps: Number\(r\.out_total_steps \?\? 1\)/);
  });

  it('يترجم أخطاء المستويات للعربية', () => {
    expect(SERVICE).toContain('NOT_YOUR_STEP:');
    expect(SERVICE).toContain('NO_ACTIVE_STEP:');
  });
});

describe('الواجهة — لا تُضلّل المستخدم', () => {
  it.each([
    ['ManagerApprovalsPage', () => MGR_PAGE],
    ['UnitApprovalsPage', () => UNIT_PAGE],
  ])('%s يعرض شارة المستوى', (_n, get) => {
    expect(get()).toMatch(/it\.totalSteps > 1/);
    expect(get()).toContain('مستوى {it.stepOrder} من {it.totalSteps}');
  });

  it.each([
    ['ManagerApprovalsPage', () => MGR_PAGE],
    ['UnitApprovalsPage', () => UNIT_PAGE],
  ])('%s 🔴 لا يقول «تمت الموافقة» عند الانتقال لمستوى تالٍ', (_n, get) => {
    const src = get();
    expect(src).toMatch(/const result = await unifiedApprovalService\.decide/);
    expect(src).toMatch(/result === 'pending'/);
    expect(src).toContain('انتقل الطلب للمستوى التالي');
  });
});

describe('الاختبار السلوكي 0309', () => {
  it('يثبت التقدّم مستوى مستوى', () => {
    expect(VERIFY).toContain('موافقة المستوى الأول تُرجع pending');
    expect(VERIFY).toContain('الطلب في بوابته ما زال معلَّقاً');
    expect(VERIFY).toContain('الخطوة الثانية صارت active');
    expect(VERIFY).toContain('المستوى الأخير يُرجع approved');
  });

  it('يثبت انتقال الصندوق', () => {
    expect(VERIFY).toContain('المستوى الأول لم يعد يراه');
    expect(VERIFY).toContain('المستوى الثاني صار يراه');
  });

  it('يثبت الحمايات', () => {
    expect(VERIFY).toContain('يرفض البتّ من غير صاحب الخطوة');
    expect(VERIFY).toContain('لا خطوة تعبر حدود المستأجر');
  });

  it('يثبت التوافق الخلفي', () => {
    expect(VERIFY).toContain('الطلب بلا خطوات يظهر لصاحب الوحدة');
    expect(VERIFY).toContain('المسار القديم يعتمد بخطوة واحدة');
  });

  it('يثبت تخطّي المستوى بلا شاغل', () => {
    expect(VERIFY).toContain('المستوى بلا شاغل يُتخطّى');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
