   ('CAM-002', 'Kamera Hybrid', 'Fujifilm X-T5', '2024-03-20', 26500000, 3000000, 850, 'Baik'),
  ('CAM-003', 'Kamera Full-frame', 'Canon EOS R6 Mark II', '2024-06-10', 38900000, 4000000, 1000, 'Baik'),
  ('CAM-004', 'Kamera Action', 'GoPro HERO12 Black', '2025-02-05', 7200000, 800000, 600, 'Baik')
ON CONFLICT (kode_aset) DO NOTHING;

INSERT INTO penyewa (nama, no_telepon, email) VALUES
  ('Nadia Putri', '081234567801', 'nadia@example.com'),
  ('Bima Pratama', '081234567802', 'bima@example.com'),
  ('Studio Ruang Cerita', '081234567803', 'halo@ruangcerita.example'),
  ('Raka Mahendra', '081234567804', 'raka@example.com')
ON CONFLICT (no_telepon) DO NOTHING;
