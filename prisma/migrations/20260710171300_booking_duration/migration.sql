-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "serviceId" TEXT,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priceChargedCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Booking" ("createdAt", "customerName", "customerPhone", "day", "id", "priceChargedCents", "scheduledAt", "serviceId", "status", "tenantId", "time") SELECT "createdAt", "customerName", "customerPhone", "day", "id", "priceChargedCents", "scheduledAt", "serviceId", "status", "tenantId", "time" FROM "Booking";
DROP TABLE "Booking";
ALTER TABLE "new_Booking" RENAME TO "Booking";
CREATE INDEX "Booking_tenantId_createdAt_idx" ON "Booking"("tenantId", "createdAt");
CREATE INDEX "Booking_tenantId_scheduledAt_idx" ON "Booking"("tenantId", "scheduledAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
