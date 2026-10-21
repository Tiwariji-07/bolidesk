-- AlterTable
ALTER TABLE "FollowUp" ADD COLUMN     "completedAutomatically" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "FollowUp_invoiceId_key" ON "FollowUp"("invoiceId");

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

