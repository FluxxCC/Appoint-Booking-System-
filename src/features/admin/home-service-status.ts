export type HomeServiceState = "ACTIVE" | "SETUP_REQUIRED" | "DISABLED";

export type HomeServiceStatus = {
  state: HomeServiceState;
  publishedServices: number;
  message: string;
  href: "/admin/settings" | "/admin/services" | "/admin/appointments";
  action: string;
};

type BusinessConfig = {
  home_service_enabled?: boolean;
  service_origin_latitude?: number | string | null;
  service_origin_longitude?: number | string | null;
  home_service_max_radius_km?: number | string | null;
} | null;

type ServiceConfig = { active: boolean; published: boolean; supports_home_service: boolean; category_id?: string | null };
type CategoryConfig = { id: string; active: boolean; published: boolean };

export function deriveHomeServiceStatus(business: BusinessConfig, services: ServiceConfig[], categories: CategoryConfig[] = []): HomeServiceStatus {
  const visibleCategories = new Map(categories.map((category) => [category.id, category.active && category.published]));
  const enabled = services.filter((service) => service.active && service.published && service.supports_home_service
    && (!service.category_id || visibleCategories.get(service.category_id) === true)).length;

  if (!business?.home_service_enabled) return { state: "DISABLED", publishedServices: enabled, message: "Home Service is off for this branch.", href: "/admin/services", action: "Manage services" };
  if (!enabled) return { state: "DISABLED", publishedServices: 0, message: "No active, published service currently offers Home Service.", href: "/admin/services", action: "Manage services" };
  return { state: "ACTIVE", publishedServices: enabled, message: `${enabled} service${enabled === 1 ? "" : "s"} available for Home Service.`, href: "/admin/appointments", action: "View appointments" };
}
