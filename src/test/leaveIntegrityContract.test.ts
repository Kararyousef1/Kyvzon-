/**
 * ════════════════════════════════════════════════════════════════
 *  leaveIntegrityContract.test.ts
 *
 *  عقد «نزاهة طلبات الإجازات» (migration 0339).
 *  المرحلة 3 — الجولة الثانية.
 *
 *  ★ فحص ثابت. الإثبات السلوكي في:
 *      tools/dev/verify-leave-integrity-0339.sql       61 تأكيداً
 *      tools/dev/verify-leave-integrity-0339-rls.sh    26 تأكيداً (RLS حقيقي)
 *      عكس 22 إصلاحاً ⇒ 22/22 أسقطت الاختبار
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M = read('supabase/migrations/0339_leave_request_integrity.sql');
const VERIFY = read('tools/dev/verify-leave-integrity-0339.sql');
const RLS = read('tools/dev/verify-leave-integrity-0339-rls.sh');
const SVC = read('src/services/sdk/LeaveRequestService.ts');
const PAGE = read('src/pages/employee/LeaveRequestPage.tsx');
const ROUTER = read('src/router/AppRouter.tsx');
const LEGACY = read('src/router/legacyRedirect.ts');
const SDK_INDEX = read('src/services/sdk/index.ts');
const HR_SVC = read('src/services/sdk/HrApprovalService.ts');

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
const M_CODE = codeOnly(M);

// ════════════════════════════════════════════════════════════════
describe('0339 — بنية المايجريشن', () => {
  it('كل دالة تُسبَق بـDROP صريح (CREATE OR REPLACE لا يغيّر نوع الإرجاع)', () => {
    for (const fn of ['leave_working_days', 'leave_preview_working_days',
      'leave_balance_bucket', 'submit_leave_request',
      'cancel_leave_request', 'leave_requests_view']) {
      const drop = M.indexOf(`DROP FUNCTION IF EXISTS public.${fn}(`);
      const create = M.indexOf(`CREATE FUNCTION public.${fn}(`);
      expect(drop, `${fn}: لا DROP`).toBeGreaterThan(-1);
      expect(create, `${fn}: DROP بعد CREATE`).toBeGreaterThan(drop);
    }
  });

  it('★ anon لا يُمنح EXECUTE على أي دالة جديدة', () => {
    for (const fn of ['leave_working_days', 'leave_preview_working_days',
      'submit_leave_request', 'cancel_leave_request', 'leave_requests_view']) {
      expect(M, `${fn}: لا REVOKE من anon`)
        .toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`));
      expect(M_CODE, `${fn}: مُنح لـanon`)
        .not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO anon`));
    }
  });

  it('★★ الدوال الكاتبة VOLATILE — الكتابة مستحيلة في STABLE', () => {
    expect(fnBody('submit_leave_request')).toMatch(/\nVOLATILE\n/);
    expect(fnBody('cancel_leave_request')).toMatch(/\nVOLATILE\n/);
  });

  it('★★★ leave_requests_view تبقى SECURITY INVOKER — تحترم RLS', () => {
    const body = fnBody('leave_requests_view');
    expect(body).toMatch(/SECURITY INVOKER/);
    expect(body).not.toMatch(/SECURITY DEFINER/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ① — المعرّف يُشتقّ من الجلسة (عائلة عطل 0335)', () => {
  const body = fnBody('submit_leave_request');

  it('★★★ لا تستقبل employee_id من المتصفح', () => {
    const sig = M.slice(M.indexOf('CREATE FUNCTION public.submit_leave_request('),
      M.indexOf('RETURNS TABLE ('));
    expect(sig).not.toMatch(/p_employee_id/);
    expect(sig).not.toMatch(/p_tenant/);
  });

  it('★★ تشتقّه من current_user_employee_id() وترفض غيابه', () => {
    expect(body).toMatch(/v_emp\s+UUID := public\.current_user_employee_id\(\)/);
    expect(body).toMatch(/IF v_emp IS NULL THEN[\s\S]*?LEAVE_NO_EMPLOYEE/);
  });

  it('★ لا تستقبل working_days_count — تحسبه', () => {
    expect(body).not.toMatch(/p_working_days/);
    expect(body).toMatch(/v_days := public\.leave_working_days\(v_tenant, p_date_from, p_date_to\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ② — أيام العمل: الجمعة والعطل', () => {
  it('★ يستثني الجمعة بـISODOW (لا getDay مثل المتصفح)', () => {
    const body = fnBody('leave_working_days');
    expect(body).toMatch(/EXTRACT\(ISODOW FROM d\.day\) <> 5/);
  });

  it('★★ يستثني holidays مُرشَّحة بالمستأجر', () => {
    const body = fnBody('leave_working_days');
    expect(body).toMatch(/FROM public\.holidays h/);
    expect(body).toMatch(/h\.tenant_id = p_tenant/);
    expect(body).toMatch(/h\.date = d\.day::DATE/);
  });

  it('★★★ المعاينة لا تستقبل tenant_id من المتصفح', () => {
    const sig = M.slice(M.indexOf('CREATE FUNCTION public.leave_preview_working_days('),
      M.indexOf('CREATE FUNCTION public.leave_preview_working_days(') + 200);
    expect(sig).toMatch(/\(p_from DATE, p_to DATE\)/);
    expect(sig).not.toMatch(/p_tenant/);
    expect(fnBody('leave_preview_working_days'))
      .toMatch(/public\.current_user_tenant_id\(\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ③ — الرصيد يتحرك فعلاً', () => {
  const trg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.tg_leave_balance_movement()'),
    M.indexOf('COMMENT ON FUNCTION public.tg_leave_balance_movement()'));

  it('★★ حجز عند الطلب (pending +=)', () => {
    expect(trg).toMatch(/v_new = 'انتظار' THEN[\s\S]*?annual_pending = annual_pending \+ v_days/);
  });

  it('★★ تثبيت عند الاعتماد (pending -= · used +=)', () => {
    expect(trg).toMatch(/v_old = 'انتظار' AND v_new = 'موافق'/);
    expect(trg).toMatch(/annual_used\s+= annual_used \+ v_days/);
  });

  it('★★ تحرير عند الرفض أو الإلغاء', () => {
    expect(trg).toMatch(/v_old = 'انتظار' AND v_new IN \('مرفوض','ملغى'\)/);
    expect(trg).toMatch(/v_old = 'موافق' AND v_new IN \('مرفوض','ملغى'\)/);
  });

  it('★ لا يهبط الرصيد تحت الصفر (GREATEST)', () => {
    expect(trg).toMatch(/GREATEST\(annual_pending - v_days, 0\)/);
    expect(trg).toMatch(/GREATEST\(sick_pending - v_days, 0\)/);
  });

  it('★ الأنواع بلا رصيد (وفاة/زواج/تكليف) لا تُخصم', () => {
    const bucket = fnBody('leave_balance_bucket');
    expect(bucket).toMatch(/WHEN 'سنوية' THEN 'annual'/);
    expect(bucket).toMatch(/WHEN 'مرضية' THEN 'sick'/);
    expect(bucket).toMatch(/ELSE NULL/);
    expect(trg).toMatch(/IF v_bucket IS NULL[\s\S]*?RETURN COALESCE\(NEW, OLD\)/);
  });

  it('المحفّز على INSERT و UPDATE OF status و DELETE', () => {
    expect(M).toMatch(/AFTER INSERT OR UPDATE OF status OR DELETE ON public\.leaves/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ④ — الفحوص المسبقة', () => {
  const body = fnBody('submit_leave_request');

  it('★★ التداخل: مدَيان يتقاطعان يُرفضان', () => {
    expect(body).toMatch(/l\.date_from\s+<= p_date_to/);
    expect(body).toMatch(/l\.date_to\s+>= p_date_from/);
    expect(body).toMatch(/l\.status IN \('انتظار','موافق'\)/);
    expect(body).toMatch(/LEAVE_OVERLAP/);
  });

  it('★★ التداخل مُرشَّح بالمستأجر وبالموظف معاً', () => {
    const clash = body.slice(body.indexOf('SELECT count(*) INTO v_clash'),
      body.indexOf('LEAVE_OVERLAP'));
    expect(clash).toMatch(/l\.tenant_id\s+= v_tenant/);
    expect(clash).toMatch(/l\.employee_id = v_emp/);
  });

  it('★★ سقف الرصيد يحسب المستهلَك + المعلّق', () => {
    expect(body).toMatch(/annual_used \+ annual_pending INTO v_total, v_taken/);
    expect(body).toMatch(/IF v_taken \+ v_days > v_total THEN/);
    expect(body).toMatch(/LEAVE_INSUFFICIENT_BALANCE/);
  });

  it('★ الماضي البعيد مرفوض والتسوية القصيرة مسموحة', () => {
    expect(body).toMatch(/IF p_date_from < current_date - 7 THEN/);
    expect(body).toMatch(/LEAVE_TOO_OLD/);
  });

  it('★ الحجّ مرّة واحدة — في القاعدة لا في المتصفح وحده', () => {
    expect(body).toMatch(/LEAVE_HAJJ_USED/);
    expect(body).toMatch(/bool_or\(hajj_taken\) INTO v_hajj/);
  });

  it('★ مدى بلا أيام عمل مرفوض', () => {
    expect(body).toMatch(/IF v_days = 0 THEN[\s\S]*?LEAVE_NO_WORKDAYS/);
  });

  it('★★ السلسلة تُنشأ في نفس المعاملة — لا طلب بلا سلسلة', () => {
    expect(body).toMatch(/v_req := public\.create_hr_approval\('leave', v_lv, v_emp\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑤ — تضارب المصالح', () => {
  const chain = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.create_hr_approval('),
    M.indexOf('COMMENT ON FUNCTION public.create_hr_approval('));

  it('★★★ الخطوة تُتخطّى إن كان معتمِدها هو الطالب', () => {
    expect(chain).toMatch(/v_approvers\[i\] = v_requester_uid THEN[\s\S]*?CONTINUE/);
  });

  it('★★ معرّف الطالب يُقرأ من employees.user_id (لا employees.id)', () => {
    expect(chain).toMatch(/SELECT department_id, user_id INTO v_dept, v_requester_uid/);
  });

  it('★★ التخطّي لا يُفرغ السلسلة — v_order يُزاد للخطوات الباقية فقط', () => {
    // v_order يُزاد بعد الـCONTINUE لا قبله
    const skipIdx = chain.indexOf('CONTINUE;');
    const orderIdx = chain.indexOf('v_order := v_order + 1;');
    expect(orderIdx).toBeGreaterThan(skipIdx);
  });

  it('★★ الاعتماد التلقائي يُزامن المصدر (كان leaves تبقى انتظار)', () => {
    expect(chain).toMatch(/IF v_order = 0 THEN[\s\S]*?sync_hr_source_status\(v_req_id, 'approved'\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑥ — الأيتام والإلغاء', () => {
  it('★★ محفّز إغلاق السلسلة على leaves و permissions_request', () => {
    expect(M).toMatch(/BEFORE DELETE ON public\.leaves\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.tg_close_orphan_hr_request/);
    expect(M).toMatch(/BEFORE DELETE ON public\.permissions_request\s*\n\s*FOR EACH ROW EXECUTE FUNCTION public\.tg_close_orphan_hr_request/);
  });

  it('★★ الإغلاق مُرشَّح بـrequest_type — related_id بلا FK (متعدد الأشكال)', () => {
    const trg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.tg_close_orphan_hr_request()'),
      M.indexOf('COMMENT ON FUNCTION public.tg_close_orphan_hr_request()'));
    expect(trg).toMatch(/r\.request_type = v_type/);
    expect(trg).toMatch(/r\.tenant_id\s+= OLD\.tenant_id/);
  });

  it('★★★ الإلغاء يفحص الملكية ولا يحذف', () => {
    const body = fnBody('cancel_leave_request');
    expect(body).toMatch(/LEAVE_NOT_OWNER/);
    expect(body).toMatch(/SET status = 'ملغى'/);
    expect(body).not.toMatch(/DELETE FROM public\.leaves/);
  });

  it('★★ الإلغاء يرفع علَم المزامنة وإلا صدّه حارس 0324', () => {
    expect(fnBody('cancel_leave_request'))
      .toMatch(/set_config\('kyvzon\.approval_sync', 'true', TRUE\)/);
  });

  it('★ الموظف يلغي المعلّق فقط · staff يلغي المعتمَد', () => {
    const body = fnBody('cancel_leave_request');
    expect(body).toMatch(/IF NOT v_staff AND v_row\.status <> 'انتظار' THEN/);
    expect(body).toMatch(/LEAVE_NOT_CANCELLABLE/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑦ — سياستا المعتمِد (شاشات المشرف كانت فارغة)', () => {
  it('★★★ سياسة SELECT للمعتمِد على leaves', () => {
    expect(M).toMatch(/CREATE POLICY kyvzon_leaves_select_approver ON public\.leaves/);
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_leaves_select_approver'),
      M.indexOf('COMMENT ON POLICY kyvzon_leaves_select_approver'));
    expect(pol).toMatch(/FOR SELECT/);
    expect(pol).toMatch(/s\.approver_id\s+= auth\.uid\(\)/);
    expect(pol).toMatch(/tenant_id = public\.current_user_tenant_id\(\)/);
  });

  it('★★ قراءة فقط — لا FOR ALL ولا WITH CHECK', () => {
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_leaves_select_approver'),
      M.indexOf('COMMENT ON POLICY kyvzon_leaves_select_approver'));
    expect(pol).not.toMatch(/FOR ALL/);
    expect(pol).not.toMatch(/WITH CHECK/);
  });

  it('★★ نفس السياسة على permissions_request', () => {
    expect(M).toMatch(/CREATE POLICY kyvzon_permissions_request_select_approver/);
    const pol = M.slice(M.indexOf('CREATE POLICY kyvzon_permissions_request_select_approver'),
      M.indexOf('COMMENT ON POLICY kyvzon_permissions_request_select_approver'));
    expect(pol).toMatch(/r\.request_type = 'permission'/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑧ — قيود الحالة والسقف', () => {
  it('★★ CHECK على leaves.status بأربع قيم', () => {
    expect(M).toMatch(/ADD CONSTRAINT leaves_status_check\s*\n\s*CHECK \(status IN \('انتظار','موافق','مرفوض','ملغى'\)\)/);
  });

  it('★ التطبيع يسبق القيد (العمود كان نصّاً حرّاً)', () => {
    const norm = M.indexOf("UPDATE public.leaves SET status = 'انتظار'");
    const check = M.indexOf('ADD CONSTRAINT leaves_status_check');
    expect(norm).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(norm);
  });

  it('★ سقف الزمنيات ثلاث يومياً ولا يحسب الملغى/المرفوض', () => {
    const trg = M.slice(M.indexOf('CREATE OR REPLACE FUNCTION public.tg_permission_daily_cap()'),
      M.indexOf('COMMENT ON FUNCTION public.tg_permission_daily_cap()'));
    expect(trg).toMatch(/IF v_n >= 3 THEN/);
    expect(trg).toMatch(/p\.status IN \('انتظار','موافق'\)/);
    expect(trg).toMatch(/p\.id <> NEW\.id/);
    expect(trg).toMatch(/p\.tenant_id\s+= NEW\.tenant_id/);
  });

  it('★ الفهارس الجزئية تطابق شروط الاستعلامات', () => {
    expect(M).toMatch(/idx_leaves_overlap_probe[\s\S]*?WHERE status IN \('انتظار','موافق'\)/);
    expect(M).toMatch(/idx_permissions_request_daily[\s\S]*?WHERE status IN \('انتظار','موافق'\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑨ — طبقة SDK', () => {
  it('★★★ لا تلمس supabase.from() — دوال RPC فقط', () => {
    expect(SVC_CODE).not.toMatch(/supabase\s*\.\s*from\(/);
    for (const rpc of ['leave_requests_view', 'submit_leave_request',
      'cancel_leave_request', 'leave_preview_working_days']) {
      expect(SVC).toContain(`'${rpc}'`);
    }
  });

  it('★★ submit لا تقبل employeeId ولا workingDays', () => {
    const sig = SVC.slice(SVC.indexOf('async submit(input: {'),
      SVC.indexOf('}): Promise<SubmitLeaveResult>'));
    expect(sig).not.toMatch(/employeeId/);
    expect(sig).not.toMatch(/workingDays/);
    expect(sig).toMatch(/leaveType/);
  });

  it('★ لا as any ولا confirm/prompt/alert', () => {
    expect(SVC_CODE).not.toMatch(/as any/);
    expect(SVC_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
  });

  it('★ مُصدَّرة من فهرس الـSDK', () => {
    expect(SDK_INDEX).toMatch(/export \{ leaveRequestService, leaveErrorMessage \} from '\.\/LeaveRequestService'/);
  });

  it('★★ findRequestIdBySource ترشّح بـrequest_type (related_id بلا FK)', () => {
    const fn = HR_SVC.slice(HR_SVC.indexOf('async findRequestIdBySource('),
      HR_SVC.indexOf('roleLabel('));
    expect(fn).toMatch(/\.eq\('request_type', requestType\)/);
    expect(fn).toMatch(/\.eq\('related_id', relatedId\)/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑩ — الصفحة', () => {
  it('★★★ لا تشتقّ صلاحية من مسار URL', () => {
    expect(PAGE_CODE).not.toMatch(/location\.pathname/);
    expect(PAGE_CODE).not.toMatch(/startsWith\('\/app\//);
    expect(PAGE_CODE).not.toMatch(/canApprove/);
    expect(PAGE_CODE).not.toMatch(/viewMode/);
  });

  it('★★★ الصلاحية من القاعدة: canDecide / canCancel', () => {
    expect(PAGE_CODE).toMatch(/row\.canDecide &&/);
    expect(PAGE_CODE).toMatch(/row\.canCancel &&/);
  });

  it('★★★ لا اعتماد مباشر — لا approveLeave ولا rejectLeave', () => {
    expect(PAGE_CODE).not.toMatch(/approveLeave/);
    expect(PAGE_CODE).not.toMatch(/rejectLeave/);
    expect(PAGE_CODE).toMatch(/hrApprovalService\.decide\(/);
  });

  it('★★ لا تلمس Supabase ولا تُنشئ الطلب بـcreateLeave الخام', () => {
    expect(PAGE_CODE).not.toMatch(/supabase/);
    expect(PAGE_CODE).not.toMatch(/leaveService\.createLeave/);
    expect(PAGE_CODE).toMatch(/leaveRequestService\.submit\(/);
  });

  it('★★ المدة من القاعدة لا من calculateWorkingDays', () => {
    expect(PAGE_CODE).not.toMatch(/calculateWorkingDays/);
    expect(PAGE_CODE).toMatch(/leaveRequestService\.workingDays\(/);
  });

  it('★ الإلغاء بديل الحذف — لا delete/remove', () => {
    expect(PAGE_CODE).toMatch(/leaveRequestService\.cancel\(/);
    expect(PAGE_CODE).not.toMatch(/\.delete\(/);
  });

  it('★ الممنوعات: confirm · prompt · alert · as any', () => {
    expect(PAGE_CODE).not.toMatch(/\b(confirm|prompt|alert)\s*\(/);
    expect(PAGE_CODE).not.toMatch(/as any/);
  });

  it('★ حالة «ملغى» معروضة (لولاها لاختفت الطلبات الملغاة)', () => {
    expect(PAGE).toMatch(/ملغى: 'bg-slate-100/);
    expect(PAGE).toMatch(/<option value="ملغى">/);
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑪ — التنقّل (فرعان ميّتان)', () => {
  it('★★★ /app/manager/leave-requests صار مسجَّلاً', () => {
    const mgr = ROUTER.slice(ROUTER.indexOf(`<Route path="manager" element={<RequireRole`),
      ROUTER.indexOf(`<Route path="supervisor" element={<RequireRole`));
    expect(mgr).toMatch(/<Route path="leave-requests" element=\{<LeaveRequestPage \/>\} \/>/);
  });

  it('★★★ /app/supervisor/leave-requests صار مسجَّلاً', () => {
    const sup = ROUTER.slice(ROUTER.indexOf(`<Route path="supervisor" element={<RequireRole`),
      ROUTER.indexOf(`<Route path="hr" element={<RequireRole`));
    expect(sup).toMatch(/<Route path="leave-requests" element=\{<LeaveRequestPage \/>\} \/>/);
  });

  it('★★ VIEW_TO_PATH لم يعد يوجّه المدير/المشرف لمسار الموظف', () => {
    expect(LEGACY).toMatch(/'manager-leave-requests':\s+'\/app\/manager\/leave-requests'/);
    expect(LEGACY).toMatch(/'supervisor-leave-requests':\s+'\/app\/supervisor\/leave-requests'/);
  });

  it('★ كل وجهة leave-requests في VIEW_TO_PATH لها Route مقابل', () => {
    const targets = [...LEGACY.matchAll(/'\/app\/(\w+)\/leave-requests'/g)]
      .map((m) => m[1]);
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const role of new Set(targets)) {
      const marker = `<Route path="${role}" element={<RequireRole`;
      const i = ROUTER.indexOf(marker);
      expect(i, `كتلة ${role} غير موجودة في AppRouter`).toBeGreaterThan(-1);
      const nextIdx = ['employee', 'manager', 'supervisor', 'hr', 'admin']
        .map((r) => ROUTER.indexOf(`<Route path="${r}" element={<RequireRole`))
        .filter((x) => x > i);
      const blk = ROUTER.slice(i, nextIdx.length ? Math.min(...nextIdx) : ROUTER.length);
      expect(blk, `/app/${role}/leave-requests بلا Route`)
        .toMatch(/<Route path="leave-requests"/);
    }
  });
});

// ════════════════════════════════════════════════════════════════
describe('0339 ⑫ — الاختبارات نفسها', () => {
  it('اختبار السلوك يرجع كل شيء (لا يلوّث القاعدة)', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION 'ROLLBACK_VERIFY_0339'/);
    expect(VERIFY).toMatch(/IF SQLERRM <> 'ROLLBACK_VERIFY_0339' THEN RAISE/);
  });

  it('★★ يقيس العزل بين مستأجرين لا مستأجراً واحداً', () => {
    expect(VERIFY).toMatch(/v_tb\s+UUID := gen_random_uuid\(\)/);
    expect(VERIFY).toMatch(/تسريب عبر المستأجرين/);
  });

  it('★★ يلتقط سجلّ الموظف من محفّز 0317 ولا يُدرج ثانياً', () => {
    expect(VERIFY).toMatch(/SELECT id INTO v_eEmp FROM public\.employees WHERE user_id=v_uEmp/);
    expect(VERIFY).not.toMatch(/INSERT INTO public\.employees/);
  });

  it('★ اختبار RLS يستعمل SET ROLE authenticated لا postgres', () => {
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/SET request\.jwt\.claim\.sub/);
  });

  it('★★ اختبار RLS يفحص anon صراحةً', () => {
    expect(RLS).toMatch(/SET ROLE anon/);
    expect(RLS).toMatch(/permission denied/);
  });
});
