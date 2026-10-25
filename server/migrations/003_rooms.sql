-- Rooms: the six rooms of the team, and the rooms members make.
--
-- A room of the team has no host and a place in the list (seed_position); a room of a member has a host and no such place.
-- A member's rooms go with their account (ON DELETE CASCADE): closing the live room is the job of the account deletion.
-- Every rule the code applies is also a CHECK here, so that nothing the code lets slip can leave a room that does not make
-- sense in the table. Names are compared by name_key, which the server computes itself (as for pseudos and playlists).

CREATE TABLE rooms (
  id              text        NOT NULL,
  name            text        NOT NULL,
  name_key        text        NOT NULL,
  description     text        NOT NULL DEFAULT '',
  styles          text[]      NOT NULL,
  theme           text        NOT NULL,
  -- Null: no limit on the length of a track, a track may never play again.
  max_track_sec   integer,
  repeat_delay_sec integer,
  max_djs         integer     NOT NULL,
  host_account_id uuid        REFERENCES users (id) ON DELETE CASCADE,
  seed_position   integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_pkey PRIMARY KEY (id),
  CONSTRAINT rooms_name_key_unique UNIQUE (name_key),
  CONSTRAINT rooms_seed_position_unique UNIQUE (seed_position),
  CONSTRAINT rooms_id_shape CHECK (id ~ '^[a-z0-9][a-z0-9-]{2,59}$'),
  CONSTRAINT rooms_name_length CHECK (char_length(name) BETWEEN 3 AND 40),
  CONSTRAINT rooms_description_length CHECK (char_length(description) <= 200),
  CONSTRAINT rooms_styles_valid CHECK (
    cardinality(styles) BETWEEN 1 AND 3
    AND styles <@ ARRAY['lofi', 'rap', 'electro', 'rock', 'jazz', 'afro', 'pop', 'classique']
  ),
  CONSTRAINT rooms_theme_valid CHECK (theme IN ('neon', 'sunset', 'vinyl', 'jungle')),
  CONSTRAINT rooms_rules_valid CHECK (
    (max_track_sec IS NULL OR max_track_sec > 0)
    AND (repeat_delay_sec IS NULL OR repeat_delay_sec > 0)
    AND max_djs BETWEEN 5 AND 50
  ),
  CONSTRAINT rooms_team_or_host CHECK ((host_account_id IS NULL) = (seed_position IS NOT NULL))
);

CREATE INDEX rooms_host_account_id_idx ON rooms (host_account_id);

-- The rooms of the team. server/src/catalog.ts holds the same values (a test checks that they match).
INSERT INTO rooms (id, name, name_key, description, styles, theme, max_track_sec, repeat_delay_sec, max_djs, seed_position) VALUES
  ('lofi-du-soir', 'Lo-fi du soir', 'lo-fi du soir', 'Beats calmes pour bosser ou se poser, sans pression.', ARRAY['lofi'], 'neon', 420, 7200, 10, 1),
  ('rock-progressif', 'Rock progressif', 'rock progressif', 'Guitares planantes, longs morceaux et albums cultes.', ARRAY['rock'], 'sunset', 900, 14400, 8, 2),
  ('electro-nuit', 'Electro de nuit', 'electro de nuit', 'Des sets qui montent doucement, du premier battement au petit matin.', ARRAY['electro'], 'neon', 480, 7200, 12, 3),
  ('jazz-cafe', 'Jazz café', 'jazz café', 'Un piano, un café, du jazz à toute heure.', ARRAY['jazz'], 'vinyl', 600, 14400, 8, 4),
  ('hip-hop-classics', 'Hip-hop classics', 'hip-hop classics', 'Les classiques du rap : boom bap, samples et vieilles écoles.', ARRAY['rap'], 'jungle', 360, 7200, 12, 5),
  ('french-touch', 'French touch', 'french touch', 'House filtrée et basses rondes, à la française.', ARRAY['electro'], 'sunset', 420, 7200, 10, 6);
