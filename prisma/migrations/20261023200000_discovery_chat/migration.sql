-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "processingToken" TEXT;

-- AlterTable
ALTER TABLE "RequirementState" ADD COLUMN     "proposedSolution" TEXT;

