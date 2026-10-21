-- Quotes that already have an invoice are frozen as INVOICED.
UPDATE "Quote" q SET "status" = 'INVOICED' WHERE EXISTS (SELECT 1 FROM "Invoice" i WHERE i."quoteId" = q."id");
