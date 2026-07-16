/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Subscriptions Page
 *  إدارة الاشتراكات والخطط والمدفوعات
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  CreditCard, RefreshCw, Search, Receipt, Plus, X, Save,
  Calendar, DollarSign, TrendingUp, Building2,
  SlidersHorizontal, ShieldCheck,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState, StatCard } from '../components/shared';
import { companiesApi, subscriptionsApi } from '../services/api';
import type { Company, Subscription } from '../types';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { MODULE_CATALOG, modulesForPlan, planLimitsForPlan, tenantModuleService } from '../../../services/sdk/TenantModuleService';

const PLAN_PRICE: Record<string, number> = {
  basic: 250,
  professional: 750,
  enterprise: 2000,
  custom: 5000,
};

const PLAN_LABEL: Record<string, string> = {
  basic: 'أساسي',
  professional: 'احترافي',
  enterprise: 'مؤسسي',
  custom: 'مخصص',
};
const BILLING_CYCLE_LABEL: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi_annual: 'نصف سنوي', annual: 'سنوي', one_time: 'دفعة واحدة', custom: 'مخصص' };
const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: 'نقدي', bank_transfer: 'تحويل مصرفي', card: 'بطاقة', zain_cash: 'زين كاش', asia_hawala: 'آسيا حوالة', stripe: 'Stripe', manual_invoice: 'فاتورة يدوية', other: 'أخرى' };
const PAYMENT_STATUS_LABEL: Record<string, string> = { unpaid: 'غير مدفوع', pending: 'قيد المعالجة', paid: 'مدفوع', overdue: 'متأخر', failed: 'فشل الدفع', refunded: 'مسترجع', cancelled: 'ملغي' };

function companyBilling(company: Company | null | undefined): Record<string, unknown> {
  return ((company?.settings as Record<string, unknown> | undefined)?.billing as Record<string, unknown> | undefined) || {};
}
function money(value: unknown, currency: unknown = 'IQD') {
  return `${Number(value ?? 0).toLocaleString('en-US')} ${String(currency || 'IQD')}`;
}

const SubscriptionFormModal: FC<{
  open: boolean;
  company: Company | null;
  saving: boolean;
  onClose: () => void;
  onSave: (data: Partial<Subscription>) => Promise<void>;
}> = ({ open, company, saving, onClose, onSave }) => {
  const billing = companyBilling(company);
  const [form, setForm] = useState({
    plan: 'basic', status: 'active', billing_cycle: 'monthly', payment_status: 'unpaid',
    start_date: new Date().toISOString().split('T')[0], end_date: '', payment_due_date: new Date().toISOString().split('T')[0],
    amount: 250, currency: 'IQD', discount_amount: 0, tax_amount: 0,
    payment_method: 'manual_invoice', payment_reference: '', invoice_number: '', contract_number: '', sales_owner: '', gateway_provider: '',
    auto_renew: true, grace_period_days: 7, max_employees: 50, max_branches: 1, max_biometric_devices: 1, storage_gb: 5, notes: '',
  });

  useEffect(() => {
    if (!open || !company) return;
    const plan = company.subscription_plan || 'basic';
    setForm((f) => ({ ...f,
      plan,
      status: company.subscription_status === 'trial' ? 'trial' : 'active',
      start_date: company.subscription_start_date || new Date().toISOString().split('T')[0],
      end_date: company.subscription_end_date || '',
      amount: Number(billing.billing_amount ?? PLAN_PRICE[plan] ?? 250),
      currency: String(billing.currency || 'IQD'),
      billing_cycle: String(billing.billing_cycle || 'monthly'),
      payment_method: String(billing.payment_method || 'manual_invoice'),
      payment_status: String(billing.payment_status || 'unpaid'),
      payment_due_date: String(billing.payment_due_date || new Date().toISOString().split('T')[0]),
      invoice_number: String(billing.invoice_number || ''),
      contract_number: String(billing.contract_number || ''),
      sales_owner: String(billing.sales_owner || ''),
      auto_renew: Boolean(billing.auto_renew ?? true),
      max_employees: company.max_employees || 50,
      max_branches: Number(billing.max_branches ?? 1),
      max_biometric_devices: Number(billing.max_biometric_devices ?? 1),
      storage_gb: Number(billing.storage_gb ?? 5),
    }));
  }, [open, company]);

  if (!open || !company) return null;
  const update = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));
  const total = Math.max(0, Number(form.amount || 0) - Number(form.discount_amount || 0) + Number(form.tax_amount || 0));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({ ...form, base_amount: form.amount, total_amount: total, features: company.enabled_modules || [], metadata: { source: 'developer_portal_subscriptions' } });
  };

  return (
    <div className="fixed inset-0 z-[220] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div><h3 className="text-lg font-black text-gray-900">إضافة / تجديد اشتراك</h3><p className="text-xs text-gray-500">{company.name_ar}</p></div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 overflow-y-auto flex-1 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="الخطة"><select value={form.plan} onChange={(e) => { const plan=e.target.value; setForm(f => ({ ...f, plan, amount: plan === 'custom' ? f.amount : PLAN_PRICE[plan] ?? f.amount })); }} className="input"><option value="basic">أساسي</option><option value="professional">احترافي</option><option value="enterprise">مؤسسي</option><option value="custom">مخصص</option></select></Field>
            <Field label="حالة الاشتراك"><select value={form.status} onChange={(e) => update('status', e.target.value)} className="input"><option value="trial">تجريبي</option><option value="active">نشط</option><option value="grace_period">فترة سماح</option><option value="expired">منتهي</option><option value="cancelled">ملغي</option></select></Field>
            <Field label="دورة الفوترة"><select value={form.billing_cycle} onChange={(e) => update('billing_cycle', e.target.value)} className="input"><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="semi_annual">نصف سنوي</option><option value="annual">سنوي</option><option value="one_time">دفعة واحدة</option><option value="custom">مخصص</option></select></Field>
            <Field label="حالة الدفع"><select value={form.payment_status} onChange={(e) => update('payment_status', e.target.value)} className="input"><option value="unpaid">غير مدفوع</option><option value="pending">قيد المعالجة</option><option value="paid">مدفوع</option><option value="overdue">متأخر</option><option value="failed">فشل</option><option value="refunded">مسترجع</option><option value="cancelled">ملغي</option></select></Field>
            <Field label="بداية الاشتراك"><input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} className="input" /></Field>
            <Field label="نهاية الاشتراك"><input type="date" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} className="input" /></Field>
            <Field label="تاريخ الاستحقاق"><input type="date" value={form.payment_due_date} onChange={(e) => update('payment_due_date', e.target.value)} className="input" /></Field>
            <Field label="طريقة الدفع"><select value={form.payment_method} onChange={(e) => update('payment_method', e.target.value)} className="input"><option value="cash">نقدي</option><option value="bank_transfer">تحويل مصرفي</option><option value="card">بطاقة</option><option value="zain_cash">زين كاش</option><option value="asia_hawala">آسيا حوالة</option><option value="stripe">Stripe</option><option value="manual_invoice">فاتورة يدوية</option><option value="other">أخرى</option></select></Field>
            <Field label="المبلغ"><input type="number" min={0} value={form.amount} onChange={(e) => update('amount', Number(e.target.value) || 0)} className="input" /></Field>
            <Field label="خصم"><input type="number" min={0} value={form.discount_amount} onChange={(e) => update('discount_amount', Number(e.target.value) || 0)} className="input" /></Field>
            <Field label="ضريبة"><input type="number" min={0} value={form.tax_amount} onChange={(e) => update('tax_amount', Number(e.target.value) || 0)} className="input" /></Field>
            <Field label="العملة"><select value={form.currency} onChange={(e) => update('currency', e.target.value)} className="input"><option value="IQD">IQD</option><option value="USD">USD</option><option value="SAR">SAR</option><option value="AED">AED</option></select></Field>
            <Field label="رقم الفاتورة"><input value={form.invoice_number} onChange={(e) => update('invoice_number', e.target.value)} className="input ltr" /></Field>
            <Field label="رقم العقد"><input value={form.contract_number} onChange={(e) => update('contract_number', e.target.value)} className="input ltr" /></Field>
            <Field label="مسؤول المبيعات"><input value={form.sales_owner} onChange={(e) => update('sales_owner', e.target.value)} className="input" /></Field>
            <Field label="مرجع الدفع"><input value={form.payment_reference} onChange={(e) => update('payment_reference', e.target.value)} className="input ltr" /></Field>
            <Field label="الموظفون"><input type="number" min={1} value={form.max_employees} onChange={(e) => update('max_employees', Number(e.target.value) || 1)} className="input" /></Field>
            <Field label="الفروع"><input type="number" min={1} value={form.max_branches} onChange={(e) => update('max_branches', Number(e.target.value) || 1)} className="input" /></Field>
            <Field label="أجهزة البصمة"><input type="number" min={0} value={form.max_biometric_devices} onChange={(e) => update('max_biometric_devices', Number(e.target.value) || 0)} className="input" /></Field>
            <Field label="التخزين GB"><input type="number" min={1} value={form.storage_gb} onChange={(e) => update('storage_gb', Number(e.target.value) || 1)} className="input" /></Field>
          </div>
          <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm font-bold text-emerald-900">الإجمالي بعد الخصم والضريبة: {money(total, form.currency)}</div>
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm" placeholder="ملاحظات تجارية أو شروط خاصة..." />
        </form>
        <div className="flex gap-3 p-5 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold">إلغاء</button>
          <button onClick={submit} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold flex items-center justify-center gap-2"><Save size={16} />{saving ? 'جاري الحفظ...' : 'حفظ الاشتراك'}</button>
        </div>
      </div>
      <style>{`.input{width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:.75rem;padding:.625rem .75rem;font-size:.875rem;outline:none}.input:focus{border-color:#06b6d4;box-shadow:0 0 0 2px rgba(6,182,212,.1)}.ltr{direction:ltr;text-align:left}`}</style>
    </div>
  );
};

const Field: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <div><label className="text-xs font-bold text-gray-500 mb-1 block">{label}</label>{children}</div>;


export default function SubscriptionsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subs, setSubs]             = useState<Subscription[]>([]);
  const [moduleCounts, setModuleCounts] = useState<Record<string, { enabled: number; allowed: number }>>({});
  const [syncing, setSyncing] = useState(false);
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [savingSub, setSavingSub] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await companiesApi.getAll();
      const visibleCompanies = data.filter(c => c.status === 'active' || c.status === 'trial');
      setCompanies(visibleCompanies);

      const counts: Record<string, { enabled: number; allowed: number }> = {};
      await Promise.all(visibleCompanies.map(async (company) => {
        const allowed = modulesForPlan(company.subscription_plan).length;
        try {
          const modules = await tenantModuleService.getTenantModules(company.id);
          counts[company.id] = {
            enabled: modules.filter(m => m.is_enabled).length || (company.enabled_modules?.length || 0),
            allowed,
          };
        } catch {
          counts[company.id] = { enabled: company.enabled_modules?.length || 0, allowed };
        }
      }));
      setModuleCounts(counts);
    } catch (err: any) {
      addToast('فشل تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // Fetch subscriptions for selected company
  useEffect(() => {
    if (!selectedId) { setSubs([]); return; }
    subscriptionsApi.getByCompany(selectedId)
      .then(setSubs)
      .catch(() => addToast('فشل تحميل الاشتراكات', 'error'));
  }, [selectedId, addToast]);

  const filtered = search.trim()
    ? companies.filter(c => c.name_ar?.toLowerCase().includes(search.toLowerCase()) || c.slug?.toLowerCase().includes(search.toLowerCase()))
    : companies;

  // Stats
  const totalMRR = companies
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + Number(companyBilling(c).billing_amount ?? PLAN_PRICE[c.subscription_plan] ?? PLAN_PRICE.basic), 0);

  const expiringSoon = companies.filter(c => {
    if (!c.subscription_end_date) return false;
    const end = new Date(c.subscription_end_date);
    const now = new Date();
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (86400000));
    return daysLeft <= 30 && daysLeft > 0;
  }).length;

  const selectedCompany = companies.find(c => c.id === selectedId) || null;
  const allowedModules = selectedCompany ? modulesForPlan(selectedCompany.subscription_plan) : [];
  const selectedModuleCount = selectedCompany ? moduleCounts[selectedCompany.id] : null;

  const syncSelectedCompanyModules = async () => {
    if (!selectedCompany) return;
    setSyncing(true);
    try {
      const rows = await tenantModuleService.syncWithPlan(selectedCompany.id, selectedCompany.subscription_plan, user?.id);
      setModuleCounts(prev => ({
        ...prev,
        [selectedCompany.id]: {
          enabled: rows.filter(r => r.is_enabled).length,
          allowed: modulesForPlan(selectedCompany.subscription_plan).length,
        },
      }));
      addToast('تمت مزامنة بوابات الشركة مع خطة الاشتراك', 'success');
    } catch (err: any) {
      addToast(err?.message || 'تعذر مزامنة البوابات', 'error');
    } finally {
      setSyncing(false);
    }
  };


  const saveSubscription = async (data: Partial<Subscription>) => {
    if (!selectedCompany) return;
    setSavingSub(true);
    try {
      const created = await subscriptionsApi.create(selectedCompany.id, data, user?.id);
      setSubs((prev) => [created, ...prev]);
      await fetchCompanies();
      addToast('تم حفظ الاشتراك وتحديث بيانات الشركة', 'success');
      setSubModalOpen(false);
    } catch (err: any) {
      addToast(err?.message || 'فشل حفظ الاشتراك', 'error');
    } finally {
      setSavingSub(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="إدارة الاشتراكات"
        description="خطط الأسعار والمدفوعات وتواريخ التجديد"
      />
      <div className="flex justify-end">
        <button onClick={() => selectedCompany ? setSubModalOpen(true) : addToast('اختر شركة أولاً', 'warning')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold shadow-lg shadow-cyan-500/20">
          <Plus size={16} /> إضافة اشتراك / دفعة
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="الإيراد الشهري التقديري"
          value={`$${totalMRR.toLocaleString()}`}
          icon={DollarSign}
          gradient="from-emerald-500 to-teal-600"
          trend="up"
          trendValue="MRR"
        />
        <StatCard
          label="الشركات النشطة"
          value={companies.filter(c => c.status === 'active').length}
          icon={TrendingUp}
          gradient="from-cyan-500 to-blue-600"
        />
        <StatCard
          label="تنتهي قريباً"
          value={expiringSoon}
          icon={Calendar}
          gradient="from-amber-500 to-orange-600"
          trend={expiringSoon > 0 ? 'down' : undefined}
          trendValue={expiringSoon > 0 ? 'انتباه' : undefined}
        />
        <StatCard
          label="تحت التجربة"
          value={companies.filter(c => c.status === 'trial').length}
          icon={CreditCard}
          gradient="from-violet-500 to-purple-600"
        />
        <StatCard
          label="بوابات مفعلة"
          value={Object.values(moduleCounts).reduce((sum, c) => sum + c.enabled, 0)}
          icon={SlidersHorizontal}
          gradient="from-slate-700 to-slate-900"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن شركة..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all shadow-sm"
        />
      </div>

      {/* Companies List + Sub Details */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Company List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">الشركات</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="animate-spin text-gray-400" size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد شركات" />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-right p-4 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    selectedId === c.id ? 'bg-cyan-50 border-r-2 border-r-cyan-500' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name_ar}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        الخطة: {PLAN_LABEL[c.subscription_plan] ?? c.subscription_plan} · البوابات: {moduleCounts[c.id]?.enabled ?? (c.enabled_modules?.length || 0)}/{moduleCounts[c.id]?.allowed ?? modulesForPlan(c.subscription_plan).length}
                      </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={c.status === 'active' ? 'active' : 'trial'}>
                      {c.status === 'active' ? 'نشط' : 'تجريبي'}
                    </Badge>
                    <span className="text-xs font-bold text-gray-600 tabular-nums">{money(companyBilling(c).billing_amount ?? PLAN_PRICE[c.subscription_plan], companyBilling(c).currency || 'IQD')}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Subscription Details */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">
              {selectedId ? 'تفاصيل الاشتراك' : 'اختر شركة لعرض التفاصيل'}
            </h3>
          </div>
          {!selectedId ? (
            <div className="flex items-center justify-center py-16">
              <Receipt size={48} className="text-gray-200" />
            </div>
          ) : subs.length === 0 ? (
            <div className="p-6">
              {(() => {
                const company = companies.find(c => c.id === selectedId);
                if (!company) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        {company.name_ar.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{company.name_ar}</p>
                        <p className="text-xs text-gray-500">{company.slug}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">الخطة الحالية</p>
                        <p className="text-sm font-bold text-gray-900">{PLAN_LABEL[company.subscription_plan]}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">السعر</p>
                        <p className="text-sm font-bold text-gray-900">{money(companyBilling(company).billing_amount ?? PLAN_PRICE[company.subscription_plan], companyBilling(company).currency || 'IQD')}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">تاريخ البداية</p>
                        <p className="text-sm text-gray-900">{company.subscription_start_date || '—'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">تاريخ الانتهاء</p>
                        <p className="text-sm text-gray-900">{company.subscription_end_date || '—'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">طريقة الدفع</p>
                        <p className="text-sm text-gray-900">{PAYMENT_METHOD_LABEL[String(companyBilling(company).payment_method || 'manual_invoice')]}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">حالة الدفع</p>
                        <p className="text-sm text-gray-900">{PAYMENT_STATUS_LABEL[String(companyBilling(company).payment_status || 'unpaid')]}</p>
                      </div>
                      <div className="bg-cyan-50 rounded-xl p-3 border border-cyan-100">
                        <p className="text-[10px] font-bold text-cyan-600 uppercase">البوابات المفعلة</p>
                        <p className="text-sm font-bold text-cyan-900">{moduleCounts[company.id]?.enabled ?? (company.enabled_modules?.length || 0)} / {moduleCounts[company.id]?.allowed ?? modulesForPlan(company.subscription_plan).length}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase">البوابات المسموحة</p>
                        <p className="text-sm font-bold text-emerald-900">{modulesForPlan(company.subscription_plan).length}</p>
                      </div>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-bold text-gray-600 flex items-center gap-1"><ShieldCheck size={13} /> البوابات حسب الخطة</p>
                        <button
                          onClick={syncSelectedCompanyModules}
                          disabled={syncing}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-[11px] font-bold hover:bg-cyan-100 disabled:opacity-50"
                        >
                          <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> مزامنة
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {MODULE_CATALOG.filter(m => modulesForPlan(company.subscription_plan).includes(m.key)).map(m => (
                          <span key={m.key} className="text-[10px] px-2 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-100">{m.label}</span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-xl p-3">
                      <p className="text-xs font-bold text-gray-600 mb-2">حدود الخطة</p>
                      {(() => {
                        const limits = planLimitsForPlan(company.subscription_plan);
                        return (
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <span className="bg-slate-50 rounded-lg px-2 py-1 text-slate-600">الموظفون: {limits.maxEmployees === 999999 ? 'غير محدود' : limits.maxEmployees}</span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 text-slate-600">الفروع: {limits.maxBranches === 999999 ? 'غير محدود' : limits.maxBranches}</span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 text-slate-600">أجهزة البصمة: {limits.maxBiometricDevices === 999999 ? 'غير محدود' : limits.maxBiometricDevices}</span>
                            <span className="bg-slate-50 rounded-lg px-2 py-1 text-slate-600">التخزين: {limits.storageGb === 999999 ? 'غير محدود' : `${limits.storageGb}GB`}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {subs.map((s) => (
                <div key={s.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={s.plan}>{PLAN_LABEL[s.plan] ?? s.plan}</Badge>
                    <Badge variant={s.status}>{s.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-gray-500">من: {s.start_date}</span>
                    <span className="text-gray-500">إلى: {s.end_date || '—'}</span>
                    {s.amount !== undefined && <span className="text-gray-900 font-bold">{money(s.total_amount ?? s.amount, s.currency)}</span>}
                    <span className="text-gray-500">الدفع: {PAYMENT_METHOD_LABEL[String(s.payment_method || 'manual_invoice')] || s.payment_method}</span>
                    <span className="text-gray-500">حالة الدفع: {PAYMENT_STATUS_LABEL[String(s.payment_status || 'unpaid')] || s.payment_status}</span>
                    {s.invoice_number && <span className="text-gray-500">فاتورة: {s.invoice_number}</span>}
                    {s.contract_number && <span className="text-gray-500">عقد: {s.contract_number}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SubscriptionFormModal open={subModalOpen} company={selectedCompany} saving={savingSub} onClose={() => setSubModalOpen(false)} onSave={saveSubscription} />
    </div>
  );
}
