import { useState, useEffect } from 'react';
import { CheckCircle, Clock, Star, Send, Loader } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import { useUIStore, useAuthStore } from '../../core/stores';
import { surveyResponseService } from '../../services/sdk';
import { isLocalUser } from '../../services/utils';
import { useEmployeeId } from '../../shared/hooks/useEmployeeId';

const surveys = [
  {
    id: '1',
    title: 'استبيان رضا الموظفين - ديسمبر 2024',
    description: 'استبيان شهري لقياس مستوى الرضا الوظيفي وبيئة العمل',
    deadline: '2024-12-31',
    isCompleted: false,
    questions: [
      { id: 'q1', text: 'كيف تقيّم بيئة العمل العامة؟', type: 'rating' as const },
      { id: 'q2', text: 'هل تشعر بالدعم من إدارتك المباشرة؟', type: 'yes_no' as const },
      { id: 'q3', text: 'ما مدى رضاك عن فرص التطوير المهني؟', type: 'rating' as const },
      { id: 'q4', text: 'هل تعتقد أن التواصل داخل الفريق فعّال؟', type: 'yes_no' as const },
      { id: 'q5', text: 'ما هي اقتراحاتك لتحسين بيئة العمل؟', type: 'text' as const },
    ],
  },
  {
    id: '2',
    title: 'استبيان تقييم الأداء الذاتي',
    description: 'تقييم ذاتي للأداء الربعي',
    deadline: '2024-12-15',
    isCompleted: true,
    questions: [],
  },
];

export default function SurveyPage() {
  // ★ 0335: employees.id لا profiles.id — أربع صفحات مرّرت الخطأ
  //   فعرضت قوائم فارغة دائماً.
  const { employeeId, linkMissing } = useEmployeeId();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [activeSurvey, setActiveSurvey] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const survey = surveys.find(s => s.id === activeSurvey);

  useEffect(() => {
    const fetchCompletedSurveys = async () => {
      if (!user) return;
      
      // التحقق من أن المستخدم محلي (حساب تجريبي)
      if (isLocalUser(user.id)) {
        // استخدام بيانات وهمية للمستخدم المحلي
        setCompleted(new Set(['2'])); // الاستبيان الثاني مكتمل
        setLoading(false);
        return;
      }
      
      // ★★ إصلاح 0335: كان `user.id` — وهو profiles.id بينما العمود
      //   employee_id يشير إلى employees.id. النتيجة: قائمة فارغة
      //   دائماً، فتظهر كل الاستبيانات «غير مكتملة».
      const responses = employeeId
        ? await surveyResponseService.findAll({ filters: { employee_id: employeeId } })
        : [];
      if (responses) {
        // ★ المرحلة 1: نوع بنيوي — survey_id وحده هو المقروء
        type ResponseRow = { survey_id: string };
        setCompleted(new Set(((responses ?? []) as unknown as ResponseRow[]).map((d) => d.survey_id)));
      }
      setLoading(false);
    };
    fetchCompletedSurveys();
  }, [user]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // التحقق من أن المستخدم محلي (حساب تجريبي)
      if (isLocalUser(user?.id)) {
        // محاكاة حفظ الاستبيان للمستخدم المحلي
        await new Promise(resolve => setTimeout(resolve, 500));
        setCompleted(prev => new Set([...prev, activeSurvey!]));
        setActiveSurvey(null);
        setAnswers({});
        addToast('تم إرسال الاستبيان بنجاح! شكراً لمشاركتك 🎉', 'success');
        return;
      }
      
      await surveyResponseService.createResponse({
        survey_id: activeSurvey,
        employee_id: user?.id,
        answers
      } as unknown as Record<string, unknown>);
      setCompleted(prev => new Set([...prev, activeSurvey!]));
      setActiveSurvey(null);
      setAnswers({});
      addToast('تم إرسال الاستبيان بنجاح! شكراً لمشاركتك 🎉', 'success');
    } catch (err) {
      console.error(err);
      addToast('حدث خطأ أثناء حفظ الاستبيان', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (activeSurvey && survey) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">{survey.title}</h2>
          <p className="text-sm text-slate-500 mt-1">{survey.description}</p>
        </div>

        <div className="space-y-4">
          {survey.questions.map((q, i) => (
            <Card key={q.id}>
              <p className="font-semibold text-slate-800 text-sm mb-3">
                <span className="text-indigo-600 font-bold ml-2">{i + 1}.</span>
                {q.text}
              </p>

              {q.type === 'rating' && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: n }))}
                      className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                        answers[q.id] === n ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-amber-200'
                      }`}
                    >
                      <Star size={18} className={answers[q.id] >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                      <span className="text-xs text-slate-500">{n}</span>
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'yes_no' && (
                <div className="flex gap-3">
                  {['نعم', 'لا'].map(val => (
                    <button
                      key={val}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: val }))}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
                        answers[q.id] === val
                          ? val === 'نعم' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-red-400 bg-red-50 text-red-700'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {val === 'نعم' ? '✅ ' : '❌ '}{val}
                    </button>
                  ))}
                </div>
              )}

              {q.type === 'text' && (
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="اكتب إجابتك هنا..."
                  rows={4}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              )}
            </Card>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setActiveSurvey(null)} className="flex-1">إلغاء</Button>
          <Button onClick={handleSubmit} loading={submitting} icon={<Send size={14} />} iconPosition="left" className="flex-1">
            إرسال الاستبيان
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <h2 className="text-xl font-extrabold text-slate-800">📋 الاستبيانات</h2>

      {loading && (
        <div className="flex justify-center items-center py-12 text-slate-500 gap-3">
          <Loader className="animate-spin" />
          <span className="text-sm font-medium">جاري تحميل الاستبيانات...</span>
        </div>
      )}

      {!loading && (
        <div className="grid gap-4">
          {surveys.map(s => {
          const isDone = completed.has(s.id);
          return (
            <Card key={s.id} hover={!isDone} className={isDone ? 'opacity-70' : ''}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isDone ? 'bg-emerald-100' : 'bg-indigo-100'
                }`}>
                  {isDone ? <CheckCircle size={22} className="text-emerald-600" /> : <Clock size={22} className="text-indigo-600" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-slate-800">{s.title}</h3>
                      <p className="text-sm text-slate-500 mt-0.5">{s.description}</p>
                    </div>
                    <Badge variant={isDone ? 'success' : 'warning'} dot>
                      {isDone ? 'مكتمل' : 'في الانتظار'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock size={12} />
                      <span>ينتهي: {s.deadline}</span>
                    </div>
                    {!isDone && (
                      <Button size="sm" onClick={() => setActiveSurvey(s.id)} icon={<CheckCircle size={13} />} iconPosition="left">
                        بدء الاستبيان
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
}
