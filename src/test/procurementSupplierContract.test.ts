/**
 * عقد الوحدة 02 لبوابة المشتريات — الموردون والتأهيل
 *
 * يغطي إصلاحَي 0258 و0259 (دوال معلَّنة STABLE بينما تكتب)،
 * وهي فصيلة أعطال لا يكشفها أي فحص ثابت.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const FIX_KRALJIC = read('supabase/migrations/0258_fix_calculate_kraljic_volatility.sql');
const FIX_STABLE = read('supabase/migrations/0259_fix_stable_functions_that_write.sql');
const SUPPLIER_FULL = read('supabase/migrations/0183_procurement_supplier_full.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const DETAIL = read('src/pages/app/procurement/suppliers/SupplierDetailPage.tsx');
const LIST = read('src/pages/app/procurement/suppliers/SuppliersPage.tsx');
const LAYOUT = read('src/pages/app/procurement/suppliers/SuppliersLayout.tsx');

describe('المشتريات 02 — إصلاح تقلّبية الدوال (0258/0259)', () => {
  it('calculate_kraljic صارت VOLATILE', () => {
    expect(FIX_KRALJIC).toContain('CREATE OR REPLACE FUNCTION public.calculate_kraljic');
    expect(FIX_KRALJIC).toContain('VOLATILE');
    const body = FIX_KRALJIC.slice(FIX_KRALJIC.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(body).not.toMatch(/\nSTABLE\n/);
  });

  it('calculate_kraljic تحافظ على نوع الإرجاع TEXT', () => {
    expect(FIX_KRALJIC).toContain('RETURNS TEXT');
  });

  it('calculate_kraljic تتحقق من وجود المورد', () => {
    expect(FIX_KRALJIC).toContain('SUPPLIER_NOT_FOUND');
  });

  it('0259 يصلح calculate_supplier_otif و forecast_spend', () => {
    expect(FIX_STABLE).toContain('CREATE OR REPLACE FUNCTION public.calculate_supplier_otif');
    expect(FIX_STABLE).toContain('CREATE OR REPLACE FUNCTION public.forecast_spend');
    const occurrences = FIX_STABLE.match(/^VOLATILE/gm) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('0259 يتحقق آلياً من عدم بقاء دالة STABLE تكتب', () => {
    expect(FIX_STABLE).toContain("provolatile IN ('s','i')");
    expect(FIX_STABLE).toContain('insert into|update |delete from');
    expect(FIX_STABLE).toContain('RAISE EXCEPTION');
  });

  it('forecast_spend لا تثق بالـ tenant الممرَّر', () => {
    const block = FIX_STABLE.slice(FIX_STABLE.indexOf('forecast_spend'));
    expect(block).toContain('current_user_tenant_id()');
    expect(block).toContain('NO_TENANT');
  });
});

describe('المشتريات 02 — قاعدة البيانات', () => {
  it('جداول دورة تأهيل المورد موجودة', () => {
    for (const t of [
      'supplier_documents', 'supplier_contacts', 'supplier_risk_assessments',
      'supplier_site_visits', 'supplier_portal_invites',
    ]) {
      expect(SUPPLIER_FULL).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
    // سجل تدقيق المورد أُضيف لاحقاً في 0193
    const onboarding = read('supabase/migrations/0193_procurement_supplier_onboarding_completion.sql');
    expect(onboarding).toContain('CREATE TABLE IF NOT EXISTS public.supplier_audit_log');
  });

  it('درجات المخاطر مقيّدة 0..20 والإجمالي محسوب', () => {
    expect(SUPPLIER_FULL).toContain('financial_score INT CHECK (financial_score BETWEEN 0 AND 20)');
    expect(SUPPLIER_FULL).toContain('total_score INT GENERATED ALWAYS AS');
    expect(SUPPLIER_FULL).toContain('risk_level TEXT GENERATED ALWAYS AS');
  });

  it('تنبيهات انتهاء الوثائق تقتصر على الموثّقة', () => {
    expect(SUPPLIER_FULL).toContain("sd.verification_status='verified'");
  });
});

describe('المشتريات 02 — الواجهات', () => {
  it('صفحات الموردين خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [['detail', DETAIL], ['list', LIST]] as const) {
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
    }
  });

  it('نماذج الوثائق والزيارات مقيّدة بالأنواع لا string حرة', () => {
    expect(DETAIL).toContain("SupplierDocumentRecord['doc_type']");
    expect(DETAIL).toContain("SupplierSiteVisitRecord['recommendation']");
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="suppliers"');
  });

  it('وحدة الموردين معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('suppliers: { title:');
    expect(NAV).toContain('/app/procurement/suppliers');
  });
});

describe('المشتريات — سلامة عامة للمايجريشنات', () => {
  it('لا مايجريشن مشتريات جديد يعلن STABLE مع كتابة', () => {
    const dir = join(ROOT, 'supabase/migrations');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter(f => /^02(5[6-9])/.test(f))) {
      const sql = readFileSync(join(dir, f), 'utf8');
      // نتجاهل 0259 لأنه يحوي نص الفحص نفسه
      if (f.startsWith('0259')) continue;
      const blocks = sql.split('CREATE OR REPLACE FUNCTION').slice(1);
      for (const b of blocks) {
        // نستبعد أسطر التعليقات لأن التوثيق يذكر STABLE عمداً لشرح البُغ
        const head = b
          .slice(0, b.indexOf('AS $$'))
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n');
        const body = b.slice(b.indexOf('AS $$'));
        if (/^\s*STABLE\s*$/m.test(head) && /\b(INSERT INTO|UPDATE |DELETE FROM)\b/i.test(body)) {
          offenders.push(f);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
