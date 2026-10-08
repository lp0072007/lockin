'use strict';

/* =========================================================
   LockIn – Peak-Week-Tracker
   Alle Daten bleiben lokal: Einträge in localStorage,
   Fotos in IndexedDB.
   ========================================================= */

const KEY = 'lockin.v1';

// ---------- Helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (v, dec = 0) => v == null || Number.isNaN(v) ? '–'
  : Number(v).toLocaleString('de-AT', { maximumFractionDigits: dec });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const diffDays = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dateLabel = iso => { const d = new Date(iso + 'T12:00:00'); return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`; };
const sum = (arr, f) => (arr || []).reduce((a, x) => a + (f(x) || 0), 0);

// ---------- Definitionen ----------
const NUTRIENTS = [
  { k: 'kcal', label: 'Kalorien', short: 'kcal', unit: 'kcal' },
  { k: 'protein', label: 'Eiweiß', short: 'EW', unit: 'g' },
  { k: 'carbs', label: 'Kohlenhydrate', short: 'KH', unit: 'g' },
  { k: 'fat', label: 'Fett', short: 'F', unit: 'g' },
  { k: 'fiber', label: 'Ballaststoffe', short: 'BS', unit: 'g' },
  { k: 'salt', label: 'Salz', short: 'Salz', unit: 'g', dec: 2 },
  { k: 'potassium', label: 'Kalium', short: 'K', unit: 'mg' },
];

const METRICS = [
  { k: 'kcal', label: 'Kalorien', unit: 'kcal' },
  { k: 'protein', label: 'Eiweiß', unit: 'g' },
  { k: 'carbs', label: 'Kohlenhydrate', unit: 'g' },
  { k: 'fat', label: 'Fett', unit: 'g' },
  { k: 'fiber', label: 'Ballaststoffe', unit: 'g' },
  { k: 'water', label: 'Wasser', unit: 'L', scale: 1 / 1000, dec: 2 },
  { k: 'salt', label: 'Salz', unit: 'g', dec: 1, extra: v => `≈ ${fmt(v * 400)} mg Natrium` },
  { k: 'potassium', label: 'Kalium', unit: 'mg' },
  { k: 'steps', label: 'Schritte', unit: '' },
  { k: 'sleep', label: 'Schlaf', unit: 'h', dec: 1 },
];

const TARGET_FIELDS = [
  { k: 'kcal', label: 'Kalorien (kcal)' },
  { k: 'protein', label: 'Eiweiß (g)' },
  { k: 'carbs', label: 'Kohlenhydrate (g)' },
  { k: 'fat', label: 'Fett (g)' },
  { k: 'fiber', label: 'Ballaststoffe (g)' },
  { k: 'water', label: 'Wasser (ml)' },
  { k: 'salt', label: 'Salz (g)' },
  { k: 'potassium', label: 'Kalium (mg)' },
  { k: 'steps', label: 'Schritte' },
  { k: 'sleep', label: 'Schlaf (h)' },
];

const RATINGS = [
  { k: 'full', label: 'Fülle', lo: 'flach', hi: 'voll' },
  { k: 'dry', label: 'Trockenheit / Härte', lo: 'wässrig', hi: 'trocken' },
  { k: 'vasc', label: 'Venen', lo: 'keine', hi: 'extrem' },
  { k: 'pump', label: 'Pump', lo: 'keiner', hi: 'massiv' },
  { k: 'bloat', label: 'Blähbauch', lo: 'keiner', hi: 'stark' },
  { k: 'thirst', label: 'Durst', lo: 'keiner', hi: 'extrem' },
  { k: 'energy', label: 'Energie', lo: 'leer', hi: 'top' },
  { k: 'hunger', label: 'Hunger', lo: 'keiner', hi: 'extrem' },
  { k: 'mood', label: 'Stimmung', lo: 'mies', hi: 'top' },
];

const URINE = ['#f8f6d8', '#f6f1a8', '#f3e77a', '#ecd84f', '#e2c23a', '#d3a52c', '#b98523', '#8f6519'];

const WORKOUT_TYPES = ['Krafttraining', 'Cardio', 'Posing', 'Pump-Workout', 'Mobility', 'Sonstiges'];

const DEFAULTS = {
  targets: { kcal: 2800, protein: 200, carbs: 300, fat: 70, fiber: 30, water: 4000, salt: 6, potassium: 4000, steps: 10000, sleep: 8 },
  supplements: ['Kreatin', 'Multivitamin', 'Omega-3', 'Vitamin D', 'Elektrolyte'],
  showDate: '',
  prepStart: '',
};

// ---------- Datenhaltung ----------
const clone = o => JSON.parse(JSON.stringify(o));

function load() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch { /* leer */ }
  if (!d || typeof d !== 'object') d = {};
  d.settings = { ...clone(DEFAULTS), ...(d.settings || {}) };
  d.settings.targets = { ...DEFAULTS.targets, ...(d.settings.targets || {}) };
  d.plans ||= {};
  d.days ||= {};
  d.recipes ||= [];
  return d;
}

let db = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch { toast('Speichern fehlgeschlagen – Speicher voll?'); }
}

function day(date = ui.date) {
  const d = db.days[date] ||= {};
  d.foods ||= []; d.water ||= []; d.salt ||= []; d.workouts ||= [];
  d.ratings ||= {}; d.supps ||= {};
  return d;
}

function targetsFor(date) {
  const t = { ...db.settings.targets };
  const p = db.plans[date] || {};
  for (const k of Object.keys(t)) if (p[k] != null && p[k] !== '') t[k] = p[k];
  return t;
}

const foodVal = (f, k) => (f.base?.[k] || 0) * (f.factor || 1);

function totals(date) {
  const d = db.days[date] || {};
  const t = {};
  for (const n of NUTRIENTS) t[n.k] = sum(d.foods, f => foodVal(f, n.k));
  t.salt += sum(d.salt, s => s.g);
  t.water = sum(d.water, w => w.ml);
  t.steps = d.steps ?? null;
  t.sleep = d.sleep ?? null;
  return t;
}

// ---------- Fotos (IndexedDB) ----------
const photos = (() => {
  let conn;
  const open = () => conn ||= new Promise((res, rej) => {
    const r = indexedDB.open('lockin-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }).createIndex('date', 'date');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const run = async (mode, fn) => {
    const idb = await open();
    return new Promise((res, rej) => {
      const tx = idb.transaction('photos', mode);
      const req = fn(tx.objectStore('photos'));
      tx.oncomplete = () => res(req?.result);
      tx.onerror = () => rej(tx.error);
    });
  };
  return {
    put: rec => run('readwrite', s => s.put(rec)),
    del: id => run('readwrite', s => s.delete(id)),
    byDate: date => run('readonly', s => s.index('date').getAll(date)),
    all: () => run('readonly', s => s.getAll()),
  };
})();

function compressImage(file, max = 1280) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

// ---------- Nährwerte aus geteiltem Text auslesen ----------
const LABELS = [
  ['kcal', /(kalorien|energie|brennwert|calories|kcal)/],
  ['protein', /(eiwei(ß|ss)|protein)/],
  ['carbs', /(kohlenhydrat|carb|(^|[^a-zäöü])kh([^a-zäöü]|$))/],
  ['fat', /(fett|fat)(?!s[äa]ure|ty)/],
  ['fiber', /(ballaststoff|fib(er|re)|faser)/],
  ['salt', /(salz|salt)/],
  ['sodium', /(natrium|sodium)/],
  ['potassium', /(kalium|potassium)/],
];
const SKIP_LINE = /^[^a-zäöü]*(davon|gesättigt|ungesättigt|einfach|mehrfach|saturated|of which|sugar|zucker|trans)/;
// Überschriften, die kein Rezeptname sind (z. B. aus Yazio/Google Lens)
const NOT_A_NAME = /^(nährstoffe|nährwerte|nährwertangaben|nährwertinformation|nutrition|nutrients|für |pro |per |je |portion|zutaten|ingredients)/;
const NUM_UNIT = /(\d+(?:[.,]\d+)?)\s*(mg|g|kcal|kj)?(?![a-zäöü])/;

function parseNutrition(text) {
  const values = {};
  const lines = String(text).split(/\r?\n|;|\|/).map(l => l.trim()).filter(Boolean);
  const url = (text.match(/https?:\/\/\S+/) || [])[0] || '';

  const k = text.match(/(\d+(?:[.,]\d+)?)\s*kcal/i);
  if (k) values.kcal = num(k[1]);

  const pick = (s) => { const m = s.match(NUM_UNIT); return m ? { v: num(m[1]), unit: m[2] } : null; };

  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    if (low.startsWith('http') || SKIP_LINE.test(low)) continue;
    for (const [key, re] of LABELS) {
      const m = low.match(re);
      if (!m) continue;
      const after = low.slice(m.index + m[0].length);
      const before = low.slice(0, m.index);
      let hit = pick(after) || pick(before) || (lines[i + 1] && !LABELS.some(([, r]) => r.test(lines[i + 1].toLowerCase())) ? pick(lines[i + 1].toLowerCase()) : null);
      if (!hit) break;
      let v = hit.v;
      if (key === 'kcal') { if (hit.unit === 'kj') v = v / 4.184; values.kcal ??= v; }
      else if (key === 'sodium') { values.salt ??= hit.unit === 'mg' ? v / 400 : v * 2.5; }
      else if (key === 'potassium') { values.potassium ??= hit.unit === 'g' ? v * 1000 : v; }
      else if (key === 'salt') { values.salt ??= hit.unit === 'mg' ? v / 1000 : v; }
      else values[key] ??= v;
      break;
    }
  }

  const name = lines.find(l =>
    /[a-zäöü]/i.test(l) && !/^https?:/.test(l) && !/\d/.test(l) &&
    !NOT_A_NAME.test(l.toLowerCase()) && !SKIP_LINE.test(l.toLowerCase()) &&
    !LABELS.some(([, r]) => r.test(l.toLowerCase()))
  )?.replace(/^(rezept|recipe)\s*:\s*/i, '') || '';

  for (const key of Object.keys(values)) values[key] = Math.round(values[key] * 100) / 100;
  return { values, found: Object.keys(values).length, name, url };
}

// ---------- UI-State ----------
const ui = { tab: 'heute', date: todayISO() };
try { const t = sessionStorage.getItem('lockin.tab'); if (t) ui.tab = t; } catch { /* egal */ }

const topEl = $('#top'), view = $('#view'), modal = $('#modal');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- Rendering ----------
function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  renderTop();
  view.innerHTML = VIEWS[ui.tab]();
  AFTER[ui.tab]?.();
}

function renderTop() {
  if (!['heute', 'essen', 'checkin'].includes(ui.tab)) {
    topEl.innerHTML = `<div class="top-title">${ui.tab === 'verlauf' ? 'Verlauf' : 'Plan & Einstellungen'}</div>`;
    return;
  }
  const sd = db.settings.showDate;
  let cd = '';
  if (sd) {
    const n = diffDays(ui.date, sd);
    cd = n > 1 ? `Show in ${n} Tagen` : n === 1 ? 'Show morgen' : n === 0 ? 'Showday' : `${-n} Tage nach Show`;
  }
  const label = db.plans[ui.date]?.label;
  const isToday = ui.date === todayISO();
  topEl.innerHTML = `
    <div class="datenav">
      <button data-act="prevDay" aria-label="Vortag">‹</button>
      <label class="datebtn">${isToday ? 'Heute · ' : ''}${dateLabel(ui.date)}
        <input type="date" id="datepick" value="${ui.date}">
      </label>
      <button data-act="nextDay" aria-label="Nächster Tag">›</button>
    </div>
    ${cd || label || !isToday ? `<div class="sub">
      ${cd ? `<span class="pill accent">${cd}</span>` : ''}
      ${label ? `<span class="pill">${esc(label)}</span>` : ''}
      ${!isToday ? `<button class="pill" style="border:0" data-act="goToday">Zu heute</button>` : ''}
    </div>` : ''}`;
}

function bar(m, ist, soll) {
  const sc = m.scale || 1, dec = m.dec || 0;
  const has = ist != null;
  const pct = soll ? (ist || 0) / soll : 0;
  const cls = !has || !soll ? 'low' : pct < 0.9 ? 'low' : pct <= 1.1 ? 'ok' : 'over';
  return `<div class="bar">
    <div class="bar-head"><b>${m.label}</b>
      <span><strong>${fmt(has ? ist * sc : null, dec)}</strong> / ${fmt(soll * sc, dec)} ${m.unit}</span></div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.min(100, pct * 100)}%"></div></div>
    ${m.extra && has ? `<div class="bar-extra">${m.extra(ist)}</div>` : ''}
  </div>`;
}

function barsHTML() {
  const t = targetsFor(ui.date), s = totals(ui.date);
  return METRICS.map(m => bar(m, s[m.k], t[m.k])).join('');
}

const VIEWS = {
  heute() {
    const d = day(), s = totals(ui.date), t = targetsFor(ui.date);
    const extraSalt = sum(d.salt, x => x.g);
    const note = db.plans[ui.date]?.note;
    return `
      ${note ? `<section class="card"><h2>Plan für heute</h2><div>${esc(note).replace(/\n/g, '<br>')}</div></section>` : ''}
      <section class="card"><h2>Tagesziele</h2><div id="bars">${barsHTML()}</div></section>

      <section class="card">
        <h2>Wasser <span class="h-right">${fmt(s.water / 1000, 2)} / ${fmt(t.water / 1000, 1)} L</span></h2>
        <div class="btnrow">
          <button data-act="water" data-v="250">+250 ml</button>
          <button data-act="water" data-v="500">+500 ml</button>
          <button data-act="water" data-v="1000">+1 L</button>
          <button class="ghost" data-act="undoWater" aria-label="Rückgängig">↶</button>
        </div>
        ${d.water.length ? `<div class="log">${d.water.slice(-8).map(w => `<span>${w.t} · ${w.ml} ml</span>`).join('')}</div>` : ''}
      </section>

      <section class="card">
        <h2>Salz extra <span class="h-right">${fmt(extraSalt, 1)} g</span></h2>
        <div class="btnrow">
          <button data-act="salt" data-v="0.5">+0,5 g</button>
          <button data-act="salt" data-v="1">+1 g</button>
          <button data-act="salt" data-v="2">+2 g</button>
          <button class="ghost" data-act="undoSalt" aria-label="Rückgängig">↶</button>
        </div>
        <p class="hint">Salz aus dem Essen wird automatisch mitgezählt. Gesamt: ${fmt(s.salt, 1)} g ≈ ${fmt(s.salt * 400)} mg Natrium.</p>
      </section>

      <section class="card">
        <h2>Schritte & Schlaf</h2>
        <div class="grid3">
          <label class="field"><span>Schritte</span><input inputmode="numeric" data-day="steps" value="${d.steps ?? ''}" placeholder="0"></label>
          <label class="field"><span>Schlaf (h)</span><input inputmode="decimal" data-day="sleep" value="${d.sleep ?? ''}" placeholder="0"></label>
          <label class="field"><span>Qualität 1–10</span><input inputmode="numeric" data-day="sleepQ" value="${d.sleepQ ?? ''}" placeholder="–"></label>
        </div>
      </section>

      <section class="card">
        <h2>Training <span class="h-right">${fmt(sum(d.workouts, w => w.min))} min</span></h2>
        <div class="list">
          ${d.workouts.map(w => `<div class="item">
            <span class="time">${w.t}</span>
            <div class="main"><div class="name">${esc(w.type)}</div><div class="macros">${fmt(w.min)} min${w.note ? ' · ' + esc(w.note) : ''}</div></div>
            <button class="icon-btn" data-act="delWorkout" data-id="${w.id}" aria-label="Löschen">✕</button>
          </div>`).join('')}
        </div>
        <div class="grid2" style="margin-top:${d.workouts.length ? 10 : 0}px">
          <label class="field"><span>Art</span><select id="wType">${WORKOUT_TYPES.map(x => `<option>${x}</option>`).join('')}</select></label>
          <label class="field"><span>Minuten</span><input id="wMin" inputmode="numeric" placeholder="60"></label>
          <label class="field wide"><span>Notiz (optional)</span><input id="wNote" placeholder="z. B. Push, 30 min LISS"></label>
        </div>
        <button class="btn primary block" data-act="addWorkout">Einheit eintragen</button>
      </section>

      <section class="card">
        <h2>Supplements <span class="h-right">${db.settings.supplements.filter(x => d.supps[x]).length}/${db.settings.supplements.length}</span></h2>
        ${db.settings.supplements.length ? `<div class="chips">${db.settings.supplements.map(x =>
          `<button class="chip ${d.supps[x] ? 'on' : ''}" data-act="supp" data-name="${esc(x)}">${d.supps[x] ? '✓ ' : ''}${esc(x)}</button>`).join('')}</div>`
          : `<div class="empty">Supplements unter „Plan“ anlegen.</div>`}
      </section>`;
  },

  essen() {
    const d = day(), s = totals(ui.date), t = targetsFor(ui.date);
    const foods = [...d.foods].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const cell = (k, l) => `<div><b>${fmt(s[k])}</b><small>${l} / ${fmt(t[k])}</small></div>`;
    return `
      <section class="card">
        <div class="summary">${cell('kcal', 'kcal')}${cell('protein', 'EW')}${cell('carbs', 'KH')}${cell('fat', 'Fett')}</div>
        <p class="hint" style="text-align:center">Ballaststoffe ${fmt(s.fiber)} / ${fmt(t.fiber)} g · Salz ${fmt(s.salt, 1)} / ${fmt(t.salt, 1)} g</p>
      </section>

      <section class="card">
        <div class="btnrow">
          <button class="primary" data-act="pasteImport">Einfügen</button>
          <button data-act="recipes">Rezepte</button>
          <button data-act="addFood">+ Manuell</button>
        </div>
        <p class="hint">Yazio: Rezept öffnen → Teilen → Kopieren, dann hier auf „Einfügen“ tippen.</p>
      </section>

      <section class="card">
        <h2>Mahlzeiten <span class="h-right">${foods.length}</span></h2>
        ${foods.length ? `<div class="list">${foods.map(f => `
          <div class="item tap" data-act="editFood" data-id="${f.id}">
            <span class="time">${esc(f.time || '')}</span>
            <div class="main">
              <div class="name">${esc(f.name || 'Mahlzeit')}${f.factor && f.factor !== 1 ? ` <small style="color:var(--muted)">×${fmt(f.factor, 2)}</small>` : ''}</div>
              <div class="macros">${fmt(foodVal(f, 'kcal'))} kcal · EW ${fmt(foodVal(f, 'protein'))} · KH ${fmt(foodVal(f, 'carbs'))} · F ${fmt(foodVal(f, 'fat'))} · BS ${fmt(foodVal(f, 'fiber'))} · Salz ${fmt(foodVal(f, 'salt'), 1)}</div>
            </div>
            <button class="icon-btn" data-act="delFood" data-id="${f.id}" aria-label="Löschen">✕</button>
          </div>`).join('')}</div>` : `<div class="empty">Noch nichts eingetragen.</div>`}
      </section>`;
  },

  checkin() {
    const d = day();
    return `
      <section class="card">
        <h2>Morgens</h2>
        <div class="seg" style="margin-bottom:10px">
          <button class="${d.fasted === true ? 'on' : ''}" data-act="fasted" data-v="1">Nüchtern gewogen</button>
          <button class="${d.fasted === false ? 'on warn' : ''}" data-act="fasted" data-v="0">Nicht nüchtern</button>
        </div>
        <div class="grid3">
          <label class="field"><span>Gewicht (kg)</span><input inputmode="decimal" data-day="weight" value="${d.weight ?? ''}" placeholder="0,0"></label>
          <label class="field"><span>Taille (cm)</span><input inputmode="decimal" data-day="waist" value="${d.waist ?? ''}" placeholder="0"></label>
          <label class="field"><span>Ruhepuls</span><input inputmode="numeric" data-day="rhr" value="${d.rhr ?? ''}" placeholder="0"></label>
        </div>
      </section>

      <section class="card">
        <h2>Look & Gefühl (1–10)</h2>
        ${RATINGS.map(r => {
          const v = d.ratings[r.k];
          return `<div class="rating ${v == null ? 'unset' : ''}" data-wrap="${r.k}">
            <div class="rating-head"><span>${r.label}</span><b>${v ?? '–'}</b></div>
            <input type="range" min="1" max="10" step="1" value="${v ?? 5}" data-rating="${r.k}">
            <div class="rating-scale"><span>${r.lo}</span><span>${r.hi}</span></div>
          </div>`;
        }).join('')}
      </section>

      <section class="card">
        <h2>Verdauung & Hydration</h2>
        <div class="row"><span>Stuhlgang</span>
          <div class="stepper"><button data-act="bm" data-v="-1">−</button><b>${d.bm ?? 0}</b><button data-act="bm" data-v="1">+</button></div>
        </div>
        <div class="row"><span>Krämpfe</span>
          <label class="toggle"><input type="checkbox" data-daybool="cramps" ${d.cramps ? 'checked' : ''}><i></i></label>
        </div>
        <div style="margin-top:8px"><span style="font-size:14px">Urinfarbe</span>
          <div class="urine" style="margin-top:6px">${URINE.map((c, i) =>
            `<button style="background:${c}" class="${d.urine === i + 1 ? 'on' : ''}" data-act="urine" data-v="${i + 1}">${i + 1}</button>`).join('')}</div>
          <p class="hint">1 = sehr hell (viel Wasser), 8 = dunkel (dehydriert)</p>
        </div>
      </section>

      <section class="card">
        <h2>Progress-Fotos</h2>
        <div class="photos" id="photoGrid"><div class="empty" style="grid-column:1/-1">Lade…</div></div>
        <p class="hint">Immer gleiches Licht, gleiche Uhrzeit, gleiche Posen.</p>
      </section>

      <section class="card">
        <h2>Notizen</h2>
        <textarea class="full" data-day="notes" data-text placeholder="Wie fühlst du dich? Auffälligkeiten?">${esc(d.notes || '')}</textarea>
      </section>`;
  },

  verlauf() {
    const dates = Object.keys(db.days).sort();
    const withWeight = dates.filter(x => db.days[x].weight != null);
    const rows = dates.slice(-21).reverse();
    const cls = (ist, soll) => !soll || ist == null ? '' : ist / soll < 0.9 ? '' : ist / soll <= 1.1 ? 'ok' : 'over';
    return `
      <section class="card chart">
        <h2>Gewicht ${withWeight.length ? `<span class="h-right">${fmt(db.days[withWeight.at(-1)].weight, 1)} kg</span>` : ''}</h2>
        ${withWeight.length >= 2 ? weightChart(withWeight) + (withWeight.some(x => db.days[x].fasted === false) ? `<p class="hint">Hohler Punkt = nicht nüchtern gewogen.</p>` : '') : `<div class="empty">Trag morgens dein Gewicht im Check-in ein, ab 2 Tagen gibt’s hier eine Kurve.</div>`}
      </section>

      <section class="card">
        <h2>Tage</h2>
        ${rows.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Tag</th><th>kg</th><th>kcal</th><th>EW</th><th>KH</th><th>F</th><th>Wasser</th><th>Salz</th><th>Schritte</th><th>Schlaf</th><th>Fülle</th></tr></thead>
          <tbody>${rows.map(x => {
            const s = totals(x), t = targetsFor(x), d = db.days[x];
            return `<tr data-act="openDay" data-date="${x}">
              <td>${dateLabel(x)}</td>
              <td>${fmt(d.weight, 1)}${d.weight != null && d.fasted === false ? '*' : ''}</td>
              <td class="${cls(s.kcal, t.kcal)}">${fmt(s.kcal)}</td>
              <td class="${cls(s.protein, t.protein)}">${fmt(s.protein)}</td>
              <td class="${cls(s.carbs, t.carbs)}">${fmt(s.carbs)}</td>
              <td class="${cls(s.fat, t.fat)}">${fmt(s.fat)}</td>
              <td class="${cls(s.water, t.water)}">${fmt(s.water / 1000, 1)}</td>
              <td class="${cls(s.salt, t.salt)}">${fmt(s.salt, 1)}</td>
              <td class="${cls(s.steps, t.steps)}">${fmt(s.steps)}</td>
              <td>${fmt(s.sleep, 1)}</td>
              <td>${fmt(d.ratings?.full)}</td>
            </tr>`;
          }).join('')}</tbody></table></div>
          <p class="hint">Grün = im Ziel (±10 %), orange = drüber. * = nicht nüchtern gewogen. Tippen öffnet den Tag.</p>`
          : `<div class="empty">Noch keine Daten.</div>`}
      </section>

      <section class="card">
        <h2>Foto-Vergleich</h2>
        <div id="compareBox"><div class="empty">Lade…</div></div>
      </section>`;
  },

  plan() {
    const st = db.settings, t = st.targets;
    const start = st.prepStart || todayISO();
    const end = st.showDate && diffDays(start, st.showDate) >= 0 && diffDays(start, st.showDate) <= 60 ? st.showDate : addDays(start, 13);
    const days = [];
    for (let x = start; diffDays(x, end) >= 0; x = addDays(x, 1)) days.push(x);
    const today = todayISO();
    return `
      <section class="card">
        <h2>Show</h2>
        <div class="grid2">
          <label class="field"><span>Prep-Start</span><input type="date" data-setting="prepStart" value="${st.prepStart}"></label>
          <label class="field"><span>Showdatum</span><input type="date" data-setting="showDate" value="${st.showDate}"></label>
        </div>
      </section>

      <section class="card">
        <h2>Tagesplan</h2>
        <div class="list">${days.map(x => {
          const p = db.plans[x] || {};
          const over = TARGET_FIELDS.filter(f => p[f.k] != null && p[f.k] !== '');
          const sd = st.showDate ? diffDays(x, st.showDate) : null;
          return `<div class="item tap plan-day ${x === today ? 'today' : ''}" data-act="editPlan" data-date="${x}">
            <div class="main">
              <div class="name">${dateLabel(x)}${sd != null && sd >= 0 ? ` <small style="color:var(--muted);display:inline">· ${sd === 0 ? 'SHOW' : 'T−' + sd}</small>` : ''}${p.label ? ' · ' + esc(p.label) : ''}</div>
              <small>${over.length ? over.map(f => `${f.label.split(' ')[0]} ${fmt(p[f.k], 1)}`).join(' · ') : 'Standard-Ziele'}</small>
            </div><span style="color:var(--muted)">›</span>
          </div>`;
        }).join('')}</div>
        <p class="hint">Für jeden Tag eigene Ziele (z. B. Carb-Load, Wasser runter). Leere Felder nutzen die Standard-Ziele.</p>
      </section>

      <section class="card">
        <h2>Standard-Ziele</h2>
        <div class="grid2">${TARGET_FIELDS.map(f =>
          `<label class="field"><span>${f.label}</span><input inputmode="decimal" data-target="${f.k}" value="${t[f.k] ?? ''}"></label>`).join('')}</div>
      </section>

      <section class="card">
        <h2>Supplements</h2>
        <textarea class="full" id="suppList" placeholder="Eins pro Zeile">${esc(st.supplements.join('\n'))}</textarea>
        <button class="btn block" data-act="saveSupps">Speichern</button>
      </section>

      <section class="card">
        <h2>Daten</h2>
        <div class="btnrow">
          <button data-act="exportData">Backup exportieren</button>
          <label class="btn" style="display:flex;align-items:center;justify-content:center;position:relative">Importieren
            <input type="file" accept="application/json,.json" id="importFile" style="position:absolute;inset:0;opacity:0"></label>
        </div>
        <p class="hint">Daten liegen nur auf diesem Handy. Mach ab und zu ein Backup (Fotos sind nicht im Backup).</p>
        <button class="btn danger block" data-act="wipe">Alle Daten löschen</button>
      </section>`;
  },
};

const AFTER = {
  async checkin() {
    const grid = $('#photoGrid');
    if (!grid) return;
    let list = [];
    try { list = await photos.byDate(ui.date); } catch { /* IndexedDB nicht verfügbar */ }
    if (!$('#photoGrid') || ui.tab !== 'checkin') return;
    grid.innerHTML = list.map(p => `<div class="photo"><img src="${p.data}" alt=""><button data-act="delPhoto" data-id="${p.id}" aria-label="Löschen">✕</button></div>`).join('')
      + `<label class="photo-add">+<input type="file" accept="image/*" id="photoInput" multiple></label>`;
  },
  async verlauf() {
    const box = $('#compareBox');
    let list = [];
    try { list = await photos.all(); } catch { /* egal */ }
    if (!$('#compareBox')) return;
    const dates = [...new Set(list.map(p => p.date))].sort();
    if (!dates.length) { box.innerHTML = `<div class="empty">Noch keine Fotos. Im Check-in hinzufügen.</div>`; return; }
    ui.cmpA = dates.includes(ui.cmpA) ? ui.cmpA : dates[0];
    ui.cmpB = dates.includes(ui.cmpB) ? ui.cmpB : dates.at(-1);
    const opts = sel => dates.map(x => `<option value="${x}" ${x === sel ? 'selected' : ''}>${dateLabel(x)}</option>`).join('');
    const pic = d => { const p = list.filter(x => x.date === d); return p.length ? p.map(x => `<div class="photo"><img src="${x.data}" alt=""></div>`).join('') : `<div class="empty">–</div>`; };
    box.innerHTML = `
      <div class="grid2">
        <label class="field"><select id="cmpA">${opts(ui.cmpA)}</select></label>
        <label class="field"><select id="cmpB">${opts(ui.cmpB)}</select></label>
      </div>
      <div class="compare"><div class="list">${pic(ui.cmpA)}</div><div class="list">${pic(ui.cmpB)}</div></div>`;
  },
};

function weightChart(dates) {
  const W = 340, H = 150, P = { l: 34, r: 10, t: 10, b: 22 };
  const vals = dates.map(x => db.days[x].weight);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (max - min < 1) { min -= 0.5; max += 0.5; }
  const x0 = dates[0], span = Math.max(1, diffDays(x0, dates.at(-1)));
  const X = d => P.l + (W - P.l - P.r) * diffDays(x0, d) / span;
  const Y = v => P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min));
  const pts = dates.map(d => [X(d), Y(db.days[d].weight), db.days[d].fasted === false]);
  return `<svg viewBox="0 0 ${W} ${H}">
    <line class="axis" x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}"/>
    <text x="${P.l - 4}" y="${Y(max) + 4}" text-anchor="end">${fmt(max, 1)}</text>
    <text x="${P.l - 4}" y="${Y(min) + 4}" text-anchor="end">${fmt(min, 1)}</text>
    <text x="${P.l}" y="${H - 6}">${dateLabel(dates[0])}</text>
    <text x="${W - P.r}" y="${H - 6}" text-anchor="end">${dateLabel(dates.at(-1))}</text>
    <polyline class="line" points="${pts.map(p => p[0] + ',' + p[1]).join(' ')}"/>
    ${pts.map(p => `<circle class="dot ${p[2] ? 'hollow' : ''}" cx="${p[0]}" cy="${p[1]}" r="${p[2] ? 4 : 3}"/>`).join('')}
  </svg>`;
}

// ---------- Modals ----------
function openModal(html) {
  modal.innerHTML = `<div class="sheet">${html}</div>`;
  modal.hidden = false;
  document.body.classList.add('noscroll');
}
function closeModal() {
  modal.hidden = true;
  modal.innerHTML = '';
  document.body.classList.remove('noscroll');
}

function foodForm({ id = '', name = '', time = nowTime(), factor = 1, base = {}, note = '', saveRecipe = false, recipeId = '' } = {}) {
  openModal(`
    <h3>${id ? 'Mahlzeit bearbeiten' : 'Mahlzeit eintragen'}</h3>
    ${note}
    <form data-form="food">
      <input type="hidden" name="id" value="${esc(id)}">
      <input type="hidden" name="recipeId" value="${esc(recipeId)}">
      <div class="grid2">
        <label class="field wide"><span>Name</span><input name="name" value="${esc(name)}" placeholder="z. B. Reis mit Hähnchen"></label>
        <label class="field"><span>Uhrzeit</span><input type="time" name="time" value="${esc(time)}"></label>
        <label class="field"><span>Portionen ×</span><input inputmode="decimal" name="factor" value="${fmt(factor, 2)}"></label>
      </div>
      <p class="hint" style="margin:12px 0 6px">Nährwerte pro Portion:</p>
      <div class="grid2">${NUTRIENTS.map(n =>
        `<label class="field"><span>${n.label} (${n.unit})</span><input inputmode="decimal" name="${n.k}" value="${base[n.k] != null ? fmt(base[n.k], 2) : ''}" placeholder="0"></label>`).join('')}</div>
      ${recipeId ? '' : `<div class="row" style="margin-top:8px"><span>Als Rezept speichern</span>
        <label class="toggle"><input type="checkbox" name="saveRecipe" ${saveRecipe ? 'checked' : ''}><i></i></label></div>`}
      <div class="btnrow" style="margin-top:14px">
        <button type="button" data-act="closeModal">Abbrechen</button>
        <button type="submit" class="primary">Speichern</button>
      </div>
    </form>`);
}

function pasteModal(text = '', msg = '') {
  openModal(`
    <h3>Rezept einfügen</h3>
    ${msg ? `<div class="note">${msg}</div>` : ''}
    <textarea class="full" id="pasteText" placeholder="Geteilten Text aus Yazio hier einfügen…" style="min-height:160px">${esc(text)}</textarea>
    <div class="btnrow" style="margin-top:12px">
      <button type="button" data-act="closeModal">Abbrechen</button>
      <button type="button" class="primary" data-act="parsePaste">Auslesen</button>
    </div>`);
}

function openParsed(text) {
  const r = parseNutrition(text);
  if (!r.found) {
    pasteModal(text, r.url
      ? 'Im geteilten Text stehen keine Nährwerte, nur ein Link. Tipp die Werte einmal ab und speichere das Rezept, danach reicht ein Tipp.'
      : 'Ich habe keine Nährwerte gefunden. Füg den Text mit den Zahlen ein oder trag die Werte manuell ein.');
    return false;
  }
  foodForm({
    name: r.name, base: r.values, saveRecipe: true,
    note: `<div class="note good">${r.found} Werte erkannt.${r.name ? ' Kurz prüfen und speichern.' : ' Gib noch einen Namen ein, dann speichern.'}</div>`,
  });
  if (!r.name) $('form[data-form="food"] input[name="name"]')?.focus();
  return true;
}

function recipesModal() {
  const list = [...db.recipes].sort((a, b) => a.name.localeCompare(b.name));
  openModal(`
    <h3>Meine Rezepte</h3>
    ${list.length ? `<div class="list">${list.map(r => `
      <div class="item tap" data-act="useRecipe" data-id="${r.id}">
        <div class="main"><div class="name">${esc(r.name)}</div>
          <div class="macros">${fmt(r.base.kcal)} kcal · EW ${fmt(r.base.protein)} · KH ${fmt(r.base.carbs)} · F ${fmt(r.base.fat)} · Salz ${fmt(r.base.salt, 1)}</div></div>
        <button class="icon-btn" data-act="delRecipe" data-id="${r.id}" aria-label="Rezept löschen">✕</button>
      </div>`).join('')}</div>`
      : `<div class="empty">Noch keine Rezepte. Beim Eintragen „Als Rezept speichern“ aktivieren.</div>`}
    <button class="btn block" data-act="closeModal">Schließen</button>`);
}

function planModal(date) {
  const p = db.plans[date] || {}, t = db.settings.targets;
  openModal(`
    <h3>Plan · ${dateLabel(date)}</h3>
    <form data-form="plan">
      <input type="hidden" name="date" value="${date}">
      <div class="grid2">
        <label class="field wide"><span>Bezeichnung</span><input name="label" value="${esc(p.label || '')}" placeholder="z. B. Depletion, Carb-Load 1"></label>
        ${TARGET_FIELDS.map(f => `<label class="field"><span>${f.label}</span><input inputmode="decimal" name="${f.k}" value="${p[f.k] ?? ''}" placeholder="${fmt(t[f.k], 1)}"></label>`).join('')}
        <label class="field wide"><span>Anweisungen (z. B. vom Coach)</span><textarea name="note" class="full" placeholder="Was ist heute wichtig?">${esc(p.note || '')}</textarea></label>
      </div>
      <div class="btnrow" style="margin-top:12px">
        <button type="button" data-act="copyPrevPlan" data-date="${date}">Vortag kopieren</button>
        <button type="button" data-act="clearPlan" data-date="${date}">Leeren</button>
      </div>
      <div class="btnrow" style="margin-top:8px">
        <button type="button" data-act="closeModal">Abbrechen</button>
        <button type="submit" class="primary">Speichern</button>
      </div>
    </form>`);
}

// ---------- Aktionen ----------
const ACT = {
  prevDay() { ui.date = addDays(ui.date, -1); render(); },
  nextDay() { ui.date = addDays(ui.date, 1); render(); },
  goToday() { ui.date = todayISO(); render(); },
  closeModal,

  water(el) { day().water.push({ t: nowTime(), ml: +el.dataset.v }); save(); render(); toast(`+${el.dataset.v} ml Wasser`); },
  undoWater() { if (day().water.pop()) { save(); render(); toast('Rückgängig'); } },
  salt(el) { day().salt.push({ t: nowTime(), g: +el.dataset.v }); save(); render(); toast(`+${String(el.dataset.v).replace('.', ',')} g Salz`); },
  undoSalt() { if (day().salt.pop()) { save(); render(); toast('Rückgängig'); } },

  addWorkout() {
    const min = num($('#wMin').value);
    if (!min) { toast('Minuten eintragen'); return; }
    day().workouts.push({ id: uid(), t: nowTime(), type: $('#wType').value, min, note: $('#wNote').value.trim() });
    save(); render(); toast('Einheit gespeichert');
  },
  delWorkout(el) { const d = day(); d.workouts = d.workouts.filter(w => w.id !== el.dataset.id); save(); render(); },
  supp(el) { const d = day(), n = el.dataset.name; d.supps[n] = !d.supps[n]; save(); render(); },

  addFood() { foodForm(); },
  editFood(el, e) {
    if (e.target.closest('[data-act="delFood"]')) return;
    const f = day().foods.find(x => x.id === el.dataset.id);
    if (f) foodForm({ ...f, recipeId: 'none' });
  },
  delFood(el) {
    if (!confirm('Mahlzeit löschen?')) return;
    const d = day(); d.foods = d.foods.filter(f => f.id !== el.dataset.id); save(); render();
  },
  async pasteImport() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* keine Berechtigung */ }
    if (!text.trim()) { pasteModal('', 'Zwischenablage leer oder nicht lesbar. Füg den Text hier ein (lange drücken → Einfügen).'); return; }
    openParsed(text);
  },
  parsePaste() { openParsed($('#pasteText').value); },
  recipes() { recipesModal(); },
  useRecipe(el, e) {
    if (e.target.closest('[data-act="delRecipe"]')) return;
    const r = db.recipes.find(x => x.id === el.dataset.id);
    if (r) foodForm({ name: r.name, base: r.base, recipeId: r.id });
  },
  delRecipe(el) {
    if (!confirm('Rezept löschen?')) return;
    db.recipes = db.recipes.filter(r => r.id !== el.dataset.id); save(); recipesModal();
  },

  bm(el) { const d = day(); d.bm = Math.max(0, (d.bm || 0) + +el.dataset.v); save(); render(); },
  fasted(el) { const d = day(), v = el.dataset.v === '1'; d.fasted = d.fasted === v ? null : v; save(); render(); },
  urine(el) { const d = day(), v = +el.dataset.v; d.urine = d.urine === v ? null : v; save(); render(); },
  async delPhoto(el) {
    if (!confirm('Foto löschen?')) return;
    await photos.del(el.dataset.id); AFTER.checkin();
  },

  openDay(el) { ui.date = el.dataset.date; switchTab('heute'); },

  editPlan(el) { planModal(el.dataset.date); },
  copyPrevPlan(el) {
    const prev = db.plans[addDays(el.dataset.date, -1)];
    if (!prev) { toast('Vortag hat keinen Plan'); return; }
    const form = $('form[data-form="plan"]');
    for (const [k, v] of Object.entries(prev)) if (form.elements[k]) form.elements[k].value = v ?? '';
    toast('Vom Vortag übernommen');
  },
  clearPlan() { $('form[data-form="plan"]').querySelectorAll('input:not([type=hidden]), textarea').forEach(i => { i.value = ''; }); },
  saveSupps() {
    db.settings.supplements = $('#suppList').value.split('\n').map(s => s.trim()).filter(Boolean);
    save(); toast('Supplements gespeichert');
  },

  async exportData() {
    const json = JSON.stringify({ app: 'lockin', version: 1, exported: new Date().toISOString(), data: db }, null, 2);
    const name = `lockin-backup-${todayISO()}.json`;
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'LockIn Backup' }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  wipe() {
    if (!confirm('Wirklich ALLE Einträge löschen?')) return;
    if (!confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) return;
    localStorage.removeItem(KEY);
    try { indexedDB.deleteDatabase('lockin-photos'); } catch { /* egal */ }
    db = load(); render(); toast('Gelöscht');
  },
};

// ---------- Events ----------
function switchTab(tab) {
  ui.tab = tab;
  try { sessionStorage.setItem('lockin.tab', tab); } catch { /* egal */ }
  window.scrollTo(0, 0);
  render();
}

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) switchTab(b.dataset.tab);
});

document.addEventListener('click', e => {
  if (e.target === modal) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.rating) {
    const wrap = el.closest('.rating');
    wrap.classList.remove('unset');
    wrap.querySelector('b').textContent = el.value;
  }
});

document.addEventListener('change', async e => {
  const el = e.target;

  if (el.id === 'datepick' && el.value) { ui.date = el.value; render(); return; }

  if (el.dataset.day) {
    const d = day();
    d[el.dataset.day] = 'text' in el.dataset ? el.value : num(el.value);
    save();
    const bars = $('#bars');
    if (bars) bars.innerHTML = barsHTML();
    return;
  }
  if (el.dataset.daybool) { day()[el.dataset.daybool] = el.checked; save(); return; }
  if (el.dataset.rating) { day().ratings[el.dataset.rating] = +el.value; save(); return; }
  if (el.dataset.target) {
    const v = num(el.value);
    if (v != null) db.settings.targets[el.dataset.target] = v;
    save(); return;
  }
  if (el.dataset.setting) { db.settings[el.dataset.setting] = el.value; save(); render(); return; }

  if (el.id === 'cmpA' || el.id === 'cmpB') { ui[el.id] = el.value; AFTER.verlauf(); return; }

  if (el.id === 'photoInput' && el.files.length) {
    toast('Foto wird gespeichert…');
    try {
      for (const f of el.files) {
        const data = await compressImage(f);
        await photos.put({ id: uid(), date: ui.date, data, created: Date.now() });
      }
      toast('Foto gespeichert');
    } catch (err) { toast('Foto-Fehler: ' + err.message); }
    AFTER.checkin();
    return;
  }

  if (el.id === 'importFile' && el.files[0]) {
    try {
      const parsed = JSON.parse(await el.files[0].text());
      const data = parsed.data || parsed;
      if (!data.days) throw new Error('Keine LockIn-Datei');
      if (!confirm('Backup importieren? Aktuelle Daten werden ersetzt.')) return;
      localStorage.setItem(KEY, JSON.stringify(data));
      db = load(); render(); toast('Backup importiert');
    } catch (err) { toast('Import fehlgeschlagen: ' + err.message); }
  }
});

document.addEventListener('submit', e => {
  const form = e.target;
  e.preventDefault();
  const fd = new FormData(form);

  if (form.dataset.form === 'food') {
    const nameInput = form.elements.name;
    if (fd.get('saveRecipe') && !nameInput.value.trim()) {
      toast('Bitte einen Namen für das Rezept eingeben');
      nameInput.classList.add('invalid');
      nameInput.focus();
      return;
    }
    const base = {};
    for (const n of NUTRIENTS) { const v = num(fd.get(n.k)); if (v != null) base[n.k] = v; }
    const entry = {
      id: fd.get('id') || uid(),
      name: String(fd.get('name') || '').trim() || 'Mahlzeit',
      time: fd.get('time') || nowTime(),
      factor: num(fd.get('factor')) || 1,
      base,
    };
    const d = day();
    const i = d.foods.findIndex(f => f.id === entry.id);
    if (i >= 0) d.foods[i] = entry; else d.foods.push(entry);
    if (fd.get('saveRecipe')) {
      const existing = db.recipes.find(r => r.name.toLowerCase() === entry.name.toLowerCase());
      if (existing) existing.base = base; else db.recipes.push({ id: uid(), name: entry.name, base });
    }
    save(); closeModal(); render();
    toast(fd.get('saveRecipe') ? 'Gespeichert + Rezept angelegt' : 'Gespeichert');
  }

  if (form.dataset.form === 'plan') {
    const date = fd.get('date');
    const p = { label: String(fd.get('label') || '').trim(), note: String(fd.get('note') || '').trim() };
    for (const f of TARGET_FIELDS) { const v = num(fd.get(f.k)); if (v != null) p[f.k] = v; }
    const empty = !p.label && !p.note && TARGET_FIELDS.every(f => p[f.k] == null);
    if (empty) delete db.plans[date]; else db.plans[date] = p;
    save(); closeModal(); render(); toast('Plan gespeichert');
  }
});

// Neuer Tag, während die App offen ist
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ui.lastToday && ui.lastToday !== todayISO() && ui.date === ui.lastToday) {
    ui.date = todayISO(); render();
  }
  ui.lastToday = todayISO();
});
ui.lastToday = todayISO();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Modus nicht verfügbar */ });
}

// Persistenten Speicher anfragen, damit iOS die Daten nicht wegräumt
navigator.storage?.persist?.();

render();
