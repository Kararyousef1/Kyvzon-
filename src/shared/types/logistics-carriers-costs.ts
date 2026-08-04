export interface LogisticsCarrierRecord {
  id: string;
  tenant_id: string;
  carrier_code: string;
  carrier_name_ar: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  service_type: '3pl' | 'freight_forwarder' | 'courier' | 'owner_operator';
  contract_expiry?: string;
  rating: number;
  status: 'active' | 'suspended' | 'blacklisted' | 'contract_expired';
  created_at: string;
  updated_at: string;
}

export interface LogisticsTripCostRecord {
  id: string;
  tenant_id: string;
  dispatch_id?: string;
  carrier_id?: string;
  fuel_cost: number;
  toll_cost: number;
  driver_allowance: number;
  maintenance_share: number;
  total_cost: number;
  revenue: number;
  net_profit: number;
  status: 'pending' | 'approved' | 'invoiced' | 'paid';
  created_at: string;
  updated_at: string;
}
