import React, { Component, ErrorInfo, ReactNode, useState } from 'react';
import {
  AlertTriangle, Bug, RefreshCw, Copy, Terminal, Shield, FileCode, Clock,
  User, X, ChevronDown, ChevronUp, Search, Wifi, HardDrive, CheckCircle2,
  BarChart3, TrendingUp, AlertCircle, Percent
} from 'lucide-react';
import { addNotification } from '../../../../services/notifications/notificationManager';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CapturedError {
  id: string;
  timestamp: string;
  message: string;
  source: string;
  stackTrace: string;
  componentStack: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  userAgent: string;
  userId?: string;
  userName?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
  category: 'runtime' | 'network' | 'promise' | 'resource' | 'syntax' | 'custom';
  relatedFiles: string[];
  frequency: number;
  lastOccurrence: string;
  environment: 'production' | 'development' | 'staging';
  route: string;
  action: string;
  previousErrors: string[];
}

interface ErrorStats {
  total: number;
  critical: number;
  high: number;
  resolved: number;
  unresolved: number;
  categories: Record<string, number>;
  topErrors: [string, number][];
  errorsByHour: number[];
  filesAffected: number;
  avgResponseTime: number;
  errorRate: number;
}

// ── Error Store (Singleton) ───────────────────────────────────────────────────
class ErrorStore {
  private static instance: ErrorStore;
  private errors: CapturedError[] = [];
  private listeners: (() => void)[] = [];
  private maxErrors = 1000;

  static getInstance(): ErrorStore {
    if (!ErrorStore.instance) ErrorStore.instance = new ErrorStore();
    return ErrorStore.instance;
  }

  addError(error: CapturedError): void {
    this.errors.unshift(error);
    if (this.errors.length > this.maxErrors) this.errors = this.errors.slice(0, this.maxErrors);
    this.notifyListeners();
    this.tryPersistToDb(error);
  }

  private async tryPersistToDb(error: CapturedError): Promise<void> {
    // نستخدم SDK: يحقن tenant_id إن وُجد، ولا يفشل إن لم يوجد.
    // dynamic import للحفاظ على أن الـ ErrorBoundary لا يحمِّل SDK
    // في bundle الأولي (يظل خفيفاً حتى قبل أي خطأ).
    try {
      const { errorLogService } = await import('../../../../services/sdk/ErrorLogService');
      await errorLogService.logError({
        message:     error.message,
        source:      error.source,
        stack_trace: error.stackTrace,
        severity:    error.severity,
        category:    error.category,
        file_name:   error.fileName,
        line_number: error.lineNumber,
        user_agent:  error.userAgent,
        route:       error.route,
        environment: error.environment,
      });
    } catch {
      // حفظ محلي كافي
    }
  }

  getErrors(filters?: {
    severity?: string[]; category?: string[]; resolved?: boolean;
    search?: string; startDate?: string; endDate?: string;
  }): CapturedError[] {
    let filtered = [...this.errors];
    if (filters?.severity?.length) filtered = filtered.filter(e => filters.severity!.includes(e.severity));
    if (filters?.category?.length) filtered = filtered.filter(e => filters.category!.includes(e.category));
    if (filters?.resolved !== undefined) filtered = filtered.filter(e => e.resolved === filters.resolved);
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      filtered = filtered.filter(e =>
        e.message.toLowerCase().includes(s) || e.source.toLowerCase().includes(s) ||
        e.fileName.toLowerCase().includes(s) || e.stackTrace.toLowerCase().includes(s));
    }
    if (filters?.startDate) filtered = filtered.filter(e => e.timestamp >= filters.startDate!);
    if (filters?.endDate) filtered = filtered.filter(e => e.timestamp <= filters.endDate!);
    return filtered;
  }

  getErrorById(id: string): CapturedError | undefined {
    return this.errors.find(e => e.id === id);
  }

  resolveError(id: string, resolvedBy: string): void {
    const error = this.errors.find(e => e.id === id);
    if (error) {
      error.resolved = true;
      error.resolvedAt = new Date().toISOString();
      error.resolvedBy = resolvedBy;
      this.notifyListeners();
    }
  }

  getStats(): ErrorStats {
    const total = this.errors.length;
    const critical = this.errors.filter(e => e.severity === 'critical').length;
    const high = this.errors.filter(e => e.severity === 'high').length;
    const resolved = this.errors.filter(e => e.resolved).length;
    const categories = this.errors.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {} as Record<string, number>);
    const topErrors = Object.entries(this.errors.reduce((acc, e) => { acc[e.message] = (acc[e.message] || 0) + 1; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const errorsByHour = new Array(24).fill(0);
    this.errors.forEach(e => { errorsByHour[new Date(e.timestamp).getHours()]++; });
    const filesAffected = new Set(this.errors.map(e => e.fileName)).size;
    const resolvedErrors = this.errors.filter(e => e.resolved && e.resolvedAt);
    const avgResponseTime = resolvedErrors.length > 0
      ? Math.round(resolvedErrors.reduce((s, e) => s + (new Date(e.resolvedAt!).getTime() - new Date(e.timestamp).getTime()), 0) / resolvedErrors.length / 60000)
      : 0;
    return { total, critical, high, resolved, unresolved: total - resolved, categories, topErrors, errorsByHour, filesAffected, avgResponseTime, errorRate: total > 0 ? (resolved / total) * 100 : 0 };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private notifyListeners(): void { this.listeners.forEach(l => l()); }
  clearAll(): void { this.errors = []; this.notifyListeners(); }
}

export const errorStore = ErrorStore.getInstance();

// ── Error Boundary Component ──────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  componentName?: string;
  userId?: string;
  userName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.captureError(error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private captureError(error: Error, errorInfo: ErrorInfo): void {
    const stackLines = error.stack?.split('\n') || [];
    const sourceLine = stackLines.find(l => l.includes('src/') || l.includes('node_modules/')) || '';
    const fileNameMatch = sourceLine.match(/([a-zA-Z0-9_\-./]+\.(?:tsx|ts|jsx|js))/);
    const lineMatch = sourceLine.match(/:(\d+):(\d+)/);

    const captured: CapturedError = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      message: error.message,
      source: this.props.componentName || 'Unknown Component',
      stackTrace: error.stack || '',
      componentStack: errorInfo.componentStack || '',
      fileName: fileNameMatch?.[1] || 'unknown',
      lineNumber: lineMatch ? parseInt(lineMatch[1]) : 0,
      columnNumber: lineMatch ? parseInt(lineMatch[2]) : 0,
      userAgent: navigator.userAgent,
      userId: this.props.userId,
      userName: this.props.userName,
      severity: this.determineSeverity(error.message),
      resolved: false,
      category: this.determineCategory(error),
      relatedFiles: this.extractRelatedFiles(error.stack),
      frequency: 1,
      lastOccurrence: new Date().toISOString(),
      environment: window.location.hostname === 'localhost' ? 'development' : 'production',
      route: window.location.pathname + window.location.search,
      action: document.title || 'Unknown',
      previousErrors: [],
    };

    errorStore.addError(captured);

    if (captured.severity === 'critical') {
      addNotification('system', {
        type: 'system_error',
        priority: 'high',
        title: `🚨 خطأ حرج: ${error.message.slice(0, 50)}`,
        message: `الملف: ${captured.fileName}:${captured.lineNumber}\nالتصنيف: ${captured.category}\nالمسار: ${captured.route}`,
        metadata: { errorId: captured.id },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
  }

  private determineSeverity(message: string): CapturedError['severity'] {
    const lower = message.toLowerCase();
    if (['cannot read', 'undefined is not', 'out of memory', 'network error'].some(k => lower.includes(k))) return 'critical';
    if (['typeerror', 'referenceerror', 'syntaxerror', 'database', 'permission denied'].some(k => lower.includes(k))) return 'high';
    if (lower.includes('warning') || lower.includes('deprecated')) return 'low';
    return 'medium';
  }

  private determineCategory(error: Error): CapturedError['category'] {
    if (error instanceof TypeError || error instanceof ReferenceError) return 'runtime';
    if (error instanceof SyntaxError) return 'syntax';
    if (error.message.toLowerCase().includes('network') || error.message.toLowerCase().includes('fetch')) return 'network';
    if (error.message.toLowerCase().includes('chunk') || error.message.toLowerCase().includes('loading')) return 'resource';
    return 'custom';
  }

  private extractRelatedFiles(stack?: string): string[] {
    if (!stack) return [];
    const files = new Set<string>();
    const regex = /([a-zA-Z0-9_\-./]+\.(?:tsx|ts|jsx|js))/g;
    let match;
    while ((match = regex.exec(stack)) !== null) {
      if (!match[1].includes('node_modules')) files.add(match[1]);
    }
    return Array.from(files).slice(0, 10);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorFallback
          error={this.state.error!}
          errorInfo={this.state.errorInfo!}
          onReset={this.handleReset}
          componentName={this.props.componentName}
        />
      );
    }
    return this.props.children;
  }
}

// ── Error Fallback UI ─────────────────────────────────────────────────────────
interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo;
  onReset: () => void;
  componentName?: string;
}

function ErrorFallback({ error, errorInfo, onReset, componentName }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [, setCopied] = useState(false);

  const handleCopy = () => {
    const details = `Error: ${error.message}\nComponent: ${componentName || 'Unknown'}\nStack Trace:\n${error.stack}\nRoute: ${window.location.pathname}\nTimestamp: ${new Date().toISOString()}`;
    navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-rose-950 via-slate-900 to-rose-950 rounded-2xl border border-rose-500/30 shadow-2xl p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-lg shadow-rose-500/25 animate-pulse">
              <Bug size={28} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                حدث خطأ غير متوقع
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">{componentName || 'UI'}</span>
              </h3>
              <p className="text-slate-400 text-sm mt-1">تم التقاط الخطأ وتحليله تلقائياً. يمكنك متابعة العمل بأمان.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all" title="نسخ التفاصيل"><Copy size={16} /></button>
            <button onClick={onReset} className="p-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25 transition-all" title="إعادة المحاولة"><RefreshCw size={16} /></button>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-rose-400" />
            <span className="text-sm font-bold text-rose-400">رسالة الخطأ:</span>
          </div>
          <p className="text-lg font-mono text-white break-all">{error.message}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'المسار', value: window.location.pathname, icon: Terminal },
            { label: 'التوقيت', value: new Date().toLocaleString('ar-SA'), icon: Clock },
            { label: 'المتصفح', value: navigator.userAgent.slice(0, 50) + '...', icon: User },
            { label: 'الملف', value: componentName || 'غير معروف', icon: FileCode },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <Icon size={12} className="text-slate-500 mb-1" />
                <span className="text-xs text-slate-400 block">{item.label}</span>
                <p className="text-xs font-mono text-white truncate mt-0.5">{String(item.value)}</p>
              </div>
            );
          })}
        </div>

        <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-2">
          {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showDetails ? 'إخفاء التفاصيل التقنية' : 'عرض التفاصيل التقنية'}
        </button>

        {showDetails && (
          <div className="space-y-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-auto max-h-60">
              <div className="flex items-center gap-2 mb-2">
                <Bug size={14} className="text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400">Stack Trace:</span>
              </div>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{error.stack}</pre>
            </div>
            {errorInfo.componentStack && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-auto max-h-40">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={14} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-400">Component Stack:</span>
                </div>
                <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">{errorInfo.componentStack}</pre>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-700">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>تم الحفظ التلقائي في سجل الأخطاء</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5">
              <RefreshCw size={12} />
              تحديث الصفحة
            </button>
            <button onClick={onReset} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs text-white shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              استئناف العمل
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error Tracker Panel ──────────────────────────────────────────────────────
export function ErrorTrackerPanel() {
  const [errors, setErrors] = useState<CapturedError[]>([]);
  const [selectedError, setSelectedError] = useState<CapturedError | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('unresolved');

  useState(() => {
    return errorStore.subscribe(() => {
      setErrors([...errorStore.getErrors()]);
    });
  });

  // استخدام useEffect بشكل صحيح
  React.useEffect(() => {
    setErrors(errorStore.getErrors());
    const unsubscribe = errorStore.subscribe(() => {
      setErrors([...errorStore.getErrors()]);
    });
    return unsubscribe;
  }, []);

  const stats = errorStore.getStats();

  const filteredErrors = errors.filter(err => {
    if (filterSeverity !== 'all' && err.severity !== filterSeverity) return false;
    if (filterStatus === 'unresolved' && err.resolved) return false;
    if (filterStatus === 'resolved' && !err.resolved) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      return err.message.toLowerCase().includes(s) || err.fileName.toLowerCase().includes(s);
    }
    return true;
  });

  const getSeverityColor = (sev: string) => {
    switch (sev) {
      case 'critical': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'network': return <Wifi size={14} />;
      case 'resource': return <HardDrive size={14} />;
      default: return <Bug size={14} />;
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-orange-600 flex items-center justify-center shadow-lg">
            <Bug size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              متتبع الأخطاء المتقدم
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">
                {stats.unresolved} غير محلول
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">نظام ذكي لاكتشاف وتحليل الأخطاء في الوقت الفعلي</p>
          </div>
        </div>
        <button
          onClick={() => {
            if (window.confirm('هل أنت متأكد من حذف جميع الأخطاء؟')) errorStore.clearAll();
          }}
          className="px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all"
        >
          مسح الكل
        </button>
      </div>

      {/* إحصائيات سريعة */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'إجمالي الأخطاء', value: stats.total, icon: BarChart3, color: 'from-slate-500 to-slate-600' },
          { label: 'أخطاء حرجة', value: stats.critical, icon: AlertCircle, color: 'from-rose-500 to-rose-600' },
          { label: 'مرتفعة', value: stats.high, icon: TrendingUp, color: 'from-orange-500 to-orange-600' },
          { label: 'محلولة', value: stats.resolved, icon: CheckCircle2, color: 'from-emerald-500 to-emerald-600' },
          { label: 'معدل الحل', value: `${stats.errorRate.toFixed(1)}%`, icon: Percent, color: 'from-cyan-500 to-cyan-600' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                  <Icon size={14} className="text-white" />
                </div>
                <span className="text-xs text-slate-400 font-bold">{stat.label}</span>
              </div>
              <p className="text-2xl font-black text-white">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* أدوات التصفية */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="relative">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ابحث في الأخطاء..."
            className="w-full pr-10 pl-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>
        <select
          value={filterSeverity}
          onChange={e => setFilterSeverity(e.target.value)}
          className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500"
        >
          <option value="all">جميع الخطورات</option>
          <option value="critical">حرجة</option>
          <option value="high">مرتفعة</option>
          <option value="medium">متوسطة</option>
          <option value="low">منخفضة</option>
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-rose-500"
        >
          <option value="unresolved">غير محلول</option>
          <option value="resolved">محلول</option>
          <option value="all">الكل</option>
        </select>
      </div>

      {/* قائمة الأخطاء */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredErrors.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-500" />
            <p className="text-sm font-bold">لا توجد أخطاء {filterStatus === 'unresolved' ? 'غير محلولة' : ''}</p>
          </div>
        ) : (
          filteredErrors.map(err => (
            <div
              key={err.id}
              onClick={() => setSelectedError(err)}
              className={`p-3 rounded-xl border cursor-pointer transition-all hover:scale-[1.01] ${getSeverityColor(err.severity)} bg-slate-800/50 hover:bg-slate-800`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5">{getCategoryIcon(err.category)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{err.message}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">{err.fileName}:{err.lineNumber}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-slate-500">{new Date(err.timestamp).toLocaleString('ar-SA')}</span>
                      {err.frequency > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
                          ×{err.frequency}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {!err.resolved && (
                  <button
                    onClick={e => { e.stopPropagation(); errorStore.resolveError(err.id, 'مطور'); }}
                    className="px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold"
                  >
                    حل
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedError && <ErrorDetailsModal error={selectedError} onClose={() => setSelectedError(null)} />}
    </div>
  );
}

// ── Error Details Modal ──────────────────────────────────────────────────────
export function ErrorDetailsModal({ error, onClose }: { error: CapturedError; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="p-6 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <Bug size={20} className="text-rose-400" />
            تفاصيل الخطأ
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">الرسالة</p>
            <p className="text-sm font-mono text-white break-all">{error.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">الملف</p>
              <p className="text-xs font-mono text-white break-all">{error.fileName}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">السطر</p>
              <p className="text-xs font-mono text-white">{error.lineNumber}:{error.columnNumber}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">التصنيف</p>
              <p className="text-xs text-white">{error.category}</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-1">الخطورة</p>
              <p className="text-xs text-white">{error.severity}</p>
            </div>
          </div>
          {error.stackTrace && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-emerald-400 mb-2 font-bold">Stack Trace</p>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-60 overflow-auto">{error.stackTrace}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
