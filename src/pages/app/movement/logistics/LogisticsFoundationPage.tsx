import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Settings, Sliders } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { getErrorMessage } from '../../../../services/errors';
import Button from '../../../../shared/components/ui/Button';
import {
  movementTelemetryService,
  NOTIFICATION_KIND_LABELS,
  type DispatchHealth,
  type NotificationDispatchStatus,
  CRON_HEALTH_LABELS,
  type CronHealth,
  type CronJobHealth,
  type LegacyMigrationStatus,
} from '../../../../services/sdk/MovementTelemetryService';
import Card from '../../../../shared/components/ui/Card';
import { MovementUnitNav } from '../shared/MovementUnitNav';

const HEALTH_STYLE: Record<DispatchHealth, { badge: string; label: string }> = {
  healthy:     { badge: 'bg-emerald-50 text-emerald-700', label: 'يعمل اليوم' },
  stale:       { badge: 'bg-amber-50 text-amber-700',     label: 'متأخر' },
  not_running: { badge: 'bg-rose-50 text-rose-700',       label: 'متوقف' },
};

export default function LogisticsFoundationPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<NotificationDispatchStatus[]>([]);
  /* صحة pg_cron (0290) — تكشف مهمة لم تُجدوَل أصلاً */
  const [cron, setCron] = useState<CronJobHealth[]>([]);
  /* حالة ترحيل النظام القديم (0292/0293) */
  const [legacy, setLegacy] = useState<LegacyMigrationStatus[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [st, ch, lg] = await Promise.all([
        movementTelemetryService.findDispatchStatus(),
        movementTelemetryService.findCronHealth().catch(() => []),
        movementTelemetryService.findLegacyMigrationStatus().catch(() => []),
      ]);
      setStatus(st);
      setCron(ch);
      setLegacy(lg);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void loadData(); }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_foundation" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Settings /> إعدادات البنية اللوجستية</h2>
          <p className="text-white/75 mt-2 text-sm">تكوين المعلمات الأساسية للأسطول، وحدات القياس، وسياسات التتبع والوقود.</p>
        </div>
      </div>

      <Card>
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Sliders size={18} /> إعدادات النظام اللوجستي الافتراضية</h3>
          <p className="text-sm text-slate-600">هذه الوحدة تدير الثوابت والسياسات الخاصة بجميع وحدات النقل واللوجستيات (L01 إلى L11).</p>
        </div>
      </Card>

      {/* حالة ترحيل النظام القديم (0292/0293) */}
      {legacy.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
            <Sliders size={18} /> ترحيل بيانات النظام القديم
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            حارس البوابة القديم ما زال يكتب في <code className="font-mono">movements_log</code> و
            <code className="font-mono">movement_permits</code>. محفّزات المزامنة تنقل كل صف
            إلى البوابة الجديدة لحظياً. <strong>«متبقٍّ» يجب أن يبقى صفراً.</strong>
          </p>
          <div className="space-y-2">
            {legacy.map((r) => {
              const clean = Number(r.pending_rows) === 0;
              return (
                <div key={r.legacy_table}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-sm ${
                    clean ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold">{r.legacy_table}</p>
                    <p className="text-[11px] opacity-80">← {r.target_table}</p>
                  </div>
                  <div className="text-left whitespace-nowrap text-xs">
                    <p><strong>{r.migrated_rows}</strong> / {r.legacy_rows} مُرحَّل</p>
                    <p className="font-bold mt-0.5">
                      {clean ? '✓ لا انقسام' : `⚠ ${r.pending_rows} متبقٍّ`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* صحة المهام المجدولة (0290) — تشغيل المهمة نفسها لا أثرها */}
      <Card>
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Sliders size={18} /> صحة المهام المجدولة
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          تقيس تشغيل المهمة نفسها عبر pg_cron. مهمة <strong>لم تُشغَّل قط</strong> تعني
          أن الجدولة غير مفعَّلة على هذه القاعدة — لا أن لا شيء يستحق الإشعار.
        </p>
        {cron.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center border border-dashed rounded-xl">
            تعذّرت قراءة صحة الجدولة — تأكد من تطبيق المايجريشن 0290.
          </p>
        ) : (
          <div className="space-y-2">
            {cron.map((j) => {
              const tone: Record<CronHealth, string> = {
                healthy:   'bg-emerald-50 text-emerald-700 border-emerald-200',
                stale:     'bg-amber-50 text-amber-700 border-amber-200',
                failing:   'bg-rose-50 text-rose-700 border-rose-200',
                stuck:     'bg-rose-50 text-rose-700 border-rose-200',
                never_ran: 'bg-slate-100 text-slate-600 border-slate-200',
              };
              return (
                <div key={j.job_name}
                  className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-sm ${tone[j.health]}`}>
                  <div className="min-w-0">
                    <p className="font-bold">{j.label_ar}</p>
                    <p className="text-[11px] opacity-80 font-mono">{j.job_name}</p>
                    {j.error_message && (
                      <p className="text-[11px] mt-1 opacity-90">{j.error_message}</p>
                    )}
                  </div>
                  <div className="text-left whitespace-nowrap">
                    <span className="px-2.5 py-1 rounded-full bg-white/70 text-xs font-bold">
                      {CRON_HEALTH_LABELS[j.health]}
                    </span>
                    <p className="text-[11px] opacity-80 mt-1">
                      {j.last_run_at
                        ? new Date(j.last_run_at).toLocaleString('ar-IQ')
                        : 'لا تشغيل مسجَّل'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/*
        حالة الجدولة التلقائية — تكشف توقّف cron بصمت.
        الإشعارات تُولَّد عبر Edge Function `movement-daily-notifications`
        بصلاحية service_role، لا من المتصفح.
      */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Sliders size={18} /> حالة الإشعارات المجدولة
          </h3>
          <Button variant="secondary" onClick={() => void loadData()}
            icon={<RefreshCw size={14} />} iconPosition="left">تحديث</Button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-slate-400" size={26} />
          </div>
        ) : status.length === 0 ? (
          <div className="border border-rose-200 bg-rose-50 rounded-xl p-4 text-sm text-rose-700">
            <AlertTriangle size={15} className="inline ml-1" />
            لم يُسجَّل أي إرسال إشعارات بعد. إن كانت الجدولة مُعدَّة، تحقق من تشغيل
            الوظيفة <span className="font-mono text-xs">movement-daily-notifications</span> ومن
            ضبط <span className="font-mono text-xs">CRON_SECRET</span>.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {status.map((s) => {
              const tone = HEALTH_STYLE[s.dispatch_health] ?? HEALTH_STYLE.not_running;
              return (
                <div key={s.notification_kind} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      {NOTIFICATION_KIND_LABELS[s.notification_kind] ?? s.notification_kind}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${tone.badge}`}>
                      {tone.label}
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 mt-1">{s.dispatched_today}</p>
                  <p className="text-[11px] text-slate-500">أُرسل اليوم</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    آخر إرسال: {s.last_dispatch_date ?? '—'}
                    {s.days_since_last !== null && s.days_since_last > 0
                      ? ` (منذ ${s.days_since_last} يوماً)` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-xl p-3">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            التنبيهات المُغطّاة: رخص السائقين · وثائق المركبات · التصاريح المتأخرة ·
            الرحلات المتأخرة · عقود الناقلين. لا يتكرر الإشعار نفسه لنفس الكيان في اليوم الواحد.
          </span>
        </div>
      </Card>
    </div>
  );
}
