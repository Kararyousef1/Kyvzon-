import { useState, useEffect } from 'react';
import { Search, Mail, Phone, Star, Loader, ServerCrash } from 'lucide-react';
import { employeeService } from '../../services/sdk/EmployeeService';
import { departmentService } from '../../services/sdk/DepartmentService';
import { incidentService } from '../../services/sdk/IncidentService';
import { wellnessEntryService } from '../../services/sdk/WellnessService';
import { certificationService } from '../../services/sdk/CertificationService';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Badge from '../../shared/components/ui/Badge';

interface EmployeeProfile {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  role: string;
  status: 'active' | 'inactive' | 'on_leave';
  wellnessScore: number;
  problemsCount: number;
  certsCount: number;
}

const statusLabels: Record<string, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
  on_leave: 'إجازة',
};

const statusVariants: Record<string, any> = {
  active: 'success',
  inactive: 'neutral',
  on_leave: 'warning',
};

export default function TeamPage() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    const fetchEmployees = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const empsData = await employeeService.findAll();
        const deptsData = await departmentService.findAll();
        const deptMap = new Map((deptsData || []).map((d: { id: string; name_ar: string }) => [d.id, d.name_ar]));
        
        const profilesData = (empsData || []).map((e: any) => ({
          ...e,
          full_name: e.full_name_ar || e.full_name || '',
          department: deptMap.get(e.department_id || '') || '',
          status: e.is_active ? 'active' : 'inactive',
        }));
        
        if (profilesData.length === 0) {
          setEmployees([]);
          setLoading(false);
          return;
        }

        const incidentsData = await incidentService.findAll() || [];
        const wellnessData = await wellnessEntryService.findAllEntries() || [];
        const certsData = await certificationService.findAllCertifications() || [];

        const mappedData = (profilesData || []).map(profile => {
          const empIncidents = incidentsData.filter(i => i.reported_by === profile.id && i.status !== 'closed' && i.status !== 'resolved');
          const empWellness = wellnessData.filter(w => w.employee_id === profile.id);
          const avgWellness = empWellness.length > 0 ? Math.round(empWellness.reduce((a, b) => a + (b.mood_score ?? 0), 0) / empWellness.length) : 0;
          const empCerts = certsData.filter(c => c.employee_id === profile.id).length;
          return {
            ...profile,
            wellnessScore: avgWellness,
            problemsCount: empIncidents.length,
            certsCount: empCerts,
          };
        });
        setEmployees(mappedData);
      } catch (err: unknown) {
        console.error('Error fetching employees:', err);
        const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
        setError(`فشل في جلب البيانات: ${msg}`);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  const departments = ['all', ...new Set(employees.map(e => e.department).filter(Boolean) as string[])];

  const filtered = employees.filter(e => {
    if (filterDept !== 'all' && e.department !== filterDept) return false;
    
    const searchLower = search.toLowerCase();
    const nameMatch = (e.full_name || '').toLowerCase().includes(searchLower);
    const emailMatch = (e.email || '').toLowerCase().includes(searchLower);
    if (search && !nameMatch && !emailMatch) return false;
    
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">👥 فريق العمل</h2>
          <p className="text-sm text-slate-500">{filtered.length} موظف</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('grid')} className={`p-2 rounded-lg ${view === 'grid' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
            ⊞
          </button>
          <button onClick={() => setView('list')} className={`p-2 rounded-lg ${view === 'list' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
            ≡
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث بالاسم أو البريد..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 cursor-pointer"
        >
          {departments.map(d => (
            <option key={d} value={d}>{d === 'all' ? 'جميع الأقسام' : d}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center items-center h-64">
          <div className="flex items-center gap-3 text-slate-500">
            <Loader className="animate-spin" />
            <span>جاري تحميل بيانات الفريق...</span>
          </div>
        </div>
      )}

      {error && !loading && (
        <Card className="bg-red-50 border-red-200 text-red-700">
          <div className="flex items-center gap-3">
            <ServerCrash />
            <p>{error}</p>
          </div>
        </Card>
      )}

      {view === 'grid' ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => (
            <Card key={emp.id} hover className="group">
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${
                  emp.status === 'active' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' :
                  emp.status === 'on_leave' ? 'bg-gradient-to-br from-amber-500 to-orange-500' :
                  'bg-slate-200'
                }`}>{/* I need to check if full_name can be null. Schema says NOT NULL. So this is safe. */}
                  {emp.full_name?.charAt(0) || 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-800 text-sm truncate">{emp.full_name || 'بدون اسم'}</h3>
                    <Badge variant={statusVariants[emp.status]} size="sm">{statusLabels[emp.status]}</Badge>
                  </div>
                  <div className="mt-1">
                    <Badge variant={emp.role === 'admin' ? 'danger' : emp.role === 'hr' ? 'success' : emp.role === 'developer' ? 'warning' : 'primary'} size="sm">
                      {emp.role === 'admin' ? 'مدير نظام' : emp.role === 'hr' ? 'موارد بشرية' : emp.role === 'developer' ? 'مطور' : emp.role === 'gatekeeper' ? 'حارس' : emp.role === 'manager' ? 'مدير قسم' : emp.role === 'supervisor' ? 'مشرف' : 'موظف'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{emp.position}</p>
                  <p className="text-xs text-indigo-600 font-medium mt-0.5">{emp.department}</p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Mail size={11} />
                  <span className="truncate">{emp.email}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Phone size={11} />
                  <span>{emp.phone || 'غير محدد'}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Star size={12} className="text-amber-500" />
                  <span className="text-xs font-semibold text-slate-600">صحة: {emp.wellnessScore}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{emp.certsCount} شهادات</span>
                </div>
                {emp.problemsCount > 0 && (
                  <Badge variant="warning" size="sm">{emp.problemsCount} مشاكل</Badge>
                )}
              </div>

              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-2">
                <div
                  className={`h-full rounded-full ${emp.wellnessScore >= 75 ? 'bg-emerald-500' : emp.wellnessScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${emp.wellnessScore}%` }}
                />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['الموظف', 'الدور', 'القسم', 'المسمى', 'الحالة', 'الشهادات', 'الصحة', 'المشاكل'].map(h => (
                    <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp, i) => (
                  <tr key={emp.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                          {emp.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{emp.full_name || 'بدون اسم'}</p>
                          <p className="text-xs text-slate-400">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={emp.role === 'admin' ? 'danger' : emp.role === 'hr' ? 'success' : emp.role === 'developer' ? 'warning' : 'primary'} size="sm">
                        {emp.role === 'admin' ? 'مدير نظام' : emp.role === 'hr' ? 'موارد بشرية' : emp.role === 'developer' ? 'مطور' : emp.role === 'gatekeeper' ? 'حارس أمن' : emp.role === 'manager' ? 'مدير قسم' : emp.role === 'supervisor' ? 'مشرف' : 'موظف'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{emp.department}</td>
                    <td className="py-3 px-4 text-slate-600">{emp.position}</td>
                    <td className="py-3 px-4">
                      <Badge variant={statusVariants[emp.status]} size="sm">{statusLabels[emp.status]}</Badge>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-600">
                      {emp.certsCount}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${emp.wellnessScore >= 75 ? 'bg-emerald-500' : emp.wellnessScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${emp.wellnessScore}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">{emp.wellnessScore}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {emp.problemsCount > 0
                        ? <Badge variant="warning" size="sm">{emp.problemsCount}</Badge>
                        : <span className="text-xs text-slate-400">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
