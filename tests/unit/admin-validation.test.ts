import { describe,it,expect } from "vitest";
import { settingsSchema,hoursSchema,closureSchema,announcementSchema,filtersSchema } from "../../src/features/admin/schemas";
import { localInput,money,shiftDate } from "../../src/features/admin/format";
const settings={name:"Studio",description:"",contact_email:"studio@example.test",contact_phone:"+639171234567",address:"",timezone:"Asia/Manila",currency:"PHP",scheduling_interval_minutes:15,default_buffer_minutes:5,minimum_notice_minutes:60,maximum_advance_days:90,payment_window_minutes:30,require_staff_approval:true,guest_booking_enabled:true,customer_registration_enabled:true,terms:"Policy terms",refund_policy:"Refund requests are reviewed individually by the business.",expected_updated_at:""};
describe("business configuration",()=>{
  it("validates business and scheduling settings",()=>{
    expect(settingsSchema.safeParse(settings).success).toBe(true);
    for(const patch of [{name:""},{contact_email:"invalid"},{timezone:"Invalid/Zone"},{currency:"ZZZ"},{scheduling_interval_minutes:0},{default_buffer_minutes:-1},{payment_window_minutes:1441},{minimum_notice_minutes:1500,maximum_advance_days:1},{require_staff_approval:false},{refund_policy:""}]) expect(settingsSchema.safeParse({...settings,...patch}).success).toBe(false);
  });
  it("allows closed days, split shifts and adjacent intervals",()=>{
    expect(hoursSchema.safeParse([]).success).toBe(true);
    expect(hoursSchema.safeParse([{weekday:1,opens_at:"09:00",closes_at:"12:00"},{weekday:1,opens_at:"12:00",closes_at:"18:00"}]).success).toBe(true);
  });
  it("rejects overlap, overnight and invalid times",()=>{
    for(const rows of [[{weekday:1,opens_at:"09:00",closes_at:"12:00"},{weekday:1,opens_at:"11:00",closes_at:"18:00"}],[{weekday:1,opens_at:"18:00",closes_at:"09:00"}],[{weekday:7,opens_at:"09:00",closes_at:"18:00"}],[{weekday:1,opens_at:"24:00",closes_at:"25:00"}]]) expect(hoursSchema.safeParse(rows).success).toBe(false);
  });
  it("validates full and partial closures",()=>{
    const c={date:"2026-10-02",full_day:true,start:"",end:"",reason:"Staff event"};
    expect(closureSchema.safeParse(c).success).toBe(true);
    expect(closureSchema.safeParse({...c,full_day:false,start:"13:00",end:"15:00"}).success).toBe(true);
    for(const patch of [{date:"2026-02-30"},{reason:""},{full_day:false},{full_day:false,start:"15:00",end:"13:00"}]) expect(closureSchema.safeParse({...c,...patch}).success).toBe(false);
  });
  it("validates announcement lengths and display order",()=>{
    const a={id:"",title:"Holiday",body:"We will be closed.",published:true,start:"",end:""};
    expect(announcementSchema.safeParse(a).success).toBe(true);
    for(const patch of [{title:""},{body:""},{id:"bad"},{start:"invalid"},{start:"2026-10-02T15:00",end:"2026-10-02T13:00"}]) expect(announcementSchema.safeParse({...a,...patch}).success).toBe(false);
  });
  it("bounds all list filters",()=>{
    expect(filtersSchema.parse({page:"2"}).page).toBe(2);
    for(const patch of [{page:0},{page:10001},{status:"HACK"},{date:"2026-02-30"},{q:"x".repeat(101)}]) expect(filtersSchema.safeParse(patch).success).toBe(false);
  });
  it("formats business wall times independently of runtime zone",()=>{
    expect(localInput("2026-10-01T23:30:00Z","Asia/Manila")).toBe("2026-10-02T07:30");
    expect(shiftDate("2026-12-31",1)).toBe("2027-01-01");
  });
  it("keeps aggregate minor units precise beyond safe JS integers",()=>{
    expect(money("9007199254740993123","USD")).toBe("USD 90,071,992,547,409,931.23");
    expect(money("1234","JPY")).toContain("1,234");
  });
});
