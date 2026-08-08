/**
 * EnforcementConsolePage — وحدة تحكّم إقفال الاشتراك
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الخلفية:
 *
 *   0320 أقفل الاشتراك على مستوى القاعدة (308 سياسة RESTRICTIVE على
 *   جداول المخزون والتصنيع والمشتريات وCRM والعقود — التي كانت بلا أي
 *   حراسة اشتراك). لكن الإقفال الفوري كان سيقطع كل بوابة لكل عميل،
 *   لأن tenants.enabled_modules افتراضيه {employee} وغالباً غير محدَّث.
 *
 *   لذلك بدأ كل المستأجرين عند mode='off' — والتشغيل يدوي بوعي.
 *   هذه الشاشة هي أداة ذلك التشغيل.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ★ مبدأ التصميم: الشاشة تقود المشغّل ولا تتركه يجتهد.
 *
 *   • التوصية تأتي من القاعدة (out_readiness) لا من منطق واجهة يمكن
 *     أن ينحرف عن قواعد الإقفال.
 *   • زرّ «إقفال» **معطّل** حتى تُراجَع المحاولات — والقاعدة ترفضه
 *     أيضاً (MUST_AUDIT_BEFORE_ENFORCE). حارسان لا واحد.
 *   • تأكيد الإقفال داخل Modal يعرض الأثر المتوقَّع أولاً.
 *
 * الأمان: كل الدوال محروسة بـ current_user_is_platform_admin() داخل
 *   الاستعلام — غير المطوّر يحصل على صفر صفوف. والصفحة تحت /dev.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  platformService,
  type EnforcementImpactRow,
  type EnforcementMode,
  type EnforcementModuleDetail,
  type EnforcementTenantRow,
} from '../../../services/sdk/PlatformService';
import { getErrorMessage } from '../../../services/errors';

const MODE_META: Record<EnforcementMode, { label: string; tone: string; hint: string }> = {
  off: {
    label: 'معطّل',
    tone: 'bg-slate-100 text-slate-600 border-slate-200',
    hint: 'لا إقفال — السلوك الحالي بلا تغيير',
  },
  audit: {
    label: 'مراقبة',
    tone: 'bg-amber-100 text-amber-800 border-amber-300',
    hint: 'يُسجَّل الانتهاك ولا يُمنع',
  },
  enforce: {
    label: 'مُقفَل',
    tone: 'bg-rose-100 text-rose-800 border-rose-300',
    hint: 'الوحدات خارج الاشتراك ممنوعة فعلياً',
  },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function EnforcementConsolePage() {
  const [rows, setRows] = useState<EnforcementTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  /** الشركة المفتوحة تفاصيلها */
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EnforcementModuleDetail[]>([]);
  const [impact, setImpact] = useState<EnforcementImpactRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  /** تأكيد الإقفال */
  const [confirmRow, setConfirmRow] = useState<EnforcementTenantRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await platformService.findEnforcementOverview());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const openDetail = useCallback(async (tenantId: string) => {
    if (openId === tenantId) {
      setOpenId(null);
      return;
    }
    setOpenId(tenantId);
    setDetailLoading(true);
    try {
      const [d, i] = await Promise.all([
        platformService.findEnforcementDetail(tenantId),
        platformService.previewImpact(tenantId),
      ]);
      setDetail(d);
      setImpact(i);
    } catch (err) {
      setToast({ text: getErrorMessage(err), ok: false });
    } finally {
      setDetailLoading(false);
    }
  }, [openId]);

  const changeMode = useCallback(
    async (row: EnforcementTenantRow, mode: EnforcementMode) => {
      setBusyId(row.tenantId);
      try {
        const msg = await platformService.setEnforcementMode(row.tenantId, mode);
        setToast({ text: `${row.tenantName}: ${msg}`, ok: true });
        setConfirmRow(null);
        await load();
      } catch (err) {
        setToast({ text: getErrorMessage(err), ok: false });
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      off: rows.filter((r) => r.mode === 'off').length,
      audit: rows.filter((r) => r.mode === 'audit').length,
      enforce: rows.filter((r) => r.mode === 'enforce').length,
      ready: rows.filter((r) => r.mode === 'audit' && r.wouldBlock === 0).length,
    }),
    [rows],
  );

  return (
    <div className="space-y-5" dir="rtl">
      {/* ترويسة */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ShieldCheck className="text-cyan-600" size={22} />
            إقفال الاشتراك
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            تشغيل حراسة الوحدات على مستوى قاعدة البيانات — شركةً شركة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-cyan-300"
        >
          <RefreshCw size={14} />
          تحديث
        </button>
      </div>

      {/* تنبيه */}
      {toast && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            toast.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* ملخّص */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">الشركات</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{stats.total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">معطّل</p>
            <p className="text-2xl font-black text-slate-500 mt-1">{stats.off}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-xs font-bold text-amber-700">مراقبة</p>
            <p className="text-2xl font-black text-amber-800 mt-1">{stats.audit}</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
            <p className="text-xs font-bold text-rose-700">مُقفَل</p>
            <p className="text-2xl font-black text-rose-800 mt-1">{stats.enforce}</p>
          </div>
        </div>
      )}

      {/* شرح المسار */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 flex gap-3">
        <Info className="text-cyan-600 shrink-0 mt-0.5" size={18} />
        <div className="text-xs text-slate-700 leading-relaxed space-y-1">
          <p className="font-bold text-slate-900">المسار الآمن: معطّل ← مراقبة ← مُقفَل</p>
          <p>
            <b>مراقبة</b> تُسجّل كل محاولة وصول لوحدة خارج الاشتراك <b>دون منعها</b>.
            اتركها أسبوعاً ليمرّ الاستعمال الشهري، ثم راجع السجل: إن ظهرت وحدة
            <b> يجب</b> أن تملكها الشركة فأضِفها إلى بواباتها المفعّلة أولاً.
          </p>
          <p className="text-cyan-800 font-bold">
            القاعدة تمنع القفز من «معطّل» إلى «مُقفَل» مباشرةً — وهذا حارس مقصود.
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-slate-400 text-center py-10">جارٍ التحميل…</p>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="font-bold text-slate-600">لا شركات</p>
          <p className="text-xs text-slate-400 mt-1">
            هذه الشاشة متاحة لمطوّري المنصة فقط.
          </p>
        </div>
      )}

      {/* الشركات */}
      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((r) => {
            const meta = MODE_META[r.mode];
            const isOpen = openId === r.tenantId;
            const busy = busyId === r.tenantId;
            const readyToLock = r.mode === 'audit';

            return (
              <div
                key={r.tenantId}
                className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900">{r.tenantName}</span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-lg font-black border ${meta.tone}`}
                          title={meta.hint}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-bold">
                          {r.subscriptionPlan}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 mt-1">
                        البوابات المفعّلة:{' '}
                        <span className="font-bold text-slate-700">
                          {r.enabledModules.length > 0
                            ? r.enabledModules.join(' · ')
                            : '— لا شيء'}
                        </span>
                      </p>

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-[11px]">
                        {r.wouldBlock > 0 && (
                          <span className="text-amber-700 font-bold">
                            {r.wouldBlock} محاولة مُسجَّلة
                          </span>
                        )}
                        {r.blocked > 0 && (
                          <span className="text-rose-700 font-bold">
                            {r.blocked} محاولة ممنوعة
                          </span>
                        )}
                        {r.lastAttempt && (
                          <span className="text-slate-400">آخرها {fmtDate(r.lastAttempt)}</span>
                        )}
                      </div>

                      {/* التوصية من القاعدة */}
                      <p
                        className={`text-xs mt-2 font-bold ${
                          r.readiness.startsWith('جاهز')
                            ? 'text-emerald-700'
                            : r.readiness.startsWith('راجع')
                              ? 'text-amber-700'
                              : 'text-slate-500'
                        }`}
                      >
                        ← {r.readiness}
                      </p>
                    </div>

                    {/* الإجراءات */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => void openDetail(r.tenantId)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:border-cyan-300"
                      >
                        <Eye size={13} />
                        {isOpen ? 'إخفاء' : 'التفاصيل'}
                      </button>

                      {r.mode !== 'audit' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void changeMode(r, 'audit')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />}
                          مراقبة
                        </button>
                      )}

                      {r.mode !== 'enforce' && (
                        <button
                          type="button"
                          disabled={busy || !readyToLock}
                          title={
                            readyToLock
                              ? 'إقفال الوحدات خارج الاشتراك'
                              : 'شغّل وضع المراقبة أولاً — القاعدة تمنع القفز المباشر'
                          }
                          onClick={() => setConfirmRow(r)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Lock size={13} />
                          إقفال
                        </button>
                      )}

                      {r.mode !== 'off' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void changeMode(r, 'off')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:border-slate-400 disabled:opacity-50"
                        >
                          <Unlock size={13} />
                          تعطيل
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* التفاصيل */}
                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-4">
                    {detailLoading && (
                      <p className="text-xs text-slate-400">جارٍ تحميل التفاصيل…</p>
                    )}

                    {!detailLoading && (
                      <>
                        <div>
                          <h4 className="text-xs font-black text-slate-700 mb-2">
                            محاولات الوصول المُسجَّلة
                          </h4>
                          {detail.length === 0 ? (
                            <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-3">
                              لا محاولات — إمّا أن الوضع «معطّل» فلا تسجيل، أو أن
                              الشركة لا تستعمل وحدات خارج اشتراكها.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {detail.map((d) => (
                                <div
                                  key={d.module}
                                  className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-wrap"
                                >
                                  <span className="text-xs font-black text-slate-800">
                                    {d.module}
                                  </span>
                                  <div className="flex items-center gap-3 text-[11px]">
                                    {d.wouldBlock > 0 && (
                                      <span className="text-amber-700 font-bold">
                                        {d.wouldBlock} مُسجَّلة
                                      </span>
                                    )}
                                    {d.blocked > 0 && (
                                      <span className="text-rose-700 font-bold">
                                        {d.blocked} ممنوعة
                                      </span>
                                    )}
                                    <span className="text-slate-500">
                                      {d.users} مستخدم
                                    </span>
                                    <span className="text-slate-400">
                                      {fmtDate(d.lastSeen)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-xs font-black text-slate-700 mb-2">
                            الأثر المتوقَّع عند الإقفال
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {impact.map((i) => (
                              <div
                                key={i.module}
                                className={`rounded-xl border px-3 py-2 text-[11px] ${
                                  i.allowed
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : i.rowCount > 0
                                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                                      : 'bg-white border-slate-200 text-slate-500'
                                }`}
                              >
                                <span className="font-black">{i.module}</span>
                                <span className="mr-1.5">· {i.note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* تأكيد الإقفال */}
      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6" dir="rtl">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="font-black text-slate-900">
                  إقفال الوحدات لـ «{confirmRow.tenantName}»؟
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ستُمنَع كل وحدة خارج بوابات الشركة المفعّلة — على مستوى قاعدة
                  البيانات لا الواجهة.
                </p>
              </div>
            </div>

            {confirmRow.wouldBlock > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed mb-4">
                <b>تنبيه:</b> سُجّلت {confirmRow.wouldBlock} محاولة وصول على{' '}
                {confirmRow.distinctModules} وحدة أثناء المراقبة. إن كانت أيٌّ منها
                وحدةً <b>يجب</b> أن تملكها الشركة، أضِفها إلى بواباتها المفعّلة
                <b> قبل</b> الإقفال — وإلا سيتعطّل عمل مستخدميها.
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 mb-4 flex items-start gap-2">
                <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
                <span>
                  لا محاولات مُسجَّلة أثناء المراقبة — الإقفال آمن على الأرجح.
                </span>
              </div>
            )}

            <p className="text-[11px] text-slate-500 mb-4">
              التراجع فوري: زرّ «تعطيل» يُعيد الوضع لحظياً بلا نشر ولا مايجريشن.
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmRow(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700"
              >
                <X size={14} />
                تراجع
              </button>
              <button
                type="button"
                disabled={busyId === confirmRow.tenantId}
                onClick={() => void changeMode(confirmRow, 'enforce')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                {busyId === confirmRow.tenantId ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <Lock size={14} />
                )}
                تأكيد الإقفال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
