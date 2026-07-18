/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Companies Page
 *  إدارة الشركات المشتركة: عرض، إضافة، تعديل، تعليق، حذف
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  Building2, Plus, Search, Edit3, Trash2, Eye,
  RefreshCw, Ban, Unlock, Mail, Phone, Globe,
  Calendar, Activity, X, Save, CheckCircle, CreditCard, Receipt,
  LayoutDashboard, Users, Shield, MessageSquare, Fingerprint, Cpu, SlidersHorizontal,
  ArrowRightLeft, Bot, FileBarChart, HeartPulse, Award, FileText,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState, ConfirmDialog } from '../components/shared';
import CompanyDetailDrawer from '../components/CompanyDetailDrawer';
import CompanyCreateWizard from '../components/CompanyCreateWizard';
import { companiesApi } from '../services/api';
import type { Company, DevPortalPage, IconType } from '../types';
import { useUIStore } from '../../../core/stores';
import { MODULE_CATALOG, modulesForPlan } from '../../../services/sdk/TenantModuleService';


const PLAN_PRICE: Record<string, number> = { basic: 250, professional: 750, enterprise: 2000, custom: 5000 };
const PLAN_LABEL: Record<string, string> = { basic: 'أساسي', professional: 'احترافي', enterprise: 'مؤسسي', custom: 'مخصص' };
const BILLING_CYCLE_LABEL: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', semi_annual: 'نصف سنوي', annual: 'سنوي', one_time: 'دفعة واحدة', custom: 'مخصص' };
const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: 'نقدي', bank_transfer: 'تحويل مصرفي', card: 'بطاقة', zain_cash: 'زين كاش', asia_hawala: 'آسيا حوالة', stripe: 'Stripe', manual_invoice: 'فاتورة يدوية', other: 'أخرى' };
const PAYMENT_STATUS_LABEL: Record<string, string> = { unpaid: 'غير مدفوع', pending: 'قيد المعالجة', paid: 'مدفوع', overdue: 'متأخر', failed: 'فشل الدفع', refunded: 'مسترجع', cancelled: 'ملغي' };

function getCompanyBilling(company: Partial<Company> | null | undefined): Record<string, unknown> {
  return ((company?.settings as Record<string, unknown> | undefined)?.billing as Record<string, unknown> | undefined) || {};
}

function formatMoney(value: unknown, currency: unknown = 'IQD') {
  const amount = Number(value ?? 0);
  return `${amount.toLocaleString('en-US')} ${String(currency || 'IQD')}`;
}


const MODULE_ICON_MAP: Record<string, IconType> = {
  employee: LayoutDashboard,
  hr: Users,
  admin: Shield,
  manager: Users,
  supervisor: CheckCircle,
  gatekeeper: Fingerprint,
  movement: ArrowRightLeft,
  tawathul: MessageSquare,
  tech_portal: Cpu,
  ai: Bot,
  reports: FileBarChart,
  health_safety: HeartPulse,
  succession: Award,
  contracts: FileText,
};

const MODULE_CATEGORY_LABEL: Record<string, string> = {
  core: 'أساسية',
  people: 'الأفراد',
  operations: 'تشغيلية',
  platform: 'منصة',
  advanced: 'متقدمة',
};

function buildModuleState(enabled?: string[]): Record<string, boolean> {
  const defaults = enabled ?? ['employee', 'hr'];
  return Object.fromEntries(MODULE_CATALOG.map((module) => [module.key, defaults.includes(module.key)]));
}

// ════════════════════════════════════════════════════════════════
//  Company Row
// ════════════════════════════════════════════════════════════════

const CompanyRow: FC<{
  company: Company;
  onView: (c: Company) => void;
  onEdit: (c: Company) => void;
  onToggleStatus: (c: Company) => void;
  onManageModules: (c: Company) => void;
}> = ({ company: c, onView, onEdit, onToggleStatus, onManageModules }) => {
  const isActive = c.status === 'active';
  const isTrial  = c.status === 'trial';
  const billing = getCompanyBilling(c);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
      <td className="py-4 px-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
            {c.logo_url ? (
              <img src={c.logo_url} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              (c.name_ar || c.name_en || 'K').charAt(0)
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 group-hover:text-cyan-600 transition-colors truncate">
              {c.name_ar}
            </p>
            <p className="text-xs text-gray-400 font-mono truncate">{c.slug}</p>
          </div>
        </div>
      </td>
      <td className="py-4 px-5">
        <Badge variant={c.status}>
          {c.status === 'active' ? 'نشط' : c.status === 'trial' ? 'تجريبي' :
           c.status === 'suspended' ? 'موقوف' : c.status === 'expired' ? 'منتهي' : c.status}
        </Badge>
      </td>
      <td className="py-4 px-5">
        <Badge variant={c.subscription_plan}>
          {c.subscription_plan === 'basic' ? 'أساسي' :
           c.subscription_plan === 'professional' ? 'احترافي' :
           c.subscription_plan === 'enterprise' ? 'مؤسسي' : 'مخصص'}
        </Badge>
        <p className="text-[10px] text-gray-400 mt-1">{formatMoney(billing.billing_amount ?? PLAN_PRICE[c.subscription_plan], billing.currency || 'IQD')}</p>
      </td>
      <td className="py-4 px-5 text-sm text-gray-600 truncate max-w-[160px]">
        <span className="flex items-center gap-1">
          <Mail size={12} className="text-gray-400 flex-shrink-0" />
          {c.contact_email || '—'}
        </span>
      </td>
      <td className="py-4 px-5 text-xs text-gray-500 font-mono tabular-nums">
        {c.created_at ? new Date(c.created_at).toLocaleDateString('ar-SA') : '—'}
      </td>
      <td className="py-4 px-5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => onView(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-cyan-600 transition-colors" title="عرض">
            <Eye size={16} />
          </button>
          <button onClick={() => onEdit(c)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors" title="تعديل">
            <Edit3 size={16} />
          </button>
          <button onClick={() => onManageModules(c)} className="p-2 rounded-lg hover:bg-cyan-50 text-gray-400 hover:text-cyan-600 transition-colors" title="إدارة البوابات">
            <SlidersHorizontal size={16} />
          </button>
          <button
            onClick={() => onToggleStatus(c)}
            className={`p-2 rounded-lg transition-colors ${
              isActive ? 'hover:bg-amber-50 text-gray-400 hover:text-amber-600' :
              isTrial  ? 'hover:bg-emerald-50 text-gray-400 hover:text-emerald-600' :
                         'hover:bg-emerald-50 text-gray-400 hover:text-emerald-600'
            }`}
            title={isActive ? 'تعليق' : 'تفعيل'}
          >
            {isActive ? <Ban size={16} /> : <Unlock size={16} />}
          </button>
        </div>
      </td>
    </tr>
  );
};

// ════════════════════════════════════════════════════════════════
//  Company Form Modal
// ════════════════════════════════════════════════════════════════

const CompanyFormModal: FC<{
  open: boolean;
  company: Partial<Company> | null; // null → create mode
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  saving: boolean;
}> = ({ open, company, onSave, onClose, saving }) => {
  const [form, setForm] = useState({
    name_ar: '',
    name_en: '',
    slug: '',
    domain: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    subscription_plan: 'basic',
    subscription_status: 'trial',
    subscription_start_date: new Date().toISOString().split('T')[0],
    subscription_end_date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    max_employees: 50,
    max_branches: 1,
    max_biometric_devices: 1,
    storage_gb: 5,
    billing_amount: 250,
    currency: 'IQD',
    billing_cycle: 'monthly',
    payment_method: 'manual_invoice',
    payment_status: 'unpaid',
    payment_reference: '',
    payment_due_date: new Date().toISOString().split('T')[0],
    contract_number: '',
    invoice_number: '',
    sales_owner: '',
    auto_renew: true,
    notes: '',
  });

  const [modules, setModules] = useState<Record<string, boolean>>(() => buildModuleState());

  const isEdit = !!company?.id;

  useEffect(() => {
    if (company) {
      const billing = getCompanyBilling(company);
      const plan = company.subscription_plan || 'basic';
      setForm({
        name_ar: company.name_ar || '',
        name_en: company.name_en || '',
        slug: company.slug || '',
        domain: company.domain || '',
        contact_name: company.contact_name || '',
        contact_email: company.contact_email || '',
        contact_phone: company.contact_phone || '',
        subscription_plan: plan,
        subscription_status: company.subscription_status || 'trial',
        subscription_start_date: company.subscription_start_date || new Date().toISOString().split('T')[0],
        subscription_end_date: company.subscription_end_date || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        max_employees: company.max_employees || 50,
        max_branches: Number(billing.max_branches ?? 1),
        max_biometric_devices: Number(billing.max_biometric_devices ?? 1),
        storage_gb: Number(billing.storage_gb ?? 5),
        billing_amount: Number(billing.billing_amount ?? PLAN_PRICE[plan] ?? 250),
        currency: String(billing.currency || 'IQD'),
        billing_cycle: String(billing.billing_cycle || 'monthly'),
        payment_method: String(billing.payment_method || 'manual_invoice'),
        payment_status: String(billing.payment_status || 'unpaid'),
        payment_reference: String(billing.payment_reference || ''),
        payment_due_date: String(billing.payment_due_date || company.subscription_start_date || new Date().toISOString().split('T')[0]),
        contract_number: String(billing.contract_number || ''),
        invoice_number: String(billing.invoice_number || ''),
        sales_owner: String(billing.sales_owner || ''),
        auto_renew: Boolean(billing.auto_renew ?? true),
        notes: company.notes || '',
      });
      const enabled = company.enabled_modules || modulesForPlan(company.subscription_plan || 'basic');
      setModules(buildModuleState(enabled));
    } else {
      setForm((f) => ({ ...f, subscription_plan: 'basic', billing_amount: PLAN_PRICE.basic, max_employees: 50, max_branches: 1, max_biometric_devices: 1, storage_gb: 5 }));
      setModules(buildModuleState(modulesForPlan('basic')));
    }
  }, [company]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_ar.trim() || !form.slug.trim()) return;
    const enabledModules = Object.entries(modules)
      .filter(([_, v]) => v)
      .map(([k]) => k);
    await onSave({ ...form, enabled_modules: enabledModules });
  };

  const update = (key: string, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900">
            {isEdit ? 'تعديل بيانات الشركة' : 'إضافة شركة جديدة'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">اسم الشركة بالعربية *</label>
              <input
                type="text"
                value={form.name_ar}
                onChange={(e) => update('name_ar', e.target.value)}
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all"
                placeholder="مثال: شركة التقنية"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-bold text-gray-500 mb-1 block">اسم الشركة بالإنجليزية</label>
              <input
                type="text"
                value={form.name_en}
                onChange={(e) => update('name_en', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all text-left"
                dir="ltr"
                placeholder="e.g. Tech Company"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">المعرف (Slug) *</label>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all text-left"
              dir="ltr"
              placeholder="company-slug"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">جهة الاتصال</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => update('contact_name', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">البريد الإلكتروني</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => update('contact_email', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all text-left"
                dir="ltr"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">رقم الهاتف</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(e) => update('contact_phone', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all text-left"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 mb-1 block">النطاق / Domain</label>
              <input
                type="text"
                value={form.domain}
                onChange={(e) => update('domain', e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all text-left"
                dir="ltr"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">خطة الاشتراك</label>
            <select
              value={form.subscription_plan}
              onChange={(e) => { const plan = e.target.value; setForm((f) => ({ ...f, subscription_plan: plan, billing_amount: plan === 'custom' ? f.billing_amount : (PLAN_PRICE[plan] ?? f.billing_amount) })); }}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all"
            >
              <option value="basic">أساسي (Basic) — 250$/شهر</option>
              <option value="professional">احترافي (Professional) — 750$/شهر</option>
              <option value="enterprise">مؤسسي (Enterprise) — 2000$/شهر</option>
              <option value="custom">مخصص (Custom)</option>
            </select>
          </div>

          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/40 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-cyan-700" />
              <h4 className="text-sm font-black text-gray-900">تفاصيل الاشتراك والفوترة</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">حالة الاشتراك</label>
                <select value={form.subscription_status} onChange={(e) => update('subscription_status', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="trial">تجريبي</option><option value="active">نشط</option><option value="grace_period">فترة سماح</option><option value="expired">منتهي</option><option value="cancelled">ملغي</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">دورة الفوترة</label>
                <select value={form.billing_cycle} onChange={(e) => update('billing_cycle', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="semi_annual">نصف سنوي</option><option value="annual">سنوي</option><option value="one_time">دفعة واحدة</option><option value="custom">مخصص</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">سعر الاشتراك</label>
                <input type="number" min={0} value={form.billing_amount} onChange={(e) => update('billing_amount', Number(e.target.value) || 0)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">العملة</label>
                <select value={form.currency} onChange={(e) => update('currency', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="IQD">IQD</option><option value="USD">USD</option><option value="SAR">SAR</option><option value="AED">AED</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">طريقة الدفع</label>
                <select value={form.payment_method} onChange={(e) => update('payment_method', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="cash">نقدي</option><option value="bank_transfer">تحويل مصرفي</option><option value="card">بطاقة</option><option value="zain_cash">زين كاش</option><option value="asia_hawala">آسيا حوالة</option><option value="stripe">Stripe</option><option value="manual_invoice">فاتورة يدوية</option><option value="other">أخرى</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">حالة الدفع</label>
                <select value={form.payment_status} onChange={(e) => update('payment_status', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
                  <option value="unpaid">غير مدفوع</option><option value="pending">قيد المعالجة</option><option value="paid">مدفوع</option><option value="overdue">متأخر</option><option value="failed">فشل الدفع</option><option value="refunded">مسترجع</option><option value="cancelled">ملغي</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">بداية الاشتراك</label>
                <input type="date" value={form.subscription_start_date} onChange={(e) => update('subscription_start_date', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">نهاية الاشتراك</label>
                <input type="date" value={form.subscription_end_date} onChange={(e) => update('subscription_end_date', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">تاريخ الاستحقاق</label>
                <input type="date" value={form.payment_due_date} onChange={(e) => update('payment_due_date', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">رقم الفاتورة</label>
                <input value={form.invoice_number} onChange={(e) => update('invoice_number', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left" dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">رقم العقد</label>
                <input value={form.contract_number} onChange={(e) => update('contract_number', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left" dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">مسؤول المبيعات</label>
                <input value={form.sales_owner} onChange={(e) => update('sales_owner', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-500 mb-1 block">مرجع الدفع / رقم العملية</label>
                <input value={form.payment_reference} onChange={(e) => update('payment_reference', e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-left" dir="ltr" />
              </div>
              <label className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-700">
                <input type="checkbox" checked={form.auto_renew} onChange={(e) => update('auto_renew', e.target.checked)} /> تجديد تلقائي
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-4">
            <div className="flex items-center gap-2"><Receipt size={18} className="text-violet-700" /><h4 className="text-sm font-black text-gray-900">حدود الخطة التجارية</h4></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="text-xs font-bold text-gray-500 mb-1 block">الفروع</label><input type="number" min={1} value={form.max_branches} onChange={(e) => update('max_branches', Number(e.target.value) || 1)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 mb-1 block">أجهزة البصمة</label><input type="number" min={0} value={form.max_biometric_devices} onChange={(e) => update('max_biometric_devices', Number(e.target.value) || 0)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 mb-1 block">التخزين GB</label><input type="number" min={1} value={form.storage_gb} onChange={(e) => update('storage_gb', Number(e.target.value) || 1)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></div>
              <div><label className="text-xs font-bold text-gray-500 mb-1 block">الموظفون</label><input type="number" min={1} value={form.max_employees} onChange={(e) => update('max_employees', Number(e.target.value) || 1)} className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm" /></div>
            </div>
          </div>

          {/* تفعيل الوحدات */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">الوحدات المفعلة للشركة</label>
            <p className="text-[10px] text-gray-400 mb-2">اختر البوابات التي ستحصل عليها هذه الشركة</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {MODULE_CATALOG.map((module) => {
                const Icon = MODULE_ICON_MAP[module.key] || LayoutDashboard;
                const enabled = Boolean(modules[module.key]);
                const allowedByPlan = modulesForPlan(form.subscription_plan).includes(module.key);
                return (
                  <button
                    key={module.key}
                    type="button"
                    onClick={() => setModules((m) => ({ ...m, [module.key]: !m[module.key] }))}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center relative ${
                      enabled
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="text-xs font-bold">{module.label}</span>
                    <span className="text-[9px] opacity-60 leading-tight">{module.description}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full mt-1 ${allowedByPlan ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {allowedByPlan ? MODULE_CATEGORY_LABEL[module.category] : `خارج ${PLAN_LABEL[form.subscription_plan] || form.subscription_plan}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">ملاحظات</label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all resize-none"
              placeholder="ملاحظات إضافية..."
            />
          </div>
        </form>

        <div className="flex items-center gap-3 p-5 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50">
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.name_ar.trim() || !form.slug.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <RefreshCw size={14} className="animate-spin" />}
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التغييرات' : 'إضافة الشركة'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Company Detail Modal
// ════════════════════════════════════════════════════════════════

const CompanyDetailModal: FC<{
  company: Company | null;
  onClose: () => void;
  onEdit: (c: Company) => void;
}> = ({ company: c, onClose, onEdit }) => {
  if (!c) return null;
  const billing = getCompanyBilling(c);

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">تفاصيل الشركة</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg flex-shrink-0">
              {c.name_ar?.charAt(0) || 'K'}
            </div>
            <div>
              <h4 className="text-xl font-bold text-gray-900">{c.name_ar}</h4>
              <p className="text-sm text-gray-500 font-mono">{c.slug}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Detail label="الحالة"         value={<Badge variant={c.status}>{c.status}</Badge>} />
            <Detail label="الخطة"          value={<Badge variant={c.subscription_plan}>{PLAN_LABEL[c.subscription_plan] || c.subscription_plan}</Badge>} />
            <Detail label="السعر"          value={formatMoney(billing.billing_amount ?? PLAN_PRICE[c.subscription_plan], billing.currency || 'IQD')} />
            <Detail label="دورة الفوترة"   value={BILLING_CYCLE_LABEL[String(billing.billing_cycle || 'monthly')] || String(billing.billing_cycle || 'monthly')} />
            <Detail label="طريقة الدفع"    value={PAYMENT_METHOD_LABEL[String(billing.payment_method || 'manual_invoice')] || String(billing.payment_method || '—')} />
            <Detail label="حالة الدفع"     value={PAYMENT_STATUS_LABEL[String(billing.payment_status || 'unpaid')] || String(billing.payment_status || '—')} />
            <Detail label="البريد"         value={c.contact_email || '—'} />
            <Detail label="الهاتف"         value={c.contact_phone || '—'} />
            <Detail label="جهة الاتصال"    value={c.contact_name || '—'} />
            <Detail label="الحد الأقصى"    value={`${c.max_employees} موظف`} />
            <Detail label="تاريخ الإنشاء"  value={c.created_at ? new Date(c.created_at).toLocaleDateString('ar-SA') : '—'} />
            <Detail label="انتهاء الاشتراك" value={c.subscription_end_date ? new Date(c.subscription_end_date).toLocaleDateString('ar-SA') : '—'} />
            <Detail label="رقم الفاتورة" value={String(billing.invoice_number || '—')} />
            <Detail label="رقم العقد" value={String(billing.contract_number || '—')} />
          </div>

          {c.notes && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
              <p className="text-xs font-bold text-gray-500 mb-1">ملاحظات</p>
              <p className="text-sm text-gray-700">{c.notes}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 p-5 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-colors">إغلاق</button>
          <button onClick={() => { onClose(); onEdit(c); }} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg">تعديل</button>
        </div>
      </div>
    </div>
  );
};

const Detail: FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
    <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{label}</p>
    <div className="text-sm text-gray-900">{value}</div>
  </div>
);


const CreateInitialAdminModal: FC<{
  company: Company;
  onClose: () => void;
  onCreated: () => void;
}> = ({ company, onClose, onCreated }) => {
  const { addToast } = useUIStore();
  const [form, setForm] = useState({ email: `admin@${company.slug}.com`, full_name: '', password: '' });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.email || !form.full_name || form.password.length < 8) {
      addToast('يرجى ملء كل الحقول وكلمة مرور 8 أحرف على الأقل', 'error');
      return;
    }
    setSaving(true);
    try {
      const { supabase } = await import('../../../services/supabase/supabase');
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          target_tenant_id: company.id,
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: 'admin',
        }
      });
      if (error) throw new Error(error.message || 'فشل إنشاء الحساب');
      if ((data as any)?.error) throw new Error((data as any).error);
      addToast(`تم إنشاء حساب إداري أولي ${form.full_name} للشركة ${company.name_ar}`, 'success');
      onCreated();
    } catch (err: any) {
      addToast(`فشل: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-black text-lg">إنشاء حساب إداري أولي</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-3 text-xs text-cyan-800">
            <p className="font-bold">للشركة: {company.name_ar} ({company.slug})</p>
            <p className="font-mono text-[11px] mt-1">ID: {company.id.slice(0,12)}... — سيُستخدم كـ target_tenant_id</p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">البريد الإلكتروني *</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full mt-1 px-3 py-2.5 border rounded-xl text-sm" placeholder="admin@company.com" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">الاسم الكامل *</label>
            <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full mt-1 px-3 py-2.5 border rounded-xl text-sm" placeholder="أحمد محمد" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500">كلمة المرور * (8 أحرف على الأقل)</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="w-full mt-1 px-3 py-2.5 border rounded-xl text-sm" placeholder="كلمة مرور قوية" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold">إلغاء</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm disabled:opacity-50">{saving ? 'جاري الإنشاء...' : 'إنشاء الحساب'}</button>
          </div>
          <p className="text-[11px] text-slate-400 text-center">سيتم استدعاء Edge Function admin-create-user مع target_tenant_id={company.id.slice(0,8)}... ويُنشأ entity_membership كـ entity_admin تلقائياً</p>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Companies Page
// ════════════════════════════════════════════════════════════════

export default function CompaniesPage({ onNavigate }: { onNavigate?: (page: DevPortalPage) => void }) {
  const { addToast } = useUIStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState<Company | null>(null);
  const [viewing, setViewing]       = useState<Company | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirm, setConfirm]       = useState<{ type: string; company: Company } | null>(null);
  const [createAdminFor, setCreateAdminFor] = useState<Company | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await companiesApi.getAll();
      setCompanies(data);
    } catch (err: any) {
      addToast('فشل تحميل الشركات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // Filter
  const filtered = search.trim()
    ? companies.filter((c) =>
        c.name_ar?.toLowerCase().includes(search.toLowerCase()) ||
        c.name_en?.toLowerCase().includes(search.toLowerCase()) ||
        c.slug?.toLowerCase().includes(search.toLowerCase()) ||
        c.contact_email?.toLowerCase().includes(search.toLowerCase()))
    : companies;

  // Actions
  const handleCreate = () => { setEditing(null); setWizardOpen(true); };
  const handleCreateOld = () => { setEditing(null); setFormOpen(true); }; // kept for fallback
  const handleEdit   = (c: Company) => { setEditing(c); setFormOpen(true); };
  const handleView   = (c: Company) => { setViewing(c); };
  const handleManageModules = (c: Company) => {
    sessionStorage.setItem('devportal_selected_tenant', c.id);
    onNavigate?.('modules');
  };
  const handleCreateAdmin = (c: Company) => {
    setCreateAdminFor(c);
  };

  const handleSave = async (data: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (editing?.id) {
        await companiesApi.update(editing.id, data);
        addToast('تم تحديث الشركة بنجاح', 'success');
      } else {
        await companiesApi.create(data as any);
        addToast('تم إضافة الشركة بنجاح', 'success');
      }
      setFormOpen(false);
      setEditing(null);
      await fetchCompanies();
    } catch (err: any) {
      addToast(`خطأ: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = (c: Company) => {
    if (c.status === 'active') {
      setConfirm({ type: 'suspend', company: c });
    } else {
      setConfirm({ type: 'activate', company: c });
    }
  };

  const handleConfirmAction = async () => {
    if (!confirm) return;
    try {
      if (confirm.type === 'suspend') {
        await companiesApi.suspend(confirm.company.id);
        addToast(`تم تعليق شركة "${confirm.company.name_ar}"`, 'success');
      } else if (confirm.type === 'activate') {
        await companiesApi.activate(confirm.company.id);
        addToast(`تم تفعيل شركة "${confirm.company.name_ar}"`, 'success');
      } else if (confirm.type === 'delete') {
        await companiesApi.softDelete(confirm.company.id);
        addToast(`تم حذف شركة "${confirm.company.name_ar}"`, 'success');
      }
      setConfirm(null);
      await fetchCompanies();
    } catch (err: any) {
      addToast(`خطأ: ${err.message}`, 'error');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="إدارة الشركات"
        description={`${companies.length} شركة مسجلة في المنصة`}
        action={
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 shadow-lg shadow-cyan-500/25 transition-all"
          >
            <Plus size={18} /> إضافة شركة
          </button>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم، المعرف، أو البريد..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all shadow-sm"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-gray-400" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? 'لا توجد نتائج للبحث' : 'لا توجد شركات بعد'}
          description={search ? 'جرب كلمات بحث مختلفة' : 'ابدأ بإضافة أول شركة إلى المنصة'}
          action={
            !search && (
              <button onClick={handleCreate} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold text-sm hover:from-cyan-500 hover:to-blue-500 transition-all shadow-lg">
                <Plus size={18} /> إضافة شركة
              </button>
            )
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['الشركة', 'الحالة', 'الخطة', 'البريد', 'تاريخ التسجيل', 'إجراءات'].map((h) => (
                    <th key={h} className="text-right py-3.5 px-5 text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CompanyRow
                    key={c.id}
                    company={c}
                    onView={handleView}
                    onEdit={handleEdit}
                    onToggleStatus={handleToggleStatus}
                    onManageModules={handleManageModules}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <CompanyFormModal
        open={formOpen}
        company={editing}
        onSave={handleSave}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        saving={saving}
      />
      {viewing && (
        <CompanyDetailDrawer
          company={viewing}
          onClose={() => setViewing(null)}
          onEdit={handleEdit}
          onCreateAdmin={handleCreateAdmin}
        />
      )}
      {/* Keep old modal as fallback hidden */}
      {false && (
        <CompanyDetailModal
          company={viewing}
          onClose={() => setViewing(null)}
          onEdit={handleEdit}
        />
      )}
      {wizardOpen && (
        <CompanyCreateWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreated={async () => { setWizardOpen(false); await fetchCompanies(); }}
        />
      )}
      {createAdminFor && (
        <CreateInitialAdminModal
          company={createAdminFor}
          onClose={() => setCreateAdminFor(null)}
          onCreated={async () => { setCreateAdminFor(null); await fetchCompanies(); }}
        />
      )}
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === 'suspend' ? 'تعليق الشركة' : confirm?.type === 'activate' ? 'تفعيل الشركة' : 'حذف الشركة'}
        message={
          confirm?.type === 'suspend'
            ? `هل أنت متأكد من تعليق شركة "${confirm?.company.name_ar}"؟ لن يتمكن المستخدمون من الوصول.`
            : confirm?.type === 'activate'
            ? `هل أنت متأكد من تفعيل شركة "${confirm?.company.name_ar}"؟`
            : `هل أنت متأكد من حذف "${confirm?.company.name_ar}"؟ لا يمكن التراجع.`
        }
        variant={confirm?.type === 'suspend' ? 'warning' : confirm?.type === 'activate' ? 'info' : 'danger'}
        confirmLabel={confirm?.type === 'suspend' ? 'تعليق' : confirm?.type === 'activate' ? 'تفعيل' : 'حذف'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
