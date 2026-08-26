ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS axiom_upload_authorised BOOLEAN NOT NULL DEFAULT false;
