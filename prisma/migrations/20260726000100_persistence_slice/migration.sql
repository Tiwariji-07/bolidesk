ALTER TABLE "Quote" ADD COLUMN "jobId" TEXT;
CREATE UNIQUE INDEX "Quote_jobId_key" ON "Quote"("jobId");
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "PaymentRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentRequest_reference_key" ON "PaymentRequest"("reference");
CREATE INDEX "Customer_workspaceId_createdAt_idx" ON "Customer"("workspaceId", "createdAt");
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");
CREATE INDEX "Quote_workspaceId_status_idx" ON "Quote"("workspaceId", "status");
CREATE INDEX "Invoice_workspaceId_status_idx" ON "Invoice"("workspaceId", "status");
CREATE INDEX "FollowUp_workspaceId_status_dueAt_idx" ON "FollowUp"("workspaceId", "status", "dueAt");
CREATE INDEX "Activity_workspaceId_createdAt_idx" ON "Activity"("workspaceId", "createdAt");
CREATE INDEX "PaymentRequest_workspaceId_invoiceId_idx" ON "PaymentRequest"("workspaceId", "invoiceId");
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
