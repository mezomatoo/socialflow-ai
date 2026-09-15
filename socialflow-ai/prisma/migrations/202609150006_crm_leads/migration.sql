-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER_PROVIDED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contact_workspaceId_brandId_fkey" FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lead_workspaceId_contactId_fkey" FOREIGN KEY ("workspaceId", "contactId") REFERENCES "Contact" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_workspaceId_campaignId_fkey" FOREIGN KEY ("workspaceId", "campaignId") REFERENCES "Campaign" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lead_workspaceId_ownerId_fkey" FOREIGN KEY ("workspaceId", "ownerId") REFERENCES "User" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadActivity_workspaceId_leadId_fkey" FOREIGN KEY ("workspaceId", "leadId") REFERENCES "Lead" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactConversationLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactConversationLink_workspaceId_contactId_fkey" FOREIGN KEY ("workspaceId", "contactId") REFERENCES "Contact" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContactConversationLink_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "SocialConversation" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contact_workspaceId_brandId_status_idx" ON "Contact"("workspaceId", "brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_id_key" ON "Contact"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_stage_updatedAt_idx" ON "Lead"("workspaceId", "stage", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_workspaceId_id_key" ON "Lead"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "LeadActivity_workspaceId_leadId_createdAt_idx" ON "LeadActivity"("workspaceId", "leadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConversationLink_conversationId_key" ON "ContactConversationLink"("conversationId");

-- CreateIndex
CREATE INDEX "ContactConversationLink_workspaceId_contactId_idx" ON "ContactConversationLink"("workspaceId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactConversationLink_workspaceId_conversationId_key" ON "ContactConversationLink"("workspaceId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_workspaceId_id_key" ON "Campaign"("workspaceId", "id");

