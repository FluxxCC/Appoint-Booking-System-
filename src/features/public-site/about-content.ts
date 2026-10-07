const preferredContentKeys = ["body", "content", "description", "text"] as const;
const ignoredKeys = new Set(["id", "enabled", "published", "image", "image_path", "path", "src", "url", "href", "color", "type"]);

export function aboutCopy(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(aboutCopy).filter(Boolean).join("\n\n");
  if (value === null || typeof value !== "object") return "";

  const fields = value as Record<string, unknown>;
  for (const key of preferredContentKeys) {
    if (key in fields) {
      const copy = aboutCopy(fields[key]);
      if (copy) return copy;
    }
  }

  return Object.entries(fields)
    .filter(([key]) => !ignoredKeys.has(key.toLowerCase()))
    .map(([, child]) => aboutCopy(child))
    .filter(Boolean)
    .join("\n\n");
}
