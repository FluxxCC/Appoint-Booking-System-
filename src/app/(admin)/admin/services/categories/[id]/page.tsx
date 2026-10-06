import {CategoryEditor} from "@/features/catalog/pages";

export default async function Page({params}:{params:Promise<{id:string}>}){
 return <CategoryEditor id={(await params).id}/>;
}
