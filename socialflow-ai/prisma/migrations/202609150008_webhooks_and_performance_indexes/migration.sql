-- 202609150008_webhooks_and_performance_indexes
-- Outbound/Inbound Webhooks (§78, §93) + Performance Indexes (§119-§120)

-- Outbound webhook subscriptions
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledAt" DATETIME,
    "disabledReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WebhookSubscription_workspaceId_isActive_idx" ON "WebhookSubscription"("workspaceId", "isActive");

-- Outbound webhook delivery logs / DLQ
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "lastError" TEXT,
    "nextRetryAt" DATETIME,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WebhookDelivery_workspaceId_status_idx" ON "WebhookDelivery"("workspaceId", "status");
CREATE INDEX "WebhookDelivery_subscriptionId_createdAt_idx" ON "WebhookDelivery"("subscriptionId", "createdAt");
CREATE INDEX "WebhookDelivery_status_nextRetryAt_idx" ON "WebhookDelivery"("status", "nextRetryAt");

-- Inbound webhook deduplication and verification log
CREATE TABLE "InboundWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rawPayload" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME,
    "error" TEXT
);

CREATE UNIQUE INDEX "InboundWebhookEvent_provider_eventId_key" ON "InboundWebhookEvent"("provider", "eventId");
CREATE INDEX "InboundWebhookEvent_provider_receivedAt_idx" ON "InboundWebhookEvent"("provider", "receivedAt");
CREATE INDEX "InboundWebhookEvent_workspaceId_status_idx" ON "InboundWebhookEvent"("workspaceId", "status");

-- Performance indexes for dashboard & calendar queries (§119-§120)
CREATE INDEX "Content_workspaceId_updatedAt_idx" ON "Content"("workspaceId", "updatedAt");
CREATE INDEX "Content_workspaceId_brandId_idx" ON "Content"("workspaceId", "brandId");

CREATE INDEX "PlatformContent_scheduledFor_idx" ON "PlatformContent"("scheduledFor");
CREATE INDEX "PlatformContent_enabled_scheduledFor_idx" ON "PlatformContent"("enabled", "scheduledFor");
CREATE INDEX "PlatformContent_socialAccountId_idx" ON "PlatformContent"("socialAccountId");
CREATE INDEX "PlatformContent_mediaAssetId_idx" ON "PlatformContent"("mediaAssetId");

CREATE INDEX "Schedule_scheduledFor_status_idx" ON "Schedule"("scheduledFor", "status");
CREATE INDEX "Schedule_contentId_idx" ON "Schedule"("contentId");

CREATE INDEX "MediaVariant_workspaceId_createdAt_idx" ON "MediaVariant"("workspaceId", "createdAt");

CREATE INDEX "ContentPlanItem_workspaceId_date_idx" ON "ContentPlanItem"("workspaceId", "date");

CREATE INDEX "Job_workspaceId_status_idx" ON "Job"("workspaceId", "status");
CREATE INDEX "Job_workspaceId_createdAt_idx" ON "Job"("workspaceId", "createdAt");
