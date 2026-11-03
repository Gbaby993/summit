(() => {
  const KEY = 'summit.v1';
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WD = ['S','M','T','W','T','F','S'];
  const WD_L = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

  const $ = (id) => document.getElementById(id);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const key = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const dateFromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const keyOf = (d) => key(d.getFullYear(), d.getMonth(), d.getDate());
  const todayKey = () => keyOf(new Date());
  const shift = (k, days) => { const d = dateFromKey(k); d.setDate(d.getDate() + days); return keyOf(d); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- state ----
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.habits) && s.checks) { s.name ||= ''; return s; }
    } catch (_) {}
    return { name: '', habits: [{ id: uid(), name: 'Gym' }, { id: uid(), name: 'Sober' }], checks: {} };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

  const isDone = (hid, k) => !!(state.checks[k] && state.checks[k][hid]);
  function setDone(hid, k, on) {
    if (on) { (state.checks[k] ||= {})[hid] = true; }
    else if (state.checks[k]) { delete state.checks[k][hid]; if (!Object.keys(state.checks[k]).length) delete state.checks[k]; }
    save();
  }

  // ---- stats ----
  function currentStreak(hid) {
    let k = todayKey();
    if (!isDone(hid, k)) k = shift(k, -1);          // today still open; count from yesterday
    let n = 0;
    while (isDone(hid, k)) { n++; k = shift(k, -1); }
    return n;
  }
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

  // Monday-start week containing today
  function weekKeys() {
    const t = new Date();
    const dow = (t.getDay() + 6) % 7; // Mon = 0
    const mon = new Date(t); mon.setDate(t.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return keyOf(d); });
  }

  // ---- view ----
  const now = new Date();
  let view = { y: now.getFullYear(), m: now.getMonth() };

  function renderTop() {
    const n = (state.name || '').trim();
    $('avatarBtn').textContent = n ? n[0].toUpperCase() : 'S';
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

  function render() { renderTop(); renderCards(); renderGrid(); }

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

  // ---- grid interactions ----
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
  function showSheet(id) { $('scrim').hidden = false; $(id).hidden = false; }
  function hideSheets() { $('scrim').hidden = true; for (const id of ['sheet', 'menu', 'checkin', 'share']) $(id).hidden = true; }

  // ---- habit sheet ----
  let editing = null;
  function openSheet(hid, isNew) {
    editing = hid;
    const h = state.habits.find((x) => x.id === hid);
    if (!h) return;
    $('habitName').value = h.name;
    $('habitName').placeholder = isNew ? 'e.g. Run, Read, No sugar' : '';
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
    const h = state.habits.find((x) => x.id === editing);
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
    const h = state.habits.find((x) => x.id === editing);
    if (!h) return;
    const n = totalCount(h.id);
    if (h.name && n && !confirm(`Delete "${h.name}" and its ${n} marks?`)) return;
    state.habits = state.habits.filter((x) => x.id !== editing);
    for (const k of Object.keys(state.checks)) { delete state.checks[k][h.id]; if (!Object.keys(state.checks[k]).length) delete state.checks[k]; }
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

  // ---- profile / settings ----
  $('avatarBtn').onclick = () => { $('userName').value = state.name || ''; showSheet('menu'); };
  function closeMenu() { state.name = $('userName').value.trim(); save(); hideSheets(); renderTop(); }
  $('closeMenu').onclick = closeMenu;
  $('userName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); closeMenu(); } });
  $('scrim').onclick = () => {
    if (!$('sheet').hidden) closeSheet();
    else if (!$('menu').hidden) closeMenu();
    else { hideSheets(); render(); }
  };

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
      const active = new Set(Object.keys(state.checks).filter((k) => k.startsWith(key(t.getFullYear(), t.getMonth(), 1).slice(0, 7)) && Object.keys(state.checks[k]).length)).size;
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
      if (state.habits.length > 6) txt(ctx, `+${state.habits.length - 6} more`, 180, y, { size: 36, align: 'left', alpha: 0.6 });
      txt(ctx, dateLine(), cx, y + 50, { size: 30, weight: 600, spacing: 6, alpha: 0.5 });
    } else {
      const h = state.habits.find((x) => x.id === shareTarget);
      if (!h) return;
      const s = currentStreak(h.id);
      const t = new Date();
      wordmark(ctx, 540);
      txt(ctx, (h.name || 'Untitled').toUpperCase(), cx, 700, { size: 46, weight: 700, spacing: 10, alpha: 0.8 });
      txt(ctx, String(s), cx, 980, { size: 320, weight: 800, spacing: -12 });
      txt(ctx, s === 1 ? 'DAY STREAK' : 'DAY STREAK', cx, 1050, { size: 40, weight: 700, spacing: 10, alpha: 0.8 });
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
    const h = state.habits.find((x) => x.id === target);
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
  $('shareAll').onclick = () => { closeMenu(); openShare('all'); };
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
      s.name ||= '';
      state = s; save(); hideSheets(); render(); scrollToToday(false);
    } catch (_) { alert('That file is not a Summit export.'); }
    e.target.value = '';
  };

  // keep "today" honest if the app is left open past midnight
  let lastDay = todayKey();
  const tick = () => { if (todayKey() !== lastDay) { lastDay = todayKey(); render(); } };
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  render();
  scrollToToday(false);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
