-- Noctune plays music only. A playlist track whose video turned out not to be in YouTube's "Music" category is flagged
-- (derived from the same refresh as `unavailable`; no YouTube metadata is added, so the 30-day rule is unaffected).
ALTER TABLE playlist_tracks ADD COLUMN not_music boolean NOT NULL DEFAULT false;

-- Tracks kept before the rule have never had their category read: look at them again at the next refresh.
UPDATE playlist_tracks SET checked_at = 'epoch';
