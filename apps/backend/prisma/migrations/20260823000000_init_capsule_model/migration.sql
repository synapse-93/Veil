-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SecurityRecipe" AS ENUM ('QUICK', 'SECURE', 'NUCLEAR');

-- CreateEnum
CREATE TYPE "CapsuleStatus" AS ENUM ('ACTIVE', 'VIEW_LIMIT_REACHED', 'EXPIRED', 'BURNED');

-- CreateTable
CREATE TABLE "Capsule" (
    "id" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "recipe" "SecurityRecipe" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxViews" INTEGER NOT NULL,
    "currentViews" INTEGER NOT NULL DEFAULT 0,
    "requiresPassword" BOOLEAN NOT NULL,
    "burnAfterRead" BOOLEAN NOT NULL,
    "status" "CapsuleStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "Capsule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Capsule_status_idx" ON "Capsule"("status");

-- CreateIndex
CREATE INDEX "Capsule_expiresAt_idx" ON "Capsule"("expiresAt");
