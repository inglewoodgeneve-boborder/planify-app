-- Migration : ajout du PIN kiosque pour les employés
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pin_hash text;
