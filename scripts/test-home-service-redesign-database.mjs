import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './database-harness.mjs';

const db = await createDatabase();
const owner = randomUUID(), customer = randomUUID();
let checks = 0;
const check = (label, actual, expected) => { assert.deepEqual(actual, expected, label); checks++; };
const scalar = async (query, params = []) => Object.values((await db.query(query, params)).rows[0])[0];
async function actor(role, user = '', aal = 'aal1') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [user, JSON.stringify({ sub: user, aal })]);
  await db.exec(`set role ${role}`);
}
async function denied(label, query, params = [], pattern = /./) {
  await assert.rejects(db.query(query, params), pattern, label); checks++;
}
try {
  await db.query("insert into auth.users(id,email) values($1,'owner@example.test'),($2,'customer@example.test')", [owner, customer]);
  await db.query("insert into public.user_roles(auth_user_id,role) values($1,'OWNER')", [owner]);
  await db.query("insert into public.business_settings(name,timezone,currency,published) values('Test','UTC','USD',true)");
  const branch = await scalar('select id from public.branches where is_default');
  check('branch Home Service defaults off', await scalar('select home_service_enabled from public.branches where id=$1', [branch]), false);
  await actor('anon');
  check('anonymous cannot change branch toggle', await scalar("select has_function_privilege('anon','public.owner_set_home_service_enabled(uuid,boolean)','EXECUTE')"), false);
  check('anonymous cannot read trip snapshots', await scalar("select has_function_privilege('anon','public.home_service_trip_snapshot(text,uuid)','EXECUTE')"), false);
  check('anonymous cannot publish staff position', await scalar("select has_function_privilege('anon','public.home_service_trip_control(uuid,text,numeric,numeric)','EXECUTE')"), false);
  await actor('authenticated', customer);
  await denied('customer cannot change branch toggle', 'select public.owner_set_home_service_enabled($1,true)', [branch], /Owner access/);
  await denied('customer cannot read team trips', "select public.home_service_trip_snapshot('admin',null)", [], /Admin with MFA/);
  await denied('customer cannot publish a trip', "select public.home_service_trip_control($1,'START',14,120)", [randomUUID()], /Assigned staff/);
  await actor('authenticated', owner, 'aal1');
  await denied('owner MFA is required for toggle', 'select public.owner_set_home_service_enabled($1,true)', [branch], /Owner access/);
  await actor('authenticated', owner, 'aal2');
  check('owner can enable branch', await scalar('select public.owner_set_home_service_enabled($1,true)', [branch]), true);
  check('owner can disable branch without erasing history', await scalar('select public.owner_set_home_service_enabled($1,false)', [branch]), false);
  await actor('service_role');
  await denied('guest rejected by branch booking RPC before insertion',
    "select public.server_public_branch_booking_submit('main',$1,null,now()+interval '2 days',$2,'Guest','guest@example.test',null,null,'HOME_SERVICE','123 Street',14,120,null,null,'City')",
    [randomUUID(),randomUUID()], /Sign in to book Home Service/);
  await denied('guest rejected by legacy booking RPC before insertion',
    "select public.server_home_service_booking_submit($1,null,now()+interval '2 days',$2,'Guest','guest@example.test',null,null,'123 Street',14,120,null,null,'City')",
    [randomUUID(),randomUUID()], /Sign in to book Home Service/);
  await denied('business role is not a customer Home Service identity',
    "select public.server_public_branch_booking_submit('main',$1,null,now()+interval '2 days',$2,'Owner','owner@example.test',null,$3,'HOME_SERVICE','123 Street',14,120,null,null,'City')",
    [randomUUID(),randomUUID(),owner], /A customer account is required/);
  check('private trip table has RLS', await scalar("select relrowsecurity from pg_class where oid='private.home_service_trip_sessions'::regclass"), true);
  check('trip data is not directly granted to customers', await scalar("select has_table_privilege('authenticated','private.home_service_trip_sessions','SELECT')"), false);
  check('trip table retains only one row per appointment', await scalar("select count(*)::int from pg_constraint where conrelid='private.home_service_trip_sessions'::regclass and contype='p'"), 1);
  console.log(`PASS: ${checks} Home Service redesign database checks.`);
} finally { await db.close(); }
