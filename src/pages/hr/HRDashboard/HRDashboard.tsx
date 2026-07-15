/**
 * HRDashboard - الصفحة الرئيسية لقسم الموارد البشرية
 * 
 * تم إعادة هيكلتها لتكون أكثر قابلية للصيانة والاختبار
 */

import { useEffect, useState } from 'react';
import { useUIStore } from '../../../core/stores';
import { useHRDashboardData } from './hooks/useHRDashboardData';

// Components
import KPICard from './components/KPICard';
import CircleGauge from './components/CircleGauge';

// Icons
import {
  AlertCircle, CheckCircle, Clock, Users, Star, Activity,
  FileText, Monitor, Calendar, TrendingUp, Heart, Zap,
  RefreshCw, Bell, Shield, BarChart2
} from 'lucide-react';

// UI Components
import Card, { CardHeader, CardTitle } from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Badge from '../../../shared/components/ui/Badge';

// Charts
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Legend
} from 'recharts';

// Router shim
import { useNavigate } from 'react-router-dom';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function HRDashboard() {
  const navigate = useNavigate();
  const { data, loading, refreshing, fetchData } = useHRDashboardData();

  const [activeTab, setActiveTab] = useState<'overview' | 'problems' | 'wellness'>('overview');

  // Load data on mount
  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-600" />
          <p className="mt-4 text-slate-600">جاري تحميل لوحة التحكم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">لوحة تحكم الموارد البشرية</h1>
          <p className="text-slate-600 mt-1">نظرة عامة على أداء المنظمة</p>
        </div>
        
        <Button 
          onClick={() => fetchData(true)} 
          disabled={refreshing}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="إجمالي الموظفين"
          value={data.totalEmployees}
          icon={Users}
          color="#6366f1"
          bg="#e0e7ff"
        />
        <KPICard
          label="الموظفين النشطين"
          value={data.activeEmployees}
          icon={Activity}
          color="#10b981"
          bg="#d1fae5"
          trend="+12%"
          trendUp={true}
        />
        <KPICard
          label="متوسط الرفاهية"
          value={data.wellnessScore}
          icon={Heart}
          color="#f59e0b"
          bg="#fef3c7"
          suffix="%"
        />
        <KPICard
          label="المشاكل المعلقة"
          value={data.pending}
          icon={AlertCircle}
          color="#ef4444"
          bg="#fee2e2"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'overview', label: 'نظرة عامة', icon: BarChart2 },
          { id: 'problems', label: 'المشاكل', icon: AlertCircle },
          { id: 'wellness', label: 'الرفاهية', icon: Heart },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === tab.id 
                ? 'border-indigo-600 text-indigo-600 font-medium' 
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Incidents Summary */}
          <Card>
            <CardHeader>
              <CardTitle>ملخص المشاكل</CardTitle>
            </CardHeader>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600">{data.pending}</div>
                <div className="text-sm text-slate-600">معلق</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{data.inProgress}</div>
                <div className="text-sm text-slate-600">قيد المعالجة</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{data.critical}</div>
                <div className="text-sm text-slate-600">حرج</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-600">{data.resolvedThisMonth}</div>
                <div className="text-sm text-slate-600">تم حلها هذا الشهر</div>
              </div>
            </div>
          </Card>

          {/* Wellness Score */}
          <Card>
            <CardHeader>
              <CardTitle>مؤشر الرفاهية</CardTitle>
            </CardHeader>
            <div className="p-6 flex items-center justify-center">
              <div className="text-center">
                <CircleGauge value={data.wellnessScore} color="#10b981" size={120} />
                <div className="mt-4">
                  <div className="text-4xl font-bold text-emerald-600">{data.wellnessScore}%</div>
                  <div className="text-sm text-slate-600">متوسط الرفاهية</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'problems' && (
        <Card>
          <CardHeader>
            <CardTitle>آخر المشاكل</CardTitle>
          </CardHeader>
          <div className="p-6">
            {data.recentIncidents.length > 0 ? (
              <div className="space-y-3">
                {data.recentIncidents.map((incident, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{incident.title}</div>
                      <div className="text-sm text-slate-600">{incident.status}</div>
                    </div>
                    <Badge variant={incident.severity === 'critical' ? 'danger' : 'warning'}>
                      {incident.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">لا توجد مشاكل حالياً</div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'wellness' && (
        <Card>
          <CardHeader>
            <CardTitle>إحصائيات الرفاهية</CardTitle>
          </CardHeader>
          <div className="p-6">
            <div className="text-center py-8">
              <div className="text-6xl font-bold text-emerald-600 mb-2">{data.wellnessScore}</div>
              <div className="text-xl text-slate-600">متوسط درجة الرفاهية</div>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button onClick={() => navigate('/app/hr/team')} variant="outline">
          إدارة الفريق
        </Button>
        <Button onClick={() => navigate('/app/hr/attendance')} variant="outline">
          سجل الحضور
        </Button>
        <Button onClick={() => navigate('/app/hr/problems')} variant="outline">
          إدارة المشاكل
        </Button>
      </div>
    </div>
  );
}