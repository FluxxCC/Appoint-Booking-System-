import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';

const db = await createDatabase();
let checks = 0;
const ids = Object.fromEntries(['owner','admin','staffUser','otherStaffUser','customerUser','otherCustomerUser','staff','otherStaff','customer','otherCustomer','service','cashService','policy'].map(k=>[k,randomUUID()]));
async function actor(role, user = '', aal = 'aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]);
  await db.exec(`set role ${role}`);
}
async function denied(label, sql, params = [], pattern = /./) {
  await assert.rejects(db.query(sql,params),pattern,label);
  checks++;
}
function equal(label,actual,expected) { assert.deepEqual(actual,expected,label); checks++; }
async function scalar(sql,params=[]) { return Object.values((await db.query(sql,params)).rows[0])[0]; }

try {
  for(const name of ['owner','admin','staffUser','otherStaffUser','customerUser','otherCustomerUser'])
    await db.query('insert into auth.users(id,email) values ($1,$2)',[ids[name],`${name}@example.test`]);
  await db.query("insert into public.user_roles(auth_user_id,role) values ($1,'OWNER'),($2,'ADMIN'),($3,'STAFF'),($4,'STAFF')",[ids.owner,ids.admin,ids.staffUser,ids.otherStaffUser]);
  await db.exec("insert into public.business_settings(name,timezone,currency,published,booking_approval_mode) values ('Test business','UTC','USD',true,'STAFF_APPROVAL')");
  await db.query("insert into public.booking_policy_versions(id,version,terms,published,minimum_notice_minutes) values ($1,1,'Test terms',true,0)",[ids.policy]);
  await db.query("insert into public.staff(id,auth_user_id,display_name,slug,published,bookable) values ($1,$2,'Barber','barber',true,true),($3,$4,'Other','other',true,true)",[ids.staff,ids.staffUser,ids.otherStaff,ids.otherStaffUser]);
  await db.query("insert into public.customers(id,auth_user_id,display_name,email) values ($1,$2,'Customer','a@example.test'),($3,$4,'Other','b@example.test')",[ids.customer,ids.customerUser,ids.otherCustomer,ids.otherCustomerUser]);
  await db.query("insert into public.services(id,name,slug,price_amount,duration_minutes,buffer_before_minutes,buffer_after_minutes,payment_mode,deposit_amount,published) values ($1,'Cut','cut',2000,30,5,10,'DEPOSIT',500,true),($2,'Cash cut','cash-cut',2000,30,0,0,'PAY_AT_BUSINESS',0,true)",[ids.service,ids.cashService]);
  await db.query('insert into public.staff_services(staff_id,service_id) values ($1,$2),($1,$3),($4,$2)',[ids.staff,ids.service,ids.cashService,ids.otherStaff]);
  await db.exec("insert into public.business_hours(weekday,opens_at,closes_at) select d,'08:00','20:00' from generate_series(0,6) d");
  await db.query("insert into public.staff_working_hours(staff_id,weekday,starts_at,ends_at) select s,d,'08:00','20:00' from unnest(array[$1::uuid,$2::uuid]) s cross join generate_series(0,6) d",[ids.staff,ids.otherStaff]);
  const date=new Date(); date.setUTCDate(date.getUTCDate()+7); date.setUTCHours(10,0,0,0);
  const start=date.toISOString();
  const later=(minutes)=>new Date(date.getTime()+minutes*60000).toISOString();
  const request=async(customer,service=ids.service,time=start,staff=ids.staff,key=randomUUID())=>scalar('select public.request_appointment($1,$2,$3,$4,$5)',[customer,staff,service,time,key]);

  equal('all 27 tables have RLS', await scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity"),27);
  await db.query("update public.services set supports_home_service=true,home_service_fee=700,home_travel_before_minutes=30,home_travel_after_minutes=20 where id=$1",[ids.service]);
  await actor('authenticated',ids.owner,'aal2');
  await db.query('select public.admin_save_home_area($1,$2,$3)',[14,120,10]);
  equal('radius setting records only enforcement state',await scalar("select details->>'radius_enforced' from public.audit_logs where action='home_service.settings_changed' order by created_at desc limit 1"),'true');
  await actor('authenticated',ids.admin,'aal2');
  await db.query('select public.admin_save_home_area($1,$2,$3)',[14,120,10]);
  equal('ADMIN can configure Home Service area',await scalar('select home_service_max_radius_km from public.business_settings'),'10.00');
  await db.query("update public.services set deposit_amount=0,deposit_type='PERCENTAGE',deposit_percent_bps=3000 where id=$1",[ids.service]);
  await actor('service_role');
  await denied('guest cannot create Home Service even through trusted booking boundary',"select public.server_home_service_booking_submit($1,$2,$3,$4,$5,$6,$7,null,$8,$9,$10,null,null,$11)",[ids.service,ids.staff,later(300),randomUUID(),'Customer','a@example.test',null,'123 Main Street',14,120,'Test City'],/registered customer/);
  const homeKey=randomUUID();
  const home=await scalar("select public.server_home_service_booking_submit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)->>'appointment_id'",[ids.service,ids.staff,later(300),homeKey,'Customer','a@example.test',null,ids.customerUser,'123 Main Street',14,120,'Blue gate','Second floor','Test City']);
  equal('home appointment snapshots fulfillment',await scalar('select fulfillment_mode from public.appointments where id=$1',[home]),'HOME_SERVICE');
  equal('home fee added in minor units',await scalar('select total_amount from public.appointments where id=$1',[home]),2700);
  equal('percentage deposit includes Home Service fee',await scalar('select required_payment_amount from public.appointments where id=$1',[home]),810);
  equal('travel buffers snapshotted',await scalar('select home_travel_before_snapshot+home_travel_after_snapshot from public.appointments where id=$1',[home]),50);
  equal('occupied interval includes service buffers and travel',await scalar("select lower(occupied_range)=starts_at-interval '35 minutes' and upper(occupied_range)=ends_at+interval '30 minutes' from public.appointments where id=$1",[home]),true);
  await actor('authenticated',ids.customerUser);
  equal('customer sees own exact destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),1);
  await actor('authenticated',ids.otherCustomerUser);
  equal('other customer cannot see exact destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),0);
  await actor('authenticated',ids.staffUser);
  equal('assigned staff sees general area while request is pending',await scalar('select service_area_hint from public.appointments where id=$1',[home]),'Test City');
  equal('assigned staff cannot see pending exact destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),0);
  await actor('authenticated',ids.otherStaffUser);
  equal('unrelated staff cannot see pending destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),0);
  equal('unrelated staff cannot see pending Home Service appointment',await scalar('select count(*)::int from public.appointments where id=$1',[home]),0);
  await actor('authenticated',ids.owner,'aal2');
  equal('OWNER can access exact operational destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),1);
  await actor('authenticated',ids.admin,'aal2');
  equal('ADMIN can access exact operational destination',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),1);
  await actor('anon');
  await denied('anonymous cannot read private destination','select * from public.appointment_home_locations');
  await actor('authenticated',ids.staffUser);
  equal('assigned staff accepts Home Service request',await scalar('select public.accept_appointment($1)',[home]),'AWAITING_PAYMENT');
  equal('assigned staff sees exact destination after acceptance',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),1);
  await actor('authenticated',ids.otherStaffUser);
  equal('unrelated staff remains denied after acceptance',await scalar('select count(*)::int from public.appointment_home_locations where appointment_id=$1',[home]),0);
  await actor('service_role');
  await denied('outside-radius Home Service rejected server-side',"select public.server_home_service_booking_submit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,$12)",[ids.service,ids.staff,later(360),randomUUID(),'Customer','a@example.test',null,ids.customerUser,'40 Outer Road',15,121,'Far City'],/outside the current Home Service area/);
  const edgeAvailability=await scalar('select public.server_home_service_availability_for_date($1,$2,$3,$4)',[ids.service,date.toISOString().slice(0,10),ids.staff,ids.customerUser]);
  equal('home travel buffer filters too-early slots',edgeAvailability.slots.some(slot=>slot.local_time==='08:00'),false);
  equal('home travel buffer filters too-late slots',edgeAvailability.slots.some(slot=>slot.local_time==='19:30'),false);
  await denied('travel occupancy prevents a conflicting Home Service booking',"select public.server_home_service_booking_submit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,null,null,$12)",[ids.service,ids.staff,later(360),randomUUID(),'Customer','a@example.test',null,ids.customerUser,'123 Main Street',14,120,'Test City'],/no longer available/);
  await db.query("update public.services set deposit_amount=500,deposit_type='FIXED',deposit_percent_bps=null where id=$1",[ids.service]);
  await actor('anon');
  equal('published services public',await scalar('select count(*)::int from public.services'),2);
  equal('safe staff columns public',await scalar('select count(id)::int from public.staff'),2);
  await denied('staff auth linkage private','select auth_user_id from public.staff');
  await denied('guest cannot read appointments','select * from public.appointments');
  await denied('guest cannot request via privileged RPC','select public.request_appointment($1,$2,$3,$4,$5)',[ids.customer,ids.staff,ids.service,start,randomUUID()]);

  await actor('authenticated',ids.customerUser);
  equal('customer sees only own record',await scalar('select count(*)::int from public.customers'),1);
  await denied('cannot request for another customer','select public.request_appointment($1,$2,$3,$4,$5)',[ids.otherCustomer,ids.staff,ids.service,start,randomUUID()]);
  const key=randomUUID(); const a=await request(ids.customer,ids.service,start,ids.staff,key);
  equal('request retry idempotent',await request(ids.customer,ids.service,start,ids.staff,key),a);
  equal('pending initial state',await scalar('select state from public.appointments where id=$1',[a]),'PENDING');
  await denied('customer cannot accept','select public.accept_appointment($1)',[a]);
  await denied('customer cannot change state directly',"update public.appointments set state='CONFIRMED' where id=$1",[a]);
  await denied('customer cannot self-promote',"insert into public.user_roles(auth_user_id,role) values ($1,'ADMIN')",[ids.customerUser]);
  await denied('customer cannot call payment verifier','select public.record_verified_payment($1,$2,now())',[randomUUID(),'fake']);

  await actor('authenticated',ids.otherCustomerUser);
  const b=await request(ids.otherCustomer);
  equal('pending requests may overlap',await scalar('select state from public.appointments where id=$1',[b]),'PENDING');
  equal('cross-account appointments hidden',await scalar('select count(*)::int from public.appointments where id=$1',[a]),0);

  await actor('service_role');
  const insertPayment=async(appointment,amount=500)=>scalar("insert into public.payments(appointment_id,provider,provider_reference,idempotency_key,amount,currency) values ($1,'test',$2,$3,$4,'USD') returning id",[appointment,randomUUID(),randomUUID(),amount]);
  await assert.rejects(insertPayment(a),/requires staff acceptance/); checks++;

  await actor('authenticated',ids.otherStaffUser);
  await denied('unassigned staff cannot accept','select public.accept_appointment($1)',[a]);
  equal('unassigned staff cannot read appointment',await scalar('select count(*)::int from public.appointments where id=$1',[a]),0);
  await actor('authenticated',ids.staffUser);
  equal('accept deposit enters payment wait',await scalar('select public.accept_appointment($1)',[a]),'AWAITING_PAYMENT');
  await denied('overlapping acceptance rejected','select public.accept_appointment($1)',[b],/no longer available|conflicting key|exclusion constraint/);
  equal('losing request remains pending',await scalar('select state from public.appointments where id=$1',[b]),'PENDING');
  equal('accepted recorded in history',await scalar("select count(*)::int from public.appointment_events where appointment_id=$1 and to_state='ACCEPTED'",[a]),1);
  await denied('cannot prematurely mark no-show',"select public.transition_appointment($1,'NO_SHOW',null)",[a]);

  await actor('service_role');
  await denied('cannot confirm without verified payment',"update public.appointments set state='CONFIRMED' where id=$1",[a],/Verified payment required/);
  const payment=await insertPayment(a);
  equal('verified payment confirms',await scalar('select public.record_verified_payment($1,$2,clock_timestamp())',[payment,'event-1']),'CONFIRMED');
  equal('duplicate success safe',await scalar('select public.record_verified_payment($1,$2,clock_timestamp())',[payment,'event-1']),'CONFIRMED');
  equal('duplicate PayMongo success creates no duplicate state event',await scalar("select count(*)::int from public.appointment_events where appointment_id=$1 and to_state='CONFIRMED'",[a]),1);
  await db.query("insert into public.refunds(payment_id,amount,idempotency_key,reason) values ($1,300,$2,'test')",[payment,randomUUID()]);
  await denied('refund total capped',"insert into public.refunds(payment_id,amount,idempotency_key,reason) values ($1,300,$2,'test')",[payment,randomUUID()],/remaining balance/);

  await actor('authenticated',ids.owner,'aal1');
  await denied('admin requires MFA',"insert into public.announcements(title,body) values ('No MFA','Denied')");
  await actor('authenticated',ids.owner,'aal2');
  await denied('closure cannot invalidate confirmed slot',"insert into public.business_closures(starts_at,ends_at,public_reason) values ($1,$2,'Closed')",[start,later(60)],/closure/);
  await denied('direct owner role deletion is disabled',"delete from public.user_roles where auth_user_id=$1 and role='OWNER'",[ids.owner],/permission/);
  await db.query('update public.services set price_amount=3000,duration_minutes=45 where id=$1',[ids.service]);
  equal('price snapshot preserved',await scalar('select total_amount::int from public.appointments where id=$1',[a]),2000);
  equal('duration snapshot preserved',await scalar('select duration_minutes from public.appointment_items where appointment_id=$1',[a]),30);
  await denied('policy history immutable',"update public.booking_policy_versions set terms='edited' where id=$1",[ids.policy]);
  await db.query('update public.services set price_amount=2000,duration_minutes=30 where id=$1',[ids.service]);

  // Keep both overlap and exact occupied-range adjacency starts on the configured grid.
  await actor('service_role');await db.exec('update public.business_settings set scheduling_interval_minutes=5');
  await actor('authenticated',ids.customerUser);
  await assert.rejects(request(ids.customer,ids.cashService,later(35)),/already reserved/); checks++;
  const adjacent=await request(ids.customer,ids.cashService,later(40));
  await actor('authenticated',ids.staffUser);
  equal('half-open adjacency allowed; pay at business confirmed',await scalar('select public.accept_appointment($1)',[adjacent]),'CONFIRMED');
  await db.query("select public.transition_appointment($1,'CHECKED_IN',null)",[a]);
  await db.query("select public.transition_appointment($1,'IN_PROGRESS',null)",[a]);
  await db.query("select public.transition_appointment($1,'COMPLETED',null)",[a]);
  await denied('historical completed interval still blocks','select public.accept_appointment($1)',[b],/no longer available|conflicting key|exclusion constraint/);

  // Privileged fixture simulates time passing without sleeps or weakening production guards.
  await actor('authenticated',ids.customerUser);
  const expired=await request(ids.customer,ids.service,later(120));
  await actor('authenticated',ids.staffUser);
  await db.exec('reset role');
  await db.exec('begin');
  await db.query("update public.appointments set state='ACCEPTED',accepted_by=$2,accepted_at=clock_timestamp()-interval '2 hours' where id=$1",[expired,ids.staffUser]);
  await db.query("update public.appointments set state='AWAITING_PAYMENT',payment_due_at=clock_timestamp()-interval '1 hour' where id=$1",[expired]);
  await db.exec('commit');
  await actor('service_role');
  equal('expiration releases overdue reservation',await scalar('select public.expire_due_payments()'),1);
  equal('expiration is idempotent',await scalar('select public.expire_due_payments()'),0);
  await actor('authenticated',ids.otherCustomerUser);
  const replacement=await request(ids.otherCustomer,ids.service,later(120));
  await actor('authenticated',ids.staffUser);
  equal('released slot can be accepted',await scalar('select public.accept_appointment($1)',[replacement]),'AWAITING_PAYMENT');

  await db.query("insert into public.appointment_notes(appointment_id,author_id,visibility,body) values ($1,$2,'INTERNAL','Private note'),($1,$2,'CUSTOMER','Visible note')",[replacement,ids.staffUser]);
  await actor('authenticated',ids.otherCustomerUser);
  equal('only customer-visible note returned',await scalar('select count(*)::int from public.appointment_notes where appointment_id=$1',[replacement]),1);
  await actor('service_role');
  const latePayment=await insertPayment(replacement);
  await actor('authenticated',ids.otherCustomerUser);
  await db.query("select public.transition_appointment($1,'CANCELLED','Changed plans')",[replacement]);
  await actor('service_role');
  equal('payment after cancellation requires review',await scalar('select public.record_verified_payment($1,$2,clock_timestamp())',[latePayment,'late-event']),'LATE_PAYMENT_REVIEW');
  equal('late payment cannot resurrect appointment',await scalar('select state from public.appointments where id=$1',[replacement]),'CANCELLED');
  equal('funds still recorded for refund reconciliation',await scalar('select state from public.payments where id=$1',[latePayment]),'SUCCEEDED');
  equal('exception job persisted',await scalar("select count(*)::int from public.notification_outbox where appointment_id=$1 and kind='PAYMENT_EXCEPTION'",[replacement]),1);

  await actor('authenticated',ids.customerUser);
  equal('internal notes hidden',await scalar("select count(*)::int from public.appointment_notes"),0);
  await denied('guest tokens never exposed','select * from public.guest_access_tokens');
  await denied('outbox never exposed','select * from public.notification_outbox');
  await denied('customer cannot run expiration','select public.expire_due_payments()');
  await db.exec('reset role');
  const emailJob=await scalar("insert into public.notification_outbox(kind,deduplication_key) values ('TEST','email-outbox-'||$1::text) returning id",[randomUUID()]);
  await actor('anon');
  await denied('anon cannot claim notification jobs','select * from public.claim_notification_outbox(1)');
  await denied('anon cannot acknowledge notification jobs','select public.finish_notification_outbox($1,true,false,null)',[emailJob]);
  await actor('authenticated',ids.customerUser);
  await denied('authenticated cannot claim notification jobs','select * from public.claim_notification_outbox(1)');
  await denied('authenticated cannot acknowledge notification jobs','select public.finish_notification_outbox($1,true,false,null)',[emailJob]);
  await actor('service_role');
  const claim=await db.query("select id,state,attempts from public.claim_notification_outbox(100) where id=$1",[emailJob]);
  equal('service role atomically claims notification job',claim.rows[0]?.state,'PROCESSING');
  equal('claim increments attempt count',claim.rows[0]?.attempts,1);
  equal('service role acknowledges successful delivery',await scalar('select public.finish_notification_outbox($1,true,false,null)',[emailJob]),true);
  equal('successful delivery is marked delivered',await scalar('select state from public.notification_outbox where id=$1',[emailJob]),'DELIVERED');
  equal('service role records provider acceptance',await scalar('select public.record_notification_delivery($1,$2,$3,$4)',[emailJob,'a'.repeat(64),'customer','resend-message-test']),true);
  await actor('anon');
  await denied('anon cannot read provider receipts','select * from public.notification_delivery_receipts');
  await denied('anon cannot inspect owner outbox','select * from public.owner_notification_outbox(10)');
  await denied('anon cannot record provider receipts','select public.record_notification_delivery($1,$2,$3,$4)',[emailJob,'b'.repeat(64),'customer','forbidden']);
  await actor('authenticated',ids.customerUser,'aal2');
  await denied('customer cannot inspect owner outbox','select * from public.owner_notification_outbox(10)');
  await denied('customer cannot read provider receipts','select * from public.notification_delivery_receipts');
  await actor('authenticated',ids.owner,'aal1');
  await denied('OWNER without MFA cannot inspect email delivery','select * from public.owner_notification_outbox(10)');
  await actor('authenticated',ids.owner,'aal2');
  const ownerStatus=await db.query('select id,state,provider_receipts from public.owner_notification_outbox(10) where id=$1',[emailJob]);
  equal('OWNER with MFA sees safe delivery status',ownerStatus.rows[0]?.state,'DELIVERED');
  equal('OWNER status includes provider message ID',ownerStatus.rows[0]?.provider_receipts?.[0]?.message_id,'resend-message-test');
  console.log(`PASS: ${checks} database checks (real PostgreSQL via PGlite; Supabase auth shim).`);
} finally { await db.close(); }

