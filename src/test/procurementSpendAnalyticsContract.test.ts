/**
 * عقد الوحدة 07 لبوابة المشتريات — تحليل الإنفاق وذكاء المشتريات
 *
 * يغطي إصلاح 0264: مزامنة إجمالي أمر الشراء مع سطوره،
 * وهو بُغ كان يجعل كل أرقام تحليل الإنفاق أصفاراً.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SYNC = read('supabase/migrations/0264_procurement_po_total_sync_trigger.sql');
const ANALYTICS = read('supabase/migrations/0188_procurement_spend_analytics.sql');
const INTEL = read('supabase/migrations/0202_procurement_spend_intelligence_completion.sql');
const ORDERS = read('supabase/migrations/0185_procurement_orders_gr.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const SPEND = read('src/pages/app/procurement/analytics/SpendAnalyticsPage.tsx');
const CATEGORY = read('src/pages/app/procurement/analytics/CategoryPage.tsx');
const PRICE = read('src/pages/app/procurement/analytics/PriceTrendPage.tsx');
const FORECAST = read('src/pages/app/procurement/analytics/ForecastPage.tsx');
const LAYOUT = read('src/pages/app/procurement/analytics/AnalyticsLayout.tsx');

describe('المشتريات 07 — مزامنة إجمالي أمر الشراء (0264)', () => {
  it('يوثّق أن total_before_tax ليس عموداً محسوباً', () => {
    expect(ORDERS).toContain('total_before_tax NUMERIC(16,2) NOT NULL DEFAULT 0');
    expect(ORDERS).toContain('total_amount NUMERIC(16,2) GENERATED ALWAYS AS');
  });

  it('ينشئ محفّزاً يعيد حساب الإجمالي من السطور', () => {
    expect(SYNC).toContain('CREATE OR REPLACE FUNCTION public.tg_sync_po_total_from_lines');
    expect(SYNC).toContain('CREATE TRIGGER trg_sync_po_total');
    expect(SYNC).toContain('ON public.po_line_items');
  });

  it('المحفّز يغطي الإضافة والتعديل والحذف', () => {
    expect(SYNC).toContain('AFTER INSERT OR UPDATE OF quantity, unit_price, po_id OR DELETE');
  });

  it('يحسب الإجمالي من الكمية × السعر', () => {
    expect(SYNC).toContain('SUM(COALESCE(quantity, 0) * COALESCE(unit_price, 0))');
  });

  it('يزامن البيانات القائمة لمرة واحدة', () => {
    expect(SYNC).toContain('UPDATE public.purchase_orders po');
    expect(SYNC).toContain('SET total_before_tax = calc.total');
  });

  it('يصحّح معاملات الإنفاق الصفرية السابقة', () => {
    expect(SYNC).toContain('UPDATE public.spend_transactions st');
    expect(SYNC).toContain("st.source = 'po'");
    expect(SYNC).toContain('COALESCE(st.amount, 0) = 0');
  });

  it('يتحقق آلياً من عدم بقاء أمر غير متزامن', () => {
    expect(SYNC).toContain('purchase order(s) still out of sync');
  });
});

describe('المشتريات 07 — تحليل الموردين وباريتو', () => {
  it('View تحليل الإنفاق موجود بـ security_invoker', () => {
    expect(SYNC).toContain('CREATE OR REPLACE VIEW public.procurement_supplier_spend_analysis');
    expect(SYNC).toContain('security_invoker = true');
  });

  it('يحسب حصة المورد والنسبة التراكمية', () => {
    expect(SYNC).toContain('spend_share_percent');
    expect(SYNC).toContain('cumulative_percent');
  });

  it('تصنيف باريتو يعتمد النسبة قبل المورد الحالي', () => {
    // وإلا صُنِّف أكبر مورد C بدل A عندما يستحوذ وحده على أكثر من 80%
    expect(SYNC).toContain('SUM(t.total_spend) OVER w - t.total_spend');
    expect(SYNC).toContain("THEN 'A'");
    expect(SYNC).toContain("THEN 'B'");
  });

  it('يرصد الإنفاق خارج الضوابط', () => {
    expect(SYNC).toContain('maverick_count');
    expect(SYNC).toContain('maverick_spend');
  });
});

describe('المشتريات 07 — ذكاء المشتريات', () => {
  it('جداول تحليل الإنفاق موجودة', () => {
    for (const t of ['spend_transactions', 'spend_categories', 'supplier_spend_summary', 'procurement_price_history', 'spend_forecasts']) {
      expect(ANALYTICS, `${t} مفقود`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('دوال الذكاء موجودة', () => {
    const all = ANALYTICS + INTEL;
    for (const fn of [
      'collect_procurement_spend_transactions',
      'auto_classify_spend_transactions',
      'cleanse_supplier_aliases',
      'detect_maverick_spend',
      'generate_spend_intelligence_alerts',
      'forecast_spend',
    ]) {
      expect(all, `${fn} مفقود`).toContain(fn);
    }
  });

  it('باريتو 80/20 وتقرير التصدير موجودان', () => {
    const all = ANALYTICS + INTEL;
    expect(all).toContain('spend_pareto_80_20');
    expect(all).toContain('procurement_export_spend_report');
  });
});

describe('المشتريات 07 — الواجهات', () => {
  it('كل صفحات التحليلات خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [
      ['spend', SPEND], ['category', CATEGORY], ['price', PRICE], ['forecast', FORECAST],
    ] as const) {
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('أنواع صريحة بدل any', () => {
    expect(FORECAST).toContain('type SpendForecastRow');
    expect(PRICE).toContain('type PriceHistoryRow');
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="analytics"');
  });

  it('وحدة التحليلات معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('analytics: { title:');
    expect(NAV).toContain('/app/procurement/analytics/forecast');
  });
});
