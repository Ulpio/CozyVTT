-- The compendium: rules data from the owner's books, one entry per book,
-- type and slug, and the four books it starts with. Monsters stay in
-- CreatureTemplate (source = the book's id), which gains a mark for a
-- creature the admin corrected in the app, so an import leaves it alone.

-- CreateTable
CREATE TABLE "CompendiumBook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameSystem" "GameSystem" NOT NULL,

    CONSTRAINT "CompendiumBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompendiumEntry" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "search" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "editedAt" TIMESTAMP(3),
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompendiumEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompendiumEntry_bookId_type_slug_key" ON "CompendiumEntry"("bookId", "type", "slug");
CREATE INDEX "CompendiumEntry_type_idx" ON "CompendiumEntry"("type");
CREATE INDEX "CompendiumEntry_bookId_idx" ON "CompendiumEntry"("bookId");
CREATE INDEX "CompendiumEntry_search_idx" ON "CompendiumEntry"("search");

-- AddForeignKey
ALTER TABLE "CompendiumEntry" ADD CONSTRAINT "CompendiumEntry_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "CompendiumBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CreatureTemplate" ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "editedById" TEXT;

-- The books
INSERT INTO "CompendiumBook" ("id", "name", "gameSystem") VALUES
    ('phb', 'Livro do Jogador', 'FIFTH_EDITION'),
    ('mm', 'Manual dos Monstros', 'FIFTH_EDITION'),
    ('dmg', 'Guia do Mestre', 'FIFTH_EDITION'),
    ('srd', 'SRD 5.1 (inglês)', 'FIFTH_EDITION');
