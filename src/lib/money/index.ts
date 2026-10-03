export function formatMoney(amount: number, currency: string, locale = "en") {
  if (!Number.isSafeInteger(amount)) throw new Error("Money must be a safe integer in minor units");
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amount / 10 ** digits);
}
