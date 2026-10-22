/**
 * Indian mobile numbers in one stored form, "+91XXXXXXXXXX", so the same customer typed as
 * "98765 43210", "+91 98765-43210" or "098765 43210" is one record and WhatsApp gets a valid number.
 * Other countries are kept as + and digits when given with a country code.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !digits.startsWith("91")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  const national = digits.replace(/^(?:0091|91(?=\d{10}$)|0(?=\d{10}$))/, "");
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

/** WhatsApp Cloud API wants the number without "+". Older records not yet in the +91 form are normalized first. */
export function whatsappRecipient(phone: string) {
  return (normalizePhone(phone) ?? phone).replace(/\D/g, "");
}

export function formatPhone(phone: string) {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match ? `+91 ${match[1]} ${match[2]}` : phone;
}
