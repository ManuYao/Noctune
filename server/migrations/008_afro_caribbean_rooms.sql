-- Two more rooms of the team, for afrobeats and the music of the Caribbean. server/src/catalog.ts holds the same values
-- (a test checks that they match); name_key is the name without accents or case, as `roomNameKey` computes it.
INSERT INTO rooms (id, name, name_key, description, styles, theme, max_track_sec, repeat_delay_sec, max_djs, seed_position) VALUES
  ('afro-caraibes', 'Afro Caraïbes', 'afro caraibes', 'Afrobeats, amapiano et rythmes des îles : de quoi danser jusqu’au matin.', ARRAY['afro'], 'neon', 360, 7200, 12, 7),
  ('zouk-dancehall', 'Zouk & Dancehall', 'zouk & dancehall', 'Zouk, kompa, dancehall et soca : le soleil des Caraïbes dans les enceintes.', ARRAY['afro'], 'neon', 360, 7200, 12, 8);
