import Link from "next/link";
import { formatBusinessTime } from "@/lib/time";
import { label, money } from "./format";
import type { Appointment, Payment } from "./types";
import { StatusBadge } from "@/components/ui/status-badge";
import { Children, cloneElement, isValidElement } from "react";

export const inputClass="field-control text-sm";
export const buttonClass="button-primary disabled:cursor-not-allowed disabled:opacity-50";
export function PageHeading({title,description,children}:{title:string;description:string;children?:React.ReactNode}) { return <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow mb-2">Workspace</p><h1 className="display-type text-3xl sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{description}</p></div>{children}</div>; }
export function Card({title,children}:{title:string;children:React.ReactNode}) { return <section className="surface-card min-w-0 p-5 sm:p-7"><h2 className="mb-5 border-b border-line pb-4 text-lg font-semibold tracking-tight text-ink">{title}</h2>{children}</section>; }
export function Empty({children="No records to display."}:{children?:React.ReactNode}) { return <div className="rounded-2xl border border-dashed border-line bg-canvas/60 px-5 py-8 text-center text-sm leading-6 text-muted">{children}</div>; }
export function Status({value}:{value:string}) { return <StatusBadge value={value}>{label(value)}</StatusBadge>; }
export function Table({headers,children}:{headers:string[];children:React.ReactNode}) {
  const rows = Children.map(children, row => {
    if (!isValidElement<{children?:React.ReactNode}>(row)) return row;
    const cells = Children.map(row.props.children, (cell,index) => isValidElement(cell) ? cloneElement(cell as React.ReactElement<{ "data-label"?: string }>, { "data-label": headers[index] }) : cell);
    return cloneElement(row, {}, cells);
  });
  return <div className="responsive-table overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full text-left text-sm"><thead className="bg-accent-soft/60 text-xs text-muted"><tr>{headers.map(h=><th key={h} scope="col" className="whitespace-nowrap px-4 py-3.5 font-semibold">{h}</th>)}</tr></thead><tbody className="divide-y divide-line [&_td]:px-4 [&_td]:py-4 [&_td]:align-top">{rows}</tbody></table></div>;
}
export function Time({value,zone}:{value?:string|null;zone:string}) { return value?<time dateTime={value} className="whitespace-nowrap">{formatBusinessTime(value,zone)}</time>:<span>—</span>; }
export function AppointmentTable({rows,zone,emptyMessage="No appointments match this view."}:{rows:Appointment[];zone:string;emptyMessage?:string}) {
  if (!rows.length) return <Empty>{emptyMessage}</Empty>;
  return <Table headers={["Customer / service","Staff","Start / end","Location","Status"]}>{rows.map(a=><tr key={a.id}><td><Link className="font-medium text-accent-dark underline-offset-4 hover:underline" href={`/admin/appointments/${a.id}`}>{a.customer_name}</Link><p className="mt-1 text-xs text-muted">{a.service_name}</p></td><td>{a.staff_name}</td><td><Time value={a.starts_at} zone={zone}/><p className="mt-1 text-xs text-muted"><Time value={a.ends_at} zone={zone}/></p></td><td>{a.fulfillment_mode==="HOME_SERVICE"?<span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-dark">Home Service</span>:"At business"}</td><td><Status value={a.state}/>{a.state==="PAYMENT_EXPIRED"&&<p className="mt-1 text-xs text-muted">Time released</p>}</td></tr>)}</Table>;
}
export function PaymentsTable({rows,zone}:{rows:Payment[];zone:string}) {
  if (!rows.length) return <Empty>No payment records yet.</Empty>;
  return <Table headers={["Customer / booking","Amount","Payment status","Date","Refunds"]}>{rows.map(p=><tr key={p.id}>
    <td><p className="font-medium text-ink">{p.customer_name}</p><p className="mt-1 text-xs text-muted">{p.customer_kind??"Booking"}{p.public_reference?` · ${p.public_reference}`:""}</p>{p.appointment_id&&<Link className="mt-2 inline-flex text-xs font-medium text-accent-dark underline-offset-4 hover:underline" href={`/admin/appointments/${p.appointment_id}`}>View appointment</Link>}</td>
    <td><p className="font-semibold tabular-nums text-ink">{money(p.amount,p.currency)}</p><p className="mt-1 text-xs text-muted">{label(p.payment_mode_snapshot??"")}</p></td>
    <td><div className="flex flex-wrap items-center gap-2"><Status value={p.state}/>{p.exception_reason&&<span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">Review needed</span>}</div><details className="mt-2 max-w-xs text-xs"><summary className="cursor-pointer font-medium text-accent-dark">Payment details</summary><dl className="mt-2 space-y-2 rounded-lg bg-canvas p-3 text-muted"><div><dt className="font-medium text-ink">Provider</dt><dd>{p.provider === "paymongo" ? "PayMongo" : p.provider}</dd></div>{p.appointment_state&&<div><dt className="font-medium text-ink">Appointment</dt><dd><Status value={p.appointment_state}/></dd></div>}{p.provider_reference&&<div><dt className="font-medium text-ink">Provider reference</dt><dd className="break-all">{p.provider_reference}</dd></div>}{p.exception_reason&&<div><dt className="font-medium text-danger">Reconciliation note</dt><dd className="break-words text-danger">{p.exception_reason}</dd></div>}</dl></details></td>
    <td><Time value={p.paid_at??p.created_at} zone={zone}/><p className="mt-1 text-xs text-muted">{p.paid_at?"Paid":"Created"}</p></td>
    <td>{p.refunds?.length?p.refunds.map((r,i)=><p key={i} className="mb-1 last:mb-0 capitalize">{label(r.state)} · {money(r.amount,p.currency)}</p>):<span className="text-sm text-muted">None recorded</span>}</td>
  </tr>)}</Table>;
}
export function Pagination({path,page,total,query={}}:{path:string;page:number;total:number;query?:Record<string,string>}) {
  const url=(p:number)=>`${path}?${new URLSearchParams({...query,page:String(p)})}`;
  return <nav aria-label="Pagination" className="mt-5 flex flex-wrap items-center justify-between gap-4 text-sm"><p className="text-muted">{total} record{total===1?"":"s"} · Page {page} of {Math.max(1,Math.ceil(total/25))}</p><div className="flex gap-4">{page>1&&<Link className="font-medium text-accent-dark" href={url(page-1)}>Previous</Link>}{page*25<total&&<Link className="font-medium text-accent-dark" href={url(page+1)}>Next</Link>}</div></nav>;
}
