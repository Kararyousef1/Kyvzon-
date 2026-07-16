import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Lock, RefreshCw, Search, ShieldCheck, SlidersHorizontal, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHeader, Badge } from '../components/shared';
import { auditApi, companiesApi } from '../services/api';
import type { AuditEntry, Company } from '../types';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { MODULE_CATALOG, isModuleAllowedForPlan, modulesForPlan, tenantModuleService } from '../../../services/sdk/TenantModuleService';
import type { TenantModuleRecord } from '../../../services/sdk/TenantModuleService';

const categoryLabels: Record<string, string> = {
  core: 'أساسي',
  people: 'الأفراد',
  operations: 'تشغيلي',
  platform: 'منصة',
  advanced: 'متقدم',
};

const planLabels: Record<string, string> = {
  basic: 'أساسي',
  professional: 'احترافي',
  enterprise: 'مؤسسي',
  custom: 'مخصص',
};

export default function ModulesPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(() => sessionStorage.getItem('devportal_selected_tenant') || '');
  const [modules, setModules] = useState<TenantModuleRecord[]>([]);
  const [moduleAudit, setModuleAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await companiesApi.getAll();
      setCompanies(rows || []);
      if (!selectedTenantId && rows?.length) setSelectedTenantId(rows[0].id);
    } catch {
      addToast('تعذر تحميل الشركات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedTenantId]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);
  useEffect(() => {
    if (selectedTenantId) sessionStorage.setItem('devportal_selected_tenant', selectedTenantId);
  }, [selectedTenantId]);

  const selectedCompany = useMemo(() => companies.find(c => c.id === selectedTenantId) || null, [companies, selectedTenantId]);

  const loadModules = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const rows = await tenantModuleService.ensureTenantModules(selectedCompany.id, selectedCompany.subscription_plan, user?.id);
      setModules(rows);
      const logs = await auditApi.getLogs(100).catch(() => []);
      setModuleAudit((logs || []).filter(log => log.target_type === 'tenant_module' && log.target_id === selectedCompany.id).slice(0, 8));
    } catch (err: any) {
      addToast(err?.message || 'تعذر تحميل البوابات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedCompany, user?.id]);

  useEffect(() => { loadModules(); }, [loadModules]);

  const moduleMap = useMemo(() => new Map(modules.map(m => [m.module_key, m])), [modules]);
  const allowed = selectedCompany ? modulesForPlan(selectedCompany.subscription_plan) : [];

  const filteredCatalog = MODULE_CATALOG.filter(item => {
    const row = moduleMap.get(item.key);
    if (showOnlyEnabled && !row?.is_enabled) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [item.key, item.label, item.description, item.category].join(' ').toLowerCase().includes(q);
  });

  const summary = useMemo(() => ({
    total: MODULE_CATALOG.length,
    enabled: modules.filter(m => m.is_enabled).length,
    allowed: allowed.length,
    locked: MODULE_CATALOG.length - allowed.length,
  }), [allowed.length, modules]);

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    if (!selectedCompany) return;
    setSavingKey(moduleKey);
    try {
      await tenantModuleService.setModuleEnabled({
        tenantId: selectedCompany.id,
        moduleKey,
        enabled,
        plan: selectedCompany.subscription_plan,
        actorId: user?.id,
      });
      addToast(enabled ? 'تم تفعيل البوابة' : 'تم تعطيل البوابة', 'success');
      await loadModules();
    } catch (err: any) {
      addToast(err?.message || 'تعذر تحديث البوابة', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const syncWithPlan = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const rows = await tenantModuleService.syncWithPlan(selectedCompany.id, selectedCompany.subscription_plan, user?.id);
      setModules(rows);
      addToast('تمت مزامنة البوابات مع خطة الاشتراك', 'success');
    } catch (err: any) {
      addToast(err?.message || 'تعذر المزامنة', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      <PageHeader
        title="إدارة تفعيل البوابات"
        description="تحكم مركزي في بوابات كل شركة حسب خطة الاشتراك — SaaS Control Plane"
        action={
          <button onClick={syncWithPlan} disabled={!selectedCompany || loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> مزامنة مع الخطة
          </button>
        }
      />

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <label className="text-xs font-bold text-gray-500 mb-2 block">الشركة</label>
          <select value={selectedTenantId} onChange={e => setSelectedTenantId(e.target.value)} className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-500">
            {companies.map(c => <option key={c.id} value={c.id}>{c.name_ar} — {c.slug}</option>)}
          </select>
          {selectedCompany && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge variant={selectedCompany.status}>{selectedCompany.status}</Badge>
              <Badge variant={selectedCompany.subscription_plan}>{planLabels[selectedCompany.subscription_plan] || selectedCompany.subscription_plan}</Badge>
              <span className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100 text-gray-500">حد المستخدمين: {selectedCompany.max_employees}</span>
            </div>
          )}
        </div>
        {[
          { label: 'كل البوابات', value: summary.total, icon: SlidersHorizontal, color: 'text-slate-700' },
          { label: 'مفعلة', value: summary.enabled, icon: CheckCircle2, color: 'text-emerald-700' },
          { label: 'مسموحة بالخطة', value: summary.allowed, icon: ShieldCheck, color: 'text-cyan-700' },
          { label: 'مقفلة بالخطة', value: summary.locked, icon: Lock, color: 'text-amber-700' },
        ].map(item => { const Icon = item.icon; return (
          <div key={item.label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <Icon className={`${item.color} mb-3`} size={22} />
            <p className="text-3xl font-black text-gray-900">{item.value}</p>
            <p className="text-xs text-gray-500 mt-1">{item.label}</p>
          </div>
        ); })}
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search size={16} className="absolute right-3 top-3 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في البوابات..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-cyan-500" />
        </div>
        <button onClick={() => setShowOnlyEnabled(v => !v)} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${showOnlyEnabled ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-gray-600 border-gray-200'}`}>
          {showOnlyEnabled ? 'عرض الكل' : 'المفعلة فقط'}
        </button>
      </div>

      {!selectedCompany ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Building2 className="mx-auto mb-3 opacity-30" size={42} />
          اختر شركة لإدارة بواباتها
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredCatalog.map(item => {
            const row = moduleMap.get(item.key);
            const isEnabled = !!row?.is_enabled;
            const isAllowed = isModuleAllowedForPlan(item.key, selectedCompany.subscription_plan);
            const busy = savingKey === item.key;
            return (
              <div key={item.key} className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${isEnabled ? 'border-emerald-200 ring-1 ring-emerald-50' : 'border-gray-200'} ${!isAllowed ? 'opacity-75' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-black text-gray-900">{item.label}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 text-gray-500">{categoryLabels[item.category]}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{item.description}</p>
                  </div>
                  <button
                    disabled={busy || (!isAllowed && !isEnabled)}
                    onClick={() => toggleModule(item.key, !isEnabled)}
                    className={`p-2 rounded-xl transition-colors ${isEnabled ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' : 'text-gray-400 bg-gray-50 hover:bg-gray-100'} disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={isEnabled ? 'تعطيل' : 'تفعيل'}
                  >
                    {isEnabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 text-xs">
                  <span className={`font-bold px-2 py-1 rounded-lg ${isEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>{isEnabled ? 'مفعلة' : 'غير مفعلة'}</span>
                  <span className={`font-bold px-2 py-1 rounded-lg ${isAllowed ? 'bg-cyan-50 text-cyan-700' : 'bg-amber-50 text-amber-700'}`}>{isAllowed ? 'مسموحة بالخطة' : `تحتاج ${planLabels[item.minPlan]}`}</span>
                </div>
                {row?.enabled_at && isEnabled && <p className="text-[10px] text-gray-400 mt-3">تم التفعيل: {new Date(row.enabled_at).toLocaleString('ar')}</p>}
              </div>
            );
          })}
        </div>
      )}

      {selectedCompany && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2"><ShieldCheck size={20} className="text-cyan-600" /> آخر تغييرات البوابات</h3>
          {moduleAudit.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">لا توجد عمليات تفعيل/تعطيل مسجلة لهذه الشركة بعد</p>
          ) : (
            <div className="space-y-2">
              {moduleAudit.map(log => (
                <div key={log.id} className="p-3 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{log.description || log.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{log.actor_name || 'developer'} • {log.created_at ? new Date(log.created_at).toLocaleString('ar') : ''}</p>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-100">{log.target_name || log.action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
