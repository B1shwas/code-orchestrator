/*
  Warnings:

  - You are about to drop the column `userId` on the `repositories` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[githubRepoId]` on the table `repositories` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_userId_fkey";

-- AlterTable
ALTER TABLE "repositories" DROP COLUMN "userId",
ADD COLUMN     "errorMessage" TEXT;

-- CreateTable
CREATE TABLE "user_repositories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_repositories_userId_idx" ON "user_repositories"("userId");

-- CreateIndex
CREATE INDEX "user_repositories_repositoryId_idx" ON "user_repositories"("repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_repositories_userId_repositoryId_key" ON "user_repositories"("userId", "repositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubRepoId_key" ON "repositories"("githubRepoId");

-- AddForeignKey
ALTER TABLE "user_repositories" ADD CONSTRAINT "user_repositories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_repositories" ADD CONSTRAINT "user_repositories_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
