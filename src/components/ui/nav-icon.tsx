type IconName = "home" | "services" | "team" | "calendar" | "appointments" | "profile";

export function NavIcon({ name }: { name: IconName }) {
  const shared = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
    {name === "home" && <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></>}
    {name === "services" && <><path d="M4 5h16M4 12h16M4 19h16"/><path d="M7 3v4M17 10v4M10 17v4"/></>}
    {name === "team" && <><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M19 5a3 3 0 0 1 0 6M21 20a5 5 0 0 0-2-4"/></>}
    {name === "calendar" && <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>}
    {name === "appointments" && <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>}
    {name === "profile" && <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>}
  </svg>;
}
