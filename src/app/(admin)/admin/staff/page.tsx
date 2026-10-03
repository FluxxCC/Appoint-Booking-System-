import {CatalogList} from "@/features/catalog/pages";
import type {SearchParams} from "@/features/admin/data.server";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <CatalogList kind="staff" search={await searchParams}/>;}

