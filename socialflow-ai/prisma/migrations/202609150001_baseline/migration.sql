-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "locale" TEXT NOT NULL DEFAULT 'tr-TR',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfToken" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'PRO',
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "locale" TEXT NOT NULL DEFAULT 'tr-TR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "appName" TEXT NOT NULL DEFAULT 'SocialFlow AI',
    "logoUrl" TEXT,
    "logoMark" TEXT NOT NULL DEFAULT 'SF',
    "primaryColor" TEXT NOT NULL DEFAULT '#6D28D9',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0EA5E9',
    "accentColor" TEXT NOT NULL DEFAULT '#F59E0B',
    "radius" TEXT NOT NULL DEFAULT '14px',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "defaultLanguage" TEXT NOT NULL DEFAULT 'tr',
    "defaultTimezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "demoBanner" BOOLEAN NOT NULL DEFAULT true,
    "aiProvider" TEXT NOT NULL DEFAULT 'deterministic',
    "aiModel" TEXT,
    "aiTemperature" REAL NOT NULL DEFAULT 0.7,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AppSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#6D28D9',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0EA5E9',
    "fontStyle" TEXT NOT NULL DEFAULT 'Inter',
    "website" TEXT,
    "defaultCta" TEXT,
    "description" TEXT,
    "targetAudience" TEXT,
    "defaultStyle" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "defaultHashtags" TEXT NOT NULL DEFAULT '',
    "requiredHashtags" TEXT NOT NULL DEFAULT '',
    "bannedHashtags" TEXT NOT NULL DEFAULT '',
    "defaultMentions" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Brand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandVoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "brandId" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'profesyonel ve samimi',
    "personality" TEXT,
    "audience" TEXT,
    "styleGuide" TEXT,
    "allowedTerms" TEXT NOT NULL DEFAULT '',
    "bannedTerms" TEXT NOT NULL DEFAULT '',
    "mustKeepTerms" TEXT NOT NULL DEFAULT '',
    "formality" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "emojiLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "language" TEXT NOT NULL DEFAULT 'tr',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandVoice_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accountType" TEXT NOT NULL DEFAULT 'PROFILE',
    "scopes" TEXT NOT NULL DEFAULT '',
    "connectionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastValidatedAt" DATETIME,
    "lastError" TEXT,
    "demoAccount" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SocialProviderToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "socialAccountId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "scope" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME,
    "refreshExpiresAt" DATETIME,
    "lastRefreshedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialProviderToken_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "credentialsSet" BOOLEAN NOT NULL DEFAULT false,
    "apiVersion" TEXT,
    "lastCheckedAt" DATETIME,
    "message" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MediaFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "folderId" TEXT,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "publicUrl" TEXT,
    "mimeType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "aspectRatio" REAL,
    "contentHash" TEXT,
    "focalPoint" TEXT,
    "analysis" TEXT,
    "derivatives" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '',
    "campaign" TEXT,
    "alt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MediaFolder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "campaignId" TEXT,
    "title" TEXT,
    "masterCaption" TEXT NOT NULL,
    "storyText" TEXT,
    "linkUrl" TEXT,
    "utm" TEXT,
    "defaultStyle" TEXT NOT NULL DEFAULT 'PROFESSIONAL',
    "defaultCta" TEXT,
    "hashtagPlacement" TEXT NOT NULL DEFAULT 'INLINE',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "scheduleMode" TEXT NOT NULL DEFAULT 'NOW',
    "scheduledFor" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "adaptState" TEXT NOT NULL DEFAULT 'NONE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Content_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Content_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Content_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Content_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Content_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ContentMedia_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContentMedia_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "socialAccountId" TEXT,
    "platform" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "caption" TEXT NOT NULL DEFAULT '',
    "captionSource" TEXT NOT NULL DEFAULT 'PENDING',
    "hashtags" TEXT NOT NULL DEFAULT '',
    "hashtagPlacement" TEXT NOT NULL DEFAULT 'INLINE',
    "cta" TEXT,
    "linkUrl" TEXT,
    "firstComment" TEXT,
    "mediaAssetId" TEXT,
    "aspectRatio" TEXT,
    "targetWidth" INTEGER,
    "targetHeight" INTEGER,
    "focalPoint" TEXT,
    "cropMode" TEXT NOT NULL DEFAULT 'SMART',
    "manualOffset" TEXT,
    "edits" TEXT NOT NULL DEFAULT '{}',
    "renderedKey" TEXT,
    "renderedUrl" TEXT,
    "safeAreaOk" BOOLEAN NOT NULL DEFAULT true,
    "charLimit" INTEGER NOT NULL DEFAULT 2200,
    "charUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" DATETIME,
    "publishedAt" DATETIME,
    "lastError" TEXT,
    "lastErrorCode" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "externalPostId" TEXT,
    "permalink" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformContent_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlatformContent_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlatformContent_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "platformContentId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "jobId" TEXT,
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Schedule_platformContentId_fkey" FOREIGN KEY ("platformContentId") REFERENCES "PlatformContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platformContentId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerPostId" TEXT,
    "permalink" TEXT,
    "publishedAt" DATETIME,
    "demoMode" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Publication_platformContentId_fkey" FOREIGN KEY ("platformContentId") REFERENCES "PlatformContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "httpStatus" INTEGER,
    "providerCode" TEXT,
    "providerMessage" TEXT,
    "friendlyMessage" TEXT,
    "actionLabel" TEXT,
    "actionRoute" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublicationAttempt_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "maxCaptionLength" INTEGER NOT NULL,
    "recommendedCaptionLength" INTEGER NOT NULL,
    "minCaptionLength" INTEGER NOT NULL DEFAULT 0,
    "supportedAspectRatios" TEXT NOT NULL DEFAULT '[]',
    "recommendedAspectRatio" TEXT NOT NULL,
    "minWidth" INTEGER NOT NULL,
    "minHeight" INTEGER NOT NULL,
    "maxWidth" INTEGER NOT NULL DEFAULT 4096,
    "maxHeight" INTEGER NOT NULL DEFAULT 4096,
    "maxFileSizeKb" INTEGER NOT NULL,
    "maxVideoFileSizeKb" INTEGER,
    "supportedMimeTypes" TEXT NOT NULL DEFAULT '[]',
    "supportedImageFormats" TEXT NOT NULL DEFAULT '[]',
    "supportedVideoFormats" TEXT NOT NULL DEFAULT '[]',
    "maxVideoDuration" INTEGER,
    "minVideoDuration" INTEGER,
    "maxMediaCount" INTEGER NOT NULL DEFAULT 1,
    "maxHashtags" INTEGER NOT NULL DEFAULT 0,
    "recommendedHashtags" INTEGER NOT NULL DEFAULT 0,
    "hashtagRecommendation" TEXT NOT NULL DEFAULT '[]',
    "supportsLinks" BOOLEAN NOT NULL DEFAULT false,
    "clickableLinks" BOOLEAN NOT NULL DEFAULT false,
    "supportsStories" BOOLEAN NOT NULL DEFAULT false,
    "supportsCarousel" BOOLEAN NOT NULL DEFAULT false,
    "supportsReels" BOOLEAN NOT NULL DEFAULT false,
    "supportsScheduling" BOOLEAN NOT NULL DEFAULT true,
    "supportsFirstComment" BOOLEAN NOT NULL DEFAULT false,
    "supportsLocation" BOOLEAN NOT NULL DEFAULT false,
    "supportsMentions" BOOLEAN NOT NULL DEFAULT true,
    "supportsAltText" BOOLEAN NOT NULL DEFAULT false,
    "supportsThreads" BOOLEAN NOT NULL DEFAULT false,
    "safeArea" TEXT,
    "restrictions" TEXT NOT NULL DEFAULT '[]',
    "apiVersion" TEXT NOT NULL DEFAULT 'v1',
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'BUILTIN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlatformRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HashtagSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'GENERAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HashtagSet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HashtagEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "setId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'GENERAL',
    "language" TEXT NOT NULL DEFAULT 'tr',
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HashtagEntry_setId_fkey" FOREIGN KEY ("setId") REFERENCES "HashtagSet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HashtagEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "platform" TEXT,
    "label" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedMention_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "budget" REAL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "contentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "readAt" DATETIME,
    "actionLabel" TEXT,
    "actionRoute" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Notification_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platformContentId" TEXT,
    "contentId" TEXT,
    "campaignId" TEXT,
    "brandId" TEXT,
    "platform" TEXT NOT NULL,
    "accountHandle" TEXT,
    "date" DATETIME NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "videoViews" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "followerDelta" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'DEMO',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_platformContentId_fkey" FOREIGN KEY ("platformContentId") REFERENCES "PlatformContent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "Content" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnalyticsSnapshot_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedBy" TEXT,
    "lockedAt" DATETIME,
    "lastError" TEXT,
    "result" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "codeVerifier" TEXT,
    "redirect" TEXT,
    "consumedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BrandKit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "completenessScore" INTEGER NOT NULL DEFAULT 0,
    "lockMode" TEXT NOT NULL DEFAULT 'OFF',
    "strictMode" BOOLEAN NOT NULL DEFAULT false,
    "consistencyGate" TEXT NOT NULL DEFAULT 'WARNING',
    "learnFromApproved" BOOLEAN NOT NULL DEFAULT false,
    "shortName" TEXT,
    "legalName" TEXT,
    "mainSlogan" TEXT,
    "subSlogan" TEXT,
    "longDescription" TEXT,
    "shortDescription" TEXT,
    "industry" TEXT,
    "subIndustry" TEXT,
    "foundedYear" INTEGER,
    "country" TEXT,
    "mainMarket" TEXT,
    "targetMarkets" TEXT NOT NULL DEFAULT '[]',
    "mainLanguage" TEXT NOT NULL DEFAULT 'tr',
    "supportedLanguages" TEXT NOT NULL DEFAULT '["tr"]',
    "phone" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "supportLine" TEXT,
    "workingHours" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandKit_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandKitVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "note" TEXT,
    "snapshot" TEXT NOT NULL DEFAULT '{}',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandKitVersion_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandLogo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "usageType" TEXT NOT NULL DEFAULT 'PRIMARY',
    "name" TEXT,
    "storageKey" TEXT,
    "fileUrl" TEXT,
    "mediaAssetId" TEXT,
    "format" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "bytesKb" INTEGER,
    "transparentBg" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "minWidth" INTEGER,
    "minHeight" INTEGER,
    "minSafeSpace" TEXT,
    "preferredPosition" TEXT,
    "allowedBackgrounds" TEXT NOT NULL DEFAULT '[]',
    "disallowedBackgrounds" TEXT NOT NULL DEFAULT '[]',
    "maxRotation" INTEGER NOT NULL DEFAULT 0,
    "safeArea" TEXT NOT NULL DEFAULT '{}',
    "misuseRules" TEXT NOT NULL DEFAULT '[]',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandLogo_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "rgb" TEXT,
    "cmyk" TEXT,
    "pantone" TEXT,
    "category" TEXT NOT NULL DEFAULT 'PRIMARY',
    "usage" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "prohibited" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandColor_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandTypography" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'BODY',
    "fontFamily" TEXT NOT NULL,
    "fontWeight" TEXT,
    "fontSizeRec" TEXT,
    "lineHeight" TEXT,
    "letterSpacing" TEXT,
    "textCase" TEXT,
    "usage" TEXT,
    "licenseName" TEXT,
    "licenseProvider" TEXT,
    "licenseNote" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandTypography_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MAIN_SLOGAN',
    "text" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'tr',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandMessage_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandCTA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "platform" TEXT,
    "category" TEXT NOT NULL DEFAULT 'PREFERRED',
    "campaignId" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandCTA_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandHashtag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'DEFAULT',
    "campaignId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandHashtag_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "platform" TEXT,
    "type" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "label" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandMention_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandVisualRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PHOTOGRAPHY',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendedKeywords" TEXT NOT NULL DEFAULT '[]',
    "avoidKeywords" TEXT NOT NULL DEFAULT '[]',
    "config" TEXT NOT NULL DEFAULT '{}',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandVisualRule_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandPlatformRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "contentType" TEXT,
    "guidance" TEXT,
    "toneOverride" TEXT,
    "ctaOverride" TEXT,
    "emojiLevel" TEXT,
    "config" TEXT NOT NULL DEFAULT '{}',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandPlatformRule_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandLegalRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LEGAL_INFO',
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandLegalRule_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "name" TEXT NOT NULL,
    "storageKey" TEXT,
    "fileUrl" TEXT,
    "mediaAssetId" TEXT,
    "mimeType" TEXT,
    "format" TEXT,
    "bytesKb" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandAsset_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LIKED',
    "title" TEXT,
    "note" TEXT,
    "storageKey" TEXT,
    "fileUrl" TEXT,
    "externalUrl" TEXT,
    "mediaAssetId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandReference_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "brandKitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'STYLE_INSIGHT',
    "source" TEXT NOT NULL DEFAULT 'BRAND_KIT',
    "sourceId" TEXT,
    "summary" TEXT NOT NULL,
    "data" TEXT NOT NULL DEFAULT '{}',
    "embedding" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandMemory_brandKitId_fkey" FOREIGN KEY ("brandKitId") REFERENCES "BrandKit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "Workspace_slug_idx" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_workspaceId_key" ON "AppSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "Brand_workspaceId_idx" ON "Brand"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_workspaceId_slug_key" ON "Brand"("workspaceId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoice_brandId_key" ON "BrandVoice"("brandId");

-- CreateIndex
CREATE INDEX "SocialAccount_workspaceId_platform_idx" ON "SocialAccount"("workspaceId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_handle_key" ON "SocialAccount"("workspaceId", "platform", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "SocialProviderToken_socialAccountId_key" ON "SocialProviderToken"("socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderIntegration_workspaceId_platform_key" ON "ProviderIntegration"("workspaceId", "platform");

-- CreateIndex
CREATE INDEX "MediaFolder_workspaceId_idx" ON "MediaFolder"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_kind_idx" ON "MediaAsset"("workspaceId", "kind");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_createdAt_idx" ON "MediaAsset"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_workspaceId_contentHash_key" ON "MediaAsset"("workspaceId", "contentHash");

-- CreateIndex
CREATE INDEX "Content_workspaceId_status_idx" ON "Content"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Content_workspaceId_scheduledFor_idx" ON "Content"("workspaceId", "scheduledFor");

-- CreateIndex
CREATE INDEX "Content_brandId_idx" ON "Content"("brandId");

-- CreateIndex
CREATE INDEX "ContentMedia_contentId_idx" ON "ContentMedia"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentMedia_contentId_mediaId_key" ON "ContentMedia"("contentId", "mediaId");

-- CreateIndex
CREATE INDEX "ContentVersion_contentId_idx" ON "ContentVersion"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_contentId_version_key" ON "ContentVersion"("contentId", "version");

-- CreateIndex
CREATE INDEX "PlatformContent_contentId_idx" ON "PlatformContent"("contentId");

-- CreateIndex
CREATE INDEX "PlatformContent_status_scheduledFor_idx" ON "PlatformContent"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformContent_contentId_key_key" ON "PlatformContent"("contentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_platformContentId_key" ON "Schedule"("platformContentId");

-- CreateIndex
CREATE INDEX "Schedule_status_scheduledFor_idx" ON "Schedule"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_idempotencyKey_key" ON "Publication"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Publication_contentId_idx" ON "Publication"("contentId");

-- CreateIndex
CREATE INDEX "Publication_status_idx" ON "Publication"("status");

-- CreateIndex
CREATE INDEX "PublicationAttempt_publicationId_idx" ON "PublicationAttempt"("publicationId");

-- CreateIndex
CREATE INDEX "PlatformRule_workspaceId_platform_idx" ON "PlatformRule"("workspaceId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRule_workspaceId_platform_contentType_key" ON "PlatformRule"("workspaceId", "platform", "contentType");

-- CreateIndex
CREATE INDEX "HashtagSet_workspaceId_idx" ON "HashtagSet"("workspaceId");

-- CreateIndex
CREATE INDEX "HashtagEntry_workspaceId_group_idx" ON "HashtagEntry"("workspaceId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "HashtagEntry_workspaceId_tag_key" ON "HashtagEntry"("workspaceId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "SavedMention_workspaceId_handle_platform_key" ON "SavedMention"("workspaceId", "handle", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_workspaceId_code_key" ON "Campaign"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_readAt_idx" ON "Notification"("workspaceId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_workspaceId_date_idx" ON "AnalyticsSnapshot"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_platformContentId_idx" ON "AnalyticsSnapshot"("platformContentId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_idempotencyKey_key" ON "Job"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKit_brandId_key" ON "BrandKit"("brandId");

-- CreateIndex
CREATE INDEX "BrandKit_workspaceId_idx" ON "BrandKit"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandKitVersion_workspaceId_idx" ON "BrandKitVersion"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandKitVersion_brandId_idx" ON "BrandKitVersion"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandKitVersion_brandKitId_version_key" ON "BrandKitVersion"("brandKitId", "version");

-- CreateIndex
CREATE INDEX "BrandLogo_brandKitId_idx" ON "BrandLogo"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandLogo_workspaceId_idx" ON "BrandLogo"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandLogo_brandId_idx" ON "BrandLogo"("brandId");

-- CreateIndex
CREATE INDEX "BrandColor_brandKitId_idx" ON "BrandColor"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandColor_workspaceId_idx" ON "BrandColor"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandColor_brandId_idx" ON "BrandColor"("brandId");

-- CreateIndex
CREATE INDEX "BrandTypography_brandKitId_idx" ON "BrandTypography"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandTypography_workspaceId_idx" ON "BrandTypography"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandTypography_brandId_idx" ON "BrandTypography"("brandId");

-- CreateIndex
CREATE INDEX "BrandMessage_brandKitId_idx" ON "BrandMessage"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandMessage_workspaceId_idx" ON "BrandMessage"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandMessage_brandId_idx" ON "BrandMessage"("brandId");

-- CreateIndex
CREATE INDEX "BrandCTA_brandKitId_idx" ON "BrandCTA"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandCTA_workspaceId_idx" ON "BrandCTA"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandCTA_brandId_idx" ON "BrandCTA"("brandId");

-- CreateIndex
CREATE INDEX "BrandHashtag_brandKitId_idx" ON "BrandHashtag"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandHashtag_workspaceId_idx" ON "BrandHashtag"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandHashtag_brandId_idx" ON "BrandHashtag"("brandId");

-- CreateIndex
CREATE INDEX "BrandMention_brandKitId_idx" ON "BrandMention"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandMention_workspaceId_idx" ON "BrandMention"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandMention_brandId_idx" ON "BrandMention"("brandId");

-- CreateIndex
CREATE INDEX "BrandVisualRule_brandKitId_idx" ON "BrandVisualRule"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandVisualRule_workspaceId_idx" ON "BrandVisualRule"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandVisualRule_brandId_idx" ON "BrandVisualRule"("brandId");

-- CreateIndex
CREATE INDEX "BrandPlatformRule_workspaceId_idx" ON "BrandPlatformRule"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandPlatformRule_brandId_idx" ON "BrandPlatformRule"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPlatformRule_brandKitId_platform_contentType_key" ON "BrandPlatformRule"("brandKitId", "platform", "contentType");

-- CreateIndex
CREATE INDEX "BrandLegalRule_workspaceId_idx" ON "BrandLegalRule"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandLegalRule_brandId_idx" ON "BrandLegalRule"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandLegalRule_brandKitId_category_key_key" ON "BrandLegalRule"("brandKitId", "category", "key");

-- CreateIndex
CREATE INDEX "BrandAsset_brandKitId_idx" ON "BrandAsset"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandAsset_workspaceId_idx" ON "BrandAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandAsset_brandId_idx" ON "BrandAsset"("brandId");

-- CreateIndex
CREATE INDEX "BrandReference_brandKitId_idx" ON "BrandReference"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandReference_workspaceId_idx" ON "BrandReference"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandReference_brandId_idx" ON "BrandReference"("brandId");

-- CreateIndex
CREATE INDEX "BrandMemory_brandKitId_idx" ON "BrandMemory"("brandKitId");

-- CreateIndex
CREATE INDEX "BrandMemory_workspaceId_idx" ON "BrandMemory"("workspaceId");

-- CreateIndex
CREATE INDEX "BrandMemory_brandId_idx" ON "BrandMemory"("brandId");

