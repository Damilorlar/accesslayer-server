CREATE TABLE "CreatorPost" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreatorPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreatorPost_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES "CreatorProfile"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreatorPost_creatorId_createdAt_idx"
ON "CreatorPost"("creatorId", "createdAt");
