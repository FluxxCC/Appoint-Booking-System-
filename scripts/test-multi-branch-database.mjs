import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createDatabase} from './database-harness.mjs';

const migrationFile='20261007120000_multi_branch_phase_1_foundation.sql';
const phase2MigrationFile='20261008130707_owner_branch_management.sql';
const phase3MigrationFile='20261008170000_phase_3_branch_scoped_workspaces.sql';
const phase4MigrationFile='20261009100000_phase_4_branch_aware_public_booking.sql';
const branchDeletionMigrationFile='20261014221200_safe_empty_branch_deletion.sql';
const db=await createDatabase({stopBeforeMigration:migrationFile});
let checks=0;
const ids=Object.fromEntries(['owner','admin','staffUser','customerUser','otherCustomerUser'].map(k=>[k,randomUUID()]));
async function actor(role,user='',aal='aal1'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]);
  await db.exec(`set role ${role}`);
}
async function scalar(sql,params=[]){return Object.values((await db.query(sql,params)).rows[0])[0];}
function equal(label,a,b){assert.deepEqual(a,b,label);checks++;}
async function denied(label,sql,params=[]){await assert.rejects(db.query(sql,params),undefined,label);checks++;}

try{
  for(const [name,id] of Object.entries(ids)){
    await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${name}@branch.test`]);
  }
  await actor('service_role');
  for(const [name,id] of Object.entries(ids)){
    await db.query('update public.profiles set display_name=$2 where auth_user_id=$1',[id,name]);
  }
  await db.query("insert into public.user_roles(auth_user_id,role) values($1,'OWNER'),($2,'ADMIN'),($3,'STAFF')",[ids.owner,ids.admin,ids.staffUser]);
  await db.query(`insert into public.business_settings(name,timezone,currency,address,published,
    service_origin_latitude,service_origin_longitude,home_service_max_radius_km)
    values('Migration Test Studio','Asia/Manila','PHP','11 Legacy Street',true,7.154,125.278,30)`);
  const category=await scalar(`insert into public.service_categories(name,slug,active,published)
    values('Hair','hair',true,true) returning id`);
  await db.query(`insert into public.announcements(title,body,published)
    values('Welcome','Public announcement fixture',true)`);
  await db.query(`insert into public.booking_policy_versions(version,payment_window_minutes,minimum_notice_minutes,
    maximum_advance_days,terms,published,created_at,updated_at)
    values(1,45,0,120,'Original policy',true,'2024-02-03T04:05:06Z','2024-02-03T04:05:06Z')`);
  await db.query(`insert into public.business_hours(weekday,opens_at,closes_at,created_at,updated_at)
    select day,'08:00','20:00','2024-02-03T04:05:06Z','2024-02-03T04:05:06Z' from generate_series(0,6) day`);
  const staff=await scalar(`insert into public.staff(auth_user_id,display_name,slug,active,published,bookable)
    values($1,'Existing Staff','existing-staff',true,true,true) returning id`,[ids.staffUser]);
  const staff2=await scalar(`insert into public.staff(display_name,slug,active,published,bookable)
    values('Other Staff','other-staff',true,true,true) returning id`);
  const service=await scalar(`insert into public.services(category_id,name,slug,price_amount,duration_minutes,payment_mode,deposit_amount,
    active,published,supports_business_location,supports_home_service,home_service_fee)
    values($1,'Existing Service','existing-service',10000,60,'DEPOSIT',1000,true,true,true,true,500) returning id`,[category]);
  await db.query('insert into public.staff_services(staff_id,service_id,active) values($1,$2,true)',[staff,service]);
  await db.query(`insert into public.staff_working_hours(staff_id,weekday,starts_at,ends_at,created_at,updated_at)
    select $1,day,'08:00','20:00','2024-02-03T04:05:06Z','2024-02-03T04:05:06Z' from generate_series(0,6) day`,[staff]);
  await db.query(`insert into public.staff_schedule_exceptions(staff_id,kind,starts_at,ends_at,reason,created_at,updated_at)
    values($1,'UNAVAILABLE',now()+interval '20 days',now()+interval '20 days 1 hour','Existing leave','2024-02-03T04:05:06Z','2024-02-03T04:05:06Z'),
          ($1,'EXTRA_HOURS',now()+interval '30 days',now()+interval '30 days 1 hour','Existing extra hours','2024-02-03T04:05:06Z','2024-02-03T04:05:06Z')`,[staff]);
  await db.query(`insert into public.business_closures(starts_at,ends_at,public_reason,created_at,updated_at)
    values(now()+interval '40 days',now()+interval '40 days 2 hours','Existing closure','2024-02-03T04:05:06Z','2024-02-03T04:05:06Z')`);
  const customer=await scalar(`insert into public.customers(auth_user_id,display_name,email)
    values($1,'Existing Customer','customer@branch.test') returning id`,[ids.customerUser]);
  const bookingDay=await scalar("select ((now() at time zone 'Asia/Manila')::date+7)::text");
  const appointment=await scalar(`select public.request_appointment($1,$2,$3,
    ($4::date+time '10:00') at time zone 'Asia/Manila',$5)`,[customer,staff,service,bookingDay,randomUUID()]);
  await actor('authenticated',ids.admin,'aal2');
  await scalar('select public.accept_appointment($1)',[appointment]);
  await actor('service_role');
  const payment=await scalar(`insert into public.payments(appointment_id,provider,provider_reference,idempotency_key,amount,currency)
    values($1,'fixture',$2,$3,1000,'PHP') returning id`,[appointment,randomUUID(),randomUUID()]);
  await scalar("select public.record_verified_payment($1,$2,clock_timestamp())",[payment,'phase-one-paid']);
  const refund=await scalar(`insert into public.refunds(payment_id,amount,idempotency_key,reason)
    values($1,500,$2,'Original refund request') returning id`,[payment,randomUUID()]);
  const guestHash=createHash('sha256').update('phase-one-guest-token').digest('hex');
  const guestToken=await scalar(`insert into public.guest_access_tokens(appointment_id,token_hash,scope,expires_at)
    values($1,$2,'VIEW',now()+interval '10 days') returning id`,[appointment,guestHash]);
  const historicalAppointment=await scalar(`select to_jsonb(a) from public.appointments a where id=$1`,[appointment]);
  const historicalPolicy=await scalar(`select to_jsonb(p) from public.booking_policy_versions p where version=1`);
  const historicalPayment=await scalar(`select to_jsonb(p) from public.payments p where id=$1`,[payment]);
  const historicalRefund=await scalar(`select to_jsonb(r) from public.refunds r where id=$1`,[refund]);
  const historicalGuest=await scalar(`select to_jsonb(g) from public.guest_access_tokens g where id=$1`,[guestToken]);
  const historicalHours=await scalar(`select jsonb_agg(to_jsonb(h) order by weekday) from public.business_hours h`);
  const historicalAudit=await scalar(`select jsonb_agg(to_jsonb(a) order by id) from public.audit_logs a`);
  const migration=await readFile(`supabase/migrations/${migrationFile}`,'utf8');
  await db.exec('reset role');
  try{await db.exec(migration);}catch(error){console.error(`Phase 1 migration failed: ${error.message}\n${error.where??''}`);throw error;}
  await db.exec(await readFile(`supabase/migrations/${phase2MigrationFile}`,'utf8'));
  await db.exec(await readFile(`supabase/migrations/${phase3MigrationFile}`,'utf8'));
  await db.exec(await readFile(`supabase/migrations/${phase4MigrationFile}`,'utf8'));
  await db.exec(await readFile(`supabase/migrations/${branchDeletionMigrationFile}`,'utf8'));

  const branch=await scalar(`select to_jsonb(b) from public.branches b where is_default`);
  equal('exactly one active default branch created',await scalar('select count(*)::int from public.branches where is_default and is_active'),1);
  equal('default branch inherits address and timezone',[branch.address,branch.timezone],['11 Legacy Street','Asia/Manila']);
  equal('default branch inherits Home Service coverage',[Number(branch.service_origin_latitude),Number(branch.service_origin_longitude),Number(branch.home_service_max_radius_km)],[7.154,125.278,30]);
  equal('business-wide PHP currency is unchanged',await scalar('select currency from public.business_settings'), 'PHP');
  equal('existing appointment identity, snapshots and timestamps preserved',await scalar('select to_jsonb(a) - \'branch_id\' from public.appointments a where id=$1',[appointment]),historicalAppointment);
  equal('existing policy row preserved apart from branch attribution',await scalar('select to_jsonb(p) - \'branch_id\' from public.booking_policy_versions p where version=1'),historicalPolicy);
  equal('existing payment is unchanged and derives its branch by appointment',await scalar(`select jsonb_build_object('payment',to_jsonb(p),'branch_id',a.branch_id)
    from public.payments p join public.appointments a on a.id=p.appointment_id where p.id=$1`,[payment]),{payment:historicalPayment,branch_id:branch.id});
  equal('refund row and payment relationship are preserved',await scalar('select to_jsonb(r) from public.refunds r where id=$1',[refund]),historicalRefund);
  equal('guest token and appointment scope are preserved',await scalar('select to_jsonb(g) from public.guest_access_tokens g where id=$1',[guestToken]),historicalGuest);
  equal('all old opening-hour IDs, contents and timestamps are preserved',await scalar("select jsonb_agg(to_jsonb(h)-'branch_id' order by weekday) from public.business_hours h"),historicalHours);
  equal('existing audit history is unchanged by branch attribution backfill',await scalar("select jsonb_agg(to_jsonb(a)-'branch_id' order by id) from public.audit_logs a"),historicalAudit);
  equal('historic single-business audit events inherit the default branch',await scalar(
    'select count(*)::int from public.audit_logs where branch_id=$1',[branch.id]),historicalAudit.length);
  equal('all migration-suppressed history triggers were restored',await scalar(`select count(*)::int
    from pg_trigger where tgenabled='O' and (
      (tgrelid='public.booking_policy_versions'::regclass and tgname in ('immutable_policy','touch_updated_at','audit_management_change')) or
      (tgrelid='public.staff_services'::regclass and tgname in ('touch_updated_at','audit_management_change')) or
      (tgrelid='public.business_hours'::regclass and tgname in ('touch_updated_at','audit_management_change')) or
      (tgrelid='public.business_closures'::regclass and tgname in ('touch_updated_at','audit_management_change')) or
      (tgrelid='public.staff_working_hours'::regclass and tgname in ('touch_updated_at','audit_management_change')) or
      (tgrelid='public.staff_schedule_exceptions'::regclass and tgname in ('touch_updated_at','audit_management_change')) or
      (tgrelid='public.appointments'::regclass and tgname='touch_updated_at') or
      (tgrelid='public.audit_logs'::regclass and tgname in ('touch_updated_at','immutable_audit'))
    )`),16);
  equal('staff, offering, schedules and ADMIN receive default-branch eligibility',[
    await scalar('select count(*)::int from public.staff_branch_assignments where staff_id=$1 and branch_id=$2 and active',[staff,branch.id]),
    await scalar('select count(*)::int from public.branch_services where service_id=$1 and branch_id=$2 and active',[service,branch.id]),
    await scalar('select count(*)::int from public.staff_services where staff_id=$1 and service_id=$2 and branch_id=$3 and active',[staff,service,branch.id]),
    await scalar('select count(*)::int from public.admin_branch_memberships where auth_user_id=$1 and branch_id=$2 and active',[ids.admin,branch.id])
  ],[1,1,1,1]);
  await actor('service_role');
  const defaultAvailability=await scalar('select public.server_availability_for_date($1,$2,null,null)',[service,bookingDay]);
  equal('default branch still exposes availability after the foundation migration',defaultAvailability.slots.length>0,true);
  const defaultBooking=await scalar(`select public.server_public_booking_submit($1,null,
    ($2::date+time '12:00') at time zone 'Asia/Manila',$3,'Post Migration Guest','post-migration-guest@branch.test',
    '+1 555 000 0000',null)->>'appointment_id'`,[service,bookingDay,randomUUID()]);
  equal('default branch still accepts a normal booking after the foundation migration',
    await scalar('select branch_id from public.appointments where id=$1',[defaultBooking]),branch.id);
  equal('legacy unavailable leave becomes global; extra hours remains branch-scoped',await scalar(`select jsonb_agg(jsonb_build_object('kind',kind,'is_global',is_global,'branch_id',branch_id)
    order by kind desc) from public.staff_schedule_exceptions where staff_id=$1`,[staff]),[
      {kind:'EXTRA_HOURS',is_global:false,branch_id:branch.id},
      {kind:'UNAVAILABLE',is_global:true,branch_id:null}
    ]);
  const oldGlobalLeave=await scalar(`select id from public.staff_schedule_exceptions
    where staff_id=$1 and is_global and kind='UNAVAILABLE'`,[staff]);
  await actor('authenticated',ids.admin,'aal2');
  await scalar(`select public.catalog_save_exception($1,'UNAVAILABLE',
    (now() at time zone 'Asia/Manila'+interval '35 days')::timestamp,
    (now() at time zone 'Asia/Manila'+interval '35 days 1 hour')::timestamp,'Legacy global leave')`,[staff]);
  equal('legacy ADMIN leave RPC remains branch-scoped',await scalar(`select jsonb_build_object('global',is_global,'branch_id',branch_id)
    from public.staff_schedule_exceptions where staff_id=$1 and reason='Legacy global leave'`,[staff]),
    {global:false,branch_id:branch.id});
  equal('ADMIN cannot read global staff leave',await scalar(`select count(*)::int
    from public.staff_schedule_exceptions where id=$1`,[oldGlobalLeave]),0);
  await denied('ADMIN cannot insert global staff leave',`insert into public.staff_schedule_exceptions(
    staff_id,is_global,kind,starts_at,ends_at,reason) values($1,true,'UNAVAILABLE',now()+interval '50 days',
    now()+interval '50 days 1 hour','Forged global leave')`,[staff]);
  equal('ADMIN cannot modify global staff leave',await scalar(`with changed as (
    update public.staff_schedule_exceptions set reason='ADMIN changed global leave' where id=$1 returning id)
    select count(*)::int from changed`,[oldGlobalLeave]),0);
  equal('ADMIN cannot remove global staff leave',await scalar(`with removed as (
    delete from public.staff_schedule_exceptions where id=$1 returning id)
    select count(*)::int from removed`,[oldGlobalLeave]),0);
  await actor('authenticated',ids.owner,'aal2');
  await scalar(`select public.catalog_save_exception($1,'UNAVAILABLE',
    (now() at time zone 'Asia/Manila'+interval '36 days')::timestamp,
    (now() at time zone 'Asia/Manila'+interval '36 days 1 hour')::timestamp,'Owner global leave')`,[staff]);
  equal('OWNER legacy leave RPC can create global leave',await scalar(`select is_global from public.staff_schedule_exceptions
    where staff_id=$1 and reason='Owner global leave'`,[staff]),true);
  await actor('authenticated',ids.staffUser);
  await denied('STAFF cannot create branch schedule exceptions',`insert into public.staff_schedule_exceptions(
    staff_id,branch_id,kind,starts_at,ends_at,reason) values($1,$2,'UNAVAILABLE',now()+interval '60 days',
    now()+interval '60 days 1 hour','STAFF forged leave')`,[staff,branch.id]);

  await actor('anon');
  equal('published default branch is publicly visible',await scalar('select public.is_public_branch($1)',[branch.id]),true);
  const livePublic=await scalar('select public.public_website_data()');
  equal('published projection contains only the default branch catalog',[livePublic.services.length,livePublic.staff.length,
    livePublic.assignments.length,livePublic.hours.length,livePublic.categories.length,livePublic.announcements.length],
    [1,2,1,7,1,1]);
  equal('direct public catalog exposes the active default branch service',
    (await scalar('select public.public_catalog()')).services.length,1);
  await actor('service_role');
  await db.query('update public.business_settings set published=false');
  await actor('anon');
  equal('unpublished business and branch expose no public rows',[
    await scalar('select count(*)::int from public.business_settings'),
    await scalar('select count(*)::int from public.service_categories'),
    await scalar('select count(*)::int from public.announcements'),
    await scalar('select count(*)::int from public.services'),
    await scalar('select count(*)::int from public.staff'),
    await scalar('select count(*)::int from public.staff_services'),
    await scalar('select count(*)::int from public.business_hours'),
    await scalar('select count(*)::int from public.booking_policy_versions')
  ],[0,0,0,0,0,0,0,0]);
  const unpublishedProjection=await scalar('select public.public_website_data()');
  equal('unpublished website projection contains no public data',[
    unpublishedProjection.business,unpublishedProjection.services.length,
    unpublishedProjection.categories.length,unpublishedProjection.staff.length,
    unpublishedProjection.assignments.length,unpublishedProjection.hours.length,unpublishedProjection.announcements.length,
    unpublishedProjection.policy
  ],[null,0,0,0,0,0,0,null]);
  const disabledDay=await scalar('select ($1::date+50)::text',[bookingDay]);
  await actor('service_role');
  equal('unpublished branch provides no availability slots',
    (await scalar('select public.server_availability_for_date($1,$2,null,null)',[service,bookingDay])).slots.length,0);
  equal('unpublished branch provides no Home Service availability slots',
    (await scalar('select public.server_home_service_availability_for_date($1,$2,null,null)',[service,bookingDay])).slots.length,0);
  await denied('unpublished branch rejects public booking submission',`select public.server_public_booking_submit(
    $1,null,($2::date+time '10:00') at time zone 'Asia/Manila',$3,'Guest Customer','guest@branch.test','+1 555 000 1111',null)`,
    [service,bookingDay,randomUUID()]);
  await actor('authenticated',ids.customerUser);
  await denied('unpublished branch rejects direct appointment requests',`select public.request_appointment($1,$2,$3,
    ($4::date+time '10:00') at time zone 'Asia/Manila',$5)`,
    [customer,staff,service,disabledDay,randomUUID()]);
  await actor('service_role');
  await db.query('update public.business_settings set published=true');
  await db.query('update public.branches set booking_enabled=false where id=$1',[branch.id]);
  await actor('anon');
  equal('disabled booking configuration hides default branch projections',[
    await scalar('select public.is_public_branch($1)',[branch.id]),
    await scalar('select count(*)::int from public.services'),
    await scalar('select count(*)::int from public.business_settings'),
    await scalar('select count(*)::int from public.service_categories'),
    await scalar('select count(*)::int from public.announcements'),
    await scalar('select count(*)::int from public.staff'),
    await scalar('select count(*)::int from public.staff_services'),
    await scalar('select count(*)::int from public.business_hours'),
    await scalar('select count(*)::int from public.business_closures'),
    await scalar('select count(*)::int from public.booking_policy_versions'),
    (await scalar('select public.public_website_data()')).services.length,
    (await scalar('select public.public_website_data()')).business
  ],[false,0,0,0,0,0,0,0,0,0,0,null]);
  await actor('service_role');
  equal('disabled booking configuration returns no slots',
    (await scalar('select public.server_availability_for_date($1,$2,null,null)',[service,bookingDay])).slots.length,0);
  await denied('disabled booking configuration rejects guest booking submission',`select public.server_public_booking_submit(
    $1,null,($2::date+time '10:00') at time zone 'Asia/Manila',$3,'Guest Customer','guest@branch.test','+1 555 000 1111',null)`,
    [service,bookingDay,randomUUID()]);
  await denied('disabled booking configuration rejects Home Service booking',`select public.server_home_service_booking_submit(
    $1,null,($2::date+time '10:00') at time zone 'Asia/Manila',$3,'Existing Customer','customer@branch.test',
    '+1 555 000 0000',$4,'123 Test Street',7.154,125.278,null,null,'Davao')`,
    [service,bookingDay,randomUUID(),ids.customerUser]);
  await actor('service_role');
  await denied('service_role cannot bypass disabled booking at appointment insert',`insert into public.appointments(
    customer_id,staff_id,policy_version_id,request_key,state,starts_at,ends_at,occupied_range,currency,total_amount,
    payment_mode_snapshot,required_payment_amount)
    values($1,$2,$3,$4,'PENDING',now()+interval '80 days',now()+interval '80 days 1 hour',
      tstzrange(now()+interval '80 days',now()+interval '80 days 1 hour','[)'),'PHP',10000,'DEPOSIT',1000)`,
    [customer,staff,await scalar('select id from public.booking_policy_versions where branch_id=$1 order by version desc limit 1',[branch.id]),randomUUID()]);
  await db.query('update public.branches set booking_enabled=true where id=$1',[branch.id]);

  await actor('service_role');
  equal('only the default branch remains active',await scalar('select count(*)::int from public.branches where is_active'),1);
  await denied('active second branch is blocked','insert into public.branches(name,slug,is_active) values(\'Not Yet\',\'not-yet\',true)');
  await denied('invalid IANA branch timezone is rejected','insert into public.branches(name,slug,timezone) values(\'Bad Zone\',\'bad-zone\',\'Mars/Olympus\')');
  equal('appointment exclusion stays global to staff and time',await scalar(`select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.appointments'::regclass and conname='appointments_no_staff_overlap'`),
    "EXCLUDE USING gist (staff_id WITH =, occupied_range WITH &&) WHERE ((state = ANY (ARRAY['ACCEPTED'::appointment_state, 'AWAITING_PAYMENT'::appointment_state, 'CONFIRMED'::appointment_state, 'CHECKED_IN'::appointment_state, 'IN_PROGRESS'::appointment_state, 'COMPLETED'::appointment_state, 'NO_SHOW'::appointment_state])))");

  // Isolated inactive branch fixtures exercise authorization paths without
  // enabling branch operations or changing the live single-branch model.
  const branchValues={name:'Isolated Branch',slug:'isolated-branch',address:'22 Branch Street',contact_email:'branch@example.test',
    contact_phone:'+63 900 000 0000',timezone:'Asia/Manila',public_visible:false,booking_enabled:false,is_active:false,
    service_origin_latitude:null,service_origin_longitude:null,home_service_max_radius_km:null,approval_mode:'ADMIN_APPROVAL'};
  await actor('authenticated',ids.admin,'aal2');
  await denied('ADMIN cannot create or activate branches through the OWNER RPC',
    'select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  await actor('authenticated',ids.staffUser,'aal2');
  await denied('STAFF cannot create branches through the OWNER RPC',
    'select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  await actor('authenticated',ids.customerUser,'aal2');
  await denied('CUSTOMER cannot create branches through the OWNER RPC',
    'select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  await actor('anon');
  await denied('ANON cannot execute the branch management RPC',
    'select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  await actor('authenticated',ids.owner,'aal1');
  await denied('OWNER branch writes still require AAL2',
    'select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  await actor('authenticated',ids.owner,'aal2');
  const createdBranch=await scalar('select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify(branchValues)]);
  const branch2=createdBranch.id;
  equal('OWNER creates a draft branch with public booking safely disabled',
    [createdBranch.is_default,createdBranch.is_active,createdBranch.public_visible,createdBranch.booking_enabled],
    [false,false,false,false]);
  equal('draft captures its private address and contact configuration',
    [createdBranch.address,createdBranch.contact_email,createdBranch.contact_phone,createdBranch.timezone],
    ['22 Branch Street','branch@example.test','+63 900 000 0000','Asia/Manila']);
  equal('draft branch receives its branch-specific approval configuration',
    await scalar('select approval_mode from public.branch_booking_settings where branch_id=$1',[branch2]),'ADMIN_APPROVAL');
  await denied('OWNER cannot activate an additional branch before branch-aware operations launch',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,createdBranch.updated_at,JSON.stringify({...branchValues,is_active:true})]);
  await denied('OWNER cannot enable public booking for an additional branch before Phase 3',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,createdBranch.updated_at,JSON.stringify({...branchValues,booking_enabled:true})]);
  const editedBranch=await scalar('select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,createdBranch.updated_at,
    JSON.stringify({...branchValues,name:'Isolated Branch Updated',public_visible:true})]);
  equal('OWNER edits draft branch data without activating or booking it',
    [editedBranch.name,editedBranch.is_active,editedBranch.booking_enabled],['Isolated Branch Updated',false,false]);
  await actor('authenticated',ids.admin,'aal2');
  await denied('ADMIN cannot edit an existing draft through the OWNER RPC',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,editedBranch.updated_at,JSON.stringify({...branchValues,name:'Forged Admin Edit'})]);
  await actor('authenticated',ids.staffUser,'aal2');
  await denied('STAFF cannot edit an existing draft through the OWNER RPC',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,editedBranch.updated_at,JSON.stringify({...branchValues,name:'Forged Staff Edit'})]);
  await actor('authenticated',ids.customerUser,'aal2');
  await denied('CUSTOMER cannot edit an existing draft through the OWNER RPC',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,editedBranch.updated_at,JSON.stringify({...branchValues,name:'Forged Customer Edit'})]);
  await actor('authenticated',ids.owner,'aal2');
  await denied('stale OWNER branch edits are rejected',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,createdBranch.updated_at,JSON.stringify({...branchValues,name:'Stale Owner Edit'})]);
  const configuredBranch=await scalar('select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,editedBranch.updated_at,
    JSON.stringify({...branchValues,name:'Isolated Branch Updated',address:'23 Updated Branch Street',
      contact_email:'updated-branch@example.test',timezone:'Pacific/Auckland',public_visible:true,
      service_origin_latitude:7.2,service_origin_longitude:125.3,home_service_max_radius_km:15,
      approval_mode:'STAFF_APPROVAL'})]);
  equal('OWNER can update draft contact, timezone and Home Service setup',
    [configuredBranch.address,configuredBranch.contact_email,configuredBranch.timezone,
      Number(configuredBranch.service_origin_latitude),Number(configuredBranch.service_origin_longitude),
      Number(configuredBranch.home_service_max_radius_km)],
    ['23 Updated Branch Street','updated-branch@example.test','Pacific/Auckland',7.2,125.3,15]);
  equal('OWNER can update branch-specific approval settings',
    await scalar('select approval_mode from public.branch_booking_settings where branch_id=$1',[branch2]),'STAFF_APPROVAL');
  equal('inactive branch stays out of public projections even when visibility is staged',
    await scalar('select public.is_public_branch($1)',[branch2]),false);
  equal('additional draft branch preserves the single-active-default compatibility guard',
    await scalar('select count(*) = 1 and coalesce(bool_or(is_default),false) from public.branches where is_active'),true);
  const unassignedDraft=await scalar('select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify({
    ...branchValues,name:'Unassigned Draft',slug:'unassigned-draft'
  })]);
  equal('OWNER can prepare a second inactive draft without activating it',
    [unassignedDraft.is_default,unassignedDraft.is_active,unassignedDraft.booking_enabled],[false,false,false]);

  await actor('authenticated',ids.admin,'aal2');
  await denied('ADMIN cannot delete a branch through the OWNER RPC',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  await actor('authenticated',ids.staffUser,'aal2');
  await denied('STAFF cannot delete a branch through the OWNER RPC',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  await actor('authenticated',ids.customerUser,'aal2');
  await denied('CUSTOMER cannot delete a branch through the OWNER RPC',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  await actor('anon');
  await denied('ANON cannot execute the branch deletion RPC',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  await actor('authenticated',ids.owner,'aal1');
  await denied('OWNER branch deletion still requires MFA',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  await actor('authenticated',ids.owner,'aal2');
  await denied('a visible branch cannot be deleted',
    'select public.owner_delete_empty_branch($1)',[branch2]);
  equal('a rejected branch deletion preserves the branch and its booking settings',[
    await scalar('select count(*)::int from public.branches where id=$1',[branch2]),
    await scalar('select count(*)::int from public.branch_booking_settings where branch_id=$1',[branch2])
  ],[1,1]);

  const emptyDraft=await scalar('select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify({
    ...branchValues,name:'Empty Delete Draft',slug:'empty-delete-draft'
  })]);
  const preservedAuditBefore=await scalar('select count(*)::int from public.audit_logs where branch_id=$1',[emptyDraft.id]);
  await denied('direct branch deletion remains blocked even for OWNER',
    'delete from public.branches where id=$1',[emptyDraft.id]);
  equal('OWNER removes an empty inactive draft through the restricted RPC',
    await scalar('select public.owner_delete_empty_branch($1)',[emptyDraft.id]),true);
  equal('empty branch is gone while its configuration is removed',[
    await scalar('select count(*)::int from public.branches where id=$1',[emptyDraft.id]),
    await scalar('select count(*)::int from public.branch_booking_settings where branch_id=$1',[emptyDraft.id])
  ],[0,0]);
  equal('branch audit history is retained and detached from the deleted branch',[
    await scalar('select count(*)::int from public.audit_logs where branch_id=$1',[emptyDraft.id]),
    await scalar('select count(*)::int from public.audit_logs where entity_id=$1 and branch_id is null',[emptyDraft.id]),
    await scalar('select count(*)::int from public.audit_logs where action=\'BRANCH_DELETED\' and entity_id=$1 and details->>\'slug\'=\'empty-delete-draft\'',[emptyDraft.id])
  ],[0,preservedAuditBefore+2,1]);

  const protectedDraft=await scalar('select public.owner_save_branch(null,null,$1::jsonb)',[JSON.stringify({
    ...branchValues,name:'Protected Draft',slug:'protected-draft'
  })]);
  await actor('service_role');
  await db.query('insert into public.branch_services(branch_id,service_id,active) values($1,$2,true)',[protectedDraft.id,service]);
  await actor('authenticated',ids.owner,'aal2');
  await denied('branch setup history prevents deletion and rolls back cleanup',
    'select public.owner_delete_empty_branch($1)',[protectedDraft.id]);
  equal('a protected branch and its service setup survive failed deletion',[
    await scalar('select count(*)::int from public.branches where id=$1',[protectedDraft.id]),
    await scalar('select count(*)::int from public.branch_booking_settings where branch_id=$1',[protectedDraft.id]),
    await scalar('select count(*)::int from public.branch_services where branch_id=$1',[protectedDraft.id]),
    await scalar('select count(*)::int from public.audit_logs where action=\'BRANCH_DELETED\' and entity_id=$1',[protectedDraft.id])
  ],[1,1,1,0]);

  await denied('branch records cannot be hard-deleted','delete from public.branches where id=$1',[branch2]);
  await actor('service_role');
  const customer2=await scalar(`insert into public.customers(auth_user_id,display_name,email)
    values($1,'Branch Two Customer','other@branch.test') returning id`,[ids.otherCustomerUser]);
  await denied('effective branch deposit cannot exceed branch price',`insert into public.branch_services(
    branch_id,service_id,active,price_override,payment_mode_override,deposit_type_override,deposit_amount_override)
    values($1,$2,true,500,'DEPOSIT','FIXED',501)`,[branch2,service]);
  await db.query(`insert into public.staff_branch_assignments(staff_id,branch_id,active,assigned_by)
    values($1,$2,true,$3)`,[staff2,branch2,ids.owner]);
  await actor('authenticated',ids.owner,'aal2');
  const ownerOffer=await scalar(`insert into public.branch_services(branch_id,service_id,active,price_override)
    values($1,$2,true,12000) returning jsonb_build_array(active,price_override)`,[branch2,service]);
  equal('OWNER can configure an offered service and branch price through RLS',ownerOffer,[true,12000]);
  const scopedCatalog=await scalar("select public.catalog_data_for_branch('services',$1,null,'',null,'',1)",[branch2]);
  equal('branch-scoped catalog reports the effective branch service offer',
    scopedCatalog.branch_offerings.filter(offer=>offer.service_id===service).map(offer=>[offer.active,Number(offer.effective_price)]),[[true,12000]]);
  const ownerStaffAssignment=await scalar(`insert into public.staff_branch_assignments(staff_id,branch_id,active)
    values($1,$2,true) returning jsonb_build_array(active,assigned_by=auth.uid(),revoked_at is null)`,[staff,branch2]);
  equal('OWNER can assign the existing staff identity to the draft branch',ownerStaffAssignment,[true,true,true]);
  const ownerMembership=await scalar(`insert into public.admin_branch_memberships(auth_user_id,branch_id,active,granted_by)
    values($1,$2,true,$3) returning jsonb_build_array(active,granted_by=auth.uid(),revoked_at is null)`,[ids.admin,branch2,ids.owner]);
  equal('OWNER can grant branch membership to an existing ADMIN role',ownerMembership,[true,true,true]);
  await actor('authenticated',ids.admin,'aal2');
  equal('ADMIN cannot change its own branch membership',await scalar(`with changed as (
    update public.admin_branch_memberships set active=false where auth_user_id=auth.uid() and branch_id=$1 returning id
  ) select count(*)::int from changed`,[branch2]),0);
  await denied('ADMIN cannot edit branch details through the OWNER RPC, even with a membership',
    'select public.owner_save_branch($1,$2,$3::jsonb)',[branch2,configuredBranch.updated_at,
      JSON.stringify({...branchValues,name:'Forged Admin Edit'})]);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER can revoke ADMIN branch membership with revocation attribution',await scalar(`with changed as (
    update public.admin_branch_memberships set active=false where auth_user_id=$1 and branch_id=$2
    returning jsonb_build_array(active,revoked_at is not null,revoked_by=auth.uid()) as snapshot
  ) select snapshot from changed`,[ids.admin,branch2]),[false,true,true]);
  await actor('authenticated',ids.admin,'aal2');
  equal('revoked membership no longer grants branch access',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER can revoke a staff branch assignment with history recorded',await scalar(`
    update public.staff_branch_assignments set active=false where staff_id=$1 and branch_id=$2
    returning jsonb_build_array(active,revoked_at is not null)`,[staff2,branch2]),[false,true]);
  equal('OWNER can restore a staff branch assignment without duplicating staff identity',await scalar(`
    update public.staff_branch_assignments set active=true where staff_id=$1 and branch_id=$2
    returning jsonb_build_array(active,revoked_at is null,(select count(*) from public.staff where id=$1))`,[staff2,branch2]),[true,true,1]);
  await actor('authenticated',ids.staffUser);
  equal('STAFF cannot modify its own branch assignment',await scalar(`with changed as (
    update public.staff_branch_assignments set active=false where staff_id=$1 and branch_id=$2 returning id
  ) select count(*)::int from changed`,[staff,branch2]),0);
  await denied('STAFF cannot remove its own branch assignment','delete from public.staff_branch_assignments where staff_id=$1 and branch_id=$2',[staff,branch2]);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER can revoke the assignment before another self-assignment attempt',await scalar(`with changed as (
    update public.staff_branch_assignments set active=false where staff_id=$1 and branch_id=$2
    returning jsonb_build_array(active,revoked_at is not null) as snapshot
  ) select snapshot from changed`,[staff,branch2]),[false,true]);
  await actor('authenticated',ids.staffUser);
  await denied('STAFF cannot create its own assignment on an unassigned branch',
    'insert into public.staff_branch_assignments(staff_id,branch_id) values($1,$2)',[staff,unassignedDraft.id]);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER can restore the staff assignment after the denied request',await scalar(`with changed as (
    update public.staff_branch_assignments set active=true where staff_id=$1 and branch_id=$2
    returning jsonb_build_array(active,revoked_at is null) as snapshot
  ) select snapshot from changed`,[staff,branch2]),[true,true]);
  // Prove the trigger itself rejects a NULL Auth subject even if another
  // permissive policy were accidentally introduced. This policy exists only
  // in the disposable test database and is removed immediately afterward.
  await db.exec('reset role');
  await db.exec(`create policy test_null_subject_assignment_write on public.staff_branch_assignments
    for all to authenticated using (true) with check (true)`);
  await actor('authenticated');
  await denied('NULL auth.uid cannot alter staff assignments even with a permissive test policy',
    'update public.staff_branch_assignments set active=active where staff_id=$1 and branch_id=$2',[staff,branch2]);
  await db.exec('reset role');
  await db.exec('drop policy test_null_subject_assignment_write on public.staff_branch_assignments');
  await actor('service_role');
  equal('trusted service_role can maintain an active staff assignment',await scalar(`with changed as (
    update public.staff_branch_assignments set active=true where staff_id=$1 and branch_id=$2 returning id
  ) select count(*)::int from changed`,[staff,branch2]),1);
  await db.query(`insert into public.staff_services(staff_id,branch_id,service_id,active) values($1,$2,$3,true),($4,$2,$3,true)`,[staff,branch2,service,staff2]);
  const branchOnlyService=await scalar(`insert into public.services(category_id,name,slug,price_amount,duration_minutes,
    payment_mode,deposit_amount,active,published) values($1,'Branch Two Only','branch-two-only',5000,30,
    'PAY_AT_BUSINESS',0,true,true) returning id`,[category]);
  await db.query('update public.branch_services set active=false where branch_id=$1 and service_id=$2',[branch.id,branchOnlyService]);
  await db.query('insert into public.branch_services(branch_id,service_id,active) values($1,$2,true)',[branch2,branchOnlyService]);
  await db.query('insert into public.staff_services(staff_id,branch_id,service_id,active) values($1,$2,$3,true)',[staff2,branch2,branchOnlyService]);
  await db.query(`insert into public.business_hours(branch_id,weekday,opens_at,closes_at)
    select $1,day,'00:00','23:59' from generate_series(0,6) day`,[branch2]);
  await db.query(`insert into public.staff_working_hours(staff_id,branch_id,weekday,starts_at,ends_at)
    select $1,$2,day,'00:00','23:59' from generate_series(0,6) day`,[staff,branch2]);
  await db.query(`insert into public.staff_working_hours(staff_id,branch_id,weekday,starts_at,ends_at)
    values($1,$2,1,'13:00','14:00')`,[staff2,branch2]);
  await db.query(`insert into public.staff_working_hours(staff_id,branch_id,weekday,starts_at,ends_at)
    values($1,$2,1,'08:00','20:00')`,[staff2,branch.id]);
  equal('overlapping staff-hour intervals are allowed on distinct branches',await scalar(`select count(*)::int
    from public.staff_working_hours where staff_id=$1 and weekday=1`,[staff2]),2);
  await denied('overlapping staff-hour intervals remain blocked within one branch',`insert into public.staff_working_hours(
    staff_id,branch_id,weekday,starts_at,ends_at) values($1,$2,1,'13:30','14:30')`,[staff2,branch2]);
  equal('overlapping business-hour intervals are allowed on distinct branches',await scalar(`select count(*)::int
    from public.business_hours where weekday=1`,[]),2);
  await denied('overlapping business-hour intervals remain blocked within one branch',`insert into public.business_hours(
    branch_id,weekday,opens_at,closes_at) values($1,1,'13:00','14:00')`,[branch.id]);
  await db.query(`insert into public.business_closures(branch_id,starts_at,ends_at,public_reason)
    values($1,now()+interval '90 days',now()+interval '90 days 1 hour','Branch Two closure')`,[branch2]);
  await actor('anon');
  equal('inactive branch is not publicly visible',await scalar('select public.is_public_branch($1)',[branch2]),false);
  const branchScopedProjection=await scalar('select public.public_website_data()');
  equal('definer-based website projection omits inactive branch data',[
    branchScopedProjection.services.length,branchScopedProjection.hours.length,
    branchScopedProjection.assignments.length,
    branchScopedProjection.services.some(x=>x.id===branchOnlyService),
    await scalar('select count(*)::int from public.business_hours')
  ],[1,7,1,false,7]);
  equal('direct public catalog omits an inactive-branch-only service',
    (await scalar('select public.public_catalog()')).services.some(x=>x.id===branchOnlyService),false);
  equal('direct public closure projection omits an inactive branch',await scalar(`select count(*)::int
    from public.business_closures where public_reason='Branch Two closure'`),0);
  await actor('service_role');
  equal('availability engine ignores inactive-branch-only services',
    (await scalar('select public.server_availability_for_date($1,$2,null,null)',[branchOnlyService,bookingDay])).slots.length,0);
  await denied('public booking rejects a service configured only for an inactive branch',`select public.server_public_booking_submit(
    $1,null,($2::date+time '13:00') at time zone 'Asia/Manila',$3,'Draft Branch Guest','draft-guest@branch.test',
    '+1 555 000 1234',null)`,[branchOnlyService,bookingDay,randomUUID()]);
  const policy2=await scalar(`insert into public.booking_policy_versions(branch_id,version,payment_window_minutes,minimum_notice_minutes,
    maximum_advance_days,terms,published) values($1,2,45,0,120,'Branch policy',true) returning id`,[branch2]);
  await db.exec('reset role');
  await db.exec('alter table public.appointments disable trigger enforce_appointment_branch');
  await db.exec('alter table public.appointments disable trigger guard_appointment');
  await actor('service_role');
  const branch2Appointment=await scalar(`insert into public.appointments(customer_id,staff_id,policy_version_id,branch_id,request_key,state,
    starts_at,ends_at,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount,fulfillment_mode,
    accepted_by,accepted_at,payment_due_at)
    values($1,$2,$3,$4,$5,'AWAITING_PAYMENT',now()+interval '12 days',now()+interval '12 days 1 hour',
      tstzrange(now()+interval '12 days',now()+interval '12 days 1 hour','[)'),'PHP',10000,'DEPOSIT',1000,'HOME_SERVICE',
      $6,clock_timestamp(),clock_timestamp()+interval '1 day') returning id`,
    [customer2,staff,policy2,branch2,randomUUID(),ids.owner]);
  const branch2Today=await scalar(`insert into public.appointments(customer_id,staff_id,policy_version_id,branch_id,request_key,state,
    starts_at,ends_at,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount,accepted_by,accepted_at)
    values($1,$2,$3,$4,$5,'CONFIRMED',
      (((now() at time zone 'Pacific/Auckland')::date)::timestamp + time '00:30') at time zone 'Pacific/Auckland',
      (((now() at time zone 'Pacific/Auckland')::date)::timestamp + time '01:30') at time zone 'Pacific/Auckland',
      tstzrange((((now() at time zone 'Pacific/Auckland')::date)::timestamp + time '00:30') at time zone 'Pacific/Auckland',
        (((now() at time zone 'Pacific/Auckland')::date)::timestamp + time '01:30') at time zone 'Pacific/Auckland','[)'),
      'PHP',10000,'DEPOSIT',1000,$6,now()) returning id`,[customer2,staff,policy2,branch2,randomUUID(),ids.owner]);
  const unrelatedBranch2Appointment=await scalar(`insert into public.appointments(customer_id,staff_id,policy_version_id,branch_id,request_key,state,
    starts_at,ends_at,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount)
    values($1,$2,$3,$4,$5,'PENDING',now()+interval '14 days',now()+interval '14 days 1 hour',
      tstzrange(now()+interval '14 days',now()+interval '14 days 1 hour','[)'),'PHP',10000,'DEPOSIT',1000) returning id`,
    [customer2,staff2,policy2,branch2,randomUUID()]);
  await db.query(`insert into public.appointment_items(appointment_id,service_id,service_name_snapshot,price_amount,duration_minutes,
    buffer_before_minutes,buffer_after_minutes) values($1,$2,'Existing Service',10000,60,0,0)`,[branch2Appointment,service]);
  await db.query(`insert into public.appointment_items(appointment_id,service_id,service_name_snapshot,price_amount,duration_minutes,
    buffer_before_minutes,buffer_after_minutes) values($1,$2,'Existing Service',10000,60,0,0)`,[branch2Today,service]);
  await db.query(`insert into public.appointment_home_locations(appointment_id,address,latitude,longitude,area_hint)
    values($1,'Private Branch Two Address',7.2,125.3,'Branch Two')`,[branch2Appointment]);
  const branch2Payment=await scalar(`insert into public.payments(appointment_id,provider,provider_reference,idempotency_key,amount,currency)
    values($1,'fixture',$2,$3,1000,'PHP') returning id`,[branch2Appointment,randomUUID(),randomUUID()]);
  await db.exec('reset role');
  await db.exec('alter table public.appointments enable trigger enforce_appointment_branch');
  await db.exec('alter table public.appointments enable trigger guard_appointment');
  await actor('service_role');
  await actor('authenticated',ids.owner,'aal1');
  await denied('OWNER membership grant still requires MFA','insert into public.admin_branch_memberships(auth_user_id,branch_id) values($1,$2)',[ids.admin,branch2]);
  await denied('OWNER ADMIN-role grant still requires MFA',"insert into public.user_roles(auth_user_id,role) values($1,'ADMIN')",[ids.otherCustomerUser]);
  await actor('authenticated',ids.owner,'aal2');
  await denied('staff branch revocation is blocked while future appointments need resolution',
    'update public.staff_branch_assignments set active=false where staff_id=$1 and branch_id=$2',[staff,branch2]);
  await actor('service_role');
  await denied('even service_role cannot use a second branch for normal booking','insert into public.appointments(customer_id,staff_id,policy_version_id,branch_id,request_key,state,starts_at,ends_at,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount) values($1,$2,$3,$4,$5,\'PENDING\',now()+interval \'13 days\',now()+interval \'13 days 1 hour\',tstzrange(now()+interval \'13 days\',now()+interval \'13 days 1 hour\',\'[)\'),\'PHP\',10000,\'DEPOSIT\',1000)',[customer2,staff,policy2,branch2,randomUUID()]);

  await actor('anon');
  await denied('anonymous cannot read branch membership data','select * from public.admin_branch_memberships');
  await denied('anonymous cannot read branch configuration','select * from public.branches');
  await actor('authenticated',ids.admin,'aal1');
  equal('ADMIN MFA remains required for branch access',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  await actor('authenticated',ids.admin,'aal2');
  await denied('ADMIN cannot forge an ADMIN role grant',"insert into public.user_roles(auth_user_id,role) values($1,'ADMIN')",[ids.otherCustomerUser]);
  await denied('ADMIN cannot forge a role UPDATE',"update public.user_roles set role='ADMIN' where auth_user_id=$1 and role='STAFF'",[ids.staffUser]);
  equal('default ADMIN cannot read unassigned branch appointment',await scalar('select count(*)::int from public.appointments where id=$1',[branch2Appointment]),0);
  equal('default ADMIN cannot read another branch payment',await scalar('select count(*)::int from public.payments where id=$1',[branch2Payment]),0);
  equal('default ADMIN cannot read another branch Home Service destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[branch2Appointment]),0);
  equal('default ADMIN cannot read a customer known only to another branch',await scalar('select count(*)::int from public.customers where id=$1',[customer2]),0);
  equal('default ADMIN cannot update a customer known only to another branch',await scalar(`with changed as (
    update public.customers set phone='forged' where id=$1 returning id
  ) select count(*)::int from changed`,[customer2]),0);
  await denied('ADMIN cannot attach an arbitrary account to a customer row',
    'insert into public.customers(auth_user_id,display_name,email) values($1,\'Forged Customer\',\'forged@branch.test\')',[ids.otherCustomerUser]);
  equal('ADMIN cannot inspect the deployment-wide user-role directory',await scalar('select count(*)::int from public.user_roles'),1);
  await denied('ADMIN cannot self-assign to an unassigned branch','insert into public.admin_branch_memberships(auth_user_id,branch_id) values($1,$2)',[ids.admin,unassignedDraft.id]);
  await actor('authenticated',ids.staffUser);
  await denied('STAFF cannot insert an ADMIN membership','insert into public.admin_branch_memberships(auth_user_id,branch_id) values($1,$2)',[ids.admin,branch2]);
  await actor('authenticated',ids.customerUser);
  await denied('CUSTOMER cannot insert an ADMIN membership','insert into public.admin_branch_memberships(auth_user_id,branch_id) values($1,$2)',[ids.admin,branch2]);
  await actor('service_role');
  await denied('NULL auth.uid cannot insert an ADMIN membership','insert into public.admin_branch_memberships(auth_user_id,branch_id) values($1,$2)',[ids.otherCustomerUser,branch2]);
  await denied('NULL auth.uid cannot grant an ADMIN role',"insert into public.user_roles(auth_user_id,role) values($1,'ADMIN')",[ids.otherCustomerUser]);
  await denied('NULL auth.uid cannot change a role to ADMIN',"update public.user_roles set role='ADMIN' where auth_user_id=$1 and role='STAFF'",[ids.staffUser]);
  await denied('NULL auth.uid cannot revoke an ADMIN role',"delete from public.user_roles where auth_user_id=$1 and role='ADMIN'",[ids.admin]);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER retains cross-branch authority',await scalar('select count(*)::int from public.appointments where id=$1',[branch2Appointment]),1);
  const branchTwoAdminData=await scalar("select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  const defaultBranchAdminData=await scalar("select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch.id]);
  const allBranchAdminData=await scalar("select public.admin_data_for_branch('appointments',null,null,null,'','',1)");
  const branchDashboard=await scalar("select public.admin_data_for_branch('dashboard',$1,null,null,'','',1)",[branch2]);
  equal('OWNER branch dashboard reads return only selected-branch appointments',
    [...new Set(branchTwoAdminData.appointments.map(row=>row.branch_id))],[branch2]);
  equal('OWNER default-branch dashboard excludes other-branch appointments',
    [...new Set(defaultBranchAdminData.appointments.map(row=>row.branch_id))],[branch.id]);
  equal('OWNER all-branch dashboard returns every authorized branch appointment',
    [allBranchAdminData.appointments.length,[...new Set(allBranchAdminData.appointments.map(row=>row.branch_id))].sort()],
    [await scalar('select count(*)::int from public.appointments'),[branch.id,branch2].sort()]);
  equal('branch-scoped dashboard labels branch names',
    [branchTwoAdminData.appointments[0].branch_name,defaultBranchAdminData.appointments[0].branch_name],
    [configuredBranch.name,branch.name]);
  equal('branch dashboard uses the branch timezone for presentation and daily counts',
    [branchDashboard.business.timezone,branchDashboard.stats.today],['Pacific/Auckland',1]);
  equal('branch dashboard schedule uses the branch-local calendar day',
    branchDashboard.schedule.map(row=>row.id),[branch2Today]);
  await db.exec('begin');
  await scalar("select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  equal('transaction-local dashboard scope filters follow-up appointment reads',[
    await scalar('select count(*)::int from public.appointments where id=$1',[branch2Appointment]),
    await scalar('select count(*)::int from public.appointments where id=$1',[appointment])
  ],[1,0]);
  await db.exec('commit');
  const scopedCustomers=await scalar("select public.admin_customer_directory_for_branch('accounts',$1,'',1)",[branch2]);
  equal('branch customer directory counts only customers with records at that branch',scopedCustomers.total,1);
  // The OWNER is already represented in the first branch; assign the second
  // branch to a different, currently ADMIN-enabled user through OWNER authority.
  await actor('service_role');
  await db.exec('reset role');
  const admin2=randomUUID();
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,'branch-two-admin@branch.test',now())`,[admin2]);
  await actor('service_role');
  await db.query('update public.profiles set display_name=\'Branch Two Admin\' where auth_user_id=$1',[admin2]);
  await actor('authenticated',ids.owner,'aal2');
  await scalar('select public.manage_owner_admins(\'grant\',$1,null)',[admin2]);
  await db.query(`update public.admin_branch_memberships set active=false
    where auth_user_id=$1 and branch_id=$2`,[admin2,branch.id]);
  await db.query(`insert into public.admin_branch_memberships(auth_user_id,branch_id,active,granted_by)
    values($1,$2,true,$3)`,[admin2,branch2,ids.owner]);
  await actor('authenticated',admin2,'aal2');
  await actor('authenticated',admin2,'aal1');
  equal('multi-branch ADMIN MFA remains required',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  await actor('authenticated',admin2,'aal2');
  equal('explicitly assigned ADMIN can read only its branch appointment',[
    await scalar('select count(*)::int from public.appointments where id=$1',[branch2Appointment]),
    await scalar('select count(*)::int from public.appointments where id=$1',[appointment])
  ],[1,0]);
  const adminTwoWorkspace=await scalar("select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  equal('ADMIN can use its assigned non-default branch dashboard',
    [...new Set(adminTwoWorkspace.appointments.map(row=>row.branch_id))],[branch2]);
  equal('non-default ADMIN all-branch view remains limited to assigned branches',
    [...new Set((await scalar("select public.admin_data_for_branch('appointments',null,null,null,'','',1)")).appointments.map(row=>row.branch_id))],
    [branch2]);
  await denied('branch ADMIN cannot change an appointment in another branch',
    "select public.transition_appointment($1,'CANCELLED','Not assigned to this branch')",[appointment]);
  await denied('branch ADMIN cannot use the legacy deployment-wide hours mutation',
    "select public.admin_save_hours('[]'::jsonb)",[]);
  const allDayBranchHours=Array.from({length:7},(_,weekday)=>({weekday,opens_at:'00:00',closes_at:'23:59'}));
  await scalar('select public.admin_save_hours_for_branch($1,$2::jsonb)',[branch2,JSON.stringify(allDayBranchHours)]);
  equal('branch ADMIN edits only the selected branch hours',await scalar(`select count(*)::int
    from public.business_hours where branch_id=$1 and opens_at='00:00' and closes_at='23:59'`,[branch2]),7);
  equal('branch schedule mutation leaves default branch hours unchanged',await scalar(`select count(*)::int
    from public.business_hours where branch_id=$1`,[branch.id]),7);
  await scalar("select public.catalog_save_staff_hours_for_branch($1,$2,'[{\"weekday\":1,\"opens_at\":\"13:00\",\"closes_at\":\"14:00\"}]'::jsonb)",[branch2,staff2]);
  equal('staff schedule writes retain the selected branch',await scalar(`select jsonb_agg(jsonb_build_array(branch_id,weekday,starts_at::text,ends_at::text))
    from public.staff_working_hours where staff_id=$1 and branch_id=$2`,[staff2,branch2]),[[branch2,1,'13:00:00','14:00:00']]);
  equal('branch ADMIN membership remains active during branch-scoped writes',await scalar('select private.can_admin_access_branch($1)',[branch2]),true);
  await scalar("select public.catalog_assign_services_for_branch($1,$2,$3::jsonb)",[branch2,staff2,JSON.stringify([service,branchOnlyService])]);
  equal('staff service assignment changes remain branch-specific',await scalar(`select jsonb_agg(jsonb_build_array(branch_id,service_id,active) order by branch_id,service_id)
    from public.staff_services where staff_id=$1 and service_id=$2`,[staff2,branchOnlyService]),[[branch2,branchOnlyService,true]]);
  const branchException=await scalar("select public.catalog_save_exception_for_branch($1,$2,'UNAVAILABLE','2099-06-01 10:00','2099-06-01 11:00','Branch-specific test leave')",[branch2,staff2]);
  equal('branch schedule exceptions do not become global leave',await scalar(`select jsonb_build_array(branch_id,is_global)
    from public.staff_schedule_exceptions where id=$1`,[branchException]),[branch2,false]);
  equal('branch ADMIN removes only its branch-specific exception',await scalar('select public.catalog_remove_exception_for_branch($1,$2)',[branch2,branchException]),true);
  const branchBookingDay=await scalar("select ((now() at time zone 'Pacific/Auckland')::date + ((8 - extract(isodow from (now() at time zone 'Pacific/Auckland')::date)::int + 7) % 7)::int)::text");
  const branchAvailability=await scalar('select public.admin_availability_for_branch($1,$2,$3,null)',[branch2,branchOnlyService,branchBookingDay]);
  equal('availability diagnostics use selected branch timezone and schedule',[branchAvailability.timezone,branchAvailability.diagnostics.business_hours.length],['Pacific/Auckland',1]);
  await denied('branch ADMIN cannot inspect another branch availability',
    'select public.admin_availability_for_branch($1,$2,$3,null)',[branch.id,service,bookingDay]);
  await denied('ADMIN branch dashboard rejects an unassigned branch',
    "select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch.id]);
  await actor('authenticated',ids.staffUser);
  await denied('STAFF cannot invoke the admin branch dashboard RPC',
    "select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  await actor('authenticated',ids.customerUser);
  await denied('CUSTOMER cannot invoke the admin branch dashboard RPC',
    "select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  await actor('anon');
  await denied('anonymous users cannot invoke the admin branch dashboard RPC',
    "select public.admin_data_for_branch('appointments',$1,null,null,'','',1)",[branch2]);
  await actor('authenticated',admin2,'aal2');
  equal('ADMIN all-assigned scope remains limited by existing branch RLS',
    [...new Set((await scalar("select public.admin_data_for_branch('appointments',null,null,null,'','',1)")).appointments.map(row=>row.branch_id))],
    [branch2]);
  equal('branch ADMIN can read related payment and exact destination',[
    await scalar('select count(*)::int from public.payments where id=$1',[branch2Payment]),
    await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[branch2Appointment])
  ],[1,1]);
  equal('branch ADMIN can read its branch customer profile',await scalar('select count(*)::int from public.customers where id=$1',[customer2]),1);
  equal('branch ADMIN can update a customer profile tied to its branch',await scalar(`with changed as (
    update public.customers set phone='branch-two-contact' where id=$1 returning id
  ) select count(*)::int from changed`,[customer2]),1);
  await denied('branch ADMIN cannot reassign customer account ownership',
    'update public.customers set auth_user_id=$2 where id=$1',[customer2,ids.admin]);
  await actor('authenticated',ids.owner,'aal2');
  await db.query(`update public.admin_branch_memberships set active=false where auth_user_id=$1 and branch_id=$2`,[admin2,branch2]);
  await actor('authenticated',admin2,'aal2');
  equal('revoked ADMIN membership stops authorizing immediately',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  equal('ADMIN cannot reactivate a revoked membership',await scalar(`with changed as (
    update public.admin_branch_memberships set active=true,revoked_at=null,revoked_by=null
    where auth_user_id=$1 and branch_id=$2 returning id) select count(*)::int from changed`,[admin2,branch2]),0);
  await actor('authenticated',ids.owner,'aal2');
  await db.query(`update public.admin_branch_memberships set active=true,revoked_at=null,revoked_by=null
    where auth_user_id=$1 and branch_id=$2`,[admin2,branch2]);
  await scalar('select public.manage_owner_admins(\'revoke\',$1,null)',[admin2]);
  equal('ADMIN role revocation also revokes every active branch membership',await scalar(`select count(*)::int
    from public.admin_branch_memberships where auth_user_id=$1 and active`,[admin2]),0);
  await actor('authenticated',admin2,'aal2');
  equal('revoked ADMIN role grants no branch access',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  await actor('authenticated',ids.owner,'aal2');
  await denied('OWNER cannot activate membership without current ADMIN role','update public.admin_branch_memberships set active=true,revoked_at=null,revoked_by=null where auth_user_id=$1 and branch_id=$2',[admin2,branch2]);
  await scalar('select public.manage_owner_admins(\'grant\',$1,null)',[admin2]);
  equal('unrelated ADMIN role regrant does not reactivate revoked branch membership',await scalar(`select count(*)::int
    from public.admin_branch_memberships where auth_user_id=$1 and branch_id=$2 and active`,[admin2,branch2]),0);
  await actor('authenticated',admin2,'aal2');
  equal('role regrant alone grants no branch access',await scalar('select private.can_admin_access_branch($1)',[branch2]),false);
  await actor('authenticated',ids.owner,'aal2');
  await db.query(`update public.admin_branch_memberships set active=true,revoked_at=null,revoked_by=null
    where auth_user_id=$1 and branch_id=$2`,[admin2,branch2]);
  await actor('authenticated',admin2,'aal2');
  equal('explicit OWNER membership regrant restores scoped access',await scalar('select private.can_admin_access_branch($1)',[branch2]),true);

  await actor('authenticated',ids.staffUser);
  equal('assigned STAFF can read its own branch appointment',await scalar('select count(*)::int from public.appointments where id=$1',[branch2Appointment]),1);
  const staffBranchWorkspace=await scalar('select public.my_staff_workspace_for_branch($1)',[branch2]);
  equal('STAFF selected-branch workspace shows only its assigned branch appointments',
    [...new Set(staffBranchWorkspace.upcoming.map(row=>row.branch_id))],[branch2]);
  equal('STAFF workspace returns the selected branch identity',
    [staffBranchWorkspace.branch_id,staffBranchWorkspace.branch_name,staffBranchWorkspace.timezone],
    [branch2,configuredBranch.name,'Pacific/Auckland']);
  await denied('STAFF workspace rejects an unassigned branch',
    'select public.my_staff_workspace_for_branch($1)',[unassignedDraft.id]);
  const staffAllWorkspace=await scalar('select public.my_staff_workspace_for_branch(null)');
  equal('STAFF all-assigned workspace is limited to their own appointments',
    [...new Set(staffAllWorkspace.upcoming.map(row=>row.branch_id))].sort(),[branch.id,branch2].sort());
  equal('STAFF cannot read an unrelated appointment in the same branch',await scalar('select count(*)::int from public.appointments where id=$1',[unrelatedBranch2Appointment]),0);
  equal('STAFF cannot read branch financial data',await scalar('select count(*)::int from public.payments where id=$1',[branch2Payment]),0);
  await actor('authenticated',ids.customerUser);
  equal('CUSTOMER cannot read another customer from a different branch',await scalar('select count(*)::int from public.customers where id=$1',[customer2]),0);
  equal('CUSTOMER can update authorized contact fields on its own profile',await scalar(`with changed as (
    update public.customers set phone='+1 555 000 1234' where id=$1 returning id
  ) select count(*)::int from changed`,[customer]),1);
  await denied('CUSTOMER cannot change its auth_user_id through profile UPDATE',
    'update public.customers set auth_user_id=$2 where id=$1',[customer,ids.otherCustomerUser]);
  await denied('CUSTOMER cannot INSERT a customer profile linked to another Auth account',
    "insert into public.customers(auth_user_id,display_name,email) values($1,'Impersonated','other@branch.test')",[ids.otherCustomerUser]);
  await denied('CUSTOMER cannot use an upsert to change customer account ownership',
    `insert into public.customers(auth_user_id,display_name,email) values($1,'Impersonated','other@branch.test')
     on conflict (auth_user_id) do update set auth_user_id=excluded.auth_user_id`,[ids.otherCustomerUser]);
  equal('customer profile completion remains bound to the authenticated Auth UUID',[
    await scalar("select public.complete_customer_profile('Updated Customer','+1 555 000 4321')"),
    await scalar('select auth_user_id from public.customers where id=$1',[customer])
  ],[customer,ids.customerUser]);
  await actor('authenticated',ids.staffUser);
  await denied('STAFF cannot change customer account ownership through profile UPDATE',
    'update public.customers set auth_user_id=$2 where id=$1',[customer,ids.staffUser]);
  await denied('STAFF cannot INSERT a customer profile linked to another Auth account',
    "insert into public.customers(auth_user_id,display_name,email) values($1,'Impersonated Staff','other@branch.test')",[ids.otherCustomerUser]);
  await denied('STAFF cannot assign another staff profile to a branch','insert into public.staff_branch_assignments(staff_id,branch_id) values($1,$2)',[staff2,unassignedDraft.id]);
  await actor('service_role');
  await db.query("delete from public.user_roles where auth_user_id=$1 and role='STAFF'",[ids.staffUser]);
  await actor('authenticated',ids.staffUser);
  equal('staff assignment without current STAFF role grants no branch access',await scalar('select private.can_staff_access_branch($1,$2)',[staff,branch2]),false);

  await actor('service_role');
  await denied('service_role cannot bypass immutable customer ownership guard',
    'update public.customers set auth_user_id=$2 where id=$1',[customer2,ids.owner]);
  const branchId=branch.id;
  await actor('anon');
  const publicBookingData=await scalar('select public.public_booking_data(null)');
  equal('anonymous public booking projection resolves the sole eligible default branch',
    [publicBookingData.branch.slug,publicBookingData.branches.length,publicBookingData.services.length],
    [branch.slug,1,1]);
  equal('public branch projection applies branch-specific service price and payment settings',
    await scalar("select has_function_privilege('anon','public.public_booking_data(text)','EXECUTE')"),true);
  await actor('service_role');
  await db.query(`update public.branch_services set price_override=12000,home_service_fee_override=900,
    home_travel_before_minutes_override=30,home_travel_after_minutes_override=15
    where branch_id=$1 and service_id=$2`,[branchId,service]);
  await db.query("update public.branch_booking_settings set approval_mode='STAFF_APPROVAL' where branch_id=$1",[branchId]);
  await actor('anon');
  const refreshedPublicBookingData=await scalar('select public.public_booking_data($1)',[branch.slug]);
  equal('branch-specific offer overrides are reflected in the public catalog',
    [refreshedPublicBookingData.branch.slug,refreshedPublicBookingData.services[0].price_amount,
      refreshedPublicBookingData.services[0].home_service_fee,
      refreshedPublicBookingData.services[0].home_travel_before_minutes,
      refreshedPublicBookingData.services[0].home_travel_after_minutes],
    [branch.slug,12000,900,30,15]);
  await actor('service_role');
  const phase4Day=await scalar("select ($1::date+60)::text",[bookingDay]);
  const phase4HomeAvailability=await scalar(`select public.server_public_branch_availability(
    $1,$2,$3::date,null,$4,'HOME_SERVICE',7.154,125.278)`,[branch.slug,service,phase4Day,ids.customerUser]);
  equal('Home Service availability returns branch timezone and includes branch travel buffers',
    [phase4HomeAvailability.timezone,phase4HomeAvailability.service.buffer_before_minutes,
      phase4HomeAvailability.service.buffer_after_minutes,phase4HomeAvailability.slots.length>0],
    ['Asia/Manila',
      await scalar('select buffer_before_minutes+30 from public.services where id=$1',[service]),
      await scalar('select buffer_after_minutes+15 from public.services where id=$1',[service]),true]);
  equal('Home Service availability never returns destination coordinates',
    JSON.stringify(phase4HomeAvailability).includes('7.154'),false);
  const homeSlot=phase4HomeAvailability.slots[0];
  const homeBooking=await scalar(`select public.server_public_branch_booking_submit(
    $1,$2,null,$3::timestamptz,$4,'Existing Customer','customer@branch.test','+1 555 000 0000',$5,
    'HOME_SERVICE','123 New Street',7.154,125.278,'Blue Gate','Second floor','Davao')`,
    [branch.slug,service,homeSlot.starts_at,randomUUID(),ids.otherCustomerUser]);
  const homeAppointment=homeBooking.appointment_id;
  equal('authenticated Home Service booking snapshots branch price, fee and travel policy',
    await scalar(`select jsonb_build_array(a.branch_id,a.total_amount,a.required_payment_amount,a.home_service_fee_snapshot,
      a.home_travel_before_snapshot,a.home_travel_after_snapshot,a.state,i.price_amount)
      from public.appointments a join public.appointment_items i on i.appointment_id=a.id where a.id=$1`,[homeAppointment]),
    [branchId,12900,1000,900,30,15,'PENDING',12000]);
  equal('Home Service booking stores the exact location privately and adds audit history',
    await scalar(`select jsonb_build_array((select count(*)::int from public.appointment_home_locations where appointment_id=$1),
      (select count(*)::int from public.audit_logs where entity_id=$1 and action='home_service.booking_submitted'))`,[homeAppointment]),[1,1]);
  equal('branch booking entry point is service-role-only',[
    await scalar("select has_function_privilege('service_role','public.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text)','EXECUTE')"),
    await scalar("select has_function_privilege('anon','public.server_public_branch_booking_submit(text,uuid,uuid,timestamptz,uuid,text,text,text,uuid,text,text,numeric,numeric,text,text,text)','EXECUTE')")
  ],[true,false]);
  await db.exec('reset role');
  await db.query('delete from auth.users where id=$1',[ids.customerUser]);
  equal('customer Auth account deletion preserves the historical customer as a guest',
    await scalar('select auth_user_id is null from public.customers where id=$1',[customer]),true);
  equal('customer UPDATE grants expose only contact fields',[
    await scalar("select has_table_privilege('authenticated','public.customers','UPDATE')"),
    await scalar("select has_column_privilege('authenticated','public.customers','auth_user_id','UPDATE')"),
    await scalar("select has_column_privilege('authenticated','public.customers','display_name','UPDATE')"),
    await scalar("select has_column_privilege('authenticated','public.customers','email','UPDATE')"),
    await scalar("select has_column_privilege('authenticated','public.customers','phone','UPDATE')")
  ],[false,false,true,true,true]);

  await db.exec('reset role');
  await db.exec('alter table public.appointments disable trigger enforce_appointment_branch');
  await denied('global staff overlap still blocks a second-branch reservation',`insert into public.appointments(customer_id,staff_id,policy_version_id,branch_id,request_key,state,
    starts_at,ends_at,occupied_range,currency,total_amount,payment_mode_snapshot,required_payment_amount,accepted_by,accepted_at)
    select customer_id,staff_id,$1,$2,$3,'CONFIRMED',starts_at,ends_at,occupied_range,'PHP',10000,'DEPOSIT',1000,$5,clock_timestamp()
    from public.appointments where id=$4`,[policy2,branch2,randomUUID(),appointment,ids.owner]);
  await db.exec('alter table public.appointments enable trigger enforce_appointment_branch');
  equal('RLS remains enabled on all branch foundation and operational tables',await scalar(`select count(*)::int from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`),32);
  equal('branch management RPC is executable by authenticated users only',[
    await scalar("select has_function_privilege('authenticated','public.owner_save_branch(uuid,timestamptz,jsonb)','EXECUTE')"),
    await scalar("select has_function_privilege('anon','public.owner_save_branch(uuid,timestamptz,jsonb)','EXECUTE')"),
    await scalar("select has_function_privilege('service_role','public.owner_save_branch(uuid,timestamptz,jsonb)','EXECUTE')")
  ],[true,false,false]);
  equal('branch deletion RPC is executable only by authenticated users and direct deletion stays unavailable',[
    await scalar("select has_function_privilege('authenticated','public.owner_delete_empty_branch(uuid)','EXECUTE')"),
    await scalar("select has_function_privilege('anon','public.owner_delete_empty_branch(uuid)','EXECUTE')"),
    await scalar("select has_function_privilege('service_role','public.owner_delete_empty_branch(uuid)','EXECUTE')"),
    await scalar("select has_table_privilege('authenticated','public.branches','DELETE')")
  ],[true,false,false,false]);
}finally{await db.close();}

// Exercise a first-time setup with no business row or default branch. An
// OWNER-granted ADMIN created before branch bootstrap receives the initial
// membership only when the authenticated OWNER creates the business.
const bootstrapDb=await createDatabase({stopBeforeMigration:migrationFile});
try{
  const owner=randomUUID(),admin=randomUUID();
  await bootstrapDb.query(`insert into auth.users(id,email,email_confirmed_at)
    values($1,'fresh-owner@branch.test',now())`,[owner]);
  await bootstrapDb.query(`insert into auth.users(id,email,email_confirmed_at)
    values($1,'fresh-admin@branch.test',now())`,[admin]);
  await bootstrapDb.query("insert into public.user_roles(auth_user_id,role) values($1,'OWNER')",[owner]);
  const migration=await readFile(`supabase/migrations/${migrationFile}`,'utf8');
  await bootstrapDb.exec(migration);
  await bootstrapDb.exec(await readFile(`supabase/migrations/${phase2MigrationFile}`,'utf8'));
  async function bootstrapActor(role,user='',aal='aal1'){
    await bootstrapDb.exec('reset role');
    await bootstrapDb.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]);
    await bootstrapDb.exec(`set role ${role}`);
  }
  async function bootstrapScalar(sql,params=[]){return Object.values((await bootstrapDb.query(sql,params)).rows[0])[0];}
  await bootstrapActor('authenticated',owner,'aal2');
  await bootstrapScalar("select public.manage_owner_admins('grant',$1,null)",[admin]);
  equal('pre-branch Admin grant has no implicit branch membership',await bootstrapScalar(
    'select count(*)::int from public.admin_branch_memberships where auth_user_id=$1',[admin]),0);
  await bootstrapDb.query(`insert into public.business_settings(name,timezone,currency,address,published)
    values('Fresh Setup Studio','Asia/Manila','PHP','1 Fresh Street',true)`);
  const freshBranch=await bootstrapScalar('select id from public.branches where is_default and is_active');
  equal('fresh OWNER bootstrap creates exactly one default branch',await bootstrapScalar(
    'select count(*)::int from public.branches where is_default and is_active'),1);
  equal('fresh OWNER bootstrap assigns only the pre-authorized ADMIN role',await bootstrapScalar(`
    select count(*)::int from public.admin_branch_memberships m join public.user_roles r
      on r.auth_user_id=m.auth_user_id and r.role='ADMIN'
    where m.auth_user_id=$1 and m.branch_id=$2 and m.active`,[admin,freshBranch]),1);
  await bootstrapActor('authenticated',admin,'aal2');
  equal('fresh bootstrap membership plus ADMIN role grants scoped access',await bootstrapScalar(
    'select private.can_admin_access_branch($1)',[freshBranch]),true);
}finally{await bootstrapDb.close();}
  console.log(`PASS: ${checks} Phase 1–4 multi-branch migration, authorization, public booking and availability database checks.`);
