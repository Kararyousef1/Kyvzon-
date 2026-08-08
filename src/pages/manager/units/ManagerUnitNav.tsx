/**
 * ManagerUnitNav — تنقّل بين صفحات وحدة داخل بوابة المدير
 *
 * يعرض اسم الوحدة وصفحاتها، ويوضّح للمدير أنه داخل «وحدة» من بوابته
 * لا في بوابة أخرى — وهذا جوهر المعمارية: مكان واحد للمدير.
 */
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import {
  findUnit,
  pagesForUnit,
  type PortalUnitBaseRole,
  type PortalUnitKey,
} from '../../../shared/constants/portalUnits';

export function ManagerUnitNav({
  unitKey,
  baseRole = 'manager',
}: {
  unitKey: PortalUnitKey;
  baseRole?: PortalUnitBaseRole;
}) {
  const location = useLocation();
  const unit = findUnit(unitKey);
  if (!unit) return null;

  const pages = pagesForUnit(unit, baseRole);
  if (pages.length === 0) return null;

  const base = baseRole === 'manager' ? '/app/manager' : '/app/supervisor';

  return (
    <div className="mb-4" dir="rtl">
      <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
        <LayoutGrid size={14} className="text-indigo-500" />
        <span className="font-bold">وحدة {unit.label}</span>
        <span className="text-slate-300">•</span>
        <span>{unit.description}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map((page) => {
          const to = `${base}/${page.path}`;
          const active = location.pathname === to;
          return (
            <Link
              key={page.id}
              to={to}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {page.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default ManagerUnitNav;
