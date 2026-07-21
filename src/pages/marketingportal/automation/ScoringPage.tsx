/**
 * ═════════════════════════════════════════════════════════════════════════
 *  ScoringPage — نظام تقييم العملاء (Lead Scoring)
 *  عرض/تعديل قواعد النقاط (ديموغرافية + سلوكية) · عتبات التحويل ·
 *  بذر القواعد القياسية · إضافة قاعدة مخصّصة.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useMemo, useState } from 'react';
import { Sparkles, Plus, X, ToggleLeft, ToggleRight, Snowflake, Flame, ThermometerSun, Target } from 'lucide-react';
import { leadScoreRuleService, type LeadScoreRule, type ScoreRuleType } from '../../../services/sdk';
import { useScoreRules } from './useAutomation';

const THRESHOLDS = [
  { label: 'بارد', range: '0 – 20', desc: 'أدخله حملة تثقيفية طويلة', icon: Snowflake, cls: 'bg-sky-50 text-sky-600 border-sky-200' },
  { label: 'دافئ', range: '21 – 40', desc: 'محتوى مخصّص وعروض', icon: ThermometerSun, cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  { label: 'ساخن', range: '41 – 60', desc: 'تجربة مجانية أو استشارة', icon: Flame, cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  { label: 'جاهز للمبيعات', range: '60+', desc: 'حوّله لفريق المبيعات فوراً', icon: Target, cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
];

export default function ScoringPage() {
  const { data: rules, loading, reload } = useScoreRules();
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<{ rule_type: ScoreRuleType; event_key: string; label: string; points: number }>({
    rule_type: 'behavioral', event_key: '', label: '', points: 5,
  });
  const [addError, setAddError] = useState<string | null>(null);

  const demographic = useMemo(() => rules.filter((r) => r.rule_type === 'demographic'), [rules]);
  const behavioral = useMemo(() => rules.filter((r) => r.rule_type === 'behavioral'), [rules]);

  const seed = async () => {
    setBusy(true);
    try { await leadScoreRuleService.seedDefaults(); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  const toggle = async (r: LeadScoreRule) => {
    setBusy(true);
    try { await leadScoreRuleService.update(r.id, { is_active: !r.is_active }); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  const addRule = async () => {
    if (!addForm.event_key.trim() || !addForm.label.trim()) { setAddError('المفتاح والاسم مطلوبان'); return; }
    setBusy(true); setAddError(null);
    try {
      await leadScoreRuleService.create({ ...addForm, is_active: true });
      setShowAdd(false); setAddForm({ rule_type: 'behavioral', event_key: '', label: '', points: 5 });
      reload();
    } catch (e) { setAddError(e instanceof Error ? e.message : 'تعذّر الحفظ'); }
    finally { setBusy(false); }
  };

  const RuleTable = ({ title, list }: { title: string; list: LeadScoreRule[] }) => (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h3 className="font-bold text-slate-700 text-sm">{title}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {list.length === 0 ? (
            <tr><td className="px-4 py-6 text-center text-slate-400 text-xs">لا قواعد بعد — اضغط «إنشاء القواعد القياسية».</td></tr>
          ) : list.map((r) => (
            <tr key={r.id} className={r.is_active ? '' : 'opacity-50'}>
              <td className="px-4 py-2.5 text-slate-700">{r.label}</td>
              <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{r.event_key}</td>
              <td className="px-4 py-2.5 text-center">
                <span className={r.points >= 0 ? 'text-emerald-600 font-black' : 'text-rose-500 font-black'}>
                  {r.points > 0 ? `+${r.points}` : r.points}
                </span>
              </td>
              <td className="px-4 py-2.5 text-center">
                <button onClick={() => toggle(r)} disabled={busy} className="text-slate-400 hover:text-fuchsia-600">
                  {r.is_active ? <ToggleRight size={22} className="text-fuchsia-600" /> : <ToggleLeft size={22} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* العتبات */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">عتبات التحويل (Thresholds)</h2>
        <p className="text-xs text-slate-500 mb-4">تُحدّد كل نقاط العميل تصنيفه تلقائياً، فيُوجَّه للحملة أو الإجراء المناسب.</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {THRESHOLDS.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className={`rounded-xl border p-4 ${t.cls}`}>
                <div className="flex items-center justify-between">
                  <Icon size={18} />
                  <span className="text-xs font-black">{t.range}</span>
                </div>
                <p className="font-bold mt-2 text-sm">{t.label}</p>
                <p className="text-[11px] mt-1 opacity-80 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* شريط الأدوات */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${rules.length} قاعدة تقييم`}</p>
        <div className="flex gap-2">
          {rules.length === 0 && (
            <button onClick={seed} disabled={busy}
              className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">
              <Sparkles size={16} /> إنشاء القواعد القياسية
            </button>
          )}
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 border border-slate-200 text-slate-700 text-sm px-4 py-2 rounded-xl hover:bg-slate-50">
            <Plus size={16} /> قاعدة مخصّصة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RuleTable title="التقييم الديموغرافي (من هو العميل)" list={demographic} />
        <RuleTable title="التقييم السلوكي (ماذا يفعل)" list={behavioral} />
      </div>

      {/* نافذة إضافة قاعدة */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">قاعدة تقييم مخصّصة</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">النوع</label>
                <select value={addForm.rule_type} onChange={(e) => setAddForm({ ...addForm, rule_type: e.target.value as ScoreRuleType })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                  <option value="behavioral">سلوكي</option>
                  <option value="demographic">ديموغرافي</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">المفتاح (event_key) — إنجليزي بلا مسافات</label>
                <input value={addForm.event_key} onChange={(e) => setAddForm({ ...addForm, event_key: e.target.value.replace(/\s/g, '_') })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="e.g. watched_video" />
              </div>
              <div>
                <label className="text-xs text-slate-500">الاسم المعروض</label>
                <input value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              </div>
              <div>
                <label className="text-xs text-slate-500">النقاط (قد تكون سالبة)</label>
                <input type="number" value={addForm.points} onChange={(e) => setAddForm({ ...addForm, points: parseInt(e.target.value || '0', 10) })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
              </div>
              {addError && <p className="text-xs text-rose-600">{addError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={addRule} disabled={busy}
                className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">
                {busy ? 'جارٍ الحفظ…' : 'حفظ القاعدة'}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
