// ══════════════════════════════════════════════════════════════
// amview.js — EcoTRACK Route Viewer (v10 — PANEL RUTE PER TRUK)
console.log("%cAMVIEW v10 — panel rute aktif", "color:#1565c0;font-weight:bold;font-size:14px");
// ══════════════════════════════════════════════════════════════

let liveSubs = {};
let markers = {};
let polylines = {};
let savedRouteLayer = [];
let routeOverlayLayer = [];

// ═══ Helpers ═══
function decodePathToPoints(pathStr) {
  if (!pathStr) return [];
  return pathStr.split(";").filter(Boolean).map(s => {
    const [lat, lng] = s.split(",").map(Number);
    return [lat, lng];
  });
}

function getTruckIcon() {
  return L.divIcon({
    className: "truck-marker",
    html: '<div style="font-size:28px;text-shadow:0 2px 4px rgba(0,0,0,.3)">🚛</div>',
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });
}

function flagIcon(emoji) {
  return L.divIcon({
    className: "flag-marker",
    html: '<div style="font-size:24px;text-shadow:0 2px 4px rgba(0,0,0,.3)">' + emoji + '</div>',
    iconSize: [30, 30],
    iconAnchor: [15, 30]
  });
}

// ═══ LISTENER LIVE TRACKING (tabel + peta) ═══
function listenToLiveTracking(tableBodyId, mapContextId, showOverlay) {
  if (typeof db === "undefined") {
    setTimeout(() => listenToLiveTracking(tableBodyId, mapContextId, showOverlay), 1000);
    return;
  }
  const mapKey = mapContextId || "public";
  if (liveSubs[mapKey]) return;
  markers[mapKey] = {};
  polylines[mapKey] = {};

  liveSubs[mapKey] = db.collection("live_tracking")
    .where("isActive", "==", true)
    .onSnapshot(snap => {
      const mp = maps[mapKey];
      const tbody = tableBodyId ? document.getElementById(tableBodyId) : null;
      const overlay = showOverlay ? document.getElementById("mapOverlay") : null;

      if (snap.empty) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#888">Tidak ada armada aktif</td></tr>';
        if (overlay) overlay.style.display = "flex";
        return;
      }
      if (overlay) overlay.style.display = "none";

      let rows = "";
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;

        if (mp && d.lastLat && d.lastLng) {
          if (!markers[mapKey][id]) {
            markers[mapKey][id] = L.marker([d.lastLat, d.lastLng], { icon: getTruckIcon() })
              .addTo(mp)
              .bindPopup(`<b>${d.vehicleName || d.truckId || id}</b><br>Driver: ${d.driverName || d.driverId}<br>Jarak: ${((d.totalDistance||0)/1000).toFixed(2)} km`);
          } else {
            markers[mapKey][id].setLatLng([d.lastLat, d.lastLng]);
          }
          if (d.path && d.path.length > 0) {
            const points = decodePathToPoints(d.path);
            if (points.length > 1) {
              if (!polylines[mapKey][id]) {
                polylines[mapKey][id] = L.polyline(points, { color: "#2e7d32", weight: 4, opacity: 0.85 }).addTo(mp);
              } else {
                polylines[mapKey][id].setLatLngs(points);
              }
            }
          }
        }

        const updateAt = d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toLocaleString("id-ID") : "-";
        rows += `
          <tr>
            <td>${d.vehicleName || d.truckId || "-"}</td>
            <td>${d.driverName || d.driverId || "-"}</td>
            <td>${updateAt}</td>
            <td><span class="badge" style="background:#2e7d32;color:#fff;padding:2px 8px;border-radius:10px;font-size:.75rem">🟢 Aktif</span></td>
            <td><button class="btn btn-danger btn-sm" onclick="adminStopVehicle('${id}')">⏹️ Stop</button></td>
          </tr>
        `;
      });
      if (tbody) tbody.innerHTML = rows;
    }, err => {
      if (typeof toast === "function") toast("❌ " + err.message, "error");
      console.error("[liveTracking]", err);
    });
}

// ═══ BERSIHKAN OVERLAY RUTE ═══
function clearRouteOverlay() {
  const mp = maps["dash"];
  if (!mp) return;
  routeOverlayLayer.forEach(l => mp.removeLayer(l));
  routeOverlayLayer = [];
  savedRouteLayer = [];
  if (typeof toast === "function") toast("🧹 Peta dibersihkan.", "info");
}

// ═══ LIHAT RUTE TERSIMPAN (riwayat) ═══
function viewSavedRoute(routeId) {
  const mp = maps["dash"];
  if (!mp || typeof db === "undefined") return;
  db.collection("routes").doc(routeId).get().then(doc => {
    if (!doc.exists) return;
    const r = doc.data();
    clearRouteOverlay();
    const points = decodePathToPoints(r.path);
    if (points.length < 2) { if (typeof toast === "function") toast("Rute tidak punya titik.", "warning"); return; }
    const ln = L.polyline(points, { color: "#ff9800", weight: 5, opacity: 0.9 }).addTo(mp);
    savedRouteLayer = [
      ln,
      L.marker(points[0], { icon: flagIcon("🟢") }).addTo(mp),
      L.marker(points[points.length - 1], { icon: flagIcon("🏁") }).addTo(mp)
    ];
    routeOverlayLayer = routeOverlayLayer.concat(savedRouteLayer);
    mp.fitBounds(ln.getBounds(), { padding: [40, 40] });
    if (typeof toast === "function") toast("🗺️ Rute " + (r.vehicleName || r.driverName || "") + " ditampilkan.", "info");
  });
}

// ═══ LIHAT RUTE LIVE (truk berjalan) ═══
function viewLiveRoute(docId) {
  const mp = maps["dash"];
  if (!mp || typeof db === "undefined") return;
  db.collection("live_tracking").doc(docId).get().then(doc => {
    if (!doc.exists) return;
    const d = doc.data();
    clearRouteOverlay();
    const points = decodePathToPoints(d.path);
    if (points.length > 1) {
      const ln = L.polyline(points, { color: "#2196f3", weight: 5, opacity: 0.9 }).addTo(mp);
      routeOverlayLayer.push(ln);
      routeOverlayLayer.push(L.marker(points[0], { icon: flagIcon("🟢") }).addTo(mp));
      routeOverlayLayer.push(
        L.marker(points[points.length - 1], { icon: getTruckIcon() }).addTo(mp)
          .bindPopup(`<b>${d.vehicleName || d.truckId || docId}</b><br>Driver: ${d.driverName || d.driverId}<br>Jarak: ${((d.totalDistance||0)/1000).toFixed(2)} km`)
          .openPopup()
      );
      mp.fitBounds(ln.getBounds(), { padding: [40, 40] });
    } else if (d.lastLat && d.lastLng) {
      routeOverlayLayer.push(L.marker([d.lastLat, d.lastLng], { icon: getTruckIcon() }).addTo(mp));
      mp.setView([d.lastLat, d.lastLng], 16);
    }
    if (typeof toast === "function") toast("🛰️ Posisi " + (d.vehicleName || d.driverName || "") + " ditampilkan.", "info");
  });
}

// ═══ PANEL RUTE PER TRUK ═══
function _rpItem(label, sub, onclick, color) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #eee;gap:8px">' +
    '<div style="min-width:0"><div style="font-weight:600;font-size:.9rem">' + label + '</div>' +
    '<div style="font-size:.75rem;color:#888">' + sub + '</div></div>' +
    '<button class="btn btn-sm" style="background:' + color + '" onclick="' + onclick + '">👁️ Lihat</button></div>';
}

function refreshRoutePanel() {
  const liveBox = document.getElementById("rpLive");
  const histBox = document.getElementById("rpHistory");
  if (typeof db === "undefined") return;

  db.collection("live_tracking").where("isActive", "==", true).get().then(snap => {
    if (!liveBox) return;
    if (snap.empty) { liveBox.innerHTML = '<div style="padding:10px;color:#888;font-size:.85rem">Tidak ada truk berjalan.</div>'; return; }
    let html = "";
    snap.forEach(doc => {
      const d = doc.data();
      const km = ((d.totalDistance || 0) / 1000).toFixed(2);
      html += _rpItem(
        "🚛 " + (d.vehicleName || d.truckId || doc.id),
        (d.driverName || d.driverId || "-") + " • " + km + " km • " + (d.path ? d.path.split(";").length : 0) + " titik",
        "viewLiveRoute('" + doc.id + "')",
        "#2196f3"
      );
    });
    liveBox.innerHTML = html;
  });

  db.collection("routes").orderBy("savedAt", "desc").limit(20).get().then(snap => {
    if (!histBox) return;
    if (snap.empty) { histBox.innerHTML = '<div style="padding:10px;color:#888;font-size:.85rem">Belum ada riwayat.</div>'; return; }
    let html = "";
    snap.forEach(doc => {
      const d = doc.data();
      const when = d.startTime ? new Date(d.startTime).toLocaleString("id-ID") : "-";
      const km = ((d.totalDistance || 0) / 1000).toFixed(2);
      html += _rpItem(
        "🚛 " + (d.vehicleName || d.truckId || doc.id),
        when + " • " + km + " km",
        "viewSavedRoute('" + doc.id + "')",
        "#ff9800"
      );
    });
    histBox.innerHTML = html;
  });
}

function buildRoutePanel() {
  if (document.getElementById("routePanel")) return true;
  const host = document.getElementById("dashTracking");
  if (!host) return false;

  const div = document.createElement("div");
  div.id = "routePanel";
  div.style.marginTop = "25px";
  div.innerHTML =
    '<h3 style="color:var(--primary)">🚛 Rute per Truk</h3>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:15px">' +
      '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">' +
        '<h4 style="margin:0 0 10px;color:#2e7d32">🟢 Sedang Berjalan</h4>' +
        '<div id="rpLive" style="max-height:260px;overflow-y:auto">Memuat...</div>' +
      '</div>' +
      '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px">' +
        '<h4 style="margin:0 0 10px;color:#757575">📜 Riwayat Tersimpan</h4>' +
        '<div id="rpHistory" style="max-height:260px;overflow-y:auto">Memuat...</div>' +
      '</div>' +
    '</div>' +
    '<button class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="clearRouteOverlay()">🧹 Bersihkan Peta</button>';
  host.appendChild(div);
  refreshRoutePanel();
  return true;
}

// Auto-build panel + refresh tiap 15 detik
(function() {
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (buildRoutePanel() || tries > 30) clearInterval(t);
  }, 1000);
  setInterval(() => {
    if (document.getElementById("routePanel")) refreshRoutePanel();
  }, 15000);
})();

// Expose ke global
window.listenToLiveTracking = listenToLiveTracking;
window.viewSavedRoute = viewSavedRoute;
window.viewLiveRoute = viewLiveRoute;
window.clearRouteOverlay = clearRouteOverlay;
window.refreshRoutePanel = refreshRoutePanel;
