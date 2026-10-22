const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

/** Formats an amount in paise as rupees with Indian digit grouping, e.g. 150000 -> "₹1,500.00". */
export function formatInr(paise: number): string {
  return inr.format(paise / 100);
}
