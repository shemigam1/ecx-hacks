-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'TRUSTED_CONTACT', 'DELEGATE');

-- CreateEnum
CREATE TYPE "DelegateType" AS ENUM ('HUMAN', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('SPEND_CAP_MONTHLY', 'SPEND_CAP_PER_TX', 'BILLER_ALLOWLIST', 'RECIPIENT_LOCK', 'COSIGN_THRESHOLD', 'CHANNEL_SCOPE', 'TIME_WINDOW');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('VOICE', 'WHATSAPP', 'WEB');

-- CreateEnum
CREATE TYPE "IntentStatus" AS ENUM ('PENDING', 'ALLOWED', 'ESCALATED', 'DENIED', 'EXECUTED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('ALLOW', 'ESCALATE', 'DENY');

-- CreateEnum
CREATE TYPE "CosignStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phoneMsisdn" TEXT,
    "name" TEXT NOT NULL,
    "languagePref" TEXT NOT NULL DEFAULT 'en',
    "pinHash" TEXT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "delegateType" "DelegateType" NOT NULL,
    "delegateUserId" TEXT,
    "label" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "ruleType" "RuleType" NOT NULL,
    "params" JSONB NOT NULL,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Biller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "aliases" TEXT[],

    CONSTRAINT "Biller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "billerId" TEXT,
    "recipient" TEXT,
    "amount" INTEGER NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "status" "IntentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDecision" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "reasons" JSONB NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "providerRef" TEXT,
    "tokenEncrypted" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CosignRequest" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "trustedContactId" TEXT NOT NULL,
    "status" "CosignStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CosignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "billerId" TEXT NOT NULL,
    "typicalAmountMean" INTEGER NOT NULL,
    "amountVar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "typicalIntervalDays" DOUBLE PRECISION,
    "lastPaidAt" TIMESTAMP(3),

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyFlag" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "intentId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneMsisdn_key" ON "User"("phoneMsisdn");

-- CreateIndex
CREATE INDEX "Credential_accountId_idx" ON "Credential"("accountId");

-- CreateIndex
CREATE INDEX "PolicyRule_credentialId_idx" ON "PolicyRule"("credentialId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_idempotencyKey_key" ON "PaymentIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentIntent_credentialId_idx" ON "PaymentIntent"("credentialId");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDecision_intentId_key" ON "PolicyDecision"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_intentId_key" ON "Transaction"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "CosignRequest_intentId_key" ON "CosignRequest"("intentId");

-- CreateIndex
CREATE INDEX "AuditEvent_accountId_createdAt_idx" ON "AuditEvent"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Habit_accountId_billerId_key" ON "Habit"("accountId", "billerId");

-- CreateIndex
CREATE INDEX "AnomalyFlag_accountId_idx" ON "AnomalyFlag"("accountId");

-- CreateIndex
CREATE INDEX "ConversationSession_userId_idx" ON "ConversationSession"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_delegateUserId_fkey" FOREIGN KEY ("delegateUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_billerId_fkey" FOREIGN KEY ("billerId") REFERENCES "Biller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDecision" ADD CONSTRAINT "PolicyDecision_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosignRequest" ADD CONSTRAINT "CosignRequest_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CosignRequest" ADD CONSTRAINT "CosignRequest_trustedContactId_fkey" FOREIGN KEY ("trustedContactId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyFlag" ADD CONSTRAINT "AnomalyFlag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
