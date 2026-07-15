/**
 * ════════════════════════════════════════════════════════════════
 *  DevLoginModal — زر دخول سريع للتطوير
 *  يسمح باختيار أي بوابة والدخول مباشرة بدون Supabase
 *  ⚠️ يعمل فقط في بيئة التطوير (import.meta.env.DEV)
 * ════════════════════════════════════════════════════════════════
 */

import { useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDefaultPathForRole } from '../../router/constants';
import {
  LayoutDashboard, Users, Shield, Fingerprint, Terminal,
  Cpu, MessageSquare, Briefcase, UserCheck, ChevronDown,
  Sparkles, X,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import type { PermissionKey } from '../../core/constants/permissions';
import type { UserRole } from '../../shared/types';

// ════════════════════════════════════════════════════════════════
//  Available Dev Portals
// ════════════════════════════════════════════════════════════════

interface DevPortal {
  role: UserRole;
  label: string;
  icon: FC<{ size?: number | string; className?: string }>;
  color: string;
  email: string;
  fullName: string;
  defaultView?: string;
  key?: string; // مفتاح فريد لتجنب تكرار المفاتيح
}

const DEV_PORTALS: DevPortal[] = [
  {
    role: 'employee', label: '👤 بوابة الموظف', icon: Briefcase,
    color: 'from-indigo-500 to-purple-600',
    email: 'employee@kyvzon.dev', fullName: 'أحمد الموظف',
  },
  {
    role: 'supervisor', label: '👔 بوابة المشرف', icon: UserCheck,
    color: 'from-blue-500 to-cyan-600',
    email: 'supervisor@kyvzon.dev', fullName: 'خالد المشرف',
  },
  {
    role: 'manager', label: '📊 بوابة المدير', icon: Users,
    color: 'from-amber-500 to-orange-600',
    email: 'manager@kyvzon.dev', fullName: 'سعد المدير',
  },
  {
    role: 'hr', label: '🏢 بوابة الموارد البشرية', icon: Users,
    color: 'from-emerald-500 to-teal-600',
    email: 'hr@kyvzon.dev', fullName: 'نورة الموارد البشرية',
  },
  {
    role: 'admin', label: '🔧 بوابة الإدارة', icon: Shield,
    color: 'from-rose-500 to-red-600',
    email: 'admin@kyvzon.dev', fullName: 'عمر مدير النظام',
  },
  {
    role: 'gatekeeper', label: '🚪 بوابة الحركة', icon: Fingerprint,
    color: 'from-cyan-500 to-blue-600',
    email: 'gatekeeper@kyvzon.dev', fullName: 'حسن الحارس',
  },
  {
    role: 'it_admin', label: '🖥️ البوابة التقنية', icon: Cpu,
    color: 'from-sky-500 to-indigo-600',
    email: 'it@kyvzon.dev', fullName: 'مصطفى التقنية',
  },
  {
    role: 'developer', label: '💻 بوابة Kyvzon المطور', icon: Terminal,
    color: 'from-slate-600 to-slate-800',
    email: 'dev@kyvzon.dev', fullName: 'مطور المنصة',
  },
  {
    role: 'employee' as UserRole, label: '💬 بوابة التواصل', icon: MessageSquare,
    color: 'from-pink-500 to-rose-600',
    email: 'tawathul@kyvzon.dev', fullName: 'مستخدم التواصل',
    defaultView: 'tawathul-portal',
    key: 'tawathul', // مفتاح فريد لتجنب التكرار
  },
];

// ════════════════════════════════════════════════════════════════
//  Component
// ════════════════════════════════════════════════════════════════

export default function DevLoginModal() {
  const [open, setOpen] = useState(false);
  const { addToast } = useUIStore();
  const navigate = useNavigate();

  // Quick login is opt-in and disabled when using a real Supabase project.
  // It creates synthetic IDs and must never call UUID-backed database queries.
  if (!import.meta.env.DEV || import.meta.env.VITE_ENABLE_LOCAL_AUTH !== 'true') return null;

  const handleDevLogin = (portal: DevPortal) => {
    const userRole = portal.role;
    // permissions are computed inside loginLocal via getEffectivePermissions.
    useAuthStore.getState().loginLocal(portal.email, userRole, portal.fullName);

    // Navigate to the role's default path (Router-based, no page reload)
    navigate(getDefaultPathForRole(userRole));

    addToast(`🚀 دخول سريع: ${portal.label}`, 'success');
    setOpen(false);
  };

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
          bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30
          text-amber-400 hover:text-amber-300 hover:bg-amber-500/30
          text-sm font-bold transition-all group"
      >
        <Sparkles size={16} className="group-hover:animate-pulse" />
        دخول سريع للتطوير
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-700 overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-700 bg-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">وضع التطوير</h3>
                  <p className="text-xs text-slate-400">اختر البوابة للدخول السريع</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)}
                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Portal List */}
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {DEV_PORTALS.map(portal => {
                const Icon = portal.icon;
                return (
                  <button
                    key={portal.key || portal.role}
                    onClick={() => handleDevLogin(portal)}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl bg-slate-800 hover:bg-slate-700 
                      border border-slate-700 hover:border-slate-600 transition-all text-right group`}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${portal.color} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{portal.label}</p>
                      <p className="text-xs text-slate-400">{portal.email}</p>
                    </div>
                    <div className="text-slate-500 group-hover:text-amber-400 transition-colors">
                      <ChevronDown size={16} className="-rotate-90" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer Warning */}
            <div className="p-4 border-t border-slate-700 bg-amber-500/10">
              <p className="text-xs text-amber-400/80 text-center">
                ⚠️ وضع التطوير فقط — لا يعمل في بيئة الإنتاج
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
