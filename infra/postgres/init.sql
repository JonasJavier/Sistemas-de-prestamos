-- Runs once when the Postgres volume is first created.
-- The app connects as a NON-superuser role: superusers bypass row-level
-- security, and RLS is our second isolation barrier (doc 06 - section 8).
-- CREATEDB lets pytest create the test database with this same role.
CREATE ROLE cobradia LOGIN PASSWORD 'cobradia' CREATEDB;
CREATE DATABASE cobradia OWNER cobradia;
