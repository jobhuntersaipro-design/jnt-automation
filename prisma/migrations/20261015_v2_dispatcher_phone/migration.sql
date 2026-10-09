-- v2, additive: a dispatcher's mobile number for sending payslip links. v1 never reads it.
ALTER TABLE "Dispatcher" ADD COLUMN "phone" TEXT;
