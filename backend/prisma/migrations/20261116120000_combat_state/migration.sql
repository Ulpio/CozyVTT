-- The combat order, the turn and each combatant's spending, kept per campaign.

-- CreateTable
CREATE TABLE "CombatState" (
    "campaignId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CombatState_pkey" PRIMARY KEY ("campaignId")
);

-- AddForeignKey
ALTER TABLE "CombatState" ADD CONSTRAINT "CombatState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
