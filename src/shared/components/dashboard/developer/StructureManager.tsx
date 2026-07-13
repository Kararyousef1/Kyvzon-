/**
 * ════════════════════════════════════════════════════════════════
 *  StructureManager - إدارة هيكلية النظام (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 16 استخدام any → 0 (نوع union موحّد StructureItem)
 *  ✅ تنظيف جميع markdown artifacts
 *  ✅ إصلاح addToast() المكسور (قوس ناقص في 3 مواضع)
 *  ✅ catch (err: any) → catch (err: unknown) + getErrorMessage
 *  ✅ حذف syncStructureToProfiles (كود ميت فارغ)
 *  ✅ icon: any → React.ComponentType صريح
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect } from 'react';
import {
  Plus, Edit3, Trash2, Save, X, Building2, Briefcase, Shield,
  Clock, Layers, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import Card from '../../ui/Card';
import { getErrorMessage } from '../../../../services/errors';
import {
  structureDepartmentService,
  structurePositionService,
  structureRankService,
  structureShiftService,
  structureRoleService,
} from '../../../../services/sdk';

// ════════════════════════════════════════════════════
// أنواع الكيانات (محلّية - يحلّ محل any)
// ════════════════════════════════════════════════════

interface BaseItem {
  id?: number;
  name_ar: string;
  name_en?: string;
  code?: string;
  is_active: boolean;
}

interface Dept extends BaseItem {
  sort_order?: number;
}

interface Pos extends BaseItem {
  department_id?: number;
}

interface Rank extends BaseItem {
  level?: number;
}

interface Shift extends BaseItem {
  start_time?: string;
  end_time?: string;
}

interface Role extends BaseItem {}

/** نوع union موحّد لكل عناصر الهيكلية */
type StructureItem = Dept | Pos | Rank | Shift | Role;

type TabType = 'departments' | 'positions' | 'ranks' | 'shifts' | 'roles';

interface TabDef {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
}

// ════════════════════════════════════════════════════
// ثوابت
// ════════════════════════════════════════════════════

const TABS: TabDef[] = [
  { id: 'departments', label: 'الأقسام', icon: Building2 },
  { id: 'positions', label: 'المناصب', icon: Briefcase },
  { id: 'ranks', label: 'المراتب', icon: Layers },
  { id: 'shifts', label: 'الورديات', icon: Clock },
  { id: 'roles', label: 'الأدوار', icon: Shield },
];

const TABLE_NAMES: Record<TabType, string> = {
  departments: 'structure_departments',
  positions: 'structure_positions',
  ranks: 'structure_ranks',
  shifts: 'structure_shifts',
  roles: 'structure_roles',
};

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function StructureManager() {
  const { addToast } = useUIStore();

  const [tab, setTab] = useState<TabType>('departments');
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [positions, setPositions] = useState<Pos[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<StructureItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ── خرائط الوصول للجداول ──────────────────────────────────────
  const tables: Record<TabType, StructureItem[]> = { departments, positions, ranks, shifts, roles };

  // ── الحصول على Service حسب التبويب ────────────────────────────
  const getServiceForTab = (currentTab: TabType) => {
    switch (currentTab) {
      case 'departments': return structureDepartmentService;
      case 'positions': return structurePositionService;
      case 'ranks': return structureRankService;
      case 'shifts': return structureShiftService;
      case 'roles': return structureRoleService;
    }
  };

  // ── جلب البيانات ──────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const [d, p, r, s, rolesData] = await Promise.all([
        structureDepartmentService.findAll({ orderBy: 'sort_order', ascending: true }),
        structurePositionService.findAll({ orderBy: 'name_ar', ascending: true }),
        structureRankService.findAll({ orderBy: 'level', ascending: true }),
        structureShiftService.findAll({ orderBy: 'code', ascending: true }),
        structureRoleService.findAll({ orderBy: 'code', ascending: true }),
      ]);
      if (d) setDepartments(d as Dept[]);
      if (p) setPositions(p as Pos[]);
      if (r) setRanks(r as Rank[]);
      if (s) setShifts(s as Shift[]);
      if (rolesData) setRoles(rolesData as Role[]);
    } catch (err) {
      addToast('فشل تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── حفظ (إضافة/تعديل) ──────────────────────────────────────────
  const handleSave = async (item: StructureItem) => {
    try {
      const table = TABLE_NAMES[tab];
      if (item.id) {
        await getServiceForTab(tab).update(String(item.id), item as unknown as Record<string, unknown>);
        addToast('تم التحديث بنجاح', 'success');
      } else {
        await getServiceForTab(tab).create(item as unknown as Record<string, unknown>);
        addToast('تمت الإضافة بنجاح', 'success');
      }
      setShowForm(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      addToast('خطأ: ' + getErrorMessage(err), 'error');
    }
  };

  // ── حذف ────────────────────────────────────────────────────────
  const handleDelete = async (id: number) => {
    if (!confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await getServiceForTab(tab).delete(String(id));
      addToast('تم الحذف بنجاح', 'success');
      fetchData();
    } catch (err) {
      addToast('خطأ: ' + getErrorMessage(err), 'error');
    }
  };

  const getDeptName = (id: number) => departments.find((d) => d.id === id)?.name_ar || `قسم #${id}`;

  // ── نموذج فارغ حسب التبويب ────────────────────────────────────
  const emptyForm = (): StructureItem => {
    switch (tab) {
      case 'departments':
        return { name_ar: '', name_en: '', code: '', is_active: true, sort_order: 0 };
      case 'positions':
        return { name_ar: '', name_en: '', department_id: departments[0]?.id || 0, is_active: true };
      case 'ranks':
        return { name_ar: '', name_en: '', code: '', level: 0, is_active: true };
      case 'shifts':
        return { name_ar: '', name_en: '', code: '', start_time: '', end_time: '', is_active: true };
      case 'roles':
        return { name_ar: '', name_en: '', code: '', is_active: true };
    }
  };

  // ── تحديث حقل في النموذج ───────────────────────────────────────
  const updateField = (key: string, val: string | number | boolean) => {
    setEditing((prev) => ({ ...(prev ?? emptyForm()), [key]: val }));
  };

  // ── عرض النموذج ────────────────────────────────────────────────
  const renderForm = () => {
    const f = (editing ?? emptyForm()) as unknown as Record<string, unknown>;

    return (
      <Card className="border-2 border-indigo-200 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">{editing?.id ? 'تعديل' : 'إضافة'}</h3>
          <button onClick={() => { setShowForm(false); setEditing(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-bold text-slate-500 mb-1">الاسم بالعربية</label>
            <input
              type="text"
              value={(f.name_ar as string) || ''}
              onChange={(e) => updateField('name_ar', e.target.value)}
              className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
            />
          </div>

          <div className="col-span-2 md:col-span-1">
            <label className="block text-xs font-bold text-slate-500 mb-1">الاسم بالإنجليزية</label>
            <input
              type="text"
              value={(f.name_en as string) || ''}
              onChange={(e) => updateField('name_en', e.target.value)}
              dir="ltr"
              className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 text-left"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">الرمز (Code)</label>
            <input
              type="text"
              value={(f.code as string) || ''}
              onChange={(e) => updateField('code', e.target.value)}
              dir="ltr"
              className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500 text-left font-mono"
            />
          </div>

          {tab === 'positions' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">القسم</label>
              <select
                value={(f.department_id as number) || departments[0]?.id}
                onChange={(e) => updateField('department_id', parseInt(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
              >
                {departments.filter((d) => d.is_active).map((d) => (
                  <option key={d.id} value={d.id}>{d.name_ar}</option>
                ))}
              </select>
            </div>
          )}

          {tab === 'ranks' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">المستوى</label>
              <input
                type="number"
                value={(f.level as number) ?? 0}
                onChange={(e) => updateField('level', parseInt(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {tab === 'shifts' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">بداية الوردية</label>
                <input
                  type="time"
                  value={(f.start_time as string) || ''}
                  onChange={(e) => updateField('start_time', e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">نهاية الوردية</label>
                <input
                  type="time"
                  value={(f.end_time as string) || ''}
                  onChange={(e) => updateField('end_time', e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 outline-none focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-5">
            <input
              type="checkbox"
              checked={f.is_active !== false}
              onChange={(e) => updateField('is_active', e.target.checked)}
              className="w-5 h-5 text-indigo-600"
            />
            <label className="text-sm font-semibold">نشط</label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-xl font-bold bg-slate-100 hover:bg-slate-200">إلغاء</button>
          <button
            onClick={() => editing && handleSave(editing)}
            disabled={!(f.name_ar as string)?.trim()}
            className="px-4 py-2 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={16} /> {editing?.id ? 'تحديث' : 'إضافة'}
          </button>
        </div>
      </Card>
    );
  };

  // ── عرض القائمة ────────────────────────────────────────────────
  const renderList = () => {
    const data = tables[tab];
    if (loading) {
      return (
        <div className="text-center py-10">
          <RefreshCw className="animate-spin mx-auto" size={32} />
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {data.map((rawItem) => {
          const item = rawItem as unknown as Record<string, unknown>;
          const isActive = item.is_active !== false;
          return (
            <div
              key={item.id as number}
              className={`bg-white rounded-xl p-4 border flex items-center justify-between transition-all ${isActive ? 'border-slate-200 hover:shadow-sm' : 'border-slate-200 opacity-60'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-indigo-100' : 'bg-slate-100'}`}>
                  {tab === 'departments' && <Building2 size={18} className={isActive ? 'text-indigo-600' : 'text-slate-400'} />}
                  {tab === 'positions' && <Briefcase size={18} className={isActive ? 'text-emerald-600' : 'text-slate-400'} />}
                  {tab === 'ranks' && <Layers size={18} className={isActive ? 'text-amber-600' : 'text-slate-400'} />}
                  {tab === 'shifts' && <Clock size={18} className={isActive ? 'text-cyan-600' : 'text-slate-400'} />}
                  {tab === 'roles' && <Shield size={18} className={isActive ? 'text-purple-600' : 'text-slate-400'} />}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{(item.name_ar as string) || ''}</p>
                  <p className="text-xs text-slate-500">
                    {item.name_en && <span className="ml-3">{item.name_en as string}</span>}
                    {item.code && <span className="font-mono text-indigo-400">{item.code as string}</span>}
                    {item.level !== undefined && <span className="mr-3">مستوى {String(item.level)}</span>}
                    {item.department_id && <span className="mr-3">← {getDeptName(item.department_id as number)}</span>}
                    {item.start_time && <span className="mr-3">{item.start_time as string} - {item.end_time as string}</span>}
                  </p>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {!isActive && <CheckCircle2 size={16} className="text-red-400" />}
                <button onClick={() => { setEditing(rawItem); setShowForm(true); }} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Edit3 size={16} /></button>
                <button onClick={() => handleDelete(item.id as number)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
        {data.length === 0 && <p className="text-center py-10 text-slate-400">لا توجد بيانات</p>}
      </div>
    );
  };

  // ════════════════════════════════════════════════════
  // العرض الرئيسي
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 pb-20 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Layers className="text-indigo-600" /> إدارة هيكلية النظام
          </h2>
          <p className="text-slate-500 text-sm mt-1">إضافة وتعديل الأقسام والمناصب والمراتب والورديات والأدوار</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold"
        >
          <Plus size={18} /> إضافة
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const TabIcon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setShowForm(false); setEditing(null); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-sm transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              <TabIcon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {TABS.map((t) => (
          <div key={t.id} className={`rounded-xl p-3 border text-center ${tab === t.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'}`}>
            <p className="text-2xl font-black text-slate-800">{tables[t.id].length}</p>
            <p className="text-xs text-slate-500">{t.label}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && renderForm()}

      {/* List */}
      {renderList()}
    </div>
  );
}
