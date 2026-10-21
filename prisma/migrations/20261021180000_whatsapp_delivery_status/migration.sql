-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "DeliveryStatus" ADD VALUE 'READ';

-- AlterTable
ALTER TABLE "DeliveryLog" ADD COLUMN     "purpose" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryLog_providerMessageId_key" ON "DeliveryLog"("providerMessageId");

