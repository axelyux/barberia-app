-- CreateTable
CREATE TABLE "BusinessHour" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openMin" INTEGER NOT NULL DEFAULT 540,
    "closeMin" INTEGER NOT NULL DEFAULT 1200,
    CONSTRAINT "BusinessHour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessHour_tenantId_weekday_key" ON "BusinessHour"("tenantId", "weekday");
