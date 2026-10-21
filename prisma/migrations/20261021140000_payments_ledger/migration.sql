-- Payments ledger: every rupee received is a row with a receipt; invoice status follows the balance.

CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK', 'RAZORPAY');
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'RAZORPAY', 'LEGACY');
CREATE TYPE "PaymentEntryKind" AS ENUM ('RECEIPT', 'REVERSAL', 'REFUND');
CREATE TYPE "PaymentRequestStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLING', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "paymentRequestId" TEXT,
  "entryKind" "PaymentEntryKind" NOT NULL DEFAULT 'RECEIPT',
  "source" "PaymentSource" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "method" "PaymentMethod",
  "reference" TEXT,
  "receiptNumber" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "reversesPaymentId" TEXT,
  "recordedByUserId" TEXT,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_sign_check" CHECK (("entryKind" = 'RECEIPT' AND "amountPaise" > 0) OR ("entryKind" IN ('REVERSAL', 'REFUND') AND "amountPaise" < 0)),
  CONSTRAINT "Payment_method_check" CHECK ("source" = 'LEGACY' OR "method" IS NOT NULL),
  CONSTRAINT "Payment_receipt_check" CHECK ("source" = 'LEGACY' OR "entryKind" <> 'RECEIPT' OR "receiptNumber" IS NOT NULL),
  CONSTRAINT "Payment_actor_check" CHECK ("source" <> 'MANUAL' OR "recordedByUserId" IS NOT NULL),
  CONSTRAINT "Payment_reversal_check" CHECK (("entryKind" = 'REVERSAL') = ("reversesPaymentId" IS NOT NULL))
);
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_reversesPaymentId_key" ON "Payment"("reversesPaymentId");
CREATE INDEX "Payment_workspaceId_invoiceId_idx" ON "Payment"("workspaceId", "invoiceId");
CREATE INDEX "Payment_workspaceId_occurredAt_idx" ON "Payment"("workspaceId", "occurredAt");
CREATE UNIQUE INDEX "Payment_workspaceId_receiptNumber_key" ON "Payment"("workspaceId", "receiptNumber");
CREATE UNIQUE INDEX "Payment_workspaceId_idempotencyKey_key" ON "Payment"("workspaceId", "idempotencyKey");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "Payment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoices already marked PAID keep their balance through one opening entry. Method and evidence are unknown,
-- so it is LEGACY with no invented receipt number.
INSERT INTO "Payment" ("id", "workspaceId", "invoiceId", "entryKind", "source", "amountPaise", "idempotencyKey", "occurredAt", "reason")
SELECT 'legacy-opening-' || "id", "workspaceId", "id", 'RECEIPT', 'LEGACY', "totalPaise", 'legacy-opening-' || "id", coalesce("paidAt", "createdAt"), 'Marked paid before BoliDesk kept a payments ledger'
FROM "Invoice" WHERE "status" = 'PAID' AND "totalPaise" > 0;

-- Payment requests: lifecycle columns. Old requests are closed: demo ones stored a customer-portal URL
-- (a bearer token), and old Razorpay links had no expiry; staff create a fresh link when needed.
ALTER TABLE "PaymentRequest" RENAME COLUMN "amount" TO "amountPaise";
ALTER TABLE "PaymentRequest"
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "status" "PaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "url" DROP NOT NULL;
UPDATE "PaymentRequest" SET "status" = 'EXPIRED', "lastError" = 'legacy: closed by the payments-ledger migration', "url" = CASE WHEN "provider" = 'DEMO' THEN NULL ELSE "url" END;
-- An unpaid invoice's newest Razorpay link may still be payable at Razorpay. Mark it CANCELLING (not legacy): the next
-- payment-link request, or the retry button, cancels it at Razorpay and records any payment already made on it.
UPDATE "PaymentRequest" r SET "status" = 'CANCELLING', "lastError" = NULL, "expiresAt" = CURRENT_TIMESTAMP
WHERE r."provider" = 'RAZORPAY' AND r."providerPaymentLinkId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Invoice" i WHERE i."id" = r."invoiceId" AND i."status" <> 'PAID')
  AND r."id" = (SELECT r2."id" FROM "PaymentRequest" r2 WHERE r2."invoiceId" = r."invoiceId" AND r2."provider" = 'RAZORPAY' AND r2."providerPaymentLinkId" IS NOT NULL ORDER BY r2."createdAt" DESC LIMIT 1);
ALTER TABLE "PaymentRequest" ALTER COLUMN "updatedAt" DROP DEFAULT;
UPDATE "CustomerPortalToken" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL AND "invoiceId" IN (SELECT "invoiceId" FROM "PaymentRequest");
UPDATE "DeliveryLog" SET "payloadJson" = regexp_replace("payloadJson"::text, '/p/[A-Za-z0-9_-]{32,}', '/p/REDACTED', 'g')::jsonb;
ALTER TABLE "Invoice" DROP COLUMN "paymentUrl";

CREATE UNIQUE INDEX "PaymentRequest_one_live_per_invoice" ON "PaymentRequest"("invoiceId") WHERE "status" IN ('PENDING', 'ACTIVE', 'CANCELLING');
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_amount_check" CHECK ("amountPaise" > 0);
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_live_expiry_check" CHECK ("status" NOT IN ('PENDING', 'ACTIVE', 'CANCELLING') OR "expiresAt" IS NOT NULL);
