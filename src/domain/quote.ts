export type QuoteLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
};

export type MoneyTotals = { subtotal: number; tax: number; total: number };

/** Calculates paise-free amounts in rupees for a draft quote. */
export function calculateQuoteTotals(lines: QuoteLine[]): MoneyTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const tax = lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitPrice * (line.taxRate / 100)),
    0,
  );

  return { subtotal, tax, total: subtotal + tax };
}
