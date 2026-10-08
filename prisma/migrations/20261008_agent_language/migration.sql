-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'zh');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "language" "Language";
