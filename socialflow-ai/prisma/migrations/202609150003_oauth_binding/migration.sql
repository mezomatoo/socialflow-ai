-- Additive binding only; existing OAuth states remain nullable and cannot complete the new flow.
ALTER TABLE "OAuthState" ADD COLUMN "socialAccountId" TEXT;
ALTER TABLE "OAuthState" ADD COLUMN "redirectUri" TEXT;
ALTER TABLE "OAuthState" ADD COLUMN "accountUpdatedAt" DATETIME;
