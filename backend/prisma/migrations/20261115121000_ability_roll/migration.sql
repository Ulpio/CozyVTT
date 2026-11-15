-- A player's ability roll, made once on the server and kept until a
-- character is created from it.

-- CreateTable
CREATE TABLE "AbilityRoll" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "campaignId" TEXT,
    "rolls" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbilityRoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AbilityRoll_userId_scope_key" ON "AbilityRoll"("userId", "scope");

-- AddForeignKey
ALTER TABLE "AbilityRoll" ADD CONSTRAINT "AbilityRoll_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityRoll" ADD CONSTRAINT "AbilityRoll_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
