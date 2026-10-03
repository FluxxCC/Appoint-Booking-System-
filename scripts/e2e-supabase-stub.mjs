import { createHash, generateKeyPairSync, randomUUID, randomBytes, sign as signJwt } from "node:crypto";
import { createServer } from "node:http";

const customerEmail = "customer@example.test", password = "e2e-customer-passphrase";
const port = Number(process.env.E2E_SUPABASE_PORT ?? "54322");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid E2E Supabase stub port.");
const signingKid = "e2e-local-auth";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: signingKid, alg: "RS256", use: "sig", key_ops: ["verify"] }] };
const customerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ownerId = "11111111-1111-4111-8111-111111111111";
const staffUserId = "22222222-2222-4222-8222-222222222222";
const users = [
  { id: customerId, email: customerEmail, password, name: "E2E Customer", roles: [], aal: "aal1" },
  { id: ownerId, email: "owner@example.test", password: "e2e-owner-passphrase", name: "E2E Owner", roles: ["OWNER"], aal: "aal2" },
  { id: staffUserId, email: "staff@example.test", password: "e2e-staff-passphrase", name: "E2E Staff", roles: ["STAFF"], aal: "aal1" },
];
const serviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherAppointmentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const state = { guest: true, registration: true, availability: "normal", approvalMode: "ADMIN_APPROVAL", appointments: new Map(), requests: new Map(), tokens: new Map(), exchanges: new Map(), events: new Map(), emails: [], outbox: [], receipts: [], outboxDispatches: 0, failOutboxClaim: false };
const business = { name: "E2E Test Studio", description: "A local test business.", timezone: "UTC", currency: "PHP", contact_email: "hello@example.test", contact_phone: null, address: "1 Test Way", guest_booking_enabled: true, customer_registration_enabled: true };
const service = { id: serviceId, name: "Consultation", slug: "consultation", description: "A test service.", image_path: null, price_amount: 3500, duration_minutes: 45, category_id: null, payment_mode: "DEPOSIT", deposit_amount: 500 };
const staff = { id: staffId, display_name: "Taylor", slug: "taylor", bio: "", photo_path: null };
const policy = { terms: "Please contact the business to change a request.", minimum_notice_minutes: 0, maximum_advance_days: 90, cancellation_notice_minutes: 60 };
function send(response, status, value, headers = {}) { response.writeHead(status, { "Content-Type": "application/json", ...headers }); response.end(JSON.stringify(value)); }
async function body(request) { let value = ""; for await (const chunk of request) value += chunk; try { return JSON.parse(value || "{}"); } catch { return {}; } }
function authUser(user) { return { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: user.name }, is_anonymous: false }; }
function tokenUser(request) { try { const token=request.headers.authorization?.split(" ")[1]??""; const payload=JSON.parse(Buffer.from(token.split(".")[1]??"","base64url").toString()); return users.find(user=>user.id===payload.sub)??null; } catch { return null; } }
function accessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode({ alg: "RS256", typ: "JWT", kid: signingKid })}.${encode({ iss: `http://127.0.0.1:${port}/auth/v1`, sub: user.id, aud: "authenticated", role: "authenticated", aal: user.aal, email: user.email, exp: now + 3600, iat: now, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: user.name } })}`;
  return `${signingInput}.${signJwt("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url")}`;
}
function currentAppointment(id) { return state.appointments.get(id) ?? (id === otherAppointmentId ? { id, state: "PENDING", starts_at: "2030-01-01T10:00:00Z", ends_at: "2030-01-01T10:45:00Z", currency: "PHP", total_amount: 3500, payment_mode_snapshot: "DEPOSIT", required_payment_amount: 500, payment_due_at: null, customer_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", staff_id: staffId } : null); }
function addOutbox(appointment, kind, deduplicationKey) {
  if (state.outbox.some(job => job.deduplication_key === deduplicationKey)) return;
  state.outbox.push({ id: randomUUID(), appointment_id: appointment.id, kind, deduplication_key: deduplicationKey, payload: {}, state: "PENDING", attempts: 0, available_at: Date.now(), locked_until: null, last_error: null, delivered_at: null, last_attempt_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
}
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/emails" && request.method === "POST") {
    state.emails.push(await body(request));
    return send(response, 200, { id: randomUUID() });
  }
  if (url.pathname === "/__e2e/mailbox") return send(response, 200, { emails: state.emails });
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(response, 200, jwks);
  if (url.pathname === "/__e2e/state" && request.method === "PUT") {
    const next = await body(request); state.guest = next.guest ?? true; state.registration = next.registration ?? true; state.availability = next.availability ?? "normal"; state.approvalMode=next.approvalMode??"ADMIN_APPROVAL";
    if (next.failOutboxClaim !== undefined) state.failOutboxClaim = next.failOutboxClaim;
    if (next.reset) { state.appointments.clear(); state.requests.clear(); state.tokens.clear(); state.exchanges.clear(); state.events.clear(); state.outbox.length = 0; state.receipts.length = 0; state.emails.length = 0; state.outboxDispatches = 0; state.failOutboxClaim = next.failOutboxClaim ?? false; }
    return send(response, 200, { ok: true });
  }
  if (url.pathname === "/__e2e/stats") return send(response, 200, { appointments: state.appointments.size, requestKeys: state.requests.size, outboxDispatches: state.outboxDispatches, outbox: state.outbox.map(job => ({ state: job.state, attempts: job.attempts, last_error: job.last_error })), receipts: state.receipts.length });
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const credentials = await body(request);
    const user=users.find(user=>user.email===credentials.email&&user.password===credentials.password);
    if(!user) return send(response, 400, { msg: "Invalid login credentials" });
    const now = Math.floor(Date.now() / 1000);
    return send(response, 200, { access_token: accessToken(user), token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh-token", user: authUser(user) });
  }
  if (url.pathname === "/auth/v1/user") {
    const token = request.headers.authorization?.split(" ")[1] ?? "";
    if (!token) return send(response, 401, { message: "No session" });
    const user=tokenUser(request);
    return user?send(response,200,authUser(user)):send(response,401,{message:"Invalid session"});
  }
  if (url.pathname.startsWith("/auth/v1/admin/users/")) {
    const user = users.find(row => row.id === url.pathname.split("/").at(-1));
    return user ? send(response, 200, authUser(user)) : send(response, 404, { message: "User not found" });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.split("/").at(-1), args = await body(request);
    if (name === "claim_notification_outbox") {
      state.outboxDispatches += 1;
      if (state.failOutboxClaim) return send(response, 503, { message: "test outbox failure" });
      const now = Date.now();
      const jobs = state.outbox.filter(job => (job.state === "PENDING" && job.available_at <= now) || (job.state === "PROCESSING" && job.locked_until <= now)).slice(0, Math.min(Number(args.p_limit) || 25, 50));
      for (const job of jobs) { job.state = "PROCESSING"; job.attempts += 1; job.locked_until = now + 120_000; job.last_attempt_at = now; }
      return send(response, 200, jobs);
    }
    if (name === "finish_notification_outbox") {
      const job = state.outbox.find(row => row.id === args.p_id);
      if (!job || job.state !== "PROCESSING") return send(response, 200, false);
      if (args.p_success) { job.state = "DELIVERED"; job.delivered_at = Date.now(); job.locked_until = null; }
      else if (args.p_retryable && job.attempts < 8) { job.state = "PENDING"; job.available_at = Date.now() + Math.min(21_600_000, 30_000 * 2 ** Math.min(job.attempts - 1, 9)); job.locked_until = null; job.last_error = args.p_error_code; }
      else { job.state = "FAILED"; job.locked_until = null; job.last_error = args.p_error_code; }
      return send(response, 200, true);
    }
    if (name === "record_notification_delivery") {
      state.receipts.push({ outbox_id: args.p_outbox_id, role: args.p_recipient_role, provider_message_id: args.p_provider_message_id });
      return send(response, 200, true);
    }
    if (name === "enqueue_guest_access_notification") {
      const appointment = [...state.appointments.values()].find(a => a.customer_email?.toLowerCase() === String(args.p_email ?? "").toLowerCase() && a.public_reference === args.p_reference);
      if (!appointment) return send(response, 200, false);
      addOutbox(appointment, "GUEST_ACCESS_REQUESTED", `guest-access:${args.p_request_id}`);
      return send(response, 200, true);
    }
    if (name === "registration_enabled") return send(response, 200, state.registration);
    if (name === "get_access_context") { const user=tokenUser(request); return send(response, 200, { profileActive: true, roles: user?.roles??[], staffActive: user?.id===staffUserId }); }
    if (name === "public_website_data") return send(response, 200, { business: { ...business, guest_booking_enabled: state.guest, customer_registration_enabled: state.registration, booking_approval_mode: state.approvalMode }, website: null, services: [service], staff: [staff], assignments: [{ service_id: serviceId, staff_id: staffId }], categories: [], hours: [{ weekday: 0, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 1, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 2, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 3, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 4, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 5, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 6, opens_at: "00:00:00", closes_at: "23:59:00" }], announcements: [], policy });
    if (name === "server_availability_for_date") {
      if (state.availability === "error") return send(response, 503, { message: "test error" });
      const date = String(args.p_date), slots = state.availability === "empty" || (!args.p_auth_user && !state.guest) ? [] : ["10:00", "11:00", "12:00"].filter(time=>!([...state.appointments.values()].some(a=>a.starts_at===`${date}T${time}:00.000Z`&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state)))).map(time => ({ starts_at: `${date}T${time}:00.000Z`, ends_at: `${date}T${time}:45.000Z`, local_time: time, staff_ids: [staffId], assigned_staff_id: staffId, staff: [{ id: staffId, display_name: staff.display_name }] }));
      return send(response, 200, { date, timezone: "UTC", service: { id: serviceId, name: service.name, duration_minutes: service.duration_minutes, buffer_before_minutes: 0, buffer_after_minutes: 0 }, scheduling_interval_minutes: 30, slots });
    }
    if (name === "server_public_booking_submit") {
      const key = args.p_request_key;
      if (state.requests.has(key)) return send(response, 200, { appointment_id: state.requests.get(key), guest_token: null });
      if (state.availability === "empty" || (!args.p_auth_user && !state.guest)) return send(response, 400, { message: "This time is no longer available" });
      if(state.approvalMode==="AUTO_CONFIRM"&&[...state.appointments.values()].some(a=>a.starts_at===args.p_start&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state))) return send(response,400,{message:"This time is no longer available"});
      const id = randomUUID(), token = args.p_auth_user ? null : randomBytes(32).toString("base64url"), appointment = { id, public_reference:`BK-${randomBytes(8).toString("hex").toUpperCase()}`, state: state.approvalMode==="AUTO_CONFIRM"?"AWAITING_PAYMENT":"PENDING", starts_at: args.p_start, ends_at: new Date(new Date(args.p_start).getTime() + 45 * 60_000).toISOString(), currency: "PHP", total_amount: service.price_amount, payment_mode_snapshot: service.payment_mode, required_payment_amount: service.deposit_amount, payment_due_at: state.approvalMode==="AUTO_CONFIRM"?new Date(Date.now()+30*60_000).toISOString():null, customer_id: args.p_auth_user ? customerId : randomUUID(), customer_name:args.p_name, customer_email:args.p_email, staff_id: staffId, created_at:new Date().toISOString() };
      state.requests.set(key, id); state.appointments.set(id, appointment);
      const eventId = randomUUID(); state.events.set(eventId, { id: eventId, appointment_id: id, to_state: appointment.state, reason: null }); addOutbox(appointment, "APPOINTMENT_STATE_CHANGED", eventId);
      if (token) state.tokens.set(`${createHash("sha256").update(token).digest("hex")}:${id}`, { appointment, token });
      return send(response, 200, { appointment_id: id, guest_token: token });
    }
    if (name === "guest_appointment_by_token") {
      const found = state.tokens.get(`${args.p_token_hash}:${args.p_appointment}`);
      if (!found) return send(response, 200, null);
      const a = found.appointment;
      return send(response, 200, { id: a.id, reference: a.public_reference, state: a.state, starts_at: a.starts_at, ends_at: a.ends_at, currency: a.currency, total_amount: a.total_amount, payment_mode: a.payment_mode_snapshot, required_payment_amount: a.required_payment_amount, payment_due_at: a.payment_due_at, staff_name: staff.display_name, service_name: service.name, duration_minutes: service.duration_minutes, timezone: "UTC" });
    }
    if (name === "issue_guest_access_link") {
      const appointment = [...state.appointments.values()].find(a => !users.some(u=>u.id===a.customer_id) && a.customer_id!==customerId && a.customer_email?.toLowerCase()===String(args.p_email??"").trim().toLowerCase() && (!args.p_reference || a.public_reference===String(args.p_reference).trim().toUpperCase()) && (!args.p_appointment || a.id===args.p_appointment));
      if (!appointment) return send(response, 200, null);
      const token = randomBytes(32).toString("base64url");
      state.exchanges.set(createHash("sha256").update(token).digest("hex"), { appointmentId: appointment.id, expiresAt: Date.now() + 60 * 60_000 });
      return send(response, 200, { appointment_id: appointment.id, token });
    }
    if (name === "exchange_guest_access_link") {
      const exchange = state.exchanges.get(args.p_token_hash);
      if (!exchange || exchange.expiresAt <= Date.now()) { state.exchanges.delete(args.p_token_hash); return send(response, 200, null); }
      state.exchanges.delete(args.p_token_hash);
      const token = randomBytes(32).toString("base64url"), appointment = state.appointments.get(exchange.appointmentId);
      state.tokens.set(`${createHash("sha256").update(token).digest("hex")}:${exchange.appointmentId}`, { appointment, token });
      return send(response, 200, { appointment_id: exchange.appointmentId, guest_token: token });
    }
    if(name==="admin_data") {
      if(!tokenUser(request)?.roles.includes("OWNER"))return send(response,403,{message:"Not authorized"});
      const rows=[...state.appointments.values()].map(a=>({...a,customer_name:a.customer_name,staff_name:staff.display_name,service_name:service.name,collected_amount:"0"}));
      const selected=args.p_section==="appointment"?rows.filter(a=>a.id===args.p_id):rows.filter(a=>!args.p_status||a.state===args.p_status);
      return send(response,200,{business:{...business,booking_approval_mode:state.approvalMode},date:new Date().toISOString().slice(0,10),page:1,total:selected.length,appointments:selected,pending:rows.filter(a=>a.state==="PENDING"),hours:[],payments:[],events:[],stats:{today:0,pending:rows.filter(a=>a.state==="PENDING").length,confirmed:0,completed:0,no_show:0,upcoming:0}});
    }
    if(name==="catalog_data") {
      if(!tokenUser(request)?.roles.includes("OWNER"))return send(response,403,{message:"Not authorized"});
      const isService=args.p_kind==="services";
      return send(response,200,{business,categories:[],services:isService?[{...service,active:true,published:true}]:[],staff:isService?[]:[{...staff,active:true,published:true,bookable:true}],service_options:[],staff_options:[],assignments:[],hours:[],exceptions:[],upcoming:[],page:1,total:1});
    }
    if(name==="manage_owner_admins") {
      if(!tokenUser(request)?.roles.includes("OWNER"))return send(response,403,{message:"Not authorized"});
      if(args.p_action!=="list")return send(response,400,{message:"Unsupported test action"});
      return send(response,200,[{user_id:"33333333-3333-4333-8333-333333333333",email:"admin@example.test",email_confirmed:false,active:false,role:null,status:"invited/unverified"}]);
    }
    if(name==="owner_staff_access") {
      if(!tokenUser(request)?.roles.includes("OWNER"))return send(response,403,{message:"Not authorized"});
      return send(response,200,[{staff_id:staffId,display_name:staff.display_name,active:true,bookable:true,login_enabled:false,email:null}]);
    }
    if(name==="my_staff_workspace") {
      if(tokenUser(request)?.id!==staffUserId)return send(response,403,{message:"Not authorized"});
      const rows=[...state.appointments.values()].map(a=>({...a,customer_name:a.customer_name,service_name:service.name}));
      const upcoming=rows.filter(a=>["CONFIRMED","AWAITING_PAYMENT","CHECKED_IN","IN_PROGRESS"].includes(a.state));
      return send(response,200,{staff_id:staffId,date:new Date().toISOString().slice(0,10),timezone:"UTC",hours:[],business_hours:[],exceptions:[],pending:rows.filter(a=>a.state==="PENDING"),today:[],confirmed:rows.filter(a=>a.state==="CONFIRMED"),upcoming,stats:{pending:rows.filter(a=>a.state==="PENDING").length,today:0,confirmed:0,upcoming:upcoming.length}});
    }
    if(name==="accept_appointment"||name==="transition_appointment") {
      const user=tokenUser(request),a=state.appointments.get(args.p_appointment);
      if(!a)return send(response,404,{message:"Appointment not found"});
      if(!(user?.roles.includes("OWNER")||(state.approvalMode==="STAFF_APPROVAL"&&user?.id===staffUserId)))return send(response,403,{message:"Not authorized"});
      if(name==="accept_appointment") {
        if(a.state!=="PENDING")return send(response,200,a.state);
        if([...state.appointments.values()].some(other=>other.id!==a.id&&other.starts_at===a.starts_at&&["CONFIRMED","AWAITING_PAYMENT"].includes(other.state)))return send(response,409,{message:"This time is no longer available"});
        a.state=a.payment_mode_snapshot==="PAY_AT_BUSINESS"?"CONFIRMED":"AWAITING_PAYMENT";a.payment_due_at=a.state==="AWAITING_PAYMENT"?new Date(Date.now()+30*60_000).toISOString():null;
        return send(response,200,a.state);
      }
      if(args.p_target==="DECLINED"&&a.state==="PENDING"&&String(args.p_reason??"").length>=10){a.state="DECLINED";a.decline_reason=args.p_reason;return send(response,200,a.state)}
      return send(response,400,{message:"Invalid transition"});
    }
    return send(response, 404, { message: `Unhandled test RPC ${name}` });
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.split("/").at(-1), idFilter = url.searchParams.get("id"), id = idFilter?.replace(/^eq\./, ""), appointmentFilter=url.searchParams.get("appointment_id"), customerFilter=url.searchParams.get("customer_id"), auth = request.headers.authorization?.split(" ")[1] ?? "";
    const filterMatches=(filter,value)=>filter===`eq.${value}`||filter===`in.(${value})`||filter?.startsWith("in.(")&&filter.slice(4,-1).split(",").includes(value);
    let registered=false;try{registered=JSON.parse(Buffer.from(auth.split(".")[1]??"","base64url").toString()).sub===customerId}catch{}
    let rows = [];
    if (table === "appointments") {
      const appointment = id ? currentAppointment(id) : filterMatches(customerFilter,customerId) ? [...state.appointments.values()].find(x => x.customer_id === customerId) : null;
      if (appointment && ((registered && appointment.customer_id === customerId) || request.headers.apikey === "e2e-test-server-only-secret")) rows = [appointment];
    } else if (table === "appointment_items") {const appointment=[...state.appointments.values()].find(x=>filterMatches(appointmentFilter,x.id));if(appointment)rows=[{appointment_id:appointment.id,service_name_snapshot:service.name,duration_minutes:service.duration_minutes}]}
    else if (table === "staff" && filterMatches(idFilter,staffId)) rows = [{ id: staffId, display_name: staff.display_name, auth_user_id: staffUserId, active: true }];
    else if (table === "customers") { const appointment=[...state.appointments.values()].find(x=>filterMatches(idFilter,x.customer_id)); if(appointment && request.headers.apikey === "e2e-test-server-only-secret") rows=[{ id: appointment.customer_id, display_name: appointment.customer_name, email: appointment.customer_email, auth_user_id: appointment.customer_id===customerId?customerId:null, phone: null }]; else if(registered) rows = [{ id: customerId, display_name: "E2E Customer", email: customerEmail, phone: null, auth_user_id: customerId }]; }
    else if (table === "business_settings") rows = [{ name: business.name, timezone: "UTC",booking_approval_mode:state.approvalMode }];
    else if (table === "appointment_events" && id) rows = state.events.has(id) ? [state.events.get(id)] : [];
    else if (table === "user_roles") rows = [{ auth_user_id: ownerId, role: "OWNER" }];
    else if (table === "profiles") { const authId=url.searchParams.get("auth_user_id")?.replace(/^eq\./, ""); rows = authId ? [{ auth_user_id: authId, disabled_at: null }] : []; }
    else if (table === "payments") rows = [];
    return send(response, 200, rows, { "Content-Range": `0-${rows.length - 1}/${rows.length}` });
  }
  return send(response, 404, { message: "Not found" });
});
server.listen(port, "127.0.0.1");
