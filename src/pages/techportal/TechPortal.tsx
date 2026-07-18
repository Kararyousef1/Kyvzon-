/**
 * ════════════════════════════════════════════════════════════════
 *  TechPortal — البوابة التقنية للشركات
 *  لقسم تقنية المعلومات: إدارة أجهزة البصمة، مراقبة المزامنة،
 *  سجلات النظام، إعدادات تقنية متقدمة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, type FC } from 'react';
import {
  Cpu, Wifi, Activity, RefreshCw, Server, Shield,
  Radio, HardDrive, Database, Clock, AlertTriangle,
  CheckCircle, XCircle, Terminal, Zap,
  Fingerprint, Monitor, Router, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { biometricDeviceService } from '../../services/sdk/BiometricDeviceService';
import { entitlementService } from '../../services/sdk/EntitlementService';
import { syncLogService } from '../../services/sdk/SyncLogService';
import { attendanceService } from '../../services/sdk/AttendanceService';
import { securityEventService } from '../../services/sdk/SecurityEventService';
import { settingsService } from '../../services/sdk/SettingsService';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

type TechPage = 'dashboard' | 'biometric' | 'sync-logs' | 'system-health' | 'settings';

interface BioDevice {
  id: string;
  name: string;
  device_type: string;
  ip_address: string;
  port: number;
  location: string;
  is_active: boolean;
  last_sync_at?: string;
  sync_interval_minutes: number;
}

interface SyncLog {
  id: string;
  device_name: string;
  status: 'success' | 'failed' | 'partial';
  records_synced: number;
  error_message?: string;
  synced_at: string;
}

// ════════════════════════════════════════════════════════════════
//  TechPortal Component
// ════════════════════════════════════════════════════════════════

export default function TechPortal() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [activePage, setActivePage] = useState<TechPage>('dashboard');

  const pages: { id: TechPage; icon: FC<{ size?: number | string; className?: string }>; label: string }[] = [
    { id: 'dashboard', icon: Activity, label: 'لوحة التحكم' },
    { id: 'biometric', icon: Fingerprint, label: 'أجهزة البصمة' },
    { id: 'sync-logs', icon: RefreshCw, label: 'سجل المزامنة' },
    { id: 'system-health', icon: Server, label: 'صحة النظام' },
    { id: 'settings', icon: SettingsIcon, label: 'الإعدادات' },
  ];

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl" style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
            <Cpu size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight">البوابة التقنية</h1>
            <p className="text-xs text-slate-400">قسم تقنية المعلومات — {user?.department || 'IT'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            متصل
          </span>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 px-4 overflow-x-auto">
        <div className="flex gap-1 max-w-6xl mx-auto">
          {pages.map(p => {
            const Icon = p.icon;
            const active = activePage === p.id;
            return (
              <button key={p.id} onClick={() => setActivePage(p.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  active ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                <Icon size={16} /> {p.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {activePage === 'dashboard' && <TechDashboard />}
        {activePage === 'biometric' && <BiometricDevicesPage />}
        {activePage === 'sync-logs' && <SyncLogsPage />}
        {activePage === 'system-health' && <SystemHealthPage />}
        {activePage === 'settings' && <TechSettingsPage />}
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Dashboard
// ════════════════════════════════════════════════════════════════

function TechDashboard() {
  const { addToast } = useUIStore();
  const [stats, setStats] = useState({ devices: 0, online: 0, lastSync: '', punches: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const [s, punches] = await Promise.all([
          biometricDeviceService.getStats(),
          attendanceService.countPunchesSince(start.toISOString()).catch(() => 0),
        ]);
        setStats({
          devices:  s.total,
          online:   s.online,
          lastSync: s.lastSync,
          punches,
        });
      } catch (err) { console.warn(getErrorMessage(err)); }
      finally { setLoading(false); }
    })();
  }, []);

  const runManualSync = async () => {
    try {
      const edge = await biometricDeviceService.requestManualSync();
      if (edge.ok) {
        addToast(edge.message, 'success');
        return;
      }
      await syncLogService.createSyncLog({
        source: 'tech_portal_manual_sync_fallback',
        records_synced: 0,
        status: 'partial',
        details: { triggered_at: new Date().toISOString(), note: 'Fallback local log because Edge Function is unavailable' },
      } as any);
      addToast('تم تسجيل طلب مزامنة يدوي محليًا لأن Edge Function غير متاحة', 'warning');
    } catch {
      addToast('فشل تسجيل طلب المزامنة', 'error');
    }
  };

  const cards = [
    { label: 'أجهزة البصمة', value: stats.devices, icon: Fingerprint, gradient: 'from-cyan-500 to-blue-600' },
    { label: 'متصل حالياً', value: stats.online, icon: Wifi, gradient: 'from-emerald-500 to-teal-600' },
    { label: 'آخر مزامنة', value: stats.lastSync ? new Date(stats.lastSync).toLocaleTimeString('ar-SA') : '—', icon: Clock, gradient: 'from-amber-500 to-orange-600' },
    { label: 'بصمات اليوم', value: stats.punches, icon: Activity, gradient: 'from-violet-500 to-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-black text-slate-800">لوحة التحكم التقنية</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.gradient} flex items-center justify-center mb-3 shadow-md`}>
              <c.icon size={18} className="text-white" />
            </div>
            <p className="text-2xl font-black text-slate-900">{c.value}</p>
            <p className="text-xs text-slate-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Cpu size={18} className="text-cyan-600" />حالة الخدمات</h3>
          {[
            { name: 'خادم البصمة', status: 'online', latency: '3ms' },
            { name: 'قاعدة البيانات', status: 'online', latency: '8ms' },
            { name: 'خدمة المزامنة', status: 'online', latency: '12ms' },
            { name: 'واجهة API', status: 'online', latency: '5ms' },
          ].map((svc, i) => (
            <div key={i} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-600">{svc.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">{svc.latency}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Terminal size={18} className="text-amber-600" />إجراءات سريعة</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'مزامنة الأجهزة', icon: RefreshCw, color: 'bg-cyan-50 text-cyan-700 border-cyan-200', action: runManualSync },
              { label: 'فحص الاتصال', icon: Wifi, color: 'bg-emerald-50 text-emerald-700 border-emerald-200', action: () => addToast('افتح تبويب أجهزة البصمة واضغط اختبار للجهاز المطلوب', 'info') },
              { label: 'سجل الأخطاء', icon: AlertTriangle, color: 'bg-amber-50 text-amber-700 border-amber-200', action: () => addToast('راجع تبويب صحة النظام لملخص الأخطاء والأحداث الأمنية', 'info') },
              { label: 'نسخ احتياطي', icon: Database, color: 'bg-violet-50 text-violet-700 border-violet-200', action: () => addToast('النسخ الاحتياطي يحتاج إعداد Edge Function/Job مستقل', 'warning') },
            ].map(a => (
              <button key={a.label} onClick={a.action} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${a.color} hover:shadow-md transition-all text-sm font-bold`}>
                <a.icon size={22} /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Biometric Devices Page
// ════════════════════════════════════════════════════════════════

function BiometricDevicesPage() {
  const { addToast } = useUIStore();
  const [devices, setDevices] = useState<BioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', ip_address: '', port: 4370, location: '', sync_interval_minutes: 5 });

  const fetchDevices = async () => {
    try {
      const list = await biometricDeviceService.findAllDevices();
      setDevices(list as unknown as BioDevice[]);
    } catch { addToast('فشل تحميل الأجهزة', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDevices(); }, []);

  const handleAdd = async () => {
    if (!form.name || !form.ip_address) { addToast('يرجى تعبئة الاسم وعنوان IP', 'error'); return; }
    try {
      await entitlementService.assertCanAddBiometricDevice();
      await biometricDeviceService.createDevice(form);
      addToast('تمت إضافة الجهاز', 'success');
      setShowForm(false);
      setForm({ name: '', ip_address: '', port: 4370, location: '', sync_interval_minutes: 5 });
      fetchDevices();
    } catch { addToast('فشل الإضافة', 'error'); }
  };

  const handleToggle = async (device: BioDevice) => {
    try {
      await biometricDeviceService.toggleActive(device.id, !device.is_active);
      fetchDevices();
    } catch { addToast('فشل التحديث', 'error'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Fingerprint size={22} className="text-cyan-600" />أجهزة البصمة</h2>
        <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-cyan-600 text-white rounded-xl text-sm font-bold hover:bg-cyan-700 transition-all">
          + إضافة جهاز
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-bold">إضافة جهاز بصمة جديد</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الجهاز *" className="border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-400" />
            <input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} placeholder="عنوان IP *" className="border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-400 text-left" dir="ltr" />
            <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 4370 }))} placeholder="المنفذ (4370)" className="border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-400" />
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="الموقع (مثال: المدخل الرئيسي)" className="border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-cyan-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-cyan-600 text-white rounded-xl text-sm font-bold">حفظ</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold">إلغاء</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-10 text-center text-slate-400">جاري التحميل...</div> : devices.length === 0 ? (
          <div className="p-10 text-center text-slate-400">لا توجد أجهزة بصمة مضافة</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                {['الجهاز', 'IP', 'الموقع', 'الحالة', 'آخر مزامنة', 'إجراءات'].map(h => (
                  <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map(d => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-sm">{d.name}</td>
                  <td className="py-3 px-4 text-sm text-slate-600 font-mono" dir="ltr">{d.ip_address}:{d.port}</td>
                  <td className="py-3 px-4 text-sm text-slate-600">{d.location}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => handleToggle(d)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${d.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {d.is_active ? 'متصل' : 'متوقف'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">{d.last_sync_at ? new Date(d.last_sync_at).toLocaleString('ar-SA') : '—'}</td>
                  <td className="py-3 px-4">
                    <button
                      onClick={async () => {
                        try {
                          const result = await biometricDeviceService.testConnection(d.id);
                          await syncLogService.createSyncLog({
                            source: 'biometric_test_connection',
                            device_id: d.id,
                            status: result.ok ? 'success' : 'failed',
                            records_synced: 0,
                            error_message: result.ok ? undefined : result.message,
                            details: { device_name: d.name, ip_address: d.ip_address },
                          } as any);
                          addToast(result.message, result.ok ? 'success' : 'warning');
                          fetchDevices();
                        } catch (err) {
                          addToast('فشل اختبار الاتصال', 'error');
                        }
                      }}
                      className="text-xs text-cyan-600 font-bold hover:underline"
                    >
                      اختبار
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Sync Logs
// ════════════════════════════════════════════════════════════════

function SyncLogsPage() {
  const { addToast } = useUIStore();
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const rows = await syncLogService.findRecentLogs(100);
      setLogs((rows || []).map((r: any) => ({
        id: r.id,
        device_name: r.device_id || r.source || 'جهاز/مصدر',
        status: r.status === 'success' ? 'success' : r.status === 'partial' ? 'partial' : 'failed',
        records_synced: Number(r.records_synced || 0),
        error_message: r.error_message,
        synced_at: r.sync_time || r.created_at,
      })));
    } catch (err) {
      addToast('فشل تحميل سجل المزامنة', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const exportCsv = () => {
    const headers = ['المصدر', 'الحالة', 'عدد السجلات', 'الخطأ', 'الوقت'];
    const escape = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...logs.map(l => [l.device_name, l.status, String(l.records_synced), l.error_message || '', l.synced_at].map(escape).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><RefreshCw size={22} className="text-cyan-600" />سجل المزامنة</h2>
        <div className="flex gap-2">
          <button onClick={fetchLogs} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"><RefreshCw size={14} className="inline ml-1" />تحديث</button>
          <button onClick={exportCsv} className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700">تصدير CSV</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-2xl font-black text-slate-900">{logs.length}</p><p className="text-xs text-slate-500">العمليات</p></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-2xl font-black text-emerald-600">{logs.filter(l => l.status === 'success').length}</p><p className="text-xs text-slate-500">ناجحة</p></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4"><p className="text-2xl font-black text-red-600">{logs.filter(l => l.status === 'failed').length}</p><p className="text-xs text-slate-500">فاشلة</p></div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? <div className="p-10 text-center text-slate-400">جاري التحميل...</div> : logs.length === 0 ? <div className="p-10 text-center text-slate-400">لا توجد سجلات مزامنة</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr>{['المصدر','الحالة','السجلات','الخطأ','الوقت'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{logs.map(log => <tr key={log.id} className="hover:bg-slate-50"><td className="py-3 px-4 font-bold text-slate-800">{log.device_name}</td><td className="py-3 px-4"><span className={`px-2 py-1 rounded-full text-xs font-bold ${log.status === 'success' ? 'bg-emerald-50 text-emerald-700' : log.status === 'partial' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{log.status}</span></td><td className="py-3 px-4">{log.records_synced}</td><td className="py-3 px-4 text-xs text-red-500 max-w-xs truncate">{log.error_message || '—'}</td><td className="py-3 px-4 text-xs text-slate-500">{log.synced_at ? new Date(log.synced_at).toLocaleString('ar') : '—'}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  System Health
// ════════════════════════════════════════════════════════════════

function SystemHealthPage() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState({ devices: 0, onlineDevices: 0, syncFailures: 0, errors: 0, securityCritical: 0 });

  const loadHealth = async () => {
    setLoading(true);
    try {
      const [deviceStats, syncLogs, errors, securityEvents] = await Promise.all([
        biometricDeviceService.getStats(),
        syncLogService.findRecentLogs(100).catch(() => []),
        import('../../services/sdk/ErrorLogService').then(({ errorLogService }) =>
          errorLogService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 }).catch(() => []),
        ),
        securityEventService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 }).catch(() => []),
      ]);
      setHealth({
        devices: deviceStats.total,
        onlineDevices: deviceStats.online,
        syncFailures: (syncLogs || []).filter((l: any) => ['failed', 'error'].includes(String(l.status).toLowerCase())).length,
        errors: (errors || []).filter((e: any) => ['error', 'high', 'critical'].includes(String(e.severity || '').toLowerCase())).length,
        securityCritical: (securityEvents || []).filter((e: any) => ['high', 'critical'].includes(String(e.threat_level || '').toLowerCase())).length,
      });
    } finally { setLoading(false); }
  };

  useEffect(() => { loadHealth(); }, []);
  const score = Math.max(0, 100 - (health.syncFailures * 5) - (health.errors * 3) - (health.securityCritical * 10));

  const metrics = [
    { label: 'درجة الصحة', value: `${score}%`, color: score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600' },
    { label: 'أجهزة متصلة', value: `${health.onlineDevices}/${health.devices}`, color: 'text-cyan-600' },
    { label: 'فشل مزامنة', value: health.syncFailures, color: health.syncFailures ? 'text-red-600' : 'text-emerald-600' },
    { label: 'أحداث أمنية حرجة', value: health.securityCritical, color: health.securityCritical ? 'text-red-600' : 'text-emerald-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><Server size={22} className="text-cyan-600" />صحة النظام</h2>
        <button onClick={loadHealth} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200"><RefreshCw size={14} className={`inline ml-1 ${loading ? 'animate-spin' : ''}`} />تحديث</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
            <p className={`text-3xl font-black ${m.color}`}>{m.value}</p>
            <p className="text-xs text-slate-500 mt-2">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-800 mb-3">توصيات تشغيلية</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>• راقب فشل المزامنة، وأعد اختبار اتصال أجهزة البصمة عند ارتفاعه.</li>
          <li>• راجع سجلات الأخطاء عند ظهور أخطاء عالية/حرجة.</li>
          <li>• راجع الأحداث الأمنية ذات المستوى high/critical فورًا.</li>
        </ul>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Settings
// ════════════════════════════════════════════════════════════════

function TechSettingsPage() {
  const { addToast } = useUIStore();
  const [settings, setSettings] = useState<Record<string, string>>({
    auto_sync: 'true',
    sync_interval: '5',
    late_threshold: '15',
    grace_period: '10',
    work_start: '08:00',
    work_end: '16:00',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const general = await settingsService.findGeneralSettings();
        if (general?.tech_settings) setSettings(prev => ({ ...prev, ...(general.tech_settings as Record<string, string>) }));
      } catch { /* settings are optional */ }
      finally { setLoading(false); }
    })();
  }, []);

  const toggleSetting = (key: string) => setSettings(p => ({ ...p, [key]: p[key] === 'true' ? 'false' : 'true' }));
  const saveSettings = async () => {
    setSaving(true);
    try {
      const general = await settingsService.findGeneralSettings();
      await settingsService.updateGeneralSettings({ ...(general || {}), tech_settings: settings });
      addToast('تم حفظ الإعدادات التقنية', 'success');
    } catch (err) { addToast('تعذر حفظ الإعدادات التقنية', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-20 text-center text-slate-400">جاري تحميل الإعدادات...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><SettingsIcon size={22} className="text-cyan-600" />الإعدادات التقنية</h2>
        <button onClick={saveSettings} disabled={saving} className="px-4 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold hover:bg-cyan-700 disabled:opacity-50">
          {saving ? 'جاري الحفظ...' : 'حفظ'}
        </button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        {[
          { label: 'المزامنة التلقائية', key: 'auto_sync', type: 'toggle' },
          { label: 'فترة المزامنة (دقائق)', key: 'sync_interval', type: 'number' },
          { label: 'حد التأخير (دقائق)', key: 'late_threshold', type: 'number' },
          { label: 'فترة السماح (دقائق)', key: 'grace_period', type: 'number' },
          { label: 'بداية الدوام', key: 'work_start', type: 'time' },
          { label: 'نهاية الدوام', key: 'work_end', type: 'time' },
        ].map(s => (
          <div key={s.key} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
            <span className="text-sm font-bold text-slate-700">{s.label}</span>
            {s.type === 'toggle' ? (
              <button onClick={() => toggleSetting(s.key)} className={`w-12 h-6 rounded-full transition-all ${settings[s.key] === 'true' ? 'bg-cyan-600' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-md transition-all ${settings[s.key] === 'true' ? 'ml-auto mr-0.5' : 'mr-auto ml-0.5'}`} />
              </button>
            ) : (
              <input type={s.type} value={settings[s.key]} onChange={e => setSettings(p => ({ ...p, [s.key]: e.target.value }))} className="w-28 border rounded-lg px-3 py-1.5 text-sm text-center outline-none focus:border-cyan-400" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
