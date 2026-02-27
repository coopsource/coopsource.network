-- Creates separate databases for each federation instance.
-- Runs automatically on first PostgreSQL container start via
-- /docker-entrypoint-initdb.d/ volume mount.

CREATE DATABASE coopsource_hub;
CREATE DATABASE coopsource_coop_a;
CREATE DATABASE coopsource_coop_b;
