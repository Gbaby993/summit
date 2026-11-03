(() => {
  const KEY = 'summit.v1';
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WD = ['S','M','T','W','T','F','S'];
  const WD_L = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  const MARK = '<svg viewBox="0 0 512 512"><path d="M96 352 L224 176 L288 264 L336 208 L416 352" fill="none" stroke="currentColor" stroke-width="34" stroke-linejoin="round" stroke-linecap="round"/><circle cx="224" cy="176" r="24" fill="#e39a3a"/></svg>';
  const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>';

  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const dateFromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const keyOf = (d) => key(d.getFullYear(), d.getMonth(), d.getDate());
  const todayKey = () => keyOf(new Date());
  const shift = (k, days) => { const d = dateFromKey(k); d.setDate(d.getDate() + days); return keyOf(d); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = (s) => String(s || '').trim().toLowerCase();

  // ---- state ----
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.habits) && s.checks) { s.name ||= ''; s.bio ||= ''; s.posts ||= []; return s; }
    } catch (_) {}
    return { name: '', bio: '', habits: [{ id: uid(), name: 'Gym' }, { id: uid(), name: 'Sober' }], checks: {}, posts: [] };
  }
  // Two copies: localStorage (fast, synchronous) and IndexedDB (separate store).
  // Code updates never touch either. If localStorage ever comes back empty, the IndexedDB copy restores it.
  function save() {
    const json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
    photos.tx('meta', 'readwrite', (s) => s.put(json, 'state')).catch(() => {});
  }
  async function restoreIfEmpty() {
    if (localStorage.getItem(KEY)) return;
    try {
      const json = await photos.tx('meta', 'readonly', (s) => s.get('state'));
      if (!json) return;
      const s = JSON.parse(json);
      if (!s || !Array.isArray(s.habits)) return;
      s.name ||= ''; s.bio ||= ''; s.posts ||= [];
      state = s; localStorage.setItem(KEY, json);
      render(); scrollToToday(false);
    } catch (_) {}
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const habitById = (id) => state.habits.find((x) => x.id === id);

  const isDone = (hid, k) => !!(state.checks[k] && state.checks[k][hid]);
  function setDone(hid, k, on) {
    if (on) { (state.checks[k] ||= {})[hid] = true; }
    else if (state.checks[k]) { delete state.checks[k][hid]; if (!Object.keys(state.checks[k]).length) delete state.checks[k]; }
    save();
  }

  // ---- photo store (IndexedDB; localStorage is too small for images) ----
  const photos = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('summit', 2);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async tx(store, mode, fn) {
      const d = await this.open();
      return new Promise((res, rej) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    },
    put(k, v) { return this.tx('photos', 'readwrite', (s) => s.put(v, k)); },
    get(k) { return this.tx('photos', 'readonly', (s) => s.get(k)); },
    del(k) { return this.tx('photos', 'readwrite', (s) => s.delete(k)); },
  };
  const urlCache = new Map();
  async function photoUrl(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = await photos.get(id).catch(() => null);
    const url = blob ? URL.createObjectURL(blob) : null;
    urlCache.set(id, url);
    return url;
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  async function compressPhoto(file, max = 1440) {
    const src = URL.createObjectURL(file);
    try {
      const img = await loadImage(src);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    } finally { URL.revokeObjectURL(src); }
  }

  // ---- stats ----
  function streakAt(hid, endKey) {
    let k = endKey;
    if (!isDone(hid, k)) k = shift(k, -1);
    let n = 0;
    while (isDone(hid, k)) { n++; k = shift(k, -1); }
    return n;
  }
  const currentStreak = (hid) => streakAt(hid, todayKey());
  function bestStreak(hid) {
    const days = Object.keys(state.checks).filter((k) => state.checks[k][hid]).sort();
    let best = 0, run = 0, prev = null;
    for (const k of days) {
      run = prev && shift(prev, 1) === k ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    }
    return best;
  }
  function monthCount(hid, y, m) {
    let n = 0;
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) if (isDone(hid, key(y, m, d))) n++;
    return n;
  }
  const totalCount = (hid) => Object.keys(state.checks).filter((k) => state.checks[k][hid]).length;
  const activeDays = () => Object.keys(state.checks).filter((k) => Object.keys(state.checks[k]).length).length;
  function activeDaysSince(days) {
    const from = shift(todayKey(), -days);
    return Object.keys(state.checks).filter((k) => k >= from && Object.keys(state.checks[k]).length).length;
  }
  function weekKeys() {
    const t = new Date();
    const dow = (t.getDay() + 6) % 7; // Mon = 0
    const mon = new Date(t); mon.setDate(t.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return keyOf(d); });
  }

  // ---- navigation ----
  let screen = 'home';
  function go(name) {
    if (name === 'new') { openPost(); return; }
    screen = name;
    document.body.dataset.screen = name;
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === 'screen-' + name);
    for (const b of document.querySelectorAll('.tabbar [data-tab]')) b.classList.toggle('on', b.dataset.tab === name);
    if (name === 'feed') renderFeed();
    if (name === 'profile') renderProfile();
    window.scrollTo({ top: 0 });
  }
  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) go(b.dataset.tab);
  });

  // ---- home ----
  const now = new Date();
  let view = { y: now.getFullYear(), m: now.getMonth() };

  function renderTop() {
    const n = (state.name || '').trim();
    const initial = n ? n[0].toUpperCase() : 'S';
    $('avatarBtn').textContent = initial;
    $('profileAvatar').textContent = initial;
    const streaks = state.habits.map((h) => currentStreak(h.id));
    const top = Math.max(0, ...streaks);
    const who = n ? `, ${esc(n)}` : '';
    let line;
    if (!state.habits.length) line = `Start with one line${who}.<br>Keep it every day.`;
    else if (top >= 14) line = `${top} days deep${who}.<br>Don't blink now.`;
    else if (top >= 5) line = `Momentum is real${who}.<br>Keep the chain.`;
    else line = `Progress is power${who}.<br>Let's lock in.`;
    $('hero').innerHTML = line;
  }

  function renderCards() {
    const wk = weekKeys();
    const tk = todayKey();
    let html = '';
    for (const h of state.habits) {
      const done = wk.filter((k) => isDone(h.id, k)).length;
      const s = currentStreak(h.id);
      const segs = wk.map((k) => `<i class="${isDone(h.id, k) ? 'on' : k > tk ? 'future' : ''}"></i>`).join('');
      html += `<button class="card" data-card="${h.id}">
        <span class="label">${esc(h.name) || 'Untitled'}</span>
        <div class="segs">${segs}</div>
        <div class="meta"><span><b>${done}</b> / 7 this week</span><span class="streak-tag">${s ? '&#9650; ' + s + ' streak' : 'no streak'}</span></div>
      </button>`;
    }
    html += '<button class="card add-card" id="addCard">+ New line</button>';
    $('cards').innerHTML = html;
  }

  function renderGrid() {
    $('monthName').textContent = MONTHS[view.m];
    $('yearName').textContent = view.y;
    const wrap = $('gridWrap');
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const tk = todayKey();

    if (!state.habits.length) {
      wrap.innerHTML = '<div class="empty">Nothing here yet. Add a line below.</div>';
      return;
    }
    if (!$('grid')) wrap.innerHTML = '<table class="grid" id="grid" aria-label="Habit grid"></table>';

    let head = '<thead><tr><th class="name">' + MONTHS_S[view.m] + '</th>';
    for (let d = 1; d <= days; d++) {
      const k = key(view.y, view.m, d);
      const dow = new Date(view.y, view.m, d).getDay();
      const cls = ['day', (dow === 0 || dow === 6) && 'weekend', k === tk && 'today'].filter(Boolean).join(' ');
      head += `<th class="${cls}">${d}<small>${WD[dow]}</small></th>`;
    }
    head += '<th class="streak">Streak</th><th class="total">Done</th></tr></thead>';

    let body = '<tbody>';
    for (const h of state.habits) {
      body += `<tr data-row="${h.id}"><th class="name"><button data-edit="${h.id}">${esc(h.name) || 'Untitled'}</button></th>`;
      for (let d = 1; d <= days; d++) {
        const k = key(view.y, view.m, d);
        const on = isDone(h.id, k);
        const future = k > tk;
        body += `<td class="${k === tk ? 'today' : ''}"><button class="cell${future ? ' future' : ''}" data-h="${h.id}" data-k="${k}" aria-pressed="${on}" aria-label="${esc(h.name)} ${d}"><span class="dot">${CHECK}</span></button></td>`;
      }
      const s = currentStreak(h.id);
      body += `<td class="streak${s ? '' : ' zero'}">${s ? '<span class="flame">&#9650;</span>' : ''}${s}</td>`;
      body += `<td class="total">${monthCount(h.id, view.y, view.m)}</td></tr>`;
    }
    body += '</tbody>';
    $('grid').innerHTML = head + body;
  }

  function render() {
    renderTop(); renderCards(); renderGrid();
    if (screen === 'feed') renderFeed();
    if (screen === 'profile') renderProfile();
  }

  function refreshRow(hid) {
    const row = document.querySelector(`tr[data-row="${hid}"]`);
    if (!row) return;
    const s = currentStreak(hid);
    const sc = row.querySelector('.streak');
    sc.className = 'streak' + (s ? '' : ' zero');
    sc.innerHTML = (s ? '<span class="flame">&#9650;</span>' : '') + s;
    row.querySelector('.total').textContent = monthCount(hid, view.y, view.m);
  }

  function scrollToToday(smooth) {
    const th = document.querySelector('th.day.today');
    const wrap = $('gridWrap');
    if (!th) { wrap.scrollTo({ left: 0, behavior: smooth ? 'smooth' : 'auto' }); return; }
    const nameW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--name-w'));
    const target = th.offsetLeft - nameW - (wrap.clientWidth - nameW) / 2 + th.offsetWidth / 2;
    wrap.scrollTo({ left: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
  }

  $('gridWrap').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (cell) {
      const on = cell.getAttribute('aria-pressed') !== 'true';
      setDone(cell.dataset.h, cell.dataset.k, on);
      cell.setAttribute('aria-pressed', on);
      if (navigator.vibrate) navigator.vibrate(8);
      refreshRow(cell.dataset.h);
      renderCards(); renderTop();
      return;
    }
    const edit = e.target.closest('[data-edit]');
    if (edit) openSheet(edit.dataset.edit);
  });
  $('cards').addEventListener('click', (e) => {
    if (e.target.closest('#addCard')) { addHabit(); return; }
    const c = e.target.closest('[data-card]');
    if (c) openSheet(c.dataset.card);
  });

  $('prev').onclick = () => { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderGrid(); scrollToToday(false); };
  $('next').onclick = () => { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderGrid(); scrollToToday(false); };
  $('todayBtn').onclick = () => {
    const t = new Date();
    const same = view.y === t.getFullYear() && view.m === t.getMonth();
    view = { y: t.getFullYear(), m: t.getMonth() };
    if (!same) renderGrid();
    $('gridWrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    scrollToToday(true);
  };

  function addHabit() {
    const h = { id: uid(), name: '' };
    state.habits.push(h);
    save();
    render();
    openSheet(h.id, true);
  }
  $('addHabit').onclick = addHabit;

  // ---- sheets (generic) ----
  const SHEETS = ['sheet', 'menu', 'checkin', 'share', 'post'];
  function showSheet(id) { $('scrim').hidden = false; $(id).hidden = false; }
  function hideSheets() { $('scrim').hidden = true; for (const id of SHEETS) $(id).hidden = true; }

  // ---- habit sheet ----
  let editing = null;
  function openSheet(hid, isNew) {
    editing = hid;
    const h = habitById(hid);
    if (!h) return;
    $('habitName').value = h.name;
    $('habitName').placeholder = isNew ? 'e.g. Run, Lift, Hoop, Swim' : '';
    $('statStreak').textContent = currentStreak(hid);
    $('statBest').textContent = bestStreak(hid);
    $('statMonth').textContent = monthCount(hid, view.y, view.m);
    $('statTotal').textContent = totalCount(hid);
    const i = state.habits.indexOf(h);
    $('moveUp').disabled = i === 0;
    $('moveDown').disabled = i === state.habits.length - 1;
    showSheet('sheet');
    setTimeout(() => { $('habitName').focus(); if (!isNew) $('habitName').select(); }, 30);
  }
  function commitName() {
    const h = habitById(editing);
    if (!h) return;
    const name = $('habitName').value.trim();
    if (!name) { if (!h.name) state.habits = state.habits.filter((x) => x.id !== editing); }
    else h.name = name;
    save();
  }
  function closeSheet() { commitName(); editing = null; hideSheets(); render(); }
  $('doneHabit').onclick = closeSheet;
  $('habitName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeSheet(); } });
  $('deleteHabit').onclick = () => {
    const h = habitById(editing);
    if (!h) return;
    const n = totalCount(h.id);
    if (h.name && n && !confirm(`Delete "${h.name}" and its ${n} marks?`)) return;
    state.habits = state.habits.filter((x) => x.id !== editing);
    for (const k of Object.keys(state.checks)) { delete state.checks[k][h.id]; if (!Object.keys(state.checks[k]).length) delete state.checks[k]; }
    for (const p of state.posts) p.habits = p.habits.filter((id) => id !== h.id);
    save();
    editing = null;
    hideSheets();
    render();
  };
  function move(dir) {
    const i = state.habits.findIndex((x) => x.id === editing);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.habits.length) return;
    [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
    save();
    $('moveUp').disabled = j === 0;
    $('moveDown').disabled = j === state.habits.length - 1;
    render();
  }
  $('moveUp').onclick = () => move(-1);
  $('moveDown').onclick = () => move(1);

  // ---- check-in sheet ----
  function openCheckin() {
    const t = new Date();
    $('checkinDate').textContent = `${WD_L[t.getDay()]}, ${MONTHS_S[t.getMonth()]} ${t.getDate()}`;
    renderChecklist();
    showSheet('checkin');
  }
  function renderChecklist() {
    const tk = todayKey();
    if (!state.habits.length) { $('checklist').innerHTML = '<div class="empty">Add a line first.</div>'; return; }
    $('checklist').innerHTML = state.habits.map((h) => {
      const s = currentStreak(h.id);
      const on = isDone(h.id, tk);
      return `<button class="check-row" data-ci="${h.id}" aria-pressed="${on}"><span>${esc(h.name) || 'Untitled'}<small>${s ? `${s} day streak` : 'Start a streak'}</small></span><span class="tick">${CHECK}</span></button>`;
    }).join('');
  }
  $('checklist').addEventListener('click', (e) => {
    const row = e.target.closest('[data-ci]');
    if (!row) return;
    const on = row.getAttribute('aria-pressed') !== 'true';
    setDone(row.dataset.ci, todayKey(), on);
    if (navigator.vibrate) navigator.vibrate(8);
    renderChecklist();
  });
  $('checkinBtn').onclick = openCheckin;
  $('closeCheckin').onclick = () => { hideSheets(); render(); scrollToToday(false); };

  // ---- profile edit / settings ----
  function openMenu() { $('userName').value = state.name || ''; $('userBio').value = state.bio || ''; showSheet('menu'); }
  function closeMenu() {
    state.name = $('userName').value.trim();
    state.bio = $('userBio').value.trim();
    save(); hideSheets(); renderTop();
    if (screen === 'profile') renderProfile();
  }
  $('avatarBtn').onclick = () => go('profile');
  $('editProfile').onclick = openMenu;
  $('profileMenu').onclick = openMenu;
  $('closeMenu').onclick = closeMenu;
  for (const id of ['userName', 'userBio']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeMenu(); } });
  $('scrim').onclick = () => {
    if (!$('sheet').hidden) closeSheet();
    else if (!$('menu').hidden) closeMenu();
    else if (!$('post').hidden) closePost();
    else { hideSheets(); render(); }
  };

  $('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `summit-${todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!Array.isArray(s.habits) || typeof s.checks !== 'object') throw new Error('bad');
      if (!confirm('Replace everything on this device with the imported log?')) return;
      s.name ||= ''; s.bio ||= ''; s.posts ||= [];
      state = s; save(); hideSheets(); render(); scrollToToday(false);
    } catch (_) { alert('That file is not a Summit export.'); }
    e.target.value = '';
  };

  // ---- sessions (posts) ----
  let draft = null; // { blob, url, habits:Set }
  function openPost() {
    const t = new Date();
    draft = { blob: null, url: null, habits: new Set(state.habits.filter((h) => isDone(h.id, todayKey())).map((h) => h.id)) };
    $('postDate').textContent = `${WD_L[t.getDay()]}, ${MONTHS_S[t.getMonth()]} ${t.getDate()}`;
    $('postCaption').value = '';
    $('photoPreview').hidden = true; $('photoPreview').src = '';
    $('photoHint').hidden = false;
    renderChips();
    showSheet('post');
  }
  function renderChips() {
    $('postChips').innerHTML = state.habits.length
      ? state.habits.map((h) => `<button class="chip${draft.habits.has(h.id) ? ' on' : ''}" data-chip="${h.id}">${esc(h.name) || 'Untitled'}</button>`).join('')
      : '<span class="muted">Add a line on Home first.</span>';
  }
  $('postChips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-chip]');
    if (!c) return;
    const id = c.dataset.chip;
    if (draft.habits.has(id)) draft.habits.delete(id); else draft.habits.add(id);
    c.classList.toggle('on', draft.habits.has(id));
  });
  $('photoPick').onclick = () => $('photoFile').click();
  $('photoFile').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('photoHint').textContent = 'Loading…';
    try {
      draft.blob = await compressPhoto(f);
      if (draft.url) URL.revokeObjectURL(draft.url);
      draft.url = URL.createObjectURL(draft.blob);
      $('photoPreview').src = draft.url; $('photoPreview').hidden = false;
      $('photoHint').hidden = true;
    } catch (_) { $('photoHint').textContent = 'Could not read that photo'; }
  };
  function closePost() { if (draft && draft.url) URL.revokeObjectURL(draft.url); draft = null; hideSheets(); }
  $('closePost').onclick = closePost;
  $('savePost').onclick = async () => {
    if (!draft) return;
    if (!draft.blob && !draft.habits.size) { alert('Add a photo or pick what you did.'); return; }
    const id = uid();
    const tk = todayKey();
    const habits = [...draft.habits];
    for (const hid of habits) setDone(hid, tk, true);     // posting a session marks the day
    const post = { id, ts: Date.now(), day: tk, caption: $('postCaption').value.trim(), habits, photo: null,
      streaks: Object.fromEntries(habits.map((hid) => [hid, streakAt(hid, tk)])) };
    if (draft.blob) { try { await photos.put(id, draft.blob); post.photo = id; } catch (_) {} }
    state.posts.unshift(post);
    save();
    closePost();
    go('feed');
    render();
  };

  // ---- feed ranking ----
  // Scores a session for a viewer the way an athlete-first feed should: what you train,
  // how hard the streak was, how consistent the author is, and how fresh it is.
  // No likes, no follower counts. Works on your own sessions now and on everyone's later.
  function rankScore(post, viewer) {
    const hours = (Date.now() - post.ts) / 36e5;
    const recency = Math.pow(0.5, hours / 36);                       // half-life 36h
    const viewerSports = new Set(viewer.habits.map((h) => norm(h.name)));
    const postSports = post.habits.map((id) => norm((habitById(id) || {}).name));
    const affinity = postSports.length ? postSports.filter((s) => viewerSports.has(s)).length / postSports.length : 0;
    const topStreak = Math.max(0, ...Object.values(post.streaks || {}));
    const effort = Math.log1p(topStreak) / Math.log1p(30);          // 30-day streak ≈ 1.0
    const consistency = Math.min(1, activeDaysSince(30) / 20);       // author: 20 of last 30 days ≈ 1.0
    const media = post.photo ? 0.15 : 0;
    const score = recency * (1 + 0.6 * affinity + 0.5 * effort + 0.3 * consistency + media);
    const why = topStreak >= 7 ? `${topStreak}-day streak` : affinity ? 'What you train' : consistency >= 0.75 ? 'Consistent' : 'New';
    return { score, why };
  }
  function rankFeed(posts, viewer) {
    return posts.map((p) => ({ p, ...rankScore(p, viewer) })).sort((a, b) => b.score - a.score);
  }

  let feedMode = 'foryou';
  function timeAgo(ts) {
    const m = Math.round((Date.now() - ts) / 6e4);
    if (m < 1) return 'now'; if (m < 60) return `${m}m`;
    const h = Math.round(m / 60); if (h < 24) return `${h}h`;
    const d = Math.round(h / 24); if (d < 7) return `${d}d`;
    const dt = new Date(ts); return `${MONTHS_S[dt.getMonth()]} ${dt.getDate()}`;
  }
  // ---- stories row ----
  function renderStories() {
    const initial = ((state.name || '').trim()[0] || 'S').toUpperCase();
    let html = `<button class="story" data-story="new"><span class="ring plain"><span class="av">${initial}</span><i class="plus">+</i></span><span>Your story</span></button>`;
    for (const h of state.habits) {
      const s = currentStreak(h.id);
      html += `<button class="story" data-story="${h.id}"><span class="ring${s ? '' : ' dim'}"><span class="av">${s}</span></span><span>${esc(h.name) || 'Untitled'}</span></button>`;
    }
    html += `<button class="story" data-story="all"><span class="ring"><span class="av" style="font-size:13px">${MONTHS_S[new Date().getMonth()].toUpperCase()}</span></span><span>Month</span></button>`;
    $('stories').innerHTML = html;
  }
  $('stories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-story]');
    if (!b) return;
    if (b.dataset.story === 'new') openPost(); else openStory(b.dataset.story);
  });

  // ---- full-screen story viewer ----
  let svItems = [], svIndex = 0, svTimer = null;
  function openStory(startId) {
    svItems = [...state.habits.map((h) => h.id), 'all'];
    svIndex = Math.max(0, svItems.indexOf(startId));
    $('svAvatar').textContent = ((state.name || '').trim()[0] || 'S').toUpperCase();
    $('svName').textContent = (state.name || '').trim() || 'Summit';
    $('storyView').hidden = false;
    showStoryItem();
  }
  function showStoryItem() {
    clearTimeout(svTimer);
    const id = svItems[svIndex];
    shareTarget = id; shareStyle = 'card';
    drawCard();
    $('svImg').src = $('shareCanvas').toDataURL('image/png');
    $('svSub').textContent = id === 'all' ? MONTHS[new Date().getMonth()] : (habitById(id) || {}).name || '';
    $('svBars').innerHTML = svItems.map((_, i) => `<i class="${i < svIndex ? 'done' : i === svIndex ? 'live' : ''}"></i>`).join('');
    svTimer = setTimeout(nextStory, 6000);
  }
  function nextStory() { if (svIndex < svItems.length - 1) { svIndex++; showStoryItem(); } else closeStory(); }
  function prevStory() { if (svIndex > 0) svIndex--; showStoryItem(); }
  function closeStory() { clearTimeout(svTimer); $('storyView').hidden = true; }
  $('svNext').onclick = nextStory;
  $('svPrev').onclick = prevStory;
  $('svClose').onclick = closeStory;
  $('svShare').onclick = () => { clearTimeout(svTimer); $('shareBtn').onclick(); };
  document.addEventListener('keydown', (e) => {
    if ($('storyView').hidden) return;
    if (e.key === 'Escape') closeStory();
    if (e.key === 'ArrowRight') nextStory();
    if (e.key === 'ArrowLeft') prevStory();
  });

  async function renderFeed() {
    renderStories();
    const el = $('feedList');
    const name = (state.name || '').trim() || 'You';
    const initial = name[0].toUpperCase();
    if (!state.posts.length) {
      el.innerHTML = `<div class="empty-state">No sessions yet.<br>Post one and it shows up here with your stats stamped on it.<br><button class="primary" id="emptyNew">New session</button></div>`;
      $('emptyNew').onclick = openPost;
      return;
    }
    const ranked = feedMode === 'foryou' ? rankFeed(state.posts, state) : state.posts.map((p) => ({ p, why: '' }));
    let html = `<div class="feed-toggle"><button data-mode="foryou" class="${feedMode === 'foryou' ? 'on' : ''}">For you</button><button data-mode="latest" class="${feedMode === 'latest' ? 'on' : ''}">Latest</button></div>`;
    for (const { p, why } of ranked) {
      const lines = p.habits.map((id) => habitById(id)).filter(Boolean);
      const top = Math.max(0, ...Object.values(p.streaks || {}));
      const stamp = lines.length ? `<div class="stamp"><span class="sm">${MARK} Summit</span>${lines.map((h) => `<span class="row">${esc(h.name)}<em>&#9650; ${p.streaks[h.id] || 0}</em></span>`).join('')}</div>` : '';
      const media = p.photo
        ? `<div class="post-media"><img data-photo="${p.photo}" alt="">${stamp}</div>`
        : `<div class="post-media nophoto"><div class="bigstat"><b>${top}</b><span>day streak</span></div>${stamp}</div>`;
      html += `<article class="post" id="post-${p.id}">
        <div class="post-head"><span class="avatar">${initial}</span><div class="who"><b>${esc(name)}</b><small>${lines.map((h) => esc(h.name)).join(' · ') || 'Session'}</small></div><time>${timeAgo(p.ts)}</time><button class="more" data-more="${p.id}" aria-label="More">&middot;&middot;&middot;</button></div>
        ${media}
        <div class="post-actions"><button data-sharepost="${p.id}">${SHARE_ICON} Share to story</button><span class="spacer"></span>${why ? `<span class="why">${esc(why)}</span>` : ''}</div>
        ${p.caption ? `<p class="caption"><b>${esc(name)}</b>${esc(p.caption)}</p>` : ''}
      </article>`;
    }
    el.innerHTML = html;
    for (const img of el.querySelectorAll('img[data-photo]')) photoUrl(img.dataset.photo).then((u) => { if (u) img.src = u; });
  }
  $('feedList').addEventListener('click', async (e) => {
    const mode = e.target.closest('[data-mode]');
    if (mode) { feedMode = mode.dataset.mode; renderFeed(); return; }
    const more = e.target.closest('[data-more]');
    if (more) {
      if (!confirm('Delete this session? Your day marks stay.')) return;
      const p = state.posts.find((x) => x.id === more.dataset.more);
      if (p && p.photo) photos.del(p.photo).catch(() => {});
      state.posts = state.posts.filter((x) => x.id !== more.dataset.more);
      save(); renderFeed();
      return;
    }
    const sp = e.target.closest('[data-sharepost]');
    if (sp) sharePost(sp.dataset.sharepost);
  });
  $('feedNew').onclick = openPost;

  // Stamp the stats onto the photo (or a card if there is none) and hand it to the share sheet.
  async function sharePost(id) {
    const p = state.posts.find((x) => x.id === id);
    if (!p) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    if (p.photo) {
      const url = await photoUrl(p.photo);
      const img = await loadImage(url);
      c.width = img.width; c.height = img.height;
      ctx.drawImage(img, 0, 0);
    } else {
      c.width = 1080; c.height = 1350;
      const g = ctx.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, '#121212'); g.addColorStop(1, '#2a1708');
      ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    }
    const u = c.width / 1080; // scale units to the image
    const lines = p.habits.map((hid) => habitById(hid)).filter(Boolean);
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 24 * u; ctx.shadowOffsetY = 4 * u;
    const pad = 56 * u, rowH = 64 * u;
    const boxW = 420 * u, boxH = (60 + lines.length * 64 + 24) * u;
    const x = pad, y = c.height - pad - boxH;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, 24 * u); ctx.fill(); ctx.restore();
    mark(ctx, x + 26 * u, y + 18 * u, 40 * u);
    txt(ctx, 'SUMMIT', x + 76 * u, y + 50 * u, { size: 24 * u, weight: 800, align: 'left', spacing: 6 * u, alpha: 0.85 });
    lines.forEach((h, i) => {
      const ly = y + (108 + i * 64) * u;
      txt(ctx, h.name, x + 26 * u, ly, { size: 36 * u, weight: 700, align: 'left' });
      txt(ctx, `▲ ${p.streaks[h.id] || 0}`, x + boxW - 26 * u, ly, { size: 32 * u, weight: 800, align: 'right', color: '#f3bd6a' });
    });
    if (!lines.length) txt(ctx, 'Session', x + 26 * u, y + 108 * u, { size: 36 * u, weight: 700, align: 'left' });
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const file = new File([blob], `summit-${p.day}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Summit' }).catch(() => {}); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- profile ----
  function renderProfile() {
    const name = (state.name || '').trim();
    $('profileHandle').textContent = name || 'Summit';
    $('profileBio').textContent = state.bio || '';
    $('cSessions').textContent = state.posts.length;
    $('cDays').textContent = activeDays();
    $('cBest').textContent = Math.max(0, ...state.habits.map((h) => bestStreak(h.id)));
    $('highlights').innerHTML = state.habits.map((h) => {
      const s = currentStreak(h.id);
      return `<button class="hl" data-hl="${h.id}"><span class="ring${s >= 3 ? ' hot' : ''}">${s}</span><span>${esc(h.name) || 'Untitled'}</span></button>`;
    }).join('');
    const g = $('pgrid');
    if (!state.posts.length) { g.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Your sessions will show up here.</div>'; return; }
    g.innerHTML = state.posts.map((p) => {
      const top = Math.max(0, ...Object.values(p.streaks || {}));
      return `<button data-open="${p.id}">${p.photo ? `<img data-photo="${p.photo}" alt="">` : `<div class="tile-stat">${top}<small>streak</small></div>`}</button>`;
    }).join('');
    for (const img of g.querySelectorAll('img[data-photo]')) photoUrl(img.dataset.photo).then((u) => { if (u) img.src = u; });
  }
  $('highlights').addEventListener('click', (e) => { const b = e.target.closest('[data-hl]'); if (b) openSheet(b.dataset.hl); });
  $('pgrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    feedMode = 'latest';
    go('feed');
    setTimeout(() => { const el = $('post-' + b.dataset.open); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 50);
  });
  $('profileShare').onclick = () => openShare('all');

  // ---- share to story (1080x1920 PNG) ----
  const F = 'system-ui, -apple-system, "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  const W = 1080, H = 1920;
  let shareTarget = null, shareStyle = 'sticker', shareFile = null, shareBlob = null;

  function mark(ctx, x, y, size) {
    const pts = [[96, 352], [224, 176], [288, 264], [336, 208], [416, 352]].map(([px, py]) => [x + px / 512 * size, y + py / 512 * size]);
    ctx.save();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = size * 18 / 512; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
    ctx.fillStyle = '#e39a3a'; ctx.beginPath(); ctx.arc(pts[1][0], pts[1][1], size * 16 / 512, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function txt(ctx, s, x, y, o = {}) {
    const { size = 40, weight = 600, color = '#fff', align = 'center', spacing = 0, alpha = 1 } = o;
    ctx.save();
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.font = `${weight} ${size}px ${F}`;
    try { ctx.letterSpacing = spacing + 'px'; } catch (_) {}
    ctx.fillText(s, x, y);
    ctx.restore();
  }
  function bar(ctx, x, y, keys, hid, w, gap, h) {
    const tk = todayKey();
    for (const k of keys) {
      const on = isDone(hid, k);
      ctx.save();
      ctx.globalAlpha = on ? 1 : k > tk ? 0.18 : 0.32;
      ctx.fillStyle = on ? '#f3bd6a' : '#fff';
      ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
      ctx.restore();
      x += w + gap;
    }
  }
  function wordmark(ctx, y) {
    const x0 = W / 2 - 150;
    mark(ctx, x0, y - 54, 76);
    txt(ctx, 'SUMMIT', x0 + 98, y, { size: 44, weight: 800, align: 'left', spacing: 12 });
  }
  function dateLine() {
    const t = new Date();
    return `${MONTHS_S[t.getMonth()].toUpperCase()} ${t.getDate()}, ${t.getFullYear()}`;
  }

  function drawCard() {
    const c = $('shareCanvas');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    if (shareStyle === 'card') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070707'); g.addColorStop(0.55, '#110b06'); g.addColorStop(1, '#8a4613');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const r = ctx.createRadialGradient(W * 0.2, -80, 40, W * 0.2, -80, 950);
      r.addColorStop(0, 'rgba(222,150,52,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
    }
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 6;
    const cx = W / 2, wk = weekKeys();

    if (shareTarget === 'all') {
      wordmark(ctx, 430);
      const t = new Date();
      const prefix = key(t.getFullYear(), t.getMonth(), 1).slice(0, 7);
      const active = Object.keys(state.checks).filter((k) => k.startsWith(prefix) && Object.keys(state.checks[k]).length).length;
      txt(ctx, String(active), cx, 740, { size: 230, weight: 800, spacing: -8 });
      txt(ctx, `DAYS ACTIVE IN ${MONTHS[t.getMonth()].toUpperCase()}`, cx, 815, { size: 34, weight: 700, spacing: 8, alpha: 0.75 });
      const rows = state.habits.slice(0, 6);
      let y = 960;
      for (const h of rows) {
        const s = currentStreak(h.id);
        txt(ctx, h.name || 'Untitled', 180, y, { size: 54, weight: 700, align: 'left' });
        txt(ctx, s ? `▲ ${s}` : '—', 900, y, { size: 54, weight: 800, align: 'right', color: s ? '#f3bd6a' : '#fff', alpha: s ? 1 : 0.4 });
        bar(ctx, 180, y + 30, wk, h.id, 86, 12, 12);
        y += 160;
      }
      if (state.habits.length > 6) { txt(ctx, `+${state.habits.length - 6} more`, 180, y, { size: 36, align: 'left', alpha: 0.6 }); y += 60; }
      txt(ctx, dateLine(), cx, y + 50, { size: 30, weight: 600, spacing: 6, alpha: 0.5 });
    } else {
      const h = habitById(shareTarget);
      if (!h) return;
      const s = currentStreak(h.id);
      const t = new Date();
      wordmark(ctx, 540);
      txt(ctx, (h.name || 'Untitled').toUpperCase(), cx, 700, { size: 46, weight: 700, spacing: 10, alpha: 0.8 });
      txt(ctx, String(s), cx, 980, { size: 320, weight: 800, spacing: -12 });
      txt(ctx, 'DAY STREAK', cx, 1050, { size: 40, weight: 700, spacing: 10, alpha: 0.8 });
      bar(ctx, cx - (7 * 96 + 6 * 14) / 2, 1120, wk, h.id, 96, 14, 14);
      const cols = [
        ['THIS WEEK', `${wk.filter((k) => isDone(h.id, k)).length}/7`],
        ['THIS MONTH', String(monthCount(h.id, t.getFullYear(), t.getMonth()))],
        ['BEST', String(bestStreak(h.id))],
      ];
      cols.forEach(([label, val], i) => {
        const x = cx + (i - 1) * 300;
        txt(ctx, label, x, 1250, { size: 28, weight: 700, spacing: 6, alpha: 0.6 });
        txt(ctx, val, x, 1335, { size: 78, weight: 800 });
      });
      txt(ctx, dateLine(), cx, 1440, { size: 30, weight: 600, spacing: 6, alpha: 0.5 });
    }

    shareFile = null; shareBlob = null;
    $('shareBtn').disabled = true;
    c.toBlob((b) => {
      shareBlob = b;
      shareFile = new File([b], `summit-${todayKey()}.png`, { type: 'image/png' });
      $('shareBtn').disabled = false;
    }, 'image/png');
  }

  function openShare(target) {
    shareTarget = target;
    const h = habitById(target);
    $('shareTitle').textContent = target === 'all' ? MONTHS[new Date().getMonth()] : (h && h.name) || 'Summit';
    setStyle(shareStyle);
    showSheet('share');
  }
  function setStyle(s) {
    shareStyle = s;
    $('styleSticker').classList.toggle('on', s === 'sticker');
    $('styleCard').classList.toggle('on', s === 'card');
    $('shareHint').textContent = s === 'sticker'
      ? 'Clear background. Save it, then in Instagram drop it on your photo as a sticker.'
      : 'Full story card. Share it straight to Instagram or save it.';
    drawCard();
  }
  $('styleSticker').onclick = () => setStyle('sticker');
  $('styleCard').onclick = () => setStyle('card');
  $('shareHabit').onclick = () => { commitName(); const id = editing; editing = null; hideSheets(); render(); openShare(id); };
  $('closeShare').onclick = () => hideSheets();
  $('shareBtn').onclick = () => {
    if (!shareFile) return;
    if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
      navigator.share({ files: [shareFile], title: 'Summit' }).catch(() => {});
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(shareBlob);
    a.download = shareFile.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // keep "today" honest if the app is left open past midnight
  let lastDay = todayKey();
  const tick = () => { if (todayKey() !== lastDay) { lastDay = todayKey(); render(); } };
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  render();
  scrollToToday(false);
  restoreIfEmpty();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
