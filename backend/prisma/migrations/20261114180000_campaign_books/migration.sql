-- The compendium books each campaign uses. A campaign that exists already
-- gets every book of its system, the English SRD included, so nothing it
-- offered disappears; a campaign with no system gets none.

-- CreateTable
CREATE TABLE "CampaignBook" (
    "campaignId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,

    CONSTRAINT "CampaignBook_pkey" PRIMARY KEY ("campaignId", "bookId")
);

-- CreateIndex
CREATE INDEX "CampaignBook_bookId_idx" ON "CampaignBook"("bookId");

-- AddForeignKey
ALTER TABLE "CampaignBook" ADD CONSTRAINT "CampaignBook_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignBook" ADD CONSTRAINT "CampaignBook_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "CompendiumBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The books of the campaigns that exist
INSERT INTO "CampaignBook" ("campaignId", "bookId")
SELECT c."id", b."id"
FROM "Campaign" c
JOIN "CompendiumBook" b ON b."gameSystem" = c."gameSystem";
