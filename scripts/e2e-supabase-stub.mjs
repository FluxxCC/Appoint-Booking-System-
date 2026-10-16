import { createHash, generateKeyPairSync, randomUUID, randomBytes, sign as signJwt } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const customerEmail = "customer@example.test", password = "e2e-customer-passphrase";
const port = Number(process.env.E2E_SUPABASE_PORT ?? "54322");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid E2E Supabase stub port.");
const signingKid = "e2e-local-auth";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: signingKid, alg: "RS256", use: "sig", key_ops: ["verify"] }] };
const customerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const otherCustomerId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ownerId = "11111111-1111-4111-8111-111111111111";
const adminId = "33333333-3333-4333-8333-333333333333";
const staffUserId = "22222222-2222-4222-8222-222222222222";
const users = [
  { id: customerId, email: customerEmail, password, name: "E2E Customer", roles: [], aal: "aal1" },
  { id: otherCustomerId, email: "other-customer@example.test", password: "e2e-other-passphrase", name: "Other E2E Customer", roles: [], aal: "aal1" },
  { id: ownerId, email: "owner@example.test", password: "e2e-owner-passphrase", name: "E2E Owner", roles: ["OWNER"], aal: "aal2" },
  { id: adminId, email: "admin@example.test", password: "e2e-admin-passphrase", name: "E2E Administrator", roles: ["ADMIN"], aal: "aal2" },
  { id: staffUserId, email: "staff@example.test", password: "e2e-staff-passphrase", name: "E2E Staff", roles: ["STAFF"], aal: "aal1" },
];
const serviceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const staffId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const branchId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const branchSlug = "e2e-branch";
const secondBranch = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", slug: "north-branch", name: "North Branch", address: "88 North Street", contact_email: "north@example.test", contact_phone: null, timezone: "Asia/Manila", approval_mode: "ADMIN_APPROVAL", service_count: 1 };
const otherAppointmentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const state = { guest: true, registration: true, homeEnabled: true, trips: new Map(), availability: "normal", approvalMode: "ADMIN_APPROVAL", appointments: new Map(), requests: new Map(), tokens: new Map(), events: new Map(), redisCounters: new Map() };
const business = { name: "E2E Test Studio", description: "A local test business.", timezone: "UTC", currency: "PHP", contact_email: "hello@example.test", contact_phone: null, address: "1 Test Way", guest_booking_enabled: true, customer_registration_enabled: true };
const branch = { id: branchId, slug: branchSlug, name: "E2E Test Studio", address: "1 Test Way", contact_email: "hello@example.test", contact_phone: null, timezone: "UTC", approval_mode: "ADMIN_APPROVAL", service_count: 1 };
const service = { id: serviceId, name: "Consultation", slug: "consultation", description: "A test service.", image_path: null, price_amount: 3500, duration_minutes: 45, category_id: null, payment_mode: "DEPOSIT", deposit_amount: 500, deposit_type: "FIXED", deposit_percent_bps: null, supports_business_location: true, supports_home_service: true, home_service_fee: 700, buffer_before_minutes: 0, buffer_after_minutes: 0, home_travel_before_minutes: 20, home_travel_after_minutes: 20 };
const staff = { id: staffId, display_name: "Taylor", slug: "taylor", bio: "", photo_path: null };
const policy = { terms: "Please contact the business to change a request.", minimum_notice_minutes: 0, maximum_advance_days: 90, cancellation_notice_minutes: 60 };
const corsHeaders = { "Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, content-profile, accept-profile, x-client-info, prefer" };
function send(response, status, value, headers = {}) { response.writeHead(status, { "Content-Type": "application/json", ...corsHeaders, ...headers }); response.end(JSON.stringify(value)); }
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
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "OPTIONS") { response.writeHead(204, corsHeaders); return response.end(); }
  const traceHttp = process.env.E2E_TRACE_HTTP === "1";
  if (traceHttp) {
    const traceFile = process.env.E2E_TRACE_FILE;
    const writeTrace = (line) => {
      const entry = `[E2E stub] ${line} ${request.method} ${url.pathname}\n`;
      if (traceFile) appendFileSync(traceFile, entry);
      else console.log(entry.trimEnd());
    };
    writeTrace("<-");
    response.once("finish", () => writeTrace(`-> ${response.statusCode}`));
  }
  if (url.pathname === "/health") return send(response, 200, { ok: true });
  if (url.pathname === "/redis" && request.method === "POST") {
    if (request.headers.authorization !== "Bearer e2e-only") return send(response, 401, { error: "Unauthorized" });
    const command = await body(request);
    if (!Array.isArray(command) || command[0] !== "EVAL" || typeof command[3] !== "string") return send(response, 400, { error: "Unsupported test Redis command" });
    const key = command[3], count = (state.redisCounters.get(key) ?? 0) + 1;
    state.redisCounters.set(key, count);
    return send(response, 200, { result: [count, Number(command[4]) || 60_000] });
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json") return send(response, 200, jwks);
  if (url.pathname === "/__e2e/state" && request.method === "PUT") {
    const next = await body(request); state.guest = next.guest ?? true; state.registration = next.registration ?? true; state.homeEnabled=next.homeEnabled??true; state.availability = next.availability ?? "normal"; state.approvalMode=next.approvalMode??"ADMIN_APPROVAL"; state.multiBranch=next.multiBranch??false;
    if (next.reset) { state.trips.clear(); state.appointments.clear(); state.requests.clear(); state.tokens.clear(); state.events.clear(); state.redisCounters.clear(); }
    return send(response, 200, { ok: true });
  }
  if (url.pathname === "/__e2e/expire" && request.method === "POST") {
    const { appointmentId } = await body(request);
    const appointment = state.appointments.get(appointmentId);
    if (!appointment || appointment.state !== "AWAITING_PAYMENT") return send(response, 400, { message: "Not awaiting payment" });
    appointment.state = "PAYMENT_EXPIRED";
    appointment.payment_expired_at = new Date().toISOString();
    const eventId=randomUUID(); state.events.set(eventId,{id:eventId,appointment_id:appointment.id,from_state:"AWAITING_PAYMENT",to_state:"PAYMENT_EXPIRED",created_at:appointment.payment_expired_at,reason:null});
    return send(response, 200, { ok: true });
  }
  if (url.pathname === "/__e2e/stats") return send(response, 200, { appointments: state.appointments.size, requestKeys: state.requests.size });
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
    if (name === "admin_customer_directory" || name === "admin_customer_directory_for_branch") {
      const user = tokenUser(request);
      if (!user?.roles.some(role => role === "OWNER" || role === "ADMIN")) return send(response, 403, { message: "Admin access required" });
      return send(response, 200, { customers: [], total: 0, page: Number(args.p_page) || 1, timezone: business.timezone });
    }
    if (name === "registration_enabled") return send(response, 200, state.registration);
    if (name === "customer_appointment_branch_summaries") { const actor=tokenUser(request); const selected=Array.isArray(args.p_appointments)?args.p_appointments:[];return send(response,200,[...state.appointments.values()].filter(a=>selected.includes(a.id)&&actor&&a.customer_id===actor.id).map(a=>({appointment_id:a.id,name:branch.name,address:branch.address,contact_email:branch.contact_email,contact_phone:branch.contact_phone,timezone:branch.timezone}))); }
    if (name === "get_access_context") { const user=tokenUser(request); return send(response, 200, { profileActive: true, roles: user?.roles??[], staffActive: user?.id===staffUserId }); }
    if (name === "public_website_data") return send(response, 200, { business: { ...business, guest_booking_enabled: state.guest, customer_registration_enabled: state.registration, booking_approval_mode: state.approvalMode }, services: [service], staff: [staff], assignments: [{ service_id: serviceId, staff_id: staffId }], categories: [], hours: [{ weekday: 0, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 1, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 2, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 3, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 4, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 5, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 6, opens_at: "00:00:00", closes_at: "23:59:00" }], announcements: [], policy });
    if (name === "public_booking_data") {
      const branches = state.multiBranch ? [branch, secondBranch] : [branch];
      const selectedBranch = args.p_branch_slug ? branches.find(item => item.slug === args.p_branch_slug) ?? null : branches.length === 1 ? branches[0] : null;
      const bookingBranch = selectedBranch ?? branch;
      const hours = selectedBranch ? [{ weekday: 0, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 1, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 2, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 3, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 4, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 5, opens_at: "00:00:00", closes_at: "23:59:00" }, { weekday: 6, opens_at: "00:00:00", closes_at: "23:59:00" }] : [];
      return send(response, 200, { business: { ...business, timezone: bookingBranch.timezone, address: bookingBranch.address, contact_email: bookingBranch.contact_email, booking_approval_mode: state.approvalMode, guest_booking_enabled: state.guest, customer_registration_enabled: state.registration }, branch: selectedBranch ? { ...selectedBranch, home_service_enabled: state.homeEnabled, approval_mode: state.approvalMode } : null, branches: branches.map(item => ({ ...item, home_service_enabled: state.homeEnabled, approval_mode: state.approvalMode })), services: selectedBranch ? [{...service,supports_home_service:state.homeEnabled}] : [], staff: selectedBranch ? [staff] : [], assignments: selectedBranch ? [{ service_id: serviceId, staff_id: staffId }] : [], categories: [], hours, announcements: [], policy: selectedBranch ? policy : null, refund_policy: null });
    }
    if (name === "server_public_branch_availability") { if(args.p_fulfillment==="HOME_SERVICE"&&(!args.p_auth_user||!state.homeEnabled))return send(response,200,{date:args.p_date,timezone:"UTC",slots:[]});
      if (args.p_branch_slug !== branchSlug) return send(response, 200, { date: args.p_date, timezone: "UTC", slots: [] });
      if (state.availability === "error") return send(response, 503, { message: "test error" });
      const date = String(args.p_date), slots = state.availability === "empty" || (!args.p_auth_user && !state.guest) ? [] : ["10:00", "11:00", "12:00"].filter(time=>!([...state.appointments.values()].some(a=>a.starts_at===`${date}T${time}:00.000Z`&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state)))).map(time => ({ starts_at: `${date}T${time}:00.000Z`, ends_at: `${date}T${time}:45.000Z`, local_time: time, staff_ids: [staffId], assigned_staff_id: staffId, staff: [{ id: staffId, display_name: staff.display_name }] }));
      return send(response, 200, { date, timezone: branch.timezone, service: { id: serviceId, name: service.name, duration_minutes: service.duration_minutes, buffer_before_minutes: 0, buffer_after_minutes: args.p_fulfillment === "HOME_SERVICE" ? 40 : 0 }, scheduling_interval_minutes: 30, slots });
    }
    if (name === "server_availability_for_date") {
      if (state.availability === "error") return send(response, 503, { message: "test error" });
      const date = String(args.p_date), slots = state.availability === "empty" || (!args.p_auth_user && !state.guest) ? [] : ["10:00", "11:00", "12:00"].filter(time=>!([...state.appointments.values()].some(a=>a.starts_at===`${date}T${time}:00.000Z`&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state)))).map(time => ({ starts_at: `${date}T${time}:00.000Z`, ends_at: `${date}T${time}:45.000Z`, local_time: time, staff_ids: [staffId], assigned_staff_id: staffId, staff: [{ id: staffId, display_name: staff.display_name }] }));
      return send(response, 200, { date, timezone: "UTC", service: { id: serviceId, name: service.name, duration_minutes: service.duration_minutes, buffer_before_minutes: 0, buffer_after_minutes: 0 }, scheduling_interval_minutes: 30, slots });
    }
    if (name === "server_home_service_availability_for_date") {
      if (state.availability === "error") return send(response, 503, { message: "test error" });
      const date = String(args.p_date), slots = state.availability === "empty" ? [] : ["10:00", "11:00", "12:00"].filter(time=>!([...state.appointments.values()].some(a=>a.starts_at===`${date}T${time}:00.000Z`&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state)))).map(time => ({ starts_at: `${date}T${time}:00.000Z`, ends_at: `${date}T${time}:45.000Z`, local_time: time, staff_ids: [staffId], assigned_staff_id: staffId, staff: [{ id: staffId, display_name: staff.display_name }] }));
      return send(response, 200, { date, timezone: "UTC", service: { id: serviceId, name: service.name, duration_minutes: service.duration_minutes, buffer_before_minutes: 0, buffer_after_minutes: 0 }, scheduling_interval_minutes: 30, slots });
    }
    if (name === "server_public_booking_submit") {
      const key = args.p_request_key;
      if (state.requests.has(key)) return send(response, 200, { appointment_id: state.requests.get(key), guest_token: null });
      if (state.availability === "empty" || (!args.p_auth_user && !state.guest)) return send(response, 400, { message: "This time is no longer available" });
      if(state.approvalMode==="AUTO_CONFIRM"&&[...state.appointments.values()].some(a=>a.starts_at===args.p_start&&["CONFIRMED","AWAITING_PAYMENT"].includes(a.state))) return send(response,400,{message:"This time is no longer available"});
      const id = randomUUID(), token = args.p_auth_user ? null : randomBytes(32).toString("base64url"), appointment = { id, public_reference:`BK-${randomBytes(8).toString("hex").toUpperCase()}`, state: state.approvalMode==="AUTO_CONFIRM"?"AWAITING_PAYMENT":"PENDING", starts_at: args.p_start, ends_at: new Date(new Date(args.p_start).getTime() + 45 * 60_000).toISOString(), currency: "PHP", total_amount: service.price_amount, payment_mode_snapshot: service.payment_mode, required_payment_amount: service.deposit_amount, payment_due_at: state.approvalMode==="AUTO_CONFIRM"?new Date(Date.now()+30*60_000).toISOString():null, customer_id: args.p_auth_user ? customerId : randomUUID(), customer_name:args.p_name, customer_email:args.p_email, staff_id: staffId, created_at:new Date().toISOString() };
      state.requests.set(key, id); state.appointments.set(id, appointment);
      const eventId = randomUUID(); state.events.set(eventId, { id: eventId, appointment_id: id, to_state: appointment.state, reason: null });
      if (token) state.tokens.set(`${createHash("sha256").update(token).digest("hex")}:${id}`, { appointment, token });
      return send(response, 200, { appointment_id: id, guest_token: token });
    }
    if (name === "server_home_service_booking_submit") {
      const key = args.p_request_key;
      if (state.requests.has(key)) return send(response, 200, { appointment_id: state.requests.get(key), guest_token: null });
      if (state.availability === "empty") return send(response, 400, { message: "This time is no longer available" });
      const id = randomUUID(), appointment = { id, public_reference:`BK-${randomBytes(8).toString("hex").toUpperCase()}`, state: "PENDING", starts_at: args.p_start, ends_at: new Date(new Date(args.p_start).getTime() + 45 * 60_000).toISOString(), currency: "PHP", total_amount: service.price_amount + service.home_service_fee, payment_mode_snapshot: service.payment_mode, required_payment_amount: service.deposit_amount, payment_due_at: null, customer_id: customerId, customer_name: args.p_name, customer_email: args.p_email, staff_id: args.p_staff ?? staffId, created_at: new Date().toISOString(), fulfillment_mode: "HOME_SERVICE", home_service_fee_snapshot: service.home_service_fee, home_travel_before_snapshot: 20, home_travel_after_snapshot: 20, service_area_hint: args.p_area_hint };
      appointment.home_location = { appointment_id: id, address: args.p_address, latitude: args.p_latitude, longitude: args.p_longitude, landmark: args.p_landmark, instructions: args.p_instructions };
      state.requests.set(key, id); state.appointments.set(id, appointment);
       const eventId = randomUUID(); state.events.set(eventId, { id: eventId, appointment_id: id, to_state: appointment.state, reason: null });
      return send(response, 200, { appointment_id: id, guest_token: null });
    }
    if (name === "server_public_branch_booking_submit") { if(args.p_fulfillment==="HOME_SERVICE"&&(!args.p_auth_user||!state.homeEnabled))return send(response,403,{message:"Sign in to book Home Service"});
      if (args.p_branch_slug !== branchSlug) return send(response, 400, { message: "This branch is not accepting bookings" });
      const key = args.p_request_key;
      if (state.requests.has(key)) return send(response, 200, { appointment_id: state.requests.get(key), guest_token: null, branch_slug: branchSlug });
      if (state.availability === "empty" || (!args.p_auth_user && !state.guest)) return send(response, 400, { message: "This time is no longer available" });
      if (state.approvalMode === "AUTO_CONFIRM" && [...state.appointments.values()].some(a => a.starts_at === args.p_start && ["CONFIRMED", "AWAITING_PAYMENT"].includes(a.state))) return send(response, 400, { message: "This time is no longer available" });
      const id = randomUUID(), token = args.p_auth_user ? null : randomBytes(32).toString("base64url"), home = args.p_fulfillment === "HOME_SERVICE";
      const appointment = { id, branch_id: branchId, branch_name: branch.name, public_reference:`BK-${randomBytes(8).toString("hex").toUpperCase()}`, state: state.approvalMode === "AUTO_CONFIRM" ? "AWAITING_PAYMENT" : "PENDING", starts_at: args.p_start, ends_at: new Date(new Date(args.p_start).getTime() + 45 * 60_000).toISOString(), currency: "PHP", total_amount: service.price_amount + (home ? service.home_service_fee : 0), payment_mode_snapshot: service.payment_mode, required_payment_amount: service.deposit_amount, payment_due_at: state.approvalMode === "AUTO_CONFIRM" ? new Date(Date.now() + 30 * 60_000).toISOString() : null, customer_id: args.p_auth_user ? customerId : randomUUID(), customer_name: args.p_name, customer_email: args.p_email, staff_id: args.p_staff ?? staffId, created_at: new Date().toISOString(), fulfillment_mode: home ? "HOME_SERVICE" : "BUSINESS_LOCATION", home_service_fee_snapshot: home ? service.home_service_fee : 0, home_travel_before_snapshot: home ? service.home_travel_before_minutes : 0, home_travel_after_snapshot: home ? service.home_travel_after_minutes : 0, service_area_hint: home ? args.p_area_hint : null };
      if (home) appointment.home_location = { appointment_id: id, address: args.p_address, latitude: args.p_latitude, longitude: args.p_longitude, landmark: args.p_landmark, instructions: args.p_instructions };
      state.requests.set(key, id); state.appointments.set(id, appointment);
       const eventId = randomUUID(); state.events.set(eventId, { id: eventId, appointment_id: id, to_state: appointment.state, reason: null });
      if (token) state.tokens.set(`${createHash("sha256").update(token).digest("hex")}:${id}`, { appointment, token });
      return send(response, 200, { appointment_id: id, guest_token: token, branch_slug: branchSlug });
    }
    if (name === "guest_appointment_by_token") {
      const found = state.tokens.get(`${args.p_token_hash}:${args.p_appointment}`);
      if (!found) return send(response, 200, null);
      const a = found.appointment;
      return send(response, 200, { id: a.id, reference: a.public_reference, state: a.state, starts_at: a.starts_at, ends_at: a.ends_at, currency: a.currency, total_amount: a.total_amount, payment_mode: a.payment_mode_snapshot, required_payment_amount: a.required_payment_amount, payment_due_at: a.payment_due_at, staff_name: staff.display_name, service_name: service.name, duration_minutes: service.duration_minutes, timezone: "UTC" });
    }
    if(name==="admin_data"||name==="admin_data_for_branch") {
      const actor=tokenUser(request);
      if(!actor?.roles.some(role=>role==="OWNER"||role==="ADMIN")||actor.aal!=="aal2")return send(response,403,{message:"Admin with MFA required"});
      if(args.p_branch_id&&args.p_branch_id!==branchId)return send(response,403,{message:"Branch access denied"});
      const rows=[...state.appointments.values()].map(a=>({...a,branch_id:branchId,branch_name:"E2E Branch",customer_name:a.customer_name,staff_name:staff.display_name,service_name:service.name,collected_amount:"0"}));
      const selected=args.p_section==="appointment"?rows.filter(a=>a.id===args.p_id):rows.filter(a=>!args.p_status||a.state===args.p_status);
      return send(response,200,{business:{...business,booking_approval_mode:state.approvalMode},date:new Date().toISOString().slice(0,10),page:1,total:selected.length,appointments:selected,pending:rows.filter(a=>a.state==="PENDING"),hours:[],payments:[],events:[...state.events.values()].filter(e=>e.appointment_id===args.p_id),stats:{today:rows.filter(a=>["AWAITING_PAYMENT","CONFIRMED","CHECKED_IN","IN_PROGRESS"].includes(a.state)).length,pending:rows.filter(a=>a.state==="PENDING").length,payment_expired:rows.filter(a=>a.state==="PAYMENT_EXPIRED").length,confirmed:rows.filter(a=>a.state==="CONFIRMED").length,completed:0,no_show:0,upcoming:rows.filter(a=>["AWAITING_PAYMENT","CONFIRMED","CHECKED_IN","IN_PROGRESS"].includes(a.state)).length}});
    }
    if(name==="home_service_data_for_branch") {
      const actor=tokenUser(request);
      if(args.p_area==="admin"&&(!actor?.roles.some(role=>role==="OWNER"||role==="ADMIN")||actor.aal!=="aal2"))return send(response,403,{message:"Admin with MFA required"});
      if(args.p_area==="staff"&&actor?.id!==staffUserId)return send(response,403,{message:"Assigned staff access required"});
      if(args.p_branch_id&&args.p_branch_id!==branchId)return send(response,403,{message:"Branch access denied"});
      const active=[...state.appointments.values()].filter(a=>a.fulfillment_mode==="HOME_SERVICE"&&["PENDING","ACCEPTED","AWAITING_PAYMENT","CONFIRMED","CHECKED_IN","IN_PROGRESS"].includes(a.state)&&(args.p_area!=="staff"||a.staff_id===staffId));
      const filtered=active.filter(a=>(!args.p_status||a.state===args.p_status)&&(!args.p_staff||a.staff_id===args.p_staff)&&(!args.p_date||a.starts_at.slice(0,10)===args.p_date));
      const appointments=filtered.slice((Number(args.p_page||1)-1)*25,Number(args.p_page||1)*25).map(a=>({id:a.id,public_reference:a.public_reference??"BK-TEST",customer_id:a.customer_id,staff_id:a.staff_id??staffId,branch_id:branchId,starts_at:a.starts_at,ends_at:a.ends_at,state:a.state,fulfillment_mode:"HOME_SERVICE",service_area_hint:a.service_area_hint,home_service_fee_snapshot:String(a.home_service_fee_snapshot??service.home_service_fee),total_amount:String(a.total_amount??0),currency:a.currency??"PHP",customer_name:a.customer_name,customer_email:args.p_area==="admin"?a.customer_email:null,customer_phone:args.p_area==="admin"?a.customer_phone:null,staff_name:staff.display_name,branch_name:"E2E Branch",timezone:"UTC",service_name:service.name,address:a.home_location?.address??"",latitude:String(a.home_location?.latitude??0),longitude:String(a.home_location?.longitude??0),landmark:a.home_location?.landmark??null,instructions:a.home_location?.instructions??null}));
      const staff_options=args.p_area==="admin"&&active.length?[{id:staffId,display_name:staff.display_name}]:[];
      return send(response,200,{active_count:active.length,total:filtered.length,page:Number(args.p_page||1),appointments,staff_options});
    }
    if (name === "owner_set_home_service_enabled") {
      const actor=tokenUser(request);
      if (actor?.id!==ownerId || actor.aal!=="aal2") return send(response,403,{message:"Owner access with MFA required"});
      state.homeEnabled=Boolean(args.p_enabled);return send(response,200,state.homeEnabled);
    }
    if (name === "home_service_trip_snapshot") {
      const actor=tokenUser(request);
      if (!actor || (args.p_area==="admin" && !actor.roles.some(role=>role==="OWNER"||role==="ADMIN")) || (args.p_area==="staff" && actor.id!==staffUserId)) return send(response,403,{message:"Trip access denied"});
      return send(response,200,[...state.trips.values()].filter(trip=>trip.expires_at>Date.now() && (args.p_area==="admin"||trip.staff_id===staffId)));
    }
    if (name === "home_service_trip_control") {
      const actor=tokenUser(request),appointment=state.appointments.get(args.p_appointment);
      if (actor?.id!==staffUserId || appointment?.staff_id!==staffId || appointment?.fulfillment_mode!=="HOME_SERVICE") return send(response,403,{message:"Assigned staff access required"});
      if (args.p_action==="STOP") {state.trips.delete(args.p_appointment);return send(response,200,{active:false});}
      if (!['ACCEPTED','AWAITING_PAYMENT','CONFIRMED','CHECKED_IN','IN_PROGRESS'].includes(appointment.state)) return send(response,403,{message:"Trip unavailable"});
      const trip={appointment_id:args.p_appointment,staff_id:staffId,latitude:args.p_latitude,longitude:args.p_longitude,updated_at:new Date().toISOString(),expires_at:Date.now()+90000};
      state.trips.set(args.p_appointment,trip);return send(response,200,{active:true});
    }
    if(name==="catalog_data"||name==="catalog_data_for_branch") {
      const actor=tokenUser(request);
      if(!actor?.roles.some(role=>role==="OWNER"||role==="ADMIN")||actor.aal!=="aal2")return send(response,403,{message:"Admin with MFA required"});
      if(args.p_branch_id&&args.p_branch_id!==branchId)return send(response,403,{message:"Branch access denied"});
      const isService=args.p_kind==="services";
      return send(response,200,{business,categories:[],services:isService?[{...service,active:true,published:true}]:[],staff:isService?[]:[{...staff,active:true,published:true,bookable:true}],service_options:[],staff_options:[],assignments:[],hours:[],exceptions:[],upcoming:[],branch_id:branchId,branch_name:"E2E Branch",branch_offerings:isService?[{service_id:serviceId,active:true,price_override:null,effective_price:service.price_amount,service_name:service.name}]:[],page:1,total:1});
    }
    if(name==="admin_save_home_area") {
      if(!tokenUser(request)?.roles.some(role=>role==="OWNER"||role==="ADMIN"))return send(response,403,{message:"Not authorized"});
      business.service_origin_latitude=args.p_latitude==null?null:Number(args.p_latitude);
      business.service_origin_longitude=args.p_longitude==null?null:Number(args.p_longitude);
      business.home_service_max_radius_km=args.p_radius_km==null?null:Number(args.p_radius_km);
      return send(response,200,true);
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
    if(name==="my_staff_workspace"||name==="my_staff_workspace_for_branch") {
      if(tokenUser(request)?.id!==staffUserId)return send(response,403,{message:"Not authorized"});
      if(args.p_branch_id&&args.p_branch_id!==branchId)return send(response,403,{message:"Branch access denied"});
      const rows=[...state.appointments.values()].map(a=>({...a,customer_name:a.customer_name,service_name:service.name}));
      const upcoming=rows.filter(a=>["CONFIRMED","AWAITING_PAYMENT","CHECKED_IN","IN_PROGRESS"].includes(a.state));
      return send(response,200,{staff_id:staffId,date:new Date().toISOString().slice(0,10),timezone:"UTC",hours:[],business_hours:[],exceptions:[],pending:rows.filter(a=>a.state==="PENDING"),today:[],confirmed:rows.filter(a=>a.state==="CONFIRMED"),upcoming,stats:{pending:rows.filter(a=>a.state==="PENDING").length,today:0,confirmed:0,upcoming:upcoming.length},branch_id:branchId,branch_name:"E2E Branch"});
    }
    if(name==="accept_appointment"||name==="transition_appointment") {
      const user=tokenUser(request),a=state.appointments.get(args.p_appointment);
      if(!a)return send(response,404,{message:"Appointment not found"});
      if(!(user?.roles.includes("OWNER")||(state.approvalMode==="STAFF_APPROVAL"&&user?.id===staffUserId)))return send(response,403,{message:"Not authorized"});
      if(name==="accept_appointment") {
        if(a.state!=="PENDING")return send(response,200,a.state);
        if([...state.appointments.values()].some(other=>other.id!==a.id&&other.starts_at===a.starts_at&&["CONFIRMED","AWAITING_PAYMENT"].includes(other.state)))return send(response,409,{message:"This time is no longer available"});
        a.state=a.payment_mode_snapshot==="PAY_AT_BUSINESS"?"CONFIRMED":"AWAITING_PAYMENT";a.payment_due_at=a.state==="AWAITING_PAYMENT"?new Date(Date.now()+30*60_000).toISOString():null;
      const eventId=randomUUID(); state.events.set(eventId,{id:eventId,appointment_id:a.id,to_state:a.state,reason:null});
        return send(response,200,a.state);
      }
      if(args.p_target==="DECLINED"&&a.state==="PENDING"&&String(args.p_reason??"").length>=10){a.state="DECLINED";a.decline_reason=args.p_reason;const eventId=randomUUID();state.events.set(eventId,{id:eventId,appointment_id:a.id,to_state:a.state,reason:a.decline_reason});return send(response,200,a.state)}
      return send(response,400,{message:"Invalid transition"});
    }
    return send(response, 404, { message: `Unhandled test RPC ${name}` });
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.split("/").at(-1), idFilter = url.searchParams.get("id"), id = idFilter?.replace(/^eq\./, ""), appointmentFilter=url.searchParams.get("appointment_id"), customerFilter=url.searchParams.get("customer_id"), auth = request.headers.authorization?.split(" ")[1] ?? "";
    const filterMatches=(filter,value)=>filter===`eq.${value}`||filter===`in.(${value})`||filter?.startsWith("in.(")&&filter.slice(4,-1).split(",").includes(value);
    let signedInCustomer=null;try{const sub=JSON.parse(Buffer.from(auth.split(".")[1]??"","base64url").toString()).sub;signedInCustomer=[customerId,otherCustomerId].includes(sub)?sub:null}catch{}
    let rows = [];
    if (table === "branches") {
      const actor=tokenUser(request);
      if(request.headers.apikey === "e2e-test-server-only-secret"||actor?.roles.some(role=>role==="OWNER"||role==="ADMIN"||role==="STAFF")) rows=[{id:branchId,name:branch.name,slug:branch.slug,is_default:true,is_active:true,address:branch.address,contact_email:branch.contact_email,contact_phone:branch.contact_phone,timezone:branch.timezone,home_service_enabled:state.homeEnabled}];
    }
    else if (table === "appointments") {
      const appointment = id ? currentAppointment(id) : signedInCustomer && filterMatches(customerFilter,signedInCustomer) ? [...state.appointments.values()].find(x => x.customer_id === signedInCustomer) : null;
      if (appointment && ((signedInCustomer && appointment.customer_id === signedInCustomer) || request.headers.apikey === "e2e-test-server-only-secret")) rows = [appointment];
    } else if (table === "appointment_items") {const appointment=[...state.appointments.values()].find(x=>filterMatches(appointmentFilter,x.id));if(appointment)rows=[{appointment_id:appointment.id,service_name_snapshot:service.name,duration_minutes:service.duration_minutes}]}
    else if (table === "branch_booking_settings") { if(request.headers.apikey === "e2e-test-server-only-secret") rows=[{branch_id:branchId,approval_mode:state.approvalMode}]; }
    else if (table === "staff_branch_assignments") { if(request.headers.apikey === "e2e-test-server-only-secret"&&url.searchParams.get("staff_id")?.replace(/^eq\./,"")===staffId) rows=[{staff_id:staffId,branch_id:branchId,active:true}]; }
    else if (table === "admin_branch_memberships") rows=[];
    else if (table === "appointment_home_locations") {const appointment=[...state.appointments.values()].find(x=>filterMatches(appointmentFilter,x.id));const currentUser=tokenUser(request);if(appointment?.home_location&&(signedInCustomer===appointment.customer_id||currentUser?.roles.includes("OWNER")||currentUser?.roles.includes("ADMIN")||request.headers.apikey === "e2e-test-server-only-secret"))rows=[appointment.home_location]}
    else if (table === "staff" && filterMatches(idFilter,staffId)) rows = [{ id: staffId, display_name: staff.display_name, auth_user_id: staffUserId, active: true }];
    else if (table === "customers") { const appointment=[...state.appointments.values()].find(x=>filterMatches(idFilter,x.customer_id)); if(appointment && request.headers.apikey === "e2e-test-server-only-secret") rows=[{ id: appointment.customer_id, display_name: appointment.customer_name, email: appointment.customer_email, auth_user_id: appointment.customer_id===customerId?customerId:null, phone: null }]; else if(signedInCustomer) rows = [{ id: signedInCustomer, display_name: signedInCustomer===customerId?"E2E Customer":"Other E2E Customer", email: signedInCustomer===customerId?customerEmail:"other-customer@example.test", phone: null, auth_user_id: signedInCustomer }]; }
    else if (table === "business_settings") rows = [{ name: business.name, timezone: "UTC",booking_approval_mode:state.approvalMode }];
    else if (table === "appointment_events") {const scoped=url.searchParams.get("appointment_id")?.replace(/^eq\./,"");const toState=url.searchParams.get("to_state")?.replace(/^eq\./,"");rows=id?(state.events.has(id)?[state.events.get(id)]:[]):[...state.events.values()].filter(e=>(!scoped||e.appointment_id===scoped)&&(!toState||e.to_state===toState));}
    else if (table === "user_roles") rows = [{ auth_user_id: ownerId, role: "OWNER" }];
    else if (table === "profiles") { const authId=url.searchParams.get("auth_user_id")?.replace(/^eq\./, ""); rows = authId ? [{ auth_user_id: authId, disabled_at: null }] : []; }
    else if (table === "payments") rows = [];
    return send(response, 200, rows, { "Content-Range": `0-${rows.length - 1}/${rows.length}` });
  }
  return send(response, 404, { message: "Not found" });
});
server.listen(port, "127.0.0.1");
