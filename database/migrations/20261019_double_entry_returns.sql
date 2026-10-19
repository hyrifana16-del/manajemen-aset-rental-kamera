DO $$
BEGIN
  IF to_regclass('public.kamera') IS NULL
    OR to_regclass('public.transaksi_sewa') IS NULL
    OR to_regclass('public.jurnal_penyusutan') IS NULL THEN
    RAISE EXCEPTION 'Run the base LensLedger schema before this migration.';
  END IF;
END;
$$;

ALTER TABLE public.jurnal_penyusutan
  ADD COLUMN IF NOT EXISTS debit NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS kredit NUMERIC(14, 2);

ALTER TABLE public.kamera
  ADD COLUMN IF NOT EXISTS tarif_sewa_harian NUMERIC(14, 2)
    CHECK (tarif_sewa_harian IS NULL OR tarif_sewa_harian >= 0),
  ADD COLUMN IF NOT EXISTS status_operasional TEXT NOT NULL DEFAULT 'Tersedia';

ALTER TABLE public.transaksi_sewa
  ADD COLUMN IF NOT EXISTS status_pengembalian TEXT,
  ADD COLUMN IF NOT EXISTS tanggal_pengembalian DATE;

UPDATE public.transaksi_sewa
SET status_pengembalian = CASE WHEN EXISTS (
      SELECT 1
      FROM public.jurnal_penyusutan AS journal
      WHERE journal.transaksi_id = transaksi_sewa.id
    ) THEN 'Sudah kembali' ELSE 'Belum kembali' END
WHERE status_pengembalian IS NULL;

UPDATE public.transaksi_sewa
SET tanggal_pengembalian = COALESCE(
      (
        SELECT journal.tanggal_jurnal
        FROM public.jurnal_penyusutan AS journal
        WHERE journal.transaksi_id = transaksi_sewa.id
        ORDER BY journal.tanggal_jurnal DESC
        LIMIT 1
      ),
      tanggal_selesai
    )
WHERE status_pengembalian = 'Sudah kembali'
  AND tanggal_pengembalian IS NULL;

ALTER TABLE public.transaksi_sewa
  ALTER COLUMN status_pengembalian SET DEFAULT 'Belum kembali',
  ALTER COLUMN status_pengembalian SET NOT NULL;

UPDATE public.jurnal_penyusutan
SET debit = COALESCE(beban_penyusutan, 0),
    kredit = COALESCE(beban_penyusutan, 0);

ALTER TABLE public.jurnal_penyusutan
  ALTER COLUMN debit SET NOT NULL,
  ALTER COLUMN kredit SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.jurnal_penyusutan'::regclass
      AND conname = 'jurnal_penyusutan_balance_check'
  ) THEN
    ALTER TABLE public.jurnal_penyusutan
      ADD CONSTRAINT jurnal_penyusutan_balance_check
      CHECK (debit >= 0 AND kredit >= 0 AND debit = kredit AND debit = beban_penyusutan);
  END IF;
END;
$$;

WITH ranked_journals AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY transaksi_id
           ORDER BY beban_penyusutan DESC, tanggal_jurnal, id
         ) AS row_number
  FROM public.jurnal_penyusutan
  WHERE transaksi_id IS NOT NULL
)
DELETE FROM public.jurnal_penyusutan AS journal
USING ranked_journals AS ranked
WHERE journal.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS jurnal_penyusutan_transaksi_uidx
  ON public.jurnal_penyusutan (transaksi_id)
  WHERE transaksi_id IS NOT NULL;

DO $$
DECLARE
  existing_trigger RECORD;
BEGIN
  FOR existing_trigger IN
    SELECT trigger_row.tgname
    FROM pg_trigger AS trigger_row
    JOIN pg_proc AS trigger_function ON trigger_function.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid = 'public.transaksi_sewa'::regclass
      AND NOT trigger_row.tgisinternal
      AND position('jurnal_penyusutan' IN lower(trigger_function.prosrc)) > 0
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.transaksi_sewa', existing_trigger.tgname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_return_status_reversal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status_pengembalian = 'Sudah kembali'
    AND NEW.status_pengembalian IS DISTINCT FROM OLD.status_pengembalian THEN
    RAISE EXCEPTION 'Status pengembalian yang sudah final tidak dapat dibatalkan.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_depreciation_journal_on_return()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  camera_row public.kamera%ROWTYPE;
  depreciable_base NUMERIC(14, 2);
  activity_rate NUMERIC(14, 6);
  activity_days INTEGER;
  prior_depreciation NUMERIC(14, 2);
  journal_amount NUMERIC(14, 2);
BEGIN
  IF NEW.status_pengembalian IS DISTINCT FROM 'Sudah kembali' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.status_pengembalian = 'Sudah kembali'
    AND EXISTS (
      SELECT 1 FROM public.jurnal_penyusutan
      WHERE transaksi_id = NEW.id
    ) THEN
    UPDATE public.kamera
    SET status_operasional = 'Tersedia'
    WHERE id = NEW.kamera_id;
    RETURN NEW;
  END IF;

  SELECT * INTO camera_row
  FROM public.kamera
  WHERE id = NEW.kamera_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamera untuk transaksi % tidak ditemukan.', NEW.id;
  END IF;
  IF COALESCE(camera_row.estimasi_total_hari_sewa, 0) <= 0 THEN
    RAISE EXCEPTION 'Estimasi hari sewa kamera harus lebih besar dari nol.';
  END IF;

  activity_days := GREATEST(
    1,
    COALESCE(NEW.tanggal_pengembalian, NEW.tanggal_selesai) - NEW.tanggal_mulai
  );
  depreciable_base := GREATEST(
    0,
    COALESCE(camera_row.harga_perolehan, 0) - COALESCE(camera_row.nilai_residu, 0)
  );
  activity_rate := ROUND(
    depreciable_base / camera_row.estimasi_total_hari_sewa,
    6
  );

  SELECT COALESCE(SUM(beban_penyusutan), 0)
  INTO prior_depreciation
  FROM public.jurnal_penyusutan
  WHERE kamera_id = NEW.kamera_id
    AND transaksi_id IS DISTINCT FROM NEW.id;

  journal_amount := ROUND(
    LEAST(
      activity_rate * activity_days,
      GREATEST(0, depreciable_base - prior_depreciation)
    ),
    2
  );

  INSERT INTO public.jurnal_penyusutan (
    transaksi_id,
    kamera_id,
    tanggal_jurnal,
    hari_aktivitas,
    tarif_penyusutan_per_hari,
    beban_penyusutan,
    akun_debit,
    akun_kredit,
    metode,
    debit,
    kredit
  ) VALUES (
    NEW.id,
    NEW.kamera_id,
    COALESCE(NEW.tanggal_pengembalian, NEW.tanggal_selesai),
    activity_days,
    activity_rate,
    journal_amount,
    'Beban Penyusutan',
    'Akumulasi Penyusutan',
    'Units-of-Activity',
    journal_amount,
    journal_amount
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.kamera
  SET status_operasional = 'Tersedia'
  WHERE id = NEW.kamera_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_return_status_reversal ON public.transaksi_sewa;
CREATE TRIGGER prevent_return_status_reversal
BEFORE UPDATE OF status_pengembalian ON public.transaksi_sewa
FOR EACH ROW
EXECUTE FUNCTION public.prevent_return_status_reversal();

DROP TRIGGER IF EXISTS create_depreciation_journal_on_return ON public.transaksi_sewa;
CREATE TRIGGER create_depreciation_journal_on_return
AFTER UPDATE OF status_pengembalian ON public.transaksi_sewa
FOR EACH ROW
EXECUTE FUNCTION public.create_depreciation_journal_on_return();

UPDATE public.transaksi_sewa AS rental
SET status_pengembalian = 'Sudah kembali'
WHERE rental.status_pengembalian = 'Sudah kembali'
  AND NOT EXISTS (
    SELECT 1
    FROM public.jurnal_penyusutan AS journal
    WHERE journal.transaksi_id = rental.id
  );

UPDATE public.kamera AS camera
SET status_operasional = 'Sedang disewa'
WHERE EXISTS (
  SELECT 1
  FROM public.transaksi_sewa AS rental
  WHERE rental.kamera_id = camera.id
    AND rental.status_pengembalian = 'Belum kembali'
    AND rental.status <> 'Dibatalkan'
);

UPDATE public.kamera AS camera
SET status_operasional = 'Tersedia'
WHERE camera.status_operasional = 'Sedang disewa'
  AND NOT EXISTS (
    SELECT 1
    FROM public.transaksi_sewa AS rental
    WHERE rental.kamera_id = camera.id
      AND rental.status_pengembalian = 'Belum kembali'
      AND rental.status <> 'Dibatalkan'
  );