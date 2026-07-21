/**
 * ═════════════════════════════════════════════════════════════════════════
 *  LeadsPage — إدارة العملاء المحتملين (Leads)
 *  عرض القائمة مع النقاط والتصنيف والمرحلة والوسوم · إضافة lead ·
 *  تطبيق أحداث تقييم سلوكية · فلترة حسب التصنيف.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Plus, Search, X, Zap, Tag } from 'lucide-react';
import {
  marketingLeadService, type MarketingLeadInput, type LeadTemperature,
} from '../../../services/sdk';
import {
  useLeads, useScoreRules, TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  PIPELINE_LABEL, JOURNEY_LABEL,
} from './useAutomation';

const EMPTY: MarketingLeadInput = { full_name: '', email: '', company: '', job_title: '', country: '' };

export default function LeadsPage() {
  const { data: leads, loading, error, reload } = useLeads();
  const { data: rules } = useScoreRules();
  const [filter, setFilter] = useState<LeadTemperature | 'all'>('all');
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<MarketingLeadInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [scoreFor, setScoreFor] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const behavioralRules = useMemo(() => rules.filter((r) => r.rule_type === 'behavioral'), [rules]);

  const filtered = useMemo(() => leads.filter((l) => {
    if (filter !== 'all' && l.temperature !== filter) return false;
    if (q && !`${l.full_name} ${l.email ?? ''} ${l.company ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [leads, filter, q]);

  const create = async () => {
    if (!form.full_name.trim()) { setFormError('اسم العميل مطلوب'); return; }
    setBusy(true); setFormError(null);
    try {
      await marketingLeadService.createLead(form);
      setForm(EMPTY); setShowCreate(false); reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'تعذّر الحفظ');
    } finally { setBusy(false); }
  };

  const applyScore = async (leadId: string, eventKey: string) => {
    setBusy(true);
    try {
      await marketingLeadService.applyScoreEvent(leadId, eventKey);
      setScoreFor(null); reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم/البريد/الشركة"
              className="pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-fuchsia-400 outline-none w-56"
            />
          </div>
          <select
            value={filter} onChange={(e) => setFilter(e.target.value as LeadTemperature | 'all')}
            className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none"
          >
            <option value="all">كل التصنيفات</option>
            <option value="cold">بارد</option>
            <option value="warm">دافئ</option>
            <option value="hot">ساخن</option>
            <option value="sales_ready">جاهز للمبيعات</option>
          </select>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700 transition-colors"
        >
          <Plus size={16} /> عميل جديد
        </button>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}

      {/* الجدول */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-right font-semibold px-4 py-3">العميل</th>
                <th className="text-right font-semibold px-4 py-3">الشركة / المسمى</th>
                <th className="text-center font-semibold px-4 py-3">النقاط</th>
                <th className="text-center font-semibold px-4 py-3">التصنيف</th>
                <th className="text-center font-semibold px-4 py-3">المرحلة (CRM)</th>
                <th className="text-center font-semibold px-4 py-3">الرحلة</th>
                <th className="text-right font-semibold px-4 py-3">الوسوم</th>
                <th className="text-center font-semibold px-4 py-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">جارٍ التحميل…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-slate-400">لا يوجد عملاء محتملون بعد — أضف أول عميل.</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{l.full_name}</p>
                    <p className="text-xs text-slate-400">{l.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{l.company || '—'}</p>
                    <p className="text-xs text-slate-400">{l.job_title || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-center font-black text-slate-800">{l.score}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${TEMPERATURE_COLOR[l.temperature]}`}>
                      {TEMPERATURE_LABEL[l.temperature]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">{PIPELINE_LABEL[l.pipeline_stage]}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">{JOURNEY_LABEL[l.journey_stage]}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {l.tags.length === 0 ? <span className="text-xs text-slate-300">—</span> :
                        l.tags.slice(0, 3).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                            <Tag size={9} /> {t}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setScoreFor(scoreFor === l.id ? null : l.id)}
                      className="inline-flex items-center gap-1 text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-1 rounded-lg hover:bg-fuchsia-100"
                    >
                      <Zap size={12} /> تسجيل حدث
                    </button>
                    {scoreFor === l.id && (
                      <div className="absolute z-20 mt-2 -translate-x-1/2 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-56 text-right">
                        <p className="text-[11px] text-slate-400 px-1 pb-1">اختر سلوكاً لتطبيق نقاطه:</p>
                        <div className="max-h-52 overflow-y-auto">
                          {behavioralRules.map((r) => (
                            <button
                              key={r.id} disabled={busy}
                              onClick={() => applyScore(l.id, r.event_key)}
                              className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-slate-50"
                            >
                              <span className="text-slate-700">{r.label}</span>
                              <span className={r.points >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-500 font-bold'}>
                                {r.points > 0 ? `+${r.points}` : r.points}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* نافذة إنشاء عميل */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">عميل محتمل جديد</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {([
                ['full_name', 'الاسم الكامل *'],
                ['email', 'البريد الإلكتروني'],
                ['company', 'الشركة'],
                ['job_title', 'المسمى الوظيفي'],
                ['country', 'الدولة'],
              ] as const).map(([k, label]) => (
                <div key={k}>
                  <label className="text-xs text-slate-500">{label}</label>
                  <input
                    value={(form[k] as string) || ''}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-fuchsia-400 outline-none"
                  />
                </div>
              ))}
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={create} disabled={busy}
                className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">
                {busy ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
