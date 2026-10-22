import { BUSINESS_TIME_ZONE } from "@/domain/business-time";

export const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Formats a whole-paise amount as rupees. */
export function formatINR(paise: number) {
  return inr.format(paise / 100);
}

const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: BUSINESS_TIME_ZONE });
const dateOnlyFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIME_ZONE });

/** An instant shown on the IST calendar. */
export function formatDate(value: string | Date) {
  return dateFormat.format(new Date(value));
}

/** A stored calendar date (UTC midnight), shown without shifting a day. */
export function formatDay(value: string | Date) {
  return dateOnlyFormat.format(new Date(value));
}

export function formatTime(value: Date) {
  return timeFormat.format(value);
}
