-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "billplzAmount" DOUBLE PRECISION,
ADD COLUMN     "billplzBillId" TEXT,
ADD COLUMN     "billplzUrl" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_billplzBillId_key" ON "Invoice"("billplzBillId");
