/* ============================================================
   Pomodoro OS — focus timer + study planner
   Plain JS, no dependencies. All data lives in localStorage.
   ============================================================ */
'use strict';

(() => {
  // ---------- Utilities ----------
  const STORE_KEY = 'pomodoro-os:v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const pad = n => String(n).padStart(2, '0');
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const clone = o => JSON.parse(JSON.stringify(o));
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => dateKey();
  const daysBetween = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmtDate = k => { const d = parseKey(k); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
  const fmtClock = sec => { sec = Math.max(0, Math.ceil(sec)); return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; };
  const fmtDur = min => {
    min = Math.round(min);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  const icon = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
  const PRIO_RANK = { high: 0, med: 1, low: 2 };
  const PRIO_LABEL = { high: 'High', med: 'Medium', low: 'Low' };
  const MODE_LABEL = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const VIEWS = ['focus', 'tasks', 'planner', 'stats', 'settings'];
  const SUBJECT_COLORS = ['#3b78e7', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#ef4444'];

  // ---------- State ----------
  const defaultState = () => ({
    version: 1,
    settings: {
      focus: 25, short: 5, long: 15, longEvery: 4, dailyGoal: 8,
      autoBreaks: true, autoFocus: false,
      sound: true, volume: 0.6, notify: false,
      ambient: 'off', ambientVol: 0.35, theme: 'system',
    },
    subjects: [
      { id: 'math', name: 'Mathematics', color: '#3b78e7' },
      { id: 'phys', name: 'Physics', color: '#8b5cf6' },
      { id: 'chem', name: 'Chemistry', color: '#10b981' },
      { id: 'eng', name: 'English', color: '#f59e0b' },
      { id: 'cs', name: 'Computer Science', color: '#ec4899' },
    ],
    tasks: [],
    sessions: [],
    exams: [],
    intentions: {},
    timer: { mode: 'focus', running: false, endAt: null, remaining: null, cycle: 0, activeTaskId: null },
  });

  const newTask = (data = {}) => ({
    id: uid(), title: '', subjectId: null, priority: 'med', est: 1, done: 0,
    completed: false, completedAt: null, due: null, notes: '', subtasks: [],
    createdAt: Date.now(), ...data,
  });

  function seed(s) {
    const t = today(), d = n => dateKey(addDays(new Date(), n));
    s.tasks = [
      newTask({ title: 'Solve calculus problem set 3', subjectId: 'math', priority: 'high', est: 3, due: t,
        subtasks: [{ id: uid(), title: 'Problems 1–10', done: false }, { id: uid(), title: 'Problems 11–20', done: false }] }),
      newTask({ title: "Review Newton's laws notes", subjectId: 'phys', priority: 'med', est: 2, due: t }),
      newTask({ title: 'Read chapter 5: Organic compounds', subjectId: 'chem', priority: 'med', est: 2, due: d(1) }),
      newTask({ title: 'Essay outline: modern poetry', subjectId: 'eng', priority: 'low', est: 1, due: d(3) }),
      newTask({ title: 'Practice recursion exercises', subjectId: 'cs', priority: 'high', est: 2, due: null }),
    ];
    s.exams = [{ id: uid(), title: 'Calculus midterm', subjectId: 'math', date: d(12) }];
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return seed(defaultState());
      return normalize(JSON.parse(raw));
    } catch (e) {
      return seed(defaultState());
    }
  }

  function normalize(d) {
    const base = defaultState();
    return {
      ...base, ...d,
      settings: { ...base.settings, ...(d.settings || {}) },
      timer: { ...base.timer, ...(d.timer || {}) },
      subjects: Array.isArray(d.subjects) ? d.subjects : base.subjects,
      tasks: Array.isArray(d.tasks) ? d.tasks.map(t => newTask(t)) : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      exams: Array.isArray(d.exams) ? d.exams : [],
      intentions: d.intentions && typeof d.intentions === 'object' ? d.intentions : {},
    };
  }

  let S = load();
  let saveTimer;
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ } };
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 150); };
  window.addEventListener('beforeunload', persist);

  const getTask = id => S.tasks.find(t => t.id === id);
  const getSubject = id => S.subjects.find(s => s.id === id);

  // ---------- UI helpers ----------
  function toast(msg, action) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); dismiss(); };
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    let gone = false;
    function dismiss() {
      if (gone) return; gone = true;
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }
    setTimeout(dismiss, action ? 6000 : 3200);
  }

  const tip = $('#tooltip');
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.innerHTML = el.dataset.tip;
    const r = el.getBoundingClientRect();
    tip.hidden = false;
    const w = tip.offsetWidth / 2 + 8;
    tip.style.left = clamp(r.left + r.width / 2, w, innerWidth - w) + 'px';
    tip.style.top = Math.max(r.top, tip.offsetHeight + 16) + 'px';
  });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);

  // ---------- Audio ----------
  let actx = null;
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function playChime() {
    if (!S.settings.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime, vol = 0.3 * S.settings.volume;
    [[659.25, 0], [783.99, 0.16], [1046.5, 0.32], [1318.5, 0.52]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 1.4);
      o.connect(g).connect(ctx.destination);
      o.start(now + t);
      o.stop(now + t + 1.5);
    });
  }

  function noiseBuffer(ctx, type) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * 0.35;
      else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  let amb = null; // { type, src, gain }
  function stopAmbient(fade = true) {
    if (!amb) return;
    const a = amb; amb = null;
    a.gain.gain.setTargetAtTime(0, actx.currentTime, fade ? 0.25 : 0.01);
    setTimeout(() => { try { a.src.stop(); } catch (e) {} }, fade ? 1500 : 60);
  }
  function updateAmbient() {
    const type = S.settings.ambient;
    const want = type !== 'off' && S.timer.running && S.timer.mode === 'focus';
    if (!want) return stopAmbient();
    const level = S.settings.ambientVol * 0.7;
    if (amb && amb.type === type) { amb.gain.gain.setTargetAtTime(level, actx.currentTime, 0.2); return; }
    stopAmbient(false);
    const ctx = ensureAudio();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, type === 'rain' ? 'pink' : type);
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let node = src;
    if (type === 'rain') {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      node.connect(hp); hp.connect(lp); node = lp;
    }
    node.connect(gain).connect(ctx.destination);
    src.start();
    gain.gain.setTargetAtTime(level, ctx.currentTime, 0.6);
    amb = { type, src, gain };
  }

  function notify(title, body) {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try { new Notification(title, { body, silent: true }); } catch (e) {}
  }

  // ---------- Timer ----------
  const RING_C = 2 * Math.PI * 146;
  const modeSeconds = m => S.settings[m] * 60;
  function timeLeft() {
    const t = S.timer;
    if (t.running) return Math.max(0, (t.endAt - Date.now()) / 1000);
    return t.remaining ?? modeSeconds(t.mode);
  }

  function startTimer() {
    const t = S.timer;
    if (t.running) return;
    t.endAt = Date.now() + timeLeft() * 1000;
    t.running = true;
    ensureAudio();
    updateAmbient();
    save(); renderTimer();
  }
  function pauseTimer() {
    const t = S.timer;
    if (!t.running) return;
    t.remaining = timeLeft();
    t.running = false; t.endAt = null;
    updateAmbient();
    save(); renderTimer();
  }
  const toggleTimer = () => (S.timer.running ? pauseTimer() : startTimer());
  function resetTimer() {
    Object.assign(S.timer, { running: false, endAt: null, remaining: null });
    updateAmbient();
    save(); renderTimer();
  }
  function setMode(mode, autostart = false) {
    Object.assign(S.timer, { mode, running: false, endAt: null, remaining: null });
    if (autostart) startTimer();
    else { updateAmbient(); save(); renderTimer(); }
  }
  function skipTimer() {
    const t = S.timer;
    if (t.mode === 'focus') {
      const elapsed = (modeSeconds('focus') - timeLeft()) / 60;
      if (elapsed >= 1) logSession(elapsed, false);
    }
    advance(false);
  }
  function completeTimer() {
    const t = S.timer;
    playChime();
    if (t.mode === 'focus') {
      t.cycle++;
      logSession(S.settings.focus, true);
      const longNext = t.cycle >= S.settings.longEvery;
      notify('Focus session complete', longNext ? 'Great work — enjoy a long break.' : 'Time for a short break.');
      toast(longNext ? 'Pomodoro done! Long break earned.' : 'Pomodoro done! Take a short break.');
    } else {
      notify('Break is over', 'Ready for the next focus session?');
      toast('Break over — back to focus.');
    }
    advance(true);
  }
  function advance(completed) {
    const t = S.timer;
    if (t.mode === 'focus') {
      const next = t.cycle >= S.settings.longEvery ? 'long' : 'short';
      setMode(next, completed && S.settings.autoBreaks);
    } else {
      if (t.mode === 'long') t.cycle = 0;
      setMode('focus', completed && S.settings.autoFocus);
    }
  }

  function logSession(minutes, full) {
    const task = getTask(S.timer.activeTaskId);
    S.sessions.push({
      id: uid(), end: Date.now(), date: today(),
      minutes: Math.round(minutes * 10) / 10, full,
      taskId: task ? task.id : null, subjectId: task ? task.subjectId : null,
    });
    if (task && full) task.done = (task.done || 0) + 1;
    save();
    renderAll();
  }

  function renderTimer() {
    const t = S.timer;
    document.body.dataset.mode = t.mode;
    document.body.classList.toggle('running', t.running);
    $$('.mode-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === t.mode);
      b.setAttribute('aria-selected', b.dataset.mode === t.mode);
    });
    const label = t.mode === 'focus' ? `Focus · #${pomosOn(today()) + 1}` : MODE_LABEL[t.mode];
    $('#ringLabel').textContent = label;
    $('#miniMode').textContent = MODE_LABEL[t.mode];
    const every = S.settings.longEvery;
    $('#cycleDots').innerHTML = Array.from({ length: every }, (_, i) => `<i class="${i < Math.min(t.cycle, every) ? 'on' : ''}"></i>`).join('');
    const ico = t.running ? 'pause' : 'play';
    $('#toggleBtn').innerHTML = icon(ico);
    $('#toggleBtn').setAttribute('aria-label', t.running ? 'Pause' : 'Start');
    $('#miniToggle').innerHTML = icon(ico);
    renderTick(true);
  }

  let lastTimeText = '';
  function renderTick(force) {
    const t = S.timer;
    const left = timeLeft(), total = modeSeconds(t.mode);
    const text = fmtClock(left);
    // Arc shows elapsed time: it grows clockwise from 12 o'clock as the session runs
    const elapsed = 1 - clamp(left / total, 0, 1);
    const ring = $('#ringProgress');
    ring.style.strokeDashoffset = RING_C * (1 - elapsed);
    ring.style.opacity = elapsed > 0.001 ? 1 : 0; // hide the round-cap dot before the session starts
    if (text !== lastTimeText || force) {
      lastTimeText = text;
      $('#ringTime').textContent = text;
      $('#miniTime').textContent = text;
      document.title = t.running || t.remaining != null ? `${text} · ${MODE_LABEL[t.mode]} — Pomodoro OS` : 'Pomodoro OS';
    }
  }

  // ---------- Stats helpers ----------
  const pomosOn = k => S.sessions.reduce((n, s) => n + (s.full && s.date === k ? 1 : 0), 0);
  const minutesOn = k => S.sessions.reduce((n, s) => n + (s.date === k ? s.minutes : 0), 0);
  function streaks() {
    const days = new Set(S.sessions.filter(s => s.full).map(s => s.date));
    let cur = 0, d = new Date();
    if (!days.has(dateKey(d))) d = addDays(d, -1);
    while (days.has(dateKey(d))) { cur++; d = addDays(d, -1); }
    const sorted = [...days].sort();
    let best = 0, run = 0, prev = null;
    for (const k of sorted) {
      run = prev && daysBetween(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    return { cur, best };
  }

  // ---------- Tasks ----------
  const byPlan = (a, b) =>
    (a.completed - b.completed) ||
    (a.due || '9999').localeCompare(b.due || '9999') ||
    PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
    a.createdAt - b.createdAt;

  function dueInfo(k) {
    if (!k) return null;
    const diff = daysBetween(today(), k);
    if (diff < 0) return { cls: 'overdue', text: diff === -1 ? 'Yesterday' : `Overdue · ${fmtDate(k)}` };
    if (diff === 0) return { cls: 'today', text: 'Today' };
    if (diff === 1) return { cls: '', text: 'Tomorrow' };
    if (diff < 7) return { cls: '', text: DOW_LONG[parseKey(k).getDay()] };
    return { cls: '', text: fmtDate(k) };
  }

  function pomoDots(t) {
    const est = Math.max(1, t.est || 1), done = t.done || 0;
    if (Math.max(est, done) > 8) return `<span class="meta pomos" title="Pomodoros done / estimated"><i class="on"></i><b>${done}/${est}</b></span>`;
    const dots = Array.from({ length: Math.max(est, done) }, (_, i) => `<i class="${i < done ? 'on' : ''}"></i>`).join('');
    return `<span class="meta pomos" title="Pomodoros done / estimated">${dots}<b>${done}/${est}</b></span>`;
  }

  function taskItem(t, { showDue = true } = {}) {
    const subj = getSubject(t.subjectId);
    const due = showDue ? dueInfo(t.due) : null;
    const subDone = t.subtasks.filter(s => s.done).length;
    const active = S.timer.activeTaskId === t.id;
    return `<li class="task ${t.completed ? 'is-done' : ''} ${active ? 'is-active' : ''}" data-id="${t.id}">
      <button class="check p-${t.priority}" data-act="toggle" aria-label="${t.completed ? 'Mark as not done' : 'Mark as done'}">${icon('check')}</button>
      <div class="task-body" data-act="edit">
        <div class="task-title">${esc(t.title)}</div>
        <div class="task-meta">
          ${subj ? `<span class="meta"><span class="dot" style="background:${esc(subj.color)}"></span>${esc(subj.name)}</span>` : ''}
          ${t.priority !== 'med' ? `<span class="meta prio-${t.priority}">${icon('flag')}${PRIO_LABEL[t.priority]}</span>` : ''}
          ${due && !t.completed ? `<span class="meta ${due.cls}">${icon('calendar')}${due.text}</span>` : ''}
          ${pomoDots(t)}
          ${t.subtasks.length ? `<span class="meta">${icon('tasks')}${subDone}/${t.subtasks.length}</span>` : ''}
          ${t.notes ? `<span class="meta" title="Has notes">${icon('note')}</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        ${t.completed ? '' : `<button class="icon-btn play" data-act="focus" title="Focus on this task" aria-label="Focus on this task">${icon('play')}</button>`}
        <button class="icon-btn del" data-act="delete" title="Delete" aria-label="Delete task">${icon('trash')}</button>
      </div>
    </li>`;
  }

  const emptyState = (title, sub, ic = 'sparkle') => `<li class="empty">${icon(ic)}<b>${esc(title)}</b>${esc(sub)}</li>`;

  function toggleComplete(id, btn) {
    const t = getTask(id);
    if (!t) return;
    t.completed = !t.completed;
    t.completedAt = t.completed ? Date.now() : null;
    if (t.completed && S.timer.activeTaskId === id) S.timer.activeTaskId = null;
    if (t.completed) {
      btn?.classList.add('pop');
      toast(`Completed: ${t.title}`, { label: 'Undo', fn: () => toggleComplete(id) });
    }
    save();
    setTimeout(renderAll, t.completed ? 180 : 0);
  }

  function deleteTask(id) {
    const i = S.tasks.findIndex(t => t.id === id);
    if (i < 0) return;
    const [t] = S.tasks.splice(i, 1);
    if (S.timer.activeTaskId === id) S.timer.activeTaskId = null;
    save(); renderAll();
    toast('Task deleted', { label: 'Undo', fn: () => { S.tasks.splice(i, 0, t); save(); renderAll(); } });
  }

  function focusOn(id) {
    S.timer.activeTaskId = id;
    if (S.timer.mode !== 'focus') setMode('focus');
    if (location.hash !== '#focus') location.hash = '#focus';
    startTimer();
    renderAll();
  }

  function findOrCreateSubject(raw) {
    const name = raw.replace(/[-_]/g, ' ').trim();
    const low = name.toLowerCase();
    let s = S.subjects.find(x => x.name.toLowerCase() === low) ||
      S.subjects.find(x => x.name.toLowerCase().startsWith(low)) ||
      S.subjects.find(x => x.name.toLowerCase().split(' ').some(w => w.startsWith(low)));
    if (!s) {
      s = { id: uid(), name: name.charAt(0).toUpperCase() + name.slice(1), color: SUBJECT_COLORS[S.subjects.length % SUBJECT_COLORS.length] };
      S.subjects.push(s);
    }
    return s;
  }

  // "Read ch 4 #physics !high ~3 @tomorrow"
  function parseQuick(text, defaults = {}) {
    const out = { ...defaults };
    const PRI = { high: 'high', h: 'high', 1: 'high', med: 'med', medium: 'med', m: 'med', 2: 'med', low: 'low', l: 'low', 3: 'low' };
    let title = ' ' + text + ' ';
    title = title.replace(/\s#([\p{L}\p{N}_-]+)(?=\s)/gu, (m, n) => { out.subjectId = findOrCreateSubject(n).id; return ' '; });
    title = title.replace(/\s!(high|medium|med|low|h|m|l|1|2|3)(?=\s)/gi, (m, p) => { out.priority = PRI[p.toLowerCase()]; return ' '; });
    title = title.replace(/\s[~*](\d{1,2})(?=\s)/g, (m, n) => { out.est = clamp(+n, 1, 40); return ' '; });
    title = title.replace(/\s@(\S+)(?=\s)/g, (m, d) => {
      const k = parseDue(d.toLowerCase());
      if (k === undefined) return m;
      out.due = k;
      return ' ';
    });
    out.title = title.replace(/\s+/g, ' ').trim();
    return out;
  }
  function parseDue(d) {
    const now = new Date();
    if (d === 'today' || d === 'tod') return today();
    if (d === 'tomorrow' || d === 'tom' || d === 'tmr') return dateKey(addDays(now, 1));
    if (d === 'none' || d === 'someday') return null;
    if (/^\+\d{1,3}$/.test(d)) return dateKey(addDays(now, +d.slice(1)));
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parseKey(d))) return d;
    const wd = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].findIndex(x => d.startsWith(x));
    if (wd >= 0) return dateKey(addDays(now, (wd - now.getDay() + 7) % 7));
    return undefined;
  }

  function quickAdd(form, defaults) {
    const input = form.q;
    const raw = input.value.trim();
    if (!raw) return;
    const data = parseQuick(raw, defaults);
    if (!data.title) { toast('Give the task a name'); return; }
    S.tasks.push(newTask(data));
    input.value = '';
    save(); renderAll();
    const due = dueInfo(data.due);
    toast(`Added “${data.title}”${due ? ` · ${due.text}` : ''}`);
  }

  // ---------- Task editor modal ----------
  const modal = $('#taskModal'), form = $('#taskForm');
  let editing = null;

  function subjectOptions(selected, emptyLabel = 'No subject') {
    return `<option value="">${emptyLabel}</option>` + S.subjects.map(s =>
      `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  function openTask(id, preset = {}) {
    const t = id ? getTask(id) : null;
    editing = { id, priority: t ? t.priority : (preset.priority || 'med'), subtasks: clone(t ? t.subtasks : []) };
    $('#taskModalTitle').textContent = t ? 'Edit task' : 'New task';
    form.title.value = t ? t.title : '';
    $('#modalSubject').innerHTML = subjectOptions(t ? t.subjectId : preset.subjectId);
    form.due.value = t ? (t.due || '') : (preset.due || '');
    form.est.value = t ? t.est : 1;
    form.notes.value = t ? t.notes : '';
    $('#modalDelete').hidden = !t;
    renderPrio(); renderSubtasks();
    modal.returnValue = '';
    modal.showModal();
    if (!t) form.title.focus();
  }
  function renderPrio() { $$('#prioSeg button').forEach(b => b.classList.toggle('active', b.dataset.prio === editing.priority)); }
  function renderSubtasks() {
    $('#subtaskList').innerHTML = editing.subtasks.map(s => `
      <li class="${s.done ? 'done' : ''}" data-sid="${s.id}">
        <button type="button" class="check" data-sact="toggle" aria-label="Toggle step">${icon('check')}</button>
        <span>${esc(s.title)}</span>
        <button type="button" class="icon-btn" data-sact="del" aria-label="Remove step">${icon('x')}</button>
      </li>`).join('');
  }
  $('#prioSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-prio]');
    if (b) { editing.priority = b.dataset.prio; renderPrio(); }
  });
  $('#subtaskList').addEventListener('click', e => {
    const b = e.target.closest('[data-sact]');
    if (!b) return;
    const sid = b.closest('li').dataset.sid;
    const i = editing.subtasks.findIndex(s => s.id === sid);
    if (b.dataset.sact === 'toggle') editing.subtasks[i].done = !editing.subtasks[i].done;
    else editing.subtasks.splice(i, 1);
    renderSubtasks();
  });
  $('#subtaskInput').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const v = e.target.value.trim();
    if (!v) return;
    editing.subtasks.push({ id: uid(), title: v, done: false });
    e.target.value = '';
    renderSubtasks();
  });
  $$('[data-close]', modal).forEach(b => b.addEventListener('click', () => modal.close('cancel')));
  $('#modalDelete').addEventListener('click', () => { const id = editing.id; modal.close('cancel'); deleteTask(id); });
  modal.addEventListener('close', () => {
    if (modal.returnValue !== 'save' || !editing) return;
    const pending = $('#subtaskInput').value.trim();
    if (pending) { editing.subtasks.push({ id: uid(), title: pending, done: false }); $('#subtaskInput').value = ''; }
    const data = {
      title: form.title.value.trim(),
      subjectId: form.subjectId.value || null,
      due: form.due.value || null,
      est: clamp(parseInt(form.est.value, 10) || 1, 1, 40),
      notes: form.notes.value.trim(),
      priority: editing.priority,
      subtasks: editing.subtasks,
    };
    if (!data.title) return;
    if (editing.id) { Object.assign(getTask(editing.id), data); toast('Task updated'); }
    else { S.tasks.push(newTask(data)); toast('Task added'); }
    editing = null;
    save(); renderAll();
  });

  // ---------- Focus view ----------
  function renderFocus() {
    const now = new Date(), h = now.getHours();
    $('#greeting').textContent = h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('#todayLabel').textContent = `${DOW_LONG[now.getDay()]}, ${MONTHS_LONG[now.getMonth()]} ${now.getDate()}`;

    const k = today(), goal = S.settings.dailyGoal, pomos = pomosOn(k), mins = minutesOn(k);
    const goalMin = goal * S.settings.focus;
    const st = streaks();
    const nextExam = S.exams.filter(e => e.date >= k).sort((a, b) => a.date.localeCompare(b.date))[0];
    const doneToday = S.tasks.filter(t => t.completed && t.completedAt && dateKey(new Date(t.completedAt)) === k).length;
    const examDays = nextExam ? daysBetween(k, nextExam.date) : 0;
    $('#focusKpis').innerHTML = `
      <div class="kpi"><div class="kpi-top">${icon('target')}Pomodoros</div>
        <div class="kpi-val">${pomos}<small>/ ${goal}</small></div>
        <div class="bar"><i style="width:${Math.min(100, pomos / goal * 100)}%"></i></div></div>
      <div class="kpi"><div class="kpi-top">${icon('clock')}Focus time</div>
        <div class="kpi-val">${fmtDur(mins)}</div>
        <div class="kpi-sub">${mins >= goalMin ? 'Daily goal reached' : `${fmtDur(goalMin - mins)} to goal`}</div></div>
      <div class="kpi flame"><div class="kpi-top">${icon('flame')}Streak</div>
        <div class="kpi-val">${st.cur}<small>${st.cur === 1 ? 'day' : 'days'}</small></div>
        <div class="kpi-sub">Best: ${st.best} ${st.best === 1 ? 'day' : 'days'}</div></div>
      ${nextExam
        ? `<div class="kpi"><div class="kpi-top">${icon('cap')}Next exam</div>
            <div class="kpi-val">${examDays === 0 ? 'Today' : `${examDays}<small>${examDays === 1 ? 'day' : 'days'}</small>`}</div>
            <div class="kpi-sub" title="${esc(nextExam.title)}">${esc(nextExam.title)}</div></div>`
        : `<div class="kpi"><div class="kpi-top">${icon('check')}Tasks done</div>
            <div class="kpi-val">${doneToday}</div><div class="kpi-sub">completed today</div></div>`}
    `;

    const intent = $('#intention');
    if (document.activeElement !== intent) intent.value = S.intentions[k] || '';

    const open = S.tasks.filter(t => !t.completed && t.due && t.due <= k).sort(byPlan);
    const done = S.tasks.filter(t => t.completed && t.completedAt && dateKey(new Date(t.completedAt)) === k).sort((a, b) => b.completedAt - a.completedAt);
    const estLeft = open.reduce((n, t) => n + Math.max(0, (t.est || 1) - (t.done || 0)), 0);
    $('#planSummary').textContent = open.length
      ? `${open.length} open · ~${estLeft} pomodoro${estLeft === 1 ? '' : 's'} (${fmtDur(estLeft * S.settings.focus)})`
      : '';
    let html = open.map(t => taskItem(t)).join('');
    if (!open.length) html = emptyState(done.length ? 'All done for today!' : 'Nothing planned yet', done.length ? 'Enjoy the win, or pull something forward from the planner.' : 'Add a task above, or schedule some in the planner.', done.length ? 'sparkle' : 'tasks');
    if (done.length) html += `<li class="list-section">Completed today · ${done.length}</li>` + done.map(t => taskItem(t)).join('');
    $('#focusTaskList').innerHTML = html;

    const sel = $('#activeTaskSelect');
    const candidates = S.tasks.filter(t => !t.completed).sort(byPlan);
    sel.innerHTML = `<option value="">No task selected</option>` + candidates.map(t => {
      const s = getSubject(t.subjectId);
      return `<option value="${t.id}">${esc(t.title)}${s ? ` — ${esc(s.name)}` : ''}</option>`;
    }).join('');
    sel.value = S.timer.activeTaskId && getTask(S.timer.activeTaskId) ? S.timer.activeTaskId : '';
    $('#ambientSelect').value = S.settings.ambient;
  }

  // ---------- Tasks view ----------
  let taskFilter = 'today', subjectFilter = '', searchQ = '';
  function renderTasks() {
    const k = today();
    const sets = {
      today: S.tasks.filter(t => !t.completed && t.due && t.due <= k),
      upcoming: S.tasks.filter(t => !t.completed && t.due && t.due > k),
      inbox: S.tasks.filter(t => !t.completed && !t.due),
      all: S.tasks.filter(t => !t.completed),
      done: S.tasks.filter(t => t.completed),
    };
    $$('#taskFilters button').forEach(b => {
      const f = b.dataset.filter;
      b.classList.toggle('active', f === taskFilter);
      const label = b.textContent.replace(/\d+$/, '').trim();
      b.innerHTML = `${esc(label)}${f !== 'done' ? `<span class="count">${sets[f].length}</span>` : ''}`;
    });
    const sf = $('#subjectFilter');
    sf.innerHTML = subjectOptions(subjectFilter, 'All subjects');
    sf.value = subjectFilter;

    const q = searchQ.toLowerCase();
    const match = t => (!subjectFilter || t.subjectId === subjectFilter) &&
      (!q || t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
    let list = sets[taskFilter].filter(match);
    let html = '';
    if (taskFilter === 'done') {
      list.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      html = list.map(t => taskItem(t, { showDue: false })).join('');
    } else if (taskFilter === 'upcoming') {
      list.sort(byPlan);
      let cur = null;
      for (const t of list) {
        if (t.due !== cur) {
          cur = t.due;
          const d = parseKey(cur);
          html += `<li class="list-section">${dueInfo(cur).text}${daysBetween(k, cur) >= 7 ? '' : ` · ${MONTHS[d.getMonth()]} ${d.getDate()}`}</li>`;
        }
        html += taskItem(t, { showDue: false });
      }
    } else {
      html = list.sort(byPlan).map(t => taskItem(t)).join('');
    }
    if (!list.length) {
      const msgs = {
        today: ['You’re clear for today', 'Use quick add above or plan tasks for today.'],
        upcoming: ['Nothing upcoming', 'Add a due date with @tomorrow or @fri.'],
        inbox: ['No undated tasks', 'Tasks without a due date appear here.'],
        all: ['No open tasks', 'Add your first task above.'],
        done: ['Nothing completed yet', 'Completed tasks will show up here.'],
      };
      html = (q || subjectFilter) ? emptyState('No matches', 'Try a different search or subject.', 'search') : emptyState(...msgs[taskFilter], 'tasks');
    }
    $('#taskList').innerHTML = html;
  }

  // ---------- Planner ----------
  let weekOffset = 0;
  function weekStart(off) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return addDays(d, -((d.getDay() + 6) % 7) + off * 7);
  }
  function chip(t) {
    const s = getSubject(t.subjectId);
    return `<li class="pchip ${t.completed ? 'done' : ''}" draggable="true" data-id="${t.id}" data-act="edit" title="${esc(t.title)}">
      <span class="stripe" style="background:${s ? esc(s.color) : 'var(--faint)'}"></span>
      <span class="txt">${esc(t.title)}</span>
      <span class="est">${t.done || 0}/${t.est}</span>
    </li>`;
  }
  function renderPlanner() {
    const start = weekStart(weekOffset), end = addDays(start, 6), k = today();
    const sameMonth = start.getMonth() === end.getMonth();
    $('#weekTitle').textContent = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week'
      : `${MONTHS[start.getMonth()]} ${start.getDate()} – ${sameMonth ? '' : MONTHS[end.getMonth()] + ' '}${end.getDate()}`;
    const goal = S.settings.dailyGoal;
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i), dk = dateKey(d);
      const tasks = S.tasks.filter(t => t.due === dk).sort(byPlan);
      const planned = tasks.reduce((n, t) => n + (t.est || 1), 0);
      const over = planned > goal;
      html += `<div class="day-col ${dk === k ? 'today' : ''} ${dk < k ? 'past' : ''}" data-drop="${dk}">
        <div class="day-head"><span class="day-name">${DOW[d.getDay()]}</span><span class="day-num">${d.getDate()}</span></div>
        <div class="load ${over ? 'over' : ''}" title="Planned pomodoros vs daily goal"><span class="bar"><i style="width:${Math.min(100, planned / goal * 100)}%"></i></span>${planned}/${goal}</div>
        <ul class="day-tasks">${tasks.map(chip).join('')}</ul>
        <button class="add-day" data-act="add-day" data-date="${dk}">${icon('plus')}Add</button>
      </div>`;
    }
    $('#weekGrid').innerHTML = html;

    const uns = S.tasks.filter(t => !t.completed && !t.due).sort(byPlan);
    $('#unscheduledList').innerHTML = uns.length ? uns.map(chip).join('') : `<li class="muted small" style="padding:10px 2px">No unscheduled tasks. Drag a task here to remove its date.</li>`;

    $('#examSubject').innerHTML = subjectOptions('', 'Subject');
    const exams = [...S.exams].sort((a, b) => {
      const pa = a.date < k, pb = b.date < k;
      return pa - pb || (pa ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    });
    $('#examList').innerHTML = exams.length ? exams.map(ex => {
      const days = daysBetween(k, ex.date), s = getSubject(ex.subjectId), d = parseKey(ex.date);
      const past = days < 0;
      return `<li class="exam ${past ? 'past' : days <= 7 ? 'soon' : ''}" data-id="${ex.id}">
        <div class="count">${past ? `<b>✓</b><span>done</span>` : days === 0 ? `<b>!</b><span>today</span>` : `<b>${days}</b><span>${days === 1 ? 'day' : 'days'}</span>`}</div>
        <div class="info"><b>${esc(ex.title)}</b>
          <span>${s ? `<i class="dot" style="background:${esc(s.color)}"></i>${esc(s.name)} · ` : ''}${DOW_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}</span></div>
        <button class="icon-btn" data-act="del-exam" aria-label="Delete exam">${icon('trash')}</button>
      </li>`;
    }).join('') : `<li class="muted small" style="padding:6px 2px">No exams yet. Add one to see a countdown here and on the Focus page.</li>`;
  }

  // ---------- Stats ----------
  let statsRange = 7;
  function niceStep(max) {
    for (const s of [5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480]) if (max / s <= 4) return s;
    return 600;
  }
  function barPath(x, y, w, h) {
    const r = Math.min(4, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function barChart({ values, labels, tips, goal, height = 220, width = 760 }) {
    const padL = 40, padR = 8, padT = 12, padB = 26;
    const n = values.length;
    const maxV = Math.max(...values, goal || 0, 30);
    const step = niceStep(maxV);
    const top = Math.ceil(maxV * 1.08 / step) * step;
    const iw = width - padL - padR, ih = height - padT - padB;
    const slot = iw / n, bw = Math.max(2, Math.min(32, slot * (n > 40 ? 0.7 : 0.58)));
    const y = v => padT + ih - (v / top) * ih;
    let grid = '', ax = '', bars = '';
    for (let v = 0; v <= top; v += step) {
      grid += `<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      ax += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? '0' : fmtDur(v)}</text>`;
    }
    values.forEach((v, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = (v / top) * ih;
      bars += `<g class="col"><rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${ih}" data-tip="${esc(tips[i])}"/>`;
      if (v > 0) bars += `<path class="bar" d="${barPath(cx - bw / 2, y(v), bw, Math.max(h, 2))}"/>`;
      bars += `</g>`;
      if (labels[i]) ax += `<text x="${cx}" y="${height - 6}" text-anchor="middle">${labels[i]}</text>`;
    });
    const goalLine = goal ? `<line class="goal" x1="${padL}" x2="${width - padR}" y1="${y(goal)}" y2="${y(goal)}"/>` : '';
    return `<svg viewBox="0 0 ${width} ${height}" role="img"><g class="grid">${grid}</g><g class="axis">${ax}</g>${bars}${goalLine}</svg>`;
  }

  const chartWidth = (sel, fallback) => Math.max(280, Math.round($(sel).clientWidth) || fallback);

  function renderStats() {
    $$('#statsRange button').forEach(b => b.classList.toggle('active', +b.dataset.range === statsRange));
    const n = statsRange, now = new Date();
    const days = Array.from({ length: n }, (_, i) => dateKey(addDays(now, i - n + 1)));
    const first = days[0];
    const inRange = S.sessions.filter(s => s.date >= first);
    const byDay = {}, pomoDay = {};
    for (const s of inRange) {
      byDay[s.date] = (byDay[s.date] || 0) + s.minutes;
      if (s.full) pomoDay[s.date] = (pomoDay[s.date] || 0) + 1;
    }
    const totalMin = inRange.reduce((a, s) => a + s.minutes, 0);
    const totalPomo = inRange.filter(s => s.full).length;
    const firstMs = parseKey(first).getTime();
    const tasksDone = S.tasks.filter(t => t.completed && t.completedAt >= firstMs).length;
    const st = streaks();
    const activeDays = days.filter(d => byDay[d] > 0).length;

    $('#statsKpis').innerHTML = `
      <div class="kpi"><div class="kpi-top">${icon('clock')}Focus time</div><div class="kpi-val">${fmtDur(totalMin)}</div><div class="kpi-sub">last ${n} days</div></div>
      <div class="kpi"><div class="kpi-top">${icon('target')}Pomodoros</div><div class="kpi-val">${totalPomo}</div><div class="kpi-sub">${activeDays} active ${activeDays === 1 ? 'day' : 'days'}</div></div>
      <div class="kpi"><div class="kpi-top">${icon('chart')}Daily average</div><div class="kpi-val">${fmtDur(totalMin / n)}</div><div class="kpi-sub">goal ${fmtDur(S.settings.dailyGoal * S.settings.focus)}</div></div>
      <div class="kpi flame"><div class="kpi-top">${icon('flame')}Streak</div><div class="kpi-val">${st.cur}<small>${st.cur === 1 ? 'day' : 'days'}</small></div><div class="kpi-sub">best ${st.best}</div></div>
      <div class="kpi"><div class="kpi-top">${icon('check')}Tasks done</div><div class="kpi-val">${tasksDone}</div><div class="kpi-sub">last ${n} days</div></div>`;

    // Daily bars
    const every = n <= 7 ? 1 : n <= 30 ? 5 : 14;
    $('#dailyChart').innerHTML = barChart({
      values: days.map(d => Math.round(byDay[d] || 0)),
      labels: days.map((d, i) => {
        if (n <= 7) return DOW[parseKey(d).getDay()];
        return (n - 1 - i) % every === 0 ? fmtDate(d) : '';
      }),
      tips: days.map(d => {
        const dd = parseKey(d);
        return `<b>${DOW[dd.getDay()]}, ${MONTHS[dd.getMonth()]} ${dd.getDate()}</b><br>${fmtDur(byDay[d] || 0)} · ${pomoDay[d] || 0} pomodoro${pomoDay[d] === 1 ? '' : 's'}`;
      }),
      goal: S.settings.dailyGoal * S.settings.focus,
      width: chartWidth('#dailyChart', 760),
    });

    // Subjects
    const bySubj = {};
    for (const s of inRange) { const key = s.subjectId && getSubject(s.subjectId) ? s.subjectId : ''; bySubj[key] = (bySubj[key] || 0) + s.minutes; }
    const rows = Object.entries(bySubj).sort((a, b) => b[1] - a[1]);
    const maxS = rows.length ? rows[0][1] : 0;
    $('#subjectBreakdown').innerHTML = rows.length ? rows.map(([id, m]) => {
      const s = getSubject(id), color = s ? s.color : 'var(--faint)';
      return `<div class="subj-row" data-tip="<b>${esc(s ? s.name : 'No subject')}</b><br>${fmtDur(m)} · ${Math.round(m / totalMin * 100)}%">
        <div class="name"><i class="dot" style="background:${esc(color)}"></i><span>${esc(s ? s.name : 'No subject')}</span></div>
        <div class="track"><i style="width:${(m / maxS) * 100}%;background:${esc(color)}"></i></div>
        <div class="val">${fmtDur(m)}<small>${Math.round(m / totalMin * 100)}%</small></div>
      </div>`;
    }).join('') : `<div class="empty">${icon('chart')}<b>No focus data yet</b>Pick a task before starting the timer to track time per subject.</div>`;

    // Hours
    const hours = Array(24).fill(0);
    for (const s of inRange) {
      // spread each session over the hours it covered
      let t = s.end - s.minutes * 60000;
      let left = s.minutes;
      while (left > 0.01) {
        const d = new Date(t);
        const toNext = 60 - d.getMinutes() - d.getSeconds() / 60;
        const chunk = Math.min(left, toNext);
        hours[d.getHours()] += chunk;
        left -= chunk; t += chunk * 60000;
      }
    }
    const hl = h => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
    $('#hourChart').innerHTML = barChart({
      values: hours.map(Math.round),
      labels: hours.map((_, h) => (h % 6 === 0 ? hl(h) : '')),
      tips: hours.map((m, h) => `<b>${hl(h)} – ${hl((h + 1) % 24)}</b><br>${fmtDur(m)}`),
      height: 200, width: chartWidth('#hourChart', 520),
    });

    renderHeatmap();
  }

  function renderHeatmap() {
    const weeks = 20, cell = 13, gap = 3, padL = 30, padT = 18;
    const start = weekStart(-(weeks - 1));
    const k = today(), goalMin = S.settings.dailyGoal * S.settings.focus;
    const byDay = {};
    for (const s of S.sessions) byDay[s.date] = (byDay[s.date] || 0) + s.minutes;
    const levels = [0, 25, 50, 75, 100];
    const color = l => l === 0 ? 'var(--heat-0)' : `color-mix(in srgb, var(--focus) ${levels[l]}%, var(--heat-0))`;
    const level = m => !m ? 0 : m < goalMin * 0.25 ? 1 : m < goalMin * 0.5 ? 2 : m < goalMin ? 3 : 4;
    let cells = '', months = '', lastMonth = -1, lastLabelW = -9;
    for (let w = 0; w < weeks; w++) {
      const wd = addDays(start, w * 7);
      if (wd.getMonth() !== lastMonth) {
        lastMonth = wd.getMonth();
        if (w < weeks - 1 && w - lastLabelW >= 3) {
          months += `<text x="${padL + w * (cell + gap)}" y="11">${MONTHS[lastMonth]}</text>`;
          lastLabelW = w;
        }
      }
      for (let d = 0; d < 7; d++) {
        const day = addDays(start, w * 7 + d), dk = dateKey(day);
        if (dk > k) continue;
        const m = byDay[dk] || 0;
        cells += `<rect class="cell" x="${padL + w * (cell + gap)}" y="${padT + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" style="fill:${color(level(m))}" data-tip="<b>${DOW[day.getDay()]}, ${MONTHS[day.getMonth()]} ${day.getDate()}</b><br>${m ? fmtDur(m) : 'No focus'}"/>`;
      }
    }
    const dayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => l ? `<text x="0" y="${padT + i * (cell + gap) + 10}">${l}</text>` : '').join('');
    const W = padL + weeks * (cell + gap), H = padT + 7 * (cell + gap);
    $('#heatmap').innerHTML = `<svg class="heatmap" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily focus heatmap">${months}${dayLabels}${cells}</svg>`;
    $('#heatLegend').innerHTML = `Less ${levels.map((_, i) => `<i style="background:${color(i)}"></i>`).join('')} Goal`;
  }

  // ---------- Settings ----------
  function renderSettings() {
    $$('[data-setting]').forEach(el => {
      const v = S.settings[el.dataset.setting];
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
    renderThemePicker($('#themeGrid'));
    const mins = {};
    for (const s of S.sessions) if (s.subjectId) mins[s.subjectId] = (mins[s.subjectId] || 0) + s.minutes;
    $('#subjectList').innerHTML = S.subjects.map(s => `
      <li class="subject-item" data-id="${s.id}">
        <input type="color" value="${esc(s.color)}" data-subj="color" aria-label="Color for ${esc(s.name)}" />
        <input class="input" value="${esc(s.name)}" data-subj="name" maxlength="40" aria-label="Subject name" />
        <span class="stat">${fmtDur(mins[s.id] || 0)}</span>
        <button class="icon-btn" data-act="del-subject" aria-label="Delete subject">${icon('trash')}</button>
      </li>`).join('') || `<li class="muted small">No subjects yet.</li>`;
    $('#subjectAdd').color.value = SUBJECT_COLORS[S.subjects.length % SUBJECT_COLORS.length];
  }

  const SHORTCUTS = [['Space', 'Start / pause timer'], ['R', 'Reset timer'], ['S', 'Skip to next session'], ['N', 'New task (quick add)'],
    ['Z', 'Toggle zen mode'], ['T', 'Change theme'], ['1 – 5', 'Switch pages'], ['?', 'Show shortcuts']];
  const shortcutsHtml = SHORTCUTS.map(([k, d]) => `<dt><kbd>${k}</kbd></dt><dd>${d}</dd>`).join('');
  $('#shortcutList').innerHTML = shortcutsHtml;
  $('#shortcutList2').innerHTML = shortcutsHtml;

  $$('[data-setting]').forEach(el => el.addEventListener(el.type === 'range' ? 'input' : 'change', async () => {
    const key = el.dataset.setting;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range') v = parseFloat(el.value);
    else {
      v = clamp(parseInt(el.value, 10) || +el.min, +el.min, +el.max);
      el.value = v;
    }
    if (key === 'notify' && v) {
      if (!('Notification' in window)) { toast('Notifications are not supported in this browser'); el.checked = false; return; }
      const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (p !== 'granted') { toast('Notifications are blocked for this page'); el.checked = false; return; }
    }
    S.settings[key] = v;
    save();
    if (key === 'ambientVol') updateAmbient();
    if (['focus', 'short', 'long', 'longEvery', 'dailyGoal'].includes(key)) { renderTimer(); renderFocus(); }
  }));
  $('#testSound').addEventListener('click', () => { const s = S.settings.sound; S.settings.sound = true; playChime(); S.settings.sound = s; });

  // ---------- Themes ----------
  // Preview swatches: [background, surface, text, focus, short break, long break]. Full tokens live in styles.css.
  const THEMES = [
    { id: 'system', name: 'Auto', tag: 'Follows device', dark: null, p: ['#f5f6fa', '#ffffff', '#151922', '#e8474f', '#0f9d8f', '#5b55e6'] },
    { id: 'dark', name: 'Midnight', tag: 'Dark', dark: true, p: ['#0d0f14', '#151820', '#eef0f5', '#ff6b70', '#2cc5b4', '#8a84ff'] },
    { id: 'light', name: 'Daylight', tag: 'Light', dark: false, p: ['#f5f6fa', '#ffffff', '#151922', '#e8474f', '#0f9d8f', '#5b55e6'] },
    { id: 'ocean', name: 'Ocean', tag: 'Dark', dark: true, p: ['#08141f', '#0e1e2d', '#e4f0fa', '#4cc2ff', '#2dd4bf', '#a78bfa'] },
    { id: 'forest', name: 'Forest', tag: 'Dark', dark: true, p: ['#0b1511', '#121f19', '#e6f2ea', '#5fd38d', '#f5c451', '#6fb2ff'] },
    { id: 'sunset', name: 'Sunset', tag: 'Dark', dark: true, p: ['#190f1f', '#22152a', '#fbeef5', '#ff7a59', '#ffc26b', '#e879f9'] },
    { id: 'aurora', name: 'Aurora', tag: 'Dark', dark: true, p: ['#0b0d1c', '#121530', '#eceefe', '#7cf2c9', '#6ec3ff', '#c48bff'] },
    { id: 'nord', name: 'Nord', tag: 'Dark', dark: true, p: ['#242933', '#2e3440', '#eceff4', '#e5838c', '#a3be8c', '#88c0d0'] },
    { id: 'dracula', name: 'Dracula', tag: 'Dark', dark: true, p: ['#1d1e27', '#282a36', '#f8f8f2', '#ff79c6', '#50fa7b', '#bd93f9'] },
    { id: 'coffee', name: 'Coffee', tag: 'Dark', dark: true, p: ['#16110e', '#201915', '#f5ebe0', '#e8935a', '#a9b98e', '#d4ad85'] },
    { id: 'sakura', name: 'Sakura', tag: 'Light', dark: false, p: ['#fdf3f6', '#ffffff', '#3a1f2a', '#e05780', '#2f9e8a', '#8f6ad8'] },
    { id: 'paper', name: 'Paper', tag: 'Light', dark: false, p: ['#f3eee4', '#fbf8f2', '#2d2620', '#c8553d', '#4a8c6f', '#5d6fb0'] },
    { id: 'mint', name: 'Mint', tag: 'Light', dark: false, p: ['#eef7f3', '#ffffff', '#13261f', '#e8664a', '#0f9b8a', '#4f7cff'] },
    { id: 'lavender', name: 'Lavender', tag: 'Light', dark: false, p: ['#f4f2fc', '#ffffff', '#221d3a', '#d9467a', '#1f9c8f', '#6a4ff0'] },
  ];
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  const themeInfo = () => THEMES.find(t => t.id === S.settings.theme) || THEMES[0];
  function applyTheme() {
    const root = document.documentElement;
    const t = themeInfo();
    if (t.id === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = t.id;
    $('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--bg').trim() || t.p[0];
  }
  function renderThemePicker(el) {
    if (!el) return;
    const cur = themeInfo().id;
    el.innerHTML = THEMES.map(t => {
      const [bg, surface, text, a, b, c] = t.p;
      return `<button type="button" class="theme-card ${t.id === cur ? 'active' : ''} ${t.id === 'system' ? 'auto' : ''}" data-theme-opt="${t.id}"
          style="--p-bg:${bg};--p-surface:${surface};--p-text:${text};--p-a:${a};--p-b:${b};--p-c:${c}" aria-pressed="${t.id === cur}">
        <span class="theme-preview" aria-hidden="true">
          <span class="tp-side"><i></i><i></i><i></i></span>
          <span class="tp-main"><span class="tp-ring"></span><span class="tp-dots"><i></i><i></i><i></i></span></span>
        </span>
        <span class="theme-name">${t.name}<small>${t.tag}</small></span>
        <span class="tick">${icon('check')}</span>
      </button>`;
    }).join('');
  }
  function setTheme(id) {
    S.settings.theme = id;
    applyTheme(); save();
    renderThemePicker($('#themeGrid'));
    renderThemePicker($('#themeGridModal'));
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-theme-opt]');
    if (b) setTheme(b.dataset.themeOpt);
  });
  const openThemes = () => { renderThemePicker($('#themeGridModal')); $('#themeModal').showModal(); };
  darkMQ.addEventListener?.('change', applyTheme);
  $('#themeToggle').addEventListener('click', openThemes);

  $('#subjectList').addEventListener('change', e => {
    const el = e.target.closest('[data-subj]');
    if (!el) return;
    const s = getSubject(el.closest('[data-id]').dataset.id);
    if (el.dataset.subj === 'color') s.color = el.value;
    else if (el.value.trim()) s.name = el.value.trim();
    else el.value = s.name;
    save(); renderAll();
  });
  $('#subjectAdd').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim();
    if (!name) return;
    if (S.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) { toast('That subject already exists'); return; }
    S.subjects.push({ id: uid(), name, color: f.color.value });
    f.name.value = '';
    save(); renderAll();
  });

  $('#exportBtn').addEventListener('click', () => {
    persist();
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pomodoro-os-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded');
  });
  $('#importInput').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.tasks) || !data.settings) throw new Error('bad');
        if (!confirm('Replace all current data with this backup?')) return;
        stopAmbient(false);
        S = normalize(data);
        S.timer.running = false; S.timer.endAt = null;
        persist(); applyTheme(); renderAll();
        toast('Backup restored');
      } catch (err) { toast('That file is not a valid Pomodoro OS backup'); }
    };
    r.readAsText(file);
  });
  $('#resetAllBtn').addEventListener('click', () => {
    if (!confirm('Erase all tasks, sessions, exams and settings? This cannot be undone.')) return;
    stopAmbient(false);
    S = defaultState();
    persist(); applyTheme(); renderAll();
    toast('All data erased');
  });

  // ---------- Global events ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const host = el.closest('[data-id]');
    const id = host && host.dataset.id;
    switch (el.dataset.act) {
      case 'toggle': toggleComplete(id, el); break;
      case 'edit': openTask(id); break;
      case 'focus': focusOn(id); break;
      case 'delete': deleteTask(id); break;
      case 'add-day': openTask(null, { due: el.dataset.date }); break;
      case 'del-exam': {
        const i = S.exams.findIndex(x => x.id === id);
        const [ex] = S.exams.splice(i, 1);
        save(); renderAll();
        toast('Exam removed', { label: 'Undo', fn: () => { S.exams.splice(i, 0, ex); save(); renderAll(); } });
        break;
      }
      case 'del-subject': {
        const s = getSubject(id);
        const used = S.tasks.filter(t => t.subjectId === id).length;
        if (used && !confirm(`Delete “${s.name}”? ${used} task${used === 1 ? '' : 's'} will keep their data but lose this subject.`)) return;
        S.subjects = S.subjects.filter(x => x.id !== id);
        S.tasks.forEach(t => { if (t.subjectId === id) t.subjectId = null; });
        S.exams.forEach(x => { if (x.subjectId === id) x.subjectId = null; });
        save(); renderAll();
        break;
      }
    }
  });

  $('.mode-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b || b.dataset.mode === S.timer.mode) return;
    if (S.timer.running && !confirm('The timer is running. Switch mode and reset it?')) return;
    setMode(b.dataset.mode);
  });
  $('#toggleBtn').addEventListener('click', toggleTimer);
  $('#miniToggle').addEventListener('click', toggleTimer);
  $('#resetBtn').addEventListener('click', resetTimer);
  $('#skipBtn').addEventListener('click', skipTimer);
  $('#activeTaskSelect').addEventListener('change', e => { S.timer.activeTaskId = e.target.value || null; save(); renderAll(); });
  $('#ambientSelect').addEventListener('change', e => {
    S.settings.ambient = e.target.value; save(); ensureAudio(); updateAmbient();
    if (e.target.value !== 'off' && !S.timer.running) toast('Focus sound will play while the focus timer runs');
  });
  $('#intention').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) S.intentions[today()] = v; else delete S.intentions[today()];
    save();
  });
  $('#focusQuickAdd').addEventListener('submit', e => { e.preventDefault(); quickAdd(e.target, { due: today() }); });
  $('#tasksQuickAdd').addEventListener('submit', e => {
    e.preventDefault();
    quickAdd(e.target, { due: taskFilter === 'today' ? today() : null, subjectId: subjectFilter || null });
  });
  $('#newTaskBtn').addEventListener('click', () => openTask(null, { due: taskFilter === 'today' ? today() : '', subjectId: subjectFilter }));
  $('#taskFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (b) { taskFilter = b.dataset.filter; renderTasks(); }
  });
  $('#subjectFilter').addEventListener('change', e => { subjectFilter = e.target.value; renderTasks(); });
  $('#taskSearch').addEventListener('input', e => { searchQ = e.target.value.trim(); renderTasks(); });
  $('#weekPrev').addEventListener('click', () => { weekOffset--; renderPlanner(); });
  $('#weekNext').addEventListener('click', () => { weekOffset++; renderPlanner(); });
  $('#weekToday').addEventListener('click', () => { weekOffset = 0; renderPlanner(); });
  $('#statsRange').addEventListener('click', e => {
    const b = e.target.closest('[data-range]');
    if (b) { statsRange = +b.dataset.range; renderStats(); }
  });
  $('#examForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    S.exams.push({ id: uid(), title: f.title.value.trim(), subjectId: f.subject.value || null, date: f.date.value });
    f.reset();
    save(); renderAll();
    toast('Exam added');
  });

  // Drag & drop scheduling in the planner
  let dragId = null;
  document.addEventListener('dragstart', e => {
    const c = e.target.closest?.('.pchip');
    if (!c) return;
    dragId = c.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    c.classList.add('dragging');
  });
  document.addEventListener('dragend', () => {
    dragId = null;
    $$('.dragging, .drop-target').forEach(el => el.classList.remove('dragging', 'drop-target'));
  });
  document.addEventListener('dragover', e => {
    const z = e.target.closest?.('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.drop-target').forEach(el => el !== z && el.classList.remove('drop-target'));
    z.classList.add('drop-target');
  });
  document.addEventListener('drop', e => {
    const z = e.target.closest?.('[data-drop]');
    if (!z || !dragId) return;
    e.preventDefault();
    const t = getTask(dragId);
    if (t) {
      t.due = z.dataset.drop || null;
      save(); renderAll();
      toast(t.due ? `Moved to ${dueInfo(t.due).text}` : 'Date removed');
    }
  });

  // Zen mode
  function toggleZen(force) {
    const on = force ?? !document.body.classList.contains('zen');
    if (on && view !== 'focus') location.hash = '#focus';
    document.body.classList.toggle('zen', on);
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  $('#zenBtn').addEventListener('click', () => toggleZen(true));
  $('#zenExit').addEventListener('click', () => toggleZen(false));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('zen'); });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]') || $('dialog[open]')) return;
    const k = e.key;
    if (k === ' ') {
      if (e.target.closest('button, a')) return;
      e.preventDefault(); toggleTimer();
    } else if (k === 'r' || k === 'R') resetTimer();
    else if (k === 's' || k === 'S') skipTimer();
    else if (k === 'z' || k === 'Z') toggleZen();
    else if (k === 'Escape' && document.body.classList.contains('zen')) toggleZen(false);
    else if (k === '?') $('#helpModal').showModal();
    else if (k === 't' || k === 'T') openThemes();
    else if (k === 'n' || k === 'N') {
      e.preventDefault();
      document.body.classList.remove('zen');
      if (view !== 'tasks' && view !== 'focus') location.hash = '#focus';
      setTimeout(() => $(view === 'tasks' ? '#tasksQuickAdd input' : '#focusQuickAdd input').focus(), 30);
    } else if (/^[1-5]$/.test(k)) location.hash = '#' + VIEWS[+k - 1];
  });

  // ---------- Router & render ----------
  let view = 'focus';
  function go(v) {
    if (!VIEWS.includes(v)) v = 'focus';
    const changed = v !== view;
    view = v;
    if (v !== 'focus') document.body.classList.remove('zen');
    $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
    $$('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === v));
    $('#miniTimer').hidden = v === 'focus';
    renderView();
    if (changed) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (view === 'stats') renderStats(); }, 150);
  });

  function renderView() {
    if (view === 'focus') renderFocus();
    else if (view === 'tasks') renderTasks();
    else if (view === 'planner') renderPlanner();
    else if (view === 'stats') renderStats();
    else if (view === 'settings') renderSettings();
  }
  function renderAll() {
    const k = today();
    const n = S.tasks.filter(t => !t.completed && t.due && t.due <= k).length;
    $('#navTaskCount').textContent = n || '';
    renderTimer();
    if (view !== 'focus') renderFocus(); // keeps the timer's task picker current
    renderView();
  }

  // ---------- Boot ----------
  $('#ringProgress').style.strokeDasharray = RING_C;
  applyTheme();
  view = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'focus';
  go(view);
  renderAll();

  let lastDay = today();
  setInterval(() => {
    if (S.timer.running && timeLeft() <= 0) {
      S.timer.running = false;
      completeTimer();
    }
    renderTick();
    if (today() !== lastDay) { lastDay = today(); renderAll(); }
  }, 250);
})();
