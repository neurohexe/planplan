ALTER TABLE audit_events ADD COLUMN location_id TEXT;
CREATE INDEX audit_location_idx ON audit_events(location_id, created_at);
