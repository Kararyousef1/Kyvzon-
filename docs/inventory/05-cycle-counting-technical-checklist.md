# الملحق التقني للوحدة 05 — الجرد الدوري وضبط المخزون

المصدر: `docs/inventory/05-cycle-counting-inventory-accuracy.md`

## Checklist التنفيذ

### Cycle Count Plans
- `inventory_cycle_count_plans`
- `inventory_cycle_count_plan_locations`
- طرق: `abc`, `location`, `event`, `control_group`, `annual_wall_to_wall`.
- ترددات ABC: A شهري، B ربع سنوي، C نصف سنوي/سنوي.
- RPC: `generate_inventory_cycle_count_schedule(...)`.

### Count Tasks / Mobile Counting
- `inventory_count_tasks`
- `inventory_count_task_lines`
- blind count: لا تعرض expected_qty للعداد في واجهة العد.
- scan location + item + lot.
- RPC: `submit_inventory_count(...)`.

### Double/Triple Count
- إذا فرق 0.5%-2% → second_count_required.
- إذا فرق >2% → third_count_required + investigation.
- `inventory_count_verifications`.
- RPC: `request_inventory_recount(...)`.

### Variance Analysis
- `inventory_variance_reasons`.
- `inventory_count_variances`.
- تصنيف أسباب الفروق: human_error, theft_loss, damage_waste, system_error, unknown.
- View: `inventory_variance_analysis`.

### Adjustments Approval
- `inventory_adjustment_approvals`.
- صلاحيات كمية: worker 10، supervisor 100، manager 500، finance above.
- RPCs:
  - `approve_inventory_adjustment(...)`
  - `post_inventory_count_adjustments(...)`
- كل تعديل يمر عبر `post_inventory_movement('adjustment', ...)`.

### Annual Wall-to-Wall
- `inventory_annual_count_plans`.
- `inventory_count_freezes` لتجميد المواقع/المستودع.
- RPC: `freeze_inventory_for_count(...)` و `unfreeze_inventory_after_count(...)`.

### IRA Dashboard / Expiry Report
- `inventory_ira_dashboard`.
- `inventory_cycle_count_completion`.
- `inventory_expiry_count_report`.
- KPIs: IRA، completion rate، variance rate، major variance rate، avg resolution hours.

## Acceptance Criteria
- AC-CC-01: خطة ABC تنشئ مهام بتردد مناسب لكل فئة.
- AC-CC-02: واجهة العد لا تعرض expected_qty.
- AC-CC-03: فرق 0.5%-2% يطلب عدّاً ثانياً.
- AC-CC-04: فرق >2% يطلب عدّاً ثالثاً وتحقيقاً.
- AC-CC-05: لا يمكن ترحيل adjustment كبير دون موافقة مناسبة.
- AC-CC-06: كل adjustment ينشئ حركة immutable.
- AC-CC-07: freeze يمنع عمليات حساسة على المواقع المجمدة.
- AC-CC-08: لا توجد RPC تقبل `p_tenant_id`.
