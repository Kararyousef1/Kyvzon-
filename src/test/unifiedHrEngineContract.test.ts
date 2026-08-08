/**
 * ════════════════════════════════════════════════════════════════
 *  unifiedHrEngineContract.test.ts
 *
 *  عقد توحيد محرّك الاعتماد (migration 0334) — الخيار «أ».
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-unified-hr-engine-0334.sql      52 تأكيداً
 *      tools/dev/verify-unified-hr-engine-0334-rls.sh   16/16 عبر RLS
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0334_unify_hr_approval_engine.sql');
const VERIFY = read('tools/dev/verify-unified-hr-engine-0334.sql');
const RLS = read('tools/dev/verify-unified-hr-engine-0334-rls.sh');
const SVC = read('src/services/sdk/UnifiedApprovalService.ts');
const MAP = read('docs/PORTAL_RELATIONS_MAP.md');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0334 — المرآة', () => {
  const body = (() => {
    const s = M.indexOf('CREATE FUNCTION public.mirror_hr_step_to_unified');
    const e = M.indexOf('COMMENT ON FUNCTION public.mirror_hr_step_to_unified');
    expect(s).toBeGreaterThan(-1);
    return M.slice(s, e);
  })();

  it('★★ تعكس إلى unified_approval_steps', () => {
    expect(body).toMatch(/INSERT INTO public\.unified_approval_steps/);
  });

  it('★★ source_id = request_id لا related_id', () => {
    // unified_approvals.source_id لطلبات HR هو hr_approval_requests.id
    expect(body).toMatch(/v_step\.request_id, v_step\.step_order/);
    expect(codeOnly(body)).not.toMatch(/related_id/);
  });

  it('★ source_module يُشتقّ من request_type ضمن القيم المسموحة', () => {
    expect(body).toMatch(/WHEN v_type IN \('leave', 'permission'\) THEN 'hr'/);
    expect(body).toMatch(/WHEN v_type IN \('expense', 'loan'\)[^\n]*THEN 'finance'/);
    // 'employee_finance' ليس ضمن قيم CHECK التسع لـsource_module.
    // نفحص الكود لا التعليقات — الاسم مذكور في تعليل التصميم.
    expect(codeOnly(body)).not.toMatch(/'employee_finance'/);
  });

  it('★★ ON CONFLICT DO UPDATE — تحوّل الحالة يجب أن ينعكس', () => {
    expect(body).toMatch(/ON CONFLICT \(tenant_id, source_module, source_id, step_order\)/);
    expect(body).toMatch(/DO UPDATE SET/);
    expect(body).toMatch(/status\s+= EXCLUDED\.status/);
  });

  it('★ VOLATILE — تكتب (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
    expect(body).not.toMatch(/\bSTABLE\b/);
  });

  it('★ SECURITY DEFINER — المحفّز يعمل بسياق المُعتمِد', () => {
    expect(body).toMatch(/SECURITY DEFINER/);
  });
});

describe('0334 — المحفّز', () => {
  it('★★ AFTER INSERT OR UPDATE — لا INSERT وحده', () => {
    expect(M).toMatch(
      /CREATE TRIGGER trg_mirror_hr_step\s+AFTER INSERT OR UPDATE ON public\.hr_approval_steps/,
    );
  });

  it('★★ لا يرفع استثناء — فشل المرآة لا يُسقط الاعتماد', () => {
    const s = M.indexOf('FUNCTION public.tg_mirror_hr_step');
    const body = M.slice(s, M.indexOf('COMMENT ON FUNCTION public.tg_mirror_hr_step'));
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    expect(body).not.toMatch(/RAISE EXCEPTION/);
  });

  it('قابل لإعادة التشغيل', () => {
    expect(M).toContain('DROP TRIGGER IF EXISTS trg_mirror_hr_step');
  });

  it('★ backfill للخطوات القائمة', () => {
    expect(M).toMatch(/FOR v_id IN SELECT id FROM public\.hr_approval_steps LOOP/);
  });
});

describe('0334 — ترجمة المعرّف', () => {
  const body = (() => {
    const s = M.indexOf('CREATE FUNCTION public.resolve_hr_approval_source');
    const e = M.indexOf('COMMENT ON FUNCTION public.resolve_hr_approval_source');
    return M.slice(s, e);
  })();

  it('★ تُجرّب المعرّف كطلب ثم كمصدر', () => {
    expect(body).toMatch(/WHERE r\.id = p_any_id/);
    expect(body).toMatch(/WHERE r\.related_id = p_any_id/);
    expect(body).toMatch(/'request'::TEXT/);
    expect(body).toMatch(/'source'::TEXT/);
  });

  it('★★ مقيّدة بالمستأجر في الفرعين', () => {
    expect((body.match(/r\.tenant_id = v_tenant/g) ?? []).length).toBe(2);
  });

  it('★★ SECURITY INVOKER — تحترم RLS جدول hr_approval_requests', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });

  it('تعود فارغة بلا مستأجر', () => {
    expect(body).toMatch(/IF v_tenant IS NULL OR p_any_id IS NULL THEN RETURN; END IF;/);
  });
});

describe('0334 — approval_steps_for', () => {
  const body = (() => {
    const s = M.indexOf('CREATE FUNCTION public.approval_steps_for');
    const e = M.indexOf('COMMENT ON FUNCTION public.approval_steps_for');
    return M.slice(s, e);
  })();

  /**
   * ★★ هذا أهم اختبار في الملف. النسخة الأولى التي كتبتُها حذفت
   *   out_is_mine و out_is_current اللذين تقرؤهما
   *   UnifiedApprovalService.findSteps() — عطل صامت كان سيكسر
   *   ApprovalTrail بلا أي رسالة خطأ.
   */
  it.each([
    'out_step_order', 'out_required_role', 'out_approver_id', 'out_approver_name',
    'out_status', 'out_comments', 'out_decided_at', 'out_rule_name',
    'out_is_mine', 'out_is_current',
  ])('★★ العمود %s محفوظ (findSteps تقرؤه)', (col) => {
    expect(body).toContain(col);
  });

  it('★★ ترجمة المعرّف مدمجة', () => {
    expect(body).toMatch(/resolve_hr_approval_source\(p_source_id\)/);
    expect(body).toMatch(/p_source_module IN \('hr','finance'\)/);
  });

  it('★★ الحارس can_view_approval_trail باقٍ (0316)', () => {
    expect(body).toMatch(/can_view_approval_trail\(p_source_module, ctx\.sid\)/);
    expect(body).toMatch(/AND guard\.allowed/);
  });

  it('★ SECURITY DEFINER كما في 0316 — الحارس نصّي لا RLS', () => {
    expect(body).toMatch(/SECURITY DEFINER/);
  });

  it('★ حجب التعليقات محفوظ', () => {
    expect(body).toMatch(/WHEN ctx\.is_platform OR mgr\.is_unit_mgr THEN s\.comments/);
    expect(body).toMatch(/ELSE NULL/);
  });

  it('★ كل الاستعلامات تستعمل المعرّف المترجَم (ctx.sid) لا الخام', () => {
    const q = body.slice(body.indexOf('cur AS'));
    expect(q).toMatch(/s\.source_id = ctx\.sid/);
    expect(q).not.toMatch(/s\.source_id\s*=\s*p_source_id/);
  });
});

describe('0334 — البتّ بأيّ معرّف', () => {
  const body = (() => {
    const s = M.indexOf('CREATE FUNCTION public.hr_approval_decide_any');
    const e = M.indexOf('COMMENT ON FUNCTION public.hr_approval_decide_any');
    return M.slice(s, e);
  })();

  it('★ يرفض القرار غير الصالح صراحةً', () => {
    expect(body).toMatch(/IF p_decision NOT IN \('approved','rejected'\)/);
    expect(body).toMatch(/INVALID_DECISION/);
  });

  it('★★ يرفض المعرّف المجهول — لا يمرّ صامتاً', () => {
    expect(body).toMatch(/HR_APPROVAL_NOT_FOUND/);
  });

  it('★ يُوجّه إلى المحرّك القديم (مصدر الحقيقة) لا يكتب مباشرةً', () => {
    expect(body).toMatch(/decide_hr_approval_step\(v_req, p_decision, p_comments\)/);
    expect(codeOnly(body)).not.toMatch(/UPDATE public\./);
  });

  it('★ VOLATILE — تكتب', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });

  it('★ SECURITY INVOKER — لا تتجاوز حراسة decide_hr_approval_step', () => {
    expect(body).toMatch(/SECURITY INVOKER/);
  });
});

describe('0334 — الصلاحيات والفهارس', () => {
  it.each([
    'mirror_hr_step_to_unified(UUID)',
    'resolve_hr_approval_source(UUID)',
    'hr_approval_decide_any(UUID,TEXT,TEXT)',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC`));
    expect(M).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('★ approval_steps_for تحتفظ بمنح service_role (كما 0316)', () => {
    expect(M).toMatch(/GRANT EXECUTE ON FUNCTION public\.approval_steps_for\(TEXT, UUID\)\s*\n?\s*TO authenticated, service_role/);
  });

  it.each([
    'idx_hr_steps_request_order',
    'idx_hr_steps_approver_active',
    'idx_hr_requests_related',
    'idx_unified_steps_source',
  ])('%s موجود وقابل لإعادة التشغيل', (idx) => {
    expect(M).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
  });

  it('★ فهرس الخطوة النشطة جزئي', () => {
    const i = M.indexOf('idx_hr_steps_approver_active');
    expect(M.slice(i, i + 160)).toMatch(/WHERE status = 'active'/);
  });

  it('★ resolve مُعرَّفة قبل approval_steps_for التي تستدعيها', () => {
    expect(M.indexOf('CREATE FUNCTION public.resolve_hr_approval_source'))
      .toBeLessThan(M.indexOf('CREATE FUNCTION public.approval_steps_for'));
  });
});

describe('0334 — طبقة SDK', () => {
  it('★ decideHrAny يمرّ عبر RPC', () => {
    expect(SVC).toContain("rpc('hr_approval_decide_any'");
    expect(SVC).toMatch(/p_any_id:/);
  });

  it('★ resolveHrSource يمرّ عبر RPC', () => {
    expect(SVC).toContain("rpc('resolve_hr_approval_source'");
  });

  it('★★ findSteps ما زالت تقرأ isMine و isCurrent', () => {
    const i = SVC.indexOf('async findSteps');
    const body = SVC.slice(i, i + 1200);
    expect(body).toMatch(/isMine: r\.out_is_mine === true/);
    expect(body).toMatch(/isCurrent: r\.out_is_current === true/);
  });

  it('★ بلا as any ولا لمس مباشر لجدول', () => {
    expect(codeOnly(SVC)).not.toMatch(/\bas any\b/);
    expect(codeOnly(SVC)).not.toMatch(/\.from\(/);
  });
});

describe('0334 — الاختبارات والتوثيق', () => {
  it('ملف الإثبات السلوكي موجود', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-unified-hr-engine-0334.sql'))).toBe(true);
  });

  it('سكربت RLS الحقيقي موجود ويجرّب خمسة أدوار', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-unified-hr-engine-0334-rls.sh'))).toBe(true);
    expect(RLS).toContain('SET ROLE authenticated');
    // مدير · مشرف · موظف · زميل · مدير شركة أخرى
    expect(RLS).toMatch(/زميل/);
    expect(RLS).toMatch(/مدير ب/);
  });

  it('★★ الاختبار يفحص انعكاس تحوّل الحالة لا الإنشاء فقط', () => {
    expect(VERIFY).toMatch(/المحفّز لا يعمل على UPDATE/);
  });

  it('★★ ويفحص انعكاس الرفض والتخطّي', () => {
    expect(VERIFY).toMatch(/الخطوة الثانية بعد الرفض/);
    expect(VERIFY).toMatch(/skipped/);
  });

  it('★ يوثّق التصحيح الذاتي لتأكيد SECURITY DEFINER', () => {
    expect(VERIFY).toMatch(/تصحيح ذاتي/);
    // النصّ مقسوم على سطرين في الملف — نطابق الشطر الأخير
    expect(VERIFY).toMatch(/التأكيد هو الخطأ لا الدالة/);
  });

  it('★★ المايجريشن يوثّق تصحيح تقرير المرحلة 0 علناً', () => {
    expect(M).toMatch(/تصحيح علني لتقرير المرحلة 0/);
    expect(M).toMatch(/القياس الصحيح باستدعاء الدالة/);
  });

  it('★ ويوثّق العطل الذي كاد يُدخله (حذف الأعمدة)', () => {
    expect(M).toMatch(/out_is_mine/);
    expect(M).toMatch(/حذر مُوثَّق/);
  });

  it('خريطة الترابط موجودة (المرحلة 0)', () => {
    expect(MAP).toMatch(/نظاما اعتماد متوازيان/);
  });
});
