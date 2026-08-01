-- Allow durable schedules to target validated cloud workflows without a Desktop Agent.
-- Desktop schedules keep their existing tenant-scoped device foreign key.

alter table public.workflow_schedules
  alter column device_id drop not null;

alter table public.workflow_schedules
  add column execution_target text not null default 'desktop'
    check (execution_target in ('cloud', 'desktop')),
  add constraint workflow_schedules_target_shape_check
    check (
      (execution_target = 'cloud' and device_id is null)
      or (execution_target = 'desktop' and device_id is not null)
    );
