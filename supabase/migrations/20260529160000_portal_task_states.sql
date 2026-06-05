-- Портал: операционное состояние задач roadmap (статус, исполнитель)
create table if not exists public.portal_task_states (
  task_id text primary key,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assignee_user_id uuid references auth.users(id) on delete set null,
  assignee_display text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists portal_task_states_status_idx
  on public.portal_task_states (status);

create index if not exists portal_task_states_assignee_idx
  on public.portal_task_states (assignee_user_id);

alter table public.portal_task_states enable row level security;

drop policy if exists "portal_task_states_select_auth" on public.portal_task_states;
create policy "portal_task_states_select_auth"
  on public.portal_task_states for select
  to authenticated
  using (true);

drop policy if exists "portal_task_states_insert_auth" on public.portal_task_states;
create policy "portal_task_states_insert_auth"
  on public.portal_task_states for insert
  to authenticated
  with check (true);

drop policy if exists "portal_task_states_update_auth" on public.portal_task_states;
create policy "portal_task_states_update_auth"
  on public.portal_task_states for update
  to authenticated
  using (true)
  with check (true);

comment on table public.portal_task_states is
  'Состояние задач program portal; определения задач — в docs-site/src/portal/tasks.ts';
