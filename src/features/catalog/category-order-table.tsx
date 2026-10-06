"use client";

import Link from "next/link";
import {useEffect,useRef,useState,useTransition} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import {Table} from "@/features/admin/ui";
import {reorderCategories} from "./actions";
import type {Category} from "./types";

type Notice={kind:"success"|"error";text:string};
type DragState={id:string;pointerId:number;original:Category[];lastPlacement:string|null};

function sameOrder(a:Category[],b:Category[]){return a.length===b.length&&a.every((item,index)=>item.id===b[index]?.id);}

export function CategoryOrderTable({categories}:{categories:Category[]}){
 const [items,setItems]=useState(categories);
 const [savedItems,setSavedItems]=useState(categories);
 const [draggingId,setDraggingId]=useState<string|null>(null);
 const [notice,setNotice]=useState<Notice|null>(null);
 const [pending,startTransition]=useTransition();
 const itemsRef=useRef(items);
 const dragRef=useRef<DragState|null>(null);
 const hasUnsavedOrder=!sameOrder(savedItems,items);

 function replaceItems(next:Category[]){itemsRef.current=next;setItems(next);}

 useEffect(()=>{
  if(!dragRef.current){
   replaceItems(categories);
   setSavedItems(categories);
   setNotice(null);
  }
 },[categories]);

 function saveOrder(){
  if(pending||!hasUnsavedOrder)return;
  const next=itemsRef.current;
  setNotice(null);
  startTransition(async()=>{
   const result=await reorderCategories(next.map(category=>category.id));
   if(result.error){setNotice({kind:"error",text:result.error});return;}
   setSavedItems(next);
   setNotice({kind:"success",text:result.success??"Category order saved."});
  });
 }

 function startDrag(event:ReactPointerEvent<HTMLButtonElement>,id:string){
  if(pending||event.button!==0)return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  dragRef.current={id,pointerId:event.pointerId,original:itemsRef.current,lastPlacement:null};
  setDraggingId(id);
  setNotice(null);
 }

 function moveDrag(event:ReactPointerEvent<HTMLButtonElement>,id:string){
  const drag=dragRef.current;
  if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;
  const row=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>("[data-category-id]");
  const targetId=row?.dataset.categoryId;
  if(!row||!targetId||targetId===id)return;
  const after=event.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;
  const placement=`${targetId}:${after?"after":"before"}`;
  if(drag.lastPlacement===placement)return;
  const current=itemsRef.current;
  const sourceIndex=current.findIndex(category=>category.id===id);
  const targetIndex=current.findIndex(category=>category.id===targetId);
  if(sourceIndex<0||targetIndex<0)return;
  const next=[...current];
  const [moving]=next.splice(sourceIndex,1);
  const insertAt=next.findIndex(category=>category.id===targetId)+(after?1:0);
  next.splice(insertAt,0,moving);
  drag.lastPlacement=placement;
  replaceItems(next);
 }

 function finishDrag(event:ReactPointerEvent<HTMLButtonElement>,id:string){
  const drag=dragRef.current;
  if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;
  const next=itemsRef.current;
  dragRef.current=null;
  setDraggingId(null);
  if(!sameOrder(drag.original,next))setNotice({kind:"success",text:"Order changed. Save order to update the site."});
 }

 function cancelDrag(event:ReactPointerEvent<HTMLButtonElement>,id:string){
  const drag=dragRef.current;
  if(!drag||drag.id!==id||drag.pointerId!==event.pointerId)return;
  dragRef.current=null;
  replaceItems(drag.original);
  setDraggingId(null);
 }

 function moveBy(id:string,offset:-1|1){
  if(pending||dragRef.current)return;
  const original=itemsRef.current;
  const index=original.findIndex(category=>category.id===id);
  const target=index+offset;
  if(index<0||target<0||target>=original.length)return;
  const next=[...original];
  [next[index],next[target]]=[next[target],next[index]];
  replaceItems(next);
  setNotice({kind:"success",text:`Moved to position ${target+1}. Save order to update the site.`});
 }

 return <>
  <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-line bg-canvas/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
   <div>
    <p className="font-semibold text-ink">Display order</p>
    <p className="mt-1 text-sm leading-5 text-muted">Drag the handle beside Edit, or focus it and use the arrow keys. Changes go live after you save.</p>
   </div>
   <div className="flex flex-wrap items-center gap-2 sm:justify-end">
    {hasUnsavedOrder&&<button type="button" disabled={pending} onClick={()=>{replaceItems(savedItems);setNotice(null);}} className="button-secondary inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm">Discard</button>}
    <button type="button" disabled={!hasUnsavedOrder||pending} onClick={saveOrder} className="button-primary inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">{pending?"Saving…":"Save order"}</button>
   </div>
  </div>
  <Table headers={["Position","Category","Status","Customer visibility","Actions"]}>
   {items.map((category,index)=><tr key={category.id} data-category-id={category.id} className={draggingId===category.id?"bg-accent-soft/60 opacity-70":""}>
    <td><span className="inline-grid size-8 place-items-center rounded-lg bg-canvas text-sm font-semibold text-ink">{index+1}</span></td>
    <td><span className="font-medium text-ink">{category.name}</span></td>
    <td><span className={category.active?"text-success":"text-muted"}>{category.active?"Active":"Inactive"}</span></td>
    <td><span className={category.published?"text-success":"text-muted"}>{category.published?"Visible":"Hidden"}</span></td>
    <td><div className="flex items-center gap-2 sm:justify-end">
     <Link className="button-secondary inline-flex min-h-10 items-center whitespace-nowrap px-3 py-2 text-sm" href={`/admin/services/categories/${category.id}`}>Edit</Link>
     <button type="button" aria-label={`Reorder ${category.name}. Use the up or down arrow keys to change its position.`} title="Drag to reorder" disabled={pending} className="touch-none cursor-grab select-none rounded-lg p-2.5 text-muted hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50" onPointerDown={event=>startDrag(event,category.id)} onPointerMove={event=>moveDrag(event,category.id)} onPointerUp={event=>finishDrag(event,category.id)} onPointerCancel={event=>cancelDrag(event,category.id)} onKeyDown={event=>{if(event.key==="ArrowUp"){event.preventDefault();moveBy(category.id,-1);}else if(event.key==="ArrowDown"){event.preventDefault();moveBy(category.id,1);}}}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
     </button>
    </div></td>
   </tr>)}
  </Table>
  <div className="mt-3 min-h-6 text-sm" aria-live="polite" role="status">
   {notice&&<span className={notice.kind==="error"?"text-danger":"text-success"}>{notice.text}</span>}
  </div>
 </>;
}
