export const invoiceStatuses = ["DRAFT", "SENT", "PAID", "OVERDUE"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

const allowedTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["PAID", "OVERDUE"],
  OVERDUE: ["PAID"],
  PAID: [],
};

export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus) {
  return allowedTransitions[from].includes(to);
}
