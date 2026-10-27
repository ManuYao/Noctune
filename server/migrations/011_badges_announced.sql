-- The highest level of each badge the member has already been told about (a toast in the room). Badges themselves are not
-- stored, they are derived from the counters (see 009): this only remembers what was announced, so that a badge is
-- announced once, on every device. One row per account and badge; it goes with the account.

CREATE TABLE member_badges_announced (
  user_id  uuid     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  badge_id text     NOT NULL CHECK (char_length(badge_id) BETWEEN 1 AND 40),
  level    smallint NOT NULL CHECK (level >= 1),
  PRIMARY KEY (user_id, badge_id)
);
