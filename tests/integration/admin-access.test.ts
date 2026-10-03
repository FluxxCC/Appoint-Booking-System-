import { beforeEach,it,expect,vi } from "vitest";
const mocks=vi.hoisted(()=>({guard:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock("@/lib/auth/access.server",()=>({requireArea:mocks.guard}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import { readAdmin } from "../../src/features/admin/data.server";
import { saveSettings,saveHours,saveClosure,saveAnnouncement,deleteClosure,deleteAnnouncement } from "../../src/features/admin/actions";
beforeEach(()=>{vi.clearAllMocks();mocks.guard.mockResolvedValue({supabase:{rpc:mocks.rpc,from:mocks.from}});mocks.rpc.mockResolvedValue({data:{business:null,date:"2026-10-01",page:1},error:null});});
it("guards every admin read before calling the database",async()=>{
  mocks.guard.mockRejectedValue(new Error("Denied"));
  for(const section of ["dashboard","appointment","customers","customer","payments","reports","announcements"] as const) await expect(readAdmin(section)).rejects.toThrow("Denied");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("guards every configuration mutation before parsing or database writes",async()=>{
  mocks.guard.mockRejectedValue(new Error("Denied"));
  for(const action of [saveSettings,saveHours,saveClosure,saveAnnouncement,deleteClosure,deleteAnnouncement]) await expect(action({},new FormData())).rejects.toThrow("Denied");
  expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.from).not.toHaveBeenCalled();
});
it("uses the authorized user client and validated filters",async()=>{
  await readAdmin("appointments",{status:"PENDING",q:"Jane",page:"2"});
  expect(mocks.guard).toHaveBeenCalledWith("admin");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_data",{p_section:"appointments",p_id:undefined,p_date:undefined,p_status:"PENDING",p_query:"Jane",p_page:2});
});
it("never turns a database failure into fabricated zero statistics",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{message:"offline"}});
  await expect(readAdmin("dashboard")).rejects.toThrow("could not be loaded");
});
it("rejects invalid hours before RPC and reports schedule conflicts safely",async()=>{
  const f=new FormData();f.set("intervals",JSON.stringify([{weekday:1,opens_at:"12:00",closes_at:"09:00"}]));
  expect((await saveHours({},f)).error).toContain("Closing");expect(mocks.rpc).not.toHaveBeenCalled();
  f.set("intervals","[]");mocks.rpc.mockResolvedValue({error:{message:"Outside business hours"}});
  expect((await saveHours({},f)).error).toContain("active appointment");
});
