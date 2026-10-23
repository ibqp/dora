-- DropIndex
DROP INDEX "Message_sessionId_createdAt_idx";

-- AlterTable
ALTER TABLE "ChatSession" ALTER COLUMN "scenario" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientRequestId" TEXT,
ADD COLUMN     "sequence" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Message_clientRequestId_key" ON "Message"("clientRequestId");

-- CreateIndex
CREATE INDEX "Message_sessionId_sequence_idx" ON "Message"("sessionId", "sequence");

