/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Subscriptions Page
 *  إدارة الاشتراكات والخطط والمدفوعات
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import {
  CreditCard, RefreshCw, Search, Receipt,
  Calendar, DollarSign, TrendingUp, Building2,
} from 'lucide-react';
import { PageHeader, Badge, EmptyState, StatCard } from '../components/shared';
import { companiesApi, subscriptionsApi } from '../services/api';
import type { Company, Subscription } from '../types';
import { useUIStore } from '../../../core/stores';

const PLAN_PRICE: Record<string, number> = {
  basic: 250,
  professional: 750,
  enterprise: 2000,
  custom: 5000,
};

const PLAN_LABEL: Record<string, string> = {
  basic: 'أساسي',
  professional: 'احترافي',
  enterprise: 'مؤسسي',
  custom: 'مخصص',
};

export default function SubscriptionsPage() {
  const { addToast } = useUIStore();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subs, setSubs]             = useState<Subscription[]>([]);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await companiesApi.getAll();
      // Only show active/trial companies
      setCompanies(data.filter(c => c.status === 'active' || c.status === 'trial'));
    } catch (err: any) {
      addToast('فشل تحميل البيانات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  // Fetch subscriptions for selected company
  useEffect(() => {
    if (!selectedId) { setSubs([]); return; }
    subscriptionsApi.getByCompany(selectedId)
      .then(setSubs)
      .catch(() => addToast('فشل تحميل الاشتراكات', 'error'));
  }, [selectedId, addToast]);

  const filtered = search.trim()
    ? companies.filter(c => c.name_ar?.toLowerCase().includes(search.toLowerCase()) || c.slug?.toLowerCase().includes(search.toLowerCase()))
    : companies;

  // Stats
  const totalMRR = companies
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + (PLAN_PRICE[c.subscription_plan] ?? PLAN_PRICE.basic), 0);

  const expiringSoon = companies.filter(c => {
    if (!c.subscription_end_date) return false;
    const end = new Date(c.subscription_end_date);
    const now = new Date();
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (86400000));
    return daysLeft <= 30 && daysLeft > 0;
  }).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="إدارة الاشتراكات"
        description="خطط الأسعار والمدفوعات وتواريخ التجديد"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="الإيراد الشهري التقديري"
          value={`$${totalMRR.toLocaleString()}`}
          icon={DollarSign}
          gradient="from-emerald-500 to-teal-600"
          trend="up"
          trendValue="MRR"
        />
        <StatCard
          label="الشركات النشطة"
          value={companies.filter(c => c.status === 'active').length}
          icon={TrendingUp}
          gradient="from-cyan-500 to-blue-600"
        />
        <StatCard
          label="تنتهي قريباً"
          value={expiringSoon}
          icon={Calendar}
          gradient="from-amber-500 to-orange-600"
          trend={expiringSoon > 0 ? 'down' : undefined}
          trendValue={expiringSoon > 0 ? 'انتباه' : undefined}
        />
        <StatCard
          label="تحت التجربة"
          value={companies.filter(c => c.status === 'trial').length}
          icon={CreditCard}
          gradient="from-violet-500 to-purple-600"
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث عن شركة..."
          className="w-full bg-white border border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10 transition-all shadow-sm"
        />
      </div>

      {/* Companies List + Sub Details */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Company List */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">الشركات</h3>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="animate-spin text-gray-400" size={28} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Building2} title="لا توجد شركات" />
          ) : (
            <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-right p-4 hover:bg-gray-50 transition-colors flex items-center justify-between ${
                    selectedId === c.id ? 'bg-cyan-50 border-r-2 border-r-cyan-500' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{c.name_ar}</p>
                    <p className="text-xs text-gray-500 mt-0.5">الخطة: {PLAN_LABEL[c.subscription_plan] ?? c.subscription_plan}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={c.status === 'active' ? 'active' : 'trial'}>
                      {c.status === 'active' ? 'نشط' : 'تجريبي'}
                    </Badge>
                    <span className="text-xs font-bold text-gray-600 tabular-nums">${PLAN_PRICE[c.subscription_plan]}/شهر</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Subscription Details */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">
              {selectedId ? 'تفاصيل الاشتراك' : 'اختر شركة لعرض التفاصيل'}
            </h3>
          </div>
          {!selectedId ? (
            <div className="flex items-center justify-center py-16">
              <Receipt size={48} className="text-gray-200" />
            </div>
          ) : subs.length === 0 ? (
            <div className="p-6">
              {(() => {
                const company = companies.find(c => c.id === selectedId);
                if (!company) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        {company.name_ar.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{company.name_ar}</p>
                        <p className="text-xs text-gray-500">{company.slug}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">الخطة الحالية</p>
                        <p className="text-sm font-bold text-gray-900">{PLAN_LABEL[company.subscription_plan]}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">السعر</p>
                        <p className="text-sm font-bold text-gray-900">${PLAN_PRICE[company.subscription_plan]}/شهر</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">تاريخ البداية</p>
                        <p className="text-sm text-gray-900">{company.subscription_start_date || '—'}</p>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-3">
                        <p className="text-[10px] font-bold text-gray-400 uppercase">تاريخ الانتهاء</p>
                        <p className="text-sm text-gray-900">{company.subscription_end_date || '—'}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
              {subs.map((s) => (
                <div key={s.id} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={s.plan}>{PLAN_LABEL[s.plan] ?? s.plan}</Badge>
                    <Badge variant={s.status}>{s.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-gray-500">من: {s.start_date}</span>
                    <span className="text-gray-500">إلى: {s.end_date || '—'}</span>
                    {s.amount && <span className="text-gray-900 font-bold">${s.amount} {s.currency}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
