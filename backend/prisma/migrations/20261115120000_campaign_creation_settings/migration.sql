-- How a campaign's characters are created: the ways the GM lets players set
-- ability scores, and how closely creation holds to the rules as written.
-- Campaigns that exist already get the defaults.

-- CreateEnum
CREATE TYPE "CampaignDetailLevel" AS ENUM ('FAITHFUL', 'FLEXIBLE');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "abilityScoreMethods" TEXT[] DEFAULT ARRAY['POINT_BUY', 'STANDARD_ARRAY']::TEXT[],
ADD COLUMN     "detailLevel" "CampaignDetailLevel" NOT NULL DEFAULT 'FLEXIBLE';
