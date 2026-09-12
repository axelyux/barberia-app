-- CreateTable
CREATE TABLE "TenantPaymentMethod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TenantPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantPaymentMethod_tenantId_method_key" ON "TenantPaymentMethod"("tenantId", "method");

-- AddForeignKey
ALTER TABLE "TenantPaymentMethod" ADD CONSTRAINT "TenantPaymentMethod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
