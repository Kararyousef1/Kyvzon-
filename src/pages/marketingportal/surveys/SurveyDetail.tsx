/**
 * SurveyDetail — تفاصيل الاستبيان بتبويبات:
 *   الأسئلة (المنشئ) · جمع استجابة · الاستجابات وإغلاق الحلقة · التحليلات · الشهادات.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Plus, X, ListChecks, MessageSquareText, Gauge, Award, ThumbsUp, Meh, ThumbsDown,
  TrendingUp, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '../../../core/stores';
import {
  marketingSurveyService, marketingSurveyResponseService, LOOP_PLAYBOOK, SURVEY_TYPE_LABEL,
  type MarketingSurvey, type SurveyQuestion, type SurveyQuestionInput, type QuestionType,
  type SurveyResponse, type SurveyKpis, type SurveyCertificate, type SurveyAnswerInput,
} from '../../../services/sdk';
import { MARKETING_BASE } from '../marketingCatalog';
import { SURVEY_STATUS_LABEL, SURVEY_STATUS_COLOR, QUESTION_TYPE_LABEL, NPS_CAT_LABEL, NPS_CAT_COLOR, LOOP_STATUS_LABEL } from './useSurveys';

type Tab = 'builder' | 'collect' | 'responses' | 'analytics' | 'certificates';

export default function SurveyDetail() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('builder');
  const [survey, setSurvey] = useState<MarketingSurvey | null>(null);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [kpi, setKpi] = useState<SurveyKpis | null>(null);
  const [sentiment, setSentiment] = useState({ positive: 0, neutral: 0, negative: 0 });
  const [certs, setCerts] = useState<SurveyCertificate[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!surveyId) return;
    const s = await marketingSurveyService.findById(surveyId);
    setSurvey(s as MarketingSurvey | null);
    const [q, r, k, sent, c] = await Promise.all([
      marketingSurveyService.listQuestions(surveyId),
      marketingSurveyResponseService.listForSurvey(surveyId),
      marketingSurveyResponseService.kpis(surveyId),
      marketingSurveyResponseService.sentimentBreakdown(surveyId),
      marketingSurveyResponseService.certificatesForSurvey(surveyId),
    ]);
    setQuestions(q); setResponses(r); setKpi(k); setSentiment(sent); setCerts(c);
  }, [surveyId]);
  useEffect(() => { load(); }, [load]);

  if (!survey) return <div className="p-8 text-center text-slate-400" dir="rtl">جارٍ التحميل…</div>;

  const TABS: Array<{ id: Tab; label: string; icon: typeof ListChecks }> = [
    { id: 'builder', label: 'الأسئلة', icon: ListChecks },
    { id: 'collect', label: 'جمع استجابة', icon: MessageSquareText },
    { id: 'responses', label: 'الاستجابات وإغلاق الحلقة', icon: Gauge },
    { id: 'analytics', label: 'التحليلات', icon: TrendingUp },
    ...(survey.is_quiz ? [{ id: 'certificates' as Tab, label: 'الشهادات', icon: Award }] : []),
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <button onClick={() => navigate(`${MARKETING_BASE}/surveys`)} className="flex items-center gap-1 text-sm text-fuchsia-600 hover:underline"><ChevronLeft size={16} /> كل الاستبيانات</button>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-black text-slate-800 text-lg">{survey.name}</h1>
            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${SURVEY_STATUS_COLOR[survey.status]}`}>{SURVEY_STATUS_LABEL[survey.status]}</span>
            <span className="text-[10px] bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{SURVEY_TYPE_LABEL[survey.survey_type]}</span>
          </div>
        </div>
        {survey.status === 'draft' && <button onClick={async () => { await marketingSurveyService.setStatus(survey.id, 'active'); load(); }} className="text-sm bg-fuchsia-600 text-white px-4 py-2 rounded-xl hover:bg-fuchsia-700">تفعيل</button>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap ${tab === t.id ? 'bg-gradient-to-br from-fuchsia-600 to-purple-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><Icon size={16} /> {t.label}</button>
        ); })}
      </div>

      {msg && <div className="text-sm text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-2 flex items-center gap-2"><CheckCircle2 size={15} /> {msg}</div>}

      {tab === 'builder' && <BuilderTab survey={survey} questions={questions} reload={load} busy={busy} setBusy={setBusy} />}
      {tab === 'collect' && <CollectTab surveyId={survey.id} questions={questions} reload={load} setMsg={setMsg} setTab={setTab} />}
      {tab === 'responses' && <ResponsesTab responses={responses} reload={load} setMsg={setMsg} userId={user?.id} />}
      {tab === 'analytics' && kpi && <AnalyticsTab survey={survey} kpi={kpi} sentiment={sentiment} />}
      {tab === 'certificates' && <CertificatesTab certs={certs} />}
    </div>
  );
}

// ── المنشئ ───────────────────────────────────────────────────────────────────
function BuilderTab({ survey, questions, reload, busy, setBusy }: { survey: MarketingSurvey; questions: SurveyQuestion[]; reload: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<{ question_type: QuestionType; question_text: string; options: string; correct_answer: string; points: number }>({ question_type: 'text', question_text: '', options: '', correct_answer: '', points: 10 });
  const add = async () => {
    if (!form.question_text.trim()) return; setBusy(true);
    try {
      const input: SurveyQuestionInput = {
        survey_id: survey.id, order_index: questions.length, question_type: form.question_type, question_text: form.question_text,
        options: form.options ? form.options.split(',').map((o) => o.trim()).filter(Boolean) : [],
        correct_answer: survey.is_quiz ? (form.correct_answer || null) : null, points: survey.is_quiz ? form.points : 0,
      };
      await marketingSurveyService.addQuestion(input); setShow(false); setForm({ question_type: 'text', question_text: '', options: '', correct_answer: '', points: 10 }); reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };
  const needsOptions = ['multiple_choice', 'single_choice', 'likert'].includes(form.question_type);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">الأسئلة ({questions.length})</h3><button onClick={() => setShow(true)} className="flex items-center gap-1.5 text-sm border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50"><Plus size={15} /> سؤال</button></div>
      {questions.length === 0 ? <p className="text-sm text-slate-400">لا أسئلة — أضف أسئلة (يُنصح بـ3-7 أسئلة).</p>
        : <div className="space-y-2">{questions.map((q, i) => (
            <div key={q.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <span className="w-7 h-7 rounded-full bg-fuchsia-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-700">{q.question_text}</p><p className="text-[11px] text-slate-400">{QUESTION_TYPE_LABEL[q.question_type]}{survey.is_quiz && q.points ? ` · ${q.points} نقطة` : ''}{q.options.length ? ` · ${q.options.length} خيارات` : ''}</p></div>
            </div>
          ))}</div>}
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">سؤال</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.question_type} onChange={(e) => setForm({ ...form, question_type: e.target.value as QuestionType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((k) => <option key={k} value={k}>{QUESTION_TYPE_LABEL[k]}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">نص السؤال *</label><textarea value={form.question_text} onChange={(e) => setForm({ ...form, question_text: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {needsOptions && <div><label className="text-xs text-slate-500">الخيارات (مفصولة بفاصلة)</label><input value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="خيار1، خيار2، خيار3" /></div>}
              {survey.is_quiz && <>
                <div><label className="text-xs text-slate-500">الإجابة الصحيحة</label><input value={form.correct_answer} onChange={(e) => setForm({ ...form, correct_answer: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">النقاط</label><input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: parseInt(e.target.value || '0', 10) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">حفظ</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── جمع استجابة (نموذج تعبئة يحاكي المستجيب) ────────────────────────────────
function CollectTab({ surveyId, questions, reload, setMsg, setTab }: { surveyId: string; questions: SurveyQuestion[]; reload: () => void; setMsg: (m: string | null) => void; setTab: (t: Tab) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false);
  const setAns = (qid: string, val: string) => setAnswers((p) => ({ ...p, [qid]: val }));
  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const payload: SurveyAnswerInput[] = questions.map((q) => {
        const raw = answers[q.id] ?? '';
        const isNum = ['nps', 'csat', 'ces', 'rating', 'number'].includes(q.question_type);
        return { question_id: q.id, text: isNum ? null : raw, number: isNum && raw !== '' ? Number(raw) : null };
      });
      await marketingSurveyResponseService.submit({ surveyId, answers: payload, name: name || 'مستجيب', channel: 'link' });
      setAnswers({}); setName(''); reload(); setMsg('تم تسجيل الاستجابة + حساب المقاييس تلقائياً.'); setTab('responses');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الإرسال'); } finally { setBusy(false); }
  };
  if (questions.length === 0) return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-400">أضف أسئلة أولاً من تبويب «الأسئلة».</div>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <p className="text-xs text-slate-500">نموذج تعبئة تجريبي (يحاكي المستجيب عبر أي قناة). في الإنتاج يُوزَّع الرابط عبر البريد/in-app/SMS/واتساب.</p>
      <div><label className="text-xs text-slate-500">اسم المستجيب</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
      {questions.map((q, i) => (
        <div key={q.id}>
          <label className="text-sm font-semibold text-slate-700">{i + 1}. {q.question_text}</label>
          {['nps', 'csat', 'ces', 'rating', 'number'].includes(q.question_type) ? (
            <input type="number" value={answers[q.id] ?? ''} onChange={(e) => setAns(q.id, e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder={q.question_type === 'nps' ? '0-10' : q.question_type === 'ces' ? '1-7' : '1-5'} />
          ) : q.options.length ? (
            <select value={answers[q.id] ?? ''} onChange={(e) => setAns(q.id, e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— اختر —</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          ) : q.question_type === 'yes_no' ? (
            <select value={answers[q.id] ?? ''} onChange={(e) => setAns(q.id, e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— اختر —</option><option value="نعم">نعم</option><option value="لا">لا</option></select>
          ) : (
            <textarea value={answers[q.id] ?? ''} onChange={(e) => setAns(q.id, e.target.value)} rows={2} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
          )}
        </div>
      ))}
      <button onClick={submit} disabled={busy} className="w-full bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'إرسال الاستجابة'}</button>
    </div>
  );
}

// ── الاستجابات + إغلاق الحلقة ─────────────────────────────────────────────────
function ResponsesTab({ responses, reload, setMsg, userId }: { responses: SurveyResponse[]; reload: () => void; setMsg: (m: string | null) => void; userId?: string }) {
  const [busy, setBusy] = useState(false);
  const act = async (id: string, action: 'assign' | 'resolve') => {
    setBusy(true); setMsg(null);
    try { await marketingSurveyResponseService.closeLoop(id, action, action === 'assign' ? userId : undefined); reload(); setMsg(action === 'assign' ? 'عُيّنت الاستجابة لموظف للمتابعة.' : 'أُغلقت الحلقة.'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'خطأ'); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-3">المستجيب</th><th className="text-center px-4 py-3">NPS</th><th className="text-center px-4 py-3">الفئة</th><th className="text-center px-4 py-3">الحلقة</th><th className="text-center px-4 py-3">إجراء</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {responses.length === 0 ? <tr><td colSpan={5} className="text-center py-10 text-slate-400">لا استجابات بعد.</td></tr>
            : responses.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3"><p className="font-semibold text-slate-800">{r.respondent_name || 'مجهول'}</p>{r.quiz_score != null && <p className="text-xs text-slate-400">اختبار: {r.quiz_score}% {r.quiz_passed ? '✓' : '✗'}</p>}</td>
                <td className="px-4 py-3 text-center font-black text-slate-700">{r.nps_score ?? '—'}</td>
                <td className="px-4 py-3 text-center">{r.nps_category ? <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${NPS_CAT_COLOR[r.nps_category]}`}>{NPS_CAT_LABEL[r.nps_category]}</span> : '—'}</td>
                <td className="px-4 py-3 text-center text-xs text-slate-500">{LOOP_STATUS_LABEL[r.loop_status]}</td>
                <td className="px-4 py-3 text-center">
                  {r.loop_status === 'open' && <button onClick={() => act(r.id, 'assign')} disabled={busy} className="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-1 rounded-lg hover:bg-rose-100 inline-flex items-center gap-1"><AlertTriangle size={11} /> تعيين للمتابعة</button>}
                  {r.loop_status === 'assigned' && <button onClick={() => act(r.id, 'resolve')} disabled={busy} className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-1 rounded-lg hover:bg-emerald-100">حلّ</button>}
                  {(r.loop_status === 'resolved' || r.loop_status === 'not_needed') && <span className="text-xs text-slate-300">—</span>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── التحليلات ────────────────────────────────────────────────────────────────
function AnalyticsTab({ survey, kpi, sentiment }: { survey: MarketingSurvey; kpi: SurveyKpis; sentiment: { positive: number; neutral: number; negative: number } }) {
  const sentTotal = sentiment.positive + sentiment.neutral + sentiment.negative || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{kpi.responses}</p><p className="text-xs text-slate-500">استجابات</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{kpi.nps}</p><p className="text-xs text-slate-500">NPS</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{kpi.csatAvg || '—'}</p><p className="text-xs text-slate-500">CSAT (متوسط)</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{kpi.cesAvg || '—'}</p><p className="text-xs text-slate-500">CES (متوسط)</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-black text-slate-800 mb-4">توزيع NPS</h3>
          <div className="space-y-3">
            {[
              { l: 'مروّجون', v: kpi.promoters, c: 'bg-emerald-500', icon: ThumbsUp },
              { l: 'محايدون', v: kpi.passives, c: 'bg-amber-400', icon: Meh },
              { l: 'منتقدون', v: kpi.detractors, c: 'bg-rose-500', icon: ThumbsDown },
            ].map((s) => { const Icon = s.icon; const total = kpi.promoters + kpi.passives + kpi.detractors || 1; return (
              <div key={s.l}><div className="flex justify-between text-xs mb-1"><span className="flex items-center gap-1 text-slate-600"><Icon size={13} /> {s.l}</span><span className="text-slate-400">{s.v}</span></div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${s.c}`} style={{ width: `${(s.v / total) * 100}%` }} /></div></div>
            ); })}
          </div>
          {kpi.openDetractors > 0 && <div className="mt-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-1"><AlertTriangle size={13} /> {kpi.openDetractors} منتقد بانتظار المتابعة ({LOOP_PLAYBOOK.detractor.window})</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-black text-slate-800 mb-1">تحليل المشاعر (Text Analytics)</h3>
          <p className="text-xs text-slate-500 mb-4">من الأسئلة النصية المفتوحة.</p>
          <div className="space-y-3">
            {[
              { l: 'إيجابي', v: sentiment.positive, c: 'bg-emerald-500' },
              { l: 'محايد', v: sentiment.neutral, c: 'bg-slate-400' },
              { l: 'سلبي', v: sentiment.negative, c: 'bg-rose-500' },
            ].map((s) => (
              <div key={s.l}><div className="flex justify-between text-xs mb-1"><span className="text-slate-600">{s.l}</span><span className="text-slate-400">{s.v}</span></div><div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${s.c}`} style={{ width: `${(s.v / sentTotal) * 100}%` }} /></div></div>
            ))}
          </div>
        </div>
      </div>
      {survey.survey_type === 'employee' && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">استبيان موظفين (eNPS) — لقياس مشاركة الموظفين.</div>}
    </div>
  );
}

// ── الشهادات ─────────────────────────────────────────────────────────────────
function CertificatesTab({ certs }: { certs: SurveyCertificate[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-4"><Award size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">الشهادات الصادرة ({certs.length})</h3></div>
      {certs.length === 0 ? <p className="text-sm text-slate-400">لا شهادات بعد — تُصدر تلقائياً للناجحين في الاختبار.</p>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {certs.map((c) => (
              <div key={c.id} className="rounded-xl border-2 border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 to-white p-4 text-center">
                <Award size={28} className="mx-auto text-fuchsia-500" />
                <p className="font-black text-slate-800 mt-2">{c.recipient_name}</p>
                <p className="text-xs text-slate-500">درجة: {c.score}%</p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">{c.certificate_no}</p>
                <p className="text-[10px] text-slate-400">{new Date(c.issued_at).toLocaleDateString('ar')}</p>
              </div>
            ))}
          </div>}
    </div>
  );
}
