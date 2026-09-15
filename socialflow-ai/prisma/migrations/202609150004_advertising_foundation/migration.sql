-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "currency" TEXT,
    "timezone" TEXT,
    "providerTimezone" TEXT,
    "connectionStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "grantedScopes" TEXT NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastValidatedAt" DATETIME,
    "lastAccountSyncAt" DATETIME,
    "lastCampaignSyncAt" DATETIME,
    "lastMetricsSyncAt" DATETIME,
    "lastConversionSyncAt" DATETIME,
    "lastCatalogSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AdAccount_workspaceId_brandId_fkey" FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdAccountCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "expiresAt" DATETIME,
    "lastRotatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdAccountCredential_workspaceId_adAccountId_fkey" FOREIGN KEY ("workspaceId", "adAccountId") REFERENCES "AdAccount" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdProviderCapability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "apiVersion" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '{}',
    "source" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdProviderCapability_workspaceId_adAccountId_fkey" FOREIGN KEY ("workspaceId", "adAccountId") REFERENCES "AdAccount" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AdAccount_workspaceId_provider_connectionStatus_idx" ON "AdAccount"("workspaceId", "provider", "connectionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_workspaceId_id_key" ON "AdAccount"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_workspaceId_provider_providerAccountId_key" ON "AdAccount"("workspaceId", "provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccountCredential_adAccountId_key" ON "AdAccountCredential"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccountCredential_workspaceId_adAccountId_key" ON "AdAccountCredential"("workspaceId", "adAccountId");

-- CreateIndex
CREATE INDEX "AdProviderCapability_workspaceId_adAccountId_createdAt_idx" ON "AdProviderCapability"("workspaceId", "adAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdProviderCapability_adAccountId_version_key" ON "AdProviderCapability"("adAccountId", "version");

