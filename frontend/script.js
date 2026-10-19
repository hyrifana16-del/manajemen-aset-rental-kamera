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
  appShell: document.getElementById("app-shell"),
  authMessage: document.getElementById("auth-message"),
  loginEmail: document.getElementById("login-email"),
  loginForm: document.getElementById("login-form"),
  loginPassword: document.getElementById("login-password"),
  loginScreen: document.getElementById("login-screen"),
  loginSubmit: document.getElementById("login-submit"),
  logoutButton: document.getElementById("logout-button"),
  profileEmail: document.getElementById("profile-email"),
  cameraSelect: document.getElementById("camera-select"),
  cameraForm: document.getElementById("camera-form"),
  cameraFormMessage: document.getElementById("camera-form-message"),
  cameraRate: document.getElementById("camera-rate"),
  connectionDot: document.getElementById("connection-dot"),
  connectionStatus: document.getElementById("connection-status"),
  depreciationPreview: document.getElementById("depreciation-preview"),
  depreciationValue: document.getElementById("depreciation-value"),
  endDate: document.getElementById("end-date"),
  form: document.getElementById("rental-form"),
  formMessage: document.getElementById("form-message"),
  workspaceMessage: document.getElementById("workspace-message"),
  greeting: document.getElementById("dashboard-greeting"),
  journalRows: document.getElementById("journal-rows"),
  renterSelect: document.getElementById("renter-select"),
  renterForm: document.getElementById("renter-form"),
  renterFormMessage: document.getElementById("renter-form-message"),
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
let authenticatedUserId = null;
let authTransition = 0;

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

function showWorkspaceMessage(message, type) {
  elements.workspaceMessage.textContent = message;
  elements.workspaceMessage.className = `form-message visible ${type}`;
}

function showStatusMessage(message, type) {
  elements.cameraStatusMessage.textContent = message;
  elements.cameraStatusMessage.className = `form-message visible ${type}`;
}

function clearStatusMessage() {
  elements.cameraStatusMessage.textContent = "";
  elements.cameraStatusMessage.className = "form-message";
}

function showInlineFormMessage(element, message, type) {
  element.textContent = message;
  element.className = `form-message visible ${type}`;
}

function showAuthMessage(message, type = "error") {
  elements.authMessage.textContent = message;
  elements.authMessage.className = `form-message visible ${type}`;
}

async function applyAuthSession(session) {
  const user = session?.user;
  if (user && authenticatedUserId === user.id && !elements.appShell.hidden) return;
  const transition = ++authTransition;
  if (!user) {
    authenticatedUserId = null;
    elements.appShell.hidden = true;
    elements.loginScreen.hidden = false;
    history.replaceState(null, "", `${location.pathname}#login`);
    elements.loginForm.reset();
    document.querySelectorAll(".modal[open]").forEach((modal) => modal.close());
    elements.transactionRows.replaceChildren();
    elements.cameraStatusRows.replaceChildren();
    elements.journalRows.replaceChildren();
    elements.assetValue.textContent = "—";
    elements.depreciationValue.textContent = "—";
    elements.rentalCount.textContent = "—";
    clearFormMessage();
    clearStatusMessage();
    elements.workspaceMessage.textContent = "";
    elements.workspaceMessage.className = "form-message";
    cameras = [];
    renters = [];
    recentTransactions = [];
    recentJournals = [];
    setConnectionState("Silakan masuk", "");
    return;
  }

  authenticatedUserId = user.id;
  elements.loginScreen.hidden = true;
  elements.appShell.hidden = false;
  history.replaceState(null, "", `${location.pathname}#dashboard`);
  elements.profileEmail.textContent = user.email || "Akun terautentikasi";
  if (elements.authMessage.classList.contains("error")) {
    elements.authMessage.textContent = "";
    elements.authMessage.className = "form-message";
  }
  await loadDashboard(user.id, transition);
}

async function submitLogin(event) {
  event.preventDefault();
  elements.loginSubmit.disabled = true;
  elements.loginSubmit.textContent = "Memeriksa...";
  elements.authMessage.className = "form-message";
  try {
    if (!window.supabaseClient) {
      throw new Error(window.supabaseConfigError || "Supabase belum siap.");
    }
    const { error } = await window.supabaseClient.auth.signInWithPassword({
      email: elements.loginEmail.value.trim().toLowerCase(),
      password: elements.loginPassword.value,
    });
    if (error) throw error;
  } catch (error) {
    showAuthMessage(error.message || "Login gagal. Periksa email dan password.");
  } finally {
    elements.loginSubmit.disabled = false;
    elements.loginSubmit.textContent = "Masuk";
  }
}

async function logout() {
  elements.logoutButton.disabled = true;
  try {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    showWorkspaceMessage(`Logout gagal: ${error.message || String(error)}`, "error");
  } finally {
    elements.logoutButton.disabled = false;
  }
}

async function initializeAuth() {
  elements.loginForm.addEventListener("submit", submitLogin);
  elements.logoutButton.addEventListener("click", logout);
  window.addEventListener("hashchange", () => {
    if (!authenticatedUserId && location.hash !== "#login") {
      history.replaceState(null, "", `${location.pathname}#login`);
      elements.appShell.hidden = true;
      elements.loginScreen.hidden = false;
    }
  });

  if (!window.supabaseClient) {
    showAuthMessage(window.supabaseConfigError || "Supabase belum siap.");
    return;
  }

  window.supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => applyAuthSession(session), 0);
  });

  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) {
    showAuthMessage(`Sesi tidak dapat dipulihkan: ${error.message}`);
    return;
  }
  await applyAuthSession(data.session);
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

async function loadJournalRows(client) {
  const result = await client.from("jurnal_penyusutan")
    .select("id,transaksi_id,kamera_id,tanggal_jurnal,hari_aktivitas,tarif_penyusutan_per_hari,beban_penyusutan,debit,kredit,akun_debit,akun_kredit,metode,transaksi_sewa(kode_transaksi),kamera(kode_aset,nama_aset)")
    .order("tanggal_jurnal", { ascending: false })
    .limit(8);
  if (
    result.error?.code === "42703" &&
    (result.error.message.includes("debit") || result.error.message.includes("kredit"))
  ) {
    const fallback = await client.from("jurnal_penyusutan")
      .select("id,transaksi_id,kamera_id,tanggal_jurnal,hari_aktivitas,tarif_penyusutan_per_hari,beban_penyusutan,akun_debit,akun_kredit,metode,transaksi_sewa(kode_transaksi),kamera(kode_aset,nama_aset)")
      .order("tanggal_jurnal", { ascending: false })
      .limit(8);
    for (const journal of fallback.data || []) {
      journal.debit = journal.beban_penyusutan;
      journal.kredit = journal.beban_penyusutan;
    }
    return fallback;
  }
  return result;
}

async function loadDashboard(expectedUserId = authenticatedUserId, expectedTransition = authTransition) {
  if (!expectedUserId || expectedTransition !== authTransition) return;
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
      loadJournalRows(client),
      client.from("transaksi_sewa").select("id", { count: "exact", head: true }),
    ]);
  } catch (error) {
    if (expectedUserId !== authenticatedUserId || expectedTransition !== authTransition) return;
    const detail = error instanceof Error ? error.message : String(error);
    setConnectionState("Gagal memuat data", "error");
    showFormMessage(`Tidak dapat memuat data Supabase: ${detail}. Periksa koneksi dan kecocokan struktur tabel di Supabase.`, "error");
    elements.transactionRows.replaceChildren();
    const row = elements.transactionRows.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.className = "table-placeholder";
    cell.textContent = detail;
    return;
  }
  if (expectedUserId !== authenticatedUserId || expectedTransition !== authTransition) return;
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
      `Tidak dapat memuat data Supabase: ${firstError.error.message}. Periksa URL/kunci dan struktur tabel Supabase.`,
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

  const rentableCameras = cameras.filter((camera) =>
    ["Tersedia", "Sudah dikembalikan"].includes(camera.status_operasional));
  addSelectOptions(elements.cameraSelect, "Pilih aset kamera", rentableCameras, (camera) =>
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
      `${statusSetupWarnings.join(" ")} Jalankan database/migrations/20261019_double_entry_returns.sql di Supabase.`,
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
      ? "Sudah kembali"
      : transaction.status === "Booking" ? "Booking" : "Sedang disewa";
    row.insertCell().textContent = currencyFormatter.format(Number(transaction.total_biaya));
    const actionCell = row.insertCell();
    if (transaction.status === "Dibatalkan") {
      actionCell.textContent = "—";
      continue;
    }
    const returnButton = document.createElement("button");
    const isReturned = transaction.status_pengembalian === "Sudah kembali";
    returnButton.type = "button";
    returnButton.className = `return-status-toggle${isReturned ? " returned" : ""}`;
    returnButton.dataset.transactionId = transaction.id;
    returnButton.textContent = isReturned ? "Sudah kembali" : "Tandai kembali";
    returnButton.disabled = !returnStatusAvailable || isReturned;
    returnButton.setAttribute(
      "aria-label",
      `${isReturned ? "Status pengembalian" : "Tandai pengembalian"} ${transaction.kode_transaksi}; ${returnButton.textContent}`,
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
    if (nextStatus === "Sudah dikembalikan" && returnStatusAvailable) {
      const { data: openRentals, error: rentalsError } = await window.supabaseClient
        .from("transaksi_sewa")
        .select("id,tanggal_mulai")
        .eq("kamera_id", camera.id)
        .eq("status_pengembalian", "Belum kembali")
        .neq("status", "Dibatalkan");
      if (rentalsError) throw new Error(rentalsError.message);
      if (openRentals.length > 1) {
        throw new Error("Lebih dari satu transaksi belum kembali menggunakan kamera ini. Selesaikan tiap transaksi dari daftar rental.");
      }
      if (openRentals.length === 1) {
        if (openRentals[0].tanggal_mulai > localDateValue()) {
          throw new Error("Kamera belum dapat ditandai kembali sebelum tanggal mulai sewa.");
        }
        const { data: returnedRental, error: returnError } = await window.supabaseClient
          .from("transaksi_sewa")
          .update({
            status: "Selesai",
            status_pengembalian: "Sudah kembali",
            tanggal_pengembalian: localDateValue(),
          })
          .eq("id", openRentals[0].id)
          .eq("status_pengembalian", "Belum kembali")
          .select("id")
          .maybeSingle();
        if (returnError || !returnedRental) {
          throw new Error(returnError?.message || "Transaksi sudah berubah atau tidak dapat diperbarui.");
        }
        const { error: cameraStateError } = await window.supabaseClient
          .from("kamera")
          .update({ status_operasional: "Tersedia" })
          .eq("id", camera.id);
        if (cameraStateError) throw new Error(cameraStateError.message);
        await loadDashboard();
        showStatusMessage(`Pengembalian ${camera.kode_aset} dan status aset berhasil diperbarui.`, "success");
        return;
      }
    }
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
    cell.colSpan = 6;
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
    row.insertCell().textContent = currencyFormatter.format(Number(journal.debit ?? journal.beban_penyusutan));
    row.insertCell().textContent = currencyFormatter.format(Number(journal.kredit ?? journal.beban_penyusutan));
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
  const originalLabel = button.getAttribute("aria-label");
  button.disabled = true;
  button.setAttribute("aria-label", "Menyiapkan file CSV");
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
        .select("tanggal_jurnal,hari_aktivitas,tarif_penyusutan_per_hari,beban_penyusutan,debit,kredit,akun_debit,akun_kredit,metode,transaksi_sewa(kode_transaksi),kamera(kode_aset,nama_aset)")
        .order("tanggal_jurnal", { ascending: false }));
      downloadCsv(`jurnal-penyusutan-${today}.csv`, [
        "Tanggal Jurnal", "Kode Transaksi", "Kode Aset", "Nama Kamera", "Hari Aktivitas",
        "Tarif Penyusutan per Hari", "Debit", "Kredit", "Beban Penyusutan", "Akun Debit", "Akun Kredit", "Metode",
      ], rows.map((journal) => [
        journal.tanggal_jurnal,
        journal.transaksi_sewa?.kode_transaksi,
        journal.kamera?.kode_aset,
        journal.kamera?.nama_aset,
        journal.hari_aktivitas,
        journal.tarif_penyusutan_per_hari,
        journal.debit,
        journal.kredit,
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
    button.setAttribute("aria-label", originalLabel);
  }
}

function generateTransactionCode() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TRX-${timestamp}-${suffix}`;
}

async function submitCamera(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const dailyRate = formData.get("tarif_sewa_harian");
  const rateWasSkipped = !cameraRateAvailable && dailyRate !== "";
  const camera = {
    nama_aset: String(formData.get("nama_aset")).trim(),
    kode_aset: String(formData.get("kode_aset")).trim(),
    merk_model: String(formData.get("merk_model")).trim(),
    tanggal_perolehan: formData.get("tanggal_perolehan"),
    harga_perolehan: Number(formData.get("harga_perolehan")),
    nilai_residu: Number(formData.get("nilai_residu")),
    estimasi_total_hari_sewa: Number(formData.get("estimasi_total_hari_sewa")),
  };
  if (camera.nilai_residu > camera.harga_perolehan) {
    showInlineFormMessage(elements.cameraFormMessage, "Nilai residu tidak boleh melebihi harga perolehan.", "error");
    return;
  }
  if (cameraRateAvailable && dailyRate !== "") {
    camera.tarif_sewa_harian = Number(dailyRate);
  }

  button.disabled = true;
  button.querySelector("span").textContent = "Menyimpan...";
  elements.cameraFormMessage.className = "form-message";
  try {
    const { error } = await window.supabaseClient.from("kamera").insert(camera);
    if (error) throw new Error(error.message);
    form.reset();
    form.elements.nilai_residu.value = "0";
    await loadDashboard();
    const savedCamera = cameras.find((item) => item.kode_aset === camera.kode_aset);
    if (savedCamera) {
      elements.cameraSelect.value = String(savedCamera.id);
      syncCameraRate();
      refreshRentalPreviews();
    }
    showInlineFormMessage(
      elements.cameraFormMessage,
      rateWasSkipped
        ? "Kamera berhasil ditambahkan, tetapi tarif belum disimpan karena kolom tarif belum tersedia di database."
        : "Kamera berhasil ditambahkan.",
      "success",
    );
  } catch (error) {
    showInlineFormMessage(elements.cameraFormMessage, `Kamera gagal ditambahkan: ${error.message || String(error)}`, "error");
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Simpan kamera";
  }
}

async function submitRenter(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const formData = new FormData(form);
  const renter = {
    nama: String(formData.get("nama")).trim(),
    no_telepon: String(formData.get("no_telepon")).trim(),
    email: String(formData.get("email")).trim() || null,
  };

  button.disabled = true;
  button.querySelector("span").textContent = "Menyimpan...";
  elements.renterFormMessage.className = "form-message";
  try {
    const { error } = await window.supabaseClient.from("penyewa").insert(renter);
    if (error) throw new Error(error.message);
    form.reset();
    await loadDashboard();
    const savedRenter = renters.find((item) => item.no_telepon === renter.no_telepon);
    if (savedRenter) elements.renterSelect.value = String(savedRenter.id);
    showInlineFormMessage(elements.renterFormMessage, "Penyewa berhasil ditambahkan.", "success");
  } catch (error) {
    showInlineFormMessage(elements.renterFormMessage, `Penyewa gagal ditambahkan: ${error.message || String(error)}`, "error");
  } finally {
    button.disabled = false;
    button.querySelector("span").textContent = "Simpan penyewa";
  }
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
  const isBooking = elements.startDate.value > localDateValue();
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
    status_pengembalian: "Belum kembali",
    tanggal_pengembalian: null,
  };

  try {
    const { error: transactionError } = await client
      .from("transaksi_sewa")
      .insert(transaction);
    if (transactionError) throw new Error(`Transaksi gagal disimpan: ${transactionError.message}`);

    let cameraUpdateError = null;
    if (cameraStatusAvailable) {
      const { error } = await client
        .from("kamera")
        .update({ status_operasional: "Sedang disewa" })
        .eq("id", camera.id);
      cameraUpdateError = error;
    }
    elements.form.reset();
    updateEndDateMinimum();
    syncCameraRate();
    refreshRentalPreviews();
    await loadDashboard();
    showFormMessage(
      cameraUpdateError
        ? `Transaksi tersimpan, tetapi status kamera gagal diperbarui: ${cameraUpdateError.message}`
        : isBooking
          ? "Booking tersimpan. Jurnal penyusutan dibuat setelah kamera benar-benar dikembalikan."
          : "Transaksi tersimpan. Tandai kembali setelah kamera diterima untuk membuat jurnal penyusutan.",
      cameraUpdateError ? "error" : "success",
    );
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
  if (transaction.status_pengembalian === "Sudah kembali") return;
  if (transaction.tanggal_mulai > localDateValue()) {
    showWorkspaceMessage("Kamera belum dapat ditandai kembali sebelum tanggal mulai sewa.", "error");
    return;
  }
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Menyimpan...";
  try {
    const { data: updatedTransaction, error: updateError } = await window.supabaseClient
      .from("transaksi_sewa")
      .update({
        status: "Selesai",
        status_pengembalian: "Sudah kembali",
        tanggal_pengembalian: localDateValue(),
      })
      .eq("id", transaction.id)
      .eq("status_pengembalian", "Belum kembali")
      .select("id")
      .maybeSingle();
    if (updateError || !updatedTransaction) {
      throw new Error(updateError?.message || "Perubahan status tidak diizinkan oleh Supabase.");
    }
    let cameraUpdateError = null;
    if (cameraStatusAvailable) {
      const { error } = await window.supabaseClient
        .from("kamera")
        .update({ status_operasional: "Tersedia" })
        .eq("id", transaction.kamera_id);
      cameraUpdateError = error;
    }
    await loadDashboard();
    const { data: journal, error: journalError } = await window.supabaseClient
      .from("jurnal_penyusutan")
      .select("id,beban_penyusutan")
      .eq("transaksi_id", transaction.id)
      .maybeSingle();
    if (journalError) {
      showWorkspaceMessage(`Pengembalian tersimpan, tetapi jurnal tidak dapat diverifikasi: ${journalError.message}`, "error");
    } else if (!journal) {
      showWorkspaceMessage("Pengembalian tersimpan, tetapi jurnal tidak ditemukan. Jalankan migrasi database/migrations/20261019_double_entry_returns.sql di Supabase.", "error");
    } else {
      showWorkspaceMessage(cameraUpdateError
        ? `Pengembalian dan jurnal tersimpan, tetapi status kamera belum diperbarui: ${cameraUpdateError.message}`
        : `Kamera kembali dan tersedia. Jurnal seimbang tersimpan sebesar ${currencyFormatter.format(Number(journal.beban_penyusutan))}.`,
      cameraUpdateError ? "error" : "success");
    }
  } catch (error) {
    showWorkspaceMessage(error.message || "Status pengembalian gagal disimpan.", "error");
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
document.getElementById("workspace-date-label").textContent = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(now);
const hour = now.getHours();
elements.greeting.textContent = `${hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam"}, Rental Kamera!`;
elements.form.addEventListener("submit", submitRental);
elements.cameraForm.addEventListener("submit", submitCamera);
elements.renterForm.addEventListener("submit", submitRenter);
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
document.querySelectorAll("[data-open-modal]").forEach((button) => {
  button.addEventListener("click", () => {
    const modal = document.getElementById(button.dataset.openModal);
    if (modal instanceof HTMLDialogElement) modal.showModal();
  });
});
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});
document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
});
syncCameraRate();
updateEndDateMinimum();
initializeAuth();
