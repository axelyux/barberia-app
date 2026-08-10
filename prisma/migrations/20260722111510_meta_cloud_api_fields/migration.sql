-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "metaPhoneNumberId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "metaAccessToken" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "metaPort" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_metaPhoneNumberId_key" ON "Tenant"("metaPhoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_metaPort_key" ON "Tenant"("metaPort");
