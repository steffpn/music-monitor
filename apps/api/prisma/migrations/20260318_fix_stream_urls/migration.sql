-- Fix Virgin Radio stream URL (previous URL was invalid)
UPDATE stations SET stream_url = 'https://astreaming.edi.ro:8443/VirginRadio_aac' WHERE acrcloud_stream_id = '222987';
