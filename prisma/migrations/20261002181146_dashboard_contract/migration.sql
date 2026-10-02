-- AlterTable
ALTER TABLE "repositories" ADD COLUMN     "progress" INTEGER,
ADD COLUMN     "sizeBytes" BIGINT,
ADD COLUMN     "stage" TEXT;
