/**
 * ContractsPage — مستودع العقود: قائمة مركزية + تحديث الحالة + بيانات التوقيع والقيمة.
 */
import { useMemo, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import {
  crmContractService, type ContractStatus,
  CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR,
} from '../../../services/sdk';
import { useContracts } from './useQuotes';
import { useContactsData } from '../pipeline/useShared';

export default function ContractsPage() {
  const { data: contracts, loading, reload } = useContracts();
  const { accounts } = useContactsData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ContractStatus | 'all'>('all');

  const accName = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  const filtered = useMemo(() => contracts.filter((c) =>
    (filter === 'all' || c.status === filter) &&
    (q.trim() === '' || c.title.toLowerCase().includes(q.toLowerCase()) || c.contract_number.toLowerCase().includes(q.toLowerCase())),
  ), [contracts, filter, q]);

  const setStatus = async (id: string, status: ContractStatus) => {
    try { await crmContractService.updateContract(id, { status }); reload(); } catch { /* noop */ }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالعنوان/الرقم…" className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 outline-none w-56" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as ContractStatus | 'all')} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
          <option value="all">كل الحالات</option>
          {Object.entries(CONTRACT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><ScrollText size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا عقود بعد</p><p className="text-slate-400 text-sm mt-1">تُنشأ العقود تلقائياً عند توقيع العروض إلكترونياً.</p></div>
          : <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-3">العقد</th><th className="text-right px-4 py-3">الحساب</th><th className="text-center px-4 py-3">القيمة</th><th className="text-center px-4 py-3">الانتهاء</th><th className="text-center px-4 py-3">الحالة</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0"><ScrollText size={15} /></div><div><p className="font-semibold text-slate-800">{c.title}</p><p className="text-xs text-slate-400 font-mono">{c.contract_number}</p></div></div></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{c.account_id ? accName[c.account_id] || '—' : '—'}</td>
                    <td className="px-4 py-3 text-center font-mono text-slate-700">{Number(c.total_value).toLocaleString('ar')}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">{c.end_date || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={c.status} onChange={(e) => setStatus(c.id, e.target.value as ContractStatus)} className={`text-[10px] font-bold border px-2 py-1 rounded-full outline-none ${CONTRACT_STATUS_COLOR[c.status]}`}>
                        {Object.entries(CONTRACT_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </div>
  );
}
