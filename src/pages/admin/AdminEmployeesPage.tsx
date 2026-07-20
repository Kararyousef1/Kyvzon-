/**
 * AdminEmployeesPage — إدارة موظفين متقدمة مع معالج خطوات (Step-by-Step Wizard) وصلاحيات مالية
 *
 * الإصلاحات:
 *  - localStorage مُستبدل بـ getCurrentTenantId() من BaseService
 *  - filterEntity مفعّل فعلياً في الـ filtered useMemo
 *  - page تُصفَّر عند تغيير search أو filterRole
 *  - كلمة مرور Bulk Import عشوائية لكل مستخدم
 *  - CSV parser يتعامل مع الفاصلات داخل الأسماء
 *  - handleDelete منفصلة عن JSX
 *  - confirm() مُستبدل بـ dialog تأكيد مخصص
 *  - race condition في تحقق البريد: تُضاف server-side check
 *  - استعلامات cost_centers و finance_projects محمية بـ tenant_id
 *  - إزالة imports غير مستخدمة
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Plus, Trash2, Edit2, Loader, X, Eye, RefreshCw, Users, ChevronLeft, ChevronRight, Upload, Landmark, Check, ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { useTenantModules } from '../../shared/hooks/useTenantModules';
import { userService } from '../../services/sdk/UserService';
import { departmentService } from '../../services/sdk/DepartmentService';
import { branchService } from '../../services/sdk/BranchService';
import { adminUserService } from '../../services/sdk/AdminUserService';
import { entitlementService } from '../../services/sdk/EntitlementService';
import { legalEntityService, type LegalEntityRecord } from '../../services/sdk/FinanceFoundationService';
import { getCurrentTenantId } from '../../services/sdk/BaseService';
import { supabase } from '../../services/supabase/supabase';
import { getErrorMessage } from '../../services/errors';
import type { UserRole } from '../../shared/types';

type FinanceRole = 'viewer' | 'accountant' | 'approver' | 'finance_manager' | 'entity_admin';

const FINANCE_ROLES: { value: FinanceRole; label: string; desc: string; color: string }[] = [
  { value: 'viewer',         label: 'مشاهد',       desc: 'يرى التقارير، ميزان المراجعة، دفتر الأستاذ — لا ينشئ ولا يرحل',              color: 'bg-slate-100 text-slate-700'  },
  { value: 'accountant',     label: 'محاسب',       desc: 'ينشئ قيود مسودة + فواتير AP/AR مسودة + يرى التقارير',                        color: 'bg-blue-100 text-blue-700'    },
  { value: 'approver',       label: 'معتمد',       desc: 'يعتمد قيود + فواتير + يرى كل شيء',                                           color: 'bg-amber-100 text-amber-700'  },
  { value: 'finance_manager',label: 'مدير مالي',   desc: 'يغلق فترات، يدير دليل الحسابات، يعتمد، يرحل، يرى P&L',                     color: 'bg-violet-100 text-violet-700'},
  { value: 'entity_admin',   label: 'إداري كيان',  desc: 'كل شيء في الكيان: CoA، فترات، قيود، تقارير، إعدادات، توحيد',              color: 'bg-emerald-100 text-emerald-700'},
];

const ROLES: { value: string; label: string; color: string }[] = [
  { value: 'employee',   label: 'موظف',          color: 'bg-blue-100 text-blue-700'    },
  { value: 'supervisor', label: 'مشرف',          color: 'bg-cyan-100 text-cyan-700'    },
  { value: 'manager',    label: 'مدير',          color: 'bg-amber-100 text-amber-700'  },
  { value: 'hr',         label: 'موارد بشرية',   color: 'bg-emerald-100 text-emerald-700'},
  { value: 'gatekeeper', label: 'حارس',          color: 'bg-teal-100 text-teal-700'   },
  { value: 'admin',      label: 'مدير نظام',     color: 'bg-rose-100 text-rose-700'   },
  { value: 'finance',    label: 'مسؤول مالية',   color: 'bg-violet-100 text-violet-700'},
  { value: 'tech',       label: 'تقني / IT',     color: 'bg-cyan-100 text-cyan-700'   },
];

const ROLE_LABELS: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.label]));

const ROLE_MODULE_MAP: Record<string, string> = {
  employee: 'employee', supervisor: 'supervisor', manager: 'manager',
  hr: 'hr', gatekeeper: 'gatekeeper', admin: 'admin', finance: 'finance', tech: 'tech_portal',
};

const PORTAL_PAGES = [
  {
    portalLabel: 'بوابة الموظف', moduleKey: 'employee',
    pages: [
      { id: 'employee-dashboard', label: 'الرئيسية' }, { id: 'employee-problems', label: 'البلاغات' },
      { id: 'new-problem', label: 'بلاغ جديد' }, { id: 'employee-attendance', label: 'سجل الحضور' },
      { id: 'employee-requests', label: 'طلباتي' }, { id: 'employee-training', label: 'التدريب' },
      { id: 'employee-goals', label: 'أهدافي ومهاراتي' }, { id: 'employee-sops', label: 'دليل الإجراءات' },
      { id: 'employee-ai-chat', label: 'المساعد الذكي' }, { id: 'employee-wellness', label: 'الصحة النفسية' },
      { id: 'employee-survey', label: 'الاستبيانات' }, { id: 'employee-contact', label: 'مركز خدمات HR' },
      { id: 'employee-profile', label: 'حسابي' }, { id: 'employee-payroll', label: 'رواتبي' },
      { id: 'employee-loans', label: 'سلفي' }, { id: 'employee-expenses', label: 'نفقاتي' },
    ],
  },
  {
    portalLabel: 'بوابة الموارد البشرية (HR)', moduleKey: 'hr',
    pages: [
      { id: 'hr-dashboard', label: 'الرئيسية' }, { id: 'hr-problems', label: 'البلاغات' },
      { id: 'hr-analytics', label: 'التحليلات' }, { id: 'hr-team', label: 'إدارة الموظفين' },
      { id: 'hr-reports', label: 'التقارير' }, { id: 'hr-attendance', label: 'سجلات الحضور' },
      { id: 'hr-talent-market', label: 'سجل المؤهلات' }, { id: 'hr-movement-analysis', label: 'تحليل الحركة' },
      { id: 'hr-manage-training', label: 'إدارة التدريب' }, { id: 'hr-training-reports', label: 'تقارير التدريب' },
      { id: 'hr-payroll', label: 'الرواتب' }, { id: 'hr-loans', label: 'السلف والقروض' },
      { id: 'hr-bonuses', label: 'الجوائز والمكافآت' }, { id: 'hr-expenses', label: 'طلبات النفقات' },
      { id: 'hr-recruitment', label: 'التوظيف' }, { id: 'hr-onboarding', label: 'التعريف وإنهاء الخدمة' },
      { id: 'hr-documents', label: 'مستندات الموظفين' }, { id: 'hr-contracts', label: 'عقود الموظفين' },
      { id: 'hr-succession', label: 'تخطيط التعاقب' }, { id: 'hr-performance', label: 'تقييم الأداء' },
      { id: 'hr-disciplinary', label: 'الإجراءات التأديبية' }, { id: 'hr-shifts', label: 'جدولة الورديات' },
      { id: 'hr-health-safety', label: 'الصحة والسلامة' }, { id: 'hr-communication', label: 'صندوق الرسائل' },
      { id: 'hr-service-center', label: 'مركز خدمات HR' }, { id: 'hr-sops', label: 'إدارة SOP' },
    ],
  },
  {
    portalLabel: 'بوابة الإدارة (Admin)', moduleKey: 'admin',
    pages: [
      { id: 'admin-dashboard', label: 'الرئيسية' }, { id: 'admin-employees', label: 'إدارة الموظفين' },
      { id: 'admin-settings', label: 'إعدادات النظام' }, { id: 'admin-company-profile', label: 'ملف الشركة' },
      { id: 'admin-branches', label: 'الفروع' }, { id: 'admin-org-structure', label: 'الهيكل التنظيمي' },
      { id: 'admin-compliance', label: 'مركز الامتثال' }, { id: 'admin-ai-config', label: 'إعدادات AI' },
      { id: 'admin-reports', label: 'تقارير النظام' }, { id: 'admin-sops-reports', label: 'تقارير SOP' },
      { id: 'admin-audit-log', label: 'سجل العمليات' },
    ],
  },
  {
    portalLabel: 'بوابة المشرف (Supervisor)', moduleKey: 'supervisor',
    pages: [
      { id: 'supervisor-dashboard', label: 'الرئيسية' }, { id: 'supervisor-breaks', label: 'تسجيل الخروج' },
      { id: 'supervisor-shift', label: 'إدارة الوردية' }, { id: 'supervisor-tasks', label: 'المهام اليومية' },
      { id: 'supervisor-checklists', label: 'قوائم الفحص' },
    ],
  },
  {
    portalLabel: 'بوابة المدير (Manager)', moduleKey: 'manager',
    pages: [
      { id: 'manager-dashboard', label: 'الرئيسية' }, { id: 'manager-attendance', label: 'حضور الفريق' },
      { id: 'manager-approvals', label: 'مركز الموافقات' }, { id: 'manager-performance', label: 'أداء الفريق' },
      { id: 'manager-workload', label: 'عبء العمل' },
    ],
  },
  {
    portalLabel: 'بوابة الأمن والحراسة (Gatekeeper)', moduleKey: 'gatekeeper',
    pages: [
      { id: 'gatekeeper-portal', label: 'تسجيل الدخول والخروج' },
      { id: 'gatekeeper-movements', label: 'بوابة الحركة' },
      { id: 'kiosk-mode', label: 'محطة التسجيل الذاتي' },
    ],
  },
  {
    portalLabel: 'البوابة التقنية (IT)', moduleKey: 'tech_portal',
    pages: [
      { id: 'tech-dashboard', label: 'لوحة التحكم التقنية' },
      { id: 'biometric-devices', label: 'إدارة أجهزة البصمة' },
      { id: 'sync-logs', label: 'سجل المزامنة' },
      { id: 'attendance-analytics', label: 'تحليلات الحضور التقنية' },
      { id: 'system-health', label: 'صحة النظام' },
      { id: 'security-events', label: 'الأحداث الأمنية' },
      { id: 'tech-settings', label: 'الإعدادات التقنية' },
    ],
  },
  {
    portalLabel: 'بوابة المالية (Finance)', moduleKey: 'finance',
    pages: [
      { id: 'finance-dashboard', label: 'الدفتر العام' }, { id: 'finance-coa', label: 'دليل الحسابات' },
      { id: 'finance-journal', label: 'قيود اليومية' }, { id: 'finance-trial-balance', label: 'ميزان المراجعة' },
      { id: 'finance-ledger', label: 'دفتر الأستاذ' }, { id: 'finance-reports', label: 'التقارير المالية' },
      { id: 'finance-periods', label: 'الفترات المحاسبية' }, { id: 'finance-vendors', label: 'الموردين' },
      { id: 'finance-payable', label: 'الحسابات الدائنة' }, { id: 'finance-setup', label: 'إعداد المالية' },
    ],
  },
  {
    portalLabel: 'بوابة التواصل (Tawathul)', moduleKey: 'tawathul',
    pages: [
      { id: 'tawathul-portal', label: 'بوابة التواصل' },
      { id: 'tawathul-admin', label: 'إعدادات التواصل' },
    ],
  },
];

// ─── توليد كلمة مرور عشوائية آمنة ────────────────────────────────────────────
function generateTempPassword(): string {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const spec   = '!@#$';
  const all    = upper + lower + digits + spec;
  const arr    = crypto.getRandomValues(new Uint8Array(12));
  let pw = upper[arr[0] % upper.length] + lower[arr[1] % lower.length] + digits[arr[2] % digits.length] + spec[arr[3] % spec.length];
  for (let i = 4; i < 12; i++) pw += all[arr[i] % all.length];
  return pw.split('').sort(() => Math.random() - 0.5).join('');
}

// ─── CSV parser يتعامل مع الفاصلات داخل الأسماء ──────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

// ─── Dialog تأكيد الحذف ───────────────────────────────────────────────────────
interface DeleteDialogProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}
function DeleteConfirmDialog({ name, onConfirm, onCancel, loading }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-red-100 overflow-hidden">
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-black text-lg text-slate-900">تأكيد الحذف النهائي</h3>
            <p className="text-sm text-slate-500 mt-1">سيتم حذف <span className="font-bold text-slate-800">{name}</span> بشكل كامل من النظام ولا يمكن التراجع.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">إلغاء</button>
            <button onClick={onConfirm} disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-500 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <RefreshCw size={14} className="animate-spin" />}
              {loading ? 'جاري الحذف...' : 'حذف نهائي'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Initial form state ───────────────────────────────────────────────────────
const EMPTY_FORM = {
  full_name: '', email: '', passcode: '', role: 'employee' as UserRole,
  department: '', department_id: '', position: '', phone: '',
  branch_id: '', shift_code: '', status: 'active',
  allowed_pages: [] as string[],
  finance: {
    legal_entity_id: '', finance_role: 'viewer' as FinanceRole,
    canPostJE: false, canClosePeriod: false, canManageCoA: false,
    canViewPL: true, canExport: true,
    cost_centers: [] as string[], projects: [] as string[],
  },
};

const ITEMS_PER_PAGE = 15;

export default function AdminEmployeesPage() {
  const { user: currentUser } = useAuthStore();
  const { addToast } = useUIStore();
  const { isEnabled, enabledPages, subscriptionPlan } = useTenantModules();

  // ─── State ────────────────────────────────────────────────────────────────
  const [employees,       setEmployees]       = useState<any[]>([]);
  const [departments,     setDepartments]     = useState<any[]>([]);
  const [branches,        setBranches]        = useState<any[]>([]);
  const [legalEntities,   setLegalEntities]   = useState<LegalEntityRecord[]>([]);
  const [costCenters,     setCostCenters]     = useState<any[]>([]);
  const [projects,        setProjects]        = useState<any[]>([]);
  const [allMemberships,  setAllMemberships]  = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [usage,           setUsage]           = useState<any>(null);

  const [search,       setSearch]       = useState('');
  const [filterRole,   setFilterRole]   = useState('all');
  const [filterEntity, setFilterEntity] = useState('all');
  const [page,         setPage]         = useState(1);

  const [modalOpen,    setModalOpen]    = useState(false);
  const [viewOpen,     setViewOpen]     = useState(false);
  const [selectedEmp,  setSelectedEmp]  = useState<any>(null);
  const [formMode,     setFormMode]     = useState<'create' | 'edit'>('create');
  const [wizardStep,   setWizardStep]   = useState<1 | 2 | 3>(1);
  const [saving,       setSaving]       = useState(false);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });

  const [deleteTarget,  setDeleteTarget]  = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showBulk,      setShowBulk]      = useState(false);
  const [bulkFile,      setBulkFile]      = useState<File | null>(null);
  const [bulkPreview,   setBulkPreview]   = useState<any[]>([]);
  const [bulkProgress,  setBulkProgress]  = useState<{ done: number; total: number; errors: any[] } | null>(null);

  const [entityMemberships, setEntityMemberships] = useState<any[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ─── Computed ─────────────────────────────────────────────────────────────
  const visibleRoles = useMemo(() =>
    ROLES.filter(r => { const m = ROLE_MODULE_MAP[r.value]; return !m || isEnabled(m); }),
    [isEnabled],
  );

  const visiblePortals = useMemo(() =>
    PORTAL_PAGES
      .filter(p => !p.moduleKey || isEnabled(p.moduleKey))
      .map(portal => subscriptionPlan === 'hybrid' && Array.isArray(enabledPages)
        ? { ...portal, pages: portal.pages.filter(pg => enabledPages.includes(pg.id)) }
        : portal,
      )
      .filter(portal => portal.pages.length > 0),
    [isEnabled, subscriptionPlan, enabledPages],
  );

  // ─── fetchAll ─────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const tenantId = getCurrentTenantId();
      const [emps, depts, brs, entities, cc, projs, usageData, memberships] = await Promise.all([
        userService.findAllUsers(),
        departmentService.findActive().catch(() => []),
        branchService.findAll({ orderBy: 'name_ar' }).catch(() => []),
        legalEntityService.findActive().catch(() => []),
        (async () => {
          if (!tenantId) return [];
          const { data } = await supabase.from('cost_centers').select('id, name_ar, code').eq('tenant_id', tenantId).limit(50);
          return data || [];
        })(),
        (async () => {
          if (!tenantId) return [];
          const { data } = await supabase.from('finance_projects').select('id, name_ar, code').eq('tenant_id', tenantId).limit(50);
          return data || [];
        })(),
        entitlementService.getUsage().catch(() => null),
        (async () => {
          if (!tenantId) return [];
          const { data } = await supabase.from('entity_memberships').select('user_id, legal_entity_id, finance_role, is_active').eq('tenant_id', tenantId);
          return data || [];
        })(),
      ]);
      setEmployees(emps || []);
      setDepartments(depts || []);
      setBranches(brs || []);
      setLegalEntities(entities as any || []);
      setCostCenters(cc as any);
      setProjects(projs as any);
      setUsage(usageData);
      setAllMemberships(memberships as any);
    } catch (err) {
      addToast('فشل التحميل: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void fetchAll(); return () => abortRef.current?.abort(); }, [fetchAll]);

  // ─── صفّر الصفحة عند تغيير فلتر البحث أو الدور أو الكيان ─────────────────
  useEffect(() => { setPage(1); }, [search, filterRole, filterEntity]);

  // ─── filtered + paged ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = employees;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((e: any) =>
        (e.full_name || '').toLowerCase().includes(s) ||
        (e.email || '').toLowerCase().includes(s),
      );
    }
    if (filterRole !== 'all') {
      list = list.filter((e: any) => e.role === filterRole);
    }
    // ✅ filterEntity مُفعَّل فعلياً
    if (filterEntity !== 'all') {
      const userIdsInEntity = new Set(
        allMemberships
          .filter((m: any) => m.legal_entity_id === filterEntity && m.is_active)
          .map((m: any) => m.user_id),
      );
      list = list.filter((e: any) => userIdsInEntity.has(e.id));
    }
    return list;
  }, [employees, search, filterRole, filterEntity, allMemberships]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paged      = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ─── Modal helpers ─────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM, finance: { ...EMPTY_FORM.finance, legal_entity_id: legalEntities[0]?.id || '' } });
    setFormMode('create');
    setSelectedEmp(null);
    setWizardStep(1);
    setModalOpen(true);
  };

  const openEdit = async (emp: any) => {
    setForm({
      full_name:    emp.full_name || '',
      email:        emp.email?.split('@')[0] || '',
      passcode:     '',
      role:         emp.role || 'employee',
      department:   emp.department || '',
      department_id:'',
      position:     emp.position || '',
      phone:        emp.phone || '',
      branch_id:    emp.branch_id || '',
      shift_code:   '',
      status:       emp.status || 'active',
      allowed_pages: emp.custom_permissions?.allowed_pages || [],
      finance: { ...EMPTY_FORM.finance },
    });
    setFormMode('edit');
    setSelectedEmp(emp);
    setWizardStep(1);
    setModalOpen(true);
    try {
      const { data } = await supabase
        .from('entity_memberships')
        .select('*, legal_entities!inner(name_ar, code)')
        .eq('user_id', emp.id);
      setEntityMemberships(data || []);
      if (data && data.length > 0) {
        const first = data[0] as any;
        setForm(f => ({ ...f, finance: { ...f.finance, legal_entity_id: first.legal_entity_id, finance_role: first.finance_role } }));
      }
    } catch { /* silent */ }
  };

  const openView = async (emp: any) => {
    setSelectedEmp(emp);
    setViewOpen(true);
    try {
      const { data } = await supabase
        .from('entity_memberships')
        .select('*, legal_entities!inner(name_ar, code)')
        .eq('user_id', emp.id);
      setEntityMemberships(data || []);
    } catch { /* silent */ }
  };

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!form.full_name.trim()) { addToast('الاسم الكامل مطلوب', 'error'); return false; }
    if (!form.email.trim())     { addToast('البريد الإلكتروني مطلوب', 'error'); return false; }
    if (formMode === 'create' && form.passcode.length < 8) {
      addToast('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'error'); return false;
    }
    // تحقق client-side (للسرعة) — server-side يتحقق أيضاً في Edge Function
    const finalEmail = `${form.email.split('@')[0]}@kyvzon.com`.toLowerCase();
    const emailExists = employees.some((e: any) =>
      e.email?.toLowerCase() === finalEmail &&
      (formMode === 'create' || e.id !== selectedEmp?.id),
    );
    if (emailExists) { addToast('البريد الإلكتروني مستخدم بالفعل', 'error'); return false; }

    const nameExists = employees.some((e: any) =>
      e.full_name?.trim().toLowerCase() === form.full_name.trim().toLowerCase() &&
      (formMode === 'create' || e.id !== selectedEmp?.id),
    );
    if (nameExists) { addToast('اسم الموظف مكرر بالفعل', 'error'); return false; }
    return true;
  };

  const validateStep2 = () => {
    if (!form.role) { addToast('دور HR مطلوب', 'error'); return false; }
    return true;
  };

  // ─── handleSave ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validateStep1() || !validateStep2()) return;
    const tenantId = getCurrentTenantId();
    setSaving(true);
    try {
      if (formMode === 'edit' && selectedEmp) {
        await userService.updateUser(selectedEmp.id, {
          full_name:  form.full_name,
          role:       form.role,
          department: form.department,
          position:   form.position,
          phone:      form.phone,
          status:     form.status,
        } as any);

        // حفظ custom_permissions
        const currentCustom = selectedEmp.custom_permissions || {};
        await supabase.from('profiles').update({
          custom_permissions: { ...currentCustom, allowed_pages: form.allowed_pages },
        }).eq('id', selectedEmp.id);

        // مزامنة حالة Auth إذا تغيرت
        if (form.status !== selectedEmp.status) {
          await adminUserService.toggleUserStatus(selectedEmp.id, form.status === 'inactive', currentUser?.id || '');
        }

        // entity_membership
        if (form.finance.legal_entity_id && tenantId) {
          const { data: existing } = await supabase
            .from('entity_memberships').select('id')
            .eq('user_id', selectedEmp.id)
            .eq('legal_entity_id', form.finance.legal_entity_id)
            .maybeSingle();
          if (existing) {
            await supabase.from('entity_memberships')
              .update({ finance_role: form.finance.finance_role, is_active: true })
              .eq('id', (existing as any).id);
          } else {
            await supabase.from('entity_memberships').insert({
              tenant_id:       tenantId,
              legal_entity_id: form.finance.legal_entity_id,
              user_id:         selectedEmp.id,
              finance_role:    form.finance.finance_role,
              is_active:       true,
            });
          }
        }

        addToast(`تم تحديث ${form.full_name}`, 'success');
      } else {
        // ─── Create ──────────────────────────────────────────────────────
        await entitlementService.assertCanAddEmployee();
        const finalEmail = `${form.email.split('@')[0]}@kyvzon.com`;
        const result = await adminUserService.createUser({
          email:          finalEmail,
          password:       form.passcode,
          full_name:      form.full_name,
          role:           form.role,
          department_id:  form.department_id || undefined,
          phone:          form.phone || undefined,
          finance_role:   form.finance.legal_entity_id ? form.finance.finance_role : undefined,
          legal_entity_id:form.finance.legal_entity_id || undefined,
        } as any);

        if (result.error) {
          addToast('فشل: ' + result.error, 'error');
          setSaving(false);
          return;
        }

        const newUserId = result.data?.user_id || (result as any).user_id;
        if (newUserId) {
          await supabase.from('profiles').update({
            custom_permissions: {
              branch_id:    form.branch_id || null,
              shift_code:   form.shift_code || null,
              cost_centers: form.finance.cost_centers,
              projects:     form.finance.projects,
              allowed_pages:form.allowed_pages,
            },
          }).eq('id', newUserId);

          if (form.finance.legal_entity_id && tenantId) {
            await supabase.from('entity_memberships').insert({
              tenant_id:       tenantId,
              legal_entity_id: form.finance.legal_entity_id,
              user_id:         newUserId,
              finance_role:    form.finance.finance_role,
              is_active:       true,
            });
          }
        }

        addToast(`تم إنشاء ${form.full_name} بنجاح ✅`, 'success');
      }

      setModalOpen(false);
      await fetchAll();
    } catch (err) {
      addToast('فشل: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── handleDelete ─────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const result = await adminUserService.deleteUser({
        target_user_id: deleteTarget.id,
        deleted_by:     currentUser?.id || '',
        reason:         'حذف من لوحة الإدارة',
      });
      if (result.error) {
        addToast('فشل الحذف: ' + result.error, 'error');
      } else {
        addToast(`تم حذف ${deleteTarget.full_name} بنجاح ✅`, 'success');
        setDeleteTarget(null);
        await fetchAll();
      }
    } catch (err: any) {
      addToast('فشل الحذف: ' + err.message, 'error');
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Bulk Import ──────────────────────────────────────────────────────────
  const handleBulkPreview = async (file: File) => {
    const text  = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const preview = lines.slice(1, 6).map((line, idx) => {
      const vals = parseCSVLine(line);
      const obj: any = { _row: idx + 2 };
      headers.forEach((h, i) => (obj[h] = vals[i]));
      return obj;
    });
    setBulkPreview(preview);
  };

  const downloadCSVTemplate = () => {
    const csv = '\uFEFFfull_name,email,role,phone\nأحمد محمد,ahmed.mohammed,employee,07901234567\nسارة علي,sara.ali,hr,07801234567';
    const a   = document.createElement('a');
    a.href    = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download= 'kyvzon_employees_template.csv';
    a.click();
  };

  const handleBulkImport = async () => {
    if (!bulkFile) return;
    const text    = await bulkFile.text();
    const lines   = text.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const rows    = lines.slice(1).map(line => {
      const vals = parseCSVLine(line);
      const obj: any = {};
      headers.forEach((h, i) => (obj[h] = vals[i]));
      return obj;
    });

    // حد أقصى 500 موظف لتجنب rate limit
    const MAX_BULK = 500;
    if (rows.length > MAX_BULK) {
      addToast(`الحد الأقصى للاستيراد الجماعي هو ${MAX_BULK} موظف`, 'error');
      return;
    }

    setBulkProgress({ done: 0, total: rows.length, errors: [] });
    let done = 0;
    const errors: any[] = [];

    for (const row of rows) {
      try {
        if (!row.email || !row.full_name) throw new Error('بريد واسم مطلوبان');
        // ✅ كلمة مرور عشوائية لكل مستخدم
        const password = row.password || generateTempPassword();
        await adminUserService.createUser({
          email:     row.email.includes('@') ? row.email : `${row.email}@kyvzon.com`,
          password,
          full_name: row.full_name,
          role:      row.role || 'employee',
        } as any);
        done++;
      } catch (e: any) {
        errors.push({ row, error: e.message });
      }
      setBulkProgress({ done, total: rows.length, errors });
      await new Promise(r => setTimeout(r, 300));
    }

    addToast(`تم استيراد ${done}/${rows.length}`, done === rows.length ? 'success' : 'warning');
    await fetchAll();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-20" dir="rtl">

      {/* Delete Confirm Dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          name={deleteTarget.full_name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users size={24} className="text-indigo-600 flex-shrink-0" />
            إدارة الموظفين والوصول المؤسسي
          </h2>
          <p className="text-sm text-slate-500 mt-1">إضافة مستخدمين عبر معالج خطوات متسلسل مع دعم صلاحيات الكيانات المالية والبوابات</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowBulk(true)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50">
            <Upload size={14} />استيراد جماعي CSV
          </button>
          <button onClick={openCreate} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-lg shadow-indigo-500/25">
            <Plus size={14} />إضافة موظف جديد
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border rounded-2xl p-4">
          <p className="text-2xl font-black">
            {employees.length}
            {usage && <span className="text-xs text-slate-400 font-normal"> / {usage.limits.maxEmployees}</span>}
          </p>
          <p className="text-xs text-slate-500">إجمالي المستخدمين</p>
          {usage && (
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
              <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(100, (employees.length / usage.limits.maxEmployees) * 100)}%` }} />
            </div>
          )}
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <p className="text-2xl font-black text-emerald-600">{employees.filter((e: any) => e.status === 'active').length}</p>
          <p className="text-xs text-slate-500">نشطون</p>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <p className="text-2xl font-black text-violet-600">{legalEntities.length}</p>
          <p className="text-xs text-slate-500">الكيانات المالية</p>
        </div>
        <div className="bg-white border rounded-2xl p-4">
          <p className="text-2xl font-black text-blue-600">{employees.filter((e: any) => ['admin', 'hr', 'manager'].includes(e.role)).length}</p>
          <p className="text-xs text-slate-500">المسؤولون والإداريون</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-2xl p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو البريد..." className="w-full pr-10 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500" />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="px-4 py-2.5 bg-slate-50 border rounded-xl text-sm">
          <option value="all">كل الأدوار</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filterEntity} onChange={e => setFilterEntity(e.target.value)} className="px-4 py-2.5 bg-slate-50 border rounded-xl text-sm">
          <option value="all">كل الكيانات</option>
          {legalEntities.map(le => <option key={le.id} value={le.id}>{le.code} — {le.name_ar}</option>)}
        </select>
        <button onClick={() => fetchAll()} className="px-4 py-2.5 bg-white border rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-50">
          <RefreshCw size={14} />تحديث
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader size={32} className="animate-spin text-indigo-600" /></div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b">
                <tr className="text-right text-xs font-bold text-slate-500">
                  <th className="py-3.5 px-5">الموظف</th>
                  <th className="py-3.5 px-5">الدور</th>
                  <th className="py-3.5 px-5">القسم</th>
                  <th className="py-3.5 px-5">الوصول المالي</th>
                  <th className="py-3.5 px-5">الحالة</th>
                  <th className="py-3.5 px-5">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((emp: any) => (
                  <tr key={emp.id} className="border-b hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-sm">{emp.full_name?.charAt(0) || '?'}</div>
                        <div>
                          <p className="font-bold text-sm text-slate-900">{emp.full_name}</p>
                          <p className="text-xs text-slate-400 font-mono">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${ROLES.find(r => r.value === emp.role)?.color || 'bg-slate-100 text-slate-700'}`}>
                        {ROLE_LABELS[emp.role] || emp.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-sm text-slate-700">{emp.department || '—'}</td>
                    <td className="py-3.5 px-5">
                      <span className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2.5 py-1 rounded-full">عرض عبر التفاصيل</span>
                    </td>
                    <td className="py-3.5 px-5">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${emp.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
                        {emp.status || 'active'}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex gap-1.5">
                        <button onClick={() => openView(emp)} className="w-8 h-8 bg-slate-50 border rounded-xl flex items-center justify-center hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors" title="عرض التفاصيل">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => openEdit(emp)} className="w-8 h-8 bg-slate-50 border rounded-xl flex items-center justify-center hover:bg-amber-50 text-slate-500 hover:text-amber-600 transition-colors" title="تعديل">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setDeleteTarget(emp)} className="w-8 h-8 bg-slate-50 border rounded-xl flex items-center justify-center hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="حذف">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr><td colSpan={6} className="py-16 text-center text-sm text-slate-400">لا يوجد موظفون مطابقون للبحث</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center p-4 border-t bg-slate-50">
            <span className="text-xs text-slate-500 font-medium">{filtered.length} موظف — صفحة {page}/{totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="w-8 h-8 bg-white border rounded-xl flex items-center justify-center disabled:opacity-50 hover:bg-slate-50">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="w-8 h-8 bg-white border rounded-xl flex items-center justify-center disabled:opacity-50 hover:bg-slate-50">
                <ChevronLeft size={14} className="rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wizard Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-200 flex-shrink-0 bg-slate-50">
              <div>
                <h3 className="font-black text-lg text-slate-900">
                  {formMode === 'create' ? 'إضافة موظف جديد — معالج الخطوات المؤسسي' : `تعديل بيانات ${selectedEmp?.full_name}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">أنشئ حساباً آمناً مع تحديد دقيق للبوابات والأدوار التنظيمية والمالية</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 bg-white border rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500">
                <X size={16} />
              </button>
            </div>

            {/* Stepper */}
            <div className="px-6 py-4 bg-white border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                {[{ step: 1, title: 'الهوية والاتصال' }, { step: 2, title: 'التعيين التنظيمي' }, { step: 3, title: 'البوابات والصلاحيات' }].map(st => (
                  <div key={st.step} className="flex items-center gap-2 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${wizardStep === st.step ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25' : wizardStep > st.step ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {wizardStep > st.step ? <Check size={14} /> : st.step}
                    </div>
                    <div className="hidden sm:block min-w-0">
                      <p className={`text-xs font-bold truncate ${wizardStep === st.step ? 'text-indigo-600' : 'text-slate-500'}`}>{st.title}</p>
                    </div>
                    {st.step < 3 && <div className={`flex-1 h-1 rounded-full ${wizardStep > st.step ? 'bg-emerald-500' : 'bg-slate-100'}`} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">

              {/* Step 1 */}
              {wizardStep === 1 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-900">
                    <p className="font-bold">الخطوة 1: الهوية الأساسية والاتصال</p>
                    <p className="mt-0.5 text-indigo-700">أدخل الاسم الكامل والبريد الإلكتروني وكلمة المرور الآمنة.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">الاسم الكامل *</label>
                      <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" placeholder="مثال: أحمد محمد" required />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">البريد الإلكتروني *</label>
                      <div className="flex">
                        <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value.replace(/@.*/, '') }))} className="w-full bg-slate-50 border border-slate-200 rounded-r-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 text-left font-mono" dir="ltr" placeholder="ahmed.mohammed" required />
                        <span className="bg-slate-200 border border-slate-200 border-r-0 rounded-l-xl px-3 flex items-center text-xs font-mono text-slate-600 select-none" dir="ltr">@kyvzon.com</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">
                        كلمة المرور {formMode === 'create' ? '*' : '(فارغة = بدون تغيير)'}
                      </label>
                      <input type="password" value={form.passcode} onChange={e => setForm(f => ({ ...f, passcode: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" placeholder="8 أحرف كبيرة وصغيرة وأرقام" {...(formMode === 'create' ? { required: true, minLength: 8 } : {})} />
                      <p className="text-[10px] text-slate-400 mt-1">يجب أن تحتوي حروفاً كبيرة وصغيرة وأرقاماً</p>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">رقم الهاتف</label>
                      <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-mono text-left" dir="ltr" placeholder="+964 790 000 0000" />
                    </div>
                  </div>
                  {formMode === 'edit' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">حالة الحساب</label>
                        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                          <option value="active">نشط (Active)</option>
                          <option value="inactive">معطل (Inactive)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2 */}
              {wizardStep === 2 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-900">
                    <p className="font-bold">الخطوة 2: التعيين التنظيمي والفرع</p>
                    <p className="mt-0.5 text-indigo-700">حدد القسم والفرع والدور الرئيسي والوردية التشغيلية.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">القسم الإداري</label>
                      <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value, department_id: departments.find((d: any) => d.name_ar === e.target.value)?.id || '' }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                        <option value="">-- اختر القسم --</option>
                        {departments.map((d: any) => <option key={d.id} value={d.name_ar}>{d.name_ar}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">الفرع الرئيسي</label>
                      <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                        <option value="">-- اختر الفرع --</option>
                        {branches.map((b: any) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">المسمى الوظيفي</label>
                      <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" placeholder="مثال: محاسب أول" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1.5 block">الدور الرئيسي في المنصة *</label>
                      <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500 font-bold" required>
                        {visibleRoles.map(r => <option key={r.value} value={r.value}>{r.label} ({r.value})</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1.5 block">الوردية التشغيلية</label>
                    <select value={form.shift_code} onChange={e => setForm(f => ({ ...f, shift_code: e.target.value }))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500">
                      <option value="">-- اختر الوردية --</option>
                      <option value="morning">الوردية الصباحية (08:00 ص — 04:00 م)</option>
                      <option value="evening">الوردية المسائية (04:00 م — 12:00 ص)</option>
                      <option value="night">الوردية الليلية (12:00 ص — 08:00 ص)</option>
                      <option value="flexible">وردية مرنة (Flexible)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {wizardStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-900">
                    <p className="font-bold">الخطوة 3: البوابات والصلاحيات المالية المتقدمة</p>
                    <p className="mt-0.5 text-indigo-700">تحديد صلاحيات الكيانات القانونية والوصول المالي.</p>
                  </div>

                  {/* Page Permissions */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-black text-sm text-slate-800">تخصيص صفحات وبوابات المستخدم</h4>
                      <button type="button" onClick={() => setForm(f => ({ ...f, allowed_pages: visiblePortals.flatMap(p => p.pages.map(pg => pg.id)) }))} className="text-xs font-bold text-indigo-600 hover:text-indigo-800">
                        تحديد الكل ✅
                      </button>
                    </div>
                    <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                      {visiblePortals.map(portal => {
                        const ids        = portal.pages.map(pg => pg.id);
                        const allSelected = ids.every(id => form.allowed_pages.includes(id));
                        return (
                          <div key={portal.portalLabel} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                              <span className="font-black text-xs text-slate-700 uppercase tracking-wider">{portal.portalLabel}</span>
                              <button type="button" onClick={() => setForm(f => ({
                                ...f,
                                allowed_pages: allSelected
                                  ? f.allowed_pages.filter(id => !ids.includes(id))
                                  : [...new Set([...f.allowed_pages, ...ids])],
                              }))} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
                                {allSelected ? 'إلغاء التحديد ❌' : 'تحديد الكل ✅'}
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {portal.pages.map(pg => {
                                const checked = form.allowed_pages.includes(pg.id);
                                return (
                                  <label key={pg.id} className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${checked ? 'bg-indigo-50 border-indigo-200 text-indigo-800 font-bold' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                    <input type="checkbox" checked={checked} onChange={() => setForm(f => ({
                                      ...f,
                                      allowed_pages: checked
                                        ? f.allowed_pages.filter(id => id !== pg.id)
                                        : [...f.allowed_pages, pg.id],
                                    }))} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                    <span>{pg.label}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Finance Binding */}
                  {isEnabled('finance') && (
                    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Landmark size={18} className="text-violet-700" />
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">الربط المالي — الكيان القانوني</h4>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1 block">الكيان القانوني</label>
                          <select value={form.finance.legal_entity_id} onChange={e => setForm(f => ({ ...f, finance: { ...f.finance, legal_entity_id: e.target.value } }))} className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                            <option value="">-- بدون كيان --</option>
                            {legalEntities.map(le => <option key={le.id} value={le.id}>{le.code} — {le.name_ar}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1 block">الدور المالي</label>
                          <select value={form.finance.finance_role} onChange={e => setForm(f => ({ ...f, finance: { ...f.finance, finance_role: e.target.value as any } }))} className="w-full bg-white border border-violet-200 rounded-xl px-3 py-2.5 text-sm outline-none font-bold">
                            {FINANCE_ROLES.map(fr => <option key={fr.value} value={fr.value}>{fr.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wizard Navigation */}
              <div className="flex items-center justify-between pt-5 border-t border-slate-200">
                {wizardStep > 1 ? (
                  <button type="button" onClick={() => setWizardStep(s => (s - 1) as any)} className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 flex items-center gap-2">
                    <ArrowRight size={16} /> السابق
                  </button>
                ) : (
                  <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50">
                    إلغاء
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button type="button" onClick={() => {
                    if (wizardStep === 1 && !validateStep1()) return;
                    if (wizardStep === 2 && !validateStep2()) return;
                    setWizardStep(s => (s + 1) as any);
                  }} className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500 shadow-md shadow-indigo-500/25 flex items-center gap-2">
                    التالي <ArrowLeft size={16} />
                  </button>
                ) : (
                  <button type="button" onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-sm hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center gap-2">
                    {saving && <RefreshCw size={14} className="animate-spin" />}
                    {saving ? 'جاري الحفظ...' : formMode === 'create' ? 'إنشاء الحساب ✅' : 'حفظ التعديلات ✅'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewOpen && selectedEmp && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-black text-lg">تفاصيل الموظف: {selectedEmp.full_name}</h3>
              <button onClick={() => setViewOpen(false)} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xl">{selectedEmp.full_name?.charAt(0)}</div>
                <div>
                  <p className="font-black text-slate-900 text-lg">{selectedEmp.full_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selectedEmp.email} • {selectedEmp.role}</p>
                </div>
              </div>
              <div>
                <h4 className="font-black text-sm flex items-center gap-2 text-slate-800"><Landmark size={16} className="text-violet-600" /> العضويات المالية</h4>
                <div className="mt-3 space-y-2">
                  {entityMemberships.length === 0
                    ? <p className="text-xs text-slate-400 text-center py-6">لا توجد عضويات مالية</p>
                    : entityMemberships.map((m: any) => (
                      <div key={m.id} className="p-3.5 bg-violet-50 border border-violet-200 rounded-xl flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm text-slate-900">{m.legal_entities?.name_ar} ({m.legal_entities?.code})</p>
                          <p className="text-xs text-slate-500">الدور: {m.finance_role} • {m.is_active ? 'نشط' : 'معطل'}</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${FINANCE_ROLES.find(r => r.value === m.finance_role)?.color}`}>{m.finance_role}</span>
                      </div>
                    ))
                  }
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 border rounded-xl p-3"><p className="text-slate-400">القسم</p><p className="font-bold mt-1 text-slate-800">{selectedEmp.department || '—'}</p></div>
                <div className="bg-slate-50 border rounded-xl p-3"><p className="text-slate-400">المسمى</p><p className="font-bold mt-1 text-slate-800">{selectedEmp.position || '—'}</p></div>
                <div className="bg-slate-50 border rounded-xl p-3"><p className="text-slate-400">الهاتف</p><p className="font-bold mt-1 text-slate-800 font-mono" dir="ltr">{selectedEmp.phone || '—'}</p></div>
                <div className="bg-slate-50 border rounded-xl p-3"><p className="text-slate-400">الحالة</p><p className={`font-bold mt-1 ${selectedEmp.status === 'active' ? 'text-emerald-600' : 'text-slate-500'}`}>{selectedEmp.status || 'active'}</p></div>
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 flex gap-3">
              <button onClick={() => setViewOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-white border text-sm font-bold text-slate-700 hover:bg-slate-100">إغلاق</button>
              <button onClick={() => { setViewOpen(false); openEdit(selectedEmp); }} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">تعديل الموظف</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-black text-lg flex items-center gap-2"><Upload size={18} />استيراد جماعي CSV</h3>
              <button onClick={() => { setShowBulk(false); setBulkProgress(null); setBulkPreview([]); setBulkFile(null); }} className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                <p className="font-bold">قالب CSV المطلوب (الحد الأقصى 500 موظف):</p>
                <p className="font-mono mt-1">full_name,email,role,phone,password</p>
                <p className="mt-1 text-blue-600">ملاحظة: إذا لم تحدد password، سيتم توليدها عشوائياً لكل موظف</p>
              </div>
              <div className="flex gap-2">
                <input type="file" accept=".csv" onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBulkFile(file);
                  setBulkProgress(null);
                  await handleBulkPreview(file);
                }} className="flex-1 border border-dashed rounded-xl p-4 text-sm" />
                <button onClick={downloadCSVTemplate} className="px-4 py-2 rounded-xl border text-xs font-bold text-slate-600 hover:bg-slate-50 whitespace-nowrap">تحميل قالب</button>
              </div>

              {bulkPreview.length > 0 && (
                <div>
                  <h4 className="font-bold text-sm mb-2">معاينة أول 5 صفوف:</h4>
                  <div className="bg-slate-50 border rounded-xl p-3 overflow-x-auto text-xs font-mono space-y-1">
                    {bulkPreview.map((r, i) => <div key={i}>{JSON.stringify(r)}</div>)}
                  </div>
                </div>
              )}

              {bulkProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold">
                    <span>التقدم: {bulkProgress.done}/{bulkProgress.total}</span>
                    <span>{Math.round((bulkProgress.done / bulkProgress.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }} />
                  </div>
                  {bulkProgress.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                      {bulkProgress.errors.map((e, i) => (
                        <p key={i} className="text-red-700"><span className="font-bold">صف {e.row._row}:</span> {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowBulk(false); setBulkProgress(null); setBulkPreview([]); setBulkFile(null); }} className="flex-1 px-4 py-3 rounded-xl bg-white border text-sm font-bold">إغلاق</button>
                <button onClick={handleBulkImport} disabled={!bulkFile || !!bulkProgress} className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50">
                  بدء الاستيراد
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}