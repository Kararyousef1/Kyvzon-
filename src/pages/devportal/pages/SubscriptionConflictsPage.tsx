/**
 * SubscriptionConflictsPage — كشف تعارضات الاشتراك
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي تسدّها:
 *
 *   تدقيق 0318 كشف أن أنواع الاشتراك متلابسة: عمودان بقائمتين مختلفتين
 *   (tenants.plan ∈ free·basic·pro·enterprise مقابل subscription_plan ∈
 *   basic·professional·enterprise·custom·hybrid)، ولا شيء يمنع تناقضهما.
 *
 *   0318 وحّدهما بمحفّز، وأضاف detect_subscription_conflicts() التي تكشف
 *   خمسة أنواع تعارض — لكنها بقيت **بلا واجهة**، فلا أحد يراها.
 *
 *   هذه الصفحة تعرضها في بوابة المطوّرين حيث تُدار الاشتراكات فعلاً.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * الأمان: الدالة محروسة بـ current_user_is_platform_admin() داخل
 *   الاستعلام — غير المطوّر يحصل على صفر صفوف لا على خطأ. والصفحة
 *   نفسها تحت /dev المحمي بـ RequireRole(['developer','it_admin']).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  platformService,
  type SubscriptionConflict,
} from '../../../services/sdk/PlatformService';
import { getErrorMessage } from '../../../services/errors';

/** لون كل نوع تعارض — الأمني أحمر والتشغيلي كهرماني */
const ISSUE_TONE: Record<string, string> = {
  'تعارض عمودَي الخطة': 'bg-rose-50 border-rose-200 text-rose-800',
  'هجين بلا صفحات': 'bg-rose-50 border-rose-200 text-rose-800',
  'اشتراك منتهٍ وما زال نشطاً': 'bg-rose-50 border-rose-200 text-rose-800',
  'صفحات مخصّصة بلا خطة هجينة': 'bg-amber-50 border-amber-200 text-amber-800',
  'وحدة بلا تفعيل': 'bg-amber-50 border-amber-200 text-amber-800',
};

/** شرح عملي لكل تعارض — ماذا يعني للعميل وكيف يُصلَح */
const ISSUE_HELP: Record<string, string> = {
  'تعارض عمودَي الخطة':
    'العمودان plan و subscription_plan غير متطابقين. محفّز 0318 يُصلحها عند أي تحديث للاشتراك.',
  'هجين بلا صفحات':
    'الخطة hybrid تعني «صفحات مُنتقاة»، وحقل features فارغ ⇒ مستخدمو هذه الشركة لا يرون أي صفحة. حدّد صفحاتها من «إدارة البوابات».',
  'صفحات مخصّصة بلا خطة هجينة':
    'features مملوءة لكن الخطة ليست hybrid ⇒ القائمة تُتجاهَل صامتةً. إمّا حوّل الخطة إلى hybrid أو امسح القائمة.',
  'اشتراك منتهٍ وما زال نشطاً':
    'تاريخ الانتهاء مضى وحالة الاشتراك active ⇒ الشركة تعمل بلا اشتراك ساري. راجع «إدارة الاشتراكات».',
  'وحدة بلا تفعيل':
    'مستخدمون أُسنِدت لهم وحدة غير مُفعَّلة للشركة في enabled_modules ⇒ يرون عناصر لا تعمل. فعّل الوحدة أو اسحب الإسناد.',
};

export default function SubscriptionConflictsPage() {
  const [rows, setRows] = useState<SubscriptionConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await platformService.findSubscriptionConflicts());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** تجميع حسب الشركة — السؤال «أي عميل عنده مشكلة» لا «كم صفاً» */
  const byTenant = useMemo(() => {
    const map = new Map<string, { name: string; items: SubscriptionConflict[] }>();
    for (const r of rows) {
      const e = map.get(r.tenantId) ?? { name: r.tenantName, items: [] };
      e.items.push(r);
      map.set(r.tenantId, e);
    }
    return [...map.entries()].map(([tenantId, v]) => ({ tenantId, ...v }));
  }, [rows]);

  const criticalCount = useMemo(
    () =>
      rows.filter((r) =>
        (ISSUE_TONE[r.issue] ?? '').includes('rose'),
      ).length,
    [rows],
  );

  return (
    <div className="space-y-5" dir="rtl">
      {/* ترويسة */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ShieldAlert className="text-cyan-600" size={22} />
            تعارضات الاشتراك
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            فحص آلي يكشف تلابس أنواع الاشتراك قبل أن يصير شكوى عميل.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:border-cyan-300"
        >
          <RefreshCw size={14} />
          إعادة الفحص
        </button>
      </div>

      {/* ملخّص */}
      {!loading && !error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">إجمالي التعارضات</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4">
            <p className="text-xs font-bold text-rose-700">حرجة</p>
            <p className="text-2xl font-black text-rose-800 mt-1">{criticalCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-500">شركات متأثرة</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{byTenant.length}</p>
          </div>
        </div>
      )}

      {/* شرح */}
      <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-4 flex gap-3">
        <Info className="text-cyan-600 shrink-0 mt-0.5" size={18} />
        <div className="text-xs text-slate-700 leading-relaxed space-y-1">
          <p className="font-bold text-slate-900">لماذا تحدث هذه التعارضات؟</p>
          <p>
            النظام يحمل عمودين للخطة: <b>subscription_plan</b> (مصدر الحقيقة الذي
            تقرأه الواجهة) و<b>plan</b> القديم. وحّدهما مايجريشن 0318 بمحفّز يشتقّ
            الثاني من الأول، لكن الشركات التي كانت متضاربة قبله — أو التي عُدِّلت
            بيانات اشتراكها مباشرةً — قد تظهر هنا.
          </p>
        </div>
      </div>

      {/* الحالات */}
      {loading && (
        <p className="text-sm text-slate-400 text-center py-10">جارٍ الفحص…</p>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center">
          <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={36} />
          <p className="font-black text-slate-800">لا تعارضات</p>
          <p className="text-sm text-slate-500 mt-1">
            كل الشركات متّسقة: الخطط متطابقة، والوحدات المُسنَدة مُفعَّلة،
            ولا اشتراك منتهٍ يعمل.
          </p>
        </div>
      )}

      {!loading && !error && byTenant.length > 0 && (
        <div className="space-y-3">
          {byTenant.map((t) => (
            <div
              key={t.tenantId}
              className="rounded-2xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                <span className="font-black text-slate-900">{t.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-bold">
                  {t.items.length} تعارض
                </span>
              </div>

              <div className="space-y-2">
                {t.items.map((it, i) => (
                  <div
                    key={`${it.tenantId}-${it.issue}-${i}`}
                    className={`rounded-xl border p-3 ${
                      ISSUE_TONE[it.issue] ?? 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-black">{it.issue}</p>
                        <p className="text-xs mt-0.5 opacity-90">{it.detail}</p>
                        {ISSUE_HELP[it.issue] && (
                          <p className="text-[11px] mt-1.5 opacity-75 leading-relaxed">
                            ← {ISSUE_HELP[it.issue]}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
