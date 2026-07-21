/**
 * SocialLayout — غلاف وحدة وسائل التواصل الاجتماعي (التقرير 3)
 * تبويبات: نظرة عامة · الحسابات · المنشورات · التقويم · مركز التفاعل · UTM · الاستماع · التحليلات
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Share2, Link2, PenSquare, Calendar, Inbox, Tag, Ear, BarChart3, ArrowRight } from 'lucide-react';
import { MARKETING_BASE } from '../marketingCatalog';

const BASE = `${MARKETING_BASE}/social`;
const TABS = [
  { to: `${BASE}`,           label: 'نظرة عامة',   icon: Share2,    end: true },
  { to: `${BASE}/accounts`,  label: 'الحسابات',    icon: Link2,     end: false },
  { to: `${BASE}/posts`,     label: 'المنشورات',   icon: PenSquare, end: false },
  { to: `${BASE}/calendar`,  label: 'التقويم',     icon: Calendar,  end: false },
  { to: `${BASE}/inbox`,     label: 'مركز التفاعل', icon: Inbox,     end: false },
  { to: `${BASE}/utm`,       label: 'UTM',         icon: Tag,       end: false },
  { to: `${BASE}/listening`, label: 'الاستماع',    icon: Ear,       end: false },
  { to: `${BASE}/analytics`, label: 'التحليلات',   icon: BarChart3, end: false },
];

export default function SocialLayout() {
  const navigate = useNavigate();
  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><Share2 size={24} /></div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black">وسائل التواصل الاجتماعي</h1>
              <p className="text-white/75 text-sm">النشر الموحّد · مركز التفاعل · UTM/الإسناد · الاستماع الاجتماعي</p>
            </div>
          </div>
          <button onClick={() => navigate(MARKETING_BASE)} className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 transition-colors px-3 py-2 rounded-xl">
            <ArrowRight size={14} /> بوابة التسويق
          </button>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${isActive ? 'bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-fuchsia-300'}`}>
              <Icon size={16} /> {t.label}
            </NavLink>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}
