-- Convert detections table to TimescaleDB hypertable with 1-day chunk interval
SELECT create_hypertable('detections', 'detected_at',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- Continuous Aggregate: Daily station play counts
CREATE MATERIALIZED VIEW daily_station_plays
WITH (timescaledb.continuous) AS
SELECT
  station_id,
  time_bucket('1 day', detected_at) AS bucket,
  COUNT(*) AS play_count,
  COUNT(DISTINCT song_title) AS unique_songs,
  COUNT(DISTINCT artist_name) AS unique_artists
FROM detections
GROUP BY station_id, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('daily_station_plays',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

-- Continuous Aggregate: Weekly artist play counts
CREATE MATERIALIZED VIEW weekly_artist_plays
WITH (timescaledb.continuous) AS
SELECT
  artist_name,
  time_bucket('7 days', detected_at) AS bucket,
  COUNT(*) AS play_count,
  COUNT(DISTINCT station_id) AS station_count
FROM detections
GROUP BY artist_name, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('weekly_artist_plays',
  start_offset => INTERVAL '28 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '6 hours'
);

-- Continuous Aggregate: Monthly song play counts
CREATE MATERIALIZED VIEW monthly_song_plays
WITH (timescaledb.continuous) AS
SELECT
  song_title,
  artist_name,
  isrc,
  time_bucket('30 days', detected_at) AS bucket,
  COUNT(*) AS play_count,
  COUNT(DISTINCT station_id) AS station_count
FROM detections
GROUP BY song_title, artist_name, isrc, bucket
WITH NO DATA;

SELECT add_continuous_aggregate_policy('monthly_song_plays',
  start_offset => INTERVAL '90 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day'
);
