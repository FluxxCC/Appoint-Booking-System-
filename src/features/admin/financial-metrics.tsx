import { readAdmin } from "./data.server";
import type { AdminData } from "./types";
import { PageHeading, Card, Empty, Status, Table } from "./ui";
import { money } from "./format";

function FinancialTrendChart({currency,months}:{currency:string;months:NonNullable<AdminData["financial_trend"]>[number]["months"]}) {
  const values=months.map(item=>({collected:BigInt(item.collected),refunded:BigInt(item.refunded)}));
  const maximum=values.reduce((max,value)=>{const peak=value.collected>value.refunded?value.collected:value.refunded;return peak>max?peak:max;},0n)||1n;
  const yFor=(value:bigint)=>222-Number(value*1000n/maximum)/1000*190;
  const compact=(value:bigint)=>{
    const digits=BigInt(new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2);
    const whole=value/(10n**digits);
    if(whole>=1_000_000n)return `${currency} ${(Number(whole)/1_000_000).toFixed(whole>=10_000_000n?0:1)}m`;
    if(whole>=10_000n)return `${currency} ${(Number(whole)/1_000).toFixed(whole>=100_000n?0:1)}k`;
    return money((value/1000n*1000n).toString(),currency);
  };
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Verified collections and processed refunds · {currency}</p><div className="flex gap-4 text-xs font-medium"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm bg-accent"/>Collected</span><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-sm bg-warning"/>Refunded</span></div></div>
    <svg role="img" aria-label={`Monthly collected and refunded amounts in ${currency}`} viewBox="0 0 780 280" className="h-auto w-full overflow-visible">
      {[0,1,2,3,4].map(tick=>{const y=32+tick*47.5;const amount=maximum*BigInt(4-tick)/4n;return <g key={tick}><line x1="72" y1={y} x2="770" y2={y} stroke="currentColor" className="text-line" strokeDasharray={tick===4?undefined:"3 5"}/><text x="65" y={y+4} textAnchor="end" className="fill-muted" fontSize="10">{compact(amount)}</text></g>;})}
      {months.map((item,index)=>{const x=83+index*57.2;const collected=values[index].collected;const refunded=values[index].refunded;const collectedY=yFor(collected);const refundedY=yFor(refunded);const label=new Intl.DateTimeFormat("en",{month:"short",timeZone:"UTC"}).format(new Date(`${item.month}-01T00:00:00Z`));return <g key={item.month}><rect x={x} y={collectedY} width="17" height={Math.max(222-collectedY,1)} rx="4" className="fill-accent"><title>{`${label}: ${money(item.collected,currency)} collected`}</title></rect><rect x={x+20} y={refundedY} width="17" height={Math.max(222-refundedY,1)} rx="4" className="fill-warning"><title>{`${label}: ${money(item.refunded,currency)} refunded`}</title></rect><text x={x+18} y="246" textAnchor="middle" className="fill-muted" fontSize="10">{label}</text></g>;})}
    </svg>
  </div>;
}

export async function FinancialMetricsPage() {
  const {data,branchContext}=await readAdmin("reports");
  const statuses=data.by_status??[], balances=data.money??[];
  const appointmentTotal=statuses.reduce((total,row)=>total+row.count,0);
  const grouped=(select:(row:NonNullable<AdminData["money"]>[number])=>string)=>balances.length?balances.map(row=>select(row)).join(" · "):"—";
  const gross=grouped(row=>money(row.collected,row.currency));
  const refunds=grouped(row=>money(row.refunded,row.currency));
  const net=grouped(row=>money((BigInt(row.collected)-BigInt(row.refunded)).toString(),row.currency));
  const outstanding=grouped(row=>money(row.outstanding,row.currency));
  const metrics=[["Gross collected",gross,"Verified customer payments, before refunds"],["Refunded",refunds,"Successfully processed refunds"],["Net cash collected",net,"Gross payments less successful refunds"],["Outstanding",outstanding,"Unpaid balances on eligible appointments"]];
  return <>
    <PageHeading title="Financial metrics" description={`${data.business?.name??"Your business"} · ${branchContext.selectedBranchName??branchContext.allLabel}. Track verified cash collected, refunds, and outstanding appointment balances.`}/>
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([title,value,detail])=><section key={title} className="surface-card min-w-0 rounded-2xl p-5"><p className="text-sm font-medium text-muted">{title}</p><p className="mt-3 break-words text-2xl font-semibold tracking-tight text-ink">{value}</p><p className="mt-2 text-xs leading-5 text-muted">{detail}</p></section>)}</div>
    <div className="mb-6 grid gap-6">{data.financial_trend?.length?data.financial_trend.map(series=><Card key={series.currency} title="Money collected · last 12 months"><FinancialTrendChart currency={series.currency} months={series.months}/></Card>):<Card title="Money collected · last 12 months"><Empty>{data.financial_trend_unavailable?"Monthly trend data is unavailable right now. Your financial totals are still available below.":"No verified payment activity to chart yet."}</Empty></Card>}</div>
    <div className="space-y-6"><Card title="Collections and balances">{balances.length?<Table headers={["Currency","Gross collected","Successful refunds","Net cash collected","Outstanding"]}>{balances.map(m=><tr key={m.currency}><td className="font-medium">{m.currency}</td><td>{money(m.collected,m.currency)}</td><td>{money(m.refunded,m.currency)}</td><td className="font-medium">{money((BigInt(m.collected)-BigInt(m.refunded)).toString(),m.currency)}</td><td>{money(m.outstanding,m.currency)}</td></tr>)}</Table>:<Empty>0 collections, refunds and outstanding balances.</Empty>}<details className="mt-4 rounded-xl bg-canvas px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-ink">How to read these figures</summary><p className="mt-3 text-sm leading-6 text-muted">Collections are verified cash receipts, including deposits and late payments; they do not represent profit or necessarily all earned service revenue. Refund totals include successful refunds only. Outstanding is the unpaid appointment price on accepted, active, completed and no-show appointments, before refunds. Pending, declined, expired and cancelled requests are excluded; refunds do not automatically create a new debt. Figures remain grouped by currency.</p></details></Card>
      <Card title={`Appointments · ${appointmentTotal.toLocaleString()} total`}><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statuses.filter(row=>row.count>0).map(row=>{const share=appointmentTotal?Math.round(row.count/appointmentTotal*100):0;return <div key={row.state} className="rounded-xl border border-line p-4"><div className="flex items-center justify-between gap-3"><Status value={row.state}/><span className="text-sm font-semibold tabular-nums">{row.count.toLocaleString()}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-accent" style={{width:`${share}%`}}/></div><p className="mt-2 text-xs text-muted">{share}% of all appointments</p></div>;})}{!appointmentTotal&&<Empty>0 appointments recorded.</Empty>}</div></Card>
    </div>
  </>;
}
