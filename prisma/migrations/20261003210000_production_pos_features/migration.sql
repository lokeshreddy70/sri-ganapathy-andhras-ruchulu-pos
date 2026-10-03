ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;

ALTER TABLE "MenuItem"
ADD COLUMN IF NOT EXISTS "soldOut" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "HeldBill" (
  "id" TEXT NOT NULL,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "notes" TEXT,
  "subtotal" DECIMAL(10,2) NOT NULL,
  "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "locationType" TEXT NOT NULL DEFAULT 'COUNTER',
  "customLocation" TEXT,
  "payload" JSONB NOT NULL,
  "branchId" TEXT NOT NULL,
  "benchId" TEXT,
  "cashierId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HeldBill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS
"HeldBill_branchId_updatedAt_idx"
ON "HeldBill"("branchId","updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HeldBill_branchId_fkey'
  ) THEN
    ALTER TABLE "HeldBill"
    ADD CONSTRAINT "HeldBill_branchId_fkey"
    FOREIGN KEY ("branchId")
    REFERENCES "Branch"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HeldBill_benchId_fkey'
  ) THEN
    ALTER TABLE "HeldBill"
    ADD CONSTRAINT "HeldBill_benchId_fkey"
    FOREIGN KEY ("benchId")
    REFERENCES "Bench"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HeldBill_cashierId_fkey'
  ) THEN
    ALTER TABLE "HeldBill"
    ADD CONSTRAINT "HeldBill_cashierId_fkey"
    FOREIGN KEY ("cashierId")
    REFERENCES "User"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;