async function findMosquesAndQibla() {
  const out = $('#mout');
  if (!navigator.geolocation) {
    out.innerHTML = '<div class="card err">ጂኦሎኬሽን አይደገፍም።</div>'; return;
  }
  out.innerHTML = '<div class="loading">ቦታዎን በመፈለግ ላይ…</div>';
  navigator.geolocation.getCurrentPosition(async pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const bearing = qiblaBearing(lat, lon);
    out.innerHTML = '<div class="loading">መስጊዶች በመፈለግ ላይ…</div>';

    const compassHtml = `
      <div class="card">
        <h3>የቂብላ አቅጣጫ</h3>
        <div class="compass">
          <div class="needle" style="transform:translate(-50%,-100%) rotate(${bearing}deg)"></div>
        </div>
        <p class="qibla-text">ከሰሜን በኩል <b>${bearing.toFixed(0)}°</b> ወደ ካዕባ</p>
        <p style="font-size:12px;color:var(--muted);text-align:center;margin:4px 0 0">
          ስልክዎን በአግድም ያዙ፤ ቀዩ መርፌ ወደ ቂብላ ያመራል።</p>
      </div>`;

    let items = [];

    // 1) Overpass — 3 mirrors, 2 radius attempts
    items = await searchOverpass(lat, lon);

    // 2) Fallback: Nominatim search
    if (!items.length) {
      try { items = await searchNominatim(lat, lon); } catch {}
    }

    // 3) Final fallback: Google Maps link
    const gmaps = `https://www.google.com/maps/search/mosque/@${lat},${lon},15z`;

    if (items.length) {
      out.innerHTML = compassHtml + `<div class="list">${items.map(m => `
        <a class="row" href="https://www.google.com/maps?q=${m.la},${m.lo}"
           target="_blank" rel="noopener">
          <span class="ico2">🕌</span>
          <span class="grow"><b>${esc(m.name)}</b>
            <small>${m.d < 1000 ? Math.round(m.d) + ' ሜ' : (m.d / 1000).toFixed(1) + ' ኪሜ'}</small></span>
          <span class="chev">›</span>
        </a>`).join('')}</div>`;
    } else {
      out.innerHTML = compassHtml + `
        <div class="card">
          <p style="margin:0 0 10px">በ5 ኪሜ ስር በOpenStreetMap የተመዘገበ መስጊድ አልተገኘም። በአካባቢዎ መስጊዶች በOSM ላይ አልተመዘገቡ ሊሆን ይችላል።</p>
          <a class="btn primary" href="${gmaps}" target="_blank" rel="noopener"
             style="display:block;text-align:center;text-decoration:none">
            🗺️ በGoogle Maps ፈልግ
          </a>
        </div>`;
    }
  }, () => {
    out.innerHTML = '<div class="card err">የቦታ ፍቃድ አልተሰጠም። በአሳሽዎ ሴቲንግ ውስጥ ፍቃድ ይስጡ።</div>';
  }, { timeout: 15000, enableHighAccuracy: false, maximumAge: 60000 });
}

async function searchOverpass(lat, lon) {
  const mirrors = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ];
  const radii = [5000, 10000];
  const map = new Map();

  for (const radius of radii) {
    const q = `[out:json][timeout:30];
      nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${lat},${lon});
      out center 80;`;

    for (const url of mirrors) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!r.ok) continue;
        const j = await r.json();
        for (const el of j.elements || []) {
          const la = el.lat ?? el.center?.lat;
          const lo = el.lon ?? el.center?.lon;
          if (!la || !lo) continue;
          const id = `${la.toFixed(5)},${lo.toFixed(5)}`;
          if (map.has(id)) continue;
          map.set(id, {
            name: el.tags?.name || el.tags?.['name:en'] ||
                  el.tags?.['name:am'] || el.tags?.['name:om'] || 'መስጊድ',
            la, lo, d: haversine(lat, lon, la, lo)
          });
        }
        if (map.size) break; // found some — stop trying this radius
      } catch { continue; }
    }
    if (map.size) break; // found some — stop expanding radius
  }

  return [...map.values()].sort((a, b) => a.d - b.d).slice(0, 30);
}

async function searchNominatim(lat, lon) {
  const d = 0.15; // ~15 km box
  const viewbox = `${lon - d},${lat + d},${lon + d},${lat - d}`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=30` +
              `&q=mosque&bounded=1&viewbox=${viewbox}`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) return [];
  const j = await r.json();
  return j
    .filter(x => x.lat && x.lon)
    .map(x => ({
      name: x.display_name?.split(',')[0] || 'መስጊድ',
      la: +x.lat, lo: +x.lon, d: haversine(lat, lon, +x.lat, +x.lon)
    }))
    .sort((a, b) => a.d - b.d);
}
