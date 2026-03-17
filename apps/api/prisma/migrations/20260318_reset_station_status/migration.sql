-- Reset station status from ERROR back to ACTIVE
-- Stations were set to ERROR when FFmpeg wasn't installed on previous deploys
UPDATE stations SET status = 'ACTIVE' WHERE status = 'ERROR';
