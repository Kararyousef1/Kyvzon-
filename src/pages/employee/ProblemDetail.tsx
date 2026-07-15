import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowRight, Clock, User as UserIcon, MessageSquare, Send, Paperclip,
  CheckCircle, XCircle, TrendingUp,
  Sparkles, Calendar, MapPin,
  AlertCircle, Loader2, Check, ChevronDown,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { incidentService } from '../../services/sdk/IncidentService';
import { incidentCommentService } from '../../services/sdk/IncidentCommentService';
import type { CommentDetail } from '../../services/sdk/IncidentCommentService';
import type { User } from '../../shared/types';
import Card from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { getErrorMessage } from '../../services/errors';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

interface AIAnalysis {
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;
  urgencyLevel?: number;
  suggestedActions?: string[];
  summary?: string;
  tags?: string[];
  predictedResolutionTime?: string;
  [key: string]: unknown;
}

interface ProblemDetailData {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'in_progress' | 'resolved' | 'closed';
  is_anonymous: boolean;
  user_id?: string;
  created_at: string;
  updated_at?: string;
  ai_analysis?: AIAnalysis | null;
}

type ProblemStatus = 'pending' | 'in_progress' | 'resolved' | 'closed';

interface RealtimePayload {
  type?: string;
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

const STATUS_META: Record<ProblemStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'قيد الانتظار', color: 'text-amber-700', bg: 'bg-amber-100' },
  in_progress: { label: 'قيد المعالجة', color: 'text-blue-700',  bg: 'bg-blue-100' },
  resolved:    { label: 'تم الحل',      color: 'text-emerald-700', bg: 'bg-emerald-100' },
  closed:      { label: 'مغلق',         color: 'text-slate-600',  bg: 'bg-slate-200' },
};

const SEVERITY_META = {
  low:      { label: 'بسيط',   color: 'text-slate-600', bg: 'bg-slate-100' },
  medium:   { label: 'متوسط',  color: 'text-amber-700', bg: 'bg-amber-100' },
  high:     { label: 'عالي',   color: 'text-orange-700', bg: 'bg-orange-100' },
  critical: { label: 'حرج',    color: 'text-red-700',   bg: 'bg-red-100' },
};

export default function ProblemDetail() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const location = useLocation();
  const { addToast } = useUIStore();

  // نأخذ id من مسار URL. المسار الصحيح: /app/employee/problems/:id
  const problemId = params.id ?? null;

  // مسار قائمة البلاغات — يعتمد على السياق (HR أم Employee)
  const problemsListPath = location.pathname.startsWith('/app/hr/')
    ? '/app/hr/problems'
    : '/app/employee/problems';

  // ─── State ────────────────────────────────────────────────────
  const [problem, setProblem] = useState<ProblemDetailData | null>(null);
  const [comments, setComments] = useState<CommentDetail[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendingComment, setSendingComment] = useState(false);
  const [badgeTrigger, setBadgeTrigger] = useState(0);
  const commentEndRef = useRef<HTMLDivElement>(null);

  // ─── جلب البيانات ────────────────────────────────────────────
  const fetchProblem = useCallback(async () => {
    if (!problemId) return;
    try {
      const data = await incidentService.findById(problemId);
      setProblem(data as ProblemDetailData | null);
    } catch (err) {
      console.error('Error fetching problem:', getErrorMessage(err));
    }
  }, [problemId]);

  const fetchCommentsData = useCallback(async () => {
    if (!problemId) return;
    try {
      const data = await incidentCommentService.findCommentsByIncident(problemId);
      setComments(data);
    } catch (err) {
      console.error('Error fetching comments:', getErrorMessage(err));
    }
  }, [problemId]);

  useEffect(() => {
    if (!problemId) return;
    (async () => {
      setLoading(true);
      await Promise.all([fetchProblem(), fetchCommentsData()]);
      setLoading(false);
    })();
  }, [problemId, fetchProblem, fetchCommentsData]);

  // ─── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    if (!problemId) return;

    let channel: any = null;
    let cancelled = false;

    (async () => {
      const { supabase } = await import('../../services/supabase/supabase');
      if (cancelled) return;
      channel = supabase
        .channel(`problem-${problemId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'incidents', filter: `id=eq.${problemId}` },
          async () => { if (!cancelled) await fetchProblem(); }
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'incident_comments', filter: `incident_id=eq.${problemId}` },
          async () => { if (!cancelled) await fetchCommentsData(); }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        import('../../services/supabase/supabase').then(({ supabase }) => {
          supabase.removeChannel(channel);
        });
      }
    };
  }, [problemId, fetchProblem, fetchCommentsData]);

  // ─── Auto scroll ──────────────────────────────────────────────
  useEffect(() => {
    commentEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // ─── إضافة تعليق ──────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.id || !problemId) return;
    setSendingComment(true);
    try {
      await incidentCommentService.addComment({
        incident_id: problemId,
        user_id: user.id,
        text: newComment.trim(),
        is_internal: isInternal,
      });
      setNewComment('');
      setIsInternal(false);
      await fetchCommentsData();
      setBadgeTrigger(prev => prev + 1);
    } catch (err) {
      addToast('فشل إرسال التعليق: ' + getErrorMessage(err), 'error');
    } finally {
      setSendingComment(false);
    }
  };

  // ─── تحديث الحالة ─────────────────────────────────────────────
  const handleStatusChange = async (newStatus: ProblemStatus) => {
    if (!problemId) return;
    try {
      await incidentService.updateStatus(problemId, newStatus);
      await fetchProblem();
      addToast(`تم تحديث الحالة إلى ${STATUS_META[newStatus].label}`, 'success');
    } catch (err) {
      addToast('فشل تحديث الحالة: ' + getErrorMessage(err), 'error');
    }
  };

  // ════════════════════════════════════════════════════
  //  التحميل
  // ════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="mx-auto text-slate-300 mb-4" />
        <h3 className="text-lg font-bold text-slate-700">البلاغ غير موجود</h3>
        <p className="text-sm text-slate-500 mt-2">قد يكون قد تم حذفه أو أن الرابط غير صحيح</p>
        <Button variant="outline" onClick={() => navigate(problemsListPath)} className="mt-4">
          العودة إلى البلاغات
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_META[problem.status] || STATUS_META.pending;
  const severityMeta = SEVERITY_META[problem.severity] || SEVERITY_META.medium;

  // ════════════════════════════════════════════════════
  //  العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 animate-fade-in" dir="rtl">
      {/* زر الرجوع */}
      <button
        onClick={() => navigate(problemsListPath)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
      >
        <ArrowRight size={16} /> العودة إلى البلاغات
      </button>

      {/* البطاقة الرئيسية */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{problem.title}</h2>
            <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
              <Calendar size={14} />
              <span>
                {problem.created_at ? format(new Date(problem.created_at), 'dd MMMM yyyy - hh:mm a', { locale: ar }) : ''}
              </span>
              <MapPin size={14} className="mr-2" />
              <span>قسم: {problem.category || 'عام'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusMeta.bg} ${statusMeta.color}`}>
              {statusMeta.label}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${severityMeta.bg} ${severityMeta.color}`}>
              {severityMeta.label}
            </span>
          </div>
        </div>

        {/* الوصف */}
        <div className="bg-slate-50 rounded-xl p-4 mb-4">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{problem.description}</p>
        </div>

        {/* تحليل AI */}
        {problem.ai_analysis && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 mb-4 border border-purple-100">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={16} className="text-purple-600" />
              <span className="text-sm font-bold text-purple-800">تحليل ذكي</span>
            </div>
            {problem.ai_analysis.summary && (
              <p className="text-sm text-slate-600">{problem.ai_analysis.summary}</p>
            )}
            {problem.ai_analysis.tags && problem.ai_analysis.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {problem.ai_analysis.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white rounded-full text-xs font-medium text-purple-600 border border-purple-200">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* أزرار تغيير الحالة */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
          <span className="text-sm font-medium text-slate-600 ml-2">تحديث الحالة:</span>
          {(['pending', 'in_progress', 'resolved', 'closed'] as ProblemStatus[]).map((status) => {
            const m = STATUS_META[status];
            const isActive = problem.status === status;
            return (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={isActive || !user?.id}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? `${m.bg} ${m.color} cursor-default`
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100 cursor-pointer'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* التعليقات */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare size={16} /> التعليقات ({comments.length})
          </h3>
        </div>

        {/* قائمة التعليقات */}
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-center py-6 text-slate-400 text-sm">لا توجد تعليقات بعد</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3 rounded-xl ${comment.is_internal ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <UserIcon size={14} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-700">{comment.user_name || 'مستخدم'}</span>
                    {comment.user_role && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-medium">
                        {comment.user_role}
                      </span>
                    )}
                    {comment.is_internal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-700 font-medium">
                        داخلي
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {format(new Date(comment.created_at), 'hh:mm a')}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{comment.text}</p>
              </div>
            ))
          )}
          <div ref={commentEndRef} />
        </div>

        {/* إضافة تعليق */}
        {user?.id && (
          <div className="border-t border-slate-100 pt-4">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="أكتب تعليقك هنا..."
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
            <div className="flex items-center justify-between mt-2">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                تعليق داخلي (للمشرفين فقط)
              </label>
              <Button
                size="sm"
                onClick={handleAddComment}
                loading={sendingComment}
                icon={<Send size={14} />}
                iconPosition="left"
              >
                إرسال
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}