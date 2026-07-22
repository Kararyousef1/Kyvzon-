/**
 * AccountDetailPage — الرؤية 360° لحساب: مؤشرات + جهات الاتصال + الجدول الزمني +
 * الهيكل التنظيمي (Hierarchy) + تسجيل نشاط يدوي.
 */
import { useCallback, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Building2, Users, Clock, Activity as ActivityIcon, Plus, X, Network, HeartPulse,
} from 'lucide-react';
import {
  crmAccountService, crmContactService, crmActivityService,
  type CrmAccount, type CrmContact, type CrmActivity, type Account360,
  type CrmActivityInput, type ActivityType,
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_COLOR, ACCOUNT_TIER_LABEL,
  DECISION_ROLE_LABEL, ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_ICON,
} from '../../../services/sdk';
import { useAsync } from './useContacts';
import { CRM_BASE } from '../crmCatalog';

function fmt(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('ar', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d; }
}

export default function AccountDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const acc = useAsync<CrmAccount | null>(() => crmAccountService.findById(id), null, [id]);
  const kpis = useAsync<Account360 | null>(() => crmAccountService.account360(id), null, [id]);
  const contacts = useAsync<CrmContact[]>(() => crmContactService.listForAccount(id), [], [id]);
  const children = useAsync<CrmAccount[]>(() => crmAccountService.childAccounts(id), [], [id]);
  const timeline = useAsync<CrmActivity[]>(() => crmActivityService.timelineForAccount(id), [], [id]);

  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CrmActivityInput>({ account_id: id, activity_type: 'note', title: '', body: '' });

  const reloadAll = useCallback(() => { kpis.reload(); timeline.reload(); }, [kpis, timeline]);

  const logActivity = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    try { await crmActivityService.logActivity({ ...form, account_id: id }); setShow(false); setForm({ account_id: id, activity_type: 'note', title: '', body: '' }); reloadAll(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  if (acc.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (!acc.data) return (
    <div className="text-center py-16">
      <p className="text-slate-400">الحساب غير موجود.</p>
      <Link to={`${CRM_BASE}/contacts/accounts`} className="text-cyan-600 text-sm mt-2 inline-block">← عودة للحسابات</Link>
    </div>
  );

  const a = acc.data;
  const kpiCards = [
    { label: 'جهات الاتصال', value: kpis.data?.contactsCount ?? contacts.data.length, icon: Users, color: 'text-blue-600 bg-blue-50' },
    { label: 'إجمالي الأنشطة', value: kpis.data?.activitiesCount ?? timeline.data.length, icon: ActivityIcon, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'صحة الحساب', value: `${kpis.data?.healthScore ?? a.health_score}%`, icon: HeartPulse, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'آخر تواصل', value: fmt(kpis.data?.lastActivityAt ?? null), icon: Clock, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${CRM_BASE}/contacts/accounts`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"><ArrowRight size={14} /> كل الحسابات</button>

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center"><Building2 size={28} /></div>
            <div>
              <h1 className="text-xl font-black text-slate-800">{a.name}</h1>
              <p className="text-sm text-slate-400">{a.industry || '—'}{a.employee_count ? ` · ${a.employee_count} موظف` : ''}{a.country ? ` · ${a.country}` : ''}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${ACCOUNT_TYPE_COLOR[a.account_type]}`}>{ACCOUNT_TYPE_LABEL[a.account_type]}</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{ACCOUNT_TIER_LABEL[a.account_tier]}</span>
              </div>
            </div>
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400">القيمة الإجمالية (LTV)</p>
            <p className="text-2xl font-black text-emerald-600">{Number(a.lifetime_value).toLocaleString('ar')} <span className="text-sm">ر.س</span></p>
            {a.renewal_date && <p className="text-[11px] text-amber-600 mt-1">تجديد: {fmt(a.renewal_date)}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpiCards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
              <p className="text-lg font-black text-slate-800 mt-2.5">{c.value}</p>
              <p className="text-[11px] text-slate-400">{c.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* جهات الاتصال المرتبطة */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Users size={16} className="text-blue-600" /> جهات الاتصال ({contacts.data.length})</h3>
          {contacts.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : contacts.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا جهات اتصال مرتبطة.</p>
              : <div className="space-y-2">{contacts.data.map((c) => (
                <Link to={`${CRM_BASE}/contacts/people/${c.id}`} key={c.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-cyan-300">
                  <div><p className="text-sm font-semibold text-slate-700">{c.full_name}</p><p className="text-xs text-slate-400">{c.job_title || '—'}</p></div>
                  <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{DECISION_ROLE_LABEL[c.decision_role]}</span>
                </Link>
              ))}</div>}
        </div>

        {/* الهيكل التنظيمي */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Network size={16} className="text-violet-600" /> الهيكل التنظيمي</h3>
          {a.parent_account_id && (
            <div className="mb-2">
              <p className="text-[11px] text-slate-400 mb-1">الحساب الأم</p>
              <Link to={`${CRM_BASE}/contacts/accounts/${a.parent_account_id}`} className="text-sm text-cyan-600 hover:underline">عرض الحساب الأم ←</Link>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mb-1">الحسابات الفرعية ({children.data.length})</p>
          {children.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
            : children.data.length === 0 ? <p className="text-slate-400 text-xs py-2">لا حسابات فرعية.</p>
              : <div className="space-y-1.5">{children.data.map((c) => (
                <Link to={`${CRM_BASE}/contacts/accounts/${c.id}`} key={c.id} className="block p-2 rounded-lg border border-slate-100 hover:border-cyan-300 text-sm text-slate-700">{c.name}</Link>
              ))}</div>}
        </div>
      </div>

      {/* الجدول الزمني الموحّد */}
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
