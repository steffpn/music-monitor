-- CreateTable
CREATE TABLE "stations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "stream_url" TEXT NOT NULL,
    "station_type" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'RO',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "last_heartbeat" TIMESTAMP(3),
    "restart_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable (TimescaleDB-compatible: composite PK includes partition column)
CREATE TABLE "detections" (
    "id" SERIAL NOT NULL,
    "station_id" INTEGER NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "song_title" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "album_title" TEXT,
    "isrc" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "raw_callback_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id", "detected_at")
);

-- CreateTable
CREATE TABLE "airplay_events" (
    "id" SERIAL NOT NULL,
    "station_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "song_title" TEXT NOT NULL,
    "artist_name" TEXT NOT NULL,
    "isrc" TEXT,
    "play_count" INTEGER NOT NULL DEFAULT 1,
    "snippet_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "airplay_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "scope_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_by_id" INTEGER NOT NULL,
    "redeemed_by_id" INTEGER,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemed_at" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_snippets" (
    "id" SERIAL NOT NULL,
    "detection_id" INTEGER NOT NULL,
    "detection_detected_at" TIMESTAMP(3) NOT NULL,
    "station_id" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL DEFAULT 5000,
    "encoding" TEXT NOT NULL DEFAULT 'aac',
    "bitrate" INTEGER NOT NULL DEFAULT 128,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audio_snippets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "detections_station_id_detected_at_idx" ON "detections"("station_id", "detected_at");

-- CreateIndex
CREATE INDEX "detections_artist_name_detected_at_idx" ON "detections"("artist_name", "detected_at");

-- CreateIndex
CREATE INDEX "detections_isrc_idx" ON "detections"("isrc");

-- CreateIndex (includes detected_at for TimescaleDB hypertable compatibility)
CREATE UNIQUE INDEX "detections_raw_callback_id_key" ON "detections"("raw_callback_id", "detected_at");

-- CreateIndex
CREATE INDEX "airplay_events_station_id_started_at_idx" ON "airplay_events"("station_id", "started_at");

-- CreateIndex
CREATE INDEX "airplay_events_artist_name_started_at_idx" ON "airplay_events"("artist_name", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_code_key" ON "invitations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_redeemed_by_id_key" ON "invitations"("redeemed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "audio_snippets_detection_id_detection_detected_at_key" ON "audio_snippets"("detection_id", "detection_detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- AddForeignKey (station_id FK removed for detections because TimescaleDB hypertables
-- do not support foreign key references TO hypertables or FROM hypertables with
-- composite PKs that differ from the referenced table's PK. Referential integrity
-- for detections.station_id is enforced at the application level via Prisma.)
ALTER TABLE "airplay_events" ADD CONSTRAINT "airplay_events_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_redeemed_by_id_fkey" FOREIGN KEY ("redeemed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_snippets" ADD CONSTRAINT "audio_snippets_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Note: FK from audio_snippets.detection_id to detections.id is omitted because
-- TimescaleDB hypertable has composite PK (id, detected_at). Referential integrity
-- is enforced at the application level via Prisma relations.
