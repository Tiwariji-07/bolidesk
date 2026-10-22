/** Business calendar for Indian shops: every "today", due date and reminder hour is in Asia/Kolkata (UTC+05:30, no DST). */
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar date as YYYY-MM-DD. */
export type IsoDate = string;

export function isIsoDate(value: string): value is IsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

/** The IST calendar date at the given instant. */
export function businessDate(at: Date = new Date()): IsoDate {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Date-only values are stored as UTC midnight of that calendar date (Postgres DATE semantics). */
export function dateOnly(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Invalid calendar date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(dateOnly(value).getTime() + days * DAY_MS));
}

/** The instant of hh:mm IST on the given calendar date. */
export function istInstant(value: IsoDate, hour: number, minute = 0): Date {
  return new Date(dateOnly(value).getTime() + (hour * 60 + minute) * 60 * 1000 - IST_OFFSET_MS);
}

/** A due date is overdue only once its IST calendar day has fully passed. */
export function isPastDue(dueDate: Date | null | undefined, at: Date = new Date()): boolean {
  return Boolean(dueDate) && toIsoDate(dueDate!) < businessDate(at);
}

/** Indian financial year label for a calendar date, e.g. 2026-10-21 -> "2627" (FY 2026-27). */
export function financialYear(value: IsoDate): string {
  const [year, month] = value.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}
