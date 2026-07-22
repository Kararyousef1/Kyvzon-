/**
 * ContactDetailPage — سجل جهة اتصال 360°: بيانات + الجدول الزمني + Deduplication + GDPR.
 */
import { useCallback, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, User, Clock, Plus, X, GitMerge, Trash2, ShieldAlert, Building2, Mail, Phone,
} from 'lucide-react';
import {
  crmContactService, crmActivityService,
  type CrmContact, type CrmActivity, type DuplicateCandidate,
  type CrmActivityInput, type ActivityType,
  DECISION_ROLE_LABEL, DECISION_ROLE_COLOR, TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_ICON,
} from '../../../services/sdk';
import { useAsync } from './useContacts';
import { CRM_BASE } from '../crmCatalog';

function fmt(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d; }
}

export default function ContactDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const contact = useAsync<CrmContact | null>(() => crmContactService.findById(id), null, [id]);
  const timeline = useAsync<CrmActivity[]>(() => crmActivityService.timelineForContact(id), [], [id]);

  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CrmActivityInput>({ contact_id: id, activity_type: 'note', title: '', body: '' });

  const [dups, setDups] = useState<DuplicateCandidate[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  const reloadTimeline = useCallback(() => timeline.reload(), [timeline]);

  const logActivity = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try { await crmActivityService.logActivity({ ...form, contact_id: id }); setShow(false); setForm({ contact_id: id, activity_type: 'note', title: '', body: '' }); reloadTimeline(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  const checkDuplicates = async () => {
    setChecking(true); setMsg(null);
    try { const r = await crmContactService.findDuplicates(id); setDups(r); if (r.length === 0) setMsg('لا مكررات — السجل نظيف ✓'); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الفحص'); } finally { setChecking(false); }
  };
  const merge = async (mergedId: string) => {
    setBusy(true);
    try { await crmContactService.merge(id, mergedId); setMsg('تم الدمج بنجاح ✓'); setDups(null); timeline.reload(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الدمج'); } finally { setBusy(false); }
  };
  const gdprErase = async () => {
    if (!confirmErase) { setConfirmErase(true); return; }
    setBusy(true);
    try { await crmContactService.gdprErase(id); navigate(`${CRM_BASE}/contacts/people`); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر الحذف'); setBusy(false); setConfirmErase(false); }
  };

  if (contact.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (!contact.data) return (
    <div className="text-center py-16">
      <p className="text-slate-400">جهة الاتصال غير موجودة.</p>
      <Link to={`${CRM_BASE}/contacts/people`} className="text-cyan-600 text-sm mt-2 inline-block">← عودة</Link>
    </div>
  );

  const c = contact.data;

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${CRM_BASE}/contacts/people`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"><ArrowRight size={14} /> كل جهات الاتصال</button>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center"><User size={28} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800">{c.full_name}</h1>
              <p className="text-sm text-slate-400">{c.job_title || '—'}{c.department ? ` · ${c.department}` : ''}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${DECISION_ROLE_COLOR[c.decision_role]}`}>{DECISION_ROLE_LABEL[c.decision_role]}</span>
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TEMPERATURE_COLOR[c.temperature]}`}>{TEMPERATURE_LABEL[c.temperature]}</span>
                {c.lead_id && <span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-0.5 rounded-full">محوّل من التسويق</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={checkDuplicates} disabled={checking} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100"><GitMerge size={13} /> {checking ? 'فحص…' : 'كشف المكررات'}</button>
            <button onClick={gdprErase} disabled={busy} className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border ${confirmErase ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700' : 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100'}`}><Trash2 size={13} /> {confirmErase ? 'تأكيد الحذف النهائي؟' : 'حذف (GDPR)'}</button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2 text-sm text-slate-600"><Mail size={14} className="text-slate-400" /> {c.email || '—'}</div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><Phone size={14} className="text-slate-400" /> {c.mobile || c.phone || '—'}</div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><Building2 size={14} className="text-slate-400" /> {c.account_id ? <Link to={`${CRM_BASE}/contacts/accounts/${c.account_id}`} className="text-cyan-600 hover:underline">الحساب ←</Link> : '—'}</div>
          <div className="flex items-center gap-2 text-sm text-slate-600"><ShieldAlert size={14} className="text-slate-400" /> {c.consent_source || 'لا موافقة مسجلة'}</div>
        </div>
      </div>

      {msg && <div className="rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 px-4 py-2.5">{msg}</div>}

      {dups && dups.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <h3 className="font-bold text-amber-700 text-sm mb-2 flex items-center gap-2"><GitMerge size={16} /> مكررات محتملة ({dups.length})</h3>
          <div className="space-y-2">
            {dups.map((d) => (
              <div key={d.candidateId} className="flex items-center justify-between bg-white rounded-xl border border-amber-100 p-2.5">
                <div><p className="text-sm font-semibold text-slate-700">{d.fullName}</p><p className="text-xs text-slate-400">{d.email || d.phone || '—'} · {d.matchReason}</p></div>
                <button onClick={() => merge(d.candidateId)} disabled={busy} className="text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700 disabled:opacity-60">دمج في هذا السجل</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Clock size={16} className="text-cyan-600" /> الجدول الزمني الموحّد</h3>
          <button onClick={() => setShow(true)} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700"><Plus size={13} /> تسجيل نشاط</button>
        </div>
        {timeline.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : timeline.data.length === 0 ? <p className="text-slate-400 text-sm py-6 text-center">لا أنشطة بعد — سجّل أول تفاعل.</p>
            : <div className="relative pr-4 border-r-2 border-slate-100 space-y-4">
              {timeline.data.map((t) => (
                <div key={t.id} className="relative">
                  <span className="absolute -right-[22px] top-1 w-3 h-3 rounded-full bg-cyan-500 ring-4 ring-cyan-50" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg leading-none">{ACTIVITY_TYPE_ICON[t.activity_type]}</span>
                    <span className="text-sm font-semibold text-slate-800">{t.title}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{ACTIVITY_TYPE_LABEL[t.activity_type]}</span>
                    {t.logged_via !== 'manual' && <span className="text-[10px] bg-violet-50 text-violet-500 border border-violet-200 px-2 py-0.5 rounded-full">{t.logged_via === 'auto' ? 'تلقائي' : t.logged_via}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{fmt(t.occurred_at)}{t.duration_minutes ? ` · ${t.duration_minutes} دقيقة` : ''}</p>
                  {t.body && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{t.body}</p>}
                </div>
              ))}
            </div>}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">تسجيل نشاط</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">النوع</label><select value={form.activity_type} onChange={(e) => setForm({ ...form, activity_type: e.target.value as ActivityType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{(['note', 'call', 'meeting', 'email', 'task'] as ActivityType[]).map((k) => <option key={k} value={k}>{ACTIVITY_TYPE_LABEL[k]}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">العنوان *</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">التفاصيل</label><textarea value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={logActivity} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
