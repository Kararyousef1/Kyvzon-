/**
 * ═════════════════════════════════════════════════════════════════════════
 *  PipelineLayout — غلاف الوحدة 2: خط الأنابيب والصفقات (التقرير 02)
 *  تبويبات: نظرة عامة · لوحة Kanban · قائمة الصفقات · تحليل Win/Loss
 * ═════════════════════════════════════════════════════════════════════════
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { GitBranch, LayoutDashboard, Kanban, List, TrendingDown, ArrowRight } from 'lucide-react';
import { CRM_BASE } from '../crmCatalog';

const BASE = `${CRM_BASE}/pipeline`;
const TABS = [
  { to: `${BASE}`,         label: 'نظرة عامة',    icon: LayoutDashboard, end: true },
  { to: `${BASE}/board`,   label: 'لوحة Kanban',  icon: Kanban,          end: false },
  { to: `${BASE}/list`,    label: 'قائمة الصفقات', icon: List,            end: false },
  { to: `${BASE}/winloss`, label: 'تحليل Win/Loss', icon: TrendingDown,  end: false },
];

export default function PipelineLayout() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-cyan-600 via-cyan-700 to-blue-800 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><GitBranch size={24} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">خط الأنابيب والصفقات</h1>
              <p className="text-white/75 text-sm">مراحل بشروط خروج · Kanban · سرعة الصفقة · تنبيهات الركود · تحليل Win/Loss</p>
            </div>
          </div>
          <button onClick={() => navigate(CRM_BASE)}
            className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 transition-colors px-3 py-2 rounded-xl">
            <ArrowRight size={14} /> بوابة CRM
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${isActive ? 'bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-cyan-300'}`}>
              <Icon size={16} /> {t.label}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
