-- CreateTable
CREATE TABLE "cantos" (
    "title" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "nh" SMALLINT,
    "content" TEXT,
    "type" TEXT,

    CONSTRAINT "cantos_pkey" PRIMARY KEY ("id")
);