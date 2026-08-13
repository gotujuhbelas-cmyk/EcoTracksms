// ══════════════════════════════════════════════════════════════
// antimacet.js — EcoTRACK Driver Tracking (v13 — WAKE LOCK)
console.log("%cANTIMACET v13 — wake lock aktif", "color:#ef6c00;font-weight:bold;font-size:14px");
// ══════════════════════════════════════════════════════════════

let amSession = null;
let amPath = [];
let amDist = 0;
let amSaveTimer = null;
let amIsActive = false;
let amLastPos = null;
let amStartTime = null;
let amUnsubscribe = null;
let watchId = null;
let amWakeLock = null;

// ═══ amP() — dipakai oleh amview.js ═══
function amP() {
  return amSession ? {
    active: amIsActive,
    path: amPath,
    distance: amDist,
    driverId: amSession.driverId,
    driverName: amSession.driverName || "",
    truckId: amSession.truckId || null,
    vehicleName: amSession.vehicleName || ""
  } : null;
}

// ═══ Helpers path ↔ string ═══
function encodePath(arr) {
  return arr.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(";");
}
function decodePath(str) {
  if (!str) return [];
  return str.split(";").filter(Boolean).map(s => {
    const [lat, lng] = s.split(",").map(Number);
    return { lat, lng, t: Date.now() };
  });
}

// ═══ CEK LOGIN: wajib login untuk share ═══
function _requireLogin() {
  if (typeof currentUser === "undefined" || !currentUser) {
    if (typeof toast === "function") toast("🔐 Silakan login dulu untuk share lokasi.", "warning");
    if (typeof showLogin === "function") showLogin();
    return false;
  }
  return true;
}

// ═══ WAKE LOCK: cegah layar mati saat tracking ═══
async function _requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      amWakeLock = await navigator.wakeLock.request("screen");
      amWakeLock.addEventListener("release", () => { amWakeLock = null; });
      console.log("[antimacet] Wake Lock aktif — layar tetap menyala");
    }
  } catch (err) {
    console.warn("[antimacet] Wake Lock gagal:", err.message);
  }
}
function _releaseWakeLock() {
  if (amWakeLock) { amWakeLock.release().catch(() => {}); amWakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && amIsActive) _requestWakeLock();
});

// ═══ UI helpers ═══
function _activeContext() {
  if (!document.getElementById("driverTrackingView").classList.contains("hidden")) {
    return {
      start: document.getElementById("btnStartTrack"),
      stop:  document.getElementById("btnStopTrack"),
      name:  document.getElementById("driverName"),
      vehicle: document.getElementById("vehicleName"),
      status: document.getElementById("driverStatus")
    };
  }
  if (!document.getElementById("dashShare").classList.contains("hidden")) {
    return {
      start: document.getElementById("btnStartDs"),
      stop:  document.getElementById("btnStopDs"),
      name:  document.getElementById("dsDriverName"),
      vehicle: document.getElementById("dsVehicleName"),
      status: document.getElementById("dsStatus")
    };
  }
  return { start: null, stop: null, name: null, vehicle: null, status: null };
}

function _setStatus(msg, color) {
  const ctx = _activeContext();
  if (ctx.status) {
    ctx.status.innerHTML = msg;
    ctx.status.style.color = color || "var(--gray)";
  }
}

function _showStopMode() {
  const ctx = _activeContext();
  if (ctx.start) ctx.start.style.display = "none";
  if (ctx.stop)  ctx.stop.style.display = "";
}
function _showStartMode(label) {
  const ctx = _activeContext();
  if (ctx.start) {
    ctx.start.style.display = "";
    ctx.start.textContent = label || "📡 Mulai Share Lokasi";
  }
  if (ctx.stop) ctx.stop.style.display = "none";
}

// ═══ Inisialisasi: restore session ═══
function amInit() {
  if (typeof db === "undefined") { setTimeout(amInit, 500); return; }
  const saved = localStorage.getItem("am_session");
  if (!saved) return;

  let sess;
  try { sess = JSON.parse(saved); }
  catch { localStorage.removeItem("am_session"); return; }
  amSession = sess;

  db.collection("live_tracking").doc(sess.docId || sess.driverId)
    .get()
    .then(doc => {
      if (doc.exists && doc.data().isActive === true) {
        const data = doc.data();
        amPath = decodePath(data.path || "");
        amDist = data.totalDistance || 0;
        amStartTime = data.startTime || Date.now();
        amIsActive = true;
        amLastPos = amPath.length ? amPath[amPath.length - 1] : null;
        _showStartMode("🔄 Lanjutkan Berbagi Lokasi");
        _setStatus("Sesi ditemukan. Klik tombol untuk melanjutkan tracking.", "#2e7d32");
        const ctx = _activeContext();
        if (ctx.name && !ctx.name.value && sess.driverName) ctx.name.value = sess.driverName;
        if (ctx.vehicle && !ctx.vehicle.value && sess.vehicleName) ctx.vehicle.value = sess.vehicleName;
        if (typeof toast === "function") toast("Sesi tracking ditemukan. Silakan lanjutkan.", "info");
      } else {
        localStorage.removeItem("am_session");
        amSession = null;
      }
    })
    .catch(err => console.warn("[antimacet] gagal cek sesi:", err));
}

// ═══ START (wajib login) ═══
function startPublicSharing(e) {
  if (e && e.preventDefault) e.preventDefault();
  _startSharing("public");
}
function startDashSharing() {
  _startSharing("dash");
}

function _startSharing(role) {
  if (!_requireLogin()) return;

  if (!navigator.geolocation) {
    if (typeof toast === "function") toast("Geolocation tidak didukung.", "error");
    return;
  }

  if (amSession && amIsActive) {
    _beginWatch();
    _showStopMode();
    _setStatus("🟢 Tracking dilanjutkan... layar tetap menyala.", "#2e7d32");
    if (typeof toast === "function") toast("Tracking dilanjutkan!", "success");
    return;
  }

  const ctx = _activeContext();
  const driverName = (ctx.name && ctx.name.value.trim()) || (currentUser.email || "Driver").split("@")[0];
  const vehicleName = (ctx.vehicle && ctx.vehicle.value.trim()) || "";

  const driverId = currentUser.uid;
  const truckId = "truck_" + Date.now();
  const docId = "drv_" + Date.now();

  amSession = { driverId, driverName, truckId, vehicleName, role, docId, userEmail: currentUser.email };
  amPath = [];
  amDist = 0;
  amStartTime = Date.now();
  amIsActive = true;
  amLastPos = null;

  localStorage.setItem("am_session", JSON.stringify(amSession));

  _showStopMode();
  _setStatus("🟢 Mengambil posisi GPS pertama...", "#2e7d32");

  db.collection("live_tracking").doc(docId).set({
    driverId, driverName, truckId, vehicleName, role,
    userEmail: currentUser.email,
    isActive: true,
    startTime: amStartTime,
    path: "",
    totalDistance: 0,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .then(() => _beginWatch())
  .catch(err => {
    if (typeof toast === "function") toast("Gagal memulai: " + err.message, "error");
  });
}

// ═══ WATCH (watchPosition + wake lock) ═══
function _beginWatch() {
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (amSaveTimer) clearInterval(amSaveTimer);

  _requestWakeLock();

  watchId = navigator.geolocation.watchPosition(
    pos => {
      if (!amIsActive) return;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const point = { lat, lng, t: Date.now() };

      if (amLastPos && typeof haversineM === "function") {
        amDist += haversineM(amLastPos.lat, amLastPos.lng, lat, lng);
      }

      amPath.push(point);
      amLastPos = point;

      db.collection("live_tracking").doc(amSession.docId).set({
        lastLat: lat,
        lastLng: lng,
        path: encodePath(amPath),
        totalDistance: Math.round(amDist),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(err => console.warn("[antimacet] kirim lokasi gagal:", err));

      _setStatus(`🟢 Aktif — ${(amDist/1000).toFixed(2)} km, ${amPath.length} titik • 🔆 layar menyala`, "#2e7d32");
    },
    err => {
      console.warn("[antimacet] GPS error:", err.message);
      _setStatus("⚠️ Gagal ambil GPS: " + err.message, "#c62828");
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );

  amSaveTimer = setInterval(_saveToRoutes, 30000);

  if (amUnsubscribe) amUnsubscribe();
  if (amSession && typeof db !== "undefined") {
    amUnsubscribe = db.collection("live_tracking").doc(amSession.docId)
      .onSnapshot(doc => {
        if (doc.exists && doc.data().isActive === false && amIsActive) {
          console.log("[antimacet] Admin menghentikan tracking.");
          stopSharing(true);
          if (typeof toast === "function") toast("Tracking dihentikan oleh admin.", "warning");
        }
      });
  }
}

function _saveToRoutes() {
  if (!amIsActive || !amSession || amPath.length < 2) return;
  db.collection("routes").doc(amSession.docId).set({
    driverId: amSession.driverId,
    driverName: amSession.driverName,
    truckId: amSession.truckId,
    vehicleName: amSession.vehicleName,
    userEmail: amSession.userEmail || "",
    startTime: amStartTime,
    path: encodePath(amPath),
    totalDistance: Math.round(amDist),
    pointCount: amPath.length,
    isActive: true,
    savedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(err => console.warn("[antimacet] autosave routes gagal:", err));
}

// ═══ STOP ══
function stopSharing(fromAdmin) {
  amIsActive = false;

  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (amSaveTimer) { clearInterval(amSaveTimer); amSaveTimer = null; }
  if (amUnsubscribe) { amUnsubscribe(); amUnsubscribe = null; }
  _releaseWakeLock();

  if (amSession && typeof db !== "undefined") {
    const docId = amSession.docId;
    const pathStr = encodePath(amPath);
    const dist = Math.round(amDist);

    db.collection("live_tracking").doc(docId).set({
      isActive: false,
      path: pathStr,
      totalDistance: dist,
      endTime: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    db.collection("routes").doc(docId).set({
      driverId: amSession.driverId,
      driverName: amSession.driverName,
      truckId: amSession.truckId,
      vehicleName: amSession.vehicleName,
      startTime: amStartTime,
      endTime: firebase.firestore.FieldValue.serverTimestamp(),
      path: pathStr,
      totalDistance: dist,
      pointCount: amPath.length,
      isActive: false,
      savedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  localStorage.removeItem("am_session");
  amSession = null;
  amPath = [];
  amDist = 0;
  amLastPos = null;

  _showStartMode("📡 Mulai Share Lokasi");
  _setStatus(fromAdmin ? "⏹️ Tracking dihentikan oleh admin." : "⏹️ Tracking berhenti.", "#888");

  if (typeof toast === "function") {
    toast(fromAdmin ? "Tracking dihentikan oleh admin." : "Tracking dihentikan.", "info");
  }
  if (typeof loadRouteHistory === "function") loadRouteHistory();
}

// ═══ Override: halaman Driver wajib login ═══
(function() {
  if (typeof window.showDriverTracking === "function") {
    const _orig = window.showDriverTracking;
    window.showDriverTracking = function() {
      if (typeof currentUser === "undefined" || !currentUser) {
        if (typeof toast === "function") toast("🔐 Silakan login dulu untuk share lokasi.", "warning");
        if (typeof showLogin === "function") showLogin();
        return;
      }
      _orig();
      setTimeout(function() {
        const dn = document.getElementById("driverName");
        if (dn && !dn.value && currentUser && currentUser.email) {
          dn.value = currentUser.email.split("@")[0];
        }
      }, 300);
    };
  }
})();

// Expose ke global
window.amP = amP;
window.startPublicSharing = startPublicSharing;
window.startDashSharing = startDashSharing;
window.stopSharing = stopSharing;

document.addEventListener("DOMContentLoaded", amInit);
