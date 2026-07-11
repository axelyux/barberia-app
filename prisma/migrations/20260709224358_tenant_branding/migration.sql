-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "whatsappNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "planPriceCents" INTEGER NOT NULL DEFAULT 20000,
    "nextDueDate" DATETIME,
    "logoUrl" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#D9A441',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Tenant" ("createdAt", "id", "name", "nextDueDate", "ownerName", "planPriceCents", "slug", "status", "whatsappNumber") SELECT "createdAt", "id", "name", "nextDueDate", "ownerName", "planPriceCents", "slug", "status", "whatsappNumber" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "Tenant_whatsappNumber_key" ON "Tenant"("whatsappNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
