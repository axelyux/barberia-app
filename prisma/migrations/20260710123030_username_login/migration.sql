/*
  Warnings:

  - You are about to drop the column `email` on the `StaffUser` table. All the data in the column will be lost.
  - Added the required column `username` to the `StaffUser` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StaffUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USUARIO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StaffUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StaffUser" ("createdAt", "id", "name", "passwordHash", "role", "tenantId") SELECT "createdAt", "id", "name", "passwordHash", "role", "tenantId" FROM "StaffUser";
DROP TABLE "StaffUser";
ALTER TABLE "new_StaffUser" RENAME TO "StaffUser";
CREATE UNIQUE INDEX "StaffUser_tenantId_username_key" ON "StaffUser"("tenantId", "username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
