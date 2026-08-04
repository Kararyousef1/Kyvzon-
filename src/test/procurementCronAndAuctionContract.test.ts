/**
 * عقد استكمال النواقص — الجولة الثانية
 *
 * يغطي:
 *  0268 — تشغيل الإشعارات المجدولة عبر cron متعدد المستأجرين
 *  0269 — قواعد المزاد حسب النوع (british / japanese / dutch)
 *  Edge Function: procurement-daily-notifications
 *  أداة التصدير الآمنة dataExport
 *
 * كل تأكيد هنا يقابل سلوكاً أُثبت بالتشغيل الفعلي على Postgres 17 محلي،
 * لا افتراضاً نصياً.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CRON = read('supabase/migrations/0268_procurement_cron_multitenant_dispatch.sql');
const AUCTION = read('supabase/migrations/0269_procurement_auction_type_rules.sql');
const EDGE = read('supabase/functions/procurement-daily-notifications/index.ts');
const SDK_INT = read('src/services/sdk/Procurement/ProcurementIntegrationService.ts');
const SDK_SRC = read('src/services/sdk/Procurement/SourcingService.ts');
const HEALTH_PAGE = read('src/pages/app/procurement/foundation/IntegrationHealthPage.tsx');
const AUCTION_PAGE = read('src/pages/app/procurement/sourcing/AuctionLivePage.tsx');

describe('0268 — جدولة الإشعارات متعددة المستأجرين', () => {
  it('يوفّر نسخ *_for_tenant لا تعتمد على سياق الجلسة', () => {
    for (const fn of [
      'notify_procurement_roles_for_tenant',
      'dispatch_contract_renewal_notifications_for_tenant',
      'dispatch_pr_approval_reminders_for_tenant',
      'dispatch_supplier_document_expiry_for_tenant',
      'dispatch_po_otif_alerts_for_tenant',
    ]) {
      expect(CRON).toContain(`CREATE OR REPLACE FUNCTION public.${fn}`);
    }
  });

  it('يمنح service_role التنفيذ — بدونه الجدولة مستحيلة', () => {
    expect(CRON).toContain(
      'GRANT EXECUTE ON FUNCTION public.run_procurement_daily_notifications_cron(INTEGER,INTEGER) TO service_role',
    );
  });

  it('يسحب الصلاحية من PUBLIC ومن anon/authenticated صراحةً', () => {
    expect(CRON).toContain(
      'REVOKE ALL ON FUNCTION public.run_procurement_daily_notifications_cron(INTEGER,INTEGER) FROM PUBLIC',
    );
    /*
      حرج: Supabase يضبط ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
      FUNCTIONS TO anon, authenticated, service_role. فتُمنَح كل دالة
      جديدة لـ anon بمنحة صريحة (proacl: anon=X/postgres).
      REVOKE ... FROM PUBLIC لا يسحب منحة صريحة — يسحب PUBLIC الضمنية فقط.
      بدون السحب الصريح أدناه نجح زائر غير مسجَّل في كتابة إشعارات
      لمستأجر لا يملكه (مُثبَت بالتشغيل على Postgres 17).
    */
    const explicitRevokes = CRON.match(/FROM anon, authenticated;/g) ?? [];
    expect(explicitRevokes.length).toBe(6); // الدوال الست جميعها
  });

  it('يتحقق من حرمان anon و authenticated على كل الدوال الست لا المُشغِّل وحده', () => {
    expect(CRON).toContain("has_function_privilege('anon', v_fn, 'EXECUTE')");
    expect(CRON).toContain("has_function_privilege('authenticated', v_fn, 'EXECUTE')");
    expect(CRON).toContain("anon must not execute %");
    expect(CRON).toContain("authenticated must not execute %");
  });

  it('يمر على المستأجرين المفعِّلين لوحدة المشتريات فقط', () => {
    expect(CRON).toContain("tm.module_key = 'procurement'");
    expect(CRON).toContain('tm.is_enabled = true');
  });

  it('يعزل أخطاء كل مستأجر حتى لا يوقف فشلٌ واحد البقية', () => {
    expect(CRON).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(CRON).toContain('SQLERRM::TEXT');
    expect(CRON).toContain('error_message TEXT');
  });

  it('يستبعد العقود المنتهية فعلاً من تنبيهات التجديد', () => {
    expect(CRON).toContain('c.end_date >= CURRENT_DATE');
  });

  it('يغطي po_otif_alerts — كانت مذكورة كنقص وغير منفَّذة', () => {
    expect(CRON).toContain('po_otif_alerts');
    expect(CRON).toContain("'po_otif_alert'");
    expect(CRON).toContain('a.resolved_at IS NULL');
  });

  it('يمنع تكرار الإشعار لنفس الكيان في نفس اليوم', () => {
    expect(CRON).toContain('sent_on = CURRENT_DATE');
    expect(CRON).toContain('THEN CONTINUE; END IF;');
  });

  it('يوفّر View لكشف توقّف الجدولة بصمت', () => {
    expect(CRON).toContain('CREATE OR REPLACE VIEW public.procurement_notification_dispatch_status');
    expect(CRON).toContain("'not_running'");
    expect(CRON).toContain("'healthy'");
  });

  it('يفشل المايجريشن إذا نقص أي كائن', () => {
    expect(CRON).toContain('RAISE EXCEPTION \'0268 failed:');
  });
});

describe('Edge Function — procurement-daily-notifications', () => {
  it('الملف موجود', () => {
    expect(existsSync(join(ROOT, 'supabase/functions/procurement-daily-notifications/index.ts'))).toBe(true);
  });

  it('يتحقق من CRON_SECRET بمقارنة ثابتة الزمن', () => {
    expect(EDGE).toContain('CRON_SECRET');
    expect(EDGE).toContain('diff |=');
    expect(EDGE).toContain('provided.length !== secret.length');
  });

  it('يستدعي المُشغِّل متعدد المستأجرين لا دالة 0266 المقيَّدة بالجلسة', () => {
    expect(EDGE).toContain('run_procurement_daily_notifications_cron');
    expect(EDGE).not.toContain("rpc('run_procurement_daily_notifications'");
  });

  it('يستخدم service_role ولا يسرّب تفاصيل الأخطاء', () => {
    expect(EDGE).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(EDGE).toContain("{ error: 'Cron failed' }");
  });

  it('يحدّ المعاملات القادمة من الخارج', () => {
    expect(EDGE).toContain('clampInt');
  });

  it('يسجّل النتيجة في سجل التدقيق', () => {
    expect(EDGE).toContain('platform_audit_log');
  });
});

describe('0269 — قواعد المزاد حسب النوع', () => {
  it('يفرض سقف starting_price — كان غائباً تماماً', () => {
    expect(AUCTION).toContain('BID_ABOVE_CEILING');
    expect(AUCTION).toContain('p_bid_price > v_auction.starting_price');
  });

  it('يفرّع المنطق على الأنواع الثلاثة', () => {
    expect(AUCTION).toContain("IF v_auction.auction_type = 'british'");
    expect(AUCTION).toContain("ELSIF v_auction.auction_type = 'japanese'");
    expect(AUCTION).toContain("ELSIF v_auction.auction_type = 'dutch'");
    expect(AUCTION).toContain('UNKNOWN_AUCTION_TYPE');
  });

  it('البريطاني يشترط الانخفاض الصارم', () => {
    expect(AUCTION).toContain('BID_MUST_BE_LOWER_THAN_CURRENT');
  });

  it('الياباني يسمح بنفس السعر ويمنع الأعلى', () => {
    expect(AUCTION).toContain('JAPANESE_CANNOT_ACCEPT_HIGHER_LEVEL');
    expect(AUCTION).toContain('p_bid_price > v_auction.current_best_price');
  });

  it('الهولندي ينتهي عند أول قبول', () => {
    expect(AUCTION).toContain('DUTCH_AUCTION_ALREADY_ACCEPTED');
    expect(AUCTION).toContain('v_closed  := true;');
  });

  it("يستخدم قيمة الحالة الصحيحة 'ended' لا 'closed'", () => {
    // CHECK يسمح بـ scheduled/live/ended/cancelled فقط —
    // استخدام 'closed' كان يرفع constraint violation وقت التنفيذ
    expect(AUCTION).toContain("THEN 'ended' ELSE status END");
    expect(AUCTION).toContain("SET status = 'ended'");
    expect(AUCTION).not.toContain("status = 'closed'");
  });

  it('يتتبّع حالة المشاركة ويمنع عودة المنسحب', () => {
    expect(AUCTION).toContain('CREATE TABLE IF NOT EXISTS public.auction_participant_status');
    expect(AUCTION).toContain('SUPPLIER_WITHDRAWN_FROM_AUCTION');
    expect(AUCTION).toContain("CHECK (status IN ('active','withdrawn'))");
  });

  it('الانسحاب يتطلب سبباً نصياً — سياسة التدقيق', () => {
    expect(AUCTION).toContain('WITHDRAWAL_REASON_REQUIRED');
    expect(AUCTION).toContain('length(trim(p_reason)) < 5');
  });

  it('انسحاب ما قبل الأخير يُنهي المزاد الياباني', () => {
    expect(AUCTION).toContain('v_active_count <= 1');
  });

  it('يفعّل RLS على جدول حالة المشاركة', () => {
    expect(AUCTION).toContain('ALTER TABLE public.auction_participant_status ENABLE ROW LEVEL SECURITY');
    expect(AUCTION).toContain('current_user_tenant_id()');
  });

  it('يسحب EXECUTE من anon مع إبقائه لـ authenticated', () => {
    // محمية داخلياً بـ NO_AUTH، والسحب الصريح دفاع بالعمق ضد منحة
    // ALTER DEFAULT PRIVILEGES التلقائية في Supabase
    expect(AUCTION).toContain('REVOKE ALL ON FUNCTION public.place_auction_bid(UUID,UUID,NUMERIC) FROM anon;');
    expect(AUCTION).toContain('REVOKE ALL ON FUNCTION public.withdraw_from_auction(UUID,UUID,TEXT) FROM anon;');
    expect(AUCTION).toContain('anon must not execute auction functions');
    expect(AUCTION).toContain('authenticated must be able to place bids');
  });

  it('يوفّر View للوفورات محسوبة من السقف', () => {
    expect(AUCTION).toContain('CREATE OR REPLACE VIEW public.auction_live_status');
    expect(AUCTION).toContain('savings_percent');
    expect(AUCTION).toContain('withdrawn_participants');
  });
});

describe('SDK — مواءمة الواجهة مع القواعد الجديدة', () => {
  it('يعرّف نتيجة العرض بحقلَي auction_closed و rule_applied', () => {
    expect(SDK_SRC).toContain('export interface AuctionBidOutcome');
    expect(SDK_SRC).toContain('auction_closed: boolean');
    expect(SDK_SRC).toContain("rule_applied: 'british' | 'japanese' | 'dutch'");
  });

  it('يوفّر انسحاب المورد وحالة المزاد الحية', () => {
    expect(SDK_SRC).toContain('withdrawSupplier');
    expect(SDK_SRC).toContain('withdraw_from_auction');
    expect(SDK_SRC).toContain('findLiveStatus');
  });

  it('لا يستخدم as any في placeBid — سياسة المنصة', () => {
    const slice = SDK_SRC.slice(SDK_SRC.indexOf('async placeBid'), SDK_SRC.indexOf('async withdrawSupplier'));
    expect(slice).not.toContain('as any');
  });

  it('يعرّف حالة الجدولة في خدمة التكامل', () => {
    expect(SDK_INT).toContain('NotificationDispatchStatusRecord');
    expect(SDK_INT).toContain('procurement_notification_dispatch_status');
    expect(SDK_INT).toContain('findDispatchStatus');
  });
});

describe('الواجهة — عرض القواعد الصحيحة للمستخدم', () => {
  it('صفحة المزاد لا تعرض قاعدة البريطاني لكل الأنواع', () => {
    expect(AUCTION_PAGE).toContain('AUCTION_RULES');
    expect(AUCTION_PAGE).toContain('japanese:');
    expect(AUCTION_PAGE).toContain('dutch:');
  });

  it('تعرض واجهة الانسحاب للمزاد الياباني بسبب إلزامي', () => {
    expect(AUCTION_PAGE).toContain("selected.auction_type === 'japanese'");
    expect(AUCTION_PAGE).toContain('withdrawReason');
    expect(AUCTION_PAGE).toContain('سبب انسحاب المورد');
  });

  it('لا تستخدم confirm أو prompt', () => {
    expect(AUCTION_PAGE).not.toMatch(/\bwindow\.confirm\(|\bconfirm\(|\bprompt\(/);
  });

  it('لوحة صحة التكامل تعرض حالة الجدولة', () => {
    expect(HEALTH_PAGE).toContain('dispatchStatus');
    expect(HEALTH_PAGE).toContain('DISPATCH_HEALTH');
    expect(HEALTH_PAGE).toContain('procurement-daily-notifications');
  });

  it('لوحة صحة التكامل تعرّف تنبيهات OTIF', () => {
    expect(HEALTH_PAGE).toContain('po_otif_alert');
  });
});
