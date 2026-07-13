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
  Calendar, Activity, X, Save, CheckCircle,
  LayoutDashboard, Users, Shield, MessageSquare, Fingerprint, Cpu,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState, ConfirmDialog } from '../components/shared';
import { companiesApi } from '../services/api';
import type { Company, DevPortalPage, IconType } from '../types';
import { useUIStore } from '../../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Company Row
// ════════════════════════════════════════════════════════════════

const CompanyRow: FC<{
  company: Company;
  onView: (c: Company) => void;
  onEdit: (c: Company) => void;
  onToggleStatus: (c: Company) => void;
}> = ({ company: c, onView, onEdit, onToggleStatus }) => {
  const isActive = c.status === 'active';
  const isTrial  = c.status === 'trial';

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
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    subscription_plan: 'basic',
    max_employees: 50,
    notes: '',
  });

  const [modules, setModules] = useState({
    employee: true,
    hr: false,
    admin: false,
    gatekeeper: false,
    tawathul: false,
    tech_portal: false,
  });

  const isEdit = !!company?.id;

  useEffect(() => {
    if (company) {
      setForm({
        name_ar: company.name_ar || '',
        name_en: company.name_en || '',
        slug: company.slug || '',
        contact_name: company.contact_name || '',
        contact_email: company.contact_email || '',
        contact_phone: company.contact_phone || '',
        subscription_plan: company.subscription_plan || 'basic',
        max_employees: company.max_employees || 50,
        notes: company.notes || '',
      });
      const enabled = company.enabled_modules || ['employee'];
      setModules({
        employee: enabled.includes('employee'),
        hr: enabled.includes('hr'),
        admin: enabled.includes('admin'),
        gatekeeper: enabled.includes('gatekeeper'),
        tawathul: enabled.includes('tawathul'),
        tech_portal: enabled.includes('tech_portal'),
      });
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

  const update = (key: string, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col">
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
              <label className="text-xs font-bold text-gray-500 mb-1 block">الحد الأقصى للموظفين</label>
              <input
                type="number"
                value={form.max_employees}
                onChange={(e) => update('max_employees', parseInt(e.target.value) || 0)}
                min={1}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">خطة الاشتراك</label>
            <select
              value={form.subscription_plan}
              onChange={(e) => update('subscription_plan', e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all"
            >
              <option value="basic">أساسي (Basic) — 250$/شهر</option>
              <option value="professional">احترافي (Professional) — 750$/شهر</option>
              <option value="enterprise">مؤسسي (Enterprise) — 2000$/شهر</option>
              <option value="custom">مخصص (Custom)</option>
            </select>
          </div>

          {/* تفعيل الوحدات */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">الوحدات المفعلة للشركة</label>
            <p className="text-[10px] text-gray-400 mb-2">اختر البوابات التي ستحصل عليها هذه الشركة</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {([
                { key: 'employee', icon: LayoutDashboard, label: 'بوابة الموظف', desc: 'البلاغات، الحضور، التدريب' },
                { key: 'hr', icon: Users, label: 'الموارد البشرية', desc: 'إدارة الموظفين، الرواتب' },
                { key: 'admin', icon: Shield, label: 'الإدارة', desc: 'إعدادات وصلاحيات متقدمة' },
                { key: 'gatekeeper', icon: Fingerprint, label: 'الحركة', desc: 'بوابة الدخول والخروج' },
                { key: 'tawathul', icon: MessageSquare, label: 'التواصل', desc: 'نظام المحادثات الداخلية' },
                { key: 'tech_portal', icon: Cpu, label: 'البوابة التقنية', desc: 'أجهزة البصمة، تقنية المعلومات' },
              ] as const).map(({ key, icon: Icon, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setModules(m => ({ ...m, [key]: !m[key as keyof typeof modules] }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                    modules[key as keyof typeof modules]
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-700 shadow-sm'
                      : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'
                  }`}
                >
                  <Icon size={20} />
                  <span className="text-xs font-bold">{label}</span>
                  <span className="text-[9px] opacity-60 leading-tight">{desc}</span>
                </button>
              ))}
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
            <Detail label="الخطة"          value={<Badge variant={c.subscription_plan}>{c.subscription_plan}</Badge>} />
            <Detail label="البريد"         value={c.contact_email || '—'} />
            <Detail label="الهاتف"         value={c.contact_phone || '—'} />
            <Detail label="جهة الاتصال"    value={c.contact_name || '—'} />
            <Detail label="الحد الأقصى"    value={`${c.max_employees} موظف`} />
            <Detail label="تاريخ الإنشاء"  value={c.created_at ? new Date(c.created_at).toLocaleDateString('ar-SA') : '—'} />
            <Detail label="انتهاء الاشتراك" value={c.subscription_end_date ? new Date(c.subscription_end_date).toLocaleDateString('ar-SA') : '—'} />
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

// ════════════════════════════════════════════════════════════════
//  Companies Page
// ════════════════════════════════════════════════════════════════

export default function CompaniesPage() {
  const { addToast } = useUIStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [formOpen, setFormOpen]     = useState(false);
  const [editing, setEditing]       = useState<Company | null>(null);
  const [viewing, setViewing]       = useState<Company | null>(null);
  const [saving, setSaving]         = useState(false);
  const [confirm, setConfirm]       = useState<{ type: string; company: Company } | null>(null);

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
  const handleCreate = () => { setEditing(null); setFormOpen(true); };
  const handleEdit   = (c: Company) => { setEditing(c); setFormOpen(true); };
  const handleView   = (c: Company) => { setViewing(c); };

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
      <CompanyDetailModal
        company={viewing}
        onClose={() => setViewing(null)}
        onEdit={handleEdit}
      />
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
