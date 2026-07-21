/**
 * GovernancePage — سجل تدقيق قرارات الحوكمة (allow/defer/block) لكل الأنظمة.
 */
import { ScrollText } from 'lucide-react';
import { useGovLog, DECISION_LABEL, DECISION_COLOR } from './useImmune';

export default function GovernancePage() {
  const { data: log, loading } = useGovLog();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2"><ScrollText size={16} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">سجل تدقيق الحوكمة</h3><span className="text-xs text-slate-400 mr-auto">{log.length} قرار</span></div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-5 py-2.5">النظام</th><th className="text-right px-5 py-2.5">القناة</th><th className="text-center px-5 py-2.5">القرار</th><th className="text-right px-5 py-2.5">السبب</th><th className="text-center px-5 py-2.5">الرصيد</th><th className="text-right px-5 py-2.5">الوقت</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={6} className="text-center py-8 text-slate-400">جارٍ التحميل…</td></tr>
              : log.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">لا قرارات بعد — كل فحص حوكمة يُسجَّل هنا للتدقيق.</td></tr>
                : log.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-700">{g.source_system}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{g.channel || '—'}</td>
                    <td className="px-5 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${DECISION_COLOR[g.decision]}`}>{DECISION_LABEL[g.decision]}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500 max-w-xs">{g.reason}{g.suggested_channel ? ` · بديل: ${g.suggested_channel}` : ''}</td>
                    <td className="px-5 py-3 text-center font-black text-slate-700">{g.balance_at_time ?? '—'}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{new Date(g.created_at).toLocaleString('ar')}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
