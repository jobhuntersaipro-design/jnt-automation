-- CreateEnum
CREATE TYPE "UiVersion" AS ENUM ('V1', 'V2');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "uiVersion" "UiVersion" NOT NULL DEFAULT 'V1';
