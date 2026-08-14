/**
 * ════════════════════════════════════════════════════════════════
 *  WellnessPage - صفحة العافية اليومية (نسخة SDK جديدة)
 *  تستخدم WellnessEntryService للوصول إلى البيانات
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { Heart, Smile, Activity, Brain, Calendar, TrendingUp, Loader2, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── طبقة SDK (مصدر بيانات نظيف) ───────────────────────────────
import { wellnessEntryService } from '../../services/sdk/WellnessService';
import { useEmployeeId } from '../../shared/hooks/useEmployeeId';
import type { WellnessEntryRecord, WellnessMood } from '../../shared/types/sdk';

// ════════════════════════════════════════════════════════════════
//  الأنواع المحلية
// ════════════════════════════════════════════════════════════════

interface WellnessEntry {
  id: string;
  employeeId: string;
  date: string;
  mood: WellnessMood;
  stress: number;
  energy: number;
  score: number;
  notes: string | null;
  createdAt: string;
}

// ════════════════════════════════════════════════════════════════
//  دوال مساعدة محلية
// ════════════════════════════════════════════════════════════════

const MOOD_SCORE: Record<WellnessMood, number> = {
  great: 90,
  good: 75,
  neutral: 60,
  bad: 40,
  terrible: 20,
};

function calculateWellnessScore(input: { stress: number; energy: number; mood: WellnessMood }): number {
  return Math.round((100 - input.stress) * 0.4 + input.energy * 0.4 + MOOD_SCORE[input.mood] * 0.2);
}

function todayISO(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function toEntry(row: WellnessEntryRecord): WellnessEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    mood: row.mood,
    stress: row.stress,
    energy: row.energy,
    score: row.score,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

// ════════════════════════════════════════════════════════════════
//  الثوابت
// ════════════════════════════════════════════════════════════════

const MOOD_META: Record<WellnessMood, { emoji: string; label: string; color: string }> = {
  great:    { emoji: '😄', label: 'ممتاز',   color: 'border-emerald-400 bg-emerald-50' },
  good:     { emoji: '🙂', label: 'جيد',     color: 'border-blue-400 bg-blue-50' },
  neutral:  { emoji: '😐', label: 'عادي',    color: 'border-amber-400 bg-amber-50' },
  bad:      { emoji: '😕', label: 'سيء',     color: 'border-orange-400 bg-orange-50' },
  terrible: { emoji: '😢', label: 'سيء جداً', color: 'border-red-400 bg-red-50' },
};

const MOOD_ORDER: WellnessMood[] = ['great', 'good', 'neutral', 'bad', 'terrible'];

const TIPS = [
  { icon: '🧘', title: 'تأمل يومي',          desc: 'خصص 10 دقائق للتأمل صباحاً لتحسين تركيزك' },
  { icon: '🚶', title: 'المشي أثناء الراحة', desc: 'تحرك وامشِ خلال استراحة الغداء لتجديد نشاطك' },
  { icon: '💤', title: 'نوم كافٍ',           desc: '7-8 ساعات يومياً تحسن إنتاجيتك بنسبة 30%' },
  { icon: '🥤', title: 'اشرب الماء',         desc: 'اشرب 8 أكواب ماء يومياً لتحسين مزاجك وتركيزك' },
];

const scoreColor = (score: number): string =>
  score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';

const scoreBg = (score: number): string =>
  score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';

// ════════════════════════════════════════════════════════════════
//  المكون
// ════════════════════════════════════════════════════════════════

export default function WellnessPage() {
  const { employeeId, linkMissing } = useEmployeeId();
  const { addToast } = useUIStore();

  // ─── حالة النموذج ─────────────────────────────────────────────
  const [mood, setMood] = useState<WellnessMood>('good');
  const [stress, setStress] = useState(30);
  const [energy, setEnergy] = useState(70);
  const [notes, setNotes] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── حالة البيانات ────────────────────────────────────────────
  const [history, setHistory] = useState<WellnessEntry[]>([]);
  const [todayDone, setTodayDone] = useState(false);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── تحميل البيانات ───────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const today = todayISO();
      const [entries, stats] = await Promise.all([
        wellnessEntryService.findByEmployee(employeeId, 7),
        wellnessEntryService.getStats(employeeId, 7),
      ]);

      const mappedHistory = (entries || []).map(toEntry);
      const todayEntry = mappedHistory.find((e) => e.date === today);

      if (todayEntry) {
        setMood(todayEntry.mood);
        setStress(todayEntry.stress);
        setEnergy(todayEntry.energy);
        setNotes(todayEntry.notes ?? '');
        setTodayDone(true);
      } else {
        setTodayDone(false);
      }

      setHistory(mappedHistory);
      setAvgScore(stats.average || null);
    } catch (err) {
      console.error('[WellnessPage] فشل تحميل البيانات:', err);
      setError(err instanceof Error && err.message ? err.message : 'تعذّر تحميل بيانات العافية');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── حفظ السجل ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجل موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // ★ المرحلة 1: mood رقم 1–5؛ الدالة تتوقّع الاتحاد الضيّق
      const score = calculateWellnessScore({ stress, energy, mood });
      const today = todayISO();

      await wellnessEntryService.saveEntry(employeeId, {
        score,
        mood,
        stress,
        energy,
        notes,
        date: today,
      });

      setShowForm(false);
      addToast(todayDone ? 'تم تحديث حالتك اليوم ✅' : 'تم تسجيل حالتك اليوم بنجاح ✅', 'success');
      await loadData();
    } catch (err) {
      console.error('[WellnessPage] فشل الحفظ:', err);
      const message = err instanceof Error && err.message ? err.message : 'حدث خطأ أثناء حفظ الحالة';
      addToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── حالة التحميل ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <Loader2 className="animate-spin mb-3" size={40} />
            <p className="text-sm font-medium">جاري التحميل...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (linkMissing) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-16">
            <Heart size={40} className="mx-auto mb-4 text-amber-500" />
            <h3 className="font-bold text-slate-800">الحساب غير مرتبط بسجل موظف</h3>
            <p className="mt-2 text-sm text-slate-500">راجع الموارد البشرية قبل تسجيل حالة العافية.</p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── حالة الخطأ ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 bg-red-50 rounded-2xl flex items-center justify-center">
              <Heart size={40} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">تعذّر تحميل بيانات العافية</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">{error}</p>
            <Button onClick={loadData} variant="outline" icon={<RefreshCw size={18} />}>
              إعادة المحاولة
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  العرض الرئيسي
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in" dir="rtl">
      {/* ملخص اليوم */}
      {avgScore !== null && history.length > 0 && (
        <Card className="bg-gradient-to-br from-rose-50 to-pink-50 border-rose-100">
          <div className="p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                <TrendingUp size={22} className="text-rose-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500">متوسط آخر 7 أيام</p>
                <p className={`text-2xl font-extrabold ${scoreColor(avgScore)}`}>{avgScore}%</p>
              </div>
            </div>
            <div className="text-left">
              <p className="text-xs text-slate-500">سجلات هذا الأسبوع</p>
              <p className="text-2xl font-extrabold text-slate-700">{history.length}</p>
            </div>
          </div>
        </Card>
      )}

      {/* تسجيل اليوم / النموذج */}
      {!showForm ? (
        <Card className="border-2 border-dashed border-rose-200 bg-rose-50/30 text-center">
          <Heart size={32} className="mx-auto mb-3 text-rose-400" />
          <p className="font-bold text-slate-700 mb-1">
            {todayDone ? 'هل تريد تحديث حالتك اليوم؟' : 'كيف حالك اليوم؟'}
          </p>
          <p className="text-sm text-slate-500 mb-4">سجّل مزاجك وحالتك النفسية يومياً لمتابعة صحتك</p>
          <Button
            onClick={() => setShowForm(true)}
            icon={<Smile size={15} />}
            iconPosition="left"
          >
            {todayDone ? 'تحديث اليوم' : 'تسجيل يومي'}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-5">
          <h3 className="font-bold text-slate-800">
            {todayDone ? '📝 تحديث الحالة اليومية' : '📝 تسجيل الحالة اليومية'}
          </h3>

          {/* Mood */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">كيف مزاجك اليوم؟</p>
            <div className="flex gap-2">
              {MOOD_ORDER.map((key) => {
                const val = MOOD_META[key];
                return (
                  <button
                    key={key}
                    onClick={() => setMood(key)}
                    className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                      mood === key ? `${val.color} border-opacity-100` : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-2xl">{val.emoji}</span>
                    <span className="text-xs font-medium text-slate-600">{val.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Brain size={15} className="text-red-500" /> مستوى التوتر
              </p>
              <span className={`text-sm font-bold ${stress >= 70 ? 'text-red-600' : stress >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {stress}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={stress}
              onChange={(e) => setStress(Number(e.target.value))}
              className="w-full accent-red-500 cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-400 mt-1">
              <span>منخفض</span>
              <span>متوسط</span>
              <span>مرتفع</span>
            </div>
          </div>

          {/* Energy */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Activity size={15} className="text-emerald-500" /> مستوى الطاقة
              </p>
              <span className={`text-sm font-bold ${energy >= 70 ? 'text-emerald-600' : energy >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                {energy}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={energy}
              onChange={(e) => setEnergy(Number(e.target.value))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Notes */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">ملاحظات (اختياري)</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="شارك أي شيء تودّ التعبير عنه..."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowForm(false)} className="flex-1">
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              loading={submitting}
              className="flex-1"
              icon={<Heart size={14} />}
              iconPosition="left"
            >
              {todayDone ? 'تحديث' : 'حفظ الحالة'}
            </Button>
          </div>
        </Card>
      )}

      {/* التاريخ (آخر 7 أيام) */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📊 آخر التسجيلات</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {history.map((entry) => {
              const meta = MOOD_META[entry.mood];
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <span className="text-2xl flex-shrink-0">{meta.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Calendar size={12} className="text-slate-400" />
                      <span className="text-xs font-medium text-slate-600">
                        {format(new Date(entry.date), 'dd MMMM yyyy', { locale: ar })}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{entry.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${scoreBg(entry.score)}`}
                        style={{ width: `${entry.score}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold w-10 text-left ${scoreColor(entry.score)}`}>
                      {entry.score}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle>💡 نصائح للصحة النفسية</CardTitle>
        </CardHeader>
        <div className="grid md:grid-cols-2 gap-3">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
              <span className="text-2xl">{tip.icon}</span>
              <div>
                <p className="font-bold text-slate-800 text-sm">{tip.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{tip.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}