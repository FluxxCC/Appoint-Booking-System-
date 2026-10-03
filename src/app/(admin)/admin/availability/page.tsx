import {readCatalog} from "@/features/catalog/data.server";
import {PageHeading,Empty} from "@/features/admin/ui";
import {AvailabilityInspector} from "@/features/availability/inspector";
function localDate(zone:string){return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export default async function Page(){const {data}=await readCatalog("services");return <><PageHeading title="Availability inspection" description="Check the database-calculated times the future booking flow can request. Results are advisory; booking and staff acceptance revalidate against current records."/>{data.business&&data.services?.length?<AvailabilityInspector services={data.service_options} staff={data.staff_options} initialDate={localDate(data.business.timezone)}/>:<Empty>Configure business settings and add a service before inspecting availability.</Empty>}</>;}
