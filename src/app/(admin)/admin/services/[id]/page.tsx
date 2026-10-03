import {CatalogEditor} from "@/features/catalog/pages";
export default async function Page({params}:{params:Promise<{id:string}>}){return <CatalogEditor kind="services" id={(await params).id}/>;}

