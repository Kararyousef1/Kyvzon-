/**
 * ConvertPage — التحويل من التسويق: marketing_leads → crm_contacts (+ ربط/إنشاء حساب).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCompareArrows, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { crmContactService, listConvertibleLeads } from '../../../services/sdk';
import { useAsync } from './useContacts';
import { CRM_BASE } from '../crmCatalog';

const TEMP_LABEL: Record<string, string> = { cold: 'بارد', warm: 'دافئ', hot: 'ساخن', sales_ready: 'جاهز للمبيعات' };

export default function ConvertPage() {
  const navigate = useNavigate();
  const leads = useAsync(() => listConvertibleLeads(), [] as Awaited<ReturnType<typeof listConvertibleLeads>>, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const convert = async (leadId: string) => {
    setBusy(leadId); setErr(null);
    try { const contactId = await crmContactService.convertLead(leadId); setDone((d) => ({ ...d, [leadId]: contactId })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر التحويل'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center"><GitCompareArrows size={16} /></div>
          <h2 className="font-black text-slate-800">التحويل من بوابة التسويق</h2>
        </div>
        <p className="text-sm text-slate-500">حوّل العملاء المحتملين (Leads) القادمين من بوابة التسويق إلى جهات اتصال CRM. عند التحويل يُنشأ/يُربط الحساب (الشركة) تلقائياً، ويُسجَّل التحويل في الجدول الزمني.</p>
      </div>

      {err && <div className="rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-600 px-4 py-2.5">{err}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-right px-4 py-3">العميل المحتمل</th>
              <th className="text-right px-4 py-3">الشركة</th>
              <th className="text-center px-4 py-3">الحرارة</th>
              <th className="text-center px-4 py-3">إجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.loading ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              : leads.data.length === 0 ? <tr><td colSpan={4} className="text-center py-10 text-slate-400">لا عملاء محتملين في بوابة التسويق بعد.</td></tr>
                : leads.data.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{l.full_name}</p><p className="text-xs text-slate-400">{l.email || '—'}</p></td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{l.company || '—'}</td>
                    <td className="px-4 py-3 text-center"><span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{TEMP_LABEL[l.temperature] || l.temperature}</span></td>
                    <td className="px-4 py-3 text-center">
                      {done[l.id]
                        ? <button onClick={() => navigate(`${CRM_BASE}/contacts/people/${done[l.id]}`)} className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-lg inline-flex items-center gap-1"><CheckCircle2 size={13} /> عرض جهة الاتصال</button>
                        : <button onClick={() => convert(l.id)} disabled={busy === l.id} className="text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700 disabled:opacity-60 inline-flex items-center gap-1"><ArrowLeft size={13} /> {busy === l.id ? 'جارٍ…' : 'تحويل'}</button>}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
