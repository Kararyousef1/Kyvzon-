import { useState } from 'react';
import { employeeService } from '../../../../services/sdk/EmployeeService';
import { incidentService } from '../../../../services/sdk/IncidentService';
import { wellnessEntryService } from '../../../../services/sdk/WellnessService';
import { reviewService } from '../../../../services/sdk/ReviewService';

interface DashboardData {
  totalEmployees: number;
  activeEmployees: number;
  wellnessScore: number;
  satisfactionRate: number;
  resolvedThisMonth: number;
  pending: number;
  inProgress: number;
  critical: number;
  escalated: number;
  monthlyTrend: any[];
  categoryBreakdown: any[];
  departmentStats: any[];
  severityBreakdown: any[];
  wellnessTrend: any[];
  recentIncidents: any[];
  topDepartments: any[];
  recentReviews: any[];
}

export function useHRDashboardData() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<DashboardData>({
    totalEmployees: 0,
    activeEmployees: 0,
    wellnessScore: 0,
    satisfactionRate: 85,
    resolvedThisMonth: 0,
    pending: 0,
    inProgress: 0,
    critical: 0,
    escalated: 0,
    monthlyTrend: [],
    categoryBreakdown: [],
    departmentStats: [],
    severityBreakdown: [],
    wellnessTrend: [],
    recentIncidents: [],
    topDepartments: [],
    recentReviews: [],
  });

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Fetch employees
      const employees = await employeeService.findAllEmployees();
      const totalEmployees = employees.length;
      const activeEmployees = employees.filter(e => e.is_active).length;

      // Fetch incidents
      const incidents = await incidentService.findAll({ limit: 50 });

      // Fetch wellness
      const wellness = await wellnessEntryService.findAll({ limit: 100 });

      // Fetch reviews
      const reviews = await reviewService.findAll({ limit: 20 });

      // Calculate stats
      const pending = incidents.filter(i => i.status === 'pending').length;
      const inProgress = incidents.filter(i => i.status === 'in_progress').length;
      const critical = incidents.filter(i => i.severity === 'critical').length;
      const escalated = incidents.filter(i => i.status === 'escalated').length;
      const resolvedThisMonth = incidents.filter(i => 
        i.status === 'resolved' && 
        new Date(i.updated_at).getMonth() === new Date().getMonth()
      ).length;

      // Simple wellness average
      const avgWellness = wellness.length > 0 
        ? Math.round(wellness.reduce((sum, w) => sum + w.score, 0) / wellness.length)
        : 75;

      setData(prev => ({
        ...prev,
        totalEmployees,
        activeEmployees,
        wellnessScore: avgWellness,
        pending,
        inProgress,
        critical,
        escalated,
        resolvedThisMonth,
        recentIncidents: incidents.slice(0, 5),
        recentReviews: reviews.slice(0, 5),
      }));

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  return {
    data,
    loading,
    refreshing,
    fetchData,
    setData,
  };
}