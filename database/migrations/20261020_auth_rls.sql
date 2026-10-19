DO $$
BEGIN
  IF to_regclass('public.kamera') IS NULL
    OR to_regclass('public.penyewa') IS NULL
    OR to_regclass('public.transaksi_sewa') IS NULL
    OR to_regclass('public.jurnal_penyusutan') IS NULL THEN
    RAISE EXCEPTION 'Run the base LensLedger schema before the authentication migration.';
  END IF;
END;
$$;

ALTER TABLE public.kamera ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.penyewa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi_sewa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurnal_penyusutan ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.kamera,
  public.penyewa,
  public.transaksi_sewa,
  public.jurnal_penyusutan
FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.kamera,
  public.penyewa,
  public.transaksi_sewa,
  public.jurnal_penyusutan
TO authenticated;

DO $$
DECLARE
  sequence_name TEXT;
BEGIN
  FOR sequence_name IN
    SELECT pg_get_serial_sequence(table_name, 'id')
    FROM unnest(ARRAY[
      'public.kamera',
      'public.penyewa',
      'public.transaksi_sewa',
      'public.jurnal_penyusutan'
    ]) AS tables(table_name)
    WHERE pg_get_serial_sequence(table_name, 'id') IS NOT NULL
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, PUBLIC', sequence_name);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', sequence_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS kamera_authenticated_access ON public.kamera;
CREATE POLICY kamera_authenticated_access ON public.kamera
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS penyewa_authenticated_access ON public.penyewa;
CREATE POLICY penyewa_authenticated_access ON public.penyewa
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS transaksi_sewa_authenticated_access ON public.transaksi_sewa;
CREATE POLICY transaksi_sewa_authenticated_access ON public.transaksi_sewa
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS jurnal_penyusutan_authenticated_access ON public.jurnal_penyusutan;
CREATE POLICY jurnal_penyusutan_authenticated_access ON public.jurnal_penyusutan
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);