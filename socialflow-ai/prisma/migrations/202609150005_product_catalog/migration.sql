-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_workspaceId_brandId_fkey" FOREIGN KEY ("workspaceId", "brandId") REFERENCES "Brand" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinor" INTEGER,
    "currency" TEXT NOT NULL,
    "currencyScale" INTEGER NOT NULL,
    "stock" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL DEFAULT 'USER_PROVIDED',
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_workspaceId_productId_fkey" FOREIGN KEY ("workspaceId", "productId") REFERENCES "Product" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "fromStock" INTEGER,
    "toStock" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_workspaceId_variantId_fkey" FOREIGN KEY ("workspaceId", "variantId") REFERENCES "ProductVariant" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Product_workspaceId_brandId_status_idx" ON "Product"("workspaceId", "brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_workspaceId_id_key" ON "Product"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ProductVariant_workspaceId_productId_idx" ON "ProductVariant"("workspaceId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_workspaceId_id_key" ON "ProductVariant"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_workspaceId_sku_key" ON "ProductVariant"("workspaceId", "sku");

-- CreateIndex
CREATE INDEX "InventoryMovement_workspaceId_variantId_createdAt_idx" ON "InventoryMovement"("workspaceId", "variantId", "createdAt");

