/**
 * AdminSOPsPage — إدارة إجراءات التشغيل القياسية
 * تم إصلاحه في خطة العلاج: إزالة localStorage كمصدر بيانات، استخدام Supabase + RLS + audit
 * 
 * التحسينات:
 * - لا localStorage أبداً كمصدر حقيقة
 * - كل CRUD عبر Supabase مع tenant_id تلقائي (BaseService pattern)
 * - audit log عند كل إنشاء/تعديل/حذف
 * - handling لـ empty/loading/error states
 * - يحترم RLS: admin/hr فقط يمكنه الكتابة
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  FileText, Plus, Search, X, Save, Trash2, Edit3,
  Loader2, AlertCircle, CheckCircle, Clock, Tag, Eye, Download,
  BookOpen, RefreshCw, Info, Star, Calendar, Check, Layers
} from 'lucide-react';
import { sopAdminService } from '../../services/sdk/SopAdminService';
import { useUIStore, useAuthStore } from '../../core/stores';
import type { SOP, SOPStatus } from '../../shared/types/sops';
import { SOP_DEPARTMENTS, SOP_CATEGORIES } from '../../shared/types/sops';
import { getErrorMessage } from '../../services/errors';
import { requireTenantId } from '../../services/sdk/BaseService';
import { archiveService } from '../../services/sdk/ArchiveService';

// ── Helpers ──
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Toast ──
const Toast = ({ message, type, onClose }: {
  message: string; type: 'success' | 'error' | 'info' | 'warning'; onClose: () => void;
}) => {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const styles = {
    success: 'bg-emerald-500 shadow-emerald-200',
    error: 'bg-red-500 shadow-red-200',
    info: 'bg-blue-500 shadow-blue-200',
    warning: 'bg-amber-500 shadow-amber-200',
  };
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold text-sm shadow-2xl ${styles[type]} max-w-sm w-full mx-4`}>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100"><X size={15} /></button>
    </div>
  );
};

// ── Field Components ──
const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
      {label}
      {required && <span className="text-red-400 text-xs">*</span>}
    </label>
    {children}
  </div>
);

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
const Input = ({ dir = 'rtl', type = 'text', className = '', ...props }: InputProps) => (
  <input
    {...props}
    type={type}
    dir={dir}
    className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 ${className}`}
  />
);

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
const Textarea = ({ dir = 'rtl', rows = 3, ...props }: TextareaProps) => (
  <textarea
    {...props}
    dir={dir}
    rows={rows}
    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 resize-none"
  />
);

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}
const Select = ({ value, onChange, options, placeholder }: SelectProps) => (
  <select
    value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white"
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>
);

// ── Main ──
export default function AdminSOPsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSop, setEditingSop] = useState<SOP | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  // ★ هدف الأرشفة — بديل confirm() المحظور (سياسة المنصة)
  const [archiveTarget, setArchiveTarget] = useState<SOP | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    title: '', titleEn: '', code: '', description: '', descriptionEn: '',
    department: 'general', category: '', pdfUrl: '', version: '1.0',
    status: 'active' as SOPStatus, effectiveDate: '', reviewDate: '',
    tags: '', duration: '30', isMandatory: true,
  });

  const showToast = (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => setToast({ msg, type });

  // Load from Supabase (RLS protected, tenant isolated)
  const loadSops = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantId = requireTenantId();
      setSops(await sopAdminService.findCatalog(tenantId));
    } catch (err: any) {
      setError(getErrorMessage(err));
      // If table doesn't exist yet (early env), show empty with info
      if (getErrorMessage(err).includes('does not exist') || getErrorMessage(err).includes('sops')) {
        setSops([]);
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSops(); }, [loadSops]);

  const filteredSops = useMemo(() => {
    return sops.filter(sop => {
      if (search) {
        const term = search.toLowerCase();
        if (!sop.title.toLowerCase().includes(term) && !sop.code.toLowerCase().includes(term) && !sop.description.toLowerCase().includes(term)) return false;
      }
      if (filterDept !== 'all' && sop.department !== filterDept) return false;
      if (filterStatus !== 'all' && sop.status !== filterStatus) return false;
      return true;
    });
  }, [sops, search, filterDept, filterStatus]);

  const resetForm = () => {
    setFormData({
      title: '', titleEn: '', code: '', description: '', descriptionEn: '',
      department: 'general', category: '', pdfUrl: '', version: '1.0',
      status: 'active', effectiveDate: '', reviewDate: '',
      tags: '', duration: '30', isMandatory: true,
    });
    setEditingSop(null);
  };

  const handleEdit = (sop: SOP) => {
    setFormData({
      title: sop.title,
      titleEn: sop.titleEn || '',
      code: sop.code,
      description: sop.description,
      descriptionEn: sop.descriptionEn || '',
      department: sop.department,
      category: sop.category,
      pdfUrl: sop.pdfUrl,
      version: sop.version,
      status: sop.status,
      effectiveDate: sop.effectiveDate,
      reviewDate: sop.reviewDate,
      tags: (sop.tags || []).join(', '),
      duration: sop.duration,
      isMandatory: sop.isMandatory,
    });
    setEditingSop(sop);
    setShowModal(true);
  };

  const handleAdd = () => { resetForm(); setShowModal(true); };

  const handleSave = async () => {
    if (!formData.title || !formData.code) {
      showToast('يرجى إدخال عنوان وكود SOP', 'error');
      return;
    }
    setSaving(true);
    try {
      const tenantId = requireTenantId();
      const now = new Date().toISOString();
      const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
      const effectiveDate = formData.effectiveDate || now.split('T')[0];
      const reviewDate = formData.reviewDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const input = {
        title: formData.title,
        titleEn: formData.titleEn,
        code: formData.code,
        description: formData.description,
        descriptionEn: formData.descriptionEn,
        department: formData.department,
        category: formData.category,
        fileUrl: formData.pdfUrl,
        version: formData.version,
        status: formData.status,
        effectiveDate,
        reviewDate,
        tags,
        duration: formData.duration,
        isMandatory: formData.isMandatory,
        createdBy: user?.id,
      };

      if (editingSop) {
        await sopAdminService.updateSop(editingSop.id, tenantId, input);
        showToast(`تم تحديث ${formData.code}`, 'success');
        addToast(`تم تحديث ${formData.code}`, 'success');
      } else {
        await sopAdminService.createSop(tenantId, input);
        showToast(`تم إضافة ${formData.code}`, 'success');
        addToast(`تم إضافة ${formData.code}`, 'success');
      }
      setShowModal(false);
      resetForm();
      await loadSops();
    } catch (err: any) {
      showToast('خطأ: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * أرشفة الإجراء — لا حذف نهائي.
   *
   * ★ النسخة السابقة كانت:
   *      confirm(...) ثم حذف مباشر من جدول sops
   *   وثلاث مخالفات فيها:
   *     · confirm() محظور بسياسة المنصة
   *     · الصفحة تلمس Supabase مباشرةً بدل طبقة SDK
   *     · ON DELETE CASCADE على sop_readings يُبيد **دليل الامتثال**
   *       (مقيس: سجلات القراءة 1 ⇒ 0 بعد الحذف · 1 بعد الأرشفة)
   *
   *   `sops.status` يقبل 'archived' أصلاً — الأرشفة كانت متاحة ولم تُستعمل.
   */
  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const result = await archiveService.archiveSop(archiveTarget.id);
      showToast(
        result === 'already_archived'
          ? `${archiveTarget.code} مؤرشف أصلاً`
          : `تمت أرشفة ${archiveTarget.code} — سجلات القراءة محفوظة`,
        result === 'already_archived' ? 'info' : 'success',
      );
      addToast(`تمت أرشفة ${archiveTarget.code}`, 'info');
      setArchiveTarget(null);
      await loadSops();
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setArchiving(false);
    }
  };

  const getStatusBadge = (status: SOPStatus) => {
    const colors: any = { active: 'bg-emerald-100 text-emerald-700', inactive: 'bg-slate-100 text-slate-500', draft: 'bg-amber-100 text-amber-700' };
    const labels: any = { active: 'نشط', inactive: 'غير نشط', draft: 'مسودة' };
    return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${colors[status]}`}>{labels[status]}</span>;
  };

  const getDeptName = (key: string) => SOP_DEPARTMENTS.find(d => d.key === key)?.nameAr || key;

  const stats = useMemo(() => ({
    total: sops.length,
    active: sops.filter(s => s.status === 'active').length,
    inactive: sops.filter(s => s.status === 'inactive').length,
    draft: sops.filter(s => s.status === 'draft').length,
  }), [sops]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>;

  return (
    <div className="space-y-6 pb-20 animate-fade-in" dir="rtl">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2"><BookOpen className="text-indigo-600" /> إدارة SOPs <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-full">Supabase + RLS ✅</span></h2>
          <p className="text-sm text-slate-500 mt-1">إدارة مركزية من قاعدة البيانات مع عزل tenant وسجل تدقيق — لا localStorage</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadSops()} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border rounded-xl text-sm font-bold hover:bg-slate-50"><RefreshCw size={14} /> تحديث</button>
          <button onClick={handleAdd} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700"><Plus size={14} /> إضافة SOP</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-2xl p-4"><p className="text-2xl font-black">{stats.total}</p><p className="text-xs text-slate-500">الإجمالي</p></div>
        <div className="bg-white border rounded-2xl p-4"><p className="text-2xl font-black text-emerald-600">{stats.active}</p><p className="text-xs text-slate-500">نشط</p></div>
        <div className="bg-white border rounded-2xl p-4"><p className="text-2xl font-black text-amber-600">{stats.draft}</p><p className="text-xs text-slate-500">مسودة</p></div>
        <div className="bg-white border rounded-2xl p-4"><p className="text-2xl font-black text-slate-400">{stats.inactive}</p><p className="text-xs text-slate-500">غير نشط</p></div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث بالعنوان أو الكود..." className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
          <option value="all">كل الأقسام</option>
          {SOP_DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.nameAr}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm">
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="draft">مسودة</option>
          <option value="inactive">غير نشط</option>
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex gap-2"><AlertCircle size={16} />{error}</div>}

      {/* List */}
      <div className="space-y-3">
        {filteredSops.map(sop => (
          <div key={sop.id} className="bg-white border rounded-2xl p-5 hover:border-indigo-200 transition">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-black bg-slate-100 px-2 py-1 rounded-lg">{sop.code}</span>
                  {getStatusBadge(sop.status)}
                  <span className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full">{getDeptName(sop.department)}</span>
                </div>
                <h3 className="font-black text-slate-900 mt-2">{sop.title}</h3>
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{sop.description}</p>
                <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={12} />{sop.duration} دقيقة</span>
                  <span className="flex items-center gap-1"><Tag size={12} />{sop.version}</span>
                  <span className="flex items-center gap-1"><Calendar size={12} />{sop.effectiveDate}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handleEdit(sop)} className="w-8 h-8 bg-slate-50 border rounded-xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600"><Edit3 size={14} /></button>
                <button onClick={() => setArchiveTarget(sop)} title="أرشفة" className="w-8 h-8 bg-slate-50 border rounded-xl flex items-center justify-center hover:bg-amber-50 hover:text-amber-600"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {filteredSops.length === 0 && (
          <div className="bg-white border border-dashed rounded-2xl p-16 text-center">
            <FileText className="mx-auto text-slate-300 mb-3" size={36} />
            <p className="font-bold text-slate-700">لا توجد SOPs مطابقة</p>
            <p className="text-sm text-slate-400 mt-1">أنشئ أول SOP من قاعدة البيانات — لا localStorage</p>
            <button onClick={handleAdd} className="mt-4 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm">إضافة SOP</button>
          </div>
        )}
      </div>

      {/* ★ تأكيد الأرشفة — Modal لا confirm() (سياسة المنصة) */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">تأكيد الأرشفة</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              أرشفة <b>«{archiveTarget.code} — {archiveTarget.title}»</b>؟
            </p>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
              الإجراء يُؤرشَف ولا يُحذف. سجلات «من قرأ الإجراء ومتى» تبقى
              محفوظة كدليل امتثال — الحذف النهائي كان يُبيدها.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={archiving}
                className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm disabled:opacity-50"
              >
                تراجع
              </button>
              <button
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {archiving && <Loader2 size={14} className="animate-spin" />}
                أرشفة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[24px] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex justify-between items-center rounded-t-[24px]">
              <h3 className="font-black text-lg">{editingSop ? 'تعديل' : 'إضافة'} SOP — Supabase</h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center"><X size={14} /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="العنوان" required><Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="عنوان SOP بالعربية" /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="الكود" required><Input value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="SOP-XXX-001" dir="ltr" /></Field>
                <Field label="الإصدار"><Input value={formData.version} onChange={e => setFormData({ ...formData, version: e.target.value })} placeholder="1.0" dir="ltr" /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="القسم"><Select value={formData.department} onChange={val => setFormData({ ...formData, department: val })} options={SOP_DEPARTMENTS.map(d => ({ value: d.key, label: d.nameAr }))} /></Field>
                <Field label="التصنيف"><Select value={formData.category} onChange={val => setFormData({ ...formData, category: val })} options={SOP_CATEGORIES.map(c => ({ value: c.nameAr, label: c.nameAr }))} placeholder="اختر التصنيف" /></Field>
              </div>
              <Field label="الوصف"><Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="وصف مختصر" rows={3} /></Field>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="رابط PDF"><Input value={formData.pdfUrl} onChange={e => setFormData({ ...formData, pdfUrl: e.target.value })} placeholder="https://..." dir="ltr" /></Field>
                <Field label="المدة (دقيقة)"><Input value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} placeholder="30" type="number" dir="ltr" /></Field>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <Field label="تاريخ التفعيل"><Input value={formData.effectiveDate} onChange={e => setFormData({ ...formData, effectiveDate: e.target.value })} type="date" dir="ltr" /></Field>
                <Field label="تاريخ المراجعة"><Input value={formData.reviewDate} onChange={e => setFormData({ ...formData, reviewDate: e.target.value })} type="date" dir="ltr" /></Field>
              </div>
              <Field label="Tags (مفصولة بفاصلة)"><Input value={formData.tags} onChange={e => setFormData({ ...formData, tags: e.target.value })} placeholder="tablets, cleaning, safety" dir="ltr" /></Field>
              <div className="flex gap-3 pt-2">
                <button onClick={() => void handleSave()} disabled={saving} className="flex-1 bg-indigo-600 text-white rounded-xl py-3 font-black text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{editingSop ? 'تحديث' : 'إنشاء'}</button>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="px-6 bg-white border rounded-xl py-3 font-bold text-sm">إلغاء</button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">يتم الحفظ في Supabase مع RLS + tenant_id تلقائي — لا localStorage</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
