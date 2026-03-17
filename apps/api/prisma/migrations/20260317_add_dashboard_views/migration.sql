-- Replace TimescaleDB continuous aggregates with standard PostgreSQL views

CREATE OR REPLACE VIEW daily_station_plays AS
SELECT
  station_id,
  DATE_TRUNC('day', detected_at) AS bucket,
  COUNT(*)::int AS play_count,
  COUNT(DISTINCT song_title)::int AS unique_songs,
  COUNT(DISTINCT artist_name)::int AS unique_artists
FROM detections
GROUP BY station_id, DATE_TRUNC('day', detected_at);

CREATE OR REPLACE VIEW weekly_artist_plays AS
SELECT
  artist_name,
  DATE_TRUNC('week', detected_at) AS bucket,
  COUNT(*)::int AS play_count,
  COUNT(DISTINCT station_id)::int AS station_count
FROM detections
GROUP BY artist_name, DATE_TRUNC('week', detected_at);

CREATE OR REPLACE VIEW monthly_song_plays AS
SELECT
  song_title,
  artist_name,
  isrc,
  DATE_TRUNC('month', detected_at) AS bucket,
  COUNT(*)::int AS play_count,
  COUNT(DISTINCT station_id)::int AS station_count
FROM detections
GROUP BY song_title, artist_name, isrc, DATE_TRUNC('month', detected_at);
