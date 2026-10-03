import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';

const db = await createDatabase();
let checks=0;
const ids=Object.fromEntries(['owner','admin','admin2','staff','customer','unverified','invitee'].map(name=>[name,randomUUID()]));
async function actor(role,user='',aal='aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user,JSON.stringify({sub:user,aal})]);
  await db.exec(`set role ${role}`);
}
async function scalar(sql,params=[]) { return Object.values((await db.query(sql,params)).rows[0])[0]; }
function equal(label,a,b) { assert.deepEqual(a,b,label); checks++; }
async function denied(label,sql,params=[],pattern=/./) { await assert.rejects(db.query(sql,params),pattern,label); checks++; }
try {
  for(const [name,id] of Object.entries(ids)) await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{\"role\":\"OWNER\",\"roles\":[\"ADMIN\",\"STAFF\"]}')",[id,`${name}@example.test`]);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.unverified]);
  await db.query("update auth.users set email_confirmed_at=null,invited_at=now() where id=$1",[ids.admin2]);
  await db.exec("insert into public.customers(display_name,email) values('Existing guest','customer@example.test')");
  equal('metadata grants no privileged role',await scalar('select count(*)::int from public.user_roles'),0);

  await actor('anon');
  await denied('public cannot bootstrap owner','select public.bootstrap_initial_owner($1,$2)',[ids.owner,'owner@example.test']);
  await denied('public cannot provision authenticated profile',"select public.complete_customer_profile('Anonymous',null)");
  await denied('public cannot query identity context','select public.get_access_context()');

  await actor('service_role');
  await denied('bootstrap requires matching verified email','select public.bootstrap_initial_owner($1,$2)',[ids.owner,'different@example.test']);
  await denied('unverified account cannot be owner','select public.bootstrap_initial_owner($1,$2)',[ids.unverified,'unverified@example.test']);
  await db.query('select public.bootstrap_initial_owner($1,$2)',[ids.owner,'owner@example.test']);
  equal('first owner provisioned',await scalar("select count(*)::int from public.user_roles where role='OWNER'"),1);
  await denied('bootstrap cannot run again','select public.bootstrap_initial_owner($1,$2)',[ids.admin,'admin@example.test'],/already exists/);

  await actor('authenticated',ids.customer);
  equal('ordinary customer has no privileged roles',(await scalar('select public.get_access_context()')).roles,[]);
  const customer=await scalar("select public.complete_customer_profile('Customer Name','+639171234567')");
  equal('provisioning is idempotent',await scalar("select public.complete_customer_profile('Customer Updated',null)"),customer);
  equal('profile uses correct auth subject',await scalar('select auth_user_id from public.customers where id=$1',[customer]),ids.customer);
  await denied('customer cannot activate staff',"select public.link_staff_account($1,'Invited Person','invitee')",[ids.invitee],/Owner with MFA/);
  await denied('customer cannot bootstrap owner','select public.bootstrap_initial_owner($1,$2)',[ids.customer,'customer@example.test']);
  await denied('customer cannot insert privileged role',"insert into public.user_roles(auth_user_id,role) values($1,'STAFF')",[ids.customer]);
  await denied('customer cannot call owner staff function via private schema',"select private.link_staff_account($1,'Invited Person','invitee')",[ids.invitee]);

  await actor('service_role');
  equal('guest record remains unclaimed',await scalar("select count(*)::int from public.customers where email='customer@example.test' and auth_user_id is null"),1);
  equal('customer provision never grants a role',await scalar('select count(*)::int from public.user_roles where auth_user_id=$1',[ids.customer]),0);
  await actor('authenticated',ids.unverified);
  await denied('unverified user cannot provision customer',"select public.complete_customer_profile('Unverified User',null)",[],/Verify your email/);

  await actor('authenticated',ids.owner);
  await denied('owner without MFA cannot invite/link',"select public.link_staff_account($1,'Staff Member','staff-member')",[ids.staff]);
  await actor('authenticated',ids.owner,'aal2');
  const staff=await scalar("select public.link_staff_account($1,'Staff Member','staff-member')",[ids.staff]);
  equal('staff linking idempotent',await scalar("select public.link_staff_account($1,'Staff Member','staff-member')",[ids.staff]),staff);
  equal('role assigned atomically',await scalar("select role from public.user_roles where auth_user_id=$1",[ids.staff]),'STAFF');
  equal('new staff profile unpublished',await scalar('select published from public.staff where id=$1',[staff]),false);
  equal('new staff not bookable',await scalar('select bookable from public.staff where id=$1',[staff]),false);
  await denied('duplicate slug rolls back whole link',"select public.link_staff_account($1,'Invited Person','staff-member')",[ids.invitee]);
  equal('failed link grants no role',await scalar('select count(*)::int from public.user_roles where auth_user_id=$1',[ids.invitee]),0);
  await scalar("select public.manage_owner_admins('grant',$1,null)",[ids.admin]);
  equal('owner sees pending administrator invitation', (await scalar("select public.manage_owner_admins('record-invitation',$1,$2)",[ids.admin2,'admin2@example.test'])).status,'invited/pending');
  await denied('unconfirmed account cannot receive ADMIN',"select public.manage_owner_admins('grant',$1,null)",[ids.admin2],/confirmed email/);
  equal('owner sees invitation as pending',(await scalar("select public.manage_owner_admins('list')")).find(x=>x.user_id===ids.admin2).status,'invited/pending');
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.admin2]);
  await actor('authenticated',ids.owner,'aal2');
  equal('confirmed invitation awaits owner activation',(await scalar("select public.manage_owner_admins('list')")).find(x=>x.user_id===ids.admin2).status,'verified/pending activation');
  await scalar("select public.manage_owner_admins('grant',$1,null)",[ids.admin2]);
  equal('multiple ADMIN accounts are supported',(await scalar("select count(*)::int from public.user_roles where role='ADMIN'")),2);
  await scalar("select public.manage_owner_admins('revoke',$1,null)",[ids.admin2]);
  equal('revoking one ADMIN preserves another',await scalar('select count(*)::int from public.user_roles where auth_user_id=$1 and role=\'ADMIN\'',[ids.admin]),1);
  await actor('authenticated',ids.admin2,'aal2');
  equal('revoked ADMIN loses privileged access immediately',await scalar('select private.is_admin()'),false);
  await actor('authenticated',ids.owner,'aal2');
  await denied('unconfirmed identity cannot be made OWNER directly',"insert into public.user_roles(auth_user_id,role) values($1,'OWNER')",[ids.unverified]);
  await denied('OWNER role rows cannot be directly granted, even by OWNER',"insert into public.user_roles(auth_user_id,role) values($1,'OWNER')",[ids.admin]);

  await actor('authenticated',ids.admin,'aal2');
  equal('admin MFA permits management',await scalar('select private.is_admin()'),true);
  await db.exec("insert into public.announcements(title,body) values('Allowed','Admin with MFA')"); checks++;
  await denied('admin cannot grant staff roles under preserved policy',"select public.link_staff_account($1,'Invited Person','invitee')",[ids.invitee]);
  await denied('admin cannot change staff Auth linkage directly',"update public.staff set auth_user_id=$2 where id=$1",[staff,ids.invitee]);
  await denied('admin cannot grant ADMIN directly',"insert into public.user_roles(auth_user_id,role) values($1,'ADMIN')",[ids.invitee]);
  await denied('admin cannot revoke ADMIN directly',"delete from public.user_roles where auth_user_id=$1 and role='ADMIN'",[ids.admin]);
  await denied('admin cannot grant OWNER directly',"insert into public.user_roles(auth_user_id,role) values($1,'OWNER')",[ids.admin]);
  await denied('admin cannot revoke OWNER directly',"delete from public.user_roles where auth_user_id=$1 and role='OWNER'",[ids.owner]);
  await denied('admin cannot invoke OWNER management RPC',"select public.manage_owner_admins('grant',$1,null)",[ids.invitee]);
  await actor('authenticated',ids.staff);
  equal('linked staff has active staff access',(await scalar('select public.get_access_context()')).staffActive,true);
  await denied('staff cannot manage admin tables',"insert into public.announcements(title,body) values('Denied','Staff')");
  await denied('staff cannot grant another role',"select public.link_staff_account($1,'Invited Person','invitee')",[ids.invitee]);

  await actor('service_role');
  await db.query("insert into public.user_roles(auth_user_id,role) values($1,'OWNER')",[ids.unverified]);
  await denied('unusable OWNER cannot satisfy last-usable-owner guard',"delete from public.user_roles where auth_user_id=$1 and role='OWNER'",[ids.owner],/last usable owner/);
  await db.exec('reset role');
  await denied('unusable OWNER cannot satisfy Auth deletion guard','delete from auth.users where id=$1',[ids.owner],/last usable owner/);
  await actor('authenticated',ids.owner,'aal2');
  await actor('service_role');
  await db.query("delete from public.user_roles where auth_user_id=$1 and role='OWNER'",[ids.unverified]);
  await denied('last usable OWNER profile cannot be disabled','update public.profiles set disabled_at=now() where auth_user_id=$1',[ids.owner],/last usable owner/);
  await actor('service_role');
  await db.query('update public.staff set active=false where id=$1',[staff]);
  await actor('authenticated',ids.staff);
  equal('inactive staff loses access immediately',(await scalar('select public.get_access_context()')).staffActive,false);
  await actor('service_role');
  await db.query('update public.profiles set disabled_at=now() where auth_user_id=$1',[ids.customer]);
  await actor('authenticated',ids.customer);
  equal('disabled profile visible in access decision',(await scalar('select public.get_access_context()')).profileActive,false);
  await denied('disabled profile cannot mutate customer',"select public.complete_customer_profile('Disabled Customer',null)");
  console.log(`PASS: ${checks} Phase 3 authentication/authorization database checks.`);
} finally { await db.close(); }
