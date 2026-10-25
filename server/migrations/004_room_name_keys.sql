-- The key of a room name now ignores accents and invisible emoji joiners as well as case (`roomNameKey` in
-- shared/validation.ts), so that "Jazz cafe" cannot sit next to "Jazz café". The one room of the team whose name has an
-- accent gets its new key. (The other team rooms have none: their keys do not change.)
UPDATE rooms SET name_key = 'jazz cafe' WHERE id = 'jazz-cafe' AND host_account_id IS NULL;
