/**
 * ════════════════════════════════════════════════════════════════
 *  approvalLifecycleContract.test.ts
 *
 *  عقد دورة حياة الاعتماد وإيصال الإشعارات (migration 0323).
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في
 *    tools/dev/verify-approval-lifecycle-0323.sql (44 تأكيداً على
 *    Postgres محلي). هذه الاختبارات تمنع **الانحدار** بالحذف السهو.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0323 = read('supabase/migrations/0323_approval_lifecycle_and_notifications.sql');
const VERIFY = read('tools/dev/verify-approval-lifecycle-0323.sql');
const INBOX = read('src/shared/components/dashboard/HrApprovalInbox.tsx');
const HOOK = read('src/shared/hooks/useNotificationSubscription.ts');
const NOTIF_SVC = read('src/services/notifications/notificationService.ts');
const LEAVE_SVC = read('src/services/sdk/LeaveService.ts');

/**
 * يُجرّد التعليقات قبل الفحص.
 *
 * ★ تصحيح خطأ منهجي في نسختي الأولى من هذا الملف: كنتُ أفحص النص الخام،
 *   فسقطت ثلاثة اختبارات لأن **تعليقاتي التوثيقية نفسها** تذكر
 *   'موافق عليه' و`as any` وهي تشرح ما أُزيل. الفحص يجب أن يقع على
 *   الكود المُنفَّذ لا على شرحه.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // تعليقات الكتلة
    .replace(/^\s*\/\/.*$/gm, '');        // تعليقات السطر
}

describe('0323 — الدوال الجديدة', () => {
  it('approval_source_info تُنشأ بـDROP صريح (CREATE OR REPLACE لا يُغيّر نوع الإرجاع)', () => {
    expect(M0323).toMatch(/DROP FUNCTION IF EXISTS public\.approval_source_info\(TEXT, UUID\);/);
    expect(M0323).toMatch(/CREATE FUNCTION public\.approval_source_info\(/);
  });

  it('★ approval_source_info VOLATILE — الكتابة مستحيلة في STABLE', () => {
    const s = M0323.indexOf('CREATE FUNCTION public.approval_source_info');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.approval_source_info');
    expect(M0323.slice(s, e)).toMatch(/\bVOLATILE\b/);
  });

  it('★ approval_source_info تقرأ الجداول الأساسية لا العرض المُصفّى', () => {
    const s = M0323.indexOf('CREATE FUNCTION public.approval_source_info');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.approval_source_info');
    const body = M0323.slice(s, e);
    // العرض unified_approvals يُصفّي status='pending' فلا يصلح بعد القرار
    expect(body).not.toMatch(/FROM public\.unified_approvals\b/);
    expect(body).toMatch(/FROM public\.hr_approval_requests/);
    expect(body).toMatch(/FROM public\.crm_discount_approvals/);
  });

  it('تغطّي البوابات التسع كلها', () => {
    const s = M0323.indexOf('CREATE FUNCTION public.approval_source_info');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.approval_source_info');
    const body = M0323.slice(s, e);
    for (const m of ['hr', 'procurement', 'finance', 'contracts', 'movement',
                     'inventory', 'mrp', 'crm', 'general']) {
      expect(body).toContain(`p_source_module = '${m}'`);
    }
  });

  it('sync_hr_source_status تكتب المفردات العربية التي تقرؤها الشاشات', () => {
    const s = M0323.indexOf('CREATE FUNCTION public.sync_hr_source_status');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.sync_hr_source_status');
    const body = M0323.slice(s, e);
    expect(body).toMatch(/'موافق'/);
    expect(body).toMatch(/'مرفوض'/);
    // ★ 'موافق عليه' لا تقرؤها أي شاشة موظف
    expect(body).not.toContain('موافق عليه');
    expect(body).toMatch(/UPDATE public\.leaves/);
    expect(body).toMatch(/UPDATE public\.permissions_request/);
  });

  it('sync_hr_source_status تحترم عزل المستأجر', () => {
    const s = M0323.indexOf('CREATE FUNCTION public.sync_hr_source_status');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.sync_hr_source_status');
    expect(M0323.slice(s, e)).toMatch(/AND tenant_id = v_tenant/);
  });
});

describe('0323 — المحفّزات', () => {
  it('★ محفّز الخطوات على INSERT **و**UPDATE — UPDATE كان مفقوداً', () => {
    const hits = M0323.match(
      /AFTER INSERT OR UPDATE OF status ON public\.\w+_approval_steps/g,
    );
    expect(hits).toHaveLength(4);
  });

  it('يغطّي جداول الخطوات الأربعة', () => {
    for (const t of ['unified_approval_steps', 'hr_approval_steps',
                     'procurement_approval_steps', 'contract_approval_steps']) {
      expect(M0323).toContain(`ON public.${t}`);
    }
  });

  it('★ صاحب خطوة pending لا يُشعَر — دوره لم يحن', () => {
    const s = M0323.indexOf('CREATE OR REPLACE FUNCTION public.tg_notify_approval_step');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.tg_notify_approval_step');
    const body = M0323.slice(s, e);
    expect(body).toMatch(/COALESCE\(NEW\.status::TEXT,''\) = 'active'/);
    expect(body).not.toMatch(/IN \('active','pending'\)/);
  });

  it('اكتمال السلسلة يُقاس على UPDATE فقط (درس السباق الزمني 0322)', () => {
    const s = M0323.indexOf('CREATE OR REPLACE FUNCTION public.tg_notify_approval_step');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.tg_notify_approval_step');
    expect(M0323.slice(s, e)).toMatch(/IF TG_OP = 'UPDATE'/);
  });

  it('البوابات المفردة الأربع مربوطة بالإشعارات', () => {
    for (const t of ['inventory_adjustment_approvals', 'mrp_bom_approvals',
                     'crm_discount_approvals', 'contract_approval_requests']) {
      expect(M0323).toMatch(
        new RegExp(`CREATE TRIGGER trg_notify_single_approval[\\s\\S]{0,120}ON public\\.${t}`),
      );
    }
  });
});

describe('0323 — unified_approval_decide', () => {
  const body = (() => {
    const s = M0323.indexOf('CREATE OR REPLACE FUNCTION public.unified_approval_decide');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.unified_approval_decide');
    return M0323.slice(s, e);
  })();

  it('★ تُفوّض لسلسلة HR الأصلية (كانت ترفض المعتمِد بـNOT_ASSIGNED_TO_UNIT)', () => {
    expect(body).toMatch(/RETURN public\.decide_hr_approval_step\(/);
    expect(body).toMatch(/FROM public\.hr_approval_steps/);
  });

  it('تُفوّض لسلسلة المشتريات كذلك', () => {
    expect(body).toMatch(/RETURN public\.approve_procurement_step\(/);
  });

  it('★ تُشعر مُقدّم الطلب بالنتيجة — لم يكن يحدث أبداً', () => {
    expect(body).toMatch(/PERFORM public\.notify_approval_decided\(/);
  });

  it('تُزامن مصدر HR بعد القرار', () => {
    expect(body).toMatch(/PERFORM public\.sync_hr_source_status\(/);
  });

  it('تبقى الحراسة: NO_AUTH · NO_TENANT · NOT_YOUR_STEP', () => {
    expect(body).toMatch(/RAISE EXCEPTION 'NO_AUTH'/);
    expect(body).toMatch(/RAISE EXCEPTION 'NO_TENANT'/);
    expect(body).toMatch(/NOT_YOUR_STEP/);
  });
});

describe('0323 — my_approval_inbox', () => {
  const body = (() => {
    const s = M0323.indexOf('CREATE FUNCTION public.my_approval_inbox');
    const e = M0323.indexOf('COMMENT ON FUNCTION public.my_approval_inbox');
    return M0323.slice(s, e);
  })();

  it('★ تقرأ جداول الخطوات الأربعة — كانت تقرأ unified وحده', () => {
    expect(body).toMatch(/FROM public\.hr_approval_steps/);
    expect(body).toMatch(/FROM public\.procurement_approval_steps/);
    expect(body).toMatch(/FROM public\.contract_approval_steps/);
    expect(body).toMatch(/FROM public\.unified_approval_steps/);
  });

  it('صاحب الخطوة النشطة وحده يراها', () => {
    expect(body).toMatch(/active_approver = auth\.uid\(\)::TEXT/);
  });
});

describe('0323 — الصلاحيات', () => {
  it.each([
    'approval_source_info(TEXT, UUID)',
    'sync_hr_source_status(UUID, TEXT)',
    'my_unread_notification_count()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0323).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0323).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('كل الدوال SECURITY DEFINER مع search_path مثبَّت', () => {
    const definers = M0323.match(/SECURITY DEFINER/g) ?? [];
    const paths = M0323.match(/SET search_path = public/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(7);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });
});

describe('0323 — الواجهة', () => {
  it("★ HrApprovalInbox لم يعد يكتب 'موافق عليه' من المتصفح", () => {
    const code = codeOnly(INBOX);
    expect(code).not.toContain('موافق عليه');
    expect(code).not.toMatch(/leaveService\.update\(/);
    expect(code).not.toMatch(/permissionRequestService\.update\(/);
  });

  it('HrApprovalInbox بلا as any', () => {
    expect(codeOnly(INBOX)).not.toMatch(/\bas any\b/);
  });

  it('★ عدّاد الجرس يأتي من القاعدة لا من الصفحة المحمَّلة', () => {
    expect(NOTIF_SVC).toMatch(/rpc\('my_unread_notification_count'\)/);
    expect(HOOK).toMatch(/fetchUnreadCountFromServer/);
    expect(HOOK).toMatch(/Math\.max\(serverUnread, localUnread\)/);
  });

  it('فشل جلب العدّاد يُعيد null لا 0 (لا نُخفي الشارة عند خطأ شبكة)', () => {
    const s = NOTIF_SVC.indexOf('export async function fetchUnreadCountFromServer');
    const body = NOTIF_SVC.slice(s, s + 700);
    expect(body).toMatch(/return null;/);
    expect(body).not.toMatch(/return 0;/);
  });

  it('LeaveService يوثّق أنه مسار إداري يتجاوز السلسلة', () => {
    expect(LEAVE_SVC).toMatch(/يتجاوز سلسلة الموافقات/);
    expect(codeOnly(LEAVE_SVC)).not.toContain('موافق عليه');
    expect(codeOnly(LEAVE_SVC)).toContain("status: 'موافق'");
  });
});

describe('0323 — الاختبار السلوكي نفسه', () => {
  it('يوثّق العدد الحقيقي للتأكيدات', () => {
    expect(VERIFY).toMatch(/verify-0323: %\/44 تأكيداً ناجحاً/);
  });

  it('★ لا تأكيدات ميتة من نوع >= 0 أو OR TRUE', () => {
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('يفحص أخطر عطل: leaves.status بعد الاعتماد', () => {
    expect(VERIFY).toMatch(/v_txt = 'موافق'/);
    expect(VERIFY).toMatch(/leaves\.status/);
  });

  it('يفحص مساري الاعتماد والرفض معاً', () => {
    expect(VERIFY).toMatch(/'rejected', 'الرصيد لا يكفي'/);
    expect(VERIFY).toMatch(/v_txt = 'مرفوض'/);
  });
});
