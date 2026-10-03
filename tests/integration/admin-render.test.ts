import {beforeEach,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {mkdir,readFile,readdir,writeFile} from "node:fs/promises";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/features/admin/data.server",()=>({readAdmin:mocks.read}));
vi.mock("next/navigation",()=>({usePathname:()=>"/admin",notFound:()=>{throw new Error("NOT_FOUND");}}));
vi.mock("@/features/admin/actions",()=>({saveSettings:vi.fn(),saveApprovalMode:vi.fn(),saveHours:vi.fn(),saveClosure:vi.fn(),saveAnnouncement:vi.fn(),deleteClosure:vi.fn(),deleteAnnouncement:vi.fn()}));
vi.mock("@/features/appointments/actions",()=>({acceptAsAdmin:vi.fn(),declineAsAdmin:vi.fn(),advanceAsAdmin:vi.fn()}));
vi.mock("@/features/auth/actions",()=>({logoutAction:vi.fn()}));
import {DashboardPage,SettingsPage,AppointmentsPage,CalendarPage,ClosuresPage,AnnouncementsPage,CustomersPage,PaymentsPage,ReportsPage,AppointmentPage,CustomerPage} from "../../src/features/admin/pages";
import {AppShell} from "../../src/components/layout/app-shell";
const empty={business:null,date:"2026-09-30",page:1,total:0,hours:[],appointments:[],schedule:[],pending:[],upcoming:[],customers:[],payments:[],announcements:[],closures:[],activity:[],by_status:[],money:[],stats:{today:0,pending:0,confirmed:0,completed:0,no_show:0,upcoming:0}};
const principal={userId:"00000000-0000-0000-0000-000000000001",email:"owner@example.test",roles:["OWNER" as const],profileActive:true,staffActive:false,aal:"aal2" as const};
beforeEach(()=>{mocks.read.mockResolvedValue({data:empty,filters:{q:"",status:"",date:"",page:1}});});
it("renders every empty admin view without fabricating records",async()=>{
  for(const page of [()=>DashboardPage(),()=>SettingsPage(),()=>AppointmentsPage({search:{}}),()=>CalendarPage({search:{}}),()=>ClosuresPage({search:{}}),()=>AnnouncementsPage({search:{}}),()=>CustomersPage({search:{}}),()=>PaymentsPage({search:{}}),()=>ReportsPage()]) {
    const html=renderToStaticMarkup(await page());expect(html).toContain("<h1");expect(html).not.toContain("NaN");
  }
  const dashboard = renderToStaticMarkup(await DashboardPage());
  expect(dashboard).toContain("No requests need review right now.");
  expect(dashboard).toContain("No appointments scheduled for today.");
  expect(dashboard).toContain("No upcoming reservations yet.");
});
it("shows not found for absent appointment and customer records",async()=>{
  await expect(AppointmentPage({id:principal.userId})).rejects.toThrow("NOT_FOUND");
  await expect(CustomerPage({id:principal.userId,search:{}})).rejects.toThrow("NOT_FOUND");
});
it("renders database-backed counts and escapes customer-controlled text",async()=>{
  mocks.read.mockResolvedValue({data:{...empty,stats:{...empty.stats,today:37},business:{name:"<script>alert(1)</script>",timezone:"Asia/Manila"}},filters:{}});
  const html=renderToStaticMarkup(await DashboardPage());
  expect(html).toContain(">37</div>");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>alert");
});
it("can render isolated visual QA fixtures outside application routes",async()=>{
  if(process.env.ADMIN_VISUAL_QA!=="1") return;
  const styles=(await readdir('.next/static/chunks')).filter(f=>f.endsWith('.css'));
  const css=(await Promise.all(styles.map(f=>readFile(`.next/static/chunks/${f}`,'utf8')))).join('\n');
  await mkdir('out/phase4-preview',{recursive:true});
  for(const [name,component] of [['dashboard',DashboardPage],['settings',SettingsPage]] as const){
    const html=renderToStaticMarkup(AppShell({area:'admin',principal,children:await component()}));
    await writeFile(`out/phase4-preview/${name}.html`,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phase 4 visual QA — ${name}</title><style>${css}</style></head><body>${html}</body></html>`);
  }
});
