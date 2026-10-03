export function formatBusinessTime(instant: string, timeZone: string, locale = "en") {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(instant));
}
