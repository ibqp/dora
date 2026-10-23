-- CreateEnum
CREATE TYPE "Scenario" AS ENUM ('CUSTOMER_CHURN', 'SALES_PERFORMANCE', 'NETWORK_PERFORMANCE', 'GENERIC_ANALYTICS');

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('REQUIREMENTS_DISCOVERY', 'XY_PROBLEM_DIAGNOSTIC', 'DATA_REQUIREMENTS_ANALYST', 'BRD_GENERATOR');

-- CreateEnum
CREATE TYPE "DiscoveryStage" AS ENUM ('INITIAL_REQUEST', 'BUSINESS_PROBLEM_VALIDATION', 'REQUIREMENTS_DISCOVERY', 'REQUIREMENTS_CLARIFICATION', 'REQUIREMENTS_REVIEW', 'BRD_GENERATION');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW');

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "scenario" "Scenario" NOT NULL,
    "assistantRole" "AssistantRole" NOT NULL,
    "currentStage" "DiscoveryStage" NOT NULL DEFAULT 'INITIAL_REQUEST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementState" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "currentField" TEXT,
    "completenessPercentage" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequirementState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRequirementsDocument" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "manualEdits" JSONB NOT NULL DEFAULT '{}',
    "completenessPercentage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRequirementsDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mockResponseDelayMs" INTEGER NOT NULL DEFAULT 1500,
    "defaultAssistantRole" "AssistantRole" NOT NULL DEFAULT 'REQUIREMENTS_DISCOVERY',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementState_sessionId_key" ON "RequirementState"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRequirementsDocument_sessionId_key" ON "BusinessRequirementsDocument"("sessionId");

-- CreateIndex
CREATE INDEX "BusinessRequirementsDocument_updatedAt_idx" ON "BusinessRequirementsDocument"("updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementState" ADD CONSTRAINT "RequirementState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessRequirementsDocument" ADD CONSTRAINT "BusinessRequirementsDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written additions (not expressible in schema.prisma) ───────────────

-- Completeness percentages are always within 0–100.
ALTER TABLE "RequirementState" ADD CONSTRAINT "RequirementState_completenessPercentage_check"
    CHECK ("completenessPercentage" BETWEEN 0 AND 100);
ALTER TABLE "BusinessRequirementsDocument" ADD CONSTRAINT "BusinessRequirementsDocument_completenessPercentage_check"
    CHECK ("completenessPercentage" BETWEEN 0 AND 100);

-- AppSettings is a single shared record with id = 1.
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_mockResponseDelayMs_check"
    CHECK ("mockResponseDelayMs" >= 0);

-- Initialize the shared settings record with column defaults. No sessions or BRDs are created.
INSERT INTO "AppSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
    ON CONFLICT ("id") DO NOTHING;
