-- Replaces the superseded draft tables/enum from 20260930132930_github_auth_models.
-- IF EXISTS keeps this replay-safe: no-op when applied on a DB without them.
DROP TABLE IF EXISTS "investigations";
DROP TABLE IF EXISTS "repositories";
DROP TYPE IF EXISTS "InvestigationStatus";

-- CreateEnum
CREATE TYPE "RepoStatus" AS ENUM ('PENDING', 'CLONING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('PENDING', 'GATHERING_EVIDENCE', 'ANALYZING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "githubRepoId" INTEGER NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cloneUrl" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "localPath" TEXT NOT NULL,
    "status" "RepoStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "targetFile" TEXT,
    "targetSymbol" TEXT,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'PENDING',
    "evidence" JSONB,
    "llmResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repositories_owner_name_key" ON "repositories"("owner", "name");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

