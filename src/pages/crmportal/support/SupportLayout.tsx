/**
 * ═════════════════════════════════════════════════════════════════════════
 *  SupportLayout — غلاف الوحدة 5: الدعم والتذاكر (التقرير 05)
 *  تبويبات: نظرة عامة · التذاكر · قاعدة المعرفة · الإعدادات (SLA/ردود/توزيع)
 * ═════════════════════════════════════════════════════════════════════════
 */

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Headphones, LayoutDashboard, Ticket, BookOpen, Settings, ArrowRight } from 'lucide-react';
import { CRM_BASE } from '../crmCatalog';

const BASE = `${CRM_BASE}/support`;
const TABS = [
  { to: `${BASE}`,          label: 'نظرة عامة',    icon: LayoutDashboard, end: true },
  { to: `${BASE}/tickets`,  label: 'التذاكر',      icon: Ticket,          end: false },
  { to: `${BASE}/kb`,       label: 'قاعدة المعرفة', icon: BookOpen,       end: false },
  { to: `${BASE}/settings`, label: 'الإعدادات',    icon: Settings,        end: false },
];

export default function SupportLayout() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-cyan-600 via-cyan-700 to-blue-800 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><Headphones size={24} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">الدعم والتذاكر</h1>
              <p className="text-white/75 text-sm">تذاكر · SLA · Omnichannel · توزيع ذكي · قاعدة معرفة · CSAT · خطر المغادرة</p>
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
