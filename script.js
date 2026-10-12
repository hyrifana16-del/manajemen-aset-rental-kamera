const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const cameraStatuses = ["Tersedia", "Sedang disewa", "Perbaikan", "Sudah dikembalikan"];

const elements = {
  cameraSelect: document.getElementById("camera-select"),
  cameraRate: document.getElementById("camera-rate"),
  connectionDot: document.getElementById("connection-dot"),
  connectionStatus: document.getElementById("connection-status"),
  depreciationPreview: document.getElementById("depreciation-preview"),
  depreciationValue: document.getElementById("depreciation-value"),
  endDate: document.getElementById("end-date"),
  form: document.getElementById("rental-form"),
  formMessage: document.getElementById("form-message"),
  greeting: document.getElementById("dashboard-greeting"),
  journalRows: document.getElementById("journal-rows"),
  renterSelect: document.getElementById("renter-select"),
  rentalCount: document.getElementById("rental-count"),
  rentalFee: document.getElementById("rental-fee"),
  startDate: document.getElementById("start-date"),
  submitButton: document.getElementById("submit-button"),
  transactionRows: document.getElementById("transaction-rows"),
  assetValue: document.getElementById("asset-value"),
  cameraStatusRows: document.getElementById("camera-status-rows"),
  cameraStatusMessage: document.getElementById("camera-status-message"),
  exportTransactions: document.getElementById("export-transactions"),
  exportJournals: document.getElementById("export-journals"),
};

let cameras = [];
let renters = [];
let depreciationByCamera = new Map();
let savingRate = false;
let cameraRateAvailable = true;
let cameraStatusAvailable = true;
let returnStatusAvailable = true;
let recentTransactions = [];
let recentJournals = [];

function setConnectionState(message, state) {
  elements.connectionStatus.textContent = message;
  elements.connectionDot.className = `connection-dot${state ? ` ${state}` : ""}`;
}

function showFormMessage(message, type) {
  elements.formMessage.textContent = message;
  elements.formMessage.className = `form-message visible ${type}`;
}

function clearFormMessage() {
  elements.formMessage.textContent = "";
  elements.formMessage.className = "form-message";
}

function showStatusMessage(message, type) {
  elements.cameraStatusMessage.textContent = message;
  elements.cameraStatusMessage.className = `form-message visible ${type}`;
}

function clearStatusMessage() {
  elements.cameraStatusMessage.textContent = "";
  elements.cameraStatusMessage.className = "form-message";
}

function parseDateAsUtc(value) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return null;
  }
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function rentalActivityDays(startValue, endValue) {
  const start = parseDateAsUtc(startValue);
  const end = parseDateAsUtc(endValue);
  if (!start || !end || end <= start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

function calculateDepreciation(camera, activityDays, priorDepreciation = 0) {
  const depreciableBase = Number(camera.harga_perolehan) - Number(camera.nilai_residu);
  const activityRate = Math.round(
    (depreciableBase / Number(camera.estimasi_total_hari_sewa)) * 1_000_000,
  ) / 1_000_000;
  const remainingBase = Math.max(0, depreciableBase - priorDepreciation);
  const amount = Math.min(activityRate * activityDays, remainingBase);
  return {
    amount: Math.round(amount * 100) / 100,
    activityRate,
  };
}

function selectedCamera() {
  return cameras.find((camera) => String(camera.id) === elements.cameraSelect.value);
}

function refreshDepreciationPreview() {
  const camera = selectedCamera();
  const activityDays = rentalActivityDays(elements.startDate.value, elements.endDate.value);
  if (!camera || !activityDays) {
    elements.depreciationPreview.replaceChildren();
    const icon = document.createElement("span");
    icon.className = "preview-icon";
    icon.textContent = "↘";
    const text = document.createElement("span");
    text.textContent = elements.endDate.value && elements.startDate.value
      ? "Tanggal selesai harus setelah tanggal mulai."
      : "Pilih kamera dan tanggal sewa untuk melihat estimasi penyusutan.";
    elements.depreciationPreview.append(icon, text);
    return;
  }
  const priorDepreciation = depreciationByCamera.get(camera.id) || 0;
  const result = calculateDepreciation(camera, activityDays, priorDepreciation);
  elements.depreciationPreview.replaceChildren();
  const icon = document.createElement("span");
  icon.className = "preview-icon";
  icon.textContent = "↘";
  const text = document.createElement("span");
  const label = document.createElement("strong");
  label.textContent = currencyFormatter.format(result.amount);
  text.append(`${activityDays} hari aktivitas · Estimasi beban penyusutan `, label);
  elements.depreciationPreview.append(icon, text);
}

function refreshRentalFee() {
  const camera = selectedCamera();
  const activityDays = rentalActivityDays(elements.startDate.value, elements.endDate.value);
  const rateValue = elements.cameraRate.value;
  const dailyRate = rateValue === "" ? NaN : Number(rateValue);
  if (!camera || !activityDays || !Number.isFinite(dailyRate) || dailyRate < 0) {
    elements.rentalFee.value = "";
    elements.rentalFee.placeholder = camera && rateValue === ""
      ? "Isi tarif sewa harian kamera"
      : "Pilih kamera dan tanggal sewa";
    return;
  }
  elements.rentalFee.value = String(dailyRate * activityDays);
  elements.rentalFee.placeholder = "";
}

function syncCameraRate() {
  const camera = selectedCamera();
  elements.cameraRate.value = camera?.tarif_sewa_harian ?? "";
  elements.cameraRate.disabled = !camera || !cameraRateAvailable;
  elements.cameraRate.placeholder = cameraRateAvailable
    ? "Isi tarif harian (opsional)"
    : "Tambahkan kolom tarif di Supabase";
}

function refreshRentalPreviews() {
  refreshRentalFee();
  refreshDepreciationPreview();
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateEndDateMinimum() {
  const start = parseDateAsUtc(elements.startDate.value);
  if (!start) {
    elements.endDate.removeAttribute("min");
    return;
  }
  start.setUTCDate(start.getUTCDate() + 1);
  const minimumEnd = start.toISOString().slice(0, 10);
  elements.endDate.min = minimumEnd;
  if (elements.endDate.value && elements.endDate.value < minimumEnd) {
    elements.endDate.value = "";
  }
}

function addSelectOptions(select, placeholder, rows, labelForRow) {
  select.replaceChildren(new Option(placeholder, ""));
  for (const row of rows) {
    select.add(new Option(labelForRow(row), row.id));
  }
  select.disabled = rows.length === 0;
}

async function loadCameraRows(client) {
  const optionalFields = ["tarif_sewa_harian", "status_operasional"];
  const missingFields = new Set();
  const baseFields = [
    "id",
    "kode_aset",
    "nama_aset",
    "merk_model",
    "harga_perolehan",
    "nilai_residu",
    "estimasi_total_hari_sewa",
  ];

  while (true) {
    const fields = [...baseFields, ...optionalFields.filter((field) => !missingFields.has(field))];
    const result = await client.from("kamera").select(fields.join(",")).order("kode_aset");
    if (!result.error) {
      for (const camera of result.data) {
        if (missingFields.has("tarif_sewa_harian")) camera.tarif_sewa_harian = null;
        if (missingFields.has("status_operasional")) camera.status_operasional = "Tersedia";
      }
      return { result, missingFields };
    }
    const missingField = optionalFields.find((field) =>
      result.error.code === "42703" && result.error.message.includes(`kamera.${field}`));
    if (!missingField || missingFields.has(missingField)) return { result, missingFields };
    missingFields.add(missingField);
  }
}

async function loadTransactionRows(client) {
  const result = await client.from("transaksi_sewa")
    .select("id,kode_transaksi,kamera_id,tanggal_mulai,tanggal_selesai,total_biaya,status,status_pengembalian,tanggal_pengembalian,penyewa(nama),kamera(nama_aset,kode_aset)")
    .order("tanggal_mulai", { ascending: false })
    .limit(8);
  if (
    result.error?.code === "42703" &&
    (result.error.message.includes("status_pengembalian") ||
      result.error.message.includes("tanggal_pengembalian"))
  ) {
    const fallback = await client.from("transaksi_sewa")
      .select("id,kode_transaksi,kamera_id,tanggal_mulai,tanggal_selesai,total_biaya,status,penyewa(nama),kamera(nama_aset,kode_aset)")
      .order("tanggal_mulai", { ascending: false })
      .limit(8);
    if (!fallback.error) {
      for (const transaction of fallback.data) {
        transaction.status_pengembalian = transaction.status === "Selesai"
          ? "Sudah kembali"
          : "Belum kembali";
      }
    }
    return { result: fallback, available: false };
  }
  return { result, available: true };
}

async function loadDashboard() {
  if (!window.supabaseClient) {
    const reason = window.supabaseConfigError || "Konfigurasi Supabase belum tersedia.";
    setConnectionState("Konfigurasi belum siap", "error");
    elements.transactionRows.innerHTML = "";
    const row = elements.transactionRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "table-placeholder";
    cell.textContent = reason;
    showFormMessage(reason, "error");
    return;
  }

  setConnectionState("Menghubungkan ke Supabase...", "");
  const client = window.supabaseClient;
  let renterResult;
  let transactionResult;
  let transactionLoad;
  let journalResult;
  let countResult;
  let cameraLoad;
  try {
    [cameraLoad, renterResult, transactionLoad, journalResult, countResult] = await Promise.all([
      loadCameraRows(client),
      client.from("penyewa").select("id,nama,no_telepon").order("nama"),
      loadTransactionRows(client),
      client.from("jurnal_penyusutan")
        .select("id,kamera_id,tanggal_jurnal,hari_aktivitas,beban_penyusutan,transaksi_sewa(kode_transaksi),kamera(kode_aset,nama_aset)")
        .order("tanggal_jurnal", { ascending: false })
        .limit(8),
      client.from("transaksi_sewa").select("id", { count: "exact", head: true }),
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    setConnectionState("Gagal memuat data", "error");
    showFormMessage(`Tidak dapat memuat data Supabase: ${detail}. Periksa koneksi dan pastikan database/schema.sql sudah dijalankan.`, "error");
    elements.transactionRows.replaceChildren();
    const row = elements.transactionRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "table-placeholder";
    cell.textContent = detail;
    return;
  }
  const cameraResult = cameraLoad.result;
  transactionResult = transactionLoad.result;
  returnStatusAvailable = transactionLoad.available;
  cameraRateAvailable = !cameraLoad.missingFields.has("tarif_sewa_harian");
  cameraStatusAvailable = !cameraLoad.missingFields.has("status_operasional");
  const firstError = [cameraResult, renterResult, transactionResult, journalResult, countResult]
    .find((result) => result.error);
  if (firstError) {
    setConnectionState("Gagal memuat data", "error");
    showFormMessage(
      `Tidak dapat memuat data Supabase: ${firstError.error.message}. Periksa URL/kunci Supabase dan pastikan database/schema.sql sudah dijalankan.`,
      "error",
    );
    elements.transactionRows.replaceChildren();
    const row = elements.transactionRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "table-placeholder";
    cell.textContent = firstError.error.message;
    return;
  }

  cameras = cameraResult.data || [];
  renters = renterResult.data || [];
  recentTransactions = transactionResult.data || [];
  recentJournals = journalResult.data || [];
  depreciationByCamera = new Map();
  for (const journal of journalResult.data || []) {
    const cameraId = journal.kamera_id;
    depreciationByCamera.set(
      cameraId,
      (depreciationByCamera.get(cameraId) || 0) + Number(journal.beban_penyusutan),
    );
  }

  addSelectOptions(elements.cameraSelect, "Pilih aset kamera", cameras, (camera) =>
    `${camera.kode_aset} — ${camera.nama_aset}`);
  addSelectOptions(elements.renterSelect, "Pilih penyewa", renters, (renter) =>
    renter.no_telepon ? `${renter.nama} · ${renter.no_telepon}` : renter.nama);
  elements.assetValue.textContent = currencyFormatter.format(
    cameras.reduce((total, camera) => total + Number(camera.harga_perolehan), 0),
  );
  elements.depreciationValue.textContent = currencyFormatter.format(
    recentJournals.reduce((total, journal) => total + Number(journal.beban_penyusutan), 0),
  );
  elements.rentalCount.textContent = new Intl.NumberFormat("id-ID").format(countResult.count || 0);
  renderCameraStatuses(cameras);
  renderTransactions(recentTransactions);
  renderJournals(recentJournals);
  elements.submitButton.disabled = cameras.length === 0 || renters.length === 0 || !cameraRateAvailable;
  setConnectionState(
    cameraRateAvailable ? "Terhubung ke Supabase" : "Supabase aktif · perlu migrasi tarif",
    cameraRateAvailable ? "connected" : "error",
  );
  refreshRentalPreviews();
  if (!cameraRateAvailable) {
    showFormMessage(
      "Data berhasil dimuat, tetapi kolom tarif_sewa_harian belum ada. Jalankan di Supabase SQL Editor: ALTER TABLE public.kamera ADD COLUMN IF NOT EXISTS tarif_sewa_harian NUMERIC(14, 2) CHECK (tarif_sewa_harian >= 0); lalu muat ulang halaman.",
      "error",
    );
  }
  const statusSetupWarnings = [];
  if (!cameraStatusAvailable) {
    statusSetupWarnings.push("Kolom status_operasional belum tersedia.");
  }
  if (!returnStatusAvailable) {
    statusSetupWarnings.push("Kolom status_pengembalian belum tersedia; aksi pengembalian transaksi dinonaktifkan.");
  }
  if (statusSetupWarnings.length) {
    showStatusMessage(
      `${statusSetupWarnings.join(" ")} Jalankan database/schema.sql di Supabase untuk mengaktifkan status kamera dan otomatisasi jurnal.`,
      "error",
    );
  } else {
    clearStatusMessage();
  }
}

function renderTransactions(transactions) {
  elements.transactionRows.replaceChildren();
  if (transactions.length === 0) {
    const row = elements.transactionRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "empty-state";
    cell.textContent = "Belum ada transaksi. Catat transaksi pertama Anda melalui formulir.";
    return;
  }
  for (const transaction of transactions) {
    const row = elements.transactionRows.insertRow();
    const transactionCell = row.insertCell();
    const code = document.createElement("span");
    code.className = "transaction-code";
    code.textContent = transaction.kode_transaksi;
    const camera = document.createElement("span");
    camera.className = "transaction-camera";
    camera.textContent = transaction.kamera
      ? `${transaction.kamera.kode_aset} · ${transaction.kamera.nama_aset}`
      : "Aset tidak tersedia";
    transactionCell.append(code, camera);
    row.insertCell().textContent = transaction.penyewa?.nama || "—";
    row.insertCell().textContent = `${dateFormatter.format(parseDateAsUtc(transaction.tanggal_mulai))} – ${dateFormatter.format(parseDateAsUtc(transaction.tanggal_selesai))}`;
    row.insertCell().textContent = transaction.status_pengembalian === "Sudah kembali"
      ? "Selesai"
      : transaction.status === "Booking" ? "Booking" : transaction.status;
    row.insertCell().textContent = currencyFormatter.format(Number(transaction.total_biaya));
    const actionCell = row.insertCell();
    if (transaction.status === "Dibatalkan") {
      actionCell.textContent = "—";
      continue;
    }
    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.className = `return-status-toggle${transaction.status_pengembalian === "Sudah kembali" ? " returned" : ""}`;
    returnButton.dataset.transactionId = transaction.id;
    returnButton.textContent = transaction.status_pengembalian === "Sudah kembali"
      ? "Sudah kembali"
      : "Belum kembali";
    returnButton.disabled = !returnStatusAvailable;
    returnButton.setAttribute(
      "aria-label",
      `Ubah status pengembalian ${transaction.kode_transaksi}; saat ini ${returnButton.textContent}`,
    );
    returnButton.title = "Klik untuk mengubah status pengembalian";
    returnButton.setAttribute("aria-pressed", String(transaction.status_pengembalian === "Sudah kembali"));
    actionCell.append(returnButton);
  }
}

function renderCameraStatuses(cameraRows) {
  elements.cameraStatusRows.replaceChildren();
  if (cameraRows.length === 0) {
    const row = elements.cameraStatusRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.className = "empty-state";
    cell.textContent = "Belum ada data kamera.";
    return;
  }

  for (const camera of cameraRows) {
    const row = elements.cameraStatusRows.insertRow();
    row.insertCell().textContent = camera.kode_aset;
    row.insertCell().textContent = camera.nama_aset;
    row.insertCell().textContent = camera.merk_model;
    const statusCell = row.insertCell();
    const select = document.createElement("select");
    select.className = "camera-status-select";
    select.dataset.cameraId = camera.id;
    select.setAttribute("aria-label", `Status kamera ${camera.kode_aset}`);
    for (const status of cameraStatuses) {
      select.add(new Option(status, status));
    }
    select.value = cameraStatuses.includes(camera.status_operasional)
      ? camera.status_operasional
      : "Tersedia";
    select.disabled = !cameraStatusAvailable;
    statusCell.append(select);
  }
}

async function saveCameraStatus(select) {
  const camera = cameras.find((item) => String(item.id) === select.dataset.cameraId);
  const nextStatus = select.value;
  if (!camera || !cameraStatuses.includes(nextStatus) || !cameraStatusAvailable) return;

  const previousStatus = camera.status_operasional;
  if (nextStatus === previousStatus) return;
  select.disabled = true;
  clearStatusMessage();
  try {
    const { data, error } = await window.supabaseClient
      .from("kamera")
      .update({ status_operasional: nextStatus })
      .eq("id", camera.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Supabase tidak mengizinkan perubahan status untuk kamera ini.");
    camera.status_operasional = nextStatus;
    showStatusMessage(`Status ${camera.kode_aset} berhasil diubah menjadi “${nextStatus}”.`, "success");
  } catch (error) {
    select.value = previousStatus;
    showStatusMessage(`Status kamera gagal disimpan: ${error.message || String(error)}`, "error");
  } finally {
    select.disabled = !cameraStatusAvailable;
  }
}

function renderJournals(journals) {
  elements.journalRows.replaceChildren();
  if (journals.length === 0) {
    const row = elements.journalRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.className = "empty-state";
    cell.textContent = "Jurnal penyusutan akan tercatat setelah transaksi sewa disimpan.";
    return;
  }
  for (const journal of journals) {
    const row = elements.journalRows.insertRow();
    row.insertCell().textContent = dateFormatter.format(parseDateAsUtc(journal.tanggal_jurnal));
    const referenceCell = row.insertCell();
    const code = document.createElement("span");
    code.className = "transaction-code";
    code.textContent = journal.transaksi_sewa?.kode_transaksi || "—";
    const camera = document.createElement("span");
    camera.className = "transaction-camera";
    camera.textContent = journal.kamera
      ? `${journal.kamera.kode_aset} · ${journal.kamera.nama_aset}`
      : "Aset tidak tersedia";
    referenceCell.append(code, camera);
    row.insertCell().textContent = `${journal.hari_aktivitas} hari`;
    row.insertCell().textContent = currencyFormatter.format(Number(journal.beban_penyusutan));
  }
}

async function fetchAllPages(queryFactory) {
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, headers, rows) {
  const content = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportCsv(button, kind) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Menyiapkan CSV...";
  try {
    const client = window.supabaseClient;
    const today = localDateValue();
    if (kind === "transactions") {
      const rows = await fetchAllPages(() => client.from("transaksi_sewa")
        .select("kode_transaksi,tanggal_mulai,tanggal_selesai,total_biaya,status,penyewa(nama),kamera(kode_aset,nama_aset)")
        .order("tanggal_mulai", { ascending: false }));
      downloadCsv(`transaksi-rental-${today}.csv`, [
        "Kode Transaksi", "Kode Aset", "Nama Kamera", "Penyewa", "Tanggal Mulai",
        "Tanggal Selesai", "Durasi (Hari)", "Status", "Total Biaya",
      ], rows.map((transaction) => [
        transaction.kode_transaksi,
        transaction.kamera?.kode_aset,
        transaction.kamera?.nama_aset,
        transaction.penyewa?.nama,
        transaction.tanggal_mulai,
        transaction.tanggal_selesai,
        rentalActivityDays(transaction.tanggal_mulai, transaction.tanggal_selesai),
        transaction.status,
        transaction.total_biaya,
      ]));
    } else {
      const rows = await fetchAllPages(() => client.from("jurnal_penyusutan")
        .select("tanggal_jurnal,hari_aktivitas,tarif_penyusutan_per_hari,beban_penyusutan,akun_debit,akun_kredit,metode,transaksi_sewa(kode_transaksi),kamera(kode_aset,nama_aset)")
        .order("tanggal_jurnal", { ascending: false }));
      downloadCsv(`jurnal-penyusutan-${today}.csv`, [
        "Tanggal Jurnal", "Kode Transaksi", "Kode Aset", "Nama Kamera", "Hari Aktivitas",
        "Tarif Penyusutan per Hari", "Beban Penyusutan", "Akun Debit", "Akun Kredit", "Metode",
      ], rows.map((journal) => [
        journal.tanggal_jurnal,
        journal.transaksi_sewa?.kode_transaksi,
        journal.kamera?.kode_aset,
        journal.kamera?.nama_aset,
        journal.hari_aktivitas,
        journal.tarif_penyusutan_per_hari,
        journal.beban_penyusutan,
        journal.akun_debit,
        journal.akun_kredit,
        journal.metode,
      ]));
    }
  } catch (error) {
    showFormMessage(`CSV gagal diunduh: ${error.message || String(error)}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function generateTransactionCode() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TRX-${timestamp}-${suffix}`;
}

async function submitRental(event) {
  event.preventDefault();
  clearFormMessage();
  const camera = selectedCamera();
  const activityDays = rentalActivityDays(elements.startDate.value, elements.endDate.value);
  const rentalFee = Number(elements.rentalFee.value);
  if (!camera || !renters.some((renter) => String(renter.id) === elements.renterSelect.value)) {
    showFormMessage("Pilih kamera dan penyewa yang tersedia.", "error");
    return;
  }
  if (!activityDays) {
    showFormMessage("Tanggal selesai harus setelah tanggal mulai.", "error");
    return;
  }
  if (savingRate) {
    showFormMessage("Tunggu sampai penyimpanan tarif kamera selesai.", "error");
    return;
  }
  if (!Number.isFinite(rentalFee) || rentalFee < 0) {
    showFormMessage("Masukkan total biaya sewa yang valid.", "error");
    return;
  }
  if (elements.cameraRate.value === "" ||
      !Number.isFinite(Number(elements.cameraRate.value)) ||
      Number(elements.cameraRate.value) < 0 ||
      Number(elements.cameraRate.value) !== Number(camera.tarif_sewa_harian)) {
    showFormMessage("Isi tarif sewa harian kamera terlebih dahulu agar total biaya dapat dihitung otomatis.", "error");
    return;
  }

  const client = window.supabaseClient;
  const isBooking = elements.endDate.value > localDateValue();
  elements.submitButton.disabled = true;
  elements.submitButton.querySelector("span").textContent = "Menyimpan...";
  const transaction = {
    kode_transaksi: generateTransactionCode(),
    kamera_id: camera.id,
    penyewa_id: Number(elements.renterSelect.value),
    tanggal_mulai: elements.startDate.value,
    tanggal_selesai: elements.endDate.value,
    total_biaya: rentalFee,
    status: isBooking ? "Booking" : "Selesai",
    status_pengembalian: isBooking ? "Belum kembali" : "Sudah kembali",
    tanggal_pengembalian: isBooking ? null : elements.endDate.value,
  };

  try {
    const { data: savedTransaction, error: transactionError } = await client
      .from("transaksi_sewa")
      .insert(transaction)
      .select("id")
      .single();
    if (transactionError) throw new Error(`Transaksi gagal disimpan: ${transactionError.message}`);

    elements.form.reset();
    updateEndDateMinimum();
    syncCameraRate();
    refreshRentalPreviews();
    await loadDashboard();
    if (isBooking) {
      showFormMessage("Booking tersimpan. Jurnal penyusutan otomatis dibuat saat kamera ditandai sudah kembali.", "success");
      return;
    }

    const { data: journal, error: journalError } = await client
      .from("jurnal_penyusutan")
      .select("id,beban_penyusutan")
      .eq("transaksi_id", savedTransaction.id)
      .maybeSingle();
    if (journalError) {
      showFormMessage(`Transaksi tersimpan, tetapi jurnal otomatis tidak dapat diverifikasi: ${journalError.message}`, "error");
    } else if (!journal) {
      showFormMessage(
        "Transaksi tersimpan, tetapi jurnal otomatis belum dibuat. Jalankan database/schema.sql di Supabase untuk memasang trigger jurnal.",
        "error",
      );
    } else {
      showFormMessage(
        `Transaksi dan jurnal penyusutan otomatis tersimpan. Beban: ${currencyFormatter.format(Number(journal.beban_penyusutan))}.`,
        "success",
      );
    }
  } catch (error) {
    showFormMessage(error.message || "Terjadi kesalahan saat menyimpan transaksi.", "error");
  } finally {
    elements.submitButton.querySelector("span").textContent = "Simpan transaksi";
    elements.submitButton.disabled = cameras.length === 0 || renters.length === 0 || !cameraRateAvailable;
  }
}

async function saveCameraRate() {
  const camera = selectedCamera();
  if (!camera) return;
  const value = elements.cameraRate.value;
  if (value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
    showFormMessage("Tarif harian harus berupa angka nol atau lebih.", "error");
    syncCameraRate();
    return;
  }
  const dailyRate = value === "" ? null : Number(value);
  if (dailyRate === (camera.tarif_sewa_harian == null ? null : Number(camera.tarif_sewa_harian))) {
    refreshRentalFee();
    return;
  }
  savingRate = true;
  elements.submitButton.disabled = true;
  try {
    const { error } = await window.supabaseClient
      .from("kamera")
      .update({ tarif_sewa_harian: dailyRate })
      .eq("id", camera.id);
    if (error) throw new Error(`Tarif kamera gagal disimpan: ${error.message}`);
    camera.tarif_sewa_harian = dailyRate;
    clearFormMessage();
  } catch (error) {
    showFormMessage(error.message || "Tarif kamera gagal disimpan.", "error");
    syncCameraRate();
  } finally {
    savingRate = false;
    elements.submitButton.disabled = cameras.length === 0 || renters.length === 0 || !cameraRateAvailable;
    refreshRentalPreviews();
  }
}

async function toggleReturnStatus(button) {
  const transaction = recentTransactions.find(
    (item) => String(item.id) === button.dataset.transactionId,
  );
  if (!transaction || !returnStatusAvailable) return;
  const isReturned = transaction.status_pengembalian === "Sudah kembali";
  if (!isReturned && transaction.tanggal_mulai > localDateValue()) {
    showFormMessage("Kamera belum dapat ditandai kembali sebelum tanggal mulai sewa.", "error");
    return;
  }
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Menyimpan...";
  try {
    const nowReturned = !isReturned;
    const nextStatus = nowReturned ? "Sudah kembali" : "Belum kembali";
    const { data: updatedTransaction, error: updateError } = await window.supabaseClient
      .from("transaksi_sewa")
      .update({
        status: transaction.tanggal_selesai > localDateValue()
          ? (nowReturned ? "Selesai" : "Booking")
          : "Selesai",
        status_pengembalian: nextStatus,
        tanggal_pengembalian: nowReturned ? localDateValue() : null,
      })
      .eq("id", transaction.id)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedTransaction) {
      throw new Error(updateError?.message || "Perubahan status tidak diizinkan oleh Supabase.");
    }
    await loadDashboard();
    if (nowReturned) {
      const { data: journal, error: journalError } = await window.supabaseClient
        .from("jurnal_penyusutan")
        .select("id,beban_penyusutan")
        .eq("transaksi_id", transaction.id)
        .maybeSingle();
      if (journalError) {
        showFormMessage(`Status pengembalian tersimpan, tetapi jurnal otomatis tidak dapat diverifikasi: ${journalError.message}`, "error");
      } else if (!journal) {
        showFormMessage(
          "Status pengembalian tersimpan, tetapi jurnal belum dibuat. Jalankan database/schema.sql di Supabase untuk memasang trigger jurnal otomatis.",
          "error",
        );
      } else {
        showFormMessage(
          `Kamera ditandai sudah kembali. Jurnal penyusutan otomatis tersimpan sebesar ${currencyFormatter.format(Number(journal.beban_penyusutan))}.`,
          "success",
        );
      }
    } else {
      showFormMessage("Status kamera diubah menjadi belum kembali.", "success");
    }
  } catch (error) {
    showFormMessage(error.message || "Status pengembalian gagal disimpan.", "error");
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

const now = new Date();
document.getElementById("today-label").textContent = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
}).format(now);
const hour = now.getHours();
elements.greeting.textContent = `${hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam"}, Rental Kamera!`;
elements.form.addEventListener("submit", submitRental);
elements.cameraSelect.addEventListener("change", () => {
  syncCameraRate();
  refreshRentalPreviews();
});
elements.startDate.addEventListener("change", () => {
  updateEndDateMinimum();
  refreshRentalPreviews();
});
elements.endDate.addEventListener("change", refreshRentalPreviews);
elements.cameraRate.addEventListener("input", refreshRentalFee);
elements.cameraRate.addEventListener("change", saveCameraRate);
elements.cameraStatusRows.addEventListener("change", (event) => {
  const select = event.target.closest(".camera-status-select");
  if (select) saveCameraStatus(select);
});
elements.exportTransactions.addEventListener("click", () =>
  exportCsv(elements.exportTransactions, "transactions"));
elements.exportJournals.addEventListener("click", () =>
  exportCsv(elements.exportJournals, "journals"));
elements.transactionRows.addEventListener("click", (event) => {
  const button = event.target.closest(".return-status-toggle");
  if (button) toggleReturnStatus(button);
});
syncCameraRate();
updateEndDateMinimum();
loadDashboard();
