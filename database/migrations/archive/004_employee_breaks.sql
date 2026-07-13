-- تفعيل خاصية تصاريح الاستراحة للمشرفين والمدراء
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS can_manage_breaks BOOLEAN DEFAULT false;

-- إنشاء جدول تصاريح الاستراحة
CREATE TABLE IF NOT EXISTS public.employee_breaks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    supervisor_name TEXT,
    destination TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 15,
    status TEXT DEFAULT 'approved' CHECK (status IN ('approved', 'out', 'completed', 'cancelled')),
    out_time TIMESTAMP WITH TIME ZONE,
    return_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- سياسات الأمان (RLS) لجدول التصاريح
ALTER TABLE public.employee_breaks ENABLE ROW LEVEL SECURITY;

-- المشرف يمكنه قراءة وكتابة التصاريح التي أصدرها
CREATE POLICY "Supervisors can manage their breaks" ON public.employee_breaks
    FOR ALL USING (auth.uid() = supervisor_id);

-- المشرف يمكنه إدراج تصاريح جديدة
CREATE POLICY "Supervisors can insert their breaks" ON public.employee_breaks
    FOR INSERT WITH CHECK (supervisor_id = auth.uid());

-- الحارس يمكنه قراءة وتحديث التصاريح (لتسجيل الخروج والعودة)
CREATE POLICY "Gatekeepers can read and update breaks" ON public.employee_breaks
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'gatekeeper'
        )
    );

-- الموظف يمكنه قراءة تصاريحه
CREATE POLICY "Employees can read their breaks" ON public.employee_breaks
    FOR SELECT USING (auth.uid() = employee_id);
