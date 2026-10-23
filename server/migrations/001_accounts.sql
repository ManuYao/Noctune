-- Accounts and their sessions.
--
-- Pseudos and e-mails are compared in lower case, and the server computes that form itself (pseudo_key, and an e-mail
-- that is already stored in lower case): the rule does not depend on the locale of whichever PostgreSQL runs below.

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  pseudo        text        NOT NULL,
  pseudo_key    text        NOT NULL UNIQUE,
  avatar_id     text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The cookie holds a random token; only its SHA-256 is stored, so a copy of this table does not give live sessions.
CREATE TABLE sessions (
  token_hash bytea       PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
