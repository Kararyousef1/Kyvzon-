/**
 * ════════════════════════════════════════════════════════════════
 *  notificationSurfaceContract.test.ts
 *
 *  عقد توحيد سطح الإشعارات (migration 0326).
 *
 *  ★ فحص ثابت على النص — لا يُثبت السلوك. الإثبات السلوكي في:
 *      tools/dev/verify-notification-surface-0326.sql      36 تأكيداً
 *      tools/dev/verify-tawathul-isolation-0326-rls.sh      8 عبر RLS
 *    هذه الاختبارات تمنع **الانحدار** بالحذف السهو.
 * ════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const M0326 = read('supabase/migrations/0326_unify_notification_surface.sql');
const VERIFY = read('tools/dev/verify-notification-surface-0326.sql');
const RLS = read('tools/dev/verify-tawathul-isolation-0326-rls.sh');
const TAW_SVC = read('src/modules/tawathul/services/TawathulNotificationService.ts');

/** يُجرّد التعليقات — الفحص على الكود المُنفَّذ لا على شرحه */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0326 — جسر التواصل إلى الجرس', () => {
  const body = (() => {
    const s = M0326.indexOf('CREATE OR REPLACE FUNCTION public.tawathul_notify_on_message');
    const e = M0326.indexOf('COMMENT ON FUNCTION public.tawathul_notify_on_message');
    return M0326.slice(s, e);
  })();

  it('★ يكتب في الجدول الخاص **و** في notifications الموحّد', () => {
    expect(body).toMatch(/INSERT INTO public\.tawathul_notifications/);
    expect(body).toMatch(/PERFORM public\.notify_user\(/);
  });

  it('★ يمرّ عبر notify_user لا INSERT مباشر (حراسة: لا إشعار ذاتي)', () => {
    // notify_user تحرس: p_user_id = auth.uid() ⇒ NULL، ولا تُسقط العملية
    expect(codeOnly(body)).not.toMatch(/INSERT INTO public\.notifications/);
  });

  it('يحترم الكتم والمغادرة', () => {
    expect(body).toMatch(/m\.left_at IS NULL/);
    expect(body).toMatch(/COALESCE\(m\.is_muted, FALSE\) = FALSE/);
    expect(body).toMatch(/m\.user_id IS DISTINCT FROM NEW\.sender_id/);
  });

  it('يميّز الإشارة بالاسم عن الرسالة العادية', () => {
    expect(body).toMatch(/'tawathul_mention'/);
    expect(body).toMatch(/'tawathul_message'/);
    expect(body).toMatch(/NEW\.mentions @> to_jsonb/);
  });

  it('★ الرابط يوصل للمحادثة بعينها', () => {
    expect(body).toMatch(/'\/app\/tawathul\?c=' \|\| NEW\.conversation_id/);
  });

  it('★ عنوان المحادثة في نص الإشعار (السياق)', () => {
    expect(body).toMatch(/FROM public\.tawathul_conversations c/);
    expect(body).toMatch(/COALESCE\(' — ' \|\| v_conv, ''\)/);
  });

  it('related_table/related_id يربطان النسختين', () => {
    expect(body).toMatch(/'tawathul_messages'/);
    expect(body).toMatch(/NEW\.id\)/);
  });
});

describe('0326 — مزامنة القراءة في الاتجاهين', () => {
  const body = (() => {
    const s = M0326.indexOf('CREATE OR REPLACE FUNCTION public.tg_sync_tawathul_read');
    const e = M0326.indexOf('COMMENT ON FUNCTION public.tg_sync_tawathul_read');
    return M0326.slice(s, e);
  })();

  it('★ محفّزان: على جدول التواصل وعلى الجرس', () => {
    expect(M0326).toMatch(/AFTER UPDATE OF is_read ON public\.tawathul_notifications/);
    expect(M0326).toMatch(/AFTER UPDATE OF is_read ON public\.notifications/);
  });

  it('★ يتجاهل التحديث الذي لا يغيّر حالة القراءة (لا حلقة لانهائية)', () => {
    expect(body).toMatch(/IS NOT DISTINCT FROM COALESCE\(OLD\.is_read, FALSE\)/);
    expect(body).toMatch(/IF NOT COALESCE\(NEW\.is_read, FALSE\) THEN RETURN NEW/);
  });

  it('★ المزامنة محصورة بالمستخدم والمستأجر نفسه', () => {
    expect(body).toMatch(/n\.user_id\s*=\s*NEW\.user_id/);
    expect(body).toMatch(/n\.tenant_id\s*=\s*NEW\.tenant_id/);
    expect(body).toMatch(/t\.user_id\s*=\s*NEW\.user_id/);
  });

  it('لا يُحدّث ما هو مقروء أصلاً (يقلّل الكتابة)', () => {
    expect(body).toMatch(/NOT COALESCE\(n\.is_read, FALSE\)/);
    expect(body).toMatch(/NOT COALESCE\(t\.is_read, FALSE\)/);
  });
});

describe('0326 — الجدول اليتيم', () => {
  const body = (() => {
    const s = M0326.indexOf('CREATE FUNCTION public.notify_inventory_inbound');
    const e = M0326.indexOf('COMMENT ON FUNCTION public.notify_inventory_inbound');
    return M0326.slice(s, e);
  })();

  it('VOLATILE — الكتابة مستحيلة في STABLE (درس 0320)', () => {
    expect(body).toMatch(/\bVOLATILE\b/);
  });

  it('★ يكتب في الجدول **وفي** الجرس', () => {
    expect(body).toMatch(/INSERT INTO public\.inventory_inbound_notifications/);
    expect(body).toMatch(/public\.notify_user\(/);
  });

  it('يدعم مستخدماً بعينه أو دوراً في وحدة المخزون', () => {
    expect(body).toMatch(/p_target_user IS NOT NULL/);
    expect(body).toMatch(/u\.unit_key\s*=\s*'inventory'/);
  });

  it('يرفض المدخلات الفارغة بأمان', () => {
    expect(body).toMatch(/p_title IS NULL OR btrim\(p_title\) = ''/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN 0/);
  });
});

describe('0326 — لوحة تشخيص سطح الإشعارات', () => {
  const body = (() => {
    const s = M0326.indexOf('CREATE FUNCTION public.notification_surface_overview');
    const e = M0326.indexOf('COMMENT ON FUNCTION public.notification_surface_overview');
    return M0326.slice(s, e);
  })();

  it('★ تُصنّف الجداول ولا تدّعي أن سجلّ التدقيق يصل الجرس', () => {
    expect(body).toMatch(/out_reaches_bell/);
    expect(body).toMatch(/v_has_u AND v_has_r/);
    expect(body).toMatch(/سجلّ تدقيق/);
  });

  it('تحترم عزل المستأجر', () => {
    expect(body).toMatch(/WHERE tenant_id = \$1/);
    expect(body).toMatch(/IF v_tenant IS NULL THEN RETURN/);
  });

  it('★ التوثيق يشرح لماذا لا تُدمج سجلّات التدقيق', () => {
    expect(M0326).toMatch(/لا يجوز دمجها/);
    expect(M0326).toMatch(/لا `user_id` ولا `is_read`/);
  });
});

describe('0326 — تفصيل غير المقروء', () => {
  it('my_unread_by_kind يفصل الرسائل عن الموافقات', () => {
    const s = M0326.indexOf('CREATE FUNCTION public.my_unread_by_kind');
    const e = M0326.indexOf('COMMENT ON FUNCTION public.my_unread_by_kind');
    const body = M0326.slice(s, e);
    expect(body).toMatch(/'tawathul%'[\s\S]{0,40}'messages'/);
    expect(body).toMatch(/'approval%'[\s\S]{0,40}'approvals'/);
    expect(body).toMatch(/expires_at IS NULL OR n\.expires_at > NOW\(\)/);
  });
});

describe('0326 — الصلاحيات', () => {
  it.each([
    'notify_inventory_inbound(TEXT,TEXT,UUID,TEXT,TEXT,UUID,TEXT)',
    'notification_surface_overview()',
    'my_unread_by_kind()',
  ])('%s محجوبة عن anon وممنوحة لـauthenticated', (sig) => {
    const esc = sig.replace(/[()]/g, (c) => `\\${c}`);
    expect(M0326).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM anon`));
    expect(M0326).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc}\\s*\\n?\\s*TO authenticated`),
    );
  });

  it('كل الدوال SECURITY DEFINER مع search_path مثبَّت', () => {
    const definers = M0326.match(/SECURITY DEFINER/g) ?? [];
    const paths = M0326.match(/SET search_path = public/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(5);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });
});

describe('0326 — طبقة الخدمة', () => {
  it('TawathulNotificationService يوثّق المزامنة التلقائية', () => {
    expect(TAW_SVC).toMatch(/0326/);
    expect(TAW_SVC).toMatch(/trg_sync_tawathul_read/);
  });
});

describe('0326 — اختبارات الإثبات', () => {
  it('verify-0326 يوثّق العدد الحقيقي ولا تأكيدات ميتة', () => {
    expect(VERIFY).toMatch(/verify-0326: %\/36 تأكيداً ناجحاً/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*>=\s*0[^0-9]/);
    expect(VERIFY).not.toMatch(/ASSERT[^;]*\bOR TRUE\b/);
  });

  it('★ يفحص الحالات السلبية: المكتوم والمغادر والمرسل', () => {
    expect(VERIFY).toMatch(/العضو المكتوم أُشعِر/);
    expect(VERIFY).toMatch(/عضو غادر المحادثة أُشعِر/);
    expect(VERIFY).toMatch(/المرسل أُشعِر برسالته هو/);
  });

  it('★ يفحص المزامنة في الاتجاهين لا اتجاه واحد', () => {
    expect(VERIFY).toMatch(/القراءة في التواصل لم تُزامَن للجرس/);
    expect(VERIFY).toMatch(/القراءة في الجرس لم تُزامَن للتواصل/);
  });

  it('★ يفحص أن المزامنة لا تلمس مستخدماً آخر', () => {
    expect(VERIFY).toMatch(/المزامنة علّمت إشعارات مستخدم آخر/);
  });

  it('يوثّق قيد event_type الحقيقي', () => {
    expect(VERIFY).toMatch(/asn_created/);
    expect(VERIFY).toMatch(/event_type مقيَّد بـCHECK/);
  });

  it('سكربت RLS موجود وقابل للتنفيذ ويفحص الجسر', () => {
    expect(existsSync(resolve(root, 'tools/dev/verify-tawathul-isolation-0326-rls.sh'))).toBe(true);
    expect(RLS).toMatch(/SET ROLE authenticated/);
    expect(RLS).toMatch(/الجسر سرّب/);
    expect(RLS).toMatch(/الجسر كشف محادثة لغير عضو/);
  });

  it('★ سكربت RLS يفحص الحالة الإيجابية أيضاً (لا المنع وحده)', () => {
    expect(RLS).toMatch(/العضو يرى إشعار المحادثة في الجرس/);
    expect(RLS).toMatch(/العضو الشرعي محجوب عن محادثته/);
  });
});
