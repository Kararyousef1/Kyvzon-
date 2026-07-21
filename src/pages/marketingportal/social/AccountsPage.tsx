/**
 * AccountsPage — إدارة الحسابات: ربط FB/IG/LinkedIn/X عبر OAuth (محاكاة) + حالة الاتصال.
 */
import { useState } from 'react';
import { Plus, X, Link2, CheckCircle2, Unplug } from 'lucide-react';
import { socialAccountService, type SocialAccountInput, type SocialPlatform } from '../../../services/sdk';
import { useAccounts, PLATFORM_LABEL } from './useSocial';

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin', 'x', 'tiktok'];

export default function AccountsPage() {
  const { data: accounts, loading, reload } = useAccounts();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<SocialAccountInput>({ platform: 'instagram', account_name: '', account_handle: '', followers: 0 });
  const [err, setErr] = useState<string | null>(null);

  const add = async () => {
    if (!form.account_name.trim()) { setErr('اسم الحساب مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await socialAccountService.createAccount(form); setShowAdd(false); setForm({ platform: 'instagram', account_name: '', account_handle: '', followers: 0 }); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const toggle = async (id: string, connected: boolean) => {
    setBusy(true);
    try { await (connected ? socialAccountService.disconnect(id) : socialAccountService.connect(id)); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${accounts.length} حساب`}</p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700"><Plus size={16} /> ربط حساب</button>
      </div>

      {accounts.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Link2 size={34} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">لا حسابات مربوطة</p><p className="text-xs text-slate-400 mt-1">اربط حساباتك لإدارة النشر والتفاعل من مكان واحد.</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 font-black flex items-center justify-center text-sm">{PLATFORM_LABEL[a.platform].slice(0, 2)}</span>
                  <div><p className="font-black text-slate-800">{a.account_name}</p><p className="text-xs text-slate-400">{a.account_handle || PLATFORM_LABEL[a.platform]}</p></div>
                </div>
                {a.is_connected
                  ? <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={13} /> متصل</span>
                  : <span className="text-slate-400 text-xs">غير متصل</span>}
              </div>
              <p className="text-[11px] text-slate-400 mt-3">{a.followers.toLocaleString()} متابع · {a.connection_mode === 'simulation' ? 'محاكاة OAuth' : 'OAuth'}</p>
              <button onClick={() => toggle(a.id, a.is_connected)} disabled={busy}
                className={`w-full mt-3 text-sm rounded-xl py-2 flex items-center justify-center gap-1.5 ${a.is_connected ? 'border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-fuchsia-600 text-white hover:bg-fuchsia-700'}`}>
                {a.is_connected ? <><Unplug size={14} /> فصل</> : <><Link2 size={14} /> ربط (OAuth)</>}
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">ربط حساب اجتماعي</h3><button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">المنصة</label>
                <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as SocialPlatform })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                  {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-500">اسم الحساب *</label><input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">المعرّف (handle)</label><input value={form.account_handle || ''} onChange={(e) => setForm({ ...form, account_handle: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="@kyvzon" /></div>
              <div><label className="text-xs text-slate-500">عدد المتابعين</label><input type="number" value={form.followers ?? 0} onChange={(e) => setForm({ ...form, followers: parseInt(e.target.value || '0', 10) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={add} disabled={busy} className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShowAdd(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
