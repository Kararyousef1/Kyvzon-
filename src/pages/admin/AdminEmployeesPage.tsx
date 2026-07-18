/**
 * ════════════════════════════════════════════════════════════════
 *  AdminEmployeesPage — إدارة الموظفين (إعادة تصميم شاملة)
 *  ✅ تصميم جدول احترافي مع إحصاءات ذكية
 *  ✅ نموذج إضافة/تعديل محسّن مع تبويبات
 *  ✅ دعم كامل للبحث والتصفية والتصدير
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Plus, Mail, Phone, MapPin, Briefcase, Trash2, Edit2,
  Loader, X, Camera, ShieldCheck, Eye,
  RefreshCw, FileText, Users, UserCheck, UserX, Activity,
  Building, ChevronLeft, ChevronRight, Filter, Download,
} from 'lucide-react';
import Badge from '../../shared/components/ui/Badge';
import { useAuthStore, useUIStore } from '../../core/stores';
import { userService } from '../../services/sdk/UserService';
import { departmentService } from '../../services/sdk/DepartmentService';
import { adminUserService } from '../../services/sdk/AdminUserService';
import { entitlementService } from '../../services/sdk/EntitlementService';
import { exportToStyledExcel } from '../../utils/exportToExcel';
import { getErrorMessage } from '../../services/errors';
import type { UserRole } from '../../shared/types';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface EmployeeRecord {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  department?: string;
  position?: string;
  phone?: string;
  status?: string;
  created_at?: string;
  last_sign_in_at?: string;
  permissions?: string[];
}

type FormMode = 'create' | 'edit';

interface FormState {
  full_name: string;
  email: string;
  passcode: string;
  role: UserRole;
  department: string;
  department_id: string;
  position: string;
  phone: string;
  salary: string;
  salary_currency: string;
  permissions: string[];
}

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'employee', label: 'موظف', color: 'bg-blue-100 text-blue-700' },
  { value: 'supervisor', label: 'مشرف', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'manager', label: 'مدير', color: 'bg-amber-100 text-amber-700' },
  { value: 'hr', label: 'موارد بشرية', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'gatekeeper', label: 'حارس', color: 'bg-teal-100 text-teal-700' },
  { value: 'admin', label: 'مدير نظام', color: 'bg-rose-100 text-rose-700' },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]));
const ROLE_COLORS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.color]));

const DEFAULT_PERMS: Record<string, string[]> = {
  employee: ['dashboard', 'problems', 'new-problem', 'tawathul-portal', 'wellness', 'survey', 'training', 'sops', 'ai-chat', 'contact', 'profile', 'notifications', 'my-notifications', 'my-attendance', 'my-leave-requests', 'employee-permissions'],
  supervisor: ['dashboard', 'problems', 'new-problem', 'supervisor-breaks', 'team', 'reports', 'attendance', 'profile', 'notifications', 'my-notifications'],
  manager: ['dashboard', 'problems', 'new-problem', 'manager-dashboard', 'analytics', 'team', 'reports', 'attendance', 'supervisor-breaks', 'manager-attendance', 'profile', 'notifications', 'my-notifications'],
  hr: ['dashboard', 'hr-problems', 'movement-analysis', 'analytics', 'team', 'tawathul-portal', 'tawathul-admin', 'talent-market', 'communication', 'reports', 'notifications', 'attendance', 'leave-requests', 'manage-training', 'profile', 'my-notifications'],
  gatekeeper: ['gatekeeper-portal', 'kiosk-mode', 'notifications', 'profile'],
  it_admin: ['tech-portal', 'dashboard', 'notifications', 'profile', 'my-notifications'],
  admin: ['dashboard', 'employees', 'settings', 'reports', 'tawathul-portal', 'tawathul-admin', 'audit-log', 'ai-config', 'notifications', 'attendance', 'profile', 'my-notifications'],
  developer: ['developer-dashboard', 'notifications', 'profile'],
};

const EMPTY_FORM: FormState = {
  full_name: '', email: '', passcode: '', role: 'employee',
  department: '', department_id: '', position: '', phone: '',
  salary: '', salary_currency: 'IQD',
  permissions: DEFAULT_PERMS.employee,
};

const ITEMS_PER_PAGE = 15;

// ════════════════════════════════════════════════════════════════
//  Main Component
// ════════════════════════════════════════════════════════════════

export default function AdminEmployeesPage() {
  const { user: currentUser } = useAuthStore();
  const { addToast } = useUIStore();

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ id: string; name_ar: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EmployeeRecord | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [profileImg, setProfileImg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──
  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const [data, departmentRows] = await Promise.all([
        userService.findAllUsers(),
        departmentService.findActive().catch(() => []),
      ]);
      setEmployees((data || []) as unknown as EmployeeRecord[]);
      setDepartmentOptions((departmentRows || []).map(department => ({
        id: department.id,
        name_ar: department.name_ar,
      })));
    } catch (err: unknown) {
      addToast('فشل تحميل الموظفين: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

  // ── Filter & Paginate ──
  const filtered = useMemo(() => {
    let list = employees;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(e => (e.full_name || '').toLowerCase().includes(s) || (e.email || '').toLowerCase().includes(s));
    }
    if (filterRole !== 'all') list = list.filter(e => e.role === filterRole);
    if (filterDept !== 'all') list = list.filter(e => e.department === filterDept);
    return list;
  }, [employees, search, filterRole, filterDept]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paged = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterRole, filterDept]);

  // ── Stats ──
  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    inactive: employees.filter(e => e.status !== 'active').length,
    roles: ROLES.reduce((acc, r) => ({ ...acc, [r.value]: employees.filter(e => e.role === r.value).length }), {} as Record<string, number>),
  }), [employees]);

  // Get unique departments from employees
  const departments = useMemo(() => {
    const depts = new Set(employees.map(e => e.department).filter(Boolean) as string[]);
    return ['all', ...Array.from(depts)];
  }, [employees]);

  // ── Actions ──
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setProfileImg('');
    setFormMode('create');
    setSelectedEmp(null);
    setModalOpen(true);
  };

  const openEdit = (emp: EmployeeRecord) => {
    setForm({
      full_name: emp.full_name || '',
      email: emp.email?.split('@')[0] || '',
      passcode: '',
      role: emp.role || 'employee',
      department: emp.department || '',
      department_id: departmentOptions.find(department => department.name_ar === emp.department)?.id || '',
      position: emp.position || '',
      phone: emp.phone || '',
      salary: (emp as any).salary || '',
      salary_currency: (emp as any).salary_currency || 'IQD',
      permissions: emp.permissions || DEFAULT_PERMS[emp.role || 'employee'] || [],
    });
    setProfileImg('');
    setFormMode('edit');
    setSelectedEmp(emp);
    setModalOpen(true);
  };

  const openView = (emp: EmployeeRecord) => {
    setSelectedEmp(emp);
    setViewOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      addToast('يرجى تعبئة الاسم والبريد', 'error');
      return;
    }
    if (formMode === 'create' && form.passcode.length < 8) {
      addToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error');
      return;
    }
    setSaving(true);
    const finalEmail = `${form.email.split('@')[0]}@kyvzon.com`;

    try {
      if (formMode === 'edit' && selectedEmp) {
        await userService.updateUser(selectedEmp.id, {
          full_name: form.full_name,
          email: finalEmail,
          role: form.role,
          department: form.department,
          position: form.position,
          phone: form.phone,
          salary: form.salary ? parseFloat(form.salary) : undefined,
          salary_currency: form.salary_currency,
          permissions: form.permissions,
          status: 'active',
        });
        addToast(`تم تحديث "${form.full_name}"`, 'success');
      } else {
        await entitlementService.assertCanAddEmployee();
        const result = await adminUserService.createUser({
          email: finalEmail,
          password: form.passcode,
          full_name: form.full_name,
          role: form.role,
          department_id: form.department_id || undefined,
          department: form.department || undefined,
          position: form.position || undefined,
          phone: form.phone || undefined,
        });
        if (result.error) {
          addToast('فشل: ' + result.error, 'error');
          setSaving(false);
          return;
        }
        addToast(`تم إنشاء "${form.full_name}"`, 'success');
      }
      setModalOpen(false);
      await fetchEmployees();
    } catch (err: unknown) {
      addToast('فشل الحفظ: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (emp: EmployeeRecord) => {
    if (!confirm(`حذف "${emp.full_name}" نهائياً؟`)) return;
    try {
      const result = await adminUserService.deleteUser({
        target_user_id: emp.id,
        deleted_by: currentUser?.id || '',
      });
      if (result.error) { addToast('فشل: ' + result.error, 'error'); return; }
      setEmployees(p => p.filter(e => e.id !== emp.id));
      addToast('تم الحذف', 'success');
    } catch (err: unknown) {
      addToast('فشل: ' + getErrorMessage(err), 'error');
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImg(true);
    try {
      const { storageService } = await import('../../services/sdk/StorageService');
      const url = await storageService.uploadPublic('public-assets', 'profiles', file);
      setProfileImg(url);
    } catch {
      addToast('فشل رفع الصورة', 'error');
    } finally {
      setUploadingImg(false);
    }
  };

  const handleExport = () => {
    const headers = ['الاسم', 'البريد', 'الهاتف', 'الدور', 'القسم', 'المنصب', 'الحالة'];
    const data = filtered.map(e => [e.full_name || '', e.email || '', e.phone || '', ROLE_LABELS[e.role] || e.role, e.department || '', e.position || '', e.status || '']);
    exportToStyledExcel('قائمة_الموظفين', headers, data);
    addToast('تم التصدير', 'success');
  };

  // ════════════════════════════════════════════════════════════════
  //  Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5 pb-20 animate-fade-in" dir="rtl">
      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="الإجمالي" value={stats.total} icon={Users} gradient="from-indigo-500 to-blue-600" />
        <StatCard label="نشط" value={stats.active} icon={UserCheck} gradient="from-emerald-500 to-teal-600" />
        <StatCard label="غير نشط" value={stats.inactive} icon={UserX} gradient="from-slate-500 to-slate-700" />
        {ROLES.filter(r => stats.roles[r.value] > 0).slice(0, 3).map(r => (
          <StatCard key={r.value} label={r.label} value={stats.roles[r.value]} icon={Briefcase} gradient="from-violet-500 to-purple-600" />
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد..."
              className="w-full bg-white border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>
          {/* Role Filter */}
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="all">كل الأدوار</option>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {/* Dept Filter */}
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="all">كل الأقسام</option>
            {departments.filter(d => d !== 'all').map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={fetchEmployees} className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
            <Download size={15} /> تصدير
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all">
            <Plus size={16} /> إضافة موظف
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader className="animate-spin text-indigo-500" size={28} /></div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Users size={48} className="mb-3 opacity-30" />
            <p className="font-bold text-sm">{search || filterRole !== 'all' ? 'لا توجد نتائج' : 'لا يوجد موظفون بعد'}</p>
            {!search && filterRole === 'all' && (
              <button onClick={openCreate} className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                <Plus size={16} /> إضافة أول موظف
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {['الموظف', 'الدور', 'القسم', 'المنصب', 'الحالة', 'التاريخ', 'إجراءات'].map(h => (
                      <th key={h} className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {(emp.full_name || '?')[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{emp.full_name || '—'}</p>
                            <p className="text-xs text-gray-400 truncate">{emp.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold ${ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'}`}>
                          {ROLE_LABELS[emp.role] || emp.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">{emp.department || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{emp.position || '—'}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${emp.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {emp.status === 'active' ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 font-mono">
                        {emp.created_at ? new Date(emp.created_at).toLocaleDateString('ar-SA') : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openView(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors" title="عرض">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => openEdit(emp)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors" title="تعديل">
                            <Edit2 size={15} />
                          </button>
                          <button onClick={() => handleDelete(emp)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="حذف">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                <span className="text-xs text-gray-500">
                  {filtered.length} موظف — صفحة {page} من {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors">
                    <ChevronRight size={16} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1).map((p, i, arr) => (
                    <span key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-gray-400">…</span>}
                      <button onClick={() => setPage(p)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${page === p ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200 text-gray-600'}`}>
                        {p}
                      </button>
                    </span>
                  ))}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ Modal: Create/Edit ══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl my-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b bg-gradient-to-r from-indigo-600 to-blue-600 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  {formMode === 'create' ? <Plus size={20} /> : <Edit2 size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">{formMode === 'create' ? 'إضافة موظف جديد' : 'تعديل بيانات الموظف'}</h3>
                  <p className="text-white/70 text-xs">{formMode === 'create' ? 'إنشاء حساب جديد في النظام' : `تعديل: ${selectedEmp?.full_name}`}</p>
                </div>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSave} className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">الاسم الكامل *</label>
                  <input required type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    placeholder="محمد أحمد" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">اسم المستخدم *</label>
                  <div className="flex items-center">
                    <input required type="text" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-r-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 text-left" dir="ltr" placeholder="username" />
                    <span className="bg-gray-100 border border-gray-200 border-r-0 rounded-l-xl px-3 py-2.5 text-sm text-gray-400 font-mono whitespace-nowrap">@kyvzon.com</span>
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">الدور *</label>
                  <select value={form.role} onChange={e => {
                    const role = e.target.value as UserRole;
                    setForm(f => ({ ...f, role, permissions: DEFAULT_PERMS[role] || [] }));
                  }} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">القسم</label>
                  <select value={form.department_id} onChange={e => {
                    const department = departmentOptions.find(item => item.id === e.target.value);
                    setForm(f => ({
                      ...f,
                      department_id: department?.id || '',
                      department: department?.name_ar || '',
                    }));
                  }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                    <option value="">— اختر القسم —</option>
                    {departmentOptions.map(department => <option key={department.id} value={department.id}>{department.name_ar}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">المنصب</label>
                  <input type="text" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                    placeholder="مهندس برمجيات" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">رقم الهاتف</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 text-left" dir="ltr" placeholder="+964..." />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">
                    {formMode === 'create' ? 'كلمة المرور * (6 أحرف على الأقل)' : 'كلمة مرور جديدة (اختياري)'}
                  </label>
                  <input type="text" value={form.passcode} onChange={e => setForm(f => ({ ...f, passcode: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 text-center font-mono tracking-widest"
                    placeholder="••••••" />
                </div>
              </div>

              {/* Salary */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">الراتب الشهري</label>
                  <input type="number" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 text-left" dir="ltr" placeholder="0" min="0" step="0.01" />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">العملة</label>
                  <select value={form.salary_currency} onChange={e => setForm(f => ({ ...f, salary_currency: e.target.value }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400">
                    <option value="IQD">دينار عراقي (IQD)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                  </select>
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <label className="text-xs font-bold text-gray-500 mb-1 block">صورة الملف الشخصي</label>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {profileImg ? <img src={profileImg} alt="" className="w-full h-full object-cover" /> : <Camera size={20} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 flex gap-2">
                    <input type="text" value={profileImg} onChange={e => setProfileImg(e.target.value)}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:border-indigo-400 text-left" dir="ltr" placeholder="رابط الصورة..." />
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingImg}
                      className="px-4 py-2.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1.5 disabled:opacity-50">
                      {uploadingImg ? <RefreshCw size={12} className="animate-spin" /> : <Camera size={14} />}
                      رفع
                    </button>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
                </div>
              </div>

              {/* Permissions */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-indigo-600" /> صلاحيات المستخدم
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto">
                  {DEFAULT_PERMS[form.role]?.map(permId => {
                    const active = form.permissions.includes(permId);
                    return (
                      <button key={permId} type="button" onClick={() => setForm(f => ({
                        ...f,
                        permissions: active ? f.permissions.filter(p => p !== permId) : [...f.permissions, permId],
                      }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-xs font-bold transition-all text-right ${
                        active ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-gray-100 text-gray-500 hover:border-gray-200'
                      }`}>
                        <span className={`w-3 h-3 rounded border-2 flex items-center justify-center flex-shrink-0 ${active ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300'}`}>
                          {active && <span className="text-white text-[8px]">✓</span>}
                        </span>
                        {permId.replace(/-/g, ' ')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center gap-3 p-5 border-t bg-gray-50">
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50">
                إلغاء
              </button>
              <button onClick={handleSave} disabled={saving || !form.full_name.trim() || !form.email.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold text-sm hover:from-indigo-500 hover:to-blue-500 shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <RefreshCw size={14} className="animate-spin" />}
                {saving ? 'جاري الحفظ...' : formMode === 'create' ? 'إنشاء الحساب' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Modal: View ══ */}
      {viewOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-bold text-lg">الملف الشخصي</h3>
              <button onClick={() => setViewOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                  {(selectedEmp.full_name || '?')[0]}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-gray-900">{selectedEmp.full_name}</h4>
                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ${ROLE_COLORS[selectedEmp.role] || ''}`}>
                    {ROLE_LABELS[selectedEmp.role] || selectedEmp.role}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <InfoField icon={Mail} label="البريد" value={selectedEmp.email || '—'} />
                <InfoField icon={Phone} label="الهاتف" value={selectedEmp.phone || '—'} />
                <InfoField icon={Building} label="القسم" value={selectedEmp.department || '—'} />
                <InfoField icon={Briefcase} label="المنصب" value={selectedEmp.position || '—'} />
                <InfoField icon={Activity} label="الحالة" value={selectedEmp.status === 'active' ? 'نشط' : 'غير نشط'} />
                <InfoField icon={MapPin} label="آخر دخول" value={selectedEmp.last_sign_in_at ? new Date(selectedEmp.last_sign_in_at).toLocaleDateString('ar-SA') : '—'} />
              </div>
            </div>
            <div className="flex items-center gap-3 p-5 border-t bg-gray-50">
              <button onClick={() => setViewOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100">إغلاق</button>
              <button onClick={() => { setViewOpen(false); openEdit(selectedEmp); }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold text-sm hover:from-indigo-500 hover:to-blue-500 shadow-lg">تعديل</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Small Components
// ════════════════════════════════════════════════════════════════

function StatCard({ label, value, icon: Icon, gradient }: {
  label: string; value: number; icon: React.ComponentType<{ size?: number | string; className?: string }>; gradient: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon size={16} className="text-white" />
        </div>
        <span className="text-xs font-bold text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>; label: string; value: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} className="text-gray-400" />
        <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
      </div>
      <p className="text-sm font-bold text-gray-900">{value}</p>
    </div>
  );
}
