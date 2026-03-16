-- CreateTable
CREATE TABLE watched_stations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    station_id INT NOT NULL REFERENCES stations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CreateIndex
CREATE UNIQUE INDEX idx_watched_stations_user_station ON watched_stations(user_id, station_id);

-- CreateIndex
CREATE INDEX idx_watched_stations_user ON watched_stations(user_id);
