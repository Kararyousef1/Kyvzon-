import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  FileText, Plus, Search, X, Save, Upload, Trash2, Edit3,
  Loader2, AlertCircle, CheckCircle, Clock, Tag, Eye, Download,
  BookOpen, Filter, RefreshCw, Info, Settings, Star, Users,
  Calendar, ChevronDown, ChevronUp, Copy, GripVertical,
  ArrowUp, ArrowDown, Globe, Check, Layers
} from 'lucide-react';
import { supabase } from '../../services/supabase/supabase';
import { useUIStore, useAuthStore } from '../../core/stores';
import type { SOP, SOPStatus } from '../../shared/types/sops';
import { SOP_DEPARTMENTS, SOP_CATEGORIES } from '../../shared/types/sops';

// ── Helpers ──
const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ── Toast Component ──
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
  const icons = {
    success: <CheckCircle size={16} />,
    error: <AlertCircle size={16} />,
    info: <Info size={16} />,
    warning: <AlertCircle size={16} />,
  };
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold text-sm shadow-2xl ${styles[type]} animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] max-w-sm w-full mx-4`}>
      <span className="shrink-0">{icons[type]}</span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"><X size={15} /></button>
    </div>
  );
};

// ── Field Component ──
const Field = ({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
      {label}
      {required && <span className="text-red-400 text-xs">*</span>}
    </label>
    {children}
  </div>
);

// ── Input Component ──
const Input = ({ value, onChange, placeholder, dir = 'rtl', type = 'text', className = '', disabled = false }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; dir?: 'rtl' | 'ltr'; type?: string; className?: string; disabled?: boolean;
}) => (
  <input
    type={type} value={value} onChange={onChange} placeholder={placeholder} dir={dir} disabled={disabled}
    className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  />
);

// ── Textarea Component ──
const Textarea = ({ value, onChange, placeholder, dir = 'rtl', rows = 3 }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string; dir?: 'rtl' | 'ltr'; rows?: number;
}) => (
  <textarea
    value={value} onChange={onChange} placeholder={placeholder} dir={dir} rows={rows}
    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 resize-none"
  />
);

// ── Select Component ──
const Select = ({ value, onChange, options, placeholder }: {
  value: string; onChange: (val: string) => void;
  options: { value: string; label: string }[]; placeholder?: string;
}) => (
  <select
    value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all"
  >
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

// ── Toggle Component ──
const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) => (
  <div onClick={() => onChange(!checked)} className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${checked ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
    <p className="font-bold text-slate-800 text-sm">{label}</p>
    <div className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 mr-4 ${checked ? 'bg-indigo-500' : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`} />
    </div>
  </div>
);

// ── Main Component ──
export default function AdminSOPsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  const [sops, setSops] = useState<SOP[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingSop, setEditingSop] = useState<SOP | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '', titleEn: '', code: '', description: '', descriptionEn: '',
    department: 'general', category: '', pdfUrl: '', version: '1.0',
    status: 'active' as SOPStatus, effectiveDate: '', reviewDate: '',
    tags: '', duration: '30', isMandatory: true,
  });

  const showToast = (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => setToast({ msg, type });

  // Load SOPs from localStorage initially (will be replaced with Supabase)
  useEffect(() => {
    const loadSops = async () => {
      setLoading(true);
      try {
        // Try Supabase first (this will be implemented when tables exist)
        // Fall back to localStorage for now
        const stored = localStorage.getItem('sops_data');
        if (stored) {
          setSops(JSON.parse(stored));
        } else {
          // Seed with mock data if empty
          const mockSops: SOP[] = [
            { id: 'sop-001', title: 'إجراءات تشغيل أنظمة التقنية', titleEn: 'Technology Systems SOP', code: 'SOP-MFG-001', description: 'إجراءات تشغيل وإيقاف أنظمة التقنية', descriptionEn: 'Procedures for starting and stopping technology systems', department: 'tablets', category: 'التصنيع', pdfUrl: '#', version: '2.1', status: 'active' as SOPStatus, createdBy: 'admin', createdAt: '2025-01-15', updatedAt: '2025-06-01', effectiveDate: '2025-06-15', reviewDate: '2026-06-15', tags: ['tablets', 'production'], duration: '30', isMandatory: true },
            { id: 'sop-002', title: 'إجراءات تنظيف غرفة التعبئة', titleEn: 'Packaging Room Cleaning SOP', code: 'SOP-QA-002', description: 'إجراءات تنظيف وتعقيم غرفة التعبئة والتغليف', descriptionEn: 'Cleaning and sanitization procedures for the packaging room', department: 'quality', category: 'التنظيف والتعقيم', pdfUrl: '#', version: '1.5', status: 'active' as SOPStatus, createdBy: 'admin', createdAt: '2024-11-20', updatedAt: '2025-05-10', effectiveDate: '2025-05-20', reviewDate: '2026-05-20', tags: ['cleaning', 'packaging'], duration: '20', isMandatory: true },
            { id: 'sop-003', title: 'إجراءات أخذ العينات من المواد الخام', titleEn: 'Raw Material Sampling SOP', code: 'SOP-QC-003', description: 'إجراءات أخذ عينات من المواد الخام الواردة', descriptionEn: 'Procedures for sampling incoming raw materials', department: 'quality', category: 'ضبط الجودة', pdfUrl: '#', version: '3.0', status: 'active' as SOPStatus, createdBy: 'admin', createdAt: '2024-08-01', updatedAt: '2025-04-01', effectiveDate: '2025-04-15', reviewDate: '2026-04-15', tags: ['sampling', 'quality'], duration: '25', isMandatory: true },
            { id: 'sop-005', title: 'إجراءات السلامة في منطقة الإنتاج', titleEn: 'Production Area Safety SOP', code: 'SOP-SAF-005', description: 'إجراءات السلامة العامة في منطقة الإنتاج', descriptionEn: 'General safety procedures in the production area', department: 'general', category: 'السلامة', pdfUrl: '#', version: '1.0', status: 'active' as SOPStatus, createdBy: 'admin', createdAt: '2025-01-01', updatedAt: '2025-01-01', effectiveDate: '2025-01-15', reviewDate: '2026-01-15', tags: ['safety'], duration: '15', isMandatory: true },
          ];
          setSops(mockSops);
          localStorage.setItem('sops_data', JSON.stringify(mockSops));
        }
      } catch (err) {
        console.error('Failed to load SOPs:', err);
        showToast('فشل في تحميل البيانات', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadSops();
  }, []);

  // Filtered SOPs
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

  // Reset form
  const resetForm = () => {
    setFormData({
      title: '', titleEn: '', code: '', description: '', descriptionEn: '',
      department: 'general', category: '', pdfUrl: '', version: '1.0',
      status: 'active', effectiveDate: '', reviewDate: '',
      tags: '', duration: '30', isMandatory: true,
    });
    setEditingSop(null);
  };

  // Open edit modal
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

  // Open add modal
  const handleAdd = () => {
    resetForm();
    setShowModal(true);
  };

  // Save SOP
  const handleSave = async () => {
    if (!formData.title || !formData.code) {
      showToast('يرجى إدخال عنوان وكود SOP', 'error');
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
      const effectiveDate = formData.effectiveDate || now.split('T')[0];
      const reviewDate = formData.reviewDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (editingSop) {
        // Update existing
        const updated: SOP = {
          ...editingSop,
          title: formData.title,
          titleEn: formData.titleEn,
          code: formData.code,
          description: formData.description,
          descriptionEn: formData.descriptionEn,
          department: formData.department,
          category: formData.category,
          pdfUrl: formData.pdfUrl,
          version: formData.version,
          status: formData.status,
          effectiveDate,
          reviewDate,
          tags,
          duration: formData.duration,
          isMandatory: formData.isMandatory,
          updatedAt: now,
        };
        const newSops = sops.map(s => s.id === editingSop.id ? updated : s);
        setSops(newSops);
        localStorage.setItem('sops_data', JSON.stringify(newSops));
        showToast(`تم تحديث ${updated.code} بنجاح`, 'success');
        if (addToast) addToast(`تم تحديث ${updated.code}`, 'success');
      } else {
        // Create new
        const newSop: SOP = {
          id: generateId(),
          title: formData.title,
          titleEn: formData.titleEn,
          code: formData.code,
          description: formData.description,
          descriptionEn: formData.descriptionEn,
          department: formData.department,
          category: formData.category,
          pdfUrl: formData.pdfUrl,
          version: formData.version,
          status: formData.status,
          createdBy: user?.id || 'admin',
          createdAt: now,
          updatedAt: now,
          effectiveDate,
          reviewDate,
          tags,
          duration: formData.duration,
          isMandatory: formData.isMandatory,
        };
        const newSops = [...sops, newSop];
        setSops(newSops);
        localStorage.setItem('sops_data', JSON.stringify(newSops));
        showToast(`تم إضافة ${newSop.code} بنجاح`, 'success');
        if (addToast) addToast(`تم إضافة ${newSop.code}`, 'success');
      }
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      showToast('خطأ: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete SOP
  const handleDelete = (sop: SOP) => {
    if (!confirm(`هل أنت متأكد من حذف ${sop.code} - ${sop.title}؟`)) return;
    const newSops = sops.filter(s => s.id !== sop.id);
    setSops(newSops);
    localStorage.setItem('sops_data', JSON.stringify(newSops));
    showToast(`تم حذف ${sop.code}`, 'warning');
    if (addToast) addToast(`تم حذف ${sop.code}`, 'info');
  };

  // Duplicate SOP
  const handleDuplicate = (sop: SOP) => {
    const newSop: SOP = {
      ...sop,
      id: generateId(),
      code: sop.code + '-copy',
      title: sop.title + ' (نسخة)',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const newSops = [...sops, newSop];
    setSops(newSops);
    localStorage.setItem('sops_data', JSON.stringify(newSops));
    showToast(`تم نسخ ${sop.code}`, 'info');
  };

  const getStatusBadge = (status: SOPStatus) => {
    const colors: Record<SOPStatus, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      inactive: 'bg-slate-100 text-slate-500',
      draft: 'bg-amber-100 text-amber-700',
    };
    const labels: Record<SOPStatus, string> = {
      active: 'نشط',
      inactive: 'غير نشط',
      draft: 'مسودة',
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${colors[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getDeptName = (key: string) => SOP_DEPARTMENTS.find(d => d.key === key)?.nameAr || key;

  // ── Stats ──
  const stats = useMemo(() => ({
    total: sops.length,
    active: sops.filter(s => s.status === 'active').length,
    inactive: sops.filter(s => s.status === 'inactive').length,
    draft: sops.filter(s => s.status === 'draft').length,
  }), [sops]);

  return (
    <div className="space-y-6 pb-20 animate-fade-in" dir="rtl">
      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-indigo-600" /> إدارة إجراءات SOP
          </h2>
          <p className="text-slate-500 mt-1">إنشاء وإدارة إجراءات التشغيل القياسية حسب الأقسام</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-l from-indigo-600 to-indigo-500 text-white rounded-xl text-sm font-bold hover:from-indigo-700 hover:to-indigo-600 transition-all shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> إضافة SOP جديد
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-2xl p-5 text-white">
          <p className="text-3xl font-black">{stats.total}</p>
          <p className="text-indigo-100 text-xs font-bold mt-1">إجمالي SOPs</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl p-5 text-white">
          <p className="text-3xl font-black">{stats.active}</p>
          <p className="text-emerald-100 text-xs font-bold mt-1">نشط</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl p-5 text-white">
          <p className="text-3xl font-black">{stats.draft}</p>
          <p className="text-amber-100 text-xs font-bold mt-1">مسودة</p>
        </div>
        <div className="bg-gradient-to-br from-slate-500 to-slate-700 rounded-2xl p-5 text-white">
          <p className="text-3xl font-black">{stats.inactive}</p>
          <p className="text-slate-100 text-xs font-bold mt-1">غير نشط</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن SOP بالاسم أو الكود..." dir="rtl"
              className="w-full pr-9 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all"
            />
          </div>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all">
            <option value="all">جميع الأقسام</option>
            {SOP_DEPARTMENTS.map(d => <option key={d.key} value={d.key}>{d.nameAr}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all">
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
            <option value="draft">مسودة</option>
          </select>
        </div>
      </div>

      {/* SOPs List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-indigo-500" />
        </div>
      ) : filteredSops.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <FileText size={48} className="text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-600 mb-2">لا توجد إجراءات SOP</h3>
          <p className="text-slate-400 text-sm mb-4">قم بإضافة أول SOP للنظام</p>
          <button onClick={handleAdd} className="px-5 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all">
            <Plus size={16} className="inline ml-1" /> إضافة SOP
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSops.map(sop => (
            <div key={sop.id} className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-200 transition-all shadow-sm hover:shadow-md">
              {/* Header Row */}
              <div className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpandedId(expandedId === sop.id ? null : sop.id)}>
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                    {sop.code.split('-')[1] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{sop.code}</span>
                      {getStatusBadge(sop.status)}
                      {sop.isMandatory && <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold">إلزامي</span>}
                    </div>
                    <p className="font-bold text-slate-800 text-sm mt-1">{sop.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-full hidden sm:inline">{getDeptName(sop.department)}</span>
                  <span className="text-[10px] text-slate-400 font-mono">v{sop.version}</span>
                  <div className="h-5 w-px bg-slate-200 mx-1" />
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(sop); }}
                    className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-all">
                    <Edit3 size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDuplicate(sop); }}
                    className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all">
                    <Copy size={13} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(sop); }}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all">
                    <Trash2 size={13} />
                  </button>
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedId === sop.id ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === sop.id && (
                <div className="px-5 pb-4 pt-0 border-t border-slate-100 animate-[fadeIn_0.2s_ease]">
                  <div className="grid sm:grid-cols-3 gap-4 mt-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">الوصف</p>
                      <p className="text-xs text-slate-600 mt-1">{sop.description}</p>
                      {sop.descriptionEn && <p className="text-[10px] text-slate-400 mt-0.5" dir="ltr">{sop.descriptionEn}</p>}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">التصنيف</p>
                      <p className="text-xs font-bold text-slate-600 mt-1">{sop.category}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">التواريخ</p>
                      <p className="text-xs text-slate-600 mt-1">التفعيل: {sop.effectiveDate}</p>
                      <p className="text-xs text-slate-600">المراجعة: {sop.reviewDate}</p>
                    </div>
                  </div>
                  {sop.tags && sop.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {sop.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden animate-[fadeIn_0.2s_ease] my-auto">
            {/* Modal Header */}
            <div className="bg-gradient-to-l from-indigo-500 to-indigo-700 p-6 text-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{editingSop ? 'تعديل SOP' : 'إضافة SOP جديد'}</h3>
                <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
              <p className="text-indigo-100 text-sm mt-1">{editingSop ? 'تحديث بيانات إجراء التشغيل القياسي' : 'إنشاء إجراء تشغيل قياسي جديد'}</p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="عنوان SOP (عربي)" required>
                  <Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="مثال: إجراءات تشغيل خط الإنتاج" />
                </Field>
                <Field label="عنوان SOP (English)">
                  <Input value={formData.titleEn} onChange={e => setFormData(p => ({ ...p, titleEn: e.target.value }))} placeholder="Example: Production Line SOP" dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="كود SOP" required>
                  <Input value={formData.code} onChange={e => setFormData(p => ({ ...p, code: e.target.value }))} placeholder="مثال: SOP-MFG-001" dir="ltr" />
                </Field>
                <Field label="رقم الإصدار">
                  <Input value={formData.version} onChange={e => setFormData(p => ({ ...p, version: e.target.value }))} placeholder="1.0" dir="ltr" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="الوصف (عربي)">
                  <Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} placeholder="وصف الإجراء..." rows={3} />
                </Field>
                <Field label="الوصف (English)">
                  <Textarea value={formData.descriptionEn} onChange={e => setFormData(p => ({ ...p, descriptionEn: e.target.value }))} placeholder="Procedure description..." dir="ltr" rows={3} />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="القسم">
                  <Select
                    value={formData.department}
                    onChange={val => setFormData(p => ({ ...p, department: val }))}
                    options={SOP_DEPARTMENTS.map(d => ({ value: d.key, label: d.nameAr }))}
                  />
                </Field>
                <Field label="التصنيف">
                  <Select
                    value={formData.category}
                    onChange={val => setFormData(p => ({ ...p, category: val }))}
                    options={SOP_CATEGORIES.map(c => ({ value: c.nameAr, label: c.nameAr }))}
                    placeholder="اختر التصنيف..."
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="رابط ملف PDF">
                  <Input value={formData.pdfUrl} onChange={e => setFormData(p => ({ ...p, pdfUrl: e.target.value }))} placeholder="https://..." dir="ltr" />
                </Field>
                <Field label="المدة المقدرة (بالدقائق)">
                  <Input value={formData.duration} onChange={e => setFormData(p => ({ ...p, duration: e.target.value }))} placeholder="30" dir="ltr" type="number" />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="تاريخ التفعيل">
                  <Input value={formData.effectiveDate} onChange={e => setFormData(p => ({ ...p, effectiveDate: e.target.value }))} type="date" />
                </Field>
                <Field label="تاريخ المراجعة القادم">
                  <Input value={formData.reviewDate} onChange={e => setFormData(p => ({ ...p, reviewDate: e.target.value }))} type="date" />
                </Field>
              </div>

              <Field label="الكلمات الدلالية (مفصولة بفاصلة)">
                <Input value={formData.tags} onChange={e => setFormData(p => ({ ...p, tags: e.target.value }))} placeholder="مثال: production, tablets, gmp" dir="ltr" />
              </Field>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="الحالة">
                  <Select
                    value={formData.status}
                    onChange={val => setFormData(p => ({ ...p, status: val as SOPStatus }))}
                    options={[
                      { value: 'active', label: 'نشط' },
                      { value: 'inactive', label: 'غير نشط' },
                      { value: 'draft', label: 'مسودة' },
                    ]}
                  />
                </Field>
                <div className="pt-6">
                  <Toggle
                    checked={formData.isMandatory}
                    onChange={val => setFormData(p => ({ ...p, isMandatory: val }))}
                    label={formData.isMandatory ? 'إلزامي للموظفين' : 'اختياري'}
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setShowModal(false); resetForm(); }}
                className="flex-1 px-4 py-3 border-2 border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">
                إلغاء
              </button>
              <button onClick={handleSave} disabled={saving}
                className={`
                  flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2
                  ${saving ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-l from-indigo-600 to-indigo-500 text-white shadow-lg hover:-translate-y-0.5'}
                `}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'حفظ...' : editingSop ? 'تحديث SOP' : 'إضافة SOP'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}