import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from './database-harness.mjs';
const db=await createDatabase();let checks=0;
const ids=Object.fromEntries(['owner','admin','customerUser','staffUser','otherUser','customer'].map(k=>[k,randomUUID()]));
async function actor(role,user='',aal='aal1'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]);await db.exec(`set role ${role}`);}
async function scalar(sql,params=[]){return Object.values((await db.query(sql,params)).rows[0])[0];}
function equal(label,a,b){assert.deepEqual(a,b,label);checks++;}
async function denied(label,sql,params=[]){await assert.rejects(db.query(sql,params),undefined,label);checks++;}
const profile={full_name:'John Private',display_name:'John',slug:'john',bio:'Barber',email:'private@example.test',phone:'+631234',active:true,published:true,bookable:true};
const service={name:'Haircut',slug:'haircut',category_id:'',description:'Cut',price_amount:30001,duration_minutes:30,buffer_before_minutes:0,buffer_after_minutes:0,payment_mode:'DEPOSIT',deposit_amount:1,deposit_type:'PERCENTAGE',deposit_percent_bps:3000,active:true,published:true};
const hours=Array.from({length:7},(_,weekday)=>({weekday,opens_at:'08:00',closes_at:'20:00'}));
try{
 for(const k of ['owner','admin','customerUser','staffUser','otherUser'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[k],`${k}@example.test`]);
 await db.query("insert into public.user_roles(auth_user_id,role) values($1,'OWNER'),($2,'ADMIN')",[ids.owner,ids.admin]);
 await actor('authenticated',ids.owner,'aal2');
 await scalar('select public.admin_save_settings($1)',[JSON.stringify({name:'Studio',description:'',contact_email:'',contact_phone:'',address:'',timezone:'Asia/Manila',currency:'PHP',scheduling_interval_minutes:15,default_buffer_minutes:0,require_staff_approval:true,guest_booking_enabled:true,customer_registration_enabled:true,payment_window_minutes:30,minimum_notice_minutes:0,maximum_advance_days:90,terms:'Terms',expected_updated_at:''})]);
 await scalar('select public.admin_save_hours($1)',[JSON.stringify(hours)]);
 const category=await scalar('select public.catalog_save_category(null,$1)',[JSON.stringify({name:'Hair',slug:'hair',sort_order:0,active:true,published:true})]);service.category_id=category;
 const staff=await scalar('select public.catalog_save_staff(null,$1)',[JSON.stringify(profile)]);
 const other=await scalar('select public.catalog_save_staff(null,$1)',[JSON.stringify({...profile,slug:'other',display_name:'Other',bookable:false})]);
 const svc=await scalar("select public.catalog_save_service(null,$1,'PHP')",[JSON.stringify(service)]);
 equal('database calculates percent rather than trusting supplied deposit',await scalar('select deposit_amount::int from public.services where id=$1',[svc]),9001);
 equal('owner links existing profile without duplicating it',await scalar("select public.link_staff_account($1,'John','john')",[ids.staffUser]),staff);
 equal('owner linking is idempotent',await scalar("select public.link_staff_account($1,'John','john')",[ids.staffUser]),staff);
 await scalar('select public.catalog_assign_services($1,$2)',[staff,JSON.stringify([svc])]);
 await scalar('select public.catalog_save_staff_hours($1,$2)',[staff,JSON.stringify(hours)]);
 equal('admin reads private contacts through guarded RPC',(await scalar("select public.catalog_data('staff',$1)",[staff])).staff[0].email,profile.email);
 for(const [name,aal] of [['customerUser','aal2'],['staffUser','aal2'],['owner','aal1']]){
  await actor('authenticated',ids[name],aal);
  await denied(`${name} cannot manage categories`,'select public.catalog_save_category(null,$1)',['{}']);
  await denied(`${name} cannot manage services`,"select public.catalog_save_service($1,$2,'PHP')",[svc,JSON.stringify(service)]);
  await denied(`${name} cannot manage other staff`,'select public.catalog_save_staff($1,$2)',[other,JSON.stringify(profile)]);
  await denied(`${name} cannot manage assignments`,'select public.catalog_assign_services($1,$2)',[staff,'[]']);
  await denied(`${name} cannot manage hours`,'select public.catalog_save_staff_hours($1,$2)',[staff,'[]']);
  await denied(`${name} cannot read admin contacts`,"select public.catalog_data('staff')");
  equal(`${name} private table RLS`,await scalar('select count(*)::int from private.staff_details'),0);
 }
 await actor('anon');await denied('anonymous cannot manage services',"select public.catalog_save_service(null,'{}','PHP')");await denied('anonymous cannot read contacts','select * from private.staff_details');
 let pub=await scalar('select public.public_catalog()');equal('public safe service visible',pub.services.length,1);equal('nonbookable staff omitted',pub.staff.length,1);equal('public staff projection excludes sensitive fields',Object.keys(pub.staff[0]).sort(),['id','display_name','slug','bio','photo_path'].sort());
 await actor('authenticated',ids.admin,'aal2');await denied('admin cannot grant staff role',"select public.link_staff_account($1,'Other','other')",[ids.otherUser]);
 await denied('admin cannot change staff account linkage directly',"update public.staff set auth_user_id=$2 where id=$1",[staff,ids.otherUser]);
 await denied('admin cannot insert an already-linked staff profile directly',"insert into public.staff(auth_user_id,display_name,slug) values($1,'Linked','linked')",[ids.otherUser]);
 await scalar('select public.catalog_save_staff($1,$2)',[staff,JSON.stringify({...profile,display_name:'John Updated'})]);
 await actor('service_role');equal('ADMIN profile management preserves controlled identity linkage',await scalar('select auth_user_id from public.staff where id=$1',[staff]),ids.staffUser);
 await actor('authenticated',ids.admin,'aal2');
 for(const patch of [{duration_minutes:0},{deposit_percent_bps:10001},{deposit_type:'FIXED',deposit_percent_bps:null,deposit_amount:40000}])await denied('database rejects invalid service',"select public.catalog_save_service($1,$2,'PHP')",[svc,JSON.stringify({...service,...patch})]);
 await denied('overlapping hours rejected atomically','select public.catalog_save_staff_hours($1,$2)',[staff,JSON.stringify([{weekday:1,opens_at:'09:00',closes_at:'12:00'},{weekday:1,opens_at:'11:00',closes_at:'13:00'}])]);
 equal('prior hours survive invalid save',await scalar('select count(*)::int from public.staff_working_hours where staff_id=$1',[staff]),7);
 await actor('service_role');await db.query("insert into public.customers(id,auth_user_id,display_name,email) values($1,$2,'Customer','c@example.test')",[ids.customer,ids.customerUser]);
 const day=await scalar("select ((now() at time zone 'Asia/Manila')::date+7)::text");
 const request=()=>scalar("select public.request_appointment($1,$2,$3,($4::date+time '10:00') at time zone 'Asia/Manila',$5)",[ids.customer,staff,svc,day,randomUUID()]);
 await actor('authenticated',ids.customerUser);const appointment=await request();
 await actor('authenticated',ids.admin,'aal2');await scalar("select public.catalog_save_service($1,$2,'PHP')",[svc,JSON.stringify({...service,price_amount:35000})]);
 equal('appointment retains original price',await scalar('select total_amount::int from public.appointments where id=$1',[appointment]),30001);equal('appointment retains original deposit',await scalar('select required_payment_amount::int from public.appointments where id=$1',[appointment]),9001);
 await scalar('select public.catalog_assign_services($1,$2)',[staff,'[]']);await actor('authenticated',ids.customerUser);await assert.rejects(request());checks++;
 await actor('authenticated',ids.admin,'aal2');await denied('acceptance rechecks eligibility','select public.accept_appointment($1)',[appointment]);await scalar('select public.catalog_assign_services($1,$2)',[staff,JSON.stringify([svc])]);
 equal('accepted deposit booking awaits payment',''+await scalar('select public.accept_appointment($1)',[appointment]),'AWAITING_PAYMENT');
 await scalar('select public.catalog_save_staff_hours($1,$2)',[staff,JSON.stringify(hours)]);checks++;
 await denied('hours cannot invalidate reservation','select public.catalog_save_staff_hours($1,$2)',[staff,'[]']);
 await denied('leave cannot invalidate reservation',"select public.catalog_save_exception($1,'UNAVAILABLE',$2::timestamp,$3::timestamp,'Leave')",[staff,`${day} 00:00`,`${day} 23:59`]);
 await scalar("select public.catalog_save_exception($1,'UNAVAILABLE',$2::timestamp,$3::timestamp,'Lunch')",[staff,`${day} 12:00`,`${day} 13:00`]);
 await actor('authenticated',ids.staffUser);equal('staff direct edits to another profile affect zero rows',(await db.query("update public.staff set bio='Attack' where id=$1 returning id",[other])).rows.length,0);equal('staff direct hours deletion denied by RLS',(await db.query('delete from public.staff_working_hours where staff_id=$1 returning id',[staff])).rows.length,0);
 const workspace=await scalar('select public.my_staff_workspace()');equal('workspace derives own identity',workspace.staff_id,staff);equal('workspace contains own reservation',workspace.upcoming[0].id,appointment);equal('workspace excludes appointment money',Object.hasOwn(workspace.upcoming[0],'total_amount'),false);
 await actor('authenticated',ids.customerUser);await denied('customer cannot read staff workspace','select public.my_staff_workspace()');
 await actor('authenticated',ids.admin,'aal2');await scalar("select public.catalog_save_service($1,$2,'PHP')",[svc,JSON.stringify({...service,active:false})]);await actor('anon');equal('inactive service excluded',(await scalar('select public.public_catalog()')).services.length,0);
 await actor('authenticated',ids.admin,'aal2');await scalar("select public.catalog_save_service($1,$2,'PHP')",[svc,JSON.stringify(service)]);await db.query('update public.service_categories set active=false where id=$1',[category]);await actor('anon');equal('inactive category excludes service',(await scalar('select public.public_catalog()')).services.length,0);
 const path=`services/${svc}/${randomUUID()}.webp`;
 await actor('authenticated',ids.staffUser);await denied('staff cannot upload catalog objects',"insert into storage.objects(bucket_id,name) values('catalog-images',$1)",[path]);
 await actor('authenticated',ids.admin,'aal2');await denied('admin cannot upload arbitrary object path',"insert into storage.objects(bucket_id,name) values('catalog-images','evil.html')");
 await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1)",[path]);await scalar("select public.catalog_set_image('services',$1,$2,null)",[svc,path]);
 equal('referenced image cannot be deleted',(await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,0);
 await denied('stale image replacement rejected',"select public.catalog_set_image('services',$1,null,null)",[svc]);
 await scalar("select public.catalog_set_image('services',$1,null,$2)",[svc,path]);equal('unreferenced image can be cleaned up',(await db.query('delete from storage.objects where name=$1 returning id',[path])).rows.length,1);

 const logoA=`appearance/logo/${randomUUID()}.webp`,logoB=`appearance/logo/${randomUUID()}.webp`,ownerHero=`appearance/hero/${randomUUID()}.webp`,adminLogo=`appearance/logo/${randomUUID()}.webp`,hero=`appearance/hero/${randomUUID()}.webp`;
 await actor('authenticated',ids.owner,'aal2');equal('OWNER can insert a logo appearance object',(await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1) returning id",[logoA])).rows.length,1);
 equal('OWNER can insert a hero appearance object',(await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1) returning id",[ownerHero])).rows.length,1);
 await actor('authenticated',ids.admin,'aal2');equal('ADMIN can insert a logo appearance object',(await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1) returning id",[adminLogo])).rows.length,1);
 equal('ADMIN can insert a hero appearance object',(await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1) returning id",[hero])).rows.length,1);
 for(const [label,role,user] of [['anonymous','anon',''],['CUSTOMER','authenticated',ids.customerUser],['STAFF','authenticated',ids.staffUser]]){
  await actor(role,user,'aal2');await denied(`${label} cannot upload appearance objects`,"insert into storage.objects(bucket_id,name) values('catalog-images',$1)",[logoB]);
 }
 await actor('authenticated',ids.admin,'aal2');
 for(const invalid of [`appearance/random/${randomUUID()}.webp`,`other-folder/${randomUUID()}.webp`,'appearance/logo/not-valid-file.txt'])await denied('appearance policy rejects invalid paths',"insert into storage.objects(bucket_id,name) values('catalog-images',$1)",[invalid]);
 await db.query("insert into storage.objects(bucket_id,name) values('catalog-images',$1)",[logoB]);
 await db.query("insert into public.website_settings(singleton,logo_path) values(true,$1)",[logoA]);
 equal('referenced appearance logo cannot be deleted',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[logoA])).rows.length,0);
 await actor('service_role');await db.query('update public.website_settings set logo_path=$1 where singleton=true',[logoB]);
 await actor('authenticated',ids.owner,'aal2');equal('replaced appearance logo is eligible for cleanup',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[logoA])).rows.length,1);
 equal('current appearance logo remains protected',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[logoB])).rows.length,0);
 await actor('service_role');await db.query('update public.website_settings set logo_path=null where singleton=true');
 await actor('authenticated',ids.admin,'aal2');equal('removed appearance logo is eligible for cleanup',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[logoB])).rows.length,1);
 equal('hero appearance object can be cleaned when unreferenced',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[hero])).rows.length,1);
 equal('owner hero appearance object can be cleaned when unreferenced',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[ownerHero])).rows.length,1);
 equal('admin logo appearance object can be cleaned when unreferenced',(await db.query('delete from storage.objects where bucket_id=\'catalog-images\' and name=$1 returning id',[adminLogo])).rows.length,1);
 console.log(`PASS: ${checks} Phase 5 catalog, staff, schedule and Storage policy database checks.`);
}finally{await db.close();}
