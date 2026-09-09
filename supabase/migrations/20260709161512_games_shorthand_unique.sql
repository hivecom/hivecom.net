-- Enforce unique game shorthands. Assets are stored under games/{shorthand}/
-- in storage, so two games sharing a shorthand would clobber each other's
-- assets. NULL shorthands remain allowed (multiple games without one).

ALTER TABLE games
ADD CONSTRAINT games_shorthand_unique UNIQUE (shorthand);
