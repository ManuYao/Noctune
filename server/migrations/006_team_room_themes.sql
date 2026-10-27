-- The scene of each room now follows its genre (wall, floor and decor), so the ambiance of the interface around it only
-- has to go with that scene: the lime green of "Jungle" clashed with the bricks of Hip-hop classics, and the orange of
-- "Sunset club" with the pink and gold of French touch.
UPDATE rooms SET theme = 'sunset' WHERE id = 'hip-hop-classics' AND host_account_id IS NULL;
UPDATE rooms SET theme = 'neon' WHERE id = 'french-touch' AND host_account_id IS NULL;
