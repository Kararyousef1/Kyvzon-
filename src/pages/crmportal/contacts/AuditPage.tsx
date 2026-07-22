/**
 * AuditPage — سجل التدقيق (GDPR): من رأى/عدّل/حذف/دمج/أثرى ومتى.
 */
import { ShieldCheck } from 'lucide-react';
import { crmAuditService, type CrmAuditEntry } from '../../../services/sdk';
import { useAsync } from './useContacts';

const ACTION_LABEL: Record<string, string> = {
  view: 'اطّلاع', create: 'إنشاء', update: 'تعديل', delete: 'حذف',
  merge: 'دمج', enrich: 'إثراء', gdpr_erase: 'حذف GDPR',
};
const ACTION_COLOR: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  update: 'bg-sky-50 text-sky-600 border-sky-200',
  delete: 'bg-rose-50 text-rose-600 border-rose-200',
  gdpr_erase: 'bg-rose-50 text-rose-600 border-rose-200',
  merge: 'bg-amber-50 text-amber-600 border-amber-200',
  enrich: 'bg-violet-50 text-violet-600 border-violet-200',
  view: 'bg-slate-100 text-slate-500 border-slate-200',
};

function fmt(d: string): string {
  try { return new Date(d).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; }
}

export default function AuditPage() {
  const { data, loading } = useAsync<CrmAuditEntry[]>(() => crmAuditService.recent(100), []);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center"><ShieldCheck size={16} /></div>
          <h2 className="font-black text-slate-800">سجل التدقيق (Audit Log)</h2>
        </div>
        <p className="text-sm text-slate-500">امتثالاً لـ GDPR: كل عملية على جهات الاتصال والحسابات تُسجَّل — من نفّذها ومتى وعلى أي سجل.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-center px-4 py-3">العملية</th>
              <th className="text-right px-4 py-3">النوع</th>
              <th className="text-right px-4 py-3">السجل</th>
              <th className="text-right px-4 py-3">التاريخ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : data.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا سجلات تدقيق بعد.</td></tr>
                : data.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-center"><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${ACTION_COLOR[e.action] || ACTION_COLOR.view}`}>{ACTION_LABEL[e.action] || e.action}</span></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{e.entity_type === 'contact' ? 'جهة اتصال' : 'حساب'}</td>
                    <td className="px-4 py-3 text-slate-400 text-[11px] font-mono">{e.entity_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{fmt(e.created_at)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
