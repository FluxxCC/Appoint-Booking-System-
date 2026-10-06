export type HomeServiceState = "ACTIVE" | "SETUP_REQUIRED" | "DISABLED";

export type HomeServiceStatus = {
  state: HomeServiceState;
  publishedServices: number;
  message: string;
  href: "/admin/settings" | "/admin/services" | "/admin/appointments";
  action: string;
};

type BusinessConfig = {
  service_origin_latitude?: number | string | null;
  service_origin_longitude?: number | string | null;
  home_service_max_radius_km?: number | string | null;
} | null;

type ServiceConfig = { active: boolean; published: boolean; supports_home_service: boolean; category_id?: string | null };
type CategoryConfig = { id: string; active: boolean; published: boolean };

export function deriveHomeServiceStatus(business: BusinessConfig, services: ServiceConfig[], categories: CategoryConfig[] = []): HomeServiceStatus {
  const latitude = Number(business?.service_origin_latitude);
  const longitude = Number(business?.service_origin_longitude);
  const hasOrigin = business?.service_origin_latitude != null && business?.service_origin_longitude != null
    && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  const radius = business?.home_service_max_radius_km;
  const radiusValid = radius == null || (Number.isFinite(Number(radius)) && Number(radius) >= 0.1 && Number(radius) <= 500);
  const visibleCategories = new Map(categories.map((category) => [category.id, category.active && category.published]));
  const enabled = services.filter((service) => service.active && service.published && service.supports_home_service
    && (!service.category_id || visibleCategories.get(service.category_id) === true)).length;

  // Missing business origin is actionable setup, including for a new business with no services yet.
  if (!hasOrigin || !radiusValid) return { state: "SETUP_REQUIRED", publishedServices: enabled, message: !hasOrigin ? "Add the business service-area map pin to finish setup." : "Review the maximum service radius in Home Service settings.", href: "/admin/settings", action: "Configure Home Service" };
  if (!enabled) return { state: "DISABLED", publishedServices: 0, message: "No active, published service currently offers Home Service.", href: "/admin/services", action: "Manage services" };
  return { state: "ACTIVE", publishedServices: enabled, message: `${enabled} service${enabled === 1 ? "" : "s"} available for Home Service.`, href: "/admin/appointments", action: "View appointments" };
}
