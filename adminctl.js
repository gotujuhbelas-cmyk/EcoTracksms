// ══════════════════════════════════════════════════════════════
// adminctl.js — Admin Control Panel (FINAL v5)
// Compatible dengan app.js, antimacet.js, dan amview.js
// ══════════════════════════════════════════════════════════════

// ─── Helper: Cek apakah user admin ────────────────────────────
function isAdminCtl() {
  return (typeof currentRole !== "undefined" && currentRole === "admin") ||
         (typeof currentUserRole !== "undefined" && currentUserRole === "admin");
}

// ═══════════════════════════════════════════
// ADMIN STOP VEHICLE
// ═══════════════════════════════════════════
function adminStopVehicle(docId) {
  if (!docId) {
    if (typeof toast === "function") toast("Driver ID kosong.", "error");
    return;
  }

  if (!confirm("Stop perjalanan ini?\nHP driver akan otomatis berhenti mengirim lokasi.")) return;

  if (typeof db === "undefined") {
    if (typeof toast === "function") toast("Database belum siap.", "error");
    return;
  }

  db.collection("live_tracking").doc(docId).set({
    isActive: false,
    endTime: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true })
  .then(() => {
    if (typeof toast === "function") toast("⏹️ Tracking driver dihentikan.", "success");
    if (typeof loadRouteHistory === "function") loadRouteHistory();
  })
  .catch(err => {
    if (typeof toast === "function") toast("Gagal stop: " + err.message, "error");
  });
}

// ═══════════════════════════════════════════
// ADMIN DELETE ROUTE
// ═══════════════════════════════════════════
function adminDeleteRoute(id) {
  if (!confirm("Hapus rute ini?")) return;

  db.collection("routes").doc(id).delete()
    .then(() => {
      if (typeof toast === "function") toast("🗑️ Rute dihapus.", "success");
      if (typeof loadRouteHistory === "function") loadRouteHistory();
    })
    .catch(err => {
      if (typeof toast === "function") toast("Gagal: " + err.message, "error");
    });
}

// Expose ke global
window.adminStopVehicle = adminStopVehicle;
window.adminDeleteRoute = adminDeleteRoute;
window.isAdminCtl = isAdminCtl;
