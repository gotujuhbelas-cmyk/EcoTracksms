// ══════════════════════════════════════════════════════════════
// app.js — EcoTRACK SMS v18 (CACHE ROLE — menu instan, no nunggu)
console.log("%cAPP.JS SMS v18 — cache role aktif", "color:#2e7d32;font-weight:bold;font-size:14px");
// ══════════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyBPXEupZVZND7nkedR-bMWi19vcsgA9F-E",
  authDomain: "ecotracksms.firebaseapp.com",
  projectId: "ecotracksms",
  storageBucket: "ecotracksms.firebasestorage.app",
  messagingSenderId: "773463592761",
  appId: "1:773463592761:web:71c1dab66efd1765ea62e8",
  measurementId: "G-HBQK1T1ZL0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ═══ SETTINGS DINAMIS (room & client tersimpan di Firestore) ═══
let SETTINGS = {
  clients: ["Summarecon Mall Serpong"],
  rooms: [
    { nama: "WR Pasar modern SMS", client: "Summarecon Mall Serpong" },
    { nama: "WR SMS 1", client: "Summarecon Mall Serpong" },
    { nama: "WR SMS 2", client: "Summarecon Mall Serpong" }
  ]
};

function loadSettings(cb) {
  db.collection("settings").doc("main").get().then(doc => {
    if (doc.exists && doc.data().rooms && doc.data().rooms.length) {
      SETTINGS.rooms = doc.data().rooms;
      SETTINGS.clients = doc.data().clients || SETTINGS.clients;
    } else {
      db.collection("settings").doc("main").set(SETTINGS).catch(() => {});
    }
    initRoomSelects();
    if (typeof renderSettingsLists === "function") renderSettingsLists();
    if (cb) cb();
  }).catch(() => { initRoomSelects(); if (cb) cb(); });
}

window.__roomClient = function(room) {
  const r = SETTINGS.rooms.find(x => x.nama === room);
  return r ? r.client : "";
};

let currentUser = null;
let currentRole = null;
let currentRoom = "ALL";
let maps = {};
let truckIcon = null;
let routeHistory = [];
let unsubRoute = null;
let selectedFiles = [];
let editSelectedFiles = [];
window.capturedPhotos = window.capturedPhotos || [];
window.__roomLock = null;

function roomLocked() { return window.__roomLock || null; }

// ═══ v18: cache role per UID ═══
function readRoleCache(uid) {
  try {
    const c = JSON.parse(localStorage.getItem("rajRole_" + uid) || "null");
    if (c) return { role: c.role || "user", room: c.room || "ALL" };
  } catch (e) {}
  return { role: "user", room: "ALL" };
}
function writeRoleCache(uid, role, room) {
  try { localStorage.setItem("rajRole_" + uid, JSON.stringify({ role: role, room: room })); } catch (e) {}
}
function applyRoomLock(role, room) {
  window.__roomLock = (role === "user" && room && room !== "ALL") ? room : null;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseDate(val) {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === "function") {
    const d = val.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
  if (typeof val === "string") { const d = new Date(val); return isNaN(d.getTime()) ? null : d; }
  return null;
}
function fmtDate(val) {
  const d = parseDate(val);
  return d ? d.toLocaleString("id-ID") : null;
}

function toast(msg, type = "info") {
  let wrap = document.getElementById("toastWrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "toastWrap";
    wrap.style.cssText = "position:fixed;top:70px;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.style.cssText = "min-width:260px;padding:.75rem 1rem;border-radius:10px;color:#fff;font-size:.875rem;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.2)";
  const colors = { success: "#2e7d32", error: "#c62828", info: "#1565c0", warning: "#ef6c00" };
  el.style.background = colors[type] || colors.info;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3500);
}

function showLoading(text = "Memuat data...") {
  const overlay = document.getElementById("loadingOverlay");
  const txt = document.getElementById("loadingText");
  if (overlay) { overlay.classList.remove("hidden"); if (txt) txt.textContent = text; }
}
function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.classList.add("hidden");
}

function showPublic() {
  document.getElementById("publicView").classList.remove("hidden");
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("driverTrackingView").classList.add("hidden");
  setTimeout(() => { initMap("public"); updateLiveMap("public"); }, 200);
}
function showLogin() {
  document.getElementById("publicView").classList.add("hidden");
  document.getElementById("loginView").classList.remove("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("driverTrackingView").classList.add("hidden");
}
function showDriverTracking() {
  document.getElementById("publicView").classList.add("hidden");
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  document.getElementById("driverTrackingView").classList.remove("hidden");
  setTimeout(() => initMap("share"), 200);
}
function toggleMenu() {
  document.querySelectorAll(".nav-links").forEach(el => el.classList.toggle("show"));
}

function doFirebaseLogin(e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPassword").value;
  const errBox = document.getElementById("loginError");
  showLoading("Login...");
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => { if (errBox) errBox.textContent = ""; hideLoading(); toast("Login berhasil!", "success"); })
    .catch(err => { hideLoading(); if (errBox) errBox.textContent = "❌ " + err.message; toast("Login gagal: " + err.message, "error"); });
}

function doFirebaseLogout() {
  auth.signOut().then(() => { localStorage.removeItem("am_session"); toast("Logout berhasil.", "info"); showPublic(); });
}

// ═══ v18: detectRole + simpan cache ═══
function detectRole(user) {
  return db.collection("users").doc(user.uid).get()
    .then(doc => {
      const data = doc.exists ? doc.data() : {};
      currentRole = data.role || "user";
      currentRoom = data.room || "ALL";
      writeRoleCache(user.uid, currentRole, currentRoom);
      window.currentUserRoom = currentRoom;
      applyRoomLock(currentRole, currentRoom);
      return currentRole;
    })
    .catch(() => { currentRole = "user"; applyRoomLock("user", "ALL"); return currentRole; });
}

// ═══ v18: pakai cache dulu biar menu INSTAN ═══
auth.onAuthStateChanged(user => {
  currentUser = user;
  hideLoading();
  if (user) {
    const c = readRoleCache(user.uid);
    currentRole = c.role;
    currentRoom = c.room;
    applyRoomLock(c.role, c.room);
    showDashboard(user, c.role);
    detectRole(user).then(role => {
      currentRole = role;
      window.currentUserRole = role;
      applyRoleUI(role);
      const badge = document.getElementById("roleBadge");
      if (badge) badge.textContent = role.toUpperCase();
      const brand = document.getElementById("dashBrand");
      if (brand) brand.textContent = role === "admin" ? "Admin Panel" : role === "driver" ? "Driver Panel" : "Dashboard";
      loadDashboardStats();
      loadDashData();
      if (role === "admin") { loadUsersList(); renderSettingsLists(); }
    });
  } else { currentUser = null; currentRole = null; window.__roomLock = null; }
});

// ═══ v17: SECTION + NAV disembunyikan sesuai role ═══
function applyRoleUI(role) {
  const show = (el, on) => { if (el) el.style.display = on ? "" : "none"; };
  const navInput = document.getElementById("navInput");
  const navShare = document.getElementById("navShare");
  const thAksi = document.getElementById("thAksi");
  const navManage = document.getElementById("navManage");
  const secInput = document.getElementById("dashInput");
  const secShare = document.getElementById("dashShare");
  const secManage = document.getElementById("dashManage");

  if (role === "admin") {
    show(navInput, true);  show(navShare, true);  show(thAksi, true);  show(navManage, true);
    show(secInput, true);  show(secShare, true);  show(secManage, true);
  } else if (role === "driver") {
    show(navInput, true);  show(navShare, true);  show(thAksi, false); show(navManage, false);
    show(secInput, true);  show(secShare, true);  show(secManage, false);
  } else {
    show(navInput, false); show(navShare, false); show(thAksi, false); show(navManage, false);
    show(secInput, false); show(secShare, false); show(secManage, false);
  }

  const repRoomGroup = document.getElementById("reportRoomGroup");
  if (repRoomGroup) repRoomGroup.style.display = roomLocked() ? "none" : "";
}

function initRoomSelects() {
  const f = document.getElementById("fRoom");
  const r = document.getElementById("reportRoom");
  const opts = SETTINGS.rooms.map(x => '<option value="' + x.nama + '">' + x.nama + "</option>").join("");
  if (f) f.innerHTML = '<option value="">-- Pilih Waste Room --</option>' + opts;
  if (r) r.innerHTML = '<option value="all">Semua Waste Room</option>' + opts;
  const mRoom = document.getElementById("mRoom");
  if (mRoom) mRoom.innerHTML = '<option value="ALL">ALL — Semua Room</option>' + opts;
  const mRoomClient = document.getElementById("mRoomClient");
  if (mRoomClient) mRoomClient.innerHTML = SETTINGS.clients.map(c => '<option value="' + c + '">' + c + "</option>").join("");
}

function showDashboard(user, role) {
  window.currentUserRole = role;
  document.getElementById("publicView").classList.add("hidden");
  document.getElementById("loginView").classList.add("hidden");
  document.getElementById("driverTrackingView").classList.add("hidden");
  document.getElementById("dashboardView").classList.remove("hidden");
  document.getElementById("dashEmail").textContent = user.email || "user";
  document.getElementById("roleBadge").textContent = role.toUpperCase();
  document.getElementById("dashBrand").textContent = role === "admin" ? "Admin Panel" : role === "driver" ? "Driver Panel" : "Dashboard";

  applyRoleUI(role);
  initRoomSelects();

  setTimeout(() => { initMap("dash"); initMap("dashShare"); updateLiveMap("dash"); loadRouteHistory(); loadDashboardStats(); loadDashData(); }, 300);
}

function initMap(context) {
  const mapIds = { public: "mapPublic", dash: "mapDash", share: "mapShare", dashShare: "mapDashShare" };
  const id = mapIds[context];
  if (!id) return;
  const el = document.getElementById(id);
  if (!el || el._leaflet_id) return;
  const map = L.map(id).setView([-6.238, 106.633], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; OpenStreetMap' }).addTo(map);
  maps[context] = map;
  if (!truckIcon) {
    truckIcon = L.divIcon({ className: "truck-marker", html: '<div style="font-size:28px;text-shadow:0 2px 4px rgba(0,0,0,.3)">🚛</div>', iconSize: [36, 36], iconAnchor: [18, 36] });
  }
}

let liveUnsubs = {};
function updateLiveMap(context) {
  const map = maps[context];
  if (!map) return;
  if (liveUnsubs[context]) liveUnsubs[context]();
  map.eachLayer(layer => { if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer); });
  liveUnsubs[context] = db.collection("live_tracking").where("isActive", "==", true).onSnapshot(snap => {
    map.eachLayer(layer => { if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer); });
    snap.forEach(doc => {
      const d = doc.data();
      if (d.lastLat && d.lastLng) {
        L.marker([d.lastLat, d.lastLng], { icon: truckIcon }).addTo(map)
          .bindPopup(`<b>${d.vehicleName || d.truckId || doc.id}</b><br>Driver: ${d.driverName || d.driverId}<br>Jarak: ${((d.totalDistance||0)/1000).toFixed(2)} km`);
        if (d.path && d.path.length > 0) {
          const points = d.path.split(";").filter(Boolean).map(s => { const [lat, lng] = s.split(",").map(Number); return [lat, lng]; });
          if (points.length > 1) L.polyline(points, { color: "#2e7d32", weight: 3, opacity: 0.7 }).addTo(map);
        }
      }
    });
    const overlay = document.getElementById("mapOverlay");
    if (overlay && context === "public") overlay.style.display = snap.empty ? "flex" : "none";
  }, err => console.warn("[liveMap]", err));
}

function loadRouteHistory() {
  const tbody = document.getElementById("routeTableDash");
  if (!tbody) return;
  if (unsubRoute) unsubRoute();
  unsubRoute = db.collection("routes").orderBy("savedAt", "desc").limit(20).onSnapshot(snap => {
    routeHistory = [];
    tbody.innerHTML = "";
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;color:#888">Belum ada riwayat rute</td></tr>'; return; }
    snap.forEach(doc => {
      const d = doc.data();
      routeHistory.push({ id: doc.id, ...d });

      const start = fmtDate(d.startTime) || "-";
      const end = d.isActive === true ? "🟢 Berjalan" : (fmtDate(d.endTime) || "-");
      const pts = d.pointCount || (d.path ? d.path.split(";").length : 0);
      const km = d.totalDistance ? (d.totalDistance / 1000).toFixed(2) + " km" : "0 km";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${start}</td>
        <td>${end}</td>
        <td>${d.vehicleName || d.truckId || "-"}</td>
        <td>${d.driverName || d.driverId || "-"}</td>
        <td>${km}</td>
        <td>${pts}</td>
        <td>${isAdminCtl() ? `<button class="btn btn-sm btn-danger" onclick="adminDeleteRoute('${doc.id}')">🗑️</button>` : ""}</td>
      `;
      tbody.appendChild(tr);
    });
  }, err => console.warn("[routeHistory]", err));
}

function deleteRoute(docId) {
  if (!confirm("Hapus rute ini?")) return;
  db.collection("routes").doc(docId).delete()
    .then(() => toast("Rute dihapus.", "success"))
    .catch(err => toast("Gagal hapus: " + err.message, "error"));
}

function loadDashboardStats() {
  db.collection("sampah").get()
    .then(snap => {
      const lock = roomLocked();
      let totalPickup = 0, totalWeight = 0, totalProcessed = 0, totalResidue = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if (lock && (d.room || "-") !== lock) return;
        totalPickup++;
        totalWeight += d.berat || 0;
        totalProcessed += d.diolah || 0;
        totalResidue += d.residu || 0;
      });
      const ids = [
        ["stPickup", totalPickup],
        ["stWeight", totalWeight.toFixed(1) + " kg"],
        ["stProcessed", totalProcessed.toFixed(1) + " kg"],
        ["stResidue", totalResidue.toFixed(1) + " kg"]
      ];
      ids.forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });

      let pPickup = 0, pWeight = 0, pProc = 0, pRes = 0;
      snap.forEach(doc => {
        const d = doc.data();
        pPickup++; pWeight += d.berat || 0; pProc += d.diolah || 0; pRes += d.residu || 0;
      });
      [["pubTotalPickup", pPickup], ["pubTotalWeight", pWeight.toFixed(1) + " kg"], ["pubProcessed", pProc.toFixed(1) + " kg"], ["pubResidue", pRes.toFixed(1) + " kg"]]
        .forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
    })
    .catch(err => console.warn("[stats]", err));
}

function handleFileSelect(e) {
  selectedFiles = Array.from(e.target.files).slice(0, 5);
  updateFileListUI();
}

function updateFileListUI() {
  const list = document.getElementById("fileList");
  if (!list) return;
  const allFiles = (window.capturedPhotos || []).concat(selectedFiles);
  list.innerHTML = allFiles.map(f => `
    <div class="file-item">
      <span>📷 ${f.name}</span>
      <span style="color:#888;font-size:.8rem">${(f.size/1024).toFixed(1)} KB</span>
    </div>
  `).join("");
}

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addData(e) {
  e.preventDefault();
  const room = document.getElementById("fRoom").value;
  if (!room) { toast("Pilih waste room terlebih dahulu.", "warning"); return; }
  showLoading("Menyimpan data...");
  try {
    const allFiles = (window.capturedPhotos || []).concat(selectedFiles).slice(0, 5);
    const doc = {
      tanggal: document.getElementById("fTanggal").value,
      jenis: document.getElementById("fJenis").value,
      room: room,
      berat: parseFloat(document.getElementById("fBerat").value) || 0,
      diolah: parseFloat(document.getElementById("fDiolah").value) || 0,
      residu: parseFloat(document.getElementById("fResidu").value) || 0,
      petugas: document.getElementById("fPetugas").value,
      catatan: document.getElementById("fCatatan").value,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser ? currentUser.email : "unknown"
    };
    const fotoUrls = [];
    for (const file of allFiles) {
      try {
        const compressed = await compressImage(file);
        const b64 = await fileToBase64(compressed);
        fotoUrls.push(b64);
      } catch (err) { console.warn("Foto gagal diproses:", err); }
    }
    doc.fotos = fotoUrls;
    await db.collection("sampah").add(doc);
    toast("Data " + room + " berhasil disimpan!", "success");
    e.target.reset();
    selectedFiles = [];
    window.capturedPhotos = [];
    updateFileListUI();
    if (typeof closeCamera === "function") closeCamera();
    loadDashboardStats();
    loadDashData();
    hideLoading();
  } catch (err) {
    console.error("[addData error]", err);
    toast("Gagal simpan: " + err.message, "error");
    hideLoading();
  }
}

function loadDashData() {
  const tbody = document.getElementById("dashDataTable");
  if (!tbody) return;
  db.collection("sampah").orderBy("createdAt", "desc").limit(100)
    .get()
    .then(snap => {
      const lock = roomLocked();
      tbody.innerHTML = "";
      let n = 0;
      snap.forEach(doc => {
        const d = doc.data();
        if (lock && (d.room || "-") !== lock) return;
        n++;
        const fotos = d.fotos || d.foto || [];
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${d.tanggal}</td><td><b>${d.room || "-"}</b></td><td>${d.jenis}</td><td>${d.berat} kg</td><td>${d.diolah} kg</td><td>${d.residu} kg</td><td>${d.petugas}</td>
          <td>${fotos.length > 0 ? `<button class="btn btn-sm" onclick="showPhotos('${doc.id}')">📷 ${fotos.length}</button>` : "-"}</td>
          <td>
            <button class="btn btn-sm" onclick="openEdit('${doc.id}')">✏️</button>
            ${isAdminCtl() ? `<button class="btn btn-sm btn-danger" onclick="deleteData('${doc.id}')">🗑️</button>` : ""}
          </td>
        `;
        tbody.appendChild(tr);
      });
      if (!n) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:15px;color:#888">Belum ada data</td></tr>';
    });
}

let editDocId = null;
function openEdit(id) {
  editDocId = id;
  db.collection("sampah").doc(id).get().then(doc => {
    const d = doc.data();
    document.getElementById("eId").value = id;
    document.getElementById("eTanggal").value = d.tanggal;
    document.getElementById("eJenis").value = d.jenis;
    document.getElementById("eBerat").value = d.berat;
    document.getElementById("eDiolah").value = d.diolah || "";
    document.getElementById("eResidu").value = d.residu || "";
    document.getElementById("ePetugas").value = d.petugas;
    document.getElementById("eCatatan").value = d.catatan || "";
    const gallery = document.getElementById("eExistingPhotos");
    const fotos = d.fotos || d.foto || [];
    if (gallery) gallery.innerHTML = fotos.map(url => `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin:4px;cursor:pointer" onclick="viewPhoto('${url}')">`).join("");
    document.getElementById("editModal").classList.add("show");
  });
}
function closeEditModal() { document.getElementById("editModal").classList.remove("show"); editDocId = null; }
function handleEditFileSelect(e) {
  editSelectedFiles = Array.from(e.target.files).slice(0, 5);
  const list = document.getElementById("eFileList");
  if (list) list.innerHTML = editSelectedFiles.map(f => `<div>${f.name}</div>`).join("");
}
function updateData(e) {
  e.preventDefault();
  if (!editDocId) return;
  const update = {
    tanggal: document.getElementById("eTanggal").value,
    jenis: document.getElementById("eJenis").value,
    berat: parseFloat(document.getElementById("eBerat").value) || 0,
    diolah: parseFloat(document.getElementById("eDiolah").value) || 0,
    residu: parseFloat(document.getElementById("eResidu").value) || 0,
    petugas: document.getElementById("ePetugas").value,
    catatan: document.getElementById("eCatatan").value
  };
  db.collection("sampah").doc(editDocId).update(update)
    .then(() => { toast("Data diupdate!", "success"); closeEditModal(); loadDashData(); })
    .catch(err => toast("Gagal update: " + err.message, "error"));
}
function deleteData(id) {
  if (!confirm("Hapus data ini?")) return;
  db.collection("sampah").doc(id).delete()
    .then(() => { toast("Data dihapus.", "success"); loadDashData(); loadDashboardStats(); });
}

function showPhotos(docId) {
  db.collection("sampah").doc(docId).get().then(doc => {
    const d = doc.data();
    const fotos = d.fotos || d.foto || [];
    const viewer = document.getElementById("photoViewer");
    if (viewer) viewer.innerHTML = fotos.map(url => `<img src="${url}" style="max-width:100%;border-radius:8px;margin:10px 0">`).join("");
    document.getElementById("photoModal").classList.add("show");
  });
}
function viewPhoto(url) { window.open(url, "_blank"); }
function closePhotoModal() { document.getElementById("photoModal").classList.remove("show"); }

function toggleCustomDate() {
  const period = document.getElementById("reportPeriod").value;
  document.getElementById("dailyDateGroup").classList.toggle("hidden", period !== "daily");
  document.getElementById("weeklyDateGroup").classList.toggle("hidden", period !== "weekly");
  document.getElementById("monthlyDateGroup").classList.toggle("hidden", period !== "monthly");
  document.getElementById("customDateGroup").classList.toggle("hidden", period !== "custom");
  document.getElementById("customDateGroup2").classList.toggle("hidden", period !== "custom");
}

function generateReport() {
  const period = document.getElementById("reportPeriod").value;
  const roomSel = document.getElementById("reportRoom");
  const roomFilter = roomLocked() || (roomSel ? roomSel.value : "all");
  window.__roomLabel = roomFilter === "all" ? "" : roomFilter;

  let start, end;
  if (period === "daily") { const d = document.getElementById("reportDate").value || new Date().toISOString().split("T")[0]; start = new Date(d); end = new Date(d); end.setDate(end.getDate() + 1); }
  else if (period === "weekly") { const d = document.getElementById("reportWeekDate").value; start = new Date(d); end = new Date(d); end.setDate(end.getDate() + 7); }
  else if (period === "monthly") { const m = document.getElementById("reportMonth").value; start = new Date(m + "-01"); end = new Date(start.getFullYear(), start.getMonth() + 1, 1); }
  else if (period === "custom") { start = new Date(document.getElementById("reportDateFrom").value); end = new Date(document.getElementById("reportDateTo").value); end.setDate(end.getDate() + 1); }

  db.collection("sampah")
    .where("tanggal", ">=", start.toISOString().split("T")[0])
    .where("tanggal", "<", end.toISOString().split("T")[0])
    .get()
    .then(snap => {
      let totalPickup = 0, totalWeight = 0, totalProcessed = 0, totalResidue = 0;
      const rows = [];
      snap.forEach(doc => {
        const d = doc.data();
        if (roomFilter !== "all" && (d.room || "-") !== roomFilter) return;
        totalPickup++;
        totalWeight += d.berat || 0;
        totalProcessed += d.diolah || 0;
        totalResidue += d.residu || 0;
        rows.push(d);
      });
      document.getElementById("rptTotalPickup").textContent = totalPickup;
      document.getElementById("rptTotalWeight").textContent = totalWeight.toFixed(1) + " kg";
      document.getElementById("rptTotalProcessed").textContent = totalProcessed.toFixed(1) + " kg";
      document.getElementById("rptTotalResidue").textContent = totalResidue.toFixed(1) + " kg";
      const tbody = document.getElementById("reportTableBody");
      if (tbody) {
        tbody.innerHTML = rows.length ? rows.map(r => `
          <tr><td>${r.tanggal}</td><td><b>${r.room || "-"}</b></td><td>${r.jenis}</td><td>${r.berat} kg</td><td>${r.diolah} kg</td><td>${r.residu} kg</td><td>${r.petugas}</td></tr>
        `).join("") : '<tr><td colspan="7" style="text-align:center;padding:15px;color:#888">Tidak ada data di periode ini</td></tr>';
      }
    });
}

// ══════════════════════════════════════════════════════════════
// ⚙️ PANEL MANAJEMEN (khusus admin)
// ══════════════════════════════════════════════════════════════

let secondaryApp = null;
function getSecondaryAuth() {
  try {
    if (!secondaryApp) secondaryApp = firebase.initializeApp(firebaseConfig, "secondary");
    return secondaryApp.auth();
  } catch (e) {
    return firebase.app("secondary").auth();
  }
}

function createAccount(email, pass, role, room) {
  const secAuth = getSecondaryAuth();
  return secAuth.createUserWithEmailAndPassword(email, pass).then(cred => {
    const uid = cred.user.uid;
    return db.collection("users").doc(uid).set({ role: role, room: room || "", email: email })
      .then(() => secAuth.signOut().then(() => uid));
  });
}

function submitNewAccount(e) {
  e.preventDefault();
  if ((window.currentUserRole || "") !== "admin") { toast("Hanya admin yang dapat mengelola akun.", "error"); return; }
  const email = document.getElementById("mEmail").value.trim();
  const pass = document.getElementById("mPass").value;
  const role = document.getElementById("mRole").value;
  const room = role === "user" ? document.getElementById("mRoom").value : "";
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) { toast("Email tidak valid.", "warning"); return; }
  if (pass.length < 6) { toast("Password minimal 6 karakter.", "warning"); return; }
  if (role === "user" && !room) { toast("Pilih room untuk akun user.", "warning"); return; }
  showLoading("Membuat akun...");
  createAccount(email, pass, role, room)
    .then(() => {
      hideLoading();
      toast("Akun " + role + " (" + email + ") berhasil dibuat! ✅", "success");
      document.getElementById("mEmail").value = "";
      document.getElementById("mPass").value = "";
      loadUsersList();
    })
    .catch(err => { hideLoading(); toast("Gagal membuat akun: " + err.message, "error"); });
}

function toggleMRoom() {
  const role = document.getElementById("mRole").value;
  const grp = document.getElementById("mRoomGroup");
  if (grp) grp.style.display = role === "user" ? "" : "none";
}

function loadUsersList() {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;
  db.collection("users").get().then(snap => {
    tbody.innerHTML = "";
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:12px;color:#888">Belum ada akun.</td></tr>'; return; }
    snap.forEach(doc => {
      const d = doc.data();
      const tr = document.createElement("tr");
      tr.innerHTML = "<td>" + (d.email || "-") + "</td><td><b>" + (d.role || "-").toUpperCase() + "</b></td><td>" + (d.room ? d.room : "🌐 Semua room") + "</td><td style='color:#888;font-size:11px' class='mono'>" + doc.id.slice(0, 10) + "…</td>";
      tbody.appendChild(tr);
    });
  }).catch(err => console.warn("[users]", err));
}

function saveSettings() {
  return db.collection("settings").doc("main").set({ rooms: SETTINGS.rooms, clients: SETTINGS.clients });
}

function submitNewRoom(e) {
  e.preventDefault();
  if ((window.currentUserRole || "") !== "admin") { toast("Hanya admin.", "error"); return; }
  const nama = document.getElementById("mRoomNama").value.trim();
  const client = document.getElementById("mRoomClient").value;
  if (!nama) { toast("Nama waste room wajib diisi.", "warning"); return; }
  if (SETTINGS.rooms.find(r => r.nama === nama)) { toast("Waste room sudah ada.", "warning"); return; }
  SETTINGS.rooms.push({ nama: nama, client: client });
  saveSettings().then(() => {
    toast("Waste room '" + nama + "' ditambahkan! 🏢", "success");
    document.getElementById("mRoomNama").value = "";
    initRoomSelects(); renderSettingsLists(); loadSettings();
  }).catch(err => toast("Gagal simpan: " + err.message, "error"));
}

function submitNewClient(e) {
  e.preventDefault();
  if ((window.currentUserRole || "") !== "admin") { toast("Hanya admin.", "error"); return; }
  const nama = document.getElementById("mClientNama").value.trim();
  if (!nama) { toast("Nama client wajib diisi.", "warning"); return; }
  if (SETTINGS.clients.find(c => c === nama)) { toast("Client sudah ada.", "warning"); return; }
  SETTINGS.clients.push(nama);
  saveSettings().then(() => {
    toast("Client '" + nama + "' ditambahkan! 🤝", "success");
    document.getElementById("mClientNama").value = "";
    initRoomSelects(); renderSettingsLists();
  }).catch(err => toast("Gagal simpan: " + err.message, "error"));
}

function renderSettingsLists() {
  const rc = document.getElementById("clientChips");
  if (rc) rc.innerHTML = SETTINGS.clients.map(c => '<span style="display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;color:#3730a3;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;margin:3px">🤝 ' + c + "</span>").join("");
  const rr = document.getElementById("roomChips");
  if (rr) rr.innerHTML = SETTINGS.rooms.map(r => '<span style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;margin:3px">🏢 ' + r.nama + ' <small style="color:#888">(' + r.client + ")</small></span>").join("");
}

function loadPublicChart() {
  const ctx = document.getElementById("pubChart");
  if (!ctx) return;
  db.collection("sampah").get().then(snap => {
    const grouped = {};
    snap.forEach(doc => {
      const d = doc.data();
      if (d.tanggal) grouped[d.tanggal] = (grouped[d.tanggal] || 0) + (d.berat || 0);
    });
    const labels = Object.keys(grouped).sort();
    const data = labels.map(l => grouped[l]);
    new Chart(ctx, {
      type: "line",
      data: { labels: labels.length ? labels : ["-"], datasets: [{ label: "Sampah Terangkut (kg)", data: data.length ? data : [0], borderColor: "#2e7d32", backgroundColor: "rgba(46,125,50,.1)", fill: true, tension: 0.4 }] },
      options: { responsive: true, maintainAspectRatio: false }
    });
  });
}

function loadPublicData() {
  const tbody = document.getElementById("pubTable");
  if (!tbody) return;
  db.collection("sampah").orderBy("createdAt", "desc").limit(10)
    .get()
    .then(snap => {
      tbody.innerHTML = "";
      if (snap.empty) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:15px;color:#888">Belum ada data</td></tr>'; return; }
      snap.forEach(doc => {
        const d = doc.data();
        const fotos = d.fotos || d.foto || [];
        const status = (d.residu || 0) > 0 ? "Ada Residu" : "Bersih";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${d.tanggal}</td><td>${d.jenis}</td><td>${d.berat} kg</td><td><span class="badge">${status}</span></td><td>${fotos.length > 0 ? "📷" : "-"}</td>`;
        tbody.appendChild(tr);
      });
    });
}

window.addEventListener("load", () => {
  loadSettings();
  setTimeout(() => {
    const splash = document.getElementById("splashScreen");
    if (splash) splash.classList.add("fade-out");
    setTimeout(() => { if (splash) splash.style.display = "none"; if (!currentUser) { showPublic(); loadPublicData(); loadPublicChart(); } }, 500);
  }, 800);
});

window.db = db;
window.auth = auth;
window.maps = maps;
window.truckIcon = truckIcon;
window.haversineM = haversineM;
window.toast = toast;
window.loadRouteHistory = loadRouteHistory;
window.showPublic = showPublic;
window.showLogin = showLogin;
window.showDriverTracking = showDriverTracking;
window.toggleMenu = toggleMenu;
window.doFirebaseLogin = doFirebaseLogin;
window.doFirebaseLogout = doFirebaseLogout;
window.addData = addData;
window.updateData = updateData;
window.deleteData = deleteData;
window.handleFileSelect = handleFileSelect;
window.handleEditFileSelect = handleEditFileSelect;
window.openEdit = openEdit;
window.closeEditModal = closeEditModal;
window.showPhotos = showPhotos;
window.closePhotoModal = closePhotoModal;
window.viewPhoto = viewPhoto;
window.generateReport = generateReport;
window.toggleCustomDate = toggleCustomDate;
window.deleteRoute = deleteRoute;
window.updateFileListUI = updateFileListUI;
window.initRoomSelects = initRoomSelects;
window.submitNewAccount = submitNewAccount;
window.toggleMRoom = toggleMRoom;
window.submitNewRoom = submitNewRoom;
window.submitNewClient = submitNewClient;
window.loadUsersList = loadUsersList;
window.renderSettingsLists = renderSettingsLists;
