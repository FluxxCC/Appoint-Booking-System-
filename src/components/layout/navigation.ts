import type { Area } from "@/lib/auth/access";

export const navigation: Record<Area, readonly { label: string; href: string; description: string }[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", description: "See today’s operations and requests that need review." },
    { label: "Appointments", href: "/admin/appointments", description: "Review requests and manage appointment records." },
    { label: "Calendar", href: "/admin/calendar", description: "See the team’s daily schedule." },
    { label: "Services", href: "/admin/services", description: "Manage your service catalog, pricing and booking rules." },
    { label: "Staff", href: "/admin/staff", description: "Manage staff profiles, assignments and schedules." },
    { label: "Administrator access", href: "/admin/access", description: "Owners manage ADMIN invitations and access." },
    { label: "Customers", href: "/admin/customers", description: "Find customer records and appointment history." },
    { label: "Payments", href: "/admin/payments", description: "See payment attempts, collections and refunds." },
    { label: "Email delivery", href: "/admin/notifications", description: "Review transactional email delivery and retry status." },
    { label: "Reports", href: "/admin/reports", description: "Review appointment and collection totals." },
    { label: "Announcements", href: "/admin/announcements", description: "Create and publish business updates." },
    { label: "Business Settings", href: "/admin/settings", description: "Configure the business and booking rules." },
    { label: "Closures", href: "/admin/closures", description: "Manage full-day and partial business closures." },
    { label: "Appearance", href: "/admin/appearance", description: "Customize your public website’s brand, images and story." },
  ],
  staff: [
    { label: "Today", href: "/staff", description: "Your next visit and today’s assigned work." },
    { label: "Schedule", href: "/staff/calendar", description: "Upcoming assigned appointments grouped by day." },
    { label: "Appointments", href: "/staff/appointments", description: "See assigned requests and upcoming visits." },
    { label: "Availability", href: "/staff/availability", description: "Review your regular hours and upcoming exceptions." },
    { label: "Profile", href: "/staff/profile", description: "Staff profile editing will be added in a later phase." },
  ],
  account: [
    { label: "Overview", href: "/account", description: "Review upcoming requests and your appointment history." },
    { label: "My Appointments", href: "/account/appointments", description: "View your appointment requests and visit details." },
    { label: "Payments", href: "/account/payments", description: "View your appointment payments and receipts." },
    { label: "Profile", href: "/account/profile", description: "Keep your contact details up to date." },
  ],
};
