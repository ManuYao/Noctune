-- Every room of the team wears "Néon nuit", like French touch: its scene keeps the night blue of the entry screen and only
-- the objects and the neon of its genre change, so the page around it is the same blue (Sunset club made Rock progressif,
-- Jazz café and Hip-hop classics brown around a blue scene). Members still choose any ambiance for their own rooms.
UPDATE rooms SET theme = 'neon' WHERE id IN ('rock-progressif', 'jazz-cafe', 'hip-hop-classics') AND host_account_id IS NULL;
