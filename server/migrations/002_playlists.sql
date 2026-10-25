-- Personal playlists: a member's own lists of YouTube videos.
--
-- A playlist belongs to one account and goes with it (ON DELETE CASCADE): it is the member's own data, never shown to
-- anybody else. The names of one member's playlists are compared in lower case, and the server computes that form
-- itself (name_key), as for pseudos: the rule does not depend on the locale of whichever PostgreSQL runs below.

CREATE TABLE playlists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text        NOT NULL,
  name_key   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_key)
);

-- What YouTube says about a video (title, channel, length) may be kept for 30 days at most without a refresh (the terms
-- of the YouTube API): `fetched_at` is the last time it was read, `checked_at` the last time the video was looked at
-- (a video that can no longer be played is looked at again, but there is nothing new to read about it).
CREATE TABLE playlist_tracks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id uuid        NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  position    integer     NOT NULL CHECK (position >= 0),
  video_id    text        NOT NULL,
  title       text        NOT NULL,
  artist      text        NOT NULL,
  duration_sec integer    NOT NULL CHECK (duration_sec > 0),
  unavailable boolean     NOT NULL DEFAULT false,
  fetched_at  timestamptz NOT NULL,
  checked_at  timestamptz NOT NULL,
  added_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, video_id),
  -- Checked when the transaction ends, so that moving a track (which shifts the others) can pass through duplicates.
  UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX playlists_user_id_idx ON playlists (user_id);
-- Refreshing a video updates it in every playlist that holds it.
CREATE INDEX playlist_tracks_video_id_idx ON playlist_tracks (video_id);
