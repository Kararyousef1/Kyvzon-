/**
 * approvalBridgesContract.test.ts
 *
 * عقد جسور الموافقات وإدارة الهيكل التنظيمي (0306).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① عودة الأنظمة الثلاثة لحالة «مبنية ولا تُستخدم»
 *   ② فقدان مزامنة العمود القديم ⇒ كسر بوابتَي HR والمشتريات
 *   ③ ضياع فحص الصلاحية في إدارة الهيكل
 *   ④ تعديل الدوال القائمة في مسار الإنتاج الحرج
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const M0306 = read('supabase/migrations/0306_approval_bridges_and_org_ui.sql');
const SERVICE = read('src/services/sdk/OrgStructureService.ts');
const PANEL = read('src/pages/admin/components/OrgChainPanel.tsx');
const ORG_PAGE = read('src/pages/admin/OrgStructurePage.tsx');
const VERIFY = read('tools/dev/verify-approval-bridges-0306.sql');

const BRIDGES = [
  'create_financial_approval',
  'create_mrp_bom_approval',
  'create_general_approval',
] as const;

describe('0306 — جسور إحياء الأنظمة الميتة', () => {
  it.each(BRIDGES)('%s موجودة', (fn) => {
    expect(M0306).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
  });

  it.each(['create_financial_approval', 'create_mrp_bom_approval'] as const)(
    '%s آمنة للتكرار — الفحص قبل الإدراج داخل نطاق الدالة',
    (fn) => {
      // ⚠️ تصحيح 2026-08-05: كان التأكيد يبحث عن النمط في نافذة 3000 حرف
      // فيلتقطه من الدالة التالية. أثبت اختبار الانحدار أنه لا يكشف حذف
      // الفحص من جسر المالية. الآن نحدّ النطاق بالدالة نفسها ونتحقق من
      // ترتيب الفحص قبل الإدراج.
      const start = M0306.indexOf(`FUNCTION public.${fn}`);
      const end = M0306.indexOf(`COMMENT ON FUNCTION public.${fn}`);
      expect(start, `${fn} غير موجودة`).toBeGreaterThan(-1);
      expect(end, `${fn} بلا COMMENT`).toBeGreaterThan(start);

      const body = M0306.slice(start, end);
      const guard = body.indexOf('RETURN v_exists;');
      const insert = body.indexOf('INSERT INTO public.');

      expect(guard, `${fn} بلا حارس ازدواج`).toBeGreaterThan(-1);
      expect(insert).toBeGreaterThan(-1);
      expect(guard, `${fn}: الحارس يجب أن يسبق الإدراج`).toBeLessThan(insert);
    },
  );

  it('create_general_approval تتحقق من العنوان', () => {
    const start = M0306.indexOf('FUNCTION public.create_general_approval');
    const end = M0306.indexOf('COMMENT ON FUNCTION public.create_general_approval');
    expect(M0306.slice(start, end)).toMatch(/TITLE_REQUIRED/);
  });

  it('جسر المالية يكتب في financial_approval_requests', () => {
    expect(M0306).toMatch(/INSERT INTO public\.financial_approval_requests/);
  });

  it('جسر التصنيع يكتب في mrp_bom_approvals', () => {
    expect(M0306).toMatch(/INSERT INTO public\.mrp_bom_approvals/);
  });

  it('الجسر العام يكتب في approval_requests (الجدول المهجور)', () => {
    expect(M0306).toMatch(/INSERT INTO public\.approval_requests/);
  });

  it('الجسر العام يحلّ المعتمِد من السلسلة التنظيمية', () => {
    expect(M0306).toMatch(/FROM public\.resolve_org_chain\(v_dept\) oc/);
    expect(M0306).toMatch(/oc\.out_org_role = 'manager'/);
  });

  it('الجسر العام يجسر profiles.department النصّي', () => {
    // نفس الفجوة البنيوية المعالَجة في 0302
    expect(M0306).toMatch(/FROM public\.employees e[\s\S]{0,160}e\.user_id = auth\.uid\(\)/);
    expect(M0306).toMatch(/lower\(btrim\(d\.name_ar\)\) = lower\(btrim\(p\.department\)\)/);
  });

  it('كل جسر يتحقق من صحة مدخلاته', () => {
    expect(M0306).toMatch(/INVALID_REQUEST_TYPE/);
    expect(M0306).toMatch(/INVALID_APPROVER_ROLE/);
    expect(M0306).toMatch(/INVALID_PRIORITY/);
    expect(M0306).toMatch(/BOM_VERSION_NOT_FOUND/);
  });
});

describe('0306 — لا مسّ للدوال القائمة في مسار الإنتاج', () => {
  it('لا يُعيد تعريف submit_journal_entry', () => {
    expect(M0306).not.toMatch(/CREATE OR REPLACE FUNCTION public\.submit_journal_entry/);
    expect(M0306).toMatch(/submit_journal_entry must remain intact/);
  });

  it('لا يُعيد تعريف approve_mrp_bom_version', () => {
    expect(M0306).not.toMatch(/CREATE OR REPLACE FUNCTION public\.approve_mrp_bom_version/);
    expect(M0306).toMatch(/approve_mrp_bom_version must remain intact/);
  });

  it('لا يُسقط أي دالة', () => {
    expect(M0306).not.toMatch(/^DROP FUNCTION/m);
  });
});

describe('0306 — إدارة الهيكل التنظيمي', () => {
  it('assign_org_role يكتب في org_role_assignments', () => {
    expect(M0306).toMatch(/INSERT INTO public\.org_role_assignments/);
  });

  it('يُزامن الأعمدة الأربعة للتوافق الخلفي', () => {
    for (const col of ['manager_id', 'supervisor_id', 'direct_manager_id', 'procurement_manager_id']) {
      expect(M0306).toMatch(new RegExp(`UPDATE public\\.departments SET ${col}`));
    }
  });

  it('النزع يُعطّل ولا يحذف', () => {
    const fn = M0306.slice(
      M0306.indexOf('FUNCTION public.assign_org_role'),
      M0306.indexOf('COMMENT ON FUNCTION public.assign_org_role'),
    );
    expect(fn).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(fn).toMatch(/SET is_active = FALSE/);
  });

  it('يفرض صلاحية إدارية', () => {
    expect(M0306).toMatch(/NOT_AUTHORIZED_TO_MANAGE_ORG/);
    expect(M0306).toMatch(/current_user_role\(\) NOT IN \('admin','developer','it_admin','hr'\)/);
  });

  it('يفرض تماسك unit_key', () => {
    expect(M0306).toMatch(/UNIT_KEY_COHERENCE/);
    expect(M0306).toMatch(/\(p_org_role = 'unit_manager'\) <> \(p_unit_key IS NOT NULL\)/);
  });

  it('يرفض مستخدماً خارج المستأجر', () => {
    expect(M0306).toMatch(/USER_NOT_IN_TENANT/);
  });

  it('يتحقق من الصلاحية قبل أي كتابة', () => {
    const fn = M0306.slice(
      M0306.indexOf('FUNCTION public.assign_org_role'),
      M0306.indexOf('COMMENT ON FUNCTION public.assign_org_role'),
    );
    const authCheck = fn.indexOf('NOT_AUTHORIZED_TO_MANAGE_ORG');
    const firstWrite = fn.indexOf('UPDATE public.org_role_assignments');
    expect(authCheck).toBeGreaterThan(-1);
    expect(authCheck).toBeLessThan(firstWrite);
  });

  it('anon محروم من الأربع', () => {
    for (const fn of [...BRIDGES, 'assign_org_role']) {
      expect(M0306).toContain(fn);
    }
    expect(M0306).toMatch(/anon can execute %s/);
  });
});

describe('OrgStructureService — طبقة SDK', () => {
  it('يستدعي الدوال الثلاث', () => {
    expect(SERVICE).toMatch(/rpc\('org_structure_overview'\)/);
    expect(SERVICE).toMatch(/rpc\('resolve_org_chain'/);
    expect(SERVICE).toMatch(/rpc\('assign_org_role'/);
  });

  it('يترجم أخطاء القاعدة للعربية', () => {
    for (const code of [
      'NOT_AUTHORIZED_TO_MANAGE_ORG',
      'UNIT_KEY_COHERENCE',
      'USER_NOT_IN_TENANT',
    ]) {
      expect(SERVICE).toContain(`${code}:`);
    }
  });

  it('يدعم النزع بـ null', () => {
    expect(SERVICE).toMatch(/userId: string \| null/);
  });
});

describe('OrgChainPanel — الهيكل البشري', () => {
  it('يعرض السلسلة الفعلية لا الأقسام وحدها', () => {
    expect(PANEL).toMatch(/orgStructureService\.resolveChain/);
  });

  it('يميّز الدور الموروث', () => {
    expect(PANEL).toMatch(/link\.inherited/);
    expect(PANEL).toContain('موروث من');
  });

  it('يحذّر من سلسلة اعتماد فارغة', () => {
    expect(PANEL).toContain('سلسلة اعتماد فارغة');
    expect(PANEL).toContain('لن تجد معتمِداً');
  });

  it('لا يلمس Supabase مباشرة', () => {
    expect(PANEL).not.toMatch(/from '.*services\/supabase/);
    expect(PANEL).not.toMatch(/supabase\./);
  });

  it('مُدمج في صفحة الهيكل التنظيمي', () => {
    expect(ORG_PAGE).toMatch(/import \{ OrgChainPanel \}/);
    expect(ORG_PAGE).toMatch(/<OrgChainPanel/);
    expect(ORG_PAGE).toMatch(/userNameById/);
  });
});

describe('الاختبار السلوكي 0306', () => {
  it('يثبت إحياء الأنظمة الثلاثة', () => {
    expect(VERIFY).toContain('طلب المالية يظهر في مركز المدير');
    expect(VERIFY).toContain('طلب التصنيع يظهر في مركز المدير');
    expect(VERIFY).toContain('الطلب العام يظهر في مركز المدير');
    expect(VERIFY).toContain('ثلاث بوابات كانت ميتة في مكان واحد');
  });

  it('يثبت التوافق الخلفي', () => {
    expect(VERIFY).toContain('يُزامن العمود القديم');
    expect(VERIFY).toContain('submit_journal_entry سليمة');
    expect(VERIFY).toContain('approve_mrp_bom_version سليمة');
  });

  it('يثبت الحماية', () => {
    expect(VERIFY).toContain('موظف عادي لا يدير الهيكل');
    expect(VERIFY).toContain('يرفض مستخدماً خارج المستأجر');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
