/**
 * ═════════════════════════════════════════════════════════════════════════
 *  AnalyticsLayout — غلاف الوحدة 6: التحليلات والتنبؤ (التقرير 06)
 *  تبويبات: نظرة تنفيذية · التنبؤ · ذكاء المبيعات · الإيراد والأداء
 * ═════════════════════════════════════════════════════════════════════════
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, LayoutDashboard, TrendingUp, Swords, DollarSign, ArrowRight } from 'lucide-react';
import { CRM_BASE } from '../crmCatalog';

const BASE = `${CRM_BASE}/analytics`;
const TABS = [
  { to: `${BASE}`,             label: 'نظرة تنفيذية',  icon: LayoutDashboard, end: true },
  { to: `${BASE}/forecast`,    label: 'التنبؤ',        icon: TrendingUp,      end: false },
  { to: `${BASE}/intelligence`, label: 'ذكاء المبيعات', icon: Swords,        end: false },
  { to: `${BASE}/revenue`,     label: 'الإيراد والأداء', icon: DollarSign,   end: false },
];

export default function AnalyticsLayout() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-cyan-600 via-cyan-700 to-blue-800 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><BarChart3 size={24} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">التحليلات والتنبؤ</h1>
              <p className="text-white/75 text-sm">لوحات تنفيذية · تنبؤ مرجّح · قمع التحويل · صحة الحسابات · MRR · ذكاء المنافسة</p>
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
