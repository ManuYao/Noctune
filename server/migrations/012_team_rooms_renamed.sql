-- The rooms of the team renamed for 2026 (decided with the user on 28/10/2026). server/src/catalog.ts holds the same values
-- (a test checks that they match); name_key is the name without accents or case, as `roomNameKey` computes it.
-- Ids of the rooms whose genre does not change stay as they are; the two afro rooms (added a day earlier) get fitting ids.
UPDATE rooms SET name = 'Rock', name_key = 'rock',
  description = 'Du rock, du hard rock et du progressif : guitares, riffs et longs morceaux.'
  WHERE id = 'rock-progressif' AND host_account_id IS NULL;
UPDATE rooms SET name = 'Bass & Électro', name_key = 'bass & electro',
  description = 'Dubstep, bass music et gros drops : de quoi faire trembler les enceintes.'
  WHERE id = 'electro-nuit' AND host_account_id IS NULL;
UPDATE rooms SET name = 'Hip-hop classique', name_key = 'hip-hop classique'
  WHERE id = 'hip-hop-classics' AND host_account_id IS NULL;
UPDATE rooms SET name = 'Rap français', name_key = 'rap francais', styles = ARRAY['rap'],
  description = 'Le rap en français, des classiques aux nouveautés, avec les mots de la rue et d’ailleurs.'
  WHERE id = 'french-touch' AND host_account_id IS NULL;
UPDATE rooms SET id = 'afro-caribeen-zouk', name = 'Afro-Caribéen & Zouk', name_key = 'afro-caribeen & zouk',
  description = 'Zouk, kompa, dancehall, reggae et soca : le soleil des Caraïbes dans les enceintes.'
  WHERE id = 'afro-caraibes' AND host_account_id IS NULL;
UPDATE rooms SET id = 'mood-afro', name = 'Mood Afro', name_key = 'mood afro',
  description = 'Coupé-décalé, dombolo, rap africain et sons du continent : la fierté de chez nous.'
  WHERE id = 'zouk-dancehall' AND host_account_id IS NULL;
