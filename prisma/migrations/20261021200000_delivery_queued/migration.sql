-- A delivery row is written before calling WhatsApp, so a second sender sees it and does not message twice.
ALTER TYPE "DeliveryStatus" ADD VALUE 'QUEUED' BEFORE 'SENT';
