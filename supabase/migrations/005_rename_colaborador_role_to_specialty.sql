-- KORbuild: rename the collaborator role field to its domain meaning.
-- Existing data is preserved; only the column name changes.
ALTER TABLE public.colaboradores
RENAME COLUMN role TO specialty;
