-- The Rock room takes the name of the music its first tracks are (29/10/2026). server/src/catalog.ts holds the same values.
UPDATE rooms SET name = 'Rock Anthems', name_key = 'rock anthems',
  description = 'Hymnes du rock, hard rock et post-grunge : refrains à chanter à pleine voix.'
  WHERE id = 'rock-progressif' AND host_account_id IS NULL;
