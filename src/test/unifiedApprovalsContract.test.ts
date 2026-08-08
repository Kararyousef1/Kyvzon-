/**
 * unifiedApprovalsContract.test.ts
 *
 * عقد الهيكل التنظيمي الموحّد (0304) ومحرك الموافقات (0305).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① كسر التوافق الخلفي — حذف أعمدة departments أو resolve_department_chain
 *   ② نقص بوابة من العرض الموحّد ⇒ طلباتها تختفي من مركز المدير
 *   ③ ضياع فحص الفريق أو الوحدة في القرار ⇒ تجاوز صلاحية
 *   ④ عودة prompt() المحظور إلى ManagerApprovalsPage
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0304 = read('supabase/migrations/0304_org_role_assignments.sql');
const M0305 = read('supabase/migrations/0305_unified_approvals_engine.sql');
const SERVICE = read('src/services/sdk/UnifiedApprovalService.ts');
const PAGE = read('src/pages/manager/ManagerApprovalsPage.tsx');
const V0304 = read('tools/dev/verify-org-structure-0304.sql');
const V0305 = read('tools/dev/verify-unified-approvals-0305.sql');

/** البوابات التسع التي يجب أن يغطيها العرض الموحّد */
const NINE_SOURCES = [
  'hr_approval_requests',
  'procurement_approval_requests',
  'financial_approval_requests',
  'contract_approval_requests',
  'employee_movement_approvals',
  'inventory_adjustment_approvals',
  'mrp_bom_approvals',
  'crm_discount_approvals',
  'approval_requests',
] as const;

const NINE_MODULES = [
  'hr', 'procurement', 'finance', 'contracts',
  'movement', 'inventory', 'mrp', 'crm', 'general',
] as const;

describe('0304 — الهيكل التنظيمي: التوافق الخلفي مطلق', () => {
  it('لا يحذف أي عمود من departments', () => {
    expect(M0304).not.toMatch(/ALTER TABLE public\.departments[\s\S]{0,80}DROP COLUMN/i);
  });

  it('يحوي حارساً يتأكد من بقاء الأعمدة الأربعة', () => {
    expect(M0304).toMatch(/departments columns = %s \(must stay 4\)/);
  });

  it('لا يمسّ resolve_department_chain (0153 تعتمدها)', () => {
    expect(M0304).not.toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_department_chain/);
    expect(M0304).not.toMatch(/DROP FUNCTION[\s\S]{0,60}resolve_department_chain/);
    expect(M0304).toMatch(/resolve_department_chain must remain intact/);
  });

  it('يرحّل الأعمدة الأربعة كلها', () => {
    for (const col of ['manager_id', 'supervisor_id', 'direct_manager_id', 'procurement_manager_id']) {
      expect(M0304).toContain(`departments.${col}`);
    }
  });

  it('procurement_manager_id يصير unit_manager بوحدة procurement', () => {
    expect(M0304).toMatch(/'unit_manager', 'procurement'/);
  });

  it('يحوي حارسي مطابقة الترحيل', () => {
    expect(M0304).toMatch(/manager_id not migrated/);
    expect(M0304).toMatch(/procurement_manager_id not migrated/);
  });
});

describe('0304 — بنية org_role_assignments', () => {
  it('يفرض تماسك unit_key مع unit_manager', () => {
    expect(M0304).toMatch(/org_role_unit_coherence/);
    expect(M0304).toMatch(/org_role =\s+'unit_manager' AND unit_key IS NOT NULL/);
    expect(M0304).toMatch(/org_role <> 'unit_manager' AND unit_key IS NULL/);
  });

  it('يستخدم فهرسين جزئيين (NULL لا يُعامل كقيمة مميزة)', () => {
    expect(M0304).toMatch(/uq_org_role_hierarchical[\s\S]{0,200}WHERE unit_key IS NULL/);
    expect(M0304).toMatch(/uq_org_role_unit[\s\S]{0,200}WHERE unit_key IS NOT NULL/);
  });

  it('المزامنة باتجاه واحد (عمود ← صف) لتفادي حلقة المحفّزات', () => {
    expect(M0304).toMatch(/اتجاه واحد/);
    expect(M0304).toMatch(
      /CREATE TRIGGER trg_sync_department_org_roles[\s\S]{0,200}ON public\.departments/,
    );
    // لا محفّز عكسي على الجدول الجديد يكتب في departments
    expect(M0304).not.toMatch(/UPDATE public\.departments[\s\S]{0,100}SET (manager_id|supervisor_id)/);
  });

  it('يُعطّل ولا يحذف', () => {
    const syncFn = M0304.slice(
      M0304.indexOf('tg_sync_department_org_roles()'),
      M0304.indexOf('CREATE TRIGGER trg_sync_department_org_roles'),
    );
    expect(syncFn).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(syncFn).toMatch(/SET is_active = FALSE/);
  });

  it('المشرف لا يُورَث للأقسام الأعلى', () => {
    expect(M0304).toMatch(/IF r\.org_role = 'supervisor' AND v_depth > 0 THEN\s+CONTINUE;/);
  });

  it('الصعود محدود بعمق أقصى', () => {
    expect(M0304).toMatch(/v_depth < 20/);
  });
});

describe('0305 — العرض الموحّد يغطي التسعة', () => {
  it.each(NINE_SOURCES)('يقرأ من %s', (table) => {
    expect(M0305).toContain(`FROM public.${table}`);
  });

  it.each(NINE_MODULES)('يُصنّف المصدر %s', (mod) => {
    expect(M0305).toMatch(new RegExp(`'${mod}'`));
  });

  it('يحوي حارساً يتأكد من تغطية التسعة', () => {
    expect(M0305).toMatch(/view does not cover all nine sources/);
    for (const t of NINE_SOURCES) {
      expect(M0305).toMatch(new RegExp(`definition LIKE '%${t}%'`));
    }
  });

  it('لا يلمس أي جدول مصدر (قراءة فقط)', () => {
    const viewBlock = M0305.slice(
      M0305.indexOf('CREATE VIEW public.unified_approvals'),
      M0305.indexOf('COMMENT ON VIEW'),
    );
    expect(viewBlock).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER)\b/i);
  });

  it('يعرض المعلَّق فقط', () => {
    const viewBlock = M0305.slice(
      M0305.indexOf('CREATE VIEW public.unified_approvals'),
      M0305.indexOf('COMMENT ON VIEW'),
    );
    const wheres = viewBlock.match(/WHERE \w+\.(status|decision) = 'pending'/g) ?? [];
    expect(wheres.length).toBe(9);
  });

  it('anon محروم من العرض', () => {
    expect(M0305).toMatch(/REVOKE ALL ON public\.unified_approvals FROM anon/);
    expect(M0305).toMatch(/anon can read unified_approvals/);
  });
});

describe('0305 — صندوق الوارد: الفلترة بالوحدة والفريق', () => {
  it('يفلتر بالوحدة المُسنَدة', () => {
    const fn = M0305.slice(
      M0305.indexOf('FUNCTION public.my_approval_inbox'),
      M0305.indexOf('COMMENT ON FUNCTION public.my_approval_inbox'),
    );
    expect(fn).toMatch(/public\.has_portal_unit\('manager', u\.unit_key\)/);
  });

  it('يفلتر بالفريق', () => {
    const fn = M0305.slice(
      M0305.indexOf('FUNCTION public.my_approval_inbox'),
      M0305.indexOf('COMMENT ON FUNCTION public.my_approval_inbox'),
    );
    expect(fn).toMatch(/public\.is_in_my_team\(u\.requester_id\)/);
  });

  it('أدوار المنصة تمر للدعم', () => {
    expect(M0305).toMatch(/current_user_role\(\) IN \('admin','developer','it_admin'\)/);
  });
});

describe('0305 — القرار الموحّد: الحماية قبل الكتابة', () => {
  it('يتحقق من الوحدة والفريق قبل أي UPDATE', () => {
    const fn = M0305.slice(
      M0305.indexOf('FUNCTION public.unified_approval_decide'),
      M0305.indexOf('COMMENT ON FUNCTION public.unified_approval_decide'),
    );
    const unitCheck = fn.indexOf('NOT_ASSIGNED_TO_UNIT');
    const teamCheck = fn.indexOf('REQUESTER_NOT_IN_MY_TEAM');
    const firstUpdate = fn.indexOf('CASE p_source_module');
    expect(unitCheck).toBeGreaterThan(-1);
    expect(teamCheck).toBeGreaterThan(-1);
    expect(unitCheck).toBeLessThan(firstUpdate);
    expect(teamCheck).toBeLessThan(firstUpdate);
  });

  it('يوجّه لكل البوابات التسع', () => {
    const fn = M0305.slice(M0305.indexOf('CASE p_source_module'));
    for (const mod of NINE_MODULES) {
      expect(fn).toMatch(new RegExp(`WHEN '${mod}' THEN`));
    }
  });

  it('يرفض مصدراً غير معروف', () => {
    expect(M0305).toMatch(/UNKNOWN_SOURCE_MODULE/);
  });

  it('يقصر القرار على approved/rejected', () => {
    expect(M0305).toMatch(/p_decision NOT IN \('approved','rejected'\)/);
  });

  it('يرفض الطلب المبتوت (غير موجود في العرض)', () => {
    expect(M0305).toMatch(/APPROVAL_NOT_FOUND_OR_DECIDED/);
  });

  it('قرار الحركة يُحدّث التصريح نفسه', () => {
    expect(M0305).toMatch(
      /UPDATE public\.employee_movement_permits p[\s\S]{0,220}FROM public\.employee_movement_approvals a/,
    );
  });
});

describe('0305 — قواعد الاعتماد', () => {
  it('approval_rules تعمّم نموذج المشتريات', () => {
    expect(M0305).toMatch(/CREATE TABLE IF NOT EXISTS public\.approval_rules/);
    for (const col of ['min_amount', 'max_amount', 'department_id', 'level', 'required_role']) {
      expect(M0305).toContain(col);
    }
  });

  it('تمنع نطاق مبلغ مقلوباً', () => {
    expect(M0305).toMatch(/approval_rules_amount_range CHECK \(max_amount >= min_amount\)/);
  });

  it('RLS مفعَّلة', () => {
    expect(M0305).toMatch(/ALTER TABLE public\.approval_rules ENABLE ROW LEVEL SECURITY/);
  });

  it('resolve_approval_chain يجمع القواعد مع الهيكل', () => {
    expect(M0305).toMatch(/FROM public\.approval_rules ar/);
    expect(M0305).toMatch(/FROM public\.resolve_org_chain\(p_department_id, p_unit_key\)/);
  });
});

describe('ManagerApprovalsPage — إحياء الصفحة الميتة', () => {
  it('لم يعد يقرأ approval_requests مباشرة', () => {
    expect(PAGE).not.toMatch(/approvalRequestService/);
    expect(PAGE).not.toMatch(/from\('approval_requests'\)/);
  });

  it('يقرأ صندوق الوارد الموحّد', () => {
    expect(PAGE).toMatch(/unifiedApprovalService\.findMyInbox/);
  });

  it('لا يستخدم prompt أو confirm المحظورين', () => {
    const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/(?<![.\w])prompt\(/);
    expect(code).not.toMatch(/(?<![.\w])confirm\(/);
  });

  it('يستخدم نافذة حوار للقرار', () => {
    expect(PAGE).toMatch(/<Modal/);
    expect(PAGE).toMatch(/سبب الرفض/);
  });

  it('يُلزم بسبب عند الرفض', () => {
    expect(PAGE).toMatch(/decision === 'rejected' && !comments\.trim\(\)/);
  });

  it('لا يلمس Supabase مباشرة', () => {
    expect(PAGE).not.toMatch(/from '.*services\/supabase/);
    expect(PAGE).not.toMatch(/supabase\./);
  });

  it('يشرح للمستخدم بلا وحدات ماذا يفعل', () => {
    expect(PAGE).toContain('لم تُسنَد إليك وحدات');
  });
});

describe('UnifiedApprovalService — طبقة SDK', () => {
  it('يغطي البوابات التسع في التسميات', () => {
    for (const mod of NINE_MODULES) {
      expect(SERVICE).toMatch(new RegExp(`${mod}:`));
    }
  });

  it('يترجم أخطاء القاعدة لرسائل عربية', () => {
    for (const code of [
      'NOT_ASSIGNED_TO_UNIT',
      'REQUESTER_NOT_IN_MY_TEAM',
      'APPROVAL_NOT_FOUND_OR_DECIDED',
    ]) {
      expect(SERVICE).toContain(`${code}:`);
    }
  });

  it('يستدعي الدوال الثلاث', () => {
    expect(SERVICE).toMatch(/rpc\('my_approval_inbox'/);
    expect(SERVICE).toMatch(/rpc\('unified_approval_decide'/);
    expect(SERVICE).toMatch(/rpc\('resolve_approval_chain'/);
  });
});

describe('الاختبارات السلوكية', () => {
  it('0304 يغطي الوراثة والتوافق الخلفي', () => {
    expect(V0304).toContain('المدير موروث من القسم الأب');
    expect(V0304).toContain('مشرف القسم الابن لا يظهر في سلسلة الأب');
    expect(V0304).toContain('الأعمدة الأربعة لم تُحذف');
    expect(V0304).toContain('الدالة القديمة والجديدة تتفقان على المدير');
  });

  it('0305 يغطي العزل والتوجيه', () => {
    expect(V0305).toContain('الصندوق يجمع بوابتين في مكان واحد');
    expect(V0305).toContain('يرفض الاعتماد خارج الفريق');
    expect(V0305).toContain('وحدة غير مُسنَدة (المالية) لا تظهر');
    expect(V0305).toContain('التصريح نفسه تبع قرار الموافقة');
  });

  it('كلاهما يفشل بصوت عالٍ', () => {
    expect(V0304).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
    expect(V0305).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
