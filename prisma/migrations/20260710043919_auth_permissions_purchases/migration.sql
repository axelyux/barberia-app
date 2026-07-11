/*
  Warnings:

  - You are about to drop the column `canViewBot` on the `StaffUser` table. All the data in the column will be lost.
  - You are about to drop the column `canViewCatalog` on the `StaffUser` table. All the data in the column will be lost.
  - You are about to drop the column `canViewFinance` on the `StaffUser` table. All the data in the column will be lost.
  - You are about to drop the column `canViewSettings` on the `StaffUser` table. All the data in the column will be lost.
  - You are about to drop the column `canViewToday` on the `StaffUser` table. All the data in the column will be lost.
  - Added the required column `passwordHash` to the `StaffUser` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffUserId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Permission_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductPurchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USUARIO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffUser" ("createdAt", "email", "id", "name", "role", "tenantId") SELECT "createdAt", "email", "id", "name", "role", "tenantId" FROM "StaffUser";
DROP TABLE "StaffUser";
ALTER TABLE "new_StaffUser" RENAME TO "StaffUser";
CREATE UNIQUE INDEX "StaffUser_tenantId_email_key" ON "StaffUser"("tenantId", "email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Permission_staffUserId_module_key" ON "Permission"("staffUserId", "module");

-- CreateIndex
CREATE INDEX "ProductPurchase_tenantId_createdAt_idx" ON "ProductPurchase"("tenantId", "createdAt");
