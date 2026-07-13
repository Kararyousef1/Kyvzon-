import { useState, useEffect, useRef } from 'react';
import { Terminal, Database, Activity, Code, RefreshCw, Search, X, Bug, Shield, Lock, LayoutDashboard, TrendingUp, Bell, Moon, Sun, AlertOctagon, ArrowRight, Trash2, ArrowLeft, CheckCircle } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { errorStore, ErrorTrackerPanel } from './ErrorBoundary';
import AppErrorBoundary from './ErrorBoundary';
import SystemMonitor from './SystemMonitor';
import { securityService, SecurityEvent } from '../../../../services/security/securityService';
interface RealStats { totalUsers: number; activeUsers: number; totalIncidents: number; openIncidents: number; totalSurveys: number; totalSOPs: number; totalNotifications: number; totalProblems: number; dbLatency: number; errorCount: number; securityEvents: number; failedLogins: number; systemHealth: number; }
interface SmartDashboardProps { onSwitchToClassic?: () => void; realStats?: RealStats; }

export default function SmartDashboard({ onSwitchToClassic, realStats }: SmartDashboardProps) {
  const { addToast } = useUIStore();
  const [showCmd, setShowCmd] = useState(false);
  const [cmdSearch, setCmdSearch] = useState('');
  const [activeWidget, setActiveWidget] = useState('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [secEvents, setSecEvents] = useState<SecurityEvent[]>(securityService.getEvents());
  const [showNotif, setShowNotif] = useState(false);
  const cmdRef = useRef<HTMLInputElement>(null);

  const errStats = errorStore.getStats();
  const secStats = securityService.getStats();

  useEffect(() => {
    const u = securityService.subscribe(() => setSecEvents(securityService.getEvents()));
    return u;
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); setShowCmd(p => !p); }
      if (e.key === 'Escape') { setShowCmd(false); setShowNotif(false); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => { if (showCmd && cmdRef.current) cmdRef.current.focus(); }, [showCmd]);

  const s = {
    totalUsers: realStats?.totalUsers || 0, activeUsers: realStats?.activeUsers || 0,
    dbLatency: realStats?.dbLatency || 0, totalIncidents: realStats?.totalIncidents || 0,
    openIncidents: realStats?.openIncidents || 0, totalSurveys: realStats?.totalSurveys || 0,
    totalSOPs: realStats?.totalSOPs || 0, totalNotifications: realStats?.totalNotifications || 0,
    totalProblems: realStats?.totalProblems || 0,
    errorCount: errStats.total, errorResolutionRate: errStats.total > 0 ? Math.round((errStats.resolved / errStats.total) * 100) : 100,
    securityEvents: secStats.total, failedLogins: secStats.failedLogins,
    systemHealth: realStats?.systemHealth || 100,
  };

  const cmds = [
    { label: 'تحديث البيانات', icon: RefreshCw, action: () => window.location.reload() },
    { label: 'تتبع الأخطاء', icon: Bug, action: () => setActiveWidget('errors') },
    { label: 'الأمن والمراقبة', icon: Shield, action: () => setActiveWidget('security') },
    { label: 'مراقبة النظام', icon: Activity, action: () => setActiveWidget('monitor') },
    { label: 'الوضع الكلاسيكي', icon: LayoutDashboard, action: () => onSwitchToClassic?.() },
    { label: 'تبديل الثيم', icon: theme === 'dark' ? Sun : Moon, action: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
    { label: 'مسح الكاش', icon: Trash2, action: () => { localStorage.clear(); addToast('تم مسح الكاش', 'success'); } },
    { label: 'العودة للنظرة العامة', icon: ArrowLeft, action: () => setActiveWidget('overview') },
  ];
  const filtered = cmds.filter(c => c.label.includes(cmdSearch));

  const widgets = [
    { id: 'overview', label: 'نظرة ذكية', icon: LayoutDashboard },
    { id: 'security', label: 'الأمن والمراقبة', icon: Shield },
    { id: 'errors', label: 'تتبع الأخطاء', icon: Bug },
    { id: 'monitor', label: 'مراقبة النظام', icon: Activity },
    { id: 'database', label: 'قاعدة البيانات', icon: Database },
    { id: 'insights', label: 'التحليلات', icon: TrendingUp },
  ];

  const close = () => { setShowCmd(false); setCmdSearch(''); };

  return (
    <div className={`${theme === 'dark' ? 'bg-slate-900' : 'bg-gray-50'} min-h-screen transition-colors rounded-2xl border ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'}`} dir="rtl">

      {/* Top Bar */}
      <div className={`sticky top-0 z-40 ${theme === 'dark' ? 'bg-slate-800/95 border-slate-700' : 'bg-white/95 border-gray-200'} backdrop-blur-xl border-b rounded-t-2xl`}>
        <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg"><Terminal size={20} className="text-white" /></div>
            <div>
              <h1 className={`text-lg font-black ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Kyvzon Platform <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">v3.0</span>
              </h1>
              <p className={`text-xs ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>مربوطة بـ Supabase • بيانات حقيقية</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowCmd(true)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}>
              <Search size={14} /><span className="hidden sm:inline">بحث</span>
              <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${theme === 'dark' ? 'bg-slate-600 text-slate-400' : 'bg-gray-200 text-gray-500'}`}>Ctrl+P</kbd>
            </button>
            <button onClick={() => setShowNotif(!showNotif)} className={`relative p-2 rounded-xl border ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
              <Bell size={16} />
              {secStats.unresolved > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{secStats.unresolved}</span>}
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={`p-2 rounded-xl border ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {onSwitchToClassic && (
              <button onClick={onSwitchToClassic} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold ${theme === 'dark' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}`}>
                <ArrowRight size={14} /> الوضع الكلاسيكي
              </button>
            )}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-100 border-gray-200'}`}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className={`text-xs font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>{s.dbLatency}ms</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {showNotif && (
        <div className={`fixed top-20 left-4 z-50 w-96 max-h-[70vh] overflow-hidden rounded-2xl border shadow-2xl ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${theme === 'dark' ? 'border-slate-700' : 'border-gray-200'}`}>
            <span className={`text-sm font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>الأحداث الأمنية ({secEvents.length})</span>
            <button onClick={() => setShowNotif(false)} className="text-slate-500 hover:text-white"><X size={16} /></button>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {secEvents.slice(0, 20).map(ev => {
              const colors: Record<string, string> = { critical: 'bg-rose-100 text-rose-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-emerald-100 text-emerald-700' };
              return (
                <div key={ev.id} className={`flex items-start gap-3 p-3 border-b ${theme === 'dark' ? 'border-slate-700/50' : 'border-gray-100'}`}>
                  <div className={`w-8 h-8 rounded-lg ${colors[ev.threatLevel]} flex items-center justify-center flex-shrink-0`}><AlertOctagon size={14} /></div>
                  <div className="flex-1">
                    <p className={`text-sm ${theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}`}>{ev.details}</p>
                    <p className="text-xs text-slate-500 mt-1">{new Date(ev.timestamp).toLocaleString('ar-SA')} | {ev.userName || 'system'}</p>
                  </div>
                </div>
              );
            })}
            {secEvents.length === 0 && <div className="text-center py-8 text-slate-500 text-sm">لا توجد أحداث أمنية</div>}
          </div>
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-6">
        {/* Stats حقيقية */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { l: 'الأخطاء', v: s.errorCount, i: Bug, c: 'from-rose-500 to-pink-600' },
            { l: 'أحداث أمنية', v: s.securityEvents, i: Shield, c: 'from-amber-500 to-orange-600' },
            { l: 'محاولات فاشلة', v: s.failedLogins, i: Lock, c: 'from-red-600 to-rose-600' },
            { l: 'صحة النظام', v: s.systemHealth + '%', i: Activity, c: s.systemHealth >= 90 ? 'from-emerald-500 to-teal-600' : 'from-orange-500 to-red-600' },
            { l: 'مستخدمين', v: s.totalUsers, i: LayoutDashboard, c: 'from-cyan-500 to-blue-600' },
            { l: 'بلاغات', v: s.totalIncidents, i: AlertOctagon, c: 'from-violet-500 to-purple-600' },
            { l: 'DB', v: s.dbLatency + 'ms', i: Database, c: 'from-amber-500 to-orange-600' },
            { l: 'الإصدار', v: '3.0.0', i: Code, c: 'from-slate-600 to-gray-600' },
          ].map((it, i) => {
            const Ic = it.i;
            return (
              <div key={i} className={`relative overflow-hidden rounded-xl border shadow-sm p-3 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                <div className={`absolute top-0 right-0 w-12 h-12 bg-gradient-to-br ${it.c} opacity-10 rounded-full blur-xl -translate-y-4 translate-x-4`} />
                <div className="relative">
                  <Ic size={14} className="text-gray-500 mb-1" />
                  <p className={`text-lg font-black font-mono ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{it.v}</p>
                  <p className="text-xs text-gray-500">{it.l}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Widget Nav */}
        <div className={`flex items-center gap-1 p-1.5 rounded-xl border shadow-sm overflow-x-auto ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
          {widgets.map(w => {
            const Ic = w.icon;
            return (
              <button key={w.id} onClick={() => setActiveWidget(w.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeWidget === w.id ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg' : theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                <Ic size={14} />{w.label}
              </button>
            );
          })}
        </div>

        {/* Overview */}
        {activeWidget === 'overview' && (
          <div className="space-y-4">
            <div className={`rounded-xl border p-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}><TrendingUp size={16} className="text-emerald-500" /> إحصائيات النظام الحقيقية</h3>
              <div className="grid md:grid-cols-4 gap-3">
                {[
                  { l: 'المستخدمون', v: s.totalUsers, c: 'text-cyan-500' },
                  { l: 'البلاغات', v: s.totalIncidents, c: 'text-amber-500' },
                  { l: 'البلاغات', v: s.totalProblems, c: 'text-rose-500' },
                  { l: 'الإشعارات', v: s.totalNotifications, c: 'text-emerald-500' },
                  { l: 'الاستبيانات', v: s.totalSurveys, c: 'text-violet-500' },
                  { l: 'SOPs', v: s.totalSOPs, c: 'text-blue-500' },
                  { l: 'حل الأخطاء', v: s.errorResolutionRate + '%', c: 'text-teal-500' },
                  { l: 'صحة النظام', v: s.systemHealth + '%', c: 'text-pink-500' },                ].map((it, i) => (
                  <div key={i} className={`p-3 rounded-xl border ${theme === 'dark' ? 'bg-slate-700/50 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                    <p className={`text-2xl font-black font-mono ${it.c}`}>{it.v}</p>
                    <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'}`}>{it.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Security Widget */}
        {activeWidget === 'security' && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-4 gap-3">
              {[
                { l: 'إجمالي الأحداث', v: secStats.total, c: 'from-amber-500 to-orange-600' },
                { l: 'غير محلول', v: secStats.unresolved, c: 'from-rose-500 to-pink-600' },
                { l: 'محاولات فاشلة', v: secStats.failedLogins, c: 'from-red-600 to-rose-600' },
                { l: 'مستخدمون مشبوهون', v: secStats.suspiciousUsers || secStats.suspiciousActivities, c: 'from-violet-500 to-purple-600' },
              ].map((it, i) => (
                <div key={i} className={`relative overflow-hidden rounded-xl border p-3 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`absolute top-0 right-0 w-12 h-12 bg-gradient-to-br ${it.c} opacity-10 rounded-full blur-xl -translate-y-4 translate-x-4`} />
                  <p className="text-2xl font-black text-white font-mono">{it.v}</p>
                  <p className="text-xs text-gray-500 mt-1">{it.l}</p>
                </div>
              ))}
            </div>

            <div className={`rounded-xl border ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2"><Shield size={16} className="text-amber-500" /> آخر الأحداث الأمنية</h3>
                <span className="text-xs text-slate-500">{secEvents.length} حدث</span>
              </div>
              <div className="divide-y divide-slate-700/50 max-h-96 overflow-y-auto">
                {secEvents.slice(0, 30).map(ev => {
                  const sevColor = { critical: 'text-rose-400', high: 'text-orange-400', medium: 'text-amber-400', low: 'text-emerald-400' };
                  return (
                    <div key={ev.id} className="p-3 flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg ${ev.resolved ? 'bg-slate-700' : 'bg-rose-500/20'} flex items-center justify-center`}>
                        <AlertOctagon size={14} className={ev.resolved ? 'text-slate-500' : sevColor[ev.threatLevel]} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{ev.details}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${sevColor[ev.threatLevel]} bg-slate-700/50`}>{ev.threatLevel}</span>
                          <span className="text-xs text-slate-500">{new Date(ev.timestamp).toLocaleString('ar-SA')}</span>
                          <span className="text-xs text-slate-500">• {ev.userName || 'system'}</span>
                        </div>
                      </div>
                      {!ev.resolved && (
                        <button
                          onClick={() => securityService.resolveEvent(ev.id, 'مطور')}
                          className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold"
                        >
                          حل
                        </button>
                      )}
                    </div>
                  );
                })}
                {secEvents.length === 0 && <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2"><CheckCircle size={32} className="text-emerald-500" /><span>لا توجد أحداث أمنية</span></div>}
              </div>
            </div>
          </div>
        )}

        {/* Errors Widget */}
        {activeWidget === 'errors' && <ErrorTrackerPanel />}

        {/* Monitor Widget */}
        {activeWidget === 'monitor' && <SystemMonitor />}

        {/* Database Widget */}
        {activeWidget === 'database' && (
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4"><Database size={20} className="text-cyan-500" /> إدارة قاعدة البيانات</h3>
            <div className="grid md:grid-cols-3 gap-3 mb-4">
              {[
                { l: 'زمن الاستجابة', v: s.dbLatency + 'ms', c: s.dbLatency < 100 ? 'text-emerald-500' : s.dbLatency < 300 ? 'text-amber-500' : 'text-rose-500' },
                { l: 'الحالة', v: s.dbLatency < 300 ? 'ممتازة' : 'بطيئة', c: s.dbLatency < 300 ? 'text-emerald-500' : 'text-rose-500' },
                { l: 'الاتصالات', v: 'نشطة', c: 'text-cyan-500' },
              ].map((it, i) => (
                <div key={i} className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <p className={`text-2xl font-black font-mono ${it.c}`}>{it.v}</p>
                  <p className="text-xs text-slate-400 mt-1">{it.l}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">استخدم تبويب &quot;قاعدة البيانات&quot; في الوضع الكلاسيكي للوصول إلى محرر SQL وأدوات متقدمة.</p>
          </div>
        )}

        {/* Insights Widget */}
        {activeWidget === 'insights' && (
          <div className={`rounded-xl border p-6 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4"><TrendingUp size={20} className="text-emerald-500" /> التحليلات الذكية</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {[
                { l: 'معدل الأخطاء', v: s.errorCount > 0 ? ((s.errorCount / Math.max(s.totalUsers, 1)) * 100).toFixed(1) + '%' : '0%', c: s.errorCount > 5 ? 'text-rose-500' : 'text-emerald-500' },
                { l: 'نسبة الأمن', v: Math.max(0, 100 - s.securityEvents) + '%', c: s.securityEvents > 10 ? 'text-orange-500' : 'text-emerald-500' },
                { l: 'معدل حل الأخطاء', v: s.errorResolutionRate + '%', c: 'text-cyan-500' },
                { l: 'صحة النظام', v: s.systemHealth + '%', c: s.systemHealth >= 90 ? 'text-emerald-500' : 'text-amber-500' },
              ].map((it, i) => (
                <div key={i} className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
                  <p className={`text-3xl font-black font-mono ${it.c}`}>{it.v}</p>
                  <p className="text-sm text-slate-400 mt-1">{it.l}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Command Palette */}
      {showCmd && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-sm" onClick={close}>
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
              <Search size={16} className="text-slate-500" />
              <input
                ref={cmdRef}
                type="text"
                value={cmdSearch}
                onChange={e => setCmdSearch(e.target.value)}
                placeholder="ابحث عن أمر أو انتقل إلى..."
                className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500 text-sm"
              />
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700 text-slate-400">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {filtered.map((c, i) => {
                const Ic = c.icon;
                return (
                  <button key={i} onClick={() => { c.action(); close(); }} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800 transition-colors text-right">
                    <Ic size={16} className="text-slate-400" />
                    <span className="text-sm text-slate-200">{c.label}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">لا توجد نتائج</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
