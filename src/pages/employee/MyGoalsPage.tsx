import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, CheckCircle2, Flag, Plus, Save, Sparkles, Target, TrendingUp } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Badge from '../../shared/components/ui/Badge';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeGoalService, employeeSkillService } from '../../services/sdk';
import type { EmployeeGoalRecord, EmployeeSkillLevel, EmployeeSkillRecord } from '../../shared/types/sdk';
import { getErrorMessage } from '../../services/errors';
import { useEmployeeId } from '../../shared/hooks/useEmployeeId';

const goalCategoryLabels: Record<EmployeeGoalRecord['category'], string> = {
  performance: 'الأداء',
  learning: 'التعلم',
  wellbeing: 'الرفاهية',
  career: 'المسار الوظيفي',
  compliance: 'الامتثال',
  other: 'أخرى',
};

const skillLevelLabels: Record<EmployeeSkillLevel, string> = {
  beginner: 'مبتدئ',
  intermediate: 'متوسط',
  advanced: 'متقدم',
  expert: 'خبير',
};

function statusVariant(status: EmployeeGoalRecord['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'cancelled') return 'danger' as const;
  if (status === 'draft') return 'warning' as const;
  return 'info' as const;
}

function statusLabel(status: EmployeeGoalRecord['status']) {
  const labels: Record<EmployeeGoalRecord['status'], string> = {
    draft: 'مسودة',
    active: 'نشط',
    completed: 'مكتمل',
    cancelled: 'ملغي',
  };
  return labels[status];
}

export default function MyGoalsPage() {
  // ★ 0335: employees.id لا profiles.id — أربع صفحات مرّرت الخطأ
  //   فعرضت قوائم فارغة دائماً.
  const { employeeId, linkMissing } = useEmployeeId();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingSkill, setSavingSkill] = useState(false);
  const [goals, setGoals] = useState<EmployeeGoalRecord[]>([]);
  const [skills, setSkills] = useState<EmployeeSkillRecord[]>([]);
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
    category: 'performance' as EmployeeGoalRecord['category'],
    metric: '',
    target_value: '',
    due_date: '',
  });
  const [skillForm, setSkillForm] = useState({
    skill_name: '',
    category: '',
    level: 'intermediate' as EmployeeSkillLevel,
    evidence: '',
  });

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // ★ 0335: بلا سجلّ موظف لا معنى للجلب — والواجهة تعرض
    //   رسالة «حسابك غير مرتبط بسجلّ موظف» عبر linkMissing.
    if (!employeeId) { setLoading(false); return; }
    try {
      const [goalRows, skillRows] = await Promise.all([
        // ★★ إصلاح 0335: employees.id لا profiles.id
        employeeGoalService.findByEmployee(employeeId),
        employeeSkillService.findByEmployee(employeeId),
      ]);
      setGoals(goalRows || []);
      setSkills(skillRows || []);
    } catch (err) {
      console.error('Employee goals load failed:', getErrorMessage(err));
      addToast('تعذر تحميل الأهداف والمهارات', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = useMemo(() => {
    const active = goals.filter(g => g.status === 'active');
    const completed = goals.filter(g => g.status === 'completed');
    const avgProgress = goals.length
      ? Math.round(goals.reduce((sum, goal) => sum + Number(goal.progress_percent || 0), 0) / goals.length)
      : 0;
    return { active: active.length, completed: completed.length, avgProgress, skills: skills.length };
  }, [goals, skills]);

  const createGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !goalForm.title.trim()) {
      addToast('يرجى إدخال عنوان الهدف', 'warning');
      return;
    }
    // ★★ 0335: لا نُمرّر سلسلة فارغة — هذا بالضبط العطل الذي
    //   أصلحه 0333: `employee_id=eq.` يردّه Postgres بـ400
    //   «invalid input syntax for type uuid». رسالة صريحة أوضح.
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setSavingGoal(true);
    try {
      await employeeGoalService.createGoal({
        employee_id: employeeId,
        title: goalForm.title.trim(),
        description: goalForm.description.trim() || undefined,
        category: goalForm.category,
        metric: goalForm.metric.trim() || undefined,
        target_value: goalForm.target_value.trim() || undefined,
        due_date: goalForm.due_date || undefined,
        progress_percent: 0,
        status: 'active',
        created_by: user.id,
      });
      setGoalForm({ title: '', description: '', category: 'performance', metric: '', target_value: '', due_date: '' });
      addToast('تم إنشاء الهدف بنجاح', 'success');
      await loadData();
    } catch (err) {
      console.error('Create goal failed:', getErrorMessage(err));
      addToast('تعذر إنشاء الهدف', 'error');
    } finally {
      setSavingGoal(false);
    }
  };

  const createSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !skillForm.skill_name.trim()) {
      addToast('يرجى إدخال اسم المهارة', 'warning');
      return;
    }
    // ★★ 0335: لا نُمرّر سلسلة فارغة — هذا بالضبط العطل الذي
    //   أصلحه 0333: `employee_id=eq.` يردّه Postgres بـ400
    //   «invalid input syntax for type uuid». رسالة صريحة أوضح.
    if (!employeeId) {
      addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
      return;
    }
    setSavingSkill(true);
    try {
      await employeeSkillService.upsertSkill({
        employee_id: employeeId,
        skill_name: skillForm.skill_name.trim(),
        category: skillForm.category.trim() || undefined,
        level: skillForm.level,
        evidence: skillForm.evidence.trim() || undefined,
      });
      setSkillForm({ skill_name: '', category: '', level: 'intermediate', evidence: '' });
      addToast('تمت إضافة المهارة', 'success');
      await loadData();
    } catch (err) {
      console.error('Create skill failed:', getErrorMessage(err));
      addToast('تعذر إضافة المهارة', 'error');
    } finally {
      setSavingSkill(false);
    }
  };

  const advanceGoal = async (goal: EmployeeGoalRecord, step: number) => {
    try {
      await employeeGoalService.updateProgress(goal.id, Number(goal.progress_percent || 0) + step, 'تحديث سريع من بوابة الموظف');
      addToast('تم تحديث تقدم الهدف', 'success');
      await loadData();
    } catch (err) {
      console.error('Update goal progress failed:', getErrorMessage(err));
      addToast('تعذر تحديث الهدف', 'error');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><div className="animate-spin h-10 w-10 border-b-2 border-indigo-600 rounded-full" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white overflow-hidden relative">
        <Sparkles className="absolute -left-8 -bottom-8 text-white/10" size={150} />
        <div className="relative z-10">
          <p className="text-white/70 text-sm font-semibold">التطوير الشخصي</p>
          <h2 className="text-2xl font-extrabold mt-1">أهدافي ومهاراتي</h2>
          <p className="text-white/75 mt-2 max-w-2xl text-sm">تابع أهدافك، ارفع مستوى مهاراتك، واربط تطورك بالتدريب والأداء بشكل منظم.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'أهداف نشطة', value: stats.active, icon: Target, color: 'text-indigo-600 bg-indigo-50' },
          { label: 'أهداف مكتملة', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'متوسط التقدم', value: `${stats.avgProgress}%`, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
          { label: 'مهارات مسجلة', value: stats.skills, icon: Award, color: 'text-purple-600 bg-purple-50' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-bold">{item.label}</p>
                  <p className="text-2xl font-extrabold text-slate-800 mt-1">{item.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${item.color}`}><Icon size={20} /></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-extrabold text-slate-800 flex items-center gap-2"><Flag size={18} className="text-indigo-600" /> أهدافي الحالية</h3>
            <span className="text-xs text-slate-400">{goals.length} هدف</span>
          </div>
          <div className="space-y-3">
            {goals.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Target size={36} className="mx-auto mb-2" />
                <p className="text-sm font-bold">لا توجد أهداف بعد. ابدأ بهدف واضح وقابل للقياس.</p>
              </div>
            ) : goals.map(goal => (
              <div key={goal.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="font-bold text-slate-800">{goal.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{goalCategoryLabels[goal.category]}{goal.due_date ? ` • تاريخ مستهدف: ${goal.due_date}` : ''}</p>
                    {goal.description && <p className="text-sm text-slate-600 mt-2">{goal.description}</p>}
                  </div>
                  <Badge variant={statusVariant(goal.status)}>{statusLabel(goal.status)}</Badge>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                    <span>التقدم</span>
                    <span>{goal.progress_percent}%</span>
                  </div>
                  <div className="h-2 bg-white rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full" style={{ width: `${Math.min(Number(goal.progress_percent || 0), 100)}%` }} />
                  </div>
                </div>
                {goal.status === 'active' && (
                  <div className="flex gap-2 mt-3">
                    <Button size="xs" variant="outline" onClick={() => advanceGoal(goal, 10)}>+10%</Button>
                    <Button size="xs" variant="success" onClick={() => advanceGoal(goal, 25)}>+25%</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-extrabold text-slate-800 mb-4 flex items-center gap-2"><Plus size={18} className="text-indigo-600" /> هدف جديد</h3>
          <form onSubmit={createGoal} className="space-y-3">
            <input value={goalForm.title} onChange={e => setGoalForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان الهدف" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <select value={goalForm.category} onChange={e => setGoalForm(p => ({ ...p, category: e.target.value as EmployeeGoalRecord['category'] }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400">
              {Object.entries(goalCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={goalForm.metric} onChange={e => setGoalForm(p => ({ ...p, metric: e.target.value }))} placeholder="المؤشر / KPI" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <input value={goalForm.target_value} onChange={e => setGoalForm(p => ({ ...p, target_value: e.target.value }))} placeholder="القيمة المستهدفة" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <input type="date" value={goalForm.due_date} onChange={e => setGoalForm(p => ({ ...p, due_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <textarea value={goalForm.description} onChange={e => setGoalForm(p => ({ ...p, description: e.target.value }))} placeholder="وصف مختصر" rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:border-indigo-400" />
            <Button type="submit" fullWidth loading={savingGoal} icon={<Save size={14} />} iconPosition="left">حفظ الهدف</Button>
          </form>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="font-extrabold text-slate-800 mb-4 flex items-center gap-2"><BookOpen size={18} className="text-purple-600" /> سجل المهارات</h3>
          <div className="grid md:grid-cols-2 gap-3">
            {skills.length === 0 ? (
              <div className="md:col-span-2 text-center py-8 text-slate-400">لا توجد مهارات مسجلة بعد.</div>
            ) : skills.map(skill => (
              <div key={skill.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-800">{skill.skill_name}</h4>
                  <span className="text-xs font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">{skillLevelLabels[skill.level]}</span>
                </div>
                {skill.category && <p className="text-xs text-slate-500 mt-1">{skill.category}</p>}
                {skill.evidence && <p className="text-xs text-slate-600 mt-2">الدليل: {skill.evidence}</p>}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-extrabold text-slate-800 mb-4 flex items-center gap-2"><Plus size={18} className="text-purple-600" /> إضافة مهارة</h3>
          <form onSubmit={createSkill} className="space-y-3">
            <input value={skillForm.skill_name} onChange={e => setSkillForm(p => ({ ...p, skill_name: e.target.value }))} placeholder="اسم المهارة" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
            <input value={skillForm.category} onChange={e => setSkillForm(p => ({ ...p, category: e.target.value }))} placeholder="التصنيف" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400" />
            <select value={skillForm.level} onChange={e => setSkillForm(p => ({ ...p, level: e.target.value as EmployeeSkillLevel }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-purple-400">
              {Object.entries(skillLevelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <textarea value={skillForm.evidence} onChange={e => setSkillForm(p => ({ ...p, evidence: e.target.value }))} placeholder="دليل أو ملاحظة" rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none resize-none focus:border-purple-400" />
            <Button type="submit" fullWidth loading={savingSkill} icon={<Save size={14} />} iconPosition="left">حفظ المهارة</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
