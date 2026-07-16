/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Dashboard Page
 *  الصفحة الرئيسية: نظرة عامة وإحصاءات المنصة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  Building2, Users, TrendingUp, AlertTriangle,
  Globe, CreditCard, Sparkles, Clock,
  ChevronLeft, RefreshCw, Activity, ScrollText, Code2, SlidersHorizontal,
} from 'lucide-react';
import { StatCard, PageHeader } from '../components/shared';
import { statsApi } from '../services/api';
import type { PlatformStats, IconType } from '../types';
import { useUIStore } from '../../../core/stores';

// ════════════════════════════════════════════════════════════════
//  Plan Badge
// ════════════════════════════════════════════════════════════════

const PLAN_GRADIENT: Record<string, string> = {
  basic:         'from-slate-400 to-slate-600',
  professional:  'from-violet-500 to-purple-700',
  enterprise:    'from-cyan-500 to-blue-700',
  custom:        'from-amber-500 to-orange-700',
};

const PLAN_LABEL: Record<string, string> = {
  basic:         'أساسي',
  professional:  'احترافي',
  enterprise:    'مؤسسي',
  custom:        'مخصص',
};

// ════════════════════════════════════════════════════════════════
//  Quick Action Card
// ════════════════════════════════════════════════════════════════

const QuickAction: FC<{
  icon: IconType;
  label: string;
  desc: string;
  gradient: string;
  onClick: () => void;
}> = ({ icon: Icon, label, desc, gradient, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-white border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all group"
  >
    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
      <Icon size={22} className="text-white" />
    </div>
    <div className="text-center">
      <p className="text-sm font-bold text-gray-900">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </div>
  </button>
);

// ════════════════════════════════════════════════════════════════
//  Dashboard Page
// ════════════════════════════════════════════════════════════════

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { addToast } = useUIStore();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await statsApi.refresh();
      setStats(data);
    } catch (err: any) {
      addToast('فشل تحميل الإحصاءات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  const st = stats;
  if (!st) return null;

  const planEntries = Object.entries(st.companies_by_plan || {});

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── Stats Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="إجمالي الشركات"
          value={st.total_companies}
          icon={Building2}
          gradient="from-cyan-500 to-blue-600"
          trend="up"
          trendValue={`+${st.recent_signups}`}
        />
        <StatCard
          label="الشركات النشطة"
          value={st.active_companies}
          icon={Activity}
          gradient="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="تحت التجربة"
          value={st.trial_companies}
          icon={Clock}
          gradient="from-blue-400 to-indigo-600"
        />
        <StatCard
          label="موقوفة / منتهية"
          value={st.suspended_companies}
          icon={AlertTriangle}
          gradient="from-amber-500 to-orange-600"
        />
        <StatCard
          label="إجمالي المستخدمين"
          value={st.total_users.toLocaleString()}
          icon={Users}
          gradient="from-violet-500 to-purple-700"
        />
        <StatCard
          label="الإيرادات التقديرية"
          value={`$${st.total_revenue_estimated.toLocaleString()}`}
          icon={Globe}
          gradient="from-rose-500 to-pink-600"
        />
      </div>

      {/* ── Plans Breakdown + Quick Actions ──────────────────── */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Plans */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-cyan-600" />
            توزيع الخطط
          </h3>
          <div className="space-y-3">
            {planEntries.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">لا توجد بيانات</p>
            )}
            {planEntries.map(([plan, count]) => {
              const pct = st.active_companies > 0 ? Math.round((count / st.active_companies) * 100) : 0;
              return (
                <div key={plan} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-700">{PLAN_LABEL[plan] ?? plan}</span>
                    <span className="text-sm text-gray-500 tabular-nums">{count} شركة</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${PLAN_GRADIENT[plan] ?? 'from-gray-400 to-gray-600'} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Sparkles size={20} className="text-amber-600" />
            إجراءات سريعة
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              icon={Building2}
              label="إضافة شركة"
              desc="تسجيل شركة جديدة"
              gradient="from-cyan-500 to-blue-600"
              onClick={() => onNavigate('companies')}
            />
            <QuickAction
              icon={CreditCard}
              label="إدارة الاشتراكات"
              desc="خطط ومدفوعات"
              gradient="from-violet-500 to-purple-600"
              onClick={() => onNavigate('subscriptions')}
            />
            <QuickAction
              icon={SlidersHorizontal}
              label="تفعيل البوابات"
              desc="Modules per tenant"
              gradient="from-cyan-500 to-blue-600"
              onClick={() => onNavigate('modules')}
            />
            <QuickAction
              icon={Activity}
              label="صحة المنصة"
              desc="فحوصات هندسية"
              gradient="from-emerald-500 to-teal-600"
              onClick={() => onNavigate('platform-health')}
            />
            <QuickAction
              icon={Code2}
              label="الهندسة"
              desc="جاهزية الإطلاق"
              gradient="from-slate-700 to-slate-900"
              onClick={() => onNavigate('engineering-console')}
            />
            <QuickAction
              icon={ScrollText}
              label="سجل العمليات"
              desc="مراقبة النشاط"
              gradient="from-amber-500 to-orange-600"
              onClick={() => onNavigate('audit-log')}
            />
          </div>
        </div>
      </div>

      {/* ── System Status ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Activity size={20} className="text-emerald-600" />
          حالة النظام
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'قاعدة البيانات', status: 'online', latency: '12ms' },
            { label: 'واجهة API',      status: 'online', latency: '8ms' },
            { label: 'المصادقة',       status: 'online', latency: '15ms' },
            { label: 'التخزين',        status: 'online', latency: '22ms' },
          ].map((svc, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{svc.label}</p>
                <p className="text-xs text-gray-500 tabular-nums">{svc.latency}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
