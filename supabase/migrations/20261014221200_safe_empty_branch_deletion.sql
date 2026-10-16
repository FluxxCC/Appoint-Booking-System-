-- Permit owners to remove only unused, inactive branch drafts. Branch-linked
-- records continue to use restrictive foreign keys so existing data is never
-- cascaded away. Audit history is retained and detached from a removed branch.

alter table public.audit_logs
  drop constraint audit_logs_branch_fkey;
alter table public.audit_logs
  add constraint audit_logs_branch_fkey
  foreign key (branch_id) references public.branches(id) on delete set null;

create function private.reject_audit_mutation_for_branch_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.branch_id is not null
     and new.branch_id is null
     and nullif(current_setting('app.delete_empty_branch_id', true), '') = old.branch_id::text
     and auth.uid() is not null
     and private.is_owner()
     and (to_jsonb(old) - 'branch_id' - 'updated_at') = (to_jsonb(new) - 'branch_id' - 'updated_at') then
    return new;
  end if;

  raise exception 'Audit history is immutable';
end;
$$;
revoke all on function private.reject_audit_mutation_for_branch_delete() from public, anon, authenticated, service_role;
drop trigger immutable_audit on public.audit_logs;
create trigger immutable_audit before update or delete on public.audit_logs
for each row execute function private.reject_audit_mutation_for_branch_delete();

create or replace function private.reject_branch_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not private.is_owner()
     or nullif(current_setting('app.delete_empty_branch_id', true), '') is distinct from old.id::text
     or old.is_default
     or old.is_active
     or old.public_visible
     or old.booking_enabled then
    raise exception 'Only an OWNER can delete an unpublished, inactive draft branch';
  end if;
  return old;
end;
$$;

create function public.owner_delete_empty_branch(p_branch uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  branch_row public.branches;
begin
  if auth.uid() is null or not private.is_owner() then
    raise exception 'OWNER with MFA required to delete a branch' using errcode = '42501';
  end if;
  if p_branch is null then
    raise exception 'Choose a branch' using errcode = '22023';
  end if;

  select * into branch_row
  from public.branches
  where id = p_branch
  for update;
  if not found then
    raise exception 'Branch not found' using errcode = 'P0002';
  end if;
  if branch_row.is_default or branch_row.is_active or branch_row.public_visible or branch_row.booking_enabled then
    raise exception 'Only an unpublished, inactive draft branch can be deleted' using errcode = '55000';
  end if;

  begin
    -- The branch settings row is draft configuration created with the branch.
    -- Other branch relationships are protected by RESTRICT foreign keys below.
    delete from public.branch_booking_settings where branch_id = p_branch;

    insert into public.audit_logs(actor_id, action, entity_table, entity_id, branch_id, details)
    values (
      auth.uid(), 'BRANCH_DELETED', 'branches', p_branch, null,
      jsonb_build_object('name', branch_row.name, 'slug', branch_row.slug, 'branch_id', p_branch)
    );

    perform set_config('app.delete_empty_branch_id', p_branch::text, true);
    delete from public.branches where id = p_branch;
    perform set_config('app.delete_empty_branch_id', '', true);
  exception when foreign_key_violation then
    perform set_config('app.delete_empty_branch_id', '', true);
    raise exception 'This branch has booking or setup history and cannot be deleted. Deactivate or hide it to preserve its records.'
      using errcode = '55000';
  end;

  return true;
end;
$$;

revoke all on function public.owner_delete_empty_branch(uuid) from public, anon, authenticated, service_role;
grant execute on function public.owner_delete_empty_branch(uuid) to authenticated;
comment on function public.owner_delete_empty_branch(uuid) is
  'OWNER/AAL2-only deletion for unpublished, inactive branches. Restrictive foreign keys preserve all related business records; audit history is retained.';
