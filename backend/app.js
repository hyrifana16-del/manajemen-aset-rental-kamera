(() => {
  const config = {
    url: "https://pkiexocmlcbtguzaggvk.supabase.co",
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBraWV4b2NtbGNidGd1emFnZ3ZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3OTAzNjQsImV4cCI6MjEwNzM2NjM2NH0.JLAHd9bt2N3AbjgvuHPndP2VIq7KICZ-2WqyKN54QzY",
  };

  window.supabaseConfig = config;

  const supabaseLibrary = window.supabase;
  const isConfigured =
    !config.url.includes("YOUR_PROJECT_ID") &&
    !config.anonKey.includes("YOUR_SUPABASE_ANON_KEY") &&
    config.anonKey.trim().length >= 20 &&
    !/^\*+$/.test(config.anonKey.trim());

  if (!isConfigured) {
    window.supabaseConfigError =
      "Konfigurasi Supabase belum valid. Isi URL project dan anon/publishable key di backend/app.js.";
    return;
  }

  if (!supabaseLibrary || typeof supabaseLibrary.createClient !== "function") {
    window.supabaseConfigError =
      "Library Supabase tidak termuat. Periksa koneksi internet dan script CDN.";
    return;
  }

  window.supabaseClient = supabaseLibrary.createClient(config.url, config.anonKey);
})();
