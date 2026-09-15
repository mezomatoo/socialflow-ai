-- Faz 2 — Yayınlama takibi genişletmesi. Tamamı EKLENCİ (additive):
-- mevcut tablolar silinmez/yeniden oluşturulmaz; veri kaybı yoktur.
-- Yeni kolonlar nullable veya varsayılanlıdır; eski satırlar geçerli kalır.

ALTER TABLE "Publication" ADD COLUMN "socialAccountId" TEXT;
ALTER TABLE "Publication" ADD COLUMN "normalizedErrorCode" TEXT;
ALTER TABLE "Publication" ADD COLUMN "providerStatusCheckedAt" DATETIME;

ALTER TABLE "PublicationAttempt" ADD COLUMN "normalizedCode" TEXT;
ALTER TABLE "PublicationAttempt" ADD COLUMN "retryable" BOOLEAN;

ALTER TABLE "SocialAccount" ADD COLUMN "capabilities" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SocialAccount" ADD COLUMN "lastSyncedAt" DATETIME;

-- Yayın anındaki değişmez anlık görüntü (caption/medya/kural sürümü/hesap).
CREATE TABLE "PublicationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "hashtags" TEXT NOT NULL DEFAULT '',
    "cta" TEXT,
    "firstComment" TEXT,
    "mediaKind" TEXT,
    "mediaStorageKey" TEXT,
    "mediaUrl" TEXT,
    "mediaWidth" INTEGER,
    "mediaHeight" INTEGER,
    "contentVersion" INTEGER NOT NULL DEFAULT 1,
    "platformRuleVersion" INTEGER,
    "accountHandle" TEXT,
    "accountExternalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PublicationSnapshot_publicationId_key" ON "PublicationSnapshot"("publicationId");
CREATE INDEX "PublicationSnapshot_publicationId_idx" ON "PublicationSnapshot"("publicationId");

CREATE INDEX "Publication_socialAccountId_idx" ON "Publication"("socialAccountId");

-- Dış anahtarlar (SQLite ALTER ile eklenemediğinden uygulama seviyesinde
-- Prisma ilişkileri zorunludur; mevcut veri bozulmaz).
