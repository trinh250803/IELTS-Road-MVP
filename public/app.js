'use strict';
/* IELTS Road — single-page learner app. Hash routes: #/today, #/day/N, #/roadmap, #/cards, #/writing, #/test */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOKEN_KEY = 'ielts_token';
const view = $('#view');

// ---------- Icons (24px stroke) ----------
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  cards: '<rect x="3" y="7" width="13" height="14" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v12"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
  vocab: '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>',
  grammar: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/>',
  listening: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  reading: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
  writing: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  speaking: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
  review: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  test: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  flame: '<path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 7-1-1-1.5-2-2-3-2 2-3 5-3 8 0 4 3 7 7 7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
const KIND_ICON = { vocab: 'vocab', grammar: 'grammar', strategy: 'target', listening: 'listening', reading: 'reading', writing: 'writing', speaking: 'speaking', review: 'review', test: 'test' };
const dayLabel = dow => (dow === 7 ? 'Ôn tập' : `Ngày ${dow}`);
const hours = m => `${Math.round(m / 6) / 10}h`;

const NAV = [
  ['today', 'home', 'Hôm nay'], ['roadmap', 'route', 'Lộ trình'], ['cards', 'cards', 'Từ vựng'],
  ['writing', 'pen', 'Writing'], ['test', 'clipboard', 'Kiểm tra'],
];
$('#nav').innerHTML = NAV.map(([r, i, l]) => `<a href="#/${r}" data-r="${r}">${icon(i)}<span>${l}</span></a>`).join('');

function token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { setToken(null); showAuth(); throw new Error('Phiên đăng nhập hết hạn'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Trình duyệt không hỗ trợ đọc');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- Auth ----------
let mode = 'login';
let me = null;
function showAuth() {
  $('#shell').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  fillDemo();
}
// Test environments expose a demo account (DEMO_ACCOUNT on the server); prefill the login form with it.
async function fillDemo() {
  const res = await fetch('/api/auth/demo').catch(() => null);
  if (!res || !res.ok) return;
  const d = await res.json();
  const f = $('#auth-form');
  if (mode !== 'login' || f.username.value) return;
  f.username.value = d.username;
  f.password.value = d.password;
  $('#demo-hint').textContent = 'Tài khoản dùng thử đã được điền sẵn, bấm Đăng nhập.';
  $('#demo-hint').classList.remove('hidden');
}
document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
  document.querySelector('.reg-only').classList.toggle('hidden', mode !== 'register');
  $('#auth-submit').textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
  $('#auth-error').textContent = '';
}));
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api(`/api/auth/${mode}`, { method: 'POST', body: f });
    setToken(r.token);
    await start(mode === 'register' ? '#/test' : null);
  } catch (err) { $('#auth-error').textContent = err.message; }
});
async function logout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setToken(null);
  showAuth();
}
$('#logout').addEventListener('click', logout);
$('#logout-m').addEventListener('click', logout);

async function start(route) {
  me = await api('/api/auth/me');
  $('#me-name').textContent = me.full_name;
  $('#me-avatar').textContent = (me.full_name.trim().split(/\s+/).pop() || '?')[0].toUpperCase();
  $('#auth').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  if (route && location.hash !== route) location.hash = route; else render();
}

// ---------- Router ----------
const routes = { today: renderToday, day: renderDay, roadmap: renderRoadmap, cards: renderCards, writing: renderWriting, test: renderTest };
async function render() {
  const [name, arg] = (location.hash.replace(/^#\//, '') || 'today').split('/');
  const fn = routes[name] || renderToday;
  const active = name === 'day' ? 'roadmap' : (routes[name] ? name : 'today');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.r === active));
  view.innerHTML = '<p class="muted">Đang tải…</p>';
  try { await fn(arg); } catch (err) { view.innerHTML = `<div class="card error">${esc(err.message)}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);

// ---------- Shared pieces ----------
function taskItem(day, t, done) {
  const isDone = done.includes(t.id);
  return `<li class="task k-${t.kind} ${isDone ? 'done' : ''}">
    <span class="kind">${icon(KIND_ICON[t.kind] || 'checkCircle')}</span>
    <div class="body">
      <div class="lbl">${esc(t.label)}</div>
      <div class="det">${esc(t.detail)}</div>
      ${t.lesson_id ? `<a class="lesson" href="#/day/${day}">Học bài →</a>` : ''}
    </div>
    <span class="min">${t.minutes}′</span>
    <button class="check" data-day="${day}" data-task="${t.id}" aria-pressed="${isDone}" aria-label="Đánh dấu hoàn thành">${icon('check')}</button>
  </li>`;
}
function taskList(day, tasks, done) {
  return `<ul class="tasks">${tasks.map(t => taskItem(day, t, done)).join('')}</ul>`;
}
function bindTasks(after) {
  view.querySelectorAll('.check').forEach(btn => btn.addEventListener('click', async () => {
    const li = btn.closest('.task');
    const next = !li.classList.contains('done');
    li.classList.toggle('done', next);
    try {
      const r = await api(`/api/days/${btn.dataset.day}/tasks/${btn.dataset.task}`, { method: 'PUT', body: { done: next } });
      btn.setAttribute('aria-pressed', next);
      if (r.complete) toast('Hoàn thành ngày học. Giỏi lắm!');
      after && after(r);
    } catch (err) { li.classList.toggle('done', !next); toast(err.message); }
  }));
}
function journey(phases, current) {
  return `<div class="journey">${phases.map(p => `
    <div class="jstep ph${p.phase} ${p.phase === current ? 'now' : p.phase < current ? 'past' : ''}">
      <b>${p.phase}. ${esc(p.title)}</b>Tuần ${p.weeks[0]}–${p.weeks[1]}</div>`).join('')}</div>`;
}
function ring(pct, label, sub) {
  const r = 52, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="${r}"/>
    <circle class="fg" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(pct, 100) / 100)}"/></svg>
    <div class="ring-label"><b>${label}</b><span>${sub}</span></div></div>`;
}
const stat = (ic, color, soft, value, label) =>
  `<div class="stat"><span class="ic" style="background:${soft};color:${color}">${icon(ic)}</span><div><b>${value}</b><span>${label}</span></div></div>`;

// ---------- Today ----------
let roadmapCache = null;
async function getRoadmap() { return (roadmapCache = roadmapCache || await api('/api/roadmap')); }

async function renderToday() {
  const [d, rm] = await Promise.all([api('/api/dashboard'), getRoadmap()]);
  const t = d.today;
  const doneMin = () => t.tasks.filter(x => t.done.includes(x.id)).reduce((s, x) => s + x.minutes, 0);
  const h = new Date().getHours();
  const hello = h < 11 ? 'Chào buổi sáng' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const first = me ? me.full_name.trim().split(/\s+/).pop() : '';
  view.innerHTML = `
    <div class="page-head"><h1>${hello}${first ? `, ${esc(first)}` : ''}</h1>
      <p>Tuần ${t.week} · ${dayLabel(t.day_of_week)} · Giai đoạn ${esc(d.phase.title)}</p></div>
    ${d.placement ? '' : `<div class="note info">${icon('info')}<div>Bạn chưa làm bài kiểm tra đầu vào. <a href="#/test"><b>Làm ngay (10 phút)</b></a> để hệ thống chọn tuần bắt đầu phù hợp.</div></div>`}
    <div class="stats">
      ${stat('flame', '#e8590c', '#fff0e6', d.streak, 'ngày liên tiếp')}
      ${stat('clock', '#0d9488', '#e3f5f3', hours(d.minutes_7d), '7 ngày qua · mục tiêu 18h')}
      ${stat('cards', '#7c3aed', '#f3edff', d.cards_due, 'thẻ từ cần học hôm nay')}
      ${stat('route', '#4f46e5', '#eef0ff', `${d.progress_pct}%`, `${d.days_finished}/${d.days_total} ngày lộ trình`)}
    </div>
    <div class="card">
      <div class="hero">
        <div id="ring">${ring(doneMin() / t.minutes * 100, doneMin(), `/ ${t.minutes} phút`)}</div>
        <div>
          <span class="chip primary">Ngày ${t.day} / 84</span>
          <h2>${esc(t.week_title)}</h2>
          <div class="goal">${icon('checkCircle')}<span>Mục tiêu tuần: ${esc(t.can_do)}</span></div>
          ${journey(rm.phases, t.phase)}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Việc cần làm hôm nay</h3><a class="btn" href="#/day/${t.day}">${icon('grammar')} Mở bài học</a></div>
      ${taskList(t.day, t.tasks, t.done)}
    </div>`;
  bindTasks(r => {
    t.done = r.done;
    $('#ring').innerHTML = ring(doneMin() / t.minutes * 100, doneMin(), `/ ${t.minutes} phút`);
    if (r.complete) setTimeout(renderToday, 900);
  });
}

// ---------- Day detail ----------
function exercise(ex, i) {
  return `<div class="q" data-answer="${ex.answer}">
    <div class="qt"><span class="qn">${i + 1}</span>${esc(ex.q)}</div>
    <div class="opts">${ex.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')}</div>
    <div class="explain hidden">${esc(ex.explain)}</div></div>`;
}
async function renderDay(n) {
  const d = await api(`/api/days/${Number(n) || 1}`);
  const lessons = Object.values(d.lessons);
  view.innerHTML = `
    <a class="crumb" href="#/roadmap">${icon('back')} Lộ trình</a>
    <div class="page-head"><span class="chip primary">Tuần ${d.week} · ${dayLabel(d.day_of_week)}</span>
      <h1 style="margin-top:.5rem">${esc(d.title)}</h1><p>${esc(d.week_title)} · ${d.minutes} phút</p></div>
    <div class="card"><div class="card-head"><h3>Nhiệm vụ</h3></div>${taskList(d.day, d.tasks, d.done)}</div>
    ${lessons.map(l => `<div class="card">
      <h2>${esc(l.title)}</h2>
      <p class="lesson-explain" style="margin-top:.6rem">${esc(l.explain)}</p>
      <div class="examples">${l.examples.map(x => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="card-head" style="margin:1.2rem 0 0"><h3>Bài tập</h3><span class="score" data-total="${l.exercises.length}"></span></div>
      <div class="ex-list">${l.exercises.map(exercise).join('')}</div></div>`).join('')}
    ${!lessons.length && d.day_of_week !== 7 ? `<div class="card"><div class="note info">${icon('info')}<span>Bài học chi tiết cho ngày này đang được soạn. Hãy làm theo danh sách nhiệm vụ ở trên.</span></div></div>` : ''}
    ${d.words.length ? `<div class="card"><div class="card-head"><h3>Từ vựng mới (${d.words.length})</h3><a class="btn" href="#/cards">${icon('cards')} Học bằng flashcard</a></div>
      <div class="wordgrid">${d.words.map(w => `<div class="word-card">
        <div><span class="w">${esc(w.word)}</span><button class="speak" data-say="${esc(w.word)}" aria-label="Nghe">${icon('volume')}</button></div>
        <div class="ipa">${esc(w.ipa)} · ${esc(w.pos)}</div><div class="vi">${esc(w.vi)}</div><div class="ex">${esc(w.example)}</div></div>`).join('')}</div></div>` : ''}`;
  bindTasks();
  view.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
  view.querySelectorAll('.ex-list').forEach(list => {
    const score = list.parentElement.querySelector('.score');
    let right = 0, answered = 0;
    list.querySelectorAll('.q').forEach(q => q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      if (q.dataset.done) return;
      q.dataset.done = 1;
      const ok = Number(q.dataset.answer);
      q.querySelectorAll('.opt').forEach((x, j) => {
        if (j === ok) x.classList.add('right');
        else if (x === b) x.classList.add('wrong');
      });
      q.querySelector('.explain').classList.remove('hidden');
      answered++; right += Number(b.dataset.j) === ok;
      score.textContent = `Đúng ${right}/${answered}`;
    })));
  });
}

// ---------- Roadmap ----------
async function renderRoadmap() {
  roadmapCache = null;
  const r = await getRoadmap();
  const done = new Set(r.done_days);
  const currentWeek = Math.ceil(r.current_day / 7);
  const currentPhase = r.weeks.find(w => w.week === currentWeek).phase;
  const weekDone = w => [1, 2, 3, 4, 5, 6, 7].every(i => done.has((w.week - 1) * 7 + i));
  view.innerHTML = `
    <div class="page-head"><h1>Lộ trình 12 tuần</h1><p>3 giai đoạn · 12 tuần · 84 ngày · ~3 giờ mỗi ngày</p></div>

    <div class="phases">${r.phases.map(p => `
      <div class="phase-card ph${p.phase} ${p.phase === currentPhase ? 'now' : ''}">
        <div class="num">${p.phase}</div>
        <h3>${esc(p.title)}</h3><div class="wk">Tuần ${p.weeks[0]}–${p.weeks[1]}</div>
        <p>${esc(p.goal)}</p><span class="chip">${icon('target')} ${esc(p.milestone)}</span>
      </div>`).join('')}</div>

    <div class="card" style="margin-top:1rem">
      <div class="card-head"><h3>Công thức mỗi ngày học</h3><span class="chip primary">${r.minutes_per_day} phút</span></div>
      <div class="formula">${r.daily_formula.map(f => `
        <div class="fblock k-${f.kind}">${icon(KIND_ICON[f.kind])}<b>${esc(f.label)}</b><span>${f.minutes} phút</span></div>`).join('')}</div>
      <div class="card-head" style="margin:1.3rem 0 0"><h3>Nhịp mỗi tuần</h3><span class="muted small">6 ngày học mới + 1 ngày ôn tập & kiểm tra</span></div>
      <div class="rhythm">${[1, 2, 3, 4, 5, 6].map(i => `<div>Ngày ${i}</div>`).join('')}<div class="rev">Ôn tập</div></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-head" style="margin:0"><div><h3>Tuần bắt đầu của bạn</h3><p class="muted small">Gợi ý từ bài kiểm tra đầu vào, có thể đổi.</p></div>
        <select id="start-week" style="max-width:320px">${r.weeks.map(w => `<option value="${w.week}" ${w.week === r.start_week ? 'selected' : ''}>Tuần ${w.week}: ${esc(w.title)}</option>`).join('')}</select></div>
    </div>

    ${r.phases.map(p => `
      <div class="phase-title ph${p.phase}"><span class="dot"></span><h2>Giai đoạn ${p.phase}: ${esc(p.title)}</h2><span>Tuần ${p.weeks[0]}–${p.weeks[1]}</span></div>
      <div class="timeline ph${p.phase}">${r.weeks.filter(w => w.phase === p.phase).map(w => `
        <details class="week ${w.week === currentWeek ? 'now' : weekDone(w) ? 'done' : ''}" ${w.week === currentWeek ? 'open' : ''}>
          <summary>
            <div><div class="wnum">Tuần ${w.week}</div><h4>${esc(w.title)}</h4></div>
            <div class="days">${[1, 2, 3, 4, 5, 6, 7].map(i => { const day = (w.week - 1) * 7 + i;
              return `<a href="#/day/${day}" class="${done.has(day) ? 'done' : ''} ${day === r.current_day ? 'today' : ''}" title="${dayLabel(i)}">${i === 7 ? 'Ô' : i}</a>`; }).join('')}</div>
            <div class="cando">${icon('checkCircle')}<span>Sau tuần này: ${esc(w.can_do)}</span></div>
          </summary>
          <div class="week-body">
            <ol class="topics">${w.topics.map(t => `<li>${esc(t)}</li>`).join('')}<li class="rev">Ôn tập & kiểm tra tuần</li></ol>
            <div class="week-meta"><span class="chip k-vocab" style="background:var(--k-soft);color:var(--k)">${icon('vocab')} ${w.words_per_day} từ/ngày · ${esc(w.vocab_theme)}</span></div>
          </div>
        </details>`).join('')}</div>`).join('')}

    <p class="muted small" style="margin-top:1.5rem">${esc(r.note)}</p>`;
  $('#start-week').addEventListener('change', async e => {
    await api('/api/learner/start-week', { method: 'PUT', body: { week: Number(e.target.value) } });
    toast('Đã đổi tuần bắt đầu');
    renderRoadmap();
  });
  // Day links sit inside <summary>: follow the link instead of toggling the week.
  view.querySelectorAll('.days a').forEach(a => a.addEventListener('click', e => e.stopPropagation()));
}

// ---------- Flashcards ----------
async function renderCards() {
  const queue = await api('/api/vocab/queue');
  const total = queue.length;
  let shown = false;
  const draw = () => {
    if (!queue.length) {
      view.innerHTML = `<div class="flash-wrap"><div class="card result-hero">${icon('checkCircle')}
        <h2 style="margin:.5rem 0">Xong rồi!</h2><p class="muted">Không còn thẻ nào cần học hôm nay. Từ mới mở thêm khi bạn sang ngày học tiếp theo.</p>
        <p style="margin-top:1rem"><a class="btn primary" href="#/today">Về trang Hôm nay</a></p></div></div>`;
      return;
    }
    const w = queue[0];
    const doneCount = total - queue.length;
    view.innerHTML = `<div class="flash-wrap">
      <div class="page-head"><h1>Từ vựng</h1><p>Lặp lại ngắt quãng: từ càng nhớ chắc, càng lâu mới phải ôn lại.</p></div>
      <div class="flash-top"><span>${doneCount}/${total} thẻ</span><span class="chip ${w.card ? '' : 'primary'}">${w.card ? 'Ôn lại' : 'Từ mới'}</span></div>
      <div class="bar" style="margin-bottom:12px"><i style="width:${doneCount / total * 100}%"></i></div>
      <div class="card flash" id="flip">
        <div class="word">${esc(w.word)} <button class="speak" id="say" aria-label="Nghe">${icon('volume')}</button></div>
        <div class="ipa">${esc(w.ipa)} · ${esc(w.pos)}</div>
        ${shown ? `<div class="meaning">${esc(w.vi)}</div><div class="ex">${esc(w.example)}</div>` : '<div class="tap">Nhớ nghĩa trong đầu, rồi chạm để lật thẻ</div>'}
      </div>
      ${shown ? `<div class="grades">
        <button class="grade again" data-g="again">Quên<small>học lại</small></button>
        <button class="grade hard" data-g="hard">Khó<small>sớm ôn lại</small></button>
        <button class="grade good" data-g="good">Nhớ<small>ôn sau</small></button>
        <button class="grade easy" data-g="easy">Dễ<small>lâu mới ôn</small></button></div>` : ''}
    </div>`;
    $('#say').addEventListener('click', e => { e.stopPropagation(); speak(w.word); });
    if (!shown) $('#flip').addEventListener('click', () => { shown = true; draw(); });
    view.querySelectorAll('[data-g]').forEach(b => b.addEventListener('click', async () => {
      const card = await api('/api/vocab/review', { method: 'POST', body: { word_id: w.id, grade: b.dataset.g } }).catch(err => toast(err.message));
      if (!card) return;
      queue.shift();
      if (b.dataset.g === 'again') queue.push({ ...w, card });  // see it again in this session
      shown = false;
      draw();
    }));
  };
  draw();
}

// ---------- Writing ----------
const CRITERIA = { task_response: 'Task Response', coherence_cohesion: 'Coherence & Cohesion', lexical_resource: 'Lexical Resource', grammatical_range_accuracy: 'Grammar' };
function feedback(e) {
  const r = e.result;
  return `<div class="card fb">
    <div class="card-head" style="margin:0"><div class="overall"><b>${r.overall.toFixed(1)}</b><div><h3>Band ước tính</h3>
      <p class="muted small">${e.task_type === 'task1' ? 'Task 1' : 'Task 2'} · ${e.words} từ · ${new Date(e.created_at).toLocaleString('vi-VN')}</p></div></div></div>
    <div class="bands">${Object.entries(CRITERIA).map(([k, label]) => `<div class="band"><div class="name">${label}</div><b>${r[k].band.toFixed(1)}</b><p>${esc(r[k].comment)}</p></div>`).join('')}</div>
    ${r.strengths.length ? `<h3>Điểm tốt</h3><ul>${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${r.improvements.length ? `<h3>Cần cải thiện</h3><ul>${r.improvements.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${r.corrections.length ? `<h3>Sửa lỗi</h3>${r.corrections.map(c => `<div class="fix"><del>${esc(c.original)}</del><br><ins>${esc(c.corrected)}</ins><div class="explain">${esc(c.explanation)}</div></div>`).join('')}` : ''}
    ${r.sample_paragraph ? `<h3>Đoạn mẫu tham khảo</h3><p class="passage">${esc(r.sample_paragraph)}</p>` : ''}
    <p class="muted small" style="margin-top:1rem">Điểm do AI ước tính để luyện tập, không thay thế điểm thi chính thức.</p></div>`;
}
async function renderWriting() {
  const [status, history] = await Promise.all([api('/api/writing/status'), api('/api/writing/history')]);
  view.innerHTML = `
    <div class="page-head"><h1>Luyện Writing</h1><p>Viết bài, AI chấm theo 4 tiêu chí IELTS và chỉ ra lỗi cần sửa.</p></div>
    ${status.enabled ? '' : `<div class="note" style="margin-bottom:1rem">${icon('info')}<span>Tính năng chấm AI chưa được bật trên máy chủ (cần ANTHROPIC_API_KEY). Bạn vẫn có thể viết bài để tự luyện.</span></div>`}
    <div class="two">
      <form class="card" id="wform">
        <label>Dạng bài<select name="task_type"><option value="task2">Task 2 – Bài luận (≥ 250 từ, 40 phút)</option><option value="task1">Task 1 – Mô tả biểu đồ (≥ 150 từ, 20 phút)</option></select></label>
        <label>Đề bài<textarea name="prompt" style="min-height:90px" required placeholder="Dán đề bài vào đây…"></textarea></label>
        <label><span class="row" style="justify-content:space-between">Bài làm <span class="chip" id="wc">0 từ</span></span><textarea name="essay" required placeholder="Viết bài của bạn…"></textarea></label>
        <div class="row"><button class="btn primary" ${status.enabled ? '' : 'disabled'}>${icon('checkCircle')} Chấm bài</button><span class="muted small">Tối đa ${status.daily_limit} bài/ngày</span></div>
      </form>
      <div class="card"><h3>Mẹo đạt band 6</h3><ul class="tips">
        <li>${icon('check')}<span>Trả lời đúng và đủ mọi ý của đề</span></li>
        <li>${icon('check')}<span>Mỗi đoạn một ý chính, có câu chủ đề rõ ràng</span></li>
        <li>${icon('check')}<span>Dùng từ nối đa dạng: however, therefore, in addition…</span></li>
        <li>${icon('check')}<span>Kết hợp câu đơn và câu phức, ít lỗi ngữ pháp cơ bản</span></li>
        <li>${icon('check')}<span>Đủ số từ: 150 với Task 1, 250 với Task 2</span></li></ul></div>
    </div>
    <div id="result" style="margin-top:1rem"></div>
    ${history.length ? `<h2 style="margin:1.6rem 0 .8rem">Bài đã chấm</h2>${history.map(feedback).join('')}` : ''}`;
  const essay = view.querySelector('[name=essay]');
  essay.addEventListener('input', () => { $('#wc').textContent = `${(essay.value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length} từ`; });
  $('#wform').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Đang chấm… (30–60 giây)';
    try {
      const r = await api('/api/writing/grade', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      $('#result').innerHTML = feedback(r);
      $('#result').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.innerHTML = `${icon('checkCircle')} Chấm bài`;
  });
}

// ---------- Placement test ----------
const LEVEL_NAME = { A1: 'Sơ cấp', A2: 'Cơ bản', B1: 'Trung cấp', B2: 'Trung cao cấp' };
async function renderTest() {
  const t = await api('/api/placement');
  const answers = {};
  const last = t.last_result;
  let lastLevel = null;
  view.innerHTML = `
    <div class="page-head"><h1>Kiểm tra đầu vào</h1><p>20 câu từ dễ đến khó, khoảng 10–15 phút. Không biết thì bỏ qua, đừng đoán bừa, để kết quả sát nhất.</p></div>
    ${last ? `<div class="note info" style="margin-bottom:1rem">${icon('info')}<span>Lần trước: <b>${last.score}/${last.total}</b> · ${esc(last.level)} · IELTS ${esc(last.ielts_estimate)}</span></div>` : ''}
    <div class="test-bar"><span class="chip primary" id="answered">0/${t.questions.length} câu</span><div class="bar"><i id="tbar" style="width:0"></i></div></div>
    <div class="card">
      ${t.questions.map((q, i) => {
        const head = q.level !== lastLevel ? `<div class="level-head"><span class="chip primary">${q.level}</span><h3>${LEVEL_NAME[q.level] || ''}</h3></div>
          ${q.level === 'B1' ? `<p class="passage" style="margin:.6rem 0">${esc(t.passage)}</p>` : ''}` : '';
        lastLevel = q.level;
        return `${head}<div class="q" data-id="${q.id}"><div class="qt"><span class="qn">${i + 1}</span>${q.passage ? '<i class="muted">(Đọc đoạn văn)</i> ' : ''}${esc(q.q)}</div>
          <div class="opts">${q.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')}</div></div>`;
      }).join('')}
      <div style="margin-top:1.2rem"><button class="btn primary" id="submit-test">Nộp bài</button></div>
    </div>
    <div id="test-result" style="margin-top:1rem"></div>`;
  const total = t.questions.length;
  view.querySelectorAll('.q').forEach(q => q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    q.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === b));
    answers[q.dataset.id] = Number(b.dataset.j);
    const n = Object.keys(answers).length;
    $('#answered').textContent = `${n}/${total} câu`;
    $('#tbar').style.width = `${n / total * 100}%`;
  })));
  $('#submit-test').addEventListener('click', async () => {
    const r = await api('/api/placement', { method: 'POST', body: { answers } });
    roadmapCache = null;
    $('#test-result').innerHTML = `<div class="card result-hero">
      <p class="muted">Kết quả của bạn</p><div class="big">${r.score}/${r.total}</div>
      <div class="row" style="justify-content:center;margin:.7rem 0"><span class="chip primary">${esc(r.level)}</span><span class="chip ok">IELTS ước tính ${esc(r.ielts_estimate)}</span></div>
      <p class="muted small">${Object.entries(r.by_level).map(([k, v]) => `${k}: ${v.correct}/${v.total}`).join(' · ')}</p>
      <p style="max-width:560px;margin:1rem auto">${esc(r.advice)}</p><p class="muted small">${esc(r.note)}</p>
      <p style="margin-top:1.2rem"><a class="btn primary" href="#/today">Bắt đầu học từ tuần ${r.start_week}</a></p></div>`;
    $('#test-result').scrollIntoView({ behavior: 'smooth' });
  });
}

// ---------- Boot ----------
if (token()) start().catch(showAuth); else showAuth();
