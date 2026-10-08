-- CreateEnum
CREATE TYPE "EvidenceKind" AS ENUM ('code', 'commit', 'diff', 'pr', 'issue');

-- CreateEnum
CREATE TYPE "EvidenceGrade" AS ENUM ('confirmed', 'supported', 'inferred');

-- CreateEnum
CREATE TYPE "StepKind" AS ENUM ('prompt', 'tool', 'verdict', 'repair', 'status');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InvestigationStatus" ADD VALUE 'PARTIAL';
ALTER TYPE "InvestigationStatus" ADD VALUE 'INSUFFICIENT';

-- AlterTable
ALTER TABLE "investigations" ADD COLUMN     "result" JSONB;

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "kind" "EvidenceKind" NOT NULL,
    "ref" TEXT NOT NULL,
    "excerpt" VARCHAR(500) NOT NULL,
    "grade" "EvidenceGrade" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation_steps" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "StepKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_items_investigationId_idx" ON "evidence_items"("investigationId");

-- CreateIndex
CREATE INDEX "investigation_steps_investigationId_idx" ON "investigation_steps"("investigationId");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_steps_investigationId_seq_key" ON "investigation_steps"("investigationId", "seq");

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation_steps" ADD CONSTRAINT "investigation_steps_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
