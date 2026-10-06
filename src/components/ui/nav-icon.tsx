export type IconName =
  | "home"
  | "dashboard"
  | "services"
  | "team"
  | "calendar"
  | "appointments"
  | "availability"
  | "profile"
  | "customers"
  | "access"
  | "announcements"
  | "settings"
  | "closures"
  | "appearance"
  | "payments"
  | "notifications"
  | "reports";

export function NavIcon({ name }: { name: IconName }) {
  const shared = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" {...shared}>
    {name === "home" && <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>}
    {name === "dashboard" && <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/></>}
    {name === "services" && <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>}
    {name === "team" && <><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a2.8 2.8 0 0 1 0 5.5M17 14.5a5 5 0 0 1 3.5 4.8"/></>}
    {name === "calendar" && <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h2M13 14h2M8 17h2"/></>}
    {name === "appointments" && <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8.5 10h7M8.5 14h7M8.5 18h4"/></>}
    {name === "availability" && <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2M8 2.8 6.5 4M16 2.8 17.5 4"/></>}
    {name === "profile" && <><circle cx="12" cy="8" r="3.3"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></>}
    {name === "customers" && <><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 7.5a2.8 2.8 0 0 1 0 5.5M17 15a5 5 0 0 1 3.5 4"/></>}
    {name === "access" && <><path d="M12 3 20 6v5.5c0 4.7-3.2 7.8-8 9.5-4.8-1.7-8-4.8-8-9.5V6z"/><path d="m8.5 12 2.2 2.2 4.8-4.8"/></>}
    {name === "announcements" && <><path d="M4 10v4h3l10 5V5L7 10zM7 14l2 6h4l-2.1-4.9M20 9l1.5-1.5M20 15l1.5 1.5"/></>}
    {name === "settings" && <><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 13.5 1.1.8-1.5 2.6-1.3-.5a7.7 7.7 0 0 1-1.5.9L16 18.7h-3l-.3-1.4a7.7 7.7 0 0 1-1.5-.9l-1.3.5-1.5-2.6 1.1-.8a7.3 7.3 0 0 1 0-1.8l-1.1-.8 1.5-2.6 1.3.5a7.7 7.7 0 0 1 1.5-.9L13 6.5h3l.3 1.4a7.7 7.7 0 0 1 1.5.9l1.3-.5 1.5 2.6-1.1.8a7.3 7.3 0 0 1-.1 1.8Z" transform="translate(-1 -0.6)"/></>}
    {name === "closures" && <><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17M9 13l6 5M15 13l-6 5"/></>}
    {name === "appearance" && <><path d="M12 3.5a8.5 8.5 0 1 0 0 17h1.1a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.1-2.5H18a2.5 2.5 0 0 0 2.5-2.5A8.5 8.5 0 0 0 12 3.5Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7.5" r=".8"/><circle cx="15" cy="7.8" r=".8"/></>}
    {name === "payments" && <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 14h4M7 16.5h2"/></>}
    {name === "notifications" && <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>}
    {name === "reports" && <><path d="M4 20V4M4 20h17"/><rect x="7" y="12" width="3" height="5" rx=".5"/><rect x="13" y="8" width="3" height="9" rx=".5"/><rect x="19" y="5" width="2" height="12" rx=".5"/></>}
  </svg>;
}
