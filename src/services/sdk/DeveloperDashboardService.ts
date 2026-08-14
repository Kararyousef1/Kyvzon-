import { supabase } from '../supabase/supabase';

export interface DeveloperProfileRecord {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department: string | null;
  position: string | null;
  phone: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  permissions?: string[];
}

export interface DeveloperIncidentRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  is_anonymous: boolean;
  reported_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface DeveloperAuditRecord {
  id: string;
  action: string;
  actor_id: string | null;
  actor_role: string | null;
  target: string | null;
  details: string | null;
  ip_address: string | null;
  timestamp: string;
}

export interface DeveloperDashboardSnapshot {
  users: DeveloperProfileRecord[];
  incidents: DeveloperIncidentRecord[];
  auditLogs: DeveloperAuditRecord[];
  surveyResponsesCount: number;
  auditLogsCount: number;
}

class DeveloperDashboardService {
  async loadSnapshot(): Promise<DeveloperDashboardSnapshot> {
    const [usersResult, incidentsResult, logsResult, surveyCountResult, logCountResult] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,email,role,department,position,phone,status,created_at,updated_at,permissions'),
      supabase.from('incidents')
        .select('id,title,description,category,severity,status,is_anonymous,reported_by,assigned_to,created_at,updated_at,resolved_at'),
      supabase.from('audit_logs')
        .select('id,action,actor_id,actor_role,target,details,ip_address,timestamp')
        .order('timestamp', { ascending: false })
        .limit(100),
      supabase.from('survey_responses').select('id', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('id', { count: 'exact', head: true }),
    ]);

    if (usersResult.error) throw new Error(usersResult.error.message);
    if (incidentsResult.error) throw new Error(incidentsResult.error.message);
    if (logsResult.error) throw new Error(logsResult.error.message);

    return {
      users: (usersResult.data ?? []) as DeveloperProfileRecord[],
      incidents: (incidentsResult.data ?? []) as DeveloperIncidentRecord[],
      auditLogs: (logsResult.data ?? []) as DeveloperAuditRecord[],
      surveyResponsesCount: surveyCountResult.count ?? 0,
      auditLogsCount: logCountResult.count ?? 0,
    };
  }

  async updateUserStatus(userId: string, status: string): Promise<void> {
    const { error } = await supabase.from('profiles').update({ status }).eq('id', userId);
    if (error) throw new Error(error.message);
  }

  async updateUser(user: Pick<DeveloperProfileRecord, 'id' | 'full_name' | 'email' | 'role' | 'department' | 'position' | 'phone' | 'permissions'>): Promise<void> {
    const { error } = await supabase.from('profiles').update({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department: user.department,
      position: user.position,
      phone: user.phone,
      permissions: user.permissions,
    }).eq('id', user.id);
    if (error) throw new Error(error.message);
  }

  async updateIncidentStatus(incidentId: string, status: string): Promise<void> {
    const { error } = await supabase.from('incidents').update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    }).eq('id', incidentId);
    if (error) throw new Error(error.message);
  }

  async updateIncident(incident: Pick<DeveloperIncidentRecord, 'id' | 'title' | 'description' | 'status' | 'severity' | 'category'>): Promise<void> {
    const { error } = await supabase.from('incidents').update({
      title: incident.title,
      description: incident.description,
      status: incident.status,
      severity: incident.severity,
      category: incident.category,
    }).eq('id', incident.id);
    if (error) throw new Error(error.message);
  }
}

export const developerDashboardService = new DeveloperDashboardService();
