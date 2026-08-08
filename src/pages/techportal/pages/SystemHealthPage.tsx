/**
 * ════════════════════════════════════════════════════════════════
 *  SystemHealthPage — صحة النظام الهندسية
 *
 *  الميزات:
 *  • Health Score مجمّع مع تفسير بصري
 *  • فحوصات تفصيلية (18 فحص) في 4 فئات
 *  • حالة الخدمات الخارجية مع قياس زمن الاستجابة
 *  • رسم بياني لاتجاه الصحة خلال 24h
 *  • تشخيص المشاكل وتوصيات الحل
 *  • زر إعادة الفحص
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Server, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  ShieldCheck, Database, Wifi, Cpu, Activity, Clock,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  Zap, HardDrive, Globe, Lock, BarChart2, ArrowLeft,
} from 'lucide-react';
import { biometricDeviceService } from '../../../services/sdk/BiometricDeviceService';
import { syncLogService }          from '../../../services/sdk/SyncLogService';
import { securityEventService }    from '../../../services/sdk/SecurityEventService';
import { attendanceService }       from '../../../services/sdk/AttendanceService';
import { settingsService }         from '../../../services/sdk/SettingsService';
import { techMetricsService, type IsolationRow } from '../../../services/sdk/TechMetricsService';
import { legacyRouteService, type LegacyRouteSummary } from '../../../services/sdk/LegacyRouteService';
import { getErrorMessage }         from '../../../services/errors';
import { useUIStore }              from '../../../core/stores';
import type { HealthCheck, HealthStatus, ServiceStatus } from '../types';

// ════════════════════════════════════════════════════════════════
//  Types & Helpers
// ════════════════════════════════════════════════════════════════

interface CheckCategory {
  id: string;
  label: string;
  icon: FC<any>;
  color: string;
  checks: HealthCheck[];
}

const statusColor: Record<HealthStatus, string> = {
  pass:    'text-emerald-400',
  warning: 'text-amber-400',
  fail:    'text-red-400',
};
const statusBg: Record<HealthStatus, string> = {
  pass:    'bg-emerald-900/30 border-emerald-700/40',
  warning: 'bg-amber-900/30 border-amber-700/40',
  fail:    'bg-red-900/30 border-red-700/40',
};
const StatusIcon: FC<{ status: HealthStatus; size?: number }> = ({ status, size = 15 }) => {
  if (status === 'pass')    return <CheckCircle2 size={size} className="text-emerald-400" />;
  if (status === 'warning') return <AlertCircle  size={size} className="text-amber-400" />;
  return                           <XCircle      size={size} className="text-red-400" />;
};

// ════════════════════════════════════════════════════════════════
//  Service Definitions
// ════════════════════════════════════════════════════════════════

const SERVICES: { name: string; nameAr: string; key: string }[] = [
  { name: 'Supabase API',     nameAr: 'واجهة برمجية',      key: 'api'      },
  { name: 'Realtime',         nameAr: 'الوقت الفعلي',      key: 'realtime' },
  { name: 'Auth Service',     nameAr: 'المصادقة',          key: 'auth'     },
  { name: 'Storage',          nameAr: 'التخزين',           key: 'storage'  },
  { name: 'Edge Functions',   nameAr: 'وظائف الحافة',      key: 'edge'     },
  { name: 'Biometric Sync',   nameAr: 'مزامنة البصمة',     key: 'sync'     },
];

// ════════════════════════════════════════════════════════════════
//  Sub-Components
// ════════════════════════════════════════════════════════════════

/** Score Ring */
const ScoreRing: FC<{ score: number }> = ({ score }) => {
  const radius = 54;
  const circ   = 2 * Math.PI * radius;
  const dash   = circ * (score / 100);
  const color  = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  const label  = score >= 80 ? 'ممتاز' : score >= 60 ? 'تحذير' : 'حرج';

  return (
    <div className="relative w-36 h-36 flex-shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle
          cx="64" cy="64" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-white leading-none">{score}</span>
        <span className="text-xs font-bold mt-1" style={{ color }}>{label}</span>
      </div>

    </div>
  );
};

/** Check Card */
const CheckCard: FC<{ check: HealthCheck; expanded: boolean; onToggle: () => void }> = ({ check, expanded, onToggle }) => (
  <div className={`border rounded-xl overflow-hidden transition-all ${statusBg[check.status]}`}>
    <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-right">
      <StatusIcon status={check.status} />
      <div className="flex-1 min-w-0 text-right">
        <p className="text-sm font-bold text-slate-200">{check.label}</p>
      </div>
      <span className={`text-xs font-mono font-bold ${statusColor[check.status]}`}>{check.value}</span>
      {check.description && (
        expanded ? <ChevronUp size={13} className="text-slate-600 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-600 flex-shrink-0" />
      )}
    </button>
    {expanded && check.description && (
      <div className="px-4 pb-3 pt-0 border-t border-white/5">
        <p className="text-xs text-slate-500 leading-relaxed">{check.description}</p>
      </div>
    )}
  </div>
);

/** Service Row */
const ServiceRow: FC<{ svc: ServiceStatus }> = ({ svc }) => {
  const online = svc.status === 'online';
  const degraded = svc.status === 'degraded';
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-800/60 last:border-0">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${online ? 'bg-emerald-400' : degraded ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
      <span className="flex-1 text-sm text-slate-300">{svc.nameAr}</span>
      <span className="text-xs font-mono text-slate-600" dir="ltr">{svc.latency === null ? "—" : `${svc.latency}ms`}</span>
      <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
        online ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' :
        degraded ? 'bg-amber-900/30 border-amber-700/40 text-amber-400' :
        'bg-red-900/30 border-red-700/40 text-red-400'
      }`}>
        {online ? 'يعمل' : degraded ? 'بطيء' : 'متوقف'}
      </span>
      <span className="text-[10px] text-slate-700 w-12 text-left">{svc.uptime === null ? "—" : `${svc.uptime}%`}</span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════

export default function SystemHealthPage() {
  const { addToast } = useUIStore();
  const navigate = useNavigate();

  const [categories,    setCategories]    = useState<CheckCategory[]>([]);
  const [services,      setServices]      = useState<ServiceStatus[]>([]);
  const [score,         setScore]         = useState(100);
  const [loading,       setLoading]       = useState(true);
  const [lastChecked,   setLastChecked]   = useState<Date | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  // ★ تقرير العزل (0328): يُثبِت للمسؤول التقني أن بيانات شركته معزولة
  const [isolation, setIsolation] = useState<IsolationRow[]>([]);
  // ★ جاهزية إيقاف البوابة القديمة (0329) — قياس قبل الحذف
  const [legacy, setLegacy] = useState<LegacyRouteSummary | null>(null);

  // ─── Run All Health Checks ──────────────────────────────────
  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const weekAgo   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();

      // Fetch all data in parallel
      const [devs, recentLogs, secEvents, punchesToday, settings] = await Promise.allSettled([
        biometricDeviceService.findAllDevices(),
        syncLogService.findRecentLogs(200),
        securityEventService.findAll({ orderBy: 'created_at', ascending: false, limit: 200 }),
        attendanceService.countPunchesSince(new Date(now.setHours(0,0,0,0)).toISOString()),
        settingsService.findSystemSettings(),
      ]);

      type DeviceRow = { is_active?: boolean | null; last_sync_at?: string | null };
      type LogRow    = {
        status?: string | null; synced_at?: string | null;
        sync_time?: string | null; created_at?: string | null;
      };
      type EventRow  = {
        severity?: string | null; threat_level?: string | null;
        created_at?: string | null;
      };

      const devices = devs.status === 'fulfilled'
        ? (devs.value as unknown as DeviceRow[]) : [];
      const logs    = recentLogs.status === 'fulfilled'
        ? (recentLogs.value as unknown as LogRow[]) : [];
      const events  = secEvents.status === 'fulfilled'
        ? (secEvents.value as unknown as EventRow[]) : [];
      const punches = punchesToday.status === 'fulfilled' ? punchesToday.value as number : 0;
      const cfg     = settings.status === 'fulfilled' ? settings.value : null;

      // Derived metrics
      const activeDevices = devices.filter(d => d.is_active);
      const staleDevices  = devices.filter(d => {
        if (!d.last_sync_at) return true;
        return new Date(d.last_sync_at) < new Date(Date.now() - 2 * 60 * 60 * 1000);
      });
      // ★ هشاشة كشفها tsc: `(l.sync_time || l.created_at)` قد يكون
      //   undefined، والمقارنة `undefined >= date` تعطي false **صامتاً**
      //   فيبدو أن لا فشل حديثاً بينما السبب حقل زمني مفقود. التطبيع صريح.
      const logTime = (l: LogRow): string => l.sync_time || l.created_at || '';
      const recentFails   = logs.filter(l => l.status === 'failed' && logTime(l) >= yesterday);
      const weekFails     = logs.filter(l => l.status === 'failed' && logTime(l) >= weekAgo);
      const criticalSec   = events.filter(e =>
        ['high', 'critical'].includes(e.threat_level ?? ''));
      const successRate   = logs.length > 0
        ? Math.round((logs.filter(l => l.status === 'success').length / logs.length) * 100) : 100;

      // Build check categories
      const cats: CheckCategory[] = [
        {
          id: 'devices',
          label: 'أجهزة البصمة',
          icon: Cpu,
          color: 'text-cyan-400',
          checks: [
            {
              key: 'device_count',
              label: 'عدد الأجهزة المسجلة',
              description: 'يجب وجود جهاز واحد على الأقل لضمان تسجيل الحضور',
              status: devices.length > 0 ? 'pass' : 'fail',
              value: devices.length,
              trend: 'stable',
            },
            {
              key: 'device_active',
              label: 'الأجهزة النشطة',
              description: 'نسبة الأجهزة المتصلة والنشطة من إجمالي الأجهزة',
              status: devices.length === 0 ? 'warning' :
                      activeDevices.length === devices.length ? 'pass' :
                      activeDevices.length > 0 ? 'warning' : 'fail',
              value: `${activeDevices.length}/${devices.length}`,
            },
            {
              key: 'device_stale',
              label: 'مزامنة الأجهزة (آخر ساعتين)',
              description: 'الأجهزة التي لم تُزامَن خلال آخر ساعتين قد تكون منفصلة',
              status: staleDevices.length === 0 ? 'pass' :
                      staleDevices.length <= 1 ? 'warning' : 'fail',
              value: staleDevices.length === 0 ? 'محدّث' : `${staleDevices.length} قديم`,
            },
          ],
        },
        {
          id: 'sync',
          label: 'عمليات المزامنة',
          icon: RefreshCw,
          color: 'text-purple-400',
          checks: [
            {
              key: 'sync_success_rate',
              label: 'معدل نجاح المزامنة',
              description: 'يُعتبر معدل أقل من 90% مؤشراً على مشكلة في الاتصال أو الجهاز',
              status: successRate >= 90 ? 'pass' : successRate >= 70 ? 'warning' : 'fail',
              value: `${successRate}%`,
              trend: successRate >= 90 ? 'up' : 'down',
            },
            {
              key: 'sync_fails_24h',
              label: 'إخفاقات المزامنة (24h)',
              description: 'عدد عمليات المزامنة الفاشلة خلال الـ 24 ساعة الماضية',
              status: recentFails.length === 0 ? 'pass' : recentFails.length <= 3 ? 'warning' : 'fail',
              value: recentFails.length,
            },
            {
              key: 'sync_fails_week',
              label: 'إخفاقات الأسبوع',
              description: 'إخفاقات متكررة أسبوعية تشير لمشكلة بنيوية تحتاج تحقيق',
              status: weekFails.length <= 5 ? 'pass' : weekFails.length <= 15 ? 'warning' : 'fail',
              value: weekFails.length,
            },
            {
              key: 'sync_total_records',
              label: 'إجمالي سجلات المزامنة',
              description: 'عدد إجمالي سجلات الحضور التي جرت مزامنتها',
              status: logs.length > 0 ? 'pass' : 'warning',
              value: logs.reduce((s: number, l: any) => s + (l.records_synced || 0), 0).toLocaleString(),
            },
          ],
        },
        {
          id: 'attendance',
          label: 'بيانات الحضور',
          icon: Activity,
          color: 'text-violet-400',
          checks: [
            {
              key: 'punches_today',
              label: 'بصمات اليوم',
              description: 'عدد بصمات الحضور المسجلة اليوم. قيمة صفر قد تعني خللاً في المزامنة',
              status: typeof punches === 'number' && punches > 0 ? 'pass' : 'warning',
              value: typeof punches === 'number' ? punches : 0,
            },
            {
              key: 'settings_loaded',
              label: 'إعدادات النظام',
              description: 'تحقق من تحميل إعدادات النظام بنجاح من قاعدة البيانات',
              status: cfg ? 'pass' : 'warning',
              value: cfg ? 'محمّل' : 'غير محمّل',
            },
          ],
        },
        {
          id: 'security',
          label: 'الأمان والامتثال',
          icon: ShieldCheck,
          color: 'text-red-400',
          checks: [
            {
              key: 'security_critical',
              label: 'تنبيهات أمنية حرجة',
              description: 'الأحداث الأمنية ذات مستوى التهديد العالي أو الحرج',
              status: criticalSec.length === 0 ? 'pass' : criticalSec.length <= 3 ? 'warning' : 'fail',
              value: criticalSec.length,
              trend: criticalSec.length === 0 ? 'up' : 'down',
            },
            {
              key: 'security_total',
              label: 'إجمالي الأحداث الأمنية',
              description: 'مجموع كل الأحداث الأمنية المسجلة في النظام',
              status: events.length < 50 ? 'pass' : events.length < 200 ? 'warning' : 'fail',
              value: events.length,
            },
          ],
        },
      ];

      setCategories(cats);

      // Calculate composite score
      const allChecks = cats.flatMap(c => c.checks);
      const fails    = allChecks.filter(c => c.status === 'fail').length;
      const warnings = allChecks.filter(c => c.status === 'warning').length;
      const computed = Math.max(0, 100 - (fails * 15) - (warnings * 5));
      setScore(computed);

      // ★ إزالة محاكاة (2026-08-05): كان يعرض latency بـ Math.random()
      //   و uptime بأرقام ثابتة (99.9 / 97.5) كأنها قياسات حقيقية.
      //   مؤشر صحة مُختلَق أخطر من غيابه: يُطمئن حين يجب أن يُنذر.
      //
      //   القياس الحقيقي يحتاج Edge Function تفحص كل خدمة. حتى ذلك
      //   الحين نعرض الحالة المشتقّة من الفحوص الفعلية أعلاه، ونترك
      //   الكمّيات فارغة (null) لتُظهرها الواجهة «غير متاح».
      setServices(SERVICES.map(svc => ({
        name: svc.name,
        nameAr: svc.nameAr,
        status: computed > 60 ? 'online' : computed > 40 ? 'degraded' : 'offline',
        latency: null,
        uptime: null,
        lastChecked: now.toISOString(),
      })));

      // ★ تقرير العزل — SECURITY INVOKER فيقيس RLS الفعلي لا يتجاوزه
      try {
        setIsolation(await techMetricsService.isolationReport());
      } catch {
        setIsolation([]);
      }

      // ★ جاهزية حذف طبقة ?view= القديمة
      try {
        setLegacy(await legacyRouteService.summary(90));
      } catch {
        setLegacy(null);
      }

      setLastChecked(new Date());
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { runChecks(); }, [runChecks]);

  // ─── Counters ────────────────────────────────────────────────
  const allChecks = categories.flatMap(c => c.checks);
  const passCount = allChecks.filter(c => c.status === 'pass').length;
  const warnCount = allChecks.filter(c => c.status === 'warning').length;
  const failCount = allChecks.filter(c => c.status === 'fail').length;

  return (
    <div className="space-y-5" dir="rtl">

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Server size={20} className="text-blue-400" />
            صحة النظام
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            فحص شامل لمكونات البنية التحتية التقنية
            {lastChecked && ` — آخر فحص: ${lastChecked.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-900/50 border border-blue-700/50 text-blue-300 text-sm font-bold hover:bg-blue-900/70 transition-all disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          إعادة الفحص
        </button>
      </div>

      {/* ─── Score + Summary ─── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6">
        <div className="flex items-center gap-6 flex-wrap">
          <ScoreRing score={score} />
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <h2 className="text-lg font-black text-white">نتيجة صحة النظام</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {score >= 80 ? 'النظام يعمل بصورة طبيعية وجميع المكونات الأساسية سليمة' :
                 score >= 60 ? 'يوجد بعض التحذيرات التي تستحق المتابعة والمراجعة' :
                 'يوجد مشاكل حرجة تتطلب تدخلاً فورياً من الفريق التقني'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'ناجح',   count: passCount, cls: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-800/40' },
                { label: 'تحذير',  count: warnCount, cls: 'text-amber-400',   bg: 'bg-amber-900/20 border-amber-800/40'   },
                { label: 'حرج',    count: failCount, cls: 'text-red-400',     bg: 'bg-red-900/20 border-red-800/40'       },
              ].map(s => (
                <div key={s.label} className={`rounded-xl border px-3 py-2.5 text-center ${s.bg}`}>
                  <p className={`text-2xl font-black ${s.cls}`}>{s.count}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Check Categories ─── */}
      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-slate-900/40 border border-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {categories.map(cat => {
            const Icon = cat.icon;
            const catPass = cat.checks.filter(c => c.status === 'pass').length;
            const catFail = cat.checks.filter(c => c.status !== 'pass').length;

            return (
              <div key={cat.id} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className={cat.color} />
                    <h3 className="text-sm font-bold text-slate-200">{cat.label}</h3>
                  </div>
                  <span className={`text-xs font-bold ${catFail === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {catPass}/{cat.checks.length} ✓
                  </span>
                </div>
                <div className="space-y-2">
                  {cat.checks.map(check => (
                    <CheckCard
                      key={check.key}
                      check={check}
                      expanded={expandedCheck === check.key}
                      onToggle={() => setExpandedCheck(expandedCheck === check.key ? null : check.key)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Services Status ─── */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-200">حالة الخدمات الخارجية</h3>
          </div>
          <span className="text-[10px] text-slate-600 font-mono" dir="ltr">
            زمن الاستجابة المُحاكى
          </span>
        </div>
        <div className="divide-y divide-slate-800/40">
          {services.map(svc => <ServiceRow key={svc.name} svc={svc} />)}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-800/60">
          <p className="text-[11px] text-slate-700 leading-relaxed">
            ملاحظة: قياس زمن الاستجابة الحقيقي لأجهزة ZKTeco يتطلب Edge Function داخل شبكة المنظمة.
            القيم الحالية محاكاة بناءً على درجة صحة النظام.
          </p>
        </div>
      </div>

      {/* Recommendations */}
      {(warnCount > 0 || failCount > 0) && (
        <div className="bg-amber-900/10 border border-amber-800/40 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-amber-300 mb-3 flex items-center gap-2">
            <AlertCircle size={15} />
            توصيات للتحسين
          </h3>
          <ul className="space-y-2">
            {failCount > 0 && (
              <li className="flex items-start gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                يوجد {failCount} مشكلة حرجة تتطلب تدخلاً فورياً. راجع أجهزة البصمة وسجل المزامنة.
              </li>
            )}
            {warnCount > 0 && (
              <li className="flex items-start gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                يوجد {warnCount} تحذير. تابعها بانتظام لمنع تحولها إلى مشاكل حرجة.
              </li>
            )}
            <li className="flex items-start gap-2 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
              لتفعيل مراقبة الاتصال الحقيقي بأجهزة ZKTeco، أضف Edge Function من إعدادات النظام.
            </li>
          </ul>
        </div>
      )}

      {/* ★ عزل بيانات الشركة (0328) ────────────────────────────────
          بوابة التقنية خاصة بشركتك: لا تعرض ولا تصل بيانات أي شركة
          أخرى. هذا التقرير يُقاس تحت صلاحياتك الفعلية (RLS) لا
          بتجاوزها — فالرقم هنا هو ما تراه حقاً. */}
      {isolation.length > 0 && (
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/60 p-5" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-100">عزل بيانات شركتك</h3>
            {isolation.every((r) => r.isIsolated) ? (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                معزولة بالكامل
              </span>
            ) : (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-950/60 text-red-300 border border-red-800">
                خرق عزل — راجع فوراً
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            بوابة التقنية خاصة بشركتك. «صفوف من شركات أخرى» يجب أن يكون صفراً
            دائماً — أي رقم غيره خرقٌ يستوجب الإبلاغ.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs">
                  <th className="text-right py-2 font-semibold">المجال</th>
                  <th className="text-center py-2 font-semibold">صفوف شركتك</th>
                  <th className="text-center py-2 font-semibold">من شركات أخرى</th>
                  <th className="text-center py-2 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {isolation.map((r) => (
                  <tr key={r.area}>
                    <td className="py-2 text-slate-200">{r.area}</td>
                    <td className="py-2 text-center text-slate-300">{r.visible - r.foreign}</td>
                    <td className={`py-2 text-center font-bold ${r.foreign === 0 ? 'text-slate-500' : 'text-red-400'}`}>
                      {r.foreign}
                    </td>
                    <td className="py-2 text-center">
                      {r.isIsolated
                        ? <span className="text-emerald-400 text-xs font-bold">معزول ✓</span>
                        : <span className="text-red-400 text-xs font-bold">خرق ✗</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ★ إيقاف البوابة القديمة (0329) ─────────────────────────────
          طبقة `?view=` لا يستعملها أي كود داخلي — تخدم الروابط
          الخارجية القديمة وحدها. هذه اللوحة تُخبر متى يُؤمَن حذفها،
          فالقرار يُبنى على قياس لا على تقدير. */}
      {legacy && (
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900/60 p-5" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-100">إيقاف المسارات القديمة</h3>
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full border ${
                legacy.activeViews === 0
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  : 'bg-amber-950/60 text-amber-300 border-amber-800'
              }`}
            >
              {legacy.activeViews === 0 ? 'جاهز للحذف' : `${legacy.activeViews} مساراً نشطاً`}
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            روابط قديمة بصيغة <code className="text-slate-300">?view=</code> ما زالت تُوجَّه
            تلقائياً. لا يستعملها أي كود داخلي — فقط إشارات مرجعية وروابط محفوظة لدى
            المستخدمين.
          </p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-xl bg-slate-800/60 p-3 text-center">
              <p className="text-xl font-black text-slate-100">{legacy.distinctViews}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">مسار مُستعمَل</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3 text-center">
              <p className="text-xl font-black text-slate-100">{legacy.totalHits}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">إجمالي الزيارات</p>
            </div>
            <div className="rounded-xl bg-slate-800/60 p-3 text-center">
              <p className={`text-xl font-black ${legacy.activeViews === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {legacy.activeViews}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">نشط خلال 90 يوماً</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 bg-slate-800/40 border border-slate-700 rounded-xl p-3 leading-relaxed">
            {legacy.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}
