-- ============================================================================
-- 400_add_missing_indexes.sql
-- فهارس مفقودة للجداول الجديدة (الرواتب، الأداء، التوظيف، إلخ)
-- ============================================================================
-- التاريخ: 2026-07-13
-- السبب: تم إنشاء الجداول في Migrations 070 و 071 وغيرها بدون فهارس كافية
-- ============================================================================

-- ═══════════════════════════════════════════════
-- 1. payroll_periods
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant
  ON public.payroll_periods(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_status
  ON public.payroll_periods(status);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates
  ON public.payroll_periods(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_tenant_status
  ON public.payroll_periods(tenant_id, status);

-- ═══════════════════════════════════════════════
-- 2. payroll_records
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payroll_records_tenant
  ON public.payroll_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee
  ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_period
  ON public.payroll_records(payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_period
  ON public.payroll_records(employee_id, payroll_period_id);

-- ═══════════════════════════════════════════════
-- 3. payroll_allowances & payroll_deductions
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payroll_allowances_record
  ON public.payroll_allowances(payroll_record_id);
CREATE INDEX IF NOT EXISTS idx_payroll_allowances_type
  ON public.payroll_allowances(allowance_type);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_record
  ON public.payroll_deductions(payroll_record_id);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_type
  ON public.payroll_deductions(deduction_type);

-- ═══════════════════════════════════════════════
-- 4. employee_loans & loan_repayments
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employee_loans_tenant
  ON public.employee_loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee
  ON public.employee_loans(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_loans_status
  ON public.employee_loans(status);
CREATE INDEX IF NOT EXISTS idx_employee_loans_employee_status
  ON public.employee_loans(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan
  ON public.loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_loan_repayments_due_date
  ON public.loan_repayments(due_date);

-- ═══════════════════════════════════════════════
-- 5. bonuses
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bonuses_tenant
  ON public.bonuses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_employee
  ON public.bonuses(employee_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_date
  ON public.bonuses(bonus_date);
CREATE INDEX IF NOT EXISTS idx_bonuses_employee_date
  ON public.bonuses(employee_id, bonus_date);

-- ═══════════════════════════════════════════════
-- 6. payroll_settings
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payroll_settings_tenant
  ON public.payroll_settings(tenant_id);

-- ═══════════════════════════════════════════════
-- 7. performance_cycles & performance_reviews
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_performance_cycles_tenant
  ON public.performance_cycles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_cycles_status
  ON public.performance_cycles(status);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_cycle
  ON public.performance_reviews(cycle_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee
  ON public.performance_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_reviewer
  ON public.performance_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_performance_reviews_employee_cycle
  ON public.performance_reviews(employee_id, cycle_id);

-- ═══════════════════════════════════════════════
-- 8. performance_goals
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_performance_goals_review
  ON public.performance_goals(review_id);
CREATE INDEX IF NOT EXISTS idx_performance_goals_status
  ON public.performance_goals(status);

-- ═══════════════════════════════════════════════
-- 9. disciplinary_actions
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_disciplinary_actions_tenant
  ON public.disciplinary_actions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_actions_employee
  ON public.disciplinary_actions(employee_id);
CREATE INDEX IF NOT EXISTS idx_disciplinary_actions_date
  ON public.disciplinary_actions(action_date);

-- ═══════════════════════════════════════════════
-- 10. employee_documents
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employee_documents_tenant
  ON public.employee_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee
  ON public.employee_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type
  ON public.employee_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_type
  ON public.employee_documents(employee_id, document_type);

-- ═══════════════════════════════════════════════
-- 11. expense_requests
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_expense_requests_tenant
  ON public.expense_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expense_requests_employee
  ON public.expense_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_expense_requests_status
  ON public.expense_requests(status);
CREATE INDEX IF NOT EXISTS idx_expense_requests_employee_status
  ON public.expense_requests(employee_id, status);

-- ═══════════════════════════════════════════════
-- 12. shift_schedules & shift_assignments
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_shift_schedules_tenant
  ON public.shift_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_schedules_date
  ON public.shift_schedules(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_tenant
  ON public.shift_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_employee
  ON public.shift_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date
  ON public.shift_assignments(shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_tenant
  ON public.shift_swap_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_status
  ON public.shift_swap_requests(status);

-- ═══════════════════════════════════════════════
-- 13. job_postings & job_applications
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_job_postings_tenant
  ON public.job_postings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_status
  ON public.job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_posting
  ON public.job_applications(posting_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status
  ON public.job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_email
  ON public.job_applications(email);

-- ═══════════════════════════════════════════════
-- 14. onboarding & offboarding
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_tenant
  ON public.onboarding_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_department
  ON public.onboarding_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_employee
  ON public.employee_onboarding(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_status
  ON public.employee_onboarding(status);
CREATE INDEX IF NOT EXISTS idx_offboarding_records_employee
  ON public.offboarding_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_offboarding_records_date
  ON public.offboarding_records(exit_date);

-- ═══════════════════════════════════════════════
-- 15. employee_contracts
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employee_contracts_tenant
  ON public.employee_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee
  ON public.employee_contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_status
  ON public.employee_contracts(status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_end_date
  ON public.employee_contracts(end_date);

-- ═══════════════════════════════════════════════
-- 16. profiles (فهارس إضافية)
-- ═══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role
  ON public.profiles(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_status
  ON public.profiles(tenant_id, status);
