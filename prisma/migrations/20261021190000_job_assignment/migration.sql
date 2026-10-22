-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'SCHEDULED', 'DONE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "assigneeUserId" TEXT,
ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'OPEN';

-- CreateIndex
CREATE INDEX "Job_workspaceId_assigneeUserId_status_idx" ON "Job"("workspaceId", "assigneeUserId", "status");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Jobs that already have a quote are treated as done visits.
UPDATE "Job" j SET "status" = 'DONE', "doneAt" = j."createdAt" WHERE EXISTS (SELECT 1 FROM "Quote" q WHERE q."jobId" = j."id");
