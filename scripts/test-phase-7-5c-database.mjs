import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';

const db = await createDatabase();
const owner = randomUUID();
const staffAccount = randomUUID();
const staffProfile = randomUUID();
const otherStaffProfile = randomUUID();
let checks = 0;

async function actor(role, user = '', aal = 'aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [user, JSON.stringify({ sub: user, aal })]);
  await db.exec(`set role ${role}`);
}
async function scalar(sql, params = []) { return Object.values((await db.query(sql, params)).rows[0])[0]; }
function equal(label, actual, expected) { assert.deepEqual(actual, expected, label); checks++; }
async function denied(label, sql, params = []) { await assert.rejects(db.query(sql, params), /permission|Owner with MFA|administrator|privileged|active account|active staff|already linked/i, label); checks++; }

try {
  await db.query("insert into auth.users(id,email) values($1,'owner@example.test'),($2,'staff@example.test')", [owner, staffAccount]);
  await actor('service_role');
  await db.query("select public.bootstrap_initial_owner($1,'owner@example.test')", [owner]);
  await db.query("insert into public.staff(id,display_name,slug,active,published,bookable) values($1,'Bookable profile','bookable-profile',true,true,true),($2,'Other profile','other-profile',true,true,true)", [staffProfile, otherStaffProfile]);
  await db.query("insert into public.customers(auth_user_id,display_name,email) values($1,'Customer and staff','staff@example.test')", [staffAccount]);
  await db.query("insert into public.business_settings(name,timezone,currency,published) values('Phase 7.5C test','UTC','USD',true)");
  await db.exec('reset role');

  equal('staff auth linkage remains nullable', await scalar("select is_nullable from information_schema.columns where table_schema='public' and table_name='staff' and column_name='auth_user_id'"), 'YES');
  equal('approval policy defaults to ADMIN_APPROVAL', await scalar('select booking_approval_mode from public.business_settings'), 'ADMIN_APPROVAL');

  await actor('anon');
  await denied('anonymous users cannot list staff login access', 'select public.owner_staff_access()');
  await denied('anonymous users cannot enable staff login', 'select public.enable_staff_login($1,$2)', [staffProfile, 'staff@example.test']);

  await actor('authenticated', owner);
  await denied('OWNER at AAL1 cannot enable staff login', 'select public.enable_staff_login($1,$2)', [staffProfile, 'staff@example.test']);
  await actor('authenticated', owner, 'aal2');
  const accessList = await scalar('select public.owner_staff_access()');
  equal('owner login-access list reports no account on profile', accessList.find(row => row.staff_id === staffProfile).login_enabled, false);

  await scalar('select public.enable_staff_login($1,$2)', [staffProfile, 'STAFF@example.test']);
  const enabled = await scalar('select public.owner_staff_access()');
  equal('staff account is linked to selected profile', enabled.find(row => row.staff_id === staffProfile).email, 'staff@example.test');
  equal('staff role granted with the link', await scalar("select role from public.user_roles where auth_user_id=$1 and role='STAFF'", [staffAccount]), 'STAFF');
  equal('customer record is preserved while staff login is enabled', await scalar('select count(*)::int from public.customers where auth_user_id=$1', [staffAccount]), 1);
  equal('link operation is audited without identity secrets', await scalar("select count(*)::int from public.audit_logs where action='STAFF_LOGIN_ENABLED' and entity_id=$1 and details='{}'::jsonb", [staffProfile]), 1);

  await denied('one Auth account cannot link to another staff profile', 'select public.enable_staff_login($1,$2)', [otherStaffProfile, 'staff@example.test']);
  await actor('authenticated', staffAccount);
  await denied('STAFF cannot disable own login access', 'select public.disable_staff_login($1)', [staffProfile]);
  await denied('STAFF cannot change staff account linkage directly', 'update public.staff set auth_user_id=null where id=$1', [staffProfile]);

  await actor('authenticated', owner, 'aal2');
  await scalar('select public.disable_staff_login($1)', [staffProfile]);
  const disabled = await scalar('select public.owner_staff_access()');
  equal('disabling login leaves the profile intact', disabled.find(row => row.staff_id === staffProfile).login_enabled, false);
  equal('disabling login leaves the active bookable profile', disabled.find(row => row.staff_id === staffProfile).bookable, true);
  equal('disabling login clears the email association', disabled.find(row => row.staff_id === staffProfile).email, null);
  equal('disabling removes only STAFF role', await scalar("select count(*)::int from public.user_roles where auth_user_id=$1 and role='STAFF'", [staffAccount]), 0);
  equal('disabling leaves customer linkage intact', await scalar('select count(*)::int from public.customers where auth_user_id=$1', [staffAccount]), 1);
  equal('disable operation is audited', await scalar("select count(*)::int from public.audit_logs where action='STAFF_LOGIN_DISABLED' and entity_id=$1", [staffProfile]), 1);
  await denied('email-based admin access cannot override existing OWNER identity', 'select public.manage_admin_access_by_email($1,$2)', ['grant', 'owner@example.test']);

  console.log(`PASS: ${checks} Phase 7.5C identity/access database checks.`);
} finally { await db.close(); }
