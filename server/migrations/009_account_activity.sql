-- What the server counts about a member (profile, mock-up 5b, and badges, mock-up 9). Members only: a visitor has nothing.
--
-- Everything belongs to one account and goes with it (ON DELETE CASCADE). The server accumulates in memory and writes by
-- batches (see server/src/activity): these tables take additions, never one row per event. Badges are not stored, they
-- are derived from these counters. roomsHosted, playlistTracks and memberSince are read from rooms, playlists and users.

CREATE TABLE member_activity (
  user_id           uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  tracks_played     integer     NOT NULL DEFAULT 0 CHECK (tracks_played >= 0),
  likes_received    integer     NOT NULL DEFAULT 0 CHECK (likes_received >= 0),
  likes_given       integer     NOT NULL DEFAULT 0 CHECK (likes_given >= 0),
  messages_sent     integer     NOT NULL DEFAULT 0 CHECK (messages_sent >= 0),
  listen_seconds    bigint      NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  -- Most likes one of their tracks got, and most distinct members who entered one room they host(ed): high-water marks.
  best_track_likes  integer     NOT NULL DEFAULT 0 CHECK (best_track_likes >= 0),
  best_room_members integer     NOT NULL DEFAULT 0 CHECK (best_room_members >= 0),
  -- Entered a room between 02:00 and 05:00 (Europe/Paris) at least once.
  night_owl         boolean     NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- The calendar days (Europe/Paris) on which the member entered a room: "Habitue" counts them.
CREATE TABLE member_activity_days (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);

-- Per style of room: entered (visited), a track of theirs played there (played), and time listened.
CREATE TABLE member_activity_styles (
  user_id        uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  style          text    NOT NULL CHECK (char_length(style) BETWEEN 1 AND 30),
  visited        boolean NOT NULL DEFAULT false,
  played         boolean NOT NULL DEFAULT false,
  listen_seconds bigint  NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  PRIMARY KEY (user_id, style)
);

-- Per room: how many times the member came in and how long they stayed. No foreign key to rooms: a room can be deleted
-- while a batch is being written, and the batch must not fail for it.
CREATE TABLE member_activity_rooms (
  user_id        uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  room_id        text    NOT NULL CHECK (char_length(room_id) BETWEEN 1 AND 100),
  visits         integer NOT NULL DEFAULT 0 CHECK (visits >= 0),
  listen_seconds bigint  NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  PRIMARY KEY (user_id, room_id)
);

-- "How many different members came into this room" reads this by room.
CREATE INDEX member_activity_rooms_room_idx ON member_activity_rooms (room_id);
