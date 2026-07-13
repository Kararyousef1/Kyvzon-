/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Shared Components
 *  مكونات معاد استخدامها عبر البوابة
 * ════════════════════════════════════════════════════════════════
 */

import { type FC, type ReactNode } from 'react';
import type { IconType } from '../types';

// ════════════════════════════════════════════════════════════════
//  StatCard — بطاقة إحصائية
// ════════════════════════════════════════════════════════════════

export const StatCard: FC<{
  label: string;
  value: string | number;
  icon: IconType;
  gradient: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  onClick?: () => void;
}> = ({ label, value, icon: Icon, gradient, trend, trendValue, onClick }) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 p-6 group ${onClick ? 'cursor-pointer' : ''}`}
  >
    <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-[0.06] rounded-full -translate-y-1/3 translate-x-1/3 group-hover:opacity-[0.12] transition-opacity`} />
    <div className="relative">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon size={20} className="text-white" />
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
          }`}>
            {trend === 'up' ? '↑' : '↓'} {trendValue}
          </span>
        )}
      </div>
      <p className="text-3xl font-black text-gray-900 tracking-tight tabular-nums">{value}</p>
      <p className="text-sm text-gray-500 mt-1.5 font-medium">{label}</p>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Badge — شارة الحالة
// ════════════════════════════════════════════════════════════════

const BADGE_STYLES: Record<string, string> = {
  active:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  trial:      'bg-blue-50 text-blue-700 border-blue-200',
  suspended:  'bg-amber-50 text-amber-700 border-amber-200',
  expired:    'bg-red-50 text-red-700 border-red-200',
  cancelled:  'bg-gray-50 text-gray-600 border-gray-200',
  deleted:    'bg-red-100 text-red-800 border-red-300',
  basic:      'bg-slate-50 text-slate-700 border-slate-200',
  professional:'bg-violet-50 text-violet-700 border-violet-200',
  enterprise: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  custom:     'bg-amber-50 text-amber-700 border-amber-200',
};

export const Badge: FC<{
  variant?: string;
  children: ReactNode;
  dot?: boolean;
}> = ({ variant = 'active', children, dot }) => {
  const style = BADGE_STYLES[variant] ?? BADGE_STYLES.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold border ${style}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
};

// ════════════════════════════════════════════════════════════════
//  EmptyState — حالة فارغة
// ════════════════════════════════════════════════════════════════

export const EmptyState: FC<{
  icon: IconType;
  title: string;
  description?: string;
  action?: ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4">
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-5">
      <Icon size={32} className="text-gray-300" />
    </div>
    <h3 className="text-lg font-bold text-gray-700 mb-1.5">{title}</h3>
    {description && <p className="text-sm text-gray-400 max-w-sm text-center mb-5">{description}</p>}
    {action}
  </div>
);

// ════════════════════════════════════════════════════════════════
//  ConfirmDialog — مربع حوار تأكيدي
// ════════════════════════════════════════════════════════════════

export const ConfirmDialog: FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({ open, title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', variant = 'info', onConfirm, onCancel, loading }) => {
  if (!open) return null;

  const variantStyles: Record<string, { bg: string; text: string; btn: string }> = {
    danger:  { bg: 'bg-red-50 border-red-200',  text: 'text-red-600',  btn: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700' },
    info:    { bg: 'bg-blue-50 border-blue-200',  text: 'text-blue-600',  btn: 'bg-blue-600 hover:bg-blue-700' },
  };

  const s = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className={`bg-white w-full max-w-sm rounded-2xl shadow-2xl border ${s.bg} overflow-hidden`}>
        <div className="p-6">
          <h3 className={`text-lg font-bold ${s.text} mb-2`}>{title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center gap-3 p-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${s.btn}`}
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  PageHeader — ترويسة الصفحة
// ════════════════════════════════════════════════════════════════

export const PageHeader: FC<{
  title: string;
  description: string;
  action?: ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
    <div>
      <h2 className="text-2xl font-black text-gray-900 tracking-tight">{title}</h2>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </div>
    {action}
  </div>
);
