-- CreateTable
CREATE TABLE "SocialParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "providerParticipantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialParticipant_workspaceId_socialAccountId_fkey" FOREIGN KEY ("workspaceId", "socialAccountId") REFERENCES "SocialAccount" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerConversationId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedTo" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "firstMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialConversation_workspaceId_brandId_fkey" FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialConversation_workspaceId_socialAccountId_fkey" FOREIGN KEY ("workspaceId", "socialAccountId") REFERENCES "SocialAccount" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SocialConversation_workspaceId_participantId_fkey" FOREIGN KEY ("workspaceId", "participantId") REFERENCES "SocialParticipant" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'TEXT',
    "sender" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SocialMessage_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "SocialConversation" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "assignedTo" TEXT,
    "assignedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationAssignment_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "SocialConversation" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConversationAssignment_workspaceId_assignedBy_fkey" FOREIGN KEY ("workspaceId", "assignedBy") REFERENCES "User" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "ConversationTag_workspaceId_conversationId_fkey" FOREIGN KEY ("workspaceId", "conversationId") REFERENCES "SocialConversation" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "payload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "conversationId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    CONSTRAINT "InboxEvent_workspaceId_socialAccountId_fkey" FOREIGN KEY ("workspaceId", "socialAccountId") REFERENCES "SocialAccount" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialParticipant_workspaceId_id_key" ON "SocialParticipant"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialParticipant_workspaceId_socialAccountId_providerParticipantId_key" ON "SocialParticipant"("workspaceId", "socialAccountId", "providerParticipantId");

-- CreateIndex
CREATE INDEX "SocialConversation_workspaceId_status_lastMessageAt_idx" ON "SocialConversation"("workspaceId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SocialConversation_workspaceId_assignedTo_idx" ON "SocialConversation"("workspaceId", "assignedTo");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConversation_workspaceId_id_key" ON "SocialConversation"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConversation_workspaceId_socialAccountId_providerConversationId_key" ON "SocialConversation"("workspaceId", "socialAccountId", "providerConversationId");

-- CreateIndex
CREATE INDEX "SocialMessage_workspaceId_conversationId_sentAt_idx" ON "SocialMessage"("workspaceId", "conversationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialMessage_conversationId_providerMessageId_key" ON "SocialMessage"("conversationId", "providerMessageId");

-- CreateIndex
CREATE INDEX "ConversationAssignment_workspaceId_conversationId_createdAt_idx" ON "ConversationAssignment"("workspaceId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTag_workspaceId_name_idx" ON "ConversationTag"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTag_conversationId_name_key" ON "ConversationTag"("conversationId", "name");

-- CreateIndex
CREATE INDEX "InboxEvent_workspaceId_status_idx" ON "InboxEvent"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InboxEvent_workspaceId_eventKey_key" ON "InboxEvent"("workspaceId", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_id_key" ON "User"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_workspaceId_id_key" ON "Brand"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_id_key" ON "SocialAccount"("workspaceId", "id");

