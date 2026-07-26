CREATE TYPE "PaymentProvider" AS ENUM ('DEMO', 'RAZORPAY');
CREATE TYPE "DeliveryChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

ALTER TABLE "PaymentRequest" ADD COLUMN "provider" "PaymentProvider" NOT NULL DEFAULT 'DEMO';
ALTER TABLE "PaymentRequest" ADD COLUMN "providerPaymentLinkId" TEXT;
CREATE UNIQUE INDEX "PaymentRequest_providerPaymentLinkId_key" ON "PaymentRequest"("providerPaymentLinkId");

CREATE TABLE "DeliveryLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT,
  "invoiceId" TEXT,
  "channel" "DeliveryChannel" NOT NULL,
  "provider" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "template" TEXT,
  "payloadJson" JSONB NOT NULL,
  "status" "DeliveryStatus" NOT NULL,
  "providerMessageId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "DeliveryLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeliveryLog_workspaceId_createdAt_idx" ON "DeliveryLog"("workspaceId", "createdAt");
CREATE INDEX "DeliveryLog_invoiceId_createdAt_idx" ON "DeliveryLog"("invoiceId", "createdAt");
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryLog" ADD CONSTRAINT "DeliveryLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomerPortalToken" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "quoteId" TEXT,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastAccessedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPortalToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerPortalToken_tokenHash_key" ON "CustomerPortalToken"("tokenHash");
CREATE INDEX "CustomerPortalToken_workspaceId_customerId_idx" ON "CustomerPortalToken"("workspaceId", "customerId");
CREATE INDEX "CustomerPortalToken_invoiceId_idx" ON "CustomerPortalToken"("invoiceId");
CREATE INDEX "CustomerPortalToken_quoteId_idx" ON "CustomerPortalToken"("quoteId");
ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPortalToken" ADD CONSTRAINT "CustomerPortalToken_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
