async function showTafsir(s, a) {
  const out = $('#tout');
  out.innerHTML = '<div class="loading">Loading…</div>';
  const ref = `${s}:${a}`;
  const lang = state.lang;

  let arText = null, tafEn = null, tafAr = null, transText = null;
  let sourceLabel = '';

  try {
    const j = await getJSON(`${ALQURAN}/ayah/${ref}/editions/quran-uthmani,ar.muyassar`);
    const arr = Array.isArray(j.data) ? j.data : [j.data];
    const byId = {}; arr.forEach(x => byId[x.edition.identifier] = x);
    arText = byId['quran-uthmani']?.text || null;
    tafAr = byId['ar.muyassar']?.text || null;
    if (tafAr) sourceLabel = 'التفسير الميسر (AlQuran Cloud)';
  } catch {}

  try {
    const j = await getJSON(`https://api.quran.com/api/v4/tafsirs/169/by_ayah/${ref}`, 10 * 864e5);
    tafEn = stripHtml(j.tafsir?.text || '');
  } catch {}

  if (lang === 'am' || lang === 'om') {
    const key = await loadQuranEncKey(lang);
    if (key) {
      try {
        const j = await getJSON(`${QURANENC}/translation/sura/${key}/${s}`);
        // KUNI BAKKA MURAASAA: 'result' fayyadama
        const list = j.result || j.ayahs || (Array.isArray(j) ? j : []);
        const ayah = list.find(x => String(x.aya) === String(a)); 
        
        transText = ayah?.translation || null;
        if (transText) sourceLabel = `QuranEnc (${LANGS[lang]} — ${key})`;
      } catch (e) {
        console.warn('QuranEnc failed:', e);
      }
    }

    if (!transText && lang === 'om') {
      try {
        const j = await getJSON(`${ALQURAN}/ayah/${ref}/om.abubakr`);
        transText = j.data?.text || null;
        if (transText) sourceLabel = 'AlQuran Cloud (Afaan Oromoo)';
      } catch {}
    }
  }

  const isOromo = lang === 'om';
  const label = isOromo ? 'Afaan Oromoo Translation' : (tafAr || tafEn) ? 'Tafsir' : 'Translation';

  out.innerHTML = `
    <article class="ayah"><p class="ar">${esc(arText || '')}</p></article>

    ${transText ? `<section class="card">
      <h3>${label} — ${LANGS[lang]}</h3>
      <p class="tr">${esc(transText)}</p>
    </section>` : (isOromo ? `<div class="note">Afaan Oromoo translation not found for this ayah.</div>` : '')}

    ${tafAr ? `<section class="card"><h3>Tafsir (Arabic) — Muyassar</h3>
      <p class="ar sm">${esc(tafAr)}</p></section>` : ''}

    ${tafEn ? `<section class="card"><h3>Tafsir (English) — Ibn Kathir</h3>
      <p class="en">${esc(tafEn)}</p></section>` : ''}

    ${!transText && !tafAr && !tafEn ? `<div class="note">No data found for this ayah.</div>` : ''}

    <div class="note">
      Source: ${esc(sourceLabel || 'verified source')}.
      ${isOromo ? 'Note: A dedicated Oromo tafsir is not available in free APIs. Showing the verified Oromo translation alongside the English Tafsir Ibn Kathir.' : ''}
      Consult scholars for personal rulings.
    </div>`;
}
