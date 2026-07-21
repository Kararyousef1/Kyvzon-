/**
 * SurveysPage — قائمة الاستبيانات + إنشاء (من قالب أو مخصّص/اختبار) + تفسير NPS.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, ClipboardList, ArrowRight, ChevronLeft, Gauge } from 'lucide-react';
import {
  marketingSurveyService, SURVEY_TEMPLATES, NPS_INTERPRETATION, SURVEY_TYPE_LABEL,
  type MarketingSurveyInput,
} from '../../../services/sdk';
import { useSurveysList, SURVEY_STATUS_LABEL, SURVEY_STATUS_COLOR } from './useSurveys';
import { MARKETING_BASE } from '../marketingCatalog';

export default function SurveysPage() {
  const { data: surveys, loading, reload } = useSurveysList();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'template' | 'custom'>('template');
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<MarketingSurveyInput & { as_quiz: boolean }>({ name: '', survey_type: 'custom', as_quiz: false });
  const [err, setErr] = useState<string | null>(null);

  const createFromTemplate = async (key: string) => {
    const tpl = SURVEY_TEMPLATES.find((t) => t.key === key); if (!tpl) return;
    setBusy(true); setErr(null);
    try {
      const s = await marketingSurveyService.createSurvey({ name: tpl.name, survey_type: tpl.type, status: 'draft' });
      for (const q of tpl.questions) await marketingSurveyService.addQuestion({ ...q, survey_id: s.id });
      setShowCreate(false); reload(); navigate(`${MARKETING_BASE}/surveys/${s.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };
  const createCustom = async () => {
    if (!custom.name.trim()) { setErr('اسم الاستبيان مطلوب'); return; }
    setBusy(true); setErr(null);
    try {
      const s = await marketingSurveyService.createSurvey({
        name: custom.name, survey_type: custom.as_quiz ? 'quiz' : (custom.survey_type || 'custom'),
        status: 'draft', is_quiz: custom.as_quiz, pass_score: custom.as_quiz ? 60 : null, issues_certificate: custom.as_quiz,
      });
      setShowCreate(false); reload(); navigate(`${MARKETING_BASE}/surveys/${s.id}`);
      setCustom({ name: '', survey_type: 'custom', as_quiz: false });
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الإنشاء'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-600 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center"><ClipboardList size={24} /></div>
            <div><h1 className="text-xl sm:text-2xl font-black">الاستبيانات والتغذية الراجعة</h1><p className="text-white/75 text-sm">NPS · CSAT · CES · إغلاق الحلقة · اختبارات الموظفين</p></div>
          </div>
          <button onClick={() => navigate(MARKETING_BASE)} className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 transition-colors px-3 py-2 rounded-xl"><ArrowRight size={14} /> بوابة التسويق</button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${surveys.length} استبيان`}</p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> استبيان جديد</button>
      </div>

      {surveys.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><ClipboardList size={36} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا استبيانات بعد</p><p className="text-xs text-slate-400 mt-1">أنشئ من قالب جاهز (NPS/CSAT/CES…) أو استبياناً/اختباراً مخصّصاً.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {surveys.map((s) => (
            <button key={s.id} onClick={() => navigate(`${MARKETING_BASE}/surveys/${s.id}`)} className="text-right rounded-2xl border border-slate-200 bg-white p-4 hover:border-fuchsia-300 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${SURVEY_STATUS_COLOR[s.status]}`}>{SURVEY_STATUS_LABEL[s.status]}</span>
                <span className="text-[10px] bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{SURVEY_TYPE_LABEL[s.survey_type]}</span>
              </div>
              <h3 className="font-black text-slate-800 mt-2">{s.name}</h3>
              {s.is_quiz && <p className="text-[11px] text-amber-600 mt-1">اختبار · نجاح {s.pass_score}%{s.issues_certificate ? ' · شهادة' : ''}</p>}
              <div className="flex items-center gap-1 text-fuchsia-500 text-xs mt-3"><ChevronLeft size={14} /> إدارة الاستبيان</div>
            </button>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Gauge size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">تفسير نطاقات NPS</h2></div>
        <p className="text-xs text-slate-500 mb-4">NPS = % المروّجين − % المنتقدين (من −100 إلى +100).</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {NPS_INTERPRETATION.map((n) => (
            <div key={n.range} className="rounded-xl border border-slate-100 p-3 text-center"><p className="font-black text-slate-800 text-sm">{n.range}</p><p className="text-[11px] text-slate-500 mt-1">{n.label}</p></div>
          ))}
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">استبيان جديد</h3><button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setTab('template')} className={`flex-1 text-sm py-2 rounded-xl ${tab === 'template' ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>من قالب</button>
              <button onClick={() => setTab('custom')} className={`flex-1 text-sm py-2 rounded-xl ${tab === 'custom' ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>مخصّص/اختبار</button>
            </div>
            {tab === 'template' ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {SURVEY_TEMPLATES.map((t) => (
                  <button key={t.key} disabled={busy} onClick={() => createFromTemplate(t.key)} className="w-full text-right rounded-xl border border-slate-200 p-3 hover:border-fuchsia-300 hover:bg-fuchsia-50/40 disabled:opacity-60">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{SURVEY_TYPE_LABEL[t.type]}</span><span className="text-[10px] text-slate-400">{t.questions.length} أسئلة</span></div>
                    <p className="font-bold text-slate-700 text-sm mt-1">{t.name}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div><label className="text-xs text-slate-500">اسم الاستبيان *</label><input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={custom.as_quiz} onChange={(e) => setCustom({ ...custom, as_quiz: e.target.checked })} /> اختبار موظفين (تصحيح تلقائي + شهادة)</label>
                <button onClick={createCustom} disabled={busy} className="w-full bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">إنشاء</button>
              </div>
            )}
            {err && <p className="text-xs text-rose-600 mt-3">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
