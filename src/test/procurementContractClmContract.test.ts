/**
 * عقد الوحدة 06 لبوابة المشتريات — إدارة دورة حياة العقود (CLM)
 *
 * يغطي تحصين 0263: سبب الإنهاء الإلزامي، منع إعادة الإنهاء،
 * وتنبيهات التجديد بثلاث عتبات (90/30/7).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const GUARDS = read('supabase/migrations/0263_procurement_contract_lifecycle_guards.sql');
const CLM = read('supabase/migrations/0187_procurement_contracts_clm.sql');
const COMPLETION = read('supabase/migrations/0201_procurement_contracts_clm_completion.sql');
const NAV = read('src/pages/app/procurement/shared/ProcurementUnitNav.tsx');
const CONTRACTS = read('src/pages/app/procurement/contracts/ContractsPage.tsx');
const OBLIGATIONS = read('src/pages/app/procurement/contracts/ObligationsPage.tsx');
const SIGNATURES = read('src/pages/app/procurement/contracts/SignaturesPage.tsx');
const TEMPLATES = read('src/pages/app/procurement/contracts/TemplatesPage.tsx');
const VERSIONS = read('src/pages/app/procurement/contracts/VersionsPage.tsx');
const LAYOUT = read('src/pages/app/procurement/contracts/ContractsLayout.tsx');

describe('المشتريات 06 — تحصين دورة حياة العقد (0263)', () => {
  it('سبب الإنهاء إلزامي', () => {
    expect(GUARDS).toContain('CONTRACT_TERMINATION_REASON_REQUIRED');
    expect(GUARDS).toContain("COALESCE(btrim(p_reason), '') = ''");
  });

  it('يمنع إنهاء عقد منتهٍ مسبقاً', () => {
    expect(GUARDS).toContain('CONTRACT_ALREADY_TERMINATED');
    expect(GUARDS).toContain("v_old.status = 'terminated'");
  });

  it('يحافظ على التوقيع الأصلي', () => {
    expect(GUARDS).toContain('CREATE OR REPLACE FUNCTION public.terminate_contract(');
    expect(GUARDS).toContain('p_contract_id UUID');
    expect(GUARDS).toContain('p_reason TEXT');
    expect(GUARDS).toContain('RETURNS VOID');
  });

  it('يسجّل الإنهاء في تدقيق العقود', () => {
    expect(GUARDS).toContain('log_contract_audit');
    expect(GUARDS).toContain('contract_terminated');
  });

  it('تنبيهات التجديد بثلاث عتبات كما يطلب التوثيق', () => {
    expect(GUARDS).toContain('CREATE OR REPLACE VIEW public.contract_renewal_alerts');
    expect(GUARDS).toContain("'critical'");
    expect(GUARDS).toContain("'urgent'");
    expect(GUARDS).toContain("'upcoming'");
    expect(GUARDS).toContain('CURRENT_DATE + 7');
    expect(GUARDS).toContain('CURRENT_DATE + 30');
    expect(GUARDS).toContain('CURRENT_DATE + 90');
  });

  it('View بـ security_invoker', () => {
    expect(GUARDS).toContain('security_invoker = true');
  });
});

describe('المشتريات 06 — بنية CLM', () => {
  it('جداول دورة حياة العقد موجودة', () => {
    const all = CLM + COMPLETION;
    for (const t of [
      'procurement_contracts', 'contract_templates', 'contract_clauses',
      'contract_versions', 'contract_obligations', 'contract_signatures',
      'contract_approval_steps', 'contract_audit_log',
    ]) {
      expect(all, `${t} مفقود`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it('أنواع العقود مقيّدة', () => {
    expect(COMPLETION).toContain("p_type NOT IN ('MSA','SLA','SOW','PO_TC','NDA','IP','other')");
  });

  it('النسخة الموقّعة v1.0 غير قابلة للتعديل', () => {
    const all = CLM + COMPLETION + read('supabase/migrations/0191_procurement_same_tenant_assertions.sql');
    expect(all).toContain('SIGNED_VERSION_IMMUTABLE');
  });

  it('قرارات التجديد مقيّدة', () => {
    expect(COMPLETION).toContain('INVALID_RENEWAL_DECISION');
  });

  it('بنود العقد تدعم العلم الأحمر', () => {
    const all = CLM + COMPLETION;
    expect(all).toContain('is_red_flag');
  });
});

describe('المشتريات 06 — الواجهات', () => {
  it('كل صفحات العقود خالية من الأنماط الممنوعة', () => {
    for (const [name, src] of [
      ['contracts', CONTRACTS], ['obligations', OBLIGATIONS], ['signatures', SIGNATURES],
      ['templates', TEMPLATES], ['versions', VERSIONS],
    ] as const) {
      expect(src, `${name} يحوي prompt`).not.toMatch(/\bprompt\(/);
      expect(src, `${name} يحوي confirm`).not.toMatch(/\bconfirm\(/);
      expect(src, `${name} يحوي as any`).not.toMatch(/as any/);
    }
  });

  it('الإنهاء عبر نافذة بسبب إلزامي', () => {
    expect(CONTRACTS).toContain('openTerminateDialog');
    expect(CONTRACTS).toContain('submitTerminate');
    expect(CONTRACTS).toContain('سبب الإنهاء مطلوب');
  });

  it('قرار التجديد قائمة منسدلة لا نص حر', () => {
    expect(CONTRACTS).toContain('type RenewalDecision');
    expect(CONTRACTS).toContain('openRenewalDialog');
    expect(CONTRACTS).toContain('ملاحظات قرار التجديد مطلوبة');
  });

  it('طلب التوقيع يتحقق من صحة البريد', () => {
    expect(CONTRACTS).toContain('openSignDialog');
    expect(CONTRACTS).toContain('بريد إلكتروني غير صالح');
  });

  it('رفض خطوة الموافقة يتطلب تعليقاً', () => {
    expect(CONTRACTS).toContain('openStepDialog');
    expect(CONTRACTS).toContain('تعليق الرفض مطلوب');
  });

  it('التخطيط يحوي شريط الوحدة', () => {
    expect(LAYOUT).toContain('ProcurementUnitNav');
    expect(LAYOUT).toContain('unit="contracts"');
  });

  it('وحدة العقود معرّفة في شريط التنقل', () => {
    expect(NAV).toContain('contracts: { title:');
    expect(NAV).toContain('/app/procurement/contracts/obligations');
  });
});
