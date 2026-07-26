export type FollowUpSource = {
  kind: "QUOTE" | "INVOICE";
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "PAID" | "OVERDUE";
  dueDate?: string;
};

export type FollowUpRecommendation = {
  action: "SEND_PAYMENT_REMINDER" | "CHECK_IN" | "NONE";
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export function recommendFollowUp(source: FollowUpSource): FollowUpRecommendation {
  if (source.kind === "INVOICE" && source.status === "OVERDUE") {
    return { action: "SEND_PAYMENT_REMINDER", priority: "HIGH" };
  }
  if (source.status === "SENT") return { action: "CHECK_IN", priority: "MEDIUM" };
  return { action: "NONE", priority: "LOW" };
}
