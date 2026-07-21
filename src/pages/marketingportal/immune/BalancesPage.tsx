/**
 * BalancesPage — أرصدة العلاقة لكل عميل + محاكاة نقطة التفتيش + تطبيق أحداث + سجل الحركات.
 */
import { useState } from 'react';
import { Gauge, Zap, ShieldCheck, X, Battery } from 'lucide-react';
import {
  relationshipBalanceService, governanceService, POINTS_TABLE, statusFromBalance, STATUS_LABEL, STATUS_COLOR,
  type LedgerEntry, type GovernanceResult,
} from '../../../services/sdk';
import { marketingLeadService, type MarketingLead } from '../../../services/sdk';
import { useBalances, useAsync, DECISION_LABEL, DECISION_COLOR } from './useImmune';

export default function BalancesPage() {
  const { data: balances, loading, reload } = useBalances();
  const { data: leads } = useAsync<MarketingLead[]>(() => marketingLeadService.findAll({ orderBy: 'created_at', ascending: false }), []);
  const [busy, setBusy] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [govResult, setGovResult] = useState<GovernanceResult | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedLead, setSeedLead] = useState('');

  // خريطة lead_id -> اسم
  const leadName = (id: string) => leads.find((l) => l.id === id)?.full_name || 'عميل';

  const ensureForLead = async () => {
    if (!seedLead) return; setBusy(true);
    try { await relationshipBalanceService.ensure(seedLead); setSeedOpen(false); setSeedLead(''); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const applyEvent = async (leadId: string, key: string) => {
    setBusy(true);
    try { await relationshipBalanceService.applyEvent(leadId, key, 'manual'); reload(); if (ledgerFor === leadId) openLedger(leadId); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const check = async (leadId: string) => {
    setBusy(true); setGovResult(null);
    try { setGovResult(await governanceService.check(leadId, 'manual_test', 'email', true)); }
    catch { /* noop */ } finally { setBusy(false); }
  };
  const openLedger = async (leadId: string) => {
    if (ledgerFor === leadId) { setLedgerFor(null); return; }
    setLedgerFor(leadId);
    try { setLedger(await relationshipBalanceService.ledger(leadId)); } catch { setLedger([]); }
  };

  const leadsWithoutBalance = leads.filter((l) => !balances.some((b) => b.lead_id === l.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${balances.length} عميل مُراقَب`}</p>
        {leadsWithoutBalance.length > 0 && <button onClick={() => setSeedOpen(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Battery size={16} /> بدء مراقبة عميل</button>}
      </div>

      {govResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm flex items-center gap-2 ${DECISION_COLOR[govResult.decision]}`}>
          <ShieldCheck size={16} /> قرار الحوكمة: <b>{DECISION_LABEL[govResult.decision]}</b> — {govResult.reason} (الرصيد: {govResult.balance}{govResult.suggestedChannel ? ` · قناة بديلة مقترحة: ${govResult.suggestedChannel}` : ''})
        </div>
      )}

      {balances.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Gauge size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا أرصدة بعد</p><p className="text-xs text-slate-400 mt-1">ابدأ مراقبة عميل — كل عميل يبدأ برصيد 1000.</p></div>
      ) : (
        <div className="space-y-2">
          {balances.map((b) => {
            const status = statusFromBalance(b.balance);
            return (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center font-black text-sm">{b.balance}</div>
                    <div><p className="font-semibold text-slate-800">{leadName(b.lead_id)}</p><span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => check(b.lead_id)} disabled={busy} className="text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100 flex items-center gap-1"><ShieldCheck size={12} /> فحص الحوكمة</button>
                    <button onClick={() => openLedger(b.lead_id)} className="text-xs border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50">السجل</button>
                  </div>
                </div>
                {/* شريط الرصيد */}
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-3"><div className={`h-full ${b.balance >= 800 ? 'bg-emerald-500' : b.balance >= 500 ? 'bg-sky-500' : b.balance >= 300 ? 'bg-amber-500' : b.balance >= 150 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{ width: `${b.balance / 10}%` }} /></div>
                {/* تطبيق أحداث سريع */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[10px] text-slate-400 self-center">محاكاة:</span>
                  {[...POINTS_TABLE.debits.slice(0, 3), ...POINTS_TABLE.credits.slice(1, 4)].map((e) => {
                    const isDebit = POINTS_TABLE.debits.some((d) => d.key === e.key);
                    return <button key={e.key} onClick={() => applyEvent(b.lead_id, e.key)} disabled={busy} className={`text-[10px] px-2 py-0.5 rounded-full border ${isDebit ? 'border-rose-200 text-rose-500 hover:bg-rose-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>{e.label} {isDebit ? '−' : '+'}{e.pts}</button>;
                  })}
                </div>
                {ledgerFor === b.lead_id && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-1 max-h-48 overflow-y-auto">
                    {ledger.length === 0 ? <p className="text-xs text-slate-400 text-center">لا حركات</p>
                      : ledger.map((l) => (
                        <div key={l.id} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1.5 border border-slate-100">
                          <span className="text-slate-600">{l.reason || l.event_key}</span>
                          <span className={l.direction === 'debit' ? 'text-rose-500 font-bold' : 'text-emerald-600 font-bold'}>{l.direction === 'debit' ? '−' : '+'}{l.points} → {l.balance_after}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {seedOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSeedOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">بدء مراقبة عميل</h3><button onClick={() => setSeedOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <select value={seedLead} onChange={(e) => setSeedLead(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
              <option value="">— اختر عميلاً —</option>
              {leadsWithoutBalance.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
            </select>
            <div className="flex gap-2 mt-5"><button onClick={ensureForLead} disabled={busy || !seedLead} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60"><Zap size={14} className="inline" /> بدء (رصيد 1000)</button><button onClick={() => setSeedOpen(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
