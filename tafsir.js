async function showTafsir(s, a) {
  const out = $('#tout');
  out.innerHTML = '<div class="loading">Loading…</div>';
  const ref = `${s}:${a}`;
  const lang = state.lang;

  let arText = null, tafEn = null, tafAr = null, transText = null;
  let sourceLabel = '';

  // 1) Arabic text + Muyassar tafsir (ከ AlQuran Cloud)
  try {
    const j = await getJSON(`${ALQURAN}/ayah/${ref}/editions/quran-uthmani,ar.muyassar`);
    const arr = Array.isArray(j.data) ? j.data : [j.data];
    const byId = {}; arr.forEach(x => byId[x.edition.identifier] = x);
    arText = byId['quran-uthmani']?.text || null;
    tafAr = byId['ar.muyassar']?.text || null;
    if (lang === 'ar' && tafAr) sourceLabel = 'التفسير الميسر (AlQuran Cloud)';
  } catch {}

  // 2) English Ibn Kathir tafsir (ከ Quran.com API)
  try {
    const j = await getJSON(`https://api.quran.com/api/v4/tafsirs/169/by_ayah/${ref}`, 10 * 864e5);
    tafEn = stripHtml(j.tafsir?.text || '');
    if (lang === 'en' && tafEn) sourceLabel = 'Tafsir Ibn Kathir (Quran.com)';
  } catch {}

  // 3) Amharic / Oromo / Arabic translation or Tafsir from QuranEnc
  if (lang === 'am' || lang === 'om' || lang === 'ar') {
    const key = await loadQuranEncKey(lang);
    if (key) {
      try {
        // ✅ አንቀጽ በቁጥር በቀጥታ ከ QuranEnc ማምጣት (በጣም አስተማማኝ እና ፈጣን መንገድ)
        const j = await getJSON(`${QURANENC}/translation/aya/${key}/${s}/${a}`);
        // የQuranEnc ነጠላ አንቀጽ ሪስፖንስ መዋቅር፦ { result: { translation: "..." } } ወይም በቀጥታ { translation: "..." }
        transText = j.translation || j.result?.translation || null;
        
        if (transText) {
          sourceLabel = `QuranEnc (${LANGS[lang]} — ${key})`;
        }
      } catch (e) {
        console.warn('QuranEnc ayah failed, trying surah fallback:', e);
      }

      // ካልተሳካ በሱራ ደረጃ በመፈለግ መሞከር (Fallback)
      if (!transText) {
        try {
          const j = await getJSON(`${QURANENC}/translation/sura/${key}/${s}`);
          const list = j.result || j.ayahs || (Array.isArray(j) ? j : []);
          const ayah = list.find(x => String(x.aya) === String(a));
          transText = ayah?.translation || null;
          if (transText) sourceLabel = `QuranEnc Sura (${LANGS[lang]} — ${key})`;
        } catch (e2) {
          console.warn('QuranEnc sura fallback failed:', e2);
        }
      }
    }

    // ለኦሮምኛ ተጨማሪ አማራጭ (AlQuran Cloud - om.abubakr)
    if (!transText && lang === 'om') {
      try {
        const j = await getJSON(`${ALQURAN}/ayah/${ref}/om.abubakr`);
        transText = j.data?.text || null;
        if (transText) sourceLabel = 'AlQuran Cloud (Afaan Oromoo)';
      } catch {}
    }
  }

  // 4) ቋንቋ ተኮር ርዕሶች (Labels) አወቃቀር
  let sectionTitle = 'Translation / Tafsir';
  if (lang === 'am') sectionTitle = 'የአማርኛ ትርጉም (Amharic Translation)';
  else if (lang === 'om') sectionTitle = 'Hiikkaა Afaan Oromoo';
  else if (lang === 'ar') sectionTitle = 'التفسير (العربية)';
  else if (lang === 'en') sectionTitle = 'English Translation / Tafsir';

  // 5) በ HTML መልክ ውጤቱን በስክሪኑ ላይ ማሳየት
  out.innerHTML = `
    <article class="ayah">
      <p class="ar">${esc(arText || '')}</p>
    </article>

    ${transText ? `<section class="card">
      <h3>${sectionTitle}</h3>
      <p class="tr">${esc(transText)}</p>
    </section>` : ''}

    ${tafAr && lang === 'ar' ? `<section class="card">
      <h3>التفسير الميسر</h3>
      <p class="ar sm">${esc(tafAr)}</p>
    </section>` : ''}

    ${tafEn && (lang === 'en' || !transText) ? `<section class="card">
      <h3>Tafsir (English) — Ibn Kathir</h3>
      <p class="en">${esc(tafEn)}</p>
    </section>` : ''}

    ${!transText && !tafAr && !tafEn ? `<div class="note">No data found for this ayah in ${LANGS[lang]}.</div>` : ''}

    <div class="note">
      Source: ${esc(sourceLabel || 'verified source')}.
      Consult scholars for personal rulings.
    </div>`;
}
