-- The Rock room opens up to every kind of rock: classic, hard, grunge, metal (29/10/2026). server/src/catalog.ts holds the same values.
UPDATE rooms SET name = 'Rock & Légendes', name_key = 'rock & legendes',
  description = 'Rock classique, hard rock, grunge et metal : les hymnes et les riffs qui ont fait l’histoire.'
  WHERE id = 'rock-progressif' AND host_account_id IS NULL;
