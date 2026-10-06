import type {PublicWebsite} from "@/features/public-site/model";

type Announcement=PublicWebsite["announcements"][number];

export function AnnouncementBanner({announcement,area="public"}:{announcement:Announcement|null;area?:"public"|"account"}){
 if(!announcement)return null;
 const offset=area==="account"?"top-[76px]":"top-[72px]";
 return <aside aria-label="Business announcement" className={`sticky ${offset} z-30 border-b border-line bg-accent-soft/95 px-4 py-3 text-ink shadow-sm backdrop-blur sm:px-6`}>
  <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-center gap-x-2 gap-y-1 text-center text-sm leading-5">
   <strong className="font-semibold text-accent-dark">{announcement.title}</strong>
   <span>{announcement.body}</span>
  </div>
 </aside>;
}
