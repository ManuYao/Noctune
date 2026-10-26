-- The rooms of the team all get a dark ambiance: "Jazz café" was seeded with "Vinyle clair", and its light scene made
-- the room and its card in the list almost white. "Vinyle clair" stays for the rooms of members who choose it.
UPDATE rooms SET theme = 'sunset' WHERE id = 'jazz-cafe' AND host_account_id IS NULL;
