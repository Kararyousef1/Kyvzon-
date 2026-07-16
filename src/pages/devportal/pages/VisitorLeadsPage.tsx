import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Phone, RefreshCw, Search, Star, UserPlus } from 'lucide-react';
import { PageHeader, Badge, EmptyState } from '../components/shared';
import { publicSignupAdminService, type PublicSignupRequestRecord, type PublicSignupStatus } from '../../../services/sdk';
import { useUIStore } from '../../../core/stores';

const INTENT_LABEL: Record<string, string> = {
  plan: 'خطة', service: 'خدمة', review: 'تقييم', demo: 'تجربة', general: 'عام',
};

const STATUS_LABEL: Record<PublicSignupStatus, string> = {
  new: 'جديد', contacted: 'تم التواصل', qualified: 'مؤهل', converted: 'تم التحويل', rejected: 'مرفوض', archived: 'مؤرشف',
};

const STATUS_OPTIONS: PublicSignupStatus[] = ['new', 'contacted', 'qualified', 'converted', 'rejected', 'archived'];

export default function VisitorLeadsPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<PublicSignupRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await publicSignupAdminService.list());
    } catch (err: any) {
      addToast(err?.message || 'فشل تحميل طلبات الزوار', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.full_name, r.email, r.phone, r.company_name, r.selected_plan, r.selected_service, r.intent_type, r.status]
      .some(v => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    new: rows.filter(r => r.status === 'new').length,
    review: rows.filter(r => r.intent_type === 'review').length,
    converted: rows.filter(r => r.status === 'converted').length,
  }), [rows]);

  const updateStatus = async (row: PublicSignupRequestRecord, status: PublicSignupStatus) => {
    setUpdatingId(row.id);
    try {
      const updated = await publicSignupAdminService.updateStatus(row.id, status);
      setRows(prev => prev.map(r => r.id === row.id ? updated : r));
      addToast('تم تحديث حالة الطلب', 'success');
    } catch (err: any) {
      addToast(err?.message || 'فشل تحديث الحالة', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader title="طلبات الزوار" description="إدارة طلبات التسجيل والخطط والخدمات والتقييمات القادمة من صفحة الهبوط" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="إجمالي الطلبات" value={stats.total} />
        <Stat label="طلبات جديدة" value={stats.new} />
        <Stat label="تقييمات" value={stats.review} />
        <Stat label="تم تحويلها" value={stats.converted} />
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم، البريد، الشركة، الخطة، الخدمة..." className="w-full bg-white border border-gray-200 rounded-xl pr-12 pl-4 py-3 text-sm outline-none focus:border-cyan-500" />
        </div>
        <button onClick={load} className="px-4 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserPlus} title="لا توجد طلبات" description="ستظهر هنا طلبات التسجيل من صفحة الهبوط" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-right text-xs text-gray-500">
                  <th className="p-4">الزائر</th>
                  <th className="p-4">النية</th>
                  <th className="p-4">الخطة/الخدمة</th>
                  <th className="p-4">الموقع</th>
                  <th className="p-4">التقييم</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/60 align-top">
                    <td className="p-4 min-w-[240px]">
                      <div className="font-bold text-gray-900">{row.full_name}</div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1"><Mail size={12}/>{row.email}</div>
                      {row.phone && <div className="flex items-center gap-1 text-xs text-gray-500 mt-1"><Phone size={12}/>{row.phone}</div>}
                      {row.company_name && <div className="text-xs text-cyan-700 font-bold mt-1">{row.company_name}</div>}
                    </td>
                    <td className="p-4"><Badge variant={row.intent_type}>{INTENT_LABEL[row.intent_type] || row.intent_type}</Badge></td>
                    <td className="p-4 min-w-[180px]">
                      <div className="font-bold text-gray-800">{row.selected_plan || row.selected_service || '—'}</div>
                      {row.review_text && <div className="text-xs text-gray-500 mt-2 max-w-[260px] line-clamp-3">{row.review_text}</div>}
                    </td>
                    <td className="p-4 text-xs text-gray-600">{row.country || '—'}<br />{row.governorate || '—'}</td>
                    <td className="p-4">{row.rating ? <span className="inline-flex items-center gap-1 text-amber-600 font-bold"><Star size={14} fill="currentColor" />{row.rating}</span> : '—'}</td>
                    <td className="p-4">
                      <select disabled={updatingId === row.id} value={row.status} onChange={(e) => updateStatus(row, e.target.value as PublicSignupStatus)} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-cyan-500">
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td className="p-4 text-xs text-gray-500 whitespace-nowrap">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm"><div className="text-xs font-bold text-gray-400">{label}</div><div className="text-2xl font-black text-gray-900 mt-1">{value}</div></div>;
}
