-- v2 only, additive: when a month-on-month vehicle/type change was confirmed for pay.
ALTER TABLE "DispatcherProfile" ADD COLUMN "confirmedAt" TIMESTAMP(3);
