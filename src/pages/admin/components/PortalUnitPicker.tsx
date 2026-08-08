/**
 * PortalUnitPicker — اختيار وحدات بوابتَي المدير والمشرف
 *
 * ═════════════════════════════════════════════════════════════════════════
 * معمارية الوحدات (0302/0303): بدل دور جديد لكل بوابة، المدير يحمل دور
 * manager ووحدات مُسنَدة بنطاق صريح. هذا المكوّن هو واجهة الإسناد في
 * الخطوة الثالثة من معالج إدارة المستخدمين.
 *
 * لماذا مكوّن مستقل؟ AdminEmployeesPage تجاوزت 1500 سطر — إضافة المنطق
 * داخلها تُضاعف صعوبة صيانتها.
 *
 * مبدأ: لا وعد كاذب. الوحدات المخطَّطة (planned) تظهر معطَّلة بوسم
 * «قريباً» بدل أن تُختار ثم لا تعمل.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { AlertTriangle, Building2, Check, Globe, LayoutGrid, MapPin } from 'lucide-react';
import {
  unitsForBaseRole,
  pagesForUnit,
  PORTAL_UNIT_SCOPE_LABELS,
  type PortalUnitBaseRole,
  type PortalUnitKey,
  type PortalUnitScopeType,
} from '../../../shared/constants/portalUnits';

export interface SelectedPortalUnit {
  unitKey: PortalUnitKey;
  scopeType: PortalUnitScopeType;
  scopeId: string | null;
}

interface NamedOption {
  id: string;
  name_ar?: string;
}

const SCOPE_ICONS: Record<PortalUnitScopeType, typeof Globe> = {
  department: Building2,
  branch: MapPin,
  tenant: Globe,
};

export function PortalUnitPicker({
  baseRole,
  value,
  onChange,
  departments,
  branches,
  employeeDepartmentId,
}: {
  /** دور الموظف — يحدد الوحدات المتاحة */
  baseRole: PortalUnitBaseRole;
  value: SelectedPortalUnit[];
  onChange: (next: SelectedPortalUnit[]) => void;
  departments: NamedOption[];
  branches: NamedOption[];
  /** قسم الموظف — النطاق الافتراضي عند اختيار وحدة */
  employeeDepartmentId: string;
}) {
  const units = unitsForBaseRole(baseRole);
  const selectedMap = new Map(value.map((v) => [v.unitKey, v]));

  const toggleUnit = (unitKey: PortalUnitKey) => {
    if (selectedMap.has(unitKey)) {
      onChange(value.filter((v) => v.unitKey !== unitKey));
      return;
    }
    // النطاق الافتراضي: قسم الموظف إن وُجد، وإلا الشركة كاملة.
    // لا نختار 'department' بلا معرّف قسم — القيد في القاعدة يرفضه.
    const next: SelectedPortalUnit = employeeDepartmentId
      ? { unitKey, scopeType: 'department', scopeId: employeeDepartmentId }
      : { unitKey, scopeType: 'tenant', scopeId: null };
    onChange([...value, next]);
  };

  const updateScope = (
    unitKey: PortalUnitKey,
    scopeType: PortalUnitScopeType,
    scopeId: string | null,
  ) => {
    onChange(
      value.map((v) =>
        v.unitKey === unitKey
          ? { unitKey, scopeType, scopeId: scopeType === 'tenant' ? null : scopeId }
          : v,
      ),
    );
  };

  const scopeOptions = (scopeType: PortalUnitScopeType): NamedOption[] =>
    scopeType === 'department' ? departments : scopeType === 'branch' ? branches : [];

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-start gap-2 bg-indigo-50/60 border border-indigo-100 rounded-xl p-3">
        <LayoutGrid size={16} className="text-indigo-600 mt-0.5 shrink-0" />
        <div className="text-xs text-indigo-900">
          <p className="font-bold">وحدات البوابة</p>
          <p className="text-indigo-700 mt-0.5">
            بدل إنشاء دور جديد لكل مجال، اختر الوحدات التي يشرف عليها هذا
            {baseRole === 'manager' ? ' المدير' : ' المشرف'} ونطاق كل وحدة.
            ستظهر له داخل بوابته مباشرة.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {units.map((unit) => {
          const selected = selectedMap.get(unit.unitKey);
          const isPlanned = unit.status === 'planned';
          const pageCount = pagesForUnit(unit, baseRole).length;

          return (
            <div
              key={unit.unitKey}
              className={`rounded-xl border p-3 transition-all ${
                selected
                  ? 'bg-indigo-50/50 border-indigo-300'
                  : isPlanned
                    ? 'bg-slate-50 border-slate-200 opacity-60'
                    : 'bg-white border-slate-200 hover:border-indigo-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <label
                  className={`flex items-start gap-2.5 flex-1 min-w-0 ${
                    isPlanned ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!selected}
                    disabled={isPlanned}
                    onChange={() => toggleUnit(unit.unitKey)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-slate-800">{unit.label}</span>
                      {isPlanned ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-500 font-bold">
                          قريباً
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 font-bold">
                          {pageCount} صفحة
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {unit.description}
                    </span>
                  </span>
                </label>

                {selected && (
                  <Check size={16} className="text-indigo-600 shrink-0 mt-1" />
                )}
              </div>

              {selected && (
                <div className="mt-3 pt-3 border-t border-indigo-200/60 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(['department', 'branch', 'tenant'] as PortalUnitScopeType[]).map((st) => {
                      const Icon = SCOPE_ICONS[st];
                      const disabled = st === 'department' && departments.length === 0;
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            updateScope(
                              unit.unitKey,
                              st,
                              st === 'department'
                                ? employeeDepartmentId || departments[0]?.id || null
                                : st === 'branch'
                                  ? branches[0]?.id || null
                                  : null,
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 transition-all disabled:opacity-40 ${
                            selected.scopeType === st
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <Icon size={11} />
                          {PORTAL_UNIT_SCOPE_LABELS[st]}
                        </button>
                      );
                    })}
                  </div>

                  {selected.scopeType !== 'tenant' && (
                    <select
                      value={selected.scopeId ?? ''}
                      onChange={(e) =>
                        updateScope(unit.unitKey, selected.scopeType, e.target.value || null)
                      }
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-indigo-500"
                    >
                      <option value="">
                        -- اختر {PORTAL_UNIT_SCOPE_LABELS[selected.scopeType]} --
                      </option>
                      {scopeOptions(selected.scopeType).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name_ar ?? o.id}
                        </option>
                      ))}
                    </select>
                  )}

                  {selected.scopeType === 'tenant' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      نطاق الشركة كاملة: سيرى بيانات كل الموظفين في هذه الوحدة —
                      لا فريقه وحده.
                    </p>
                  )}

                  {selected.scopeType !== 'tenant' && !selected.scopeId && (
                    <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      اختر {PORTAL_UNIT_SCOPE_LABELS[selected.scopeType]} — لا يمكن
                      الحفظ بنطاق فارغ.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** هل كل الوحدات المختارة صالحة للحفظ؟ */
export function validatePortalUnits(units: SelectedPortalUnit[]): string | null {
  for (const u of units) {
    if (u.scopeType !== 'tenant' && !u.scopeId) {
      return `الوحدة «${u.unitKey}» تحتاج تحديد ${PORTAL_UNIT_SCOPE_LABELS[u.scopeType]}`;
    }
    if (u.scopeType === 'tenant' && u.scopeId) {
      return `الوحدة «${u.unitKey}»: نطاق الشركة لا يقبل تحديد جهة`;
    }
  }
  return null;
}

export default PortalUnitPicker;
