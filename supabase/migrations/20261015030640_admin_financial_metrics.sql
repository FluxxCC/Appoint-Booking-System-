-- Return a 12-month cash collection and refund trend while retaining the
-- caller's authenticated role and the same branch scope as admin reports.
create or replace function public.admin_financial_metrics_for_branch(p_branch_id uuid)
returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  result jsonb;
  report_timezone text;
begin
  if not private.can_admin_access_workspace(p_branch_id) then
    raise exception 'Admin with MFA required' using errcode = '42501';
  end if;
  perform set_config('app.workspace_branch_id', coalesce(p_branch_id::text, 'all-assigned'), true);
  select coalesce(b.timezone, (select settings.timezone from public.business_settings settings limit 1), 'UTC')
    into report_timezone
    from (select 1) as singleton
    left join public.branches b on b.id = p_branch_id;

  with bounds as (
    select date_trunc('month', now() at time zone report_timezone)::date as current_month
  ), months as (
    select (bounds.current_month - make_interval(months => 11 - n))::date as month
    from bounds cross join generate_series(0, 11) as n
  ), paid as (
    select p.currency,
      date_trunc('month', p.paid_at at time zone report_timezone)::date as month,
      sum(p.amount)::text as amount
    from public.payments p
    join public.appointments a on a.id = p.appointment_id
    cross join bounds
    where p.state = 'SUCCEEDED' and p.paid_at is not null
      and date_trunc('month', p.paid_at at time zone report_timezone)::date
        between bounds.current_month - interval '11 months' and bounds.current_month
    group by p.currency, month
  ), refunded as (
    select p.currency,
      date_trunc('month', r.processed_at at time zone report_timezone)::date as month,
      sum(r.amount)::text as amount
    from public.refunds r
    join public.payments p on p.id = r.payment_id
    join public.appointments a on a.id = p.appointment_id
    cross join bounds
    where r.state = 'SUCCEEDED' and r.processed_at is not null
      and date_trunc('month', r.processed_at at time zone report_timezone)::date
        between bounds.current_month - interval '11 months' and bounds.current_month
    group by p.currency, month
  ), currencies as (
    select currency from paid union select currency from refunded
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', currencies.currency,
    'months', (select jsonb_agg(jsonb_build_object(
      'month', to_char(months.month, 'YYYY-MM'),
      'collected', coalesce(paid.amount, '0'),
      'refunded', coalesce(refunded.amount, '0')
    ) order by months.month)
    from months
    left join paid on paid.currency = currencies.currency and paid.month = months.month
    left join refunded on refunded.currency = currencies.currency and refunded.month = months.month)
  ) order by currencies.currency), '[]'::jsonb)
  into result
  from currencies;
  return result;
end;
$$;

revoke all on function public.admin_financial_metrics_for_branch(uuid) from public, anon, authenticated;
grant execute on function public.admin_financial_metrics_for_branch(uuid) to authenticated;
