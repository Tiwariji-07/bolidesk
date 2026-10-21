-- Billing documents: integer paise, date-only due dates, issue-time numbering, GST fields.
-- Existing rows are converted in place; nothing is dropped.

CREATE TYPE "GstScheme" AS ENUM ('REGULAR', 'COMPOSITION', 'UNREGISTERED');
CREATE TYPE "GstRateProfile" AS ENUM ('REFORM_2025', 'LEGACY_2017');
CREATE TYPE "BillingDocumentType" AS ENUM ('TAX_INVOICE', 'BILL_OF_SUPPLY');
CREATE TYPE "DocumentKind" AS ENUM ('INVOICE', 'QUOTE', 'RECEIPT', 'CREDIT_NOTE');

-- OVERDUE is now derived from the due date, so stored overdue invoices go back to SENT.
UPDATE "Invoice" SET "status" = 'SENT' WHERE "status" = 'OVERDUE';
CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'SENT', 'PAID', 'CREDITED');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- Used by the next migration (a new enum value cannot be used in the transaction that adds it).
ALTER TYPE "QuoteStatus" ADD VALUE 'INVOICED';

-- Money: whole rupees -> integer paise.
ALTER TABLE "Quote" RENAME COLUMN "subtotal" TO "subtotalPaise";
ALTER TABLE "Quote" RENAME COLUMN "tax" TO "taxPaise";
ALTER TABLE "Quote" RENAME COLUMN "total" TO "totalPaise";
UPDATE "Quote" SET "subtotalPaise" = "subtotalPaise" * 100, "taxPaise" = "taxPaise" * 100, "totalPaise" = "totalPaise" * 100;
ALTER TABLE "Invoice" RENAME COLUMN "subtotal" TO "subtotalPaise";
ALTER TABLE "Invoice" RENAME COLUMN "tax" TO "taxPaise";
ALTER TABLE "Invoice" RENAME COLUMN "total" TO "totalPaise";
UPDATE "Invoice" SET "subtotalPaise" = "subtotalPaise" * 100, "taxPaise" = "taxPaise" * 100, "totalPaise" = "totalPaise" * 100;
UPDATE "PaymentRequest" SET "amount" = "amount" * 100;

-- Line items: unitPrice rupees -> paise inside the JSON arrays.
CREATE FUNCTION pg_temp.lines_to_paise(lines jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0 THEN (
    SELECT jsonb_agg(line || jsonb_build_object('unitPrice', round((line->>'unitPrice')::numeric * 100)::int) ORDER BY ord)
    FROM jsonb_array_elements(lines) WITH ORDINALITY AS t(line, ord)
  ) ELSE lines END
$$;
UPDATE "Quote" SET "linesJson" = pg_temp.lines_to_paise("linesJson");
UPDATE "Invoice" SET "linesJson" = pg_temp.lines_to_paise("linesJson");
UPDATE "Job" SET "parsedJson" = jsonb_set("parsedJson", '{lines}', pg_temp.lines_to_paise("parsedJson"->'lines'))
  WHERE "parsedJson" ? 'lines';

-- Numbers are allocated at issue/send time; existing numbers are kept unchanged.
ALTER TABLE "Quote" ALTER COLUMN "number" DROP NOT NULL,
  ADD COLUMN "placeOfSupply" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "dueDate" SET DATA TYPE DATE;

ALTER TABLE "Invoice" ALTER COLUMN "number" DROP NOT NULL,
  ADD COLUMN "buyerSnapshot" JSONB,
  ADD COLUMN "sellerSnapshot" JSONB,
  ADD COLUMN "cgstPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sgstPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "igstPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "documentType" "BillingDocumentType",
  ADD COLUMN "issueDate" DATE,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "issuedByUserId" TEXT,
  ADD COLUMN "paymentTerms" TEXT,
  ADD COLUMN "placeOfSupply" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ALTER COLUMN "dueDate" SET DATA TYPE DATE;

ALTER TABLE "Customer" ADD COLUMN "gstin" TEXT, ADD COLUMN "stateCode" TEXT;

ALTER TABLE "Workspace" ADD COLUMN "address" TEXT,
  ADD COLUMN "defaultCode" TEXT,
  ADD COLUMN "defaultTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
  ADD COLUMN "gstRateProfile" "GstRateProfile" NOT NULL DEFAULT 'REFORM_2025',
  ADD COLUMN "gstScheme" "GstScheme",
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "stateCode" TEXT,
  ADD COLUMN "upiId" TEXT;

-- Issued invoices predate snapshots: record what is known now and mark it as reconstructed.
UPDATE "Invoice" i SET
  "issuedAt" = i."createdAt",
  "issueDate" = ((i."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date,
  "sellerSnapshot" = jsonb_build_object('legalName', w."name", 'tradeName', w."brandName", 'address', w."address", 'stateCode', w."stateCode", 'gstin', w."gstin", 'legacy', true),
  "buyerSnapshot" = jsonb_build_object('name', c."name", 'address', c."address", 'stateCode', NULL, 'gstin', NULL, 'phone', c."phone", 'email', c."email", 'legacy', true)
FROM "Workspace" w, "Customer" c
WHERE i."workspaceId" = w."id" AND i."customerId" = c."id" AND i."status" <> 'DRAFT';

-- Phones: one stored form for Indian mobiles (+91XXXXXXXXXX). Any group of customers in a workspace that
-- would end up with the same number (e.g. "9876543210" and "+91 98765 43210") is left unchanged for staff to merge.
WITH normalized AS (
  SELECT "id", "workspaceId", "phone", CASE
    WHEN d ~ '^[6-9][0-9]{9}$' THEN '+91' || d
    WHEN d ~ '^91[6-9][0-9]{9}$' THEN '+' || d
    WHEN d ~ '^0[6-9][0-9]{9}$' THEN '+91' || substr(d, 2)
    ELSE NULL END AS value
  FROM (SELECT "id", "workspaceId", "phone", regexp_replace("phone", '[^0-9]', '', 'g') AS d FROM "Customer") digits
), safe AS (
  SELECT n."id", n.value FROM normalized n
  WHERE n.value IS NOT NULL AND n."phone" <> n.value
    AND (SELECT count(*) FROM normalized m WHERE m."workspaceId" = n."workspaceId" AND (m.value = n.value OR m."phone" = n.value)) = 1
)
UPDATE "Customer" c SET "phone" = safe.value FROM safe WHERE c."id" = safe."id";

CREATE TABLE "DocumentCounter" (
  "workspaceId" TEXT NOT NULL,
  "kind" "DocumentKind" NOT NULL,
  "financialYear" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL,
  CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("workspaceId", "kind", "financialYear"),
  CONSTRAINT "DocumentCounter_lastValue_check" CHECK ("lastValue" BETWEEN 1 AND 999999)
);
ALTER TABLE "DocumentCounter" ADD CONSTRAINT "DocumentCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_money_check" CHECK ("subtotalPaise" >= 0 AND "taxPaise" >= 0 AND "totalPaise" = "subtotalPaise" + "taxPaise");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_money_check" CHECK ("subtotalPaise" >= 0 AND "taxPaise" >= 0 AND "cgstPaise" >= 0 AND "sgstPaise" >= 0 AND "igstPaise" >= 0 AND "totalPaise" = "subtotalPaise" + "taxPaise");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_issued_number_check" CHECK ("status" = 'DRAFT' OR "number" IS NOT NULL);
