export function StatusBadge({ value, children }: { value: string; children: React.ReactNode }) {
  const positive = ["ACCEPTED", "CONFIRMED", "COMPLETED", "SUCCEEDED", "PAID"].includes(value);
  const negative = ["NO_SHOW", "FAILED", "CANCELLED", "DECLINED", "PAYMENT_EXPIRED"].includes(value);
  const payment = value === "AWAITING_PAYMENT";
  const tone = positive ? "bg-success-soft text-success" : negative ? "bg-danger-soft text-danger" : payment ? "bg-info-soft text-info" : "bg-warning-soft text-warning";
  return <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ${tone}`}>{children}</span>;
}
