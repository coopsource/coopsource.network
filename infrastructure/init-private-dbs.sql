-- Create additional databases for private network services.
-- Mounted into PostgreSQL container via docker-entrypoint-initdb.d.
-- Only runs on first initialization (empty data directory).

CREATE DATABASE plc;
CREATE DATABASE relay;

-- Grant access to the default user
GRANT ALL PRIVILEGES ON DATABASE plc TO coopsource;
GRANT ALL PRIVILEGES ON DATABASE relay TO coopsource;
