import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

function readProcurementSdk(): string {
  const dir = join(root, 'src/services/sdk/Procurement');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

describe('Procurement P0 security contract', () => {
  it('0190 security hardening migration exists and guards sensitive RPCs', () => {
    const sql = read('supabase/migrations/0190_procurement_security_hardening.sql');
    expect(sql).toContain('procurement_require_roles');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_po_from_pr');
    expect(sql).toContain("PERFORM public.procurement_require_roles(ARRAY['procurement','admin']::TEXT[]);");
    expect(sql).toContain('WITH (security_invoker = true)');
    expect(sql).toContain('tenant_id = public.current_user_tenant_id()');
    expect(sql).toContain('spent_breakdown JSONB');
    expect(sql).toContain('b.spent_breakdown');
    expect(sql).toContain('pr.cost_center_id');
    expect(sql).toContain('AS cost_center_name');
    expect(sql).toContain('public.check_pr_budget(pr.cost_center_id, pr.total_estimated)');
    expect(sql).toContain('AS budget_ok');
    expect(sql).toContain("has_function_privilege('authenticated', p.oid, 'EXECUTE')");
    expect(sql).not.toContain('information_schema.routine_privileges');
  });

  it('0191 same-tenant assertion migration exists and protects FK UUID inputs', () => {
    const sql = read('supabase/migrations/0191_procurement_same_tenant_assertions.sql');
    expect(sql).toContain('procurement_assert_supplier_in_tenant');
    expect(sql).toContain('procurement_assert_po_in_tenant');
    expect(sql).toContain('procurement_assert_contract_in_tenant');
    expect(sql).toContain('PO_LINE_DOES_NOT_BELONG_TO_PO');
    expect(sql).toContain('INVOICE_LINE_PO_LINE_NOT_IN_INVOICE_PO');
  });

  it('0192 approval rules engine uses procurement_approval_rules', () => {
    const sql = read('supabase/migrations/0192_procurement_approval_rules_engine.sql');
    expect(sql).toContain('procurement_approval_rules');
    expect(sql).toContain('ORDER BY r.level ASC');
    expect(sql).toContain('direct_manager');
  });

  it('0193 supplier onboarding completion covers audit/forms/decision workflow', () => {
    const sql = read('supabase/migrations/0193_procurement_supplier_onboarding_completion.sql');
    expect(sql).toContain('supplier_audit_log');
    expect(sql).toContain('supplier_qualification_forms');
    expect(sql).toContain('decide_supplier_qualification');
    expect(sql).toContain('supplier_onboarding_kpis');
  });

  it('Supplier self-service portal route and Edge Functions exist with token hashing and storage upload', () => {
    const router = read('src/router/AppRouter.tsx');
    const portalFn = read('supabase/functions/procurement-supplier-portal/index.ts');
    const inviteFn = read('supabase/functions/procurement-supplier-invite/index.ts');
    expect(router).toContain('/supplier-portal/:token');
    expect(portalFn).toContain('sha256Hex');
    expect(portalFn).toContain('supplier_portal_invites');
    expect(portalFn).toContain('supplier_portal_submitted');
    expect(portalFn).toContain('supplier-documents');
    expect(inviteFn).toContain('hashToken(token)');
    expect(inviteFn).toContain("token: emailMode === 'simulated' ? token : undefined");
    expect(inviteFn).not.toContain('Token (للتطوير)');
    expect(portalFn).not.toContain('p_tenant_id');
  });

  it('0194 strategic sourcing completion covers invitations Q&A awards and supplier RFx portal', () => {
    const sql = read('supabase/migrations/0194_procurement_sourcing_completion.sql');
    const router = read('src/router/AppRouter.tsx');
    const rfxFn = read('supabase/functions/procurement-supplier-rfx/index.ts');
    expect(sql).toContain('rfx_supplier_invitations');
    expect(sql).toContain('rfx_questions');
    expect(sql).toContain('award_supplier_bid');
    expect(sql).toContain('sourcing_event_kpis');
    expect(router).toContain('/supplier-rfx/:token');
    expect(rfxFn).toContain('submit_bid');
    expect(rfxFn).toContain('ask_question');
    expect(rfxFn).not.toContain('p_tenant_id');
  });

  it('0195 strategic sourcing advanced completion covers templates MECCA auctions and price archive', () => {
    const sql = read('supabase/migrations/0195_procurement_sourcing_advanced_completion.sql');
    const page = read('src/pages/app/procurement/sourcing/RfxDetailPage.tsx');
    expect(sql).toContain('rfx_templates');
    expect(sql).toContain('rfx_evaluation_criteria');
    expect(sql).toContain('score_bid_mecca');
    expect(sql).toContain('start_procurement_auction_from_event');
    expect(sql).toContain('archive_awarded_bid_price');
    expect(page).toContain('RFx Builder');
    expect(page).toContain('MECCA');
    expect(page).toContain('بدء مزاد');
  });

  it('0196 PR completion covers audit comments revision reorder generation and KPIs', () => {
    const sql = read('supabase/migrations/0196_procurement_pr_completion.sql');
    const page = read('src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx');
    expect(sql).toContain('pr_audit_log');
    expect(sql).toContain('pr_comments');
    expect(sql).toContain('request_pr_revision');
    expect(sql).toContain('generate_reorder_point_prs');
    expect(sql).toContain('pr_kpis');
    expect(page).toContain('سجل التدقيق');
    expect(page).toContain('طلب تعديل');
  });

  it('0197 PR finalization covers private attachments and approval reminders', () => {
    const sql = read('supabase/migrations/0197_procurement_pr_notifications_budget.sql');
    const attachmentFn = read('supabase/functions/procurement-pr-attachment/index.ts');
    const reminderFn = read('supabase/functions/procurement-pr-approval-reminder/index.ts');
    const page = read('src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx');
    expect(sql).toContain('pr_approval_reminders');
    expect(sql).toContain('pr_overdue_approvals');
    expect(sql).toContain('budget_scope');
    expect(attachmentFn).toContain('pr-attachments');
    expect(attachmentFn).toContain('signed_url');
    expect(reminderFn).toContain('CRON_SECRET');
    expect(page).toContain('type="file"');
  });

  it('0198 PR final budget robustness and ROP UI support exist', () => {
    const sql = read('supabase/migrations/0198_procurement_pr_budget_and_reorder_ui_support.sql');
    const page = read('src/pages/app/procurement/requisitions/RequisitionListPage.tsx');
    expect(sql).toContain('check_pr_budget_extended');
    expect(sql).toContain('budget_scope');
    expect(sql).toContain('estimated_unit_price');
    expect(page).toContain('نقاط ROP');
    expect(page).toContain('budget_category_code');
  });

  it('0199 PO/GR completion covers manual PO IQC inventory RTV and OTIF', () => {
    const sql = read('supabase/migrations/0199_procurement_po_gr_completion.sql');
    const poPage = read('src/pages/app/procurement/orders/PurchaseOrdersPage.tsx');
    const grPage = read('src/pages/app/procurement/orders/GoodsReceiptPage.tsx');
    const detailPage = read('src/pages/app/procurement/orders/PoDetailPage.tsx');
    expect(sql).toContain('create_purchase_order_manual');
    expect(sql).toContain('iqc_inspections');
    expect(sql).toContain('inventory_transactions');
    expect(sql).toContain('po_otif_alerts');
    expect(poPage).toContain('إنشاء PO');
    expect(grPage).toContain('تسجيل استلام');
    expect(detailPage).toContain('RTV');
  });

  it('0200 invoice completion covers full invoice workflow, exceptions, payment and archive', () => {
    const sql = read('supabase/migrations/0200_procurement_invoices_completion.sql');
    const listPage = read('src/pages/app/procurement/invoices/InvoicesPage.tsx');
    const detailPage = read('src/pages/app/procurement/invoices/MatchingDetailPage.tsx');
    expect(sql).toContain('create_supplier_invoice_full');
    expect(sql).toContain('invoice_exception_actions');
    expect(sql).toContain('approve_invoice_for_payment');
    expect(sql).toContain('record_invoice_payment');
    expect(sql).toContain('invoice_dynamic_discount_options');
    const router = read('src/router/AppRouter.tsx');
    const supplierInvoiceFn = read('supabase/functions/procurement-supplier-invoice/index.ts');
    expect(sql).toContain('invoice_archive');
    expect(listPage).toContain('فاتورة جديدة');
    expect(detailPage).toContain('خيارات الخصم الديناميكي');
    expect(router).toContain('/supplier-invoice/:token');
    expect(supplierInvoiceFn).toContain('supplier_portal');
  });

  it('0201 CLM completion covers templates approvals signatures obligations renewal termination and analytics', () => {
    const sql = read('supabase/migrations/0201_procurement_contracts_clm_completion.sql');
    const contractsPage = read('src/pages/app/procurement/contracts/ContractsPage.tsx');
    const templatesPage = read('src/pages/app/procurement/contracts/TemplatesPage.tsx');
    expect(sql).toContain('contract_audit_log');
    expect(sql).toContain('contract_approval_steps');
    expect(sql).toContain('contract_signature_requests');
    expect(sql).toContain('seed_default_contract_templates_clauses');
    expect(sql).toContain('create_procurement_contract_full');
    expect(sql).toContain('contract_clm_analytics');
    expect(contractsPage).toContain('عقد جديد');
    expect(templatesPage).toContain('قوالب افتراضية');
  });

  it('0202 spend intelligence completion covers collector cleansing classification KPIs alerts and export', () => {
    const sql = read('supabase/migrations/0202_procurement_spend_intelligence_completion.sql');
    const page = read('src/pages/app/procurement/analytics/SpendAnalyticsPage.tsx');
    expect(sql).toContain('collect_procurement_spend_transactions');
    expect(sql).toContain('cleanse_supplier_aliases');
    expect(sql).toContain('auto_classify_spend_transactions');
    expect(sql).toContain('procurement_executive_kpis');
    expect(sql).toContain('procurement_export_spend_report');
    expect(page).toContain('تحديث بيانات الإنفاق');
    expect(page).not.toContain('12.4M ريال');
  });

  it('Admin user wizard auto-assigns default pages when role changes', () => {
    const adminPage = read('src/pages/admin/AdminEmployeesPage.tsx');
    expect(adminPage).toContain('getDefaultPagesForRole');
    expect(adminPage).toContain('ROLE_MODULE_MAP');
    expect(adminPage).toContain('setPageSelectionTouched(false)');
    expect(adminPage).toContain('procurement-dashboard');
    expect(adminPage).toContain('allowed_pages: getDefaultPagesForRole');
  });

  it('Procurement SDK must not pass tenant_id into hardened RPCs', () => {
    const sdk = readProcurementSdk();
    expect(sdk).not.toContain('p_tenant_id');
    expect(sdk).not.toContain("from('tenants').select('id').limit(1)");
  });
});
