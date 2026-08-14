/**
 * ════════════════════════════════════════════════════════════════
 *  permissionIntegrityContract.test.ts
 *
 *  عقد «نزاهة طلبات الزمنيات» (migration 0340).
 *  المرحلة 3 — الجولة الثالثة.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-permission-integrity-0340.sql       68 تأكيداً
 *      tools/dev/verify-permission-integrity-0340-rls.sh    26 تأكيداً (RLS حقيقي)
 *      عكس 27 إصلاحاً ⇒ 27/27 أسقطت الاختبار
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0340_permission_request_integrity.sql');
const VERIFY = read('tools/dev/verify-permission-integrity-0340.sql');
const RLS = read('tools/dev/verify-permission-integrity-0340-rls.sh');
const SVC = read('src/services/sdk/PermissionRequestGatewayService.ts');
const PAGE = read('src/pages/employee/PermissionsPage.tsx');
const LEAVE_PAGE = read('src/pages/employee/LeaveRequestPage.tsx');
const SDK_INDEX = read('src/services/sdk/index.ts');

/** يجرّد التعليقات — الادّعاء في التعليق ليس تنفيذاً */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

function fnBody(name: string): string {
  const s = M.indexOf(`CREATE FUNCTION public.${name}(`);
  const e = M.indexOf(`COMMENT ON FUNCTION public.${name}(`);
  expect(s, `${name}: لا تعريف`).toBeGreaterThan(-1);
  expect(e, `${name}: لا COMMENT`).toBeGreaterThan(s);
  return M.slice(s, e);
}

const PAGE_CODE = codeOnly(PAGE);
const SVC_CODE = codeOnly(SVC);
const LEAVE_CODE = codeOnly(LEAVE_PAGE);

// ════════════════════════════════════════════════════════════════
describe('0340 — بنية المايجريشن', () => {
  it('كل دالة تُسبَق بـDROP صريح', () => {
    for (const fn of ['submit_permission_request', 'cancel_permission_request',
      'permission_requests_view', 'sync_hr_source_status']) {
      const drop = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}(`);
      const create = M.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(drop, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(create, `${fn}: DROP بعد CREATE`).toBeGreaterThan(drop);
    }
  });

  it('★ anon لا يُمنح EXECUTE على أي دالة', () => {
    for (const fn of ['submit_permission_request', 'cancel_permission_request',
      'permission_requests_view', 'sync_hr_source_status']) {
      expect(M, `${fn}: لا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(codeOnly(M), `${fn}: مُنح لـanon`)
        .not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`));
    }
  });

  it('★★ الدوال الكاتبة VOLATILE — الكتابة مستحيلة في STABLE', () => {
    expect(fnBody('submit_permission_request')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('cancel_permission_request')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('sync_hr_source_status')).toMatch(/\nVOLATILE\n/);
  });

  it('★★★ permission_requests_view تبقى SECURITY INVOKER', () => {
    const body = fnBody('permission_requests_view');
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ① — المعرّف والاسم من الجلسة', () => {
  const body = fnBody('submit_permission_request');

  it('★★★ لا تستقبل employee_id ولا employee_name من المتصفح', () => {
    const sig = M.slice(M.indexOf('CREATE FUNCTION public.submit_permission_request('),
      M.indexOf('RETURNS TABLE ('));
    expect(sig).not.toMatch(/p_employee_id/);
    expect(sig).not.toMatch(/p_employee_name/);
    expect(sig).not.toMatch(/p_tenant/);
  });

  it('★★ تشتقّه من current_user_employee_id وترفض غيابه', () => {
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    expect(body).toMatch(/IF v_emp IS NULL THEN[\s\S]*?PERM_NO_EMPLOYEE/);
  });

  /**
   * ★★★ profiles أوّلاً لا employees: محفّز 0317 ينسخ الاسم مرّة واحدة
   *   بـON CONFLICT DO NOTHING فيتجمّد. مُقاس:
   *     profiles.full_name = 'الاسم الجديد' · employees.first_name = 'الموظف'
   */
  it('★★★ الاسم من profiles.full_name أوّلاً (employees متجمّد)', () => {
    const pick = body.slice(body.indexOf('SELECT COALESCE'), body.indexOf('INTO v_name'));
    const pIdx = pick.indexOf('p.full_name');
    const eIdx = pick.indexOf('e.first_name');
    expect(pIdx, 'profiles.full_name غائب').toBeGreaterThan(-1);
    expect(eIdx, 'employees احتياط غائب').toBeGreaterThan(-1);
    expect(pIdx, '★★★ employees يسبق profiles — الاسم سيتجمّد').toBeLessThan(eIdx);
  });

  it('★ القسم من departments.name_ar لا من profiles.department النصّي', () => {
    expect(body).toMatch(/COALESCE\(d\.name_ar, p\.department\)/);
    expect(body).toMatch(/LEFT JOIN public\.departments d ON d\.id = e\.department_id/);
  });

  it('★★ نفس الترتيب في العرض', () => {
    const view = fnBody('permission_requests_view');
    const pick = view.slice(view.indexOf('COALESCE(NULLIF(btrim(p.full_name)'),
      view.indexOf('AS employee_name'));
    expect(pick.indexOf('p.full_name')).toBeLessThan(pick.indexOf('e.first_name'));
    expect(pick.indexOf('e.first_name')).toBeLessThan(pick.indexOf('pr.employee_name'));
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ② — الفحوص المسبقة', () => {
  const body = fnBody('submit_permission_request');

  it('★ نوع غير معروف مرفوض', () => {
    expect(body).toMatch(/NOT IN \('عادية','مغادرة','تعويضية','بدون_راتب'\)[\s\S]*?PERM_BAD_TYPE/);
  });

  it('★ الماضي البعيد مرفوض والتسوية القصيرة مسموحة', () => {
    expect(body).toMatch(/IF p_date < current_date - 7 THEN[\s\S]*?PERM_TOO_OLD/);
  });

  it('★ العودة قبل الخروج مرفوضة', () => {
    expect(body).toMatch(/v_ret <= p_out_time THEN[\s\S]*?PERM_BAD_TIMES/);
  });

  it('★★ مغادرة = خروج بلا رجوع — وقت العودة يُهمَل', () => {
    expect(body).toMatch(/v_ret := CASE WHEN p_permission_type = 'مغادرة' THEN NULL/);
  });

  it('★★★ السلسلة في نفس المعاملة — لا طلب بلا رقابة', () => {
    expect(body).toMatch(/v_req := public\.create_hr_approval\('permission', v_id, v_emp\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ③ — قيود الجدول (كانت غائبة تماماً)', () => {
  it('★ CHECK على permission_type بأربع قيم', () => {
    expect(M).toMatch(/ADD CONSTRAINT permissions_request_type_check\s*\n\s*CHECK \(permission_type IN \('عادية','مغادرة','تعويضية','بدون_راتب'\)\)/);
  });

  it('★ CHECK على ترتيب الأوقات', () => {
    expect(M).toMatch(/ADD CONSTRAINT permissions_request_time_order_check\s*\n\s*CHECK \(expected_return_time IS NULL OR expected_return_time > expected_out_time\)/);
  });

  it('★ التطبيع يسبق كل قيد', () => {
    const norm = M.indexOf("UPDATE public.permissions_request SET permission_type = 'عادية'");
    const check = M.indexOf('ADD CONSTRAINT permissions_request_type_check');
    expect(norm).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(norm);

    const norm2 = M.indexOf('UPDATE public.permissions_request SET expected_return_time = NULL');
    const check2 = M.indexOf('ADD CONSTRAINT permissions_request_time_order_check');
    expect(norm2).toBeGreaterThan(-1);
    expect(check2).toBeGreaterThan(norm2);
  });

  it('★ التطبيع لا يُتلف بيانات — يُفرغ العودة ولا يحذف الصفّ', () => {
    expect(M).not.toMatch(/DELETE FROM public\.permissions_request/);
  });

  it('★ جدول permissions المنفَّذ محميّ بنفس القيود', () => {
    expect(M).toMatch(/ADD CONSTRAINT permissions_type_check/);
    expect(M).toMatch(/ADD CONSTRAINT permissions_status_check/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ④ — أثر القرار وتنفيذ الزمنية', () => {
  const body = fnBody('sync_hr_source_status');

  it('★★★ approved_by يُملأ من المُعتمِد الأخير', () => {
    expect(body).toMatch(/ORDER BY s\.decided_at DESC, s\.step_order DESC/);
    expect(body).toMatch(/approved_by = COALESCE\(v_decider, approved_by\)/);
  });

  it('★★ reviewed_at يُملأ', () => {
    expect(body).toMatch(/reviewed_at = NOW\(\)/);
  });

  it('★★★ الزمنية المعتمَدة تُنقل إلى permissions', () => {
    expect(body).toMatch(/IF p_final = 'approved' THEN[\s\S]*?INSERT INTO public\.permissions \(/);
  });

  it('★★ لا تكرار في التنفيذ (فحص وجود مسبق)', () => {
    expect(body).toMatch(/NOT EXISTS \([\s\S]*?FROM public\.permissions x[\s\S]*?x\.expected_out_time = v_perm\.expected_out_time\)/);
  });

  it('★★ التنفيذ مُرشَّح بالمستأجر', () => {
    const exec = body.slice(body.indexOf('FROM public.permissions x'), body.indexOf('THEN\n        INSERT'));
    expect(exec).toMatch(/x\.tenant_id = v_tenant/);
  });

  it('★ الرفض لا يُنفّذ شيئاً', () => {
    const rejBranch = body.indexOf("IF p_final = 'approved' THEN");
    expect(rejBranch).toBeGreaterThan(-1);
  });

  it('★★ الإجازات أيضاً تملأ approved_by (إضافة 0340)', () => {
    expect(body).toMatch(/UPDATE public\.leaves\s*\n\s*SET status = v_label,\s*\n\s*approved_by = COALESCE\(v_decider, approved_by\)/);
  });

  it('★★ علَم المزامنة يُرفع ثم يُخفض (وإلا صدّ حارس 0324 المحرّك)', () => {
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'true', TRUE\)/);
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'false', TRUE\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑤ — العرض والصلاحية', () => {
  const view = fnBody('permission_requests_view');

  it('★★★ can_decide من الخطوة النشطة لا من مسار URL', () => {
    expect(view).toMatch(/s\.status = 'active'\s*\n\s*AND s\.approver_id = auth\.uid\(\)\)\s*AS can_decide/);
  });

  it('★★ نطاق mine محصور بالموظف', () => {
    expect(view).toMatch(/WHEN p_scope = 'mine'\s+THEN pr\.employee_id = v_emp/);
  });

  it('★★ نطاق inbox من الخطوة النشطة', () => {
    expect(view).toMatch(/WHEN p_scope = 'inbox' THEN EXISTS \([\s\S]*?s\.approver_id = auth\.uid\(\)\)/);
  });

  it('★ علَم التنفيذ يُحسب من permissions', () => {
    expect(view).toMatch(/FROM public\.permissions x[\s\S]*?AS executed/);
  });

  it('★ الترشيح والحدّ يُطبَّقان', () => {
    expect(view).toMatch(/p_status IS NULL OR pr\.status = p_status/);
    expect(view).toMatch(/LIMIT GREATEST\(COALESCE\(p_limit, 100\), 0\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑥ — الإلغاء وسياسة المعتمِد', () => {
  it('★★★ الإلغاء يفحص الملكية ولا يحذف', () => {
    const body = fnBody('cancel_permission_request');
    expect(body).toMatch(/PERM_NOT_OWNER/);
    expect(body).toMatch(/SET status = 'ملغى'/);
    expect(body).not.toMatch(/DELETE FROM public\.permissions_request/);
  });

  it('★★ يرفع علَم المزامنة ويُغلق السلسلة', () => {
    const body = fnBody('cancel_permission_request');
    expect(body).toMatch(/set_config\('kyvzon\.approval_sync', 'true', TRUE\)/);
    expect(body).toMatch(/SET status = 'skipped', decided_at = NOW\(\)/);
    expect(body).toMatch(/r\.request_type = 'permission'/);
  });

  it('★ يُلغي التنفيذ المرافق', () => {
    expect(fnBody('cancel_permission_request'))
      .toMatch(/UPDATE public\.permissions SET status = 'ملغى'/);
  });

  it('★★ سياسة المعتمِد على الجدول المنفَّذ — قراءة فقط', () => {
    expect(M).toMatch(/CREATE POLICY kyvzon_permissions_select_approver ON public\.permissions/);
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_permissions_select_approver'),
      M.indexOf('COMMENT ON POLICY kyvzon_permissions_select_approver'));
    expect(pol).toMatch(/FOR SELECT/);
    expect(pol).not.toMatch(/FOR ALL/);
    expect(pol).not.toMatch(/WITH CHECK/);
    expect(pol).toMatch(/tenant_id = public\.current_user_tenant_id\(\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑦ — طبقة SDK', () => {
  it('★★★ لا تلمس supabase.from() — RPC فقط', () => {
    expect(SVC_CODE).not.toMatch(/supabase\s*\.\s*from\(/);
    for (const rpc of ['permission_requests_view', 'submit_permission_request',
      'cancel_permission_request']) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('★★ submit لا تقبل employeeId ولا employeeName', () => {
    const sig = SVC.slice(SVC.indexOf('async submit(input: {'),
      SVC.indexOf('}): Promise<SubmitPermissionResult>'));
    expect(sig).not.toMatch(/employeeId/);
    expect(sig).not.toMatch(/employeeName/);
    expect(sig).toMatch(/permissionType/);
  });

  it('★ لا as any ولا confirm/prompt/alert', () => {
    expect(SVC_CODE).not.toMatch(/as any/);
    expect(SVC_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★ مُصدَّرة من فهرس الـSDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ permissionRequestGateway, permissionErrorMessage \}/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑧ — PermissionsPage', () => {
  it('★★★ لا تشتقّ صلاحية من مسار URL', () => {
    expect(PAGE_CODE).not.toMatch(/location\.pathname/);
    expect(PAGE_CODE).not.toMatch(/useLocation/);
    expect(PAGE_CODE).not.toMatch(/canApprove/);
    expect(PAGE_CODE).not.toMatch(/viewMode/);
  });

  it('★★★ الصلاحية من القاعدة: canDecide / canCancel', () => {
    expect(PAGE_CODE).toMatch(/row\.canDecide &&/);
    expect(PAGE_CODE).toMatch(/row\.canCancel &&/);
  });

  it('★★★ لا اعتماد مباشر — لا approveRequest ولا rejectRequest', () => {
    expect(PAGE_CODE).not.toMatch(/approveRequest/);
    expect(PAGE_CODE).not.toMatch(/rejectRequest/);
    expect(PAGE_CODE).toMatch(/unifiedApprovalService\.decideHrAny\(row\.id/);
    expect(PAGE_CODE).not.toMatch(/hrApprovalService|findRequestIdBySource/);
  });

  it('★★ لا تلمس Supabase ولا الجدول الخام', () => {
    expect(PAGE_CODE).not.toMatch(/supabase/);
    expect(PAGE_CODE).not.toMatch(/permissionRequestService/);
    expect(PAGE_CODE).toMatch(/permissionRequestGateway\.submit\(/);
  });

  it('★ الإلغاء بديل الحذف', () => {
    expect(PAGE_CODE).toMatch(/permissionRequestGateway\.cancel\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
  });

  it('★ الممنوعات: confirm · prompt · alert · as any', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/as any/);
  });

  it('★ حالة «ملغى» وعلَم «مُنفَّذة» معروضان', () => {
    expect(PAGE).toMatch(/<option value="ملغى">/);
    expect(PAGE).toMatch(/row\.executed &&/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑨ — إزالة الازدواج', () => {
  /**
   * ★★★ تبويب الزمنيات في LeaveRequestPage كان نسخةً ثانيةً كاملةً من
   *   PermissionsPage: شاشتان تكتبان في نفس الجدول بمنطقَي صلاحية
   *   مختلفَين (الأولى تفحص /app/hr/leave-requests والثانية /app/hr/).
   */
  it('★★★ LeaveRequestPage لم تعد تلمس الزمنيات', () => {
    expect(LEAVE_CODE).not.toMatch(/permissionRequestService/);
    expect(LEAVE_CODE).not.toMatch(/permFormData/);
    expect(LEAVE_CODE).not.toMatch(/handlePermApprove/);
    expect(LEAVE_CODE).not.toMatch(/handlePermReject/);
    expect(LEAVE_CODE).not.toMatch(/activeTab/);
  });

  it('★★ وتُحيل إلى الشاشة المخصّصة', () => {
    expect(LEAVE_PAGE).toMatch(/to="\/app\/employee\/permissions"/);
  });

  it('★ ولا تستورد أدوات الزمنيات الميتة', () => {
    expect(LEAVE_CODE).not.toMatch(/PERMISSION_TYPE_COLORS/);
    expect(LEAVE_CODE).not.toMatch(/linkPermissionApproval/);
    expect(LEAVE_CODE).not.toMatch(/notifyEmployeePermissionApproved/);
  });

  it('★★ إصلاحات 0339 على الإجازات باقية (لا انحدار)', () => {
    expect(LEAVE_CODE).toMatch(/leaveRequestService\.submit\(/);
    expect(LEAVE_CODE).toMatch(/row\.canDecide &&/);
    expect(LEAVE_CODE).not.toMatch(/location\.pathname/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0340 ⑩ — الاختبارات نفسها', () => {
  it('اختبار السلوك يرجع كل شيء', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION 'ROLLBACK_VERIFY_0340'/);
    expect(VERIFY).toMatch(/IF SQLERRM <> 'ROLLBACK_VERIFY_0340' THEN RAISE/);
  });

  it('★★ يقيس العزل بين مستأجرين', () => {
    expect(VERIFY).toMatch(/v_tb\s+UUID := gen_random_uuid\(\)/);
    expect(VERIFY).toMatch(/تسريب عبر المستأجرين|من مستأجر آخر/);
  });

  it('★★ يلتقط سجلّ الموظف من محفّز 0317 ولا يُدرج ثانياً', () => {
    expect(VERIFY).toMatch(/SELECT id INTO v_eEmp FROM public\.employees WHERE user_id=v_uEmp/);
    expect(VERIFY).not.toMatch(/INSERT INTO public\.employees/);
  });

  /**
   * ★★★ ثغرة تغطية أُصلحت: كل مستخدمي الاختبار لهم سجلّ موظف تلقائياً
   *   (محفّز 0317) فحارس v_emp IS NULL لم يكن يُنفَّذ. 'developer'
   *   مستثنى من المحفّز صراحةً.
   */
  it('★★★ يفحص حارس انعدام سجلّ الموظف بدور مستثنى من محفّز 0317', () => {
    expect(VERIFY).toMatch(/'developer'\)/);
    expect(VERIFY).toMatch(/PERM_NO_EMPLOYEE/);
  });

  it('★★★ يفحص أن الاسم يتبع profiles بقيمة موجبة لا سلبية', () => {
    expect(VERIFY).toMatch(/ASSERT v_txt = 'سعد بعد التغيير'/);
    expect(VERIFY).toMatch(/ASSERT v_got = 'سعد المُحدَّث فيصل'/);
  });

  it('★★★ يفحص عدم انحدار الإجازات بعد إعادة بناء sync_hr_source_status', () => {
    expect(VERIFY).toMatch(/submit_leave_request/);
    expect(VERIFY).toMatch(/انحدار: مزامنة الإجازات/);
    expect(VERIFY).toMatch(/انحدار: رصيد الإجازات لم يُخصم/);
  });

  it('★ يفحص أن سقف 0339 وسياسته ما زالا قائمين', () => {
    expect(VERIFY).toMatch(/PERMISSION_DAILY_CAP/);
    expect(VERIFY).toMatch(/kyvzon_permissions_request_select_approver/);
  });

  it('★ اختبار RLS يستعمل SET ROLE authenticated و anon', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/SET ROLE anon/);
    expect(RLS).toMatch(/permission denied/);
  });
});
