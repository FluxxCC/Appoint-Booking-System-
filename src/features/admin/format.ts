import { formatMoney } from "@/lib/money";

export function money(amount: string|number, currency: string) {
  const value=BigInt(amount);
  if (value<=BigInt(Number.MAX_SAFE_INTEGER) && value>=BigInt(Number.MIN_SAFE_INTEGER)) return formatMoney(Number(value),currency);
  const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits ?? 2;
  const divisor=10n**BigInt(digits);
  return `${currency} ${(value/divisor).toLocaleString("en")}${digits ? "."+(value%divisor).toString().padStart(digits,"0") : ""}`;
}
export function localInput(instant: string, timezone: string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(instant));
  const get=(type:string)=>parts.find(p=>p.type===type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function shiftDate(date:string,days:number) { const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function label(value:string) { return value.toLowerCase().replaceAll("_"," "); }
