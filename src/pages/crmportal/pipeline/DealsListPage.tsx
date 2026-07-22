/**
 * DealsListPage — عرض قائمة لكل الصفقات مع تصفية بالحالة/خط الأنابيب.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Search } from 'lucide-react';
import { type DealStatus, DEAL_STATUS_LABEL, DEAL_STATUS_COLOR } from '../../../services/sdk';
import { usePipelines, useDeals } from './usePipeline';
import { useContactsData } from './useShared';
import { CRM_BASE } from '../crmCatalog';

export default function DealsListPage() {
  const navigate = useNavigate();
  const pipelines = usePipelines();
  const [pid, setPid] = useState<string | null>(null);
  const deals = useDeals(pid);
  const { accounts } = useContactsData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DealStatus | 'all'>('all');

  useEffect(() => { if (!pid && pipelines.data.length > 0) setPid(''); }, [pipelines.data, pid]);

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const filtered = useMemo(() => deals.data.filter((d) =>
    (status === 'all' || d.status === status) &&
    (q.trim() === '' || d.name.toLowerCase().includes(q.toLowerCase())),
  ), [deals.data, status, q]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث باسم الصفقة…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
        </div>
        <select value={pid ?? ''} onChange={(e) => setPid(e.target.value || null)} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
          <option value="">كل خطوط الأنابيب</option>
          {pipelines.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as DealStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
          <option value="all">كل الحالات</option>
          {Object.entries(DEAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3">الصفقة</th>
              <th className="text-right px-4 py-3">الحساب</th>
              <th className="text-center px-4 py-3">القيمة</th>
              <th className="text-center px-4 py-3">الاحتمالية</th>
              <th className="text-center px-4 py-3">الإغلاق المتوقع</th>
              <th className="text-center px-4 py-3">الحالة</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deals.loading ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا صفقات.</td></tr>
                : filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => navigate(`${CRM_BASE}/pipeline/deals/${d.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><Briefcase size={15} /></div>
                        <p className="font-semibold text-slate-800">{d.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{d.account_id ? accName[d.account_id] || '—' : '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{Number(d.amount).toLocaleString('ar')}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{d.probability}%</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{d.expected_close_date}</td>
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${DEAL_STATUS_COLOR[d.status]}`}>{DEAL_STATUS_LABEL[d.status]}</span></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
