'use strict';
/* IELTS Road — single-page app for learners and admins.
   Learner routes: #/today #/day/N #/roadmap #/practice #/cards #/game/match #/game/listen #/writing #/test #/exam/… #/attempt/ID #/me
   Admin routes:   #/admin #/admin/learners #/admin/learner/USERNAME #/admin/attempts
   UI strings live in i18n.js (t()); course content carries *_en fields picked by L(). */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOKEN_KEY = 'ielts_token';
const LANG_KEY = 'ielts_lang';
const view = $('#view');

// ---------- Language ----------
function store(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* private mode */ } }
function stored(key) { try { return localStorage.getItem(key); } catch { return null; } }
let LANG = stored(LANG_KEY) === 'en' ? 'en' : 'vi';
function t(key, ...args) {
  const s = (STR[LANG] && STR[LANG][key]) ?? STR.vi[key] ?? key;
  return s.replace(/\{(\d)\}/g, (_, i) => args[i] ?? '');
}
const L = (o, k) => (o ? (LANG === 'en' && o[`${k}_en`]) || o[k] : '');
const locale = () => (LANG === 'en' ? 'en-GB' : 'vi-VN');
const num = n => Number(n ?? 0).toLocaleString(locale());

function applyStatic() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll('[data-lang-switch]').forEach(el => {
    el.innerHTML = ['vi', 'en'].map(l => `<button class="${l === LANG ? 'on' : ''}" data-l="${l}">${l.toUpperCase()}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.l)));
  });
  $('#auth-submit').textContent = t(mode === 'login' ? 'auth.login' : 'auth.register');
}
function setLang(l) {
  if (l === LANG) return;
  LANG = l;
  store(LANG_KEY, l);
  applyStatic();
  buildNav();
  if (me) render();
}

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
  fwd: '<path d="m9 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13h.01"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-5-6.7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>',
  play: '<path d="M7 4v16l13-8z"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
const KIND_ICON = { vocab: 'vocab', grammar: 'grammar', strategy: 'target', listening: 'listening', reading: 'reading', writing: 'writing', speaking: 'speaking', review: 'review', test: 'test' };
const dayLabel = dow => (dow === 7 ? t('day.review') : t('day.n', dow));
const hours = m => `${Math.round(m / 6) / 10}h`;
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const when = iso => (iso ? new Date(iso).toLocaleString(locale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// ---------- Navigation ----------
const NAV = {
  learner: [['today', 'home'], ['roadmap', 'route'], ['vocab', 'vocab'], ['grammar', 'grammar'], ['practice', 'gamepad'], ['test', 'clipboard'], ['me', 'trophy']],
  admin: [['admin', 'chart'], ['admin/learners', 'users'], ['admin/attempts', 'list']],
};
const NAV_OF = { day: 'roadmap', learn: 'today', cards: 'practice', game: 'practice', writing: 'practice', exam: 'test', attempt: 'test',
  'admin/learner': 'admin/learners' };
function buildNav() {
  const items = NAV[me && me.role === 'admin' ? 'admin' : 'learner'];
  $('#nav').innerHTML = items.map(([r, i]) => `<a href="#/${r}" data-r="${r}">${icon(i)}<span>${t(`nav.${r}`)}</span></a>`).join('');
}

function token() { return stored(TOKEN_KEY); }
function setToken(v) { store(TOKEN_KEY, v); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Lang': LANG };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401) { setToken(null); showAuth(); throw new Error(t('err.session')); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}
async function download(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token()}`, 'X-Lang': LANG } });
  if (!res.ok) return toast(t('err.download'));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function csvDownload(rows, filename) {
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
}

function toast(msg, kind = '', ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast ${kind}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
}
const xpToast = n => n > 0 && toast(`+${n} XP`, 'xp');

// auto = spoken without a tap (card flip, new round): stay silent instead of warning when there is no voice
function speak(text, auto = false) {
  if (!('speechSynthesis' in window)) return auto ? null : toast(t('err.tts'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- Motion: page entrance, count-up numbers, confetti (all off under prefers-reduced-motion) ----------
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let enterTimer = null;
function enter() {
  [...view.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 8)));
  view.classList.remove('enter');
  void view.offsetWidth;  // restart the animation
  view.classList.add('enter');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => view.classList.remove('enter'), 1200);
  countUp(view);
}
// Animate the first plain integer in each [data-count] element from 0 (skips "1.234"-style numbers).
function countUp(root) {
  if (reduceMotion()) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const text = el.textContent, m = text.match(/\d+/);
    if (!m || m[0] === '0' || /^[.,]\d/.test(text.slice(m.index + m[0].length))) return;
    const end = Number(m[0]), t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 700);
      el.textContent = text.slice(0, m.index) + Math.round(end * (1 - (1 - k) ** 3)) + text.slice(m.index + m[0].length);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
function confetti(n = 90) {
  sfx.win();
  if (reduceMotion()) return;
  const colors = ['#4f46e5', '#0d9488', '#e8590c', '#f59f00', '#db2777', '#7c3aed'];
  const box = document.createElement('div');
  box.className = 'confetti';
  box.innerHTML = Array.from({ length: n }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};
    --dx:${Math.round((Math.random() - 0.5) * 240)}px;--r:${Math.round(Math.random() * 900 - 450)}deg;
    animation-delay:${(Math.random() * 0.35).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s"></i>`).join('');
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}
// ---------- Sound effects: synthesised with Web Audio (no audio files), on unless turned off in settings ----------
const SOUND_KEY = 'ielts_sound';
const soundOn = () => stored(SOUND_KEY) !== 'off';
const sfx = (() => {
  let ctx = null;
  const audio = () => {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    ctx = ctx || new A();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  // notes: [frequency Hz, start s, length s, wave, volume]
  const play = (notes, force) => {
    if (!soundOn() && !force) return;
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.02;
    notes.forEach(([f, at, len, type = 'sine', vol = 0.16]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0 + at);
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(vol, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(c.destination);
      o.start(t0 + at);
      o.stop(t0 + at + len + 0.05);
    });
  };
  return {
    right: () => play([[880, 0, 0.12], [1318, 0.08, 0.25]]),
    wrong: () => play([[233, 0, 0.16, 'triangle', 0.2], [185, 0.11, 0.26, 'triangle', 0.2]]),
    tick: () => play([[660, 0, 0.09, 'sine', 0.12], [990, 0.06, 0.15, 'sine', 0.1]]),
    flip: () => play([[420, 0, 0.07, 'triangle', 0.07], [620, 0.03, 0.07, 'triangle', 0.05]]),
    win: () => play([[523, 0, 0.16], [659, 0.1, 0.16], [784, 0.2, 0.16], [1047, 0.3, 0.45]]),
    chime: force => play([[988, 0, 0.6, 'sine', 0.2], [1319, 0.2, 0.9, 'sine', 0.16], [1976, 0.2, 0.5, 'sine', 0.04]], force),
  };
})();

// One page-level keyboard handler at a time; cleared on every route change.
let onKey = null;
function setKeys(fn) {
  if (onKey) document.removeEventListener('keydown', onKey);
  onKey = fn;
  if (fn) document.addEventListener('keydown', fn);
}

// ---------- Auth ----------
let mode = 'login';
let me = null;
function showAuth() {
  me = null;
  $('#shell').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  applyStatic();
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
  $('#demo-hint').classList.remove('hidden');
}
document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
  mode = b.dataset.mode;
  document.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
  document.querySelector('.reg-only').classList.toggle('hidden', mode !== 'register');
  $('#auth-submit').textContent = t(mode === 'login' ? 'auth.login' : 'auth.register');
  $('#auth-error').textContent = '';
}));
$('#auth-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  try {
    const r = await api(`/api/auth/${mode}`, { method: 'POST', body: f });
    setToken(r.token);
    await start(mode === 'register' ? '#/exam/placement' : null);
  } catch (err) { $('#auth-error').textContent = err.message; }
});
async function logout() {
  clearInterval(remindTimer);
  await disablePush().catch(() => {});  // this device stops receiving the signed-out learner's reminders
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setToken(null);
  location.hash = '';
  showAuth();
}
$('#logout').addEventListener('click', logout);
$('#logout-m').addEventListener('click', logout);

// Tên hiển thị: ưu tiên tên lưu trên máy (còn giữ qua mọi lần deploy), nếu không thì lấy từ tài khoản.
function displayName() {
  try { const n = localStorage.getItem('ielts_name'); if (n && n.trim()) return n.trim(); } catch (e) {}
  return (me && me.full_name) || '';
}
const firstName = () => displayName().trim().split(/\s+/).pop() || '';
function refreshName() {
  const n = displayName();
  $('#me-name').textContent = n;
  $('#me-avatar').textContent = (n.trim().split(/\s+/).pop() || '?')[0].toUpperCase();
}

async function start(route) {
  me = await api('/api/auth/me');
  refreshName();
  $('#auth').classList.add('hidden');
  $('#shell').classList.remove('hidden');
  applyStatic();
  buildNav();
  initReminders();
  if (route && location.hash !== route) location.hash = route; else render();
}

// ---------- Router ----------
const ROUTES = {
  today: renderToday, day: renderDay, learn: renderLearn, roadmap: renderRoadmap, vocab: renderLibVocab, grammar: renderLibGrammar, practice: renderPractice, cards: renderCards, game: renderGame,
  writing: renderWriting, test: renderExamHub, exam: renderExam, attempt: renderAttempt, me: renderMe,
  admin: renderAdmin, 'admin/learners': renderAdminLearners, 'admin/learner': renderAdminLearner, 'admin/attempts': renderAdminAttempts,
};
async function render() {
  stopTimer();
  stopGame();
  stopFlow();
  hideTip();
  setKeys(null);
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const isAdmin = me && me.role === 'admin';
  let name = parts[0] || (isAdmin ? 'admin' : 'today');
  let rest = parts.slice(1);
  if (name === 'admin' && rest.length) { name = `admin/${rest[0]}`; rest = rest.slice(1); }
  if (!ROUTES[name] || (isAdmin !== name.startsWith('admin'))) name = isAdmin ? 'admin' : 'today';
  const active = NAV_OF[name] || name;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.r === active));
  view.innerHTML = `<p class="muted">${t('loading')}</p>`;
  try { await ROUTES[name](rest.map(decodeURIComponent).join('/')); } catch (err) { view.innerHTML = `<div class="card error">${esc(err.message)}</div>`; }
  enter();
  window.scrollTo(0, 0);
  if (!isAdmin) refreshLevel();
}
window.addEventListener('hashchange', render);

async function refreshLevel(p) {
  try {
    p = p || await api('/api/me/profile');
    const el = $('#side-level');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="row" style="justify-content:space-between"><b>${t('lvl.level', p.level)}</b><span class="muted small">${num(p.xp)} XP</span></div>
      <div class="bar"><i style="width:${p.pct}%"></i></div>`;
  } catch { /* sidebar only */ }
}

// ---------- Reminders: Web Push (arrives with the browser closed) + an in-tab fallback with a chime ----------
/* The server sends at most one push per day at the learner's time when an external cron calls
   /api/reminders/run. Without push on this device (or without the cron), an open tab reminds instead. */
const REMINDED_KEY = 'ielts_reminded';
let remind = null;  // server settings: {enabled, time, devices, vapid_public_key, auto}
let remindTimer = null;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const localDate = () => new Date().toLocaleDateString('sv-SE');
const hhmm = () => new Date().toTimeString().slice(0, 5);
const notifyPerm = () => ('Notification' in window ? Notification.permission : 'unsupported');

async function pushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
async function enablePush() {
  if (!pushSupported()) throw new Error(t(isIOS() && !standalone() ? 'rem.ios' : 'rem.unsupported'));
  if (await Notification.requestPermission() !== 'granted') throw new Error(t('rem.denied'));
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();  // it may belong to an older server key
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(remind.vapid_public_key) });
  remind = await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() });
}
async function disablePush() {
  const sub = await pushSubscription();
  if (!sub) return;
  await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
  await sub.unsubscribe();
}
async function initReminders() {
  clearInterval(remindTimer);
  remind = null;
  if (!me || me.role === 'admin') return;
  remind = await api('/api/reminders').catch(() => null);
  if (pushSupported()) navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Re-send this device's subscription: free hosting can lose server data on restart.
  const sub = await pushSubscription().catch(() => null);
  if (sub && remind) remind = await api('/api/push/subscribe', { method: 'POST', body: sub.toJSON() }).catch(() => remind);
  remindTimer = setInterval(checkTabReminder, 30000);
  checkTabReminder();
}
async function checkTabReminder() {
  const mark = `${me && me.username}:${localDate()}`;
  if (!remind || !remind.enabled || hhmm() < remind.time || stored(REMINDED_KEY) === mark) return;
  // With push on this device and the server cron running, the push is the reminder; don't double up.
  if (remind.auto && notifyPerm() === 'granted' && await pushSubscription().catch(() => null)) return;
  store(REMINDED_KEY, mark);
  const d = await api('/api/dashboard').catch(() => null);
  if (!d) return;
  const left = d.today.tasks.length - d.today.done.length;
  const msg = d.cards_due ? t('rem.tabCards', d.cards_due) : left ? t('rem.tabTasks', left) : null;
  if (!msg) return;
  sfx.chime(true);
  toast(`🔔 ${msg}`, 'remind', 10000);
  if (document.hidden && notifyPerm() === 'granted') {
    const opts = { body: msg, icon: '/icon-192.png', tag: 'ielts-reminder', data: { url: d.cards_due ? '/#/cards' : '/#/today' } };
    const reg = pushSupported() ? await navigator.serviceWorker.getRegistration() : null;
    if (reg) reg.showNotification(t('rem.tabTitle'), opts); else new Notification(t('rem.tabTitle'), opts);
  }
}
async function reminderCard(box) {
  remind = remind || await api('/api/reminders');
  const r = remind;
  const perm = notifyPerm();
  const deviceOn = perm === 'granted' && !!(await pushSubscription().catch(() => null));
  const problem = !pushSupported() ? t(isIOS() && !standalone() ? 'rem.ios' : 'rem.unsupported') : perm === 'denied' ? t('rem.denied') : '';
  // Each row: title left, control right (same line, always), description underneath, optional actions last.
  box.innerHTML = `
    <div class="card-head tight"><h3 class="row">${icon('bell')} ${t('rem.title')}</h3></div>
    <p class="muted small card-sub">${t('rem.sub')}</p>
    <div class="set-row"><b>${t('rem.daily')}</b>
      <div class="ctl"><input type="time" id="rem-time" value="${esc(r.time)}" ${r.enabled ? '' : 'disabled'}>
        <label class="switch" aria-label="${t('rem.daily')}"><input type="checkbox" id="rem-on" ${r.enabled ? 'checked' : ''}><i></i></label></div>
      <span class="desc">${t('rem.dailySub')}</span></div>
    <div class="set-row"><b>${t('rem.device')}</b>
      <div class="ctl"><span class="chip ${deviceOn ? 'ok' : ''}">${t(deviceOn ? 'rem.on' : 'rem.off')}</span></div>
      <span class="desc">${t(deviceOn ? (r.auto ? 'rem.deviceOn' : 'rem.deviceOnTab') : 'rem.deviceOff')}</span>
      ${problem ? `<span class="desc warn-text">${problem}</span>` : ''}
      <div class="actions">${deviceOn ? `<button class="btn" id="push-test">${t('rem.test')}</button><button class="btn" id="push-off">${t('rem.disable')}</button>`
        : `<button class="btn primary" id="push-on" ${problem ? 'disabled' : ''}>${icon('bell')} ${t('rem.enable')}</button>`}</div></div>
    <div class="set-row"><b>${t('rem.sound')}</b>
      <div class="ctl"><button class="btn icon-btn" id="snd-try" aria-label="${t('rem.try')}" title="${t('rem.try')}">${icon('volume')}</button>
        <label class="switch" aria-label="${t('rem.sound')}"><input type="checkbox" id="snd" ${soundOn() ? 'checked' : ''}><i></i></label></div>
      <span class="desc">${t('rem.soundSub')}</span></div>`;
  const save = async () => {
    try {
      remind = await api('/api/reminders', { method: 'PUT', body: { enabled: $('#rem-on').checked, time: $('#rem-time').value || '20:00' } });
      $('#rem-time').disabled = !remind.enabled;
      toast(t('rem.saved'));
    } catch (err) { toast(err.message); }
  };
  $('#rem-on').addEventListener('change', save);
  $('#rem-time').addEventListener('change', save);
  $('#snd').addEventListener('change', e => { store(SOUND_KEY, e.target.checked ? null : 'off'); sfx.tick(); });
  $('#snd-try').addEventListener('click', () => sfx.chime(true));
  const act = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', async () => {
    b.disabled = true;
    try { await fn(); } catch (err) { toast(err.message, '', 6000); }
    reminderCard(box);
  }); };
  act('#push-on', async () => {
    await enablePush();
    if (!remind.enabled) remind = await api('/api/reminders', { method: 'PUT', body: { enabled: true, time: remind.time } });
    toast(t('rem.enabled'), 'xp');
  });
  act('#push-off', disablePush);
  act('#push-test', async () => { await api('/api/push/test', { method: 'POST' }); toast(t('rem.testSent')); });
}

// ---------- Shared pieces ----------
function taskItem(day, task, done) {
  const isDone = done.includes(task.id);
  // The weekly test is completed by passing it, not by ticking.
  const action = task.id === 'weekly_test'
    ? (isDone ? `<span class="check" title="${t('task.passed')}">${icon('check')}</span>`
      : `<a class="btn primary" href="#/exam/week/${Math.ceil(day / 7)}">${t('exam.take')}</a>`)
    : `<button class="check" data-day="${day}" data-task="${task.id}" aria-pressed="${isDone}" aria-label="${t('task.mark')}">${icon('check')}</button>`;
  const href = task.id === 'weekly_test' ? `#/exam/week/${Math.ceil(day / 7)}` : `#/learn/${day}/${task.id}`;
  return `<li class="task k-${task.kind} ${isDone ? 'done' : ''}">
    <a class="body" href="${href}">
      <span class="kind">${icon(KIND_ICON[task.kind] || 'checkCircle')}</span>
      <div class="txt"><div class="lbl">${esc(L(task, 'label'))}</div><div class="det">${esc(L(task, 'detail'))}</div></div>
      <span class="go"><b>${isDone ? t('task.review') : t('task.start')}</b>${icon('fwd')}</span>
    </a>
    <span class="min">${task.minutes}′</span>
    ${action}
  </li>`;
}
const taskList = (day, tasks, done) => `<ul class="tasks">${tasks.map(x => taskItem(day, x, done)).join('')}</ul>`;
function bindTasks(after) {
  view.querySelectorAll('button.check').forEach(btn => btn.addEventListener('click', async () => {
    const li = btn.closest('.task');
    const next = !li.classList.contains('done');
    li.classList.toggle('done', next);
    li.classList.add('just');
    try {
      const r = await api(`/api/days/${btn.dataset.day}/tasks/${btn.dataset.task}`, { method: 'PUT', body: { done: next } });
      btn.setAttribute('aria-pressed', next);
      if (r.complete && next) { toast(t('task.dayDone'), 'xp'); confetti(); } else if (next) { xpToast(10); sfx.tick(); }
      refreshLevel();
      after && after(r);
    } catch (err) { li.classList.toggle('done', !next); toast(err.message); }
  }));
}
function journey(phases, current) {
  return `<div class="journey">${phases.map(p => `
    <div class="jstep ph${p.phase} ${p.phase === current ? 'now' : p.phase < current ? 'past' : ''}">
      <b><span class="jn">${p.phase}. </span>${esc(L(p, 'title'))}</b><span class="jw">${t('weeks.range', p.weeks[0], p.weeks[1])}</span></div>`).join('')}</div>`;
}
// The arc sweeps in from empty on first paint (CSS ringIn uses --c); setRing() then moves it with a transition.
function ring(pct, label, sub, size = 120, color = 'var(--primary)') {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">
    <circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}"/>
    <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-dasharray="${c}" data-c="${c}"
      style="--c:${c};stroke-dashoffset:${c * (1 - Math.min(pct, 100) / 100)}"/></svg>
    <div class="ring-label"><b data-count>${label}</b><span>${sub}</span></div></div>`;
}
function setRing(box, pct, label) {
  const fg = box.querySelector('.fg');
  fg.style.animation = 'none';
  fg.style.strokeDashoffset = fg.dataset.c * (1 - Math.min(pct, 100) / 100);
  box.querySelector('.ring-label b').textContent = label;
}
const stat = (ic, color, soft, value, label, href) =>
  `<${href ? `a href="${href}"` : 'div'} class="stat"><span class="ic" style="background:${soft};color:${color}">${icon(ic)}</span><div><b data-count>${value}</b><span>${label}</span></div></${href ? 'a' : 'div'}>`;

// ---------- Today ----------
let roadmapCache = null;
async function getRoadmap() { return (roadmapCache = roadmapCache || await api('/api/roadmap')); }

async function renderToday() {
  const d = await api('/api/dashboard');
  const td = d.today;
  const p = d.profile;
  const h = new Date().getHours();
  const first = me ? firstName() : '';
  refreshLevel(p);
  const doneN = td.done.length, totalN = td.tasks.length;
  const nx = td.tasks.find(x => !td.done.includes(x.id));
  view.innerHTML = `
    <div class="page-head"><h1>${t(h < 11 ? 'today.morning' : h < 18 ? 'today.afternoon' : 'today.evening')}${first ? `, ${esc(first)}` : ''}</h1></div>
    ${d.placement ? '' : `<div class="note info">${icon('info')}<div>${t('today.noPlacement')} <a href="#/exam/placement"><b>${t('today.takeNow')}</b></a></div></div>`}
    <div class="card today-card ph${td.phase}">
      <div class="today-top"><span class="chip primary">${t('today.dayOf', td.day)}</span><span class="muted small">${t('week.n', td.week)}</span></div>
      <h2>${esc(L(td, 'week_title'))}</h2>
      <div class="goal">${icon('target')}<span>${esc(L(td, 'can_do'))}</span></div>
      <div class="today-prog"><div class="bar"><i style="width:${doneN / totalN * 100}%"></i></div><span>${t('today.progress', doneN, totalN)}</span></div>
      ${nx ? `<a class="btn primary big block start-cta" href="#/learn/${td.day}/${nx.id}">${icon('play')} ${t(doneN ? 'today.continue' : 'today.start')}</a>`
        : `<div class="note ok">${icon('checkCircle')}<span>${t('today.allDone')}</span></div>`}
      ${taskList(td.day, td.tasks, td.done)}
    </div>`;
  bindTasks(r => { renderToday().then(enter); });
}

// ---------- Day detail ----------
function exercise(ex, i) {
  return `<div class="q" data-answer="${ex.answer}">
    <div class="qt"><span class="qn">${i + 1}</span>${esc(ex.q)}</div>
    <div class="opts">${ex.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')}</div>
    <div class="explain hidden">${esc(L(ex, 'explain'))}</div></div>`;
}
async function renderDay(n) {
  const d = await api(`/api/days/${Number(n) || 1}`);
  const lessons = Object.values(d.lessons);
  view.innerHTML = `
    <a class="crumb" href="#/roadmap">${icon('back')} ${t('nav.roadmap')}</a>
    <div class="page-head"><span class="chip primary">${t('week.n', d.week)} · ${dayLabel(d.day_of_week)}</span>
      <h1 style="margin-top:.5rem">${esc(L(d, 'title'))}</h1><p>${esc(L(d, 'week_title'))} · ${t('min', d.minutes)}</p></div>
    <div class="card"><div class="card-head"><h3>${t('day.tasks')}</h3></div>${taskList(d.day, d.tasks, d.done)}</div>
    ${lessons.map(l => `<div class="card">
      <h2>${esc(L(l, 'title'))}</h2>
      <p class="lesson-explain" style="margin-top:.6rem">${esc(L(l, 'explain'))}</p>
      <div class="examples">${l.examples.map(x => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="card-head" style="margin:1.2rem 0 0"><h3>${t('day.exercises')}</h3>
        <div class="row"><span class="score"></span><button class="btn retry hidden">${icon('review')} <span></span></button></div></div>
      <div class="ex-list">${l.exercises.map(exercise).join('')}</div></div>`).join('')}
    ${!lessons.length && d.day_of_week !== 7 ? `<div class="card"><div class="note info">${icon('info')}<span>${t('day.soon')}</span></div></div>` : ''}
    ${d.words.length ? `<div class="card"><div class="card-head"><h3>${t('day.words', d.words.length)}</h3><a class="btn" href="#/cards">${icon('cards')} ${t('day.studyCards')}</a></div>
      <div class="wordgrid">${d.words.map(w => `<div class="word-card">
        <div><span class="w">${esc(w.word)}</span><button class="speak" data-say="${esc(w.word)}" aria-label="${t('listen')}">${icon('volume')}</button></div>
        <div class="ipa">${esc(w.ipa)} · ${esc(w.pos)}</div><div class="vi">${esc(w.vi)}</div><div class="ex">${esc(w.example)}</div></div>`).join('')}</div></div>` : ''}`;
  bindTasks();
  view.querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
  view.querySelectorAll('.ex-list').forEach(list => wireExerciseList(list));
}
// Wrong answers can be retried with the options reshuffled: recalling again after feedback is what makes it stick.
// onChange({finished, wrong, qs}) lets the guided flow auto-advance once every question is right.
function wireExerciseList(list, onChange) {
  const card = list.closest('.card') || list.parentElement;
  const score = card.querySelector('.score');
  const retry = card.querySelector('.retry');
  const qs = [...list.querySelectorAll('.q')];
  const update = () => {
    const answered = qs.filter(q => q.dataset.done).length;
    const wrong = qs.filter(q => q.dataset.done === 'wrong').length;
    const finished = answered === qs.length;
    if (score) score.textContent = finished && !wrong ? t('day.allRight') : answered ? t('day.score', answered - wrong, answered) : '';
    if (retry) { retry.classList.toggle('hidden', !finished || !wrong); retry.querySelector('span').textContent = t('day.retry', wrong); }
    if (finished && !wrong && !onChange) confetti(50);
    onChange && onChange({ finished, wrong, qs });
  };
  qs.forEach(q => q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    if (q.dataset.done) return;
    const ok = Number(q.dataset.answer);
    q.dataset.done = Number(b.dataset.j) === ok ? 'right' : 'wrong';
    sfx[q.dataset.done]();
    q.querySelectorAll('.opt').forEach(x => {
      if (Number(x.dataset.j) === ok) x.classList.add('right');
      else if (x === b) x.classList.add('wrong');
    });
    q.querySelector('.explain').classList.remove('hidden');
    update();
  })));
  if (retry) retry.addEventListener('click', () => {
    const again = qs.filter(q => q.dataset.done === 'wrong');
    again.forEach(q => {
      delete q.dataset.done;
      q.classList.add('retrying');
      const opts = q.querySelector('.opts');
      shuffle([...opts.children]).forEach(x => { x.classList.remove('right', 'wrong'); opts.appendChild(x); });
      q.querySelector('.explain').classList.add('hidden');
    });
    update();
    again[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    <div class="page-head"><p style="margin:0">${t('rm.subSimple')}</p></div>
    <div class="phases">${r.phases.map(p => `
      <div class="phase-card ph${p.phase} ${p.phase === currentPhase ? 'now' : ''}">
        <div class="num">${p.phase}</div>
        <h3>${esc(L(p, 'title'))}</h3><div class="wk">${t('weeks.range', p.weeks[0], p.weeks[1])}</div>
      </div>`).join('')}</div>
    <div class="card" style="margin-top:1rem;padding:8px"><div class="week-list">
      ${r.weeks.map(w => { const fd = (w.week - 1) * 7 + 1; const isDone = weekDone(w); const now = w.week === currentWeek;
        return `<a class="wk-row ph${w.phase} ${isDone ? 'done' : ''} ${now ? 'now' : ''}" href="#/day/${fd}">
          <span class="wk-badge">${isDone ? icon('check') : w.week}</span>
          <span class="wk-info"><b>${esc(L(w, 'title'))}</b><span>${esc(L(w, 'can_do'))}</span></span>
          ${now ? `<span class="chip primary">${t('rm.current')}</span>` : `<span class="wk-go">${icon('fwd')}</span>`}
        </a>`; }).join('')}
    </div></div>
    <div class="card" style="margin-top:1rem">
      <h3>${t('rm.start')}</h3><p class="muted small card-sub">${t('rm.startSub')}</p>
      <select id="start-week">${r.weeks.map(w => `<option value="${w.week}" ${w.week === r.start_week ? 'selected' : ''}>${t('week.n', w.week)}: ${esc(L(w, 'title'))}</option>`).join('')}</select>
    </div>`;
  $('#start-week').addEventListener('change', async e => {
    await api('/api/learner/start-week', { method: 'PUT', body: { week: Number(e.target.value) } });
    toast(t('rm.startChanged'));
    renderRoadmap();
  });
}

// ---------- Unlocked libraries: all vocabulary / all grammar, in order ----------
async function renderLibVocab() {
  const data = await api('/api/library/vocab');
  view.innerHTML = `
    <div class="page-head"><h1>${t('lib.vocabTitle')}</h1><p>${t('lib.vocabSub', data.total)}</p></div>
    ${data.days.map(d => `
      <div class="card lib-day">
        <div class="lib-head"><span class="chip primary">${t('week.n', d.week)} · ${t('lib.day', d.day)}</span>
          <span class="muted small one">${esc(L(d, 'theme'))}</span></div>
        <div class="vocab-list">${d.words.map(w => `
          <div class="vrow">
            <button type="button" class="say-btn mini" data-say="${esc(w.word)}">${icon('volume')}</button>
            <div class="vmain"><div class="vtop"><b>${esc(w.word)}</b><span class="muted small">${esc(w.ipa || '')}</span><span class="pos">${esc(w.pos || '')}</span></div>
              <div class="vvi">${esc(w.vi)}</div>
              ${w.example ? `<div class="vex">${esc(w.example)}</div>` : ''}</div>
          </div>`).join('')}</div>
      </div>`).join('')}
    <p class="muted small" style="text-align:center;margin-top:1rem">${t('lib.more')}</p>`;
  view.querySelectorAll('.say-btn').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
}

async function renderLibGrammar() {
  const data = await api('/api/library/grammar');
  view.innerHTML = `
    <div class="page-head"><h1>${t('lib.grammarTitle')}</h1><p>${t('lib.grammarSub', data.total)}</p></div>
    ${data.lessons.map((l, i) => `
      <div class="card lib-lesson">
        <div class="lib-head"><h3 class="one">${i + 1}. ${esc(L(l, 'title'))}</h3><span class="chip">${t('week.n', l.week)}</span></div>
        <p class="lib-explain">${esc(L(l, 'explain'))}</p>
        ${(l.examples || []).length ? `<ul class="lib-ex">${l.examples.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      </div>`).join('')}
    <p class="muted small" style="text-align:center;margin-top:1rem">${t('lib.more')}</p>`;
}

// ---------- Practice hub ----------
async function renderPractice() {
  const [queue, p, mem] = await Promise.all([api('/api/vocab/queue'), api('/api/me/profile'), api('/api/vocab/stats')]);
  view.innerHTML = `
    <div class="page-head"><p style="margin:0">${t('pr.sub')}</p></div>
    <div class="goal-card card">
      ${ring(p.today_xp / p.daily_goal * 100, p.today_xp, `/ ${p.daily_goal} XP`, 96, '#e8590c')}
      <div><h3>${t(p.today_xp >= p.daily_goal ? 'pr.goalDone' : 'pr.goal')}</h3><p class="muted small">${t('pr.goalSub')}</p></div>
    </div>
    <div class="practice-grid">
      <a class="play-card k-vocab" href="#/cards"><span class="kind">${icon('cards')}</span><h3>${t('pr.cards')}</h3><p>${t('pr.cardsSub')}</p>
        <span class="chip">${t('pr.cardsDue', queue.length)}</span></a>
      <a class="play-card k-reading" href="#/game/match"><span class="kind">${icon('shuffle')}</span><h3>${t('game.match')}</h3><p>${t('game.matchSub')}</p>
        <span class="chip">${t('pr.xpPer', 2)}</span></a>
      <a class="play-card k-listening" href="#/game/listen"><span class="kind">${icon('listening')}</span><h3>${t('game.listen')}</h3><p>${t('game.listenSub')}</p>
        <span class="chip">${t('pr.xpPer', 2)}</span></a>
      <a class="play-card k-writing" href="#/writing"><span class="kind">${icon('pen')}</span><h3>${t('nav.writing')}</h3><p>${t('pr.writingSub')}</p>
        <span class="chip">+30 XP</span></a>
    </div>
    <div style="margin-top:1rem">${memoryPanel(mem)}</div>`;
  bindTips(view);
}

// ---------- Memory panel: words per memory stage + 7-day review forecast ----------
const STAGES = ['new', 'learning', 'young', 'mature'];
const STAGE_COLOR = { new: '#c9cede', learning: '#e8590c', young: '#4f46e5', mature: '#0f9d6b' };
function memoryPanel(s) {
  const day = d => new Date(d).toLocaleDateString(locale(), { weekday: 'short' });
  const max = Math.max(1, ...s.forecast.map(f => f.due));
  return `<div class="card memory"><div class="card-head tight"><h3>${t('mem.title')}</h3>
      <span class="chip ok">${icon('checkCircle')} ${t('mem.matureOf', s.stages.mature, s.total)}</span></div>
    <p class="muted small card-sub">${t('mem.sub')}</p>
    <div class="stack-bar">${STAGES.filter(k => s.stages[k]).map(k =>
      `<i style="flex:${s.stages[k]};background:${STAGE_COLOR[k]}" data-tip="<b>${t(`mem.${k}`)}</b><br>${s.stages[k]}"></i>`).join('')}</div>
    <div class="legend stages">${STAGES.map(k => `<span><i style="background:${STAGE_COLOR[k]}"></i>${t(`mem.${k}`)} <b>${s.stages[k]}</b></span>`).join('')}</div>
    <div class="muted small sub-title">${t('mem.forecast')}</div>
    <div class="forecast">${s.forecast.map((f, i) => `<div class="fc ${i ? '' : 'now'}"
        data-tip="<b>${new Date(f.date).toLocaleDateString(locale(), { weekday: 'long', day: '2-digit', month: '2-digit' })}</b><br>${t('mem.dueN', f.due)}">
      <b>${f.due}</b><span class="col"><i style="height:${f.due / max * 100}%"></i></span><span class="lbl">${i ? day(f.date) : t('mem.today')}</span></div>`).join('')}</div>
  </div>`;
}

// ---------- Flashcards ----------
/* One tap flips the card (front asks, back answers), then a swipe grades it: left = "Khó nhớ", right = "Dễ nhớ".
   Two outcomes only — swipe right maps to SM-2 "good", swipe left to "again" (comes back this session + soon).
   Words reviewed twice are sometimes asked in reverse (Vietnamese + a gapped example → recall the English).
   Buttons under the card do the same for those who prefer tapping; ←/→ grade on a keyboard. */
const SWIPE_PX = 80;  // drag past this to commit
const ivl = d => (d <= 0 ? t('iv.now') : d >= 30 ? t('iv.months', Math.round(d / 30)) : t('iv.days', d));
function markWord(sentence, word, blank) {
  const m = sentence.match(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'i'));
  if (!m) return blank ? '' : esc(sentence);
  const hit = blank ? '<span class="blank">______</span>' : `<mark>${esc(m[0])}</mark>`;
  return esc(sentence.slice(0, m.index)) + hit + esc(sentence.slice(m.index + m[0].length));
}
async function renderCards(flow) {
  flow = flow && typeof flow === 'object' ? flow : null;
  const queue = await api('/api/vocab/queue');
  const total = queue.length;
  let reviewed = 0, recalled = 0;
  const done = async () => {
    if (flow) return flowComplete(flow);
    const mem = await api('/api/vocab/stats').catch(() => null);
    view.innerHTML = `<div class="flash-wrap"><div class="card result-hero"><span class="done-ic">${icon('checkCircle')}</span>
        <h2 style="margin:.5rem 0">${t('cards.done')}</h2><p class="muted">${t('cards.doneSub')}</p>
        ${reviewed ? `<p style="margin-top:.6rem"><span class="chip ok">${t('cards.session', reviewed, Math.round(recalled / reviewed * 100))}</span></p>` : ''}
        <div class="row" style="justify-content:center;margin-top:1rem"><a class="btn primary" href="#/game/match">${t('game.match')}</a><a class="btn" href="#/today">${t('cards.home')}</a></div></div>
      ${mem ? `<div style="margin-top:1rem">${memoryPanel(mem)}</div>` : ''}</div>`;
    bindTips(view);
    enter();
    if (reviewed) confetti();
  };
  if (!total) return done();
  view.innerHTML = `<div class="flash-wrap">
    <a class="crumb" href="${flow ? '#/today' : '#/practice'}">${icon('back')} ${t(flow ? 'nav.today' : 'nav.practice')}</a>
    ${flow ? flowSteps(flow) : ''}
    <div class="page-head"><h1>${t('pr.cards')}</h1></div>
    <div class="flash-top"><span id="fc-count"></span><span class="chip" id="fc-kind"></span></div>
    <div class="bar" style="margin-bottom:14px"><i id="fc-bar" style="width:0"></i></div>
    <div id="fc"></div>
    <p class="muted small keys">${t('cards.keys')}</p>
  </div>`;
  let w, flipped, busy, el, down = null, moved = false;
  const setDrag = (dx, animate) => {
    el.style.transition = animate ? 'transform .25s var(--ease)' : 'none';
    el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    el.querySelector('.swipe-tag.yes').style.opacity = Math.max(0, Math.min(1, dx / SWIPE_PX));
    el.querySelector('.swipe-tag.no').style.opacity = Math.max(0, Math.min(1, -dx / SWIPE_PX));
  };
  const flip = () => {
    if (flipped) return;
    flipped = true;
    el.classList.add('flipped');
    sfx.flip();
    $('#grades').classList.add('show');
    speak(w.word, true);
  };
  // g: 'good' (dễ nhớ) or 'again' (khó nhớ); dir: +1 right, -1 left
  const grade = async (g, dir) => {
    if (!flipped || busy) return;
    busy = true;
    el.style.transition = 'transform .24s ease-in, opacity .24s';
    el.style.transform = `translateX(${dir * 480}px) rotate(${dir * 18}deg)`;
    el.style.opacity = '0';
    g === 'again' ? sfx.wrong() : sfx.tick();
    const card = await api('/api/vocab/review', { method: 'POST', body: { word_id: w.id, grade: g } }).catch(err => toast(err.message));
    busy = false;
    if (!card) return draw();  // error: put the same card back
    reviewed++;
    recalled += g === 'good';
    queue.shift();
    if (g === 'again') queue.push({ ...w, card, preview: { again: 0, good: 1 } });  // lapsed: see it again this session
    setTimeout(draw, 140);
  };
  const draw = () => {
    if (!queue.length) return done();
    w = queue[0];
    flipped = false; down = null; moved = false;
    const reverse = !!w.card && w.card.reps >= 2 && Math.random() < 0.5;
    const doneCount = total - queue.length;
    $('#fc-count').textContent = t('cards.count', doneCount, total);
    $('#fc-kind').textContent = t(reverse ? 'cards.reverse' : w.card ? 'cards.review' : 'cards.new');
    $('#fc-kind').className = `chip ${reverse ? 'warn' : w.card ? '' : 'primary'}`;
    $('#fc-bar').style.width = `${Math.min(100, doneCount / total * 100)}%`;
    const say = `<button class="speak" data-say aria-label="${t('listen')}">${icon('volume')}</button>`;
    const front = reverse
      ? `<div class="meaning">${esc(w.vi)}</div><div class="ex">${markWord(w.example, w.word, true)}</div><div class="tap">${t('cards.tapRev')}</div>`
      : `<div class="word">${esc(w.word)} ${say}</div><div class="ipa">${esc(w.ipa)} · ${esc(w.pos)}</div><div class="tap">${t('cards.tap')}</div>`;
    const back = `<div class="word sm">${esc(w.word)} ${say}</div><div class="ipa">${esc(w.ipa)} · ${esc(w.pos)}</div>
      <div class="meaning">${esc(w.vi)}</div><div class="ex">${markWord(w.example, w.word, false)}</div>`;
    const dueGood = w.preview ? w.preview.good : 1, dueAgain = w.preview ? w.preview.again : 0;
    $('#fc').innerHTML = `
      <div class="flip" id="flip" tabindex="0" role="button" aria-label="${t('cards.tap')}">
        <div class="inner"><div class="face front">${front}</div><div class="face back">${back}</div></div>
        <span class="swipe-tag no">${t('cards.hard')}</span><span class="swipe-tag yes">${t('cards.easy')}</span></div>
      <div class="grades two" id="grades">
        <button class="grade hard" data-g="again"><b>${icon('back')} ${t('cards.hard')}</b><small>${ivl(dueAgain)}</small></button>
        <button class="grade good" data-g="good"><b>${t('cards.easy')} ${icon('fwd')}</b><small>${ivl(dueGood)}</small></button></div>`;
    el = $('#flip');
    el.addEventListener('click', () => { if (!moved) flip(); });
    $('#fc').querySelectorAll('[data-say]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); speak(w.word); }));
    $('#fc').querySelector('[data-g="again"]').addEventListener('click', () => grade('again', -1));
    $('#fc').querySelector('[data-g="good"]').addEventListener('click', () => grade('good', 1));
    el.addEventListener('pointerdown', e => {
      if (!flipped || busy || e.target.closest('[data-say]')) return;
      down = e.clientX; moved = false; el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (down == null) return;
      const dx = e.clientX - down;
      if (Math.abs(dx) > 4) moved = true;
      setDrag(dx, false);
    });
    const end = e => {
      if (down == null) return;
      const dx = e.clientX - down; down = null;
      if (dx > SWIPE_PX) grade('good', 1);
      else if (dx < -SWIPE_PX) grade('again', -1);
      else { setDrag(0, true); setTimeout(() => { moved = false; }, 60); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    $('#flip').focus({ preventScroll: true });
  };
  setKeys(e => {
    if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (flipped && e.key === 'ArrowRight') grade('good', 1);
    else if (flipped && e.key === 'ArrowLeft') grade('again', -1);
  });
  draw();
}

// ---------- Mini-games ----------
let gameTimer = null;
function stopGame() { clearInterval(gameTimer); gameTimer = null; }

async function finishGame(game, correct, total, startedAt) {
  stopGame();
  const duration_s = Math.round((Date.now() - startedAt) / 1000);
  const r = await api('/api/games/result', { method: 'POST', body: { game, correct, total, duration_s } }).catch(err => toast(err.message));
  const pct = Math.round(correct / total * 100);
  const stars = pct >= 90 ? 3 : pct >= 60 ? 2 : pct > 0 ? 1 : 0;
  view.innerHTML = `
    <a class="crumb" href="#/practice">${icon('back')} ${t('nav.practice')}</a>
    <div class="card result-hero game-over">
      <div class="stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">${icon('star')}</span>`).join('')}</div>
      <h2>${t(stars === 3 ? 'game.perfect' : stars === 2 ? 'game.great' : 'game.keep')}</h2>
      <div class="big" data-count>${correct}/${total}</div>
      <div class="row" style="justify-content:center;margin:.6rem 0">
        <span class="chip">${icon('clock')} ${mmss(duration_s)}</span>
        ${r ? `<span class="chip xp">+${r.xp} XP</span><span class="chip">${t('game.best', r.best_pct)}</span>` : ''}
      </div>
      ${r && r.capped ? `<p class="muted small">${t('game.capped')}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:1rem">
        <button class="btn primary" id="again">${icon('review')} ${t('game.again')}</button><a class="btn" href="#/practice">${t('game.other')}</a></div>
    </div>`;
  $('#again').addEventListener('click', render);
  enter();
  if (stars === 3) confetti();
  if (r) { xpToast(r.xp); refreshLevel(); }
}

async function renderGame(kind) {
  const words = await api('/api/games/words');
  if (kind === 'listen') return playListen(words);
  return playMatch(words);
}

function gameHeader(title, sub) {
  return `<a class="crumb" href="#/practice">${icon('back')} ${t('nav.practice')}</a>
    <div class="page-head"><h1>${title}</h1><p>${sub}</p></div>
    <div class="test-bar"><span class="chip" id="g-clock">${icon('clock')} 00:00</span><div class="bar"><i id="g-bar" style="width:0"></i></div><span class="chip primary" id="g-score"></span></div>`;
}

function playMatch(words) {
  const PAIRS = 6;
  const picked = shuffle(words).slice(0, PAIRS);
  const startedAt = Date.now();
  let selected = null, matched = 0, firstTry = 0;
  const missed = new Set();
  view.innerHTML = `${gameHeader(t('game.match'), t('game.matchSub'))}
    <div class="match">
      <div class="col">${shuffle(picked).map(w => `<button class="tile" data-side="en" data-id="${w.id}">${esc(w.word)}</button>`).join('')}</div>
      <div class="col">${shuffle(picked).map(w => `<button class="tile vi" data-side="vi" data-id="${w.id}">${esc(w.vi)}</button>`).join('')}</div>
    </div>`;
  const score = () => { $('#g-score').textContent = `${matched}/${PAIRS}`; $('#g-bar').style.width = `${matched / PAIRS * 100}%`; };
  score();
  gameTimer = setInterval(() => { const c = $('#g-clock'); if (c) c.innerHTML = `${icon('clock')} ${mmss(Math.round((Date.now() - startedAt) / 1000))}`; }, 500);
  view.querySelectorAll('.tile').forEach(b => b.addEventListener('click', () => {
    if (b.classList.contains('ok')) return;
    if (b.dataset.side === 'en') speak(b.textContent);
    if (!selected || selected.dataset.side === b.dataset.side) {
      view.querySelectorAll('.tile.sel').forEach(x => x.classList.remove('sel'));
      selected = b;
      b.classList.add('sel');
      return;
    }
    const a = selected;
    selected = null;
    a.classList.remove('sel');
    if (a.dataset.id === b.dataset.id) {
      [a, b].forEach(x => x.classList.add('ok'));
      sfx.right();
      matched++;
      if (!missed.has(a.dataset.id)) firstTry++;
      score();
      if (matched === PAIRS) setTimeout(() => finishGame('match', firstTry, PAIRS, startedAt), 500);
    } else {
      missed.add(a.dataset.id); missed.add(b.dataset.id);
      sfx.wrong();
      [a, b].forEach(x => { x.classList.add('bad'); setTimeout(() => x.classList.remove('bad'), 450); });
    }
  }));
}

function playListen(words) {
  const ROUNDS = 10;
  if (!('speechSynthesis' in window)) { view.innerHTML = `<div class="card">${t('err.tts')}</div>`; return; }
  const rounds = shuffle(words).slice(0, ROUNDS);
  const startedAt = Date.now();
  let i = 0, correct = 0;
  const draw = () => {
    if (i >= rounds.length) return finishGame('listen', correct, rounds.length, startedAt);
    const w = rounds[i];
    const options = shuffle([w, ...shuffle(words.filter(x => x.id !== w.id)).slice(0, 3)]);
    view.innerHTML = `${gameHeader(t('game.listen'), t('game.listenSub'))}
      <div class="card listen">
        <button class="big-speak" id="play" aria-label="${t('listen')}">${icon('volume')}</button>
        <p class="muted small">${t('game.round', i + 1, rounds.length)}</p>
        <div class="opts center">${options.map(o => `<button class="opt big" data-id="${o.id}">${esc(o.word)}</button>`).join('')}</div>
        <div id="reveal" class="explain hidden"></div>
      </div>`;
    $('#g-score').textContent = `${correct}/${rounds.length}`;
    $('#g-bar').style.width = `${i / rounds.length * 100}%`;
    $('#play').addEventListener('click', () => speak(w.word));
    setTimeout(() => speak(w.word, true), 250);
    let answered = false;
    view.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      const ok = b.dataset.id === w.id;
      correct += ok;
      sfx[ok ? 'right' : 'wrong']();
      view.querySelectorAll('.opt').forEach(x => { if (x.dataset.id === w.id) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
      $('#reveal').innerHTML = `<b>${esc(w.word)}</b> ${esc(w.ipa)} — ${esc(w.vi)}`;
      $('#reveal').classList.remove('hidden');
      i++;
      setTimeout(draw, ok ? 900 : 1700);
    }));
  };
  gameTimer = setInterval(() => { const c = $('#g-clock'); if (c) c.innerHTML = `${icon('clock')} ${mmss(Math.round((Date.now() - startedAt) / 1000))}`; }, 500);
  draw();
}

// ---------- Achievements ----------
const BADGE_ICON = { first_step: 'check', placement: 'clipboard', streak_3: 'flame', streak_7: 'flame', streak_30: 'flame', words_25: 'cards', words_70: 'cards',
  test_pass: 'test', perfect: 'star', phase_1: 'route', phase_2: 'route', finisher: 'trophy', gamer: 'gamepad', writer: 'pen', xp_1000: 'zap' };
async function renderMe() {
  const [p, lb] = await Promise.all([api('/api/me/profile'), api('/api/leaderboard')]);
  const earned = p.badges.filter(b => b.earned).length;
  refreshLevel(p);
  view.innerHTML = `
    <div class="page-head"><h1>${t('nav.me')}</h1><p>${t('me.sub')}</p></div>
    <div class="card name-card">
      <label for="disp-name"><b>${t('me.displayName')}</b><span class="muted small">${t('me.displayNameHint')}</span></label>
      <div class="row" style="gap:.5rem"><input id="disp-name" maxlength="80" value="${esc(displayName())}" placeholder="${t('me.displayName')}">
        <button class="btn primary" id="disp-save">${t('me.save')}</button></div>
    </div>
    <div class="me-grid">
      <div class="card level-card">
        <div class="lvl-badge" data-count>${p.level}</div>
        <div style="flex:1"><h2>${t('lvl.level', p.level)}</h2>
          <p class="muted small">${t('me.toNext', num(p.next_level - p.xp), p.level + 1)}</p>
          <div class="bar thick"><i style="width:${p.pct}%"></i></div>
          <div class="row small muted" style="justify-content:space-between;margin-top:.3rem"><span>${num(p.xp)} XP</span><span>${num(p.next_level)} XP</span></div></div>
      </div>
      <div class="stats" style="margin:0">
        ${stat('zap', '#b45309', '#fff4e0', `${p.today_xp}/${p.daily_goal}`, t('stat.todayXp'))}
        ${stat('star', '#4f46e5', '#eef0ff', num(p.week_xp), t('me.weekXp'))}
        ${stat('flame', '#e8590c', '#fff0e6', p.streak, t('stat.streak'))}
        ${stat('trophy', '#0d9488', '#e3f5f3', p.best_streak, t('me.bestStreak'))}
      </div>
    </div>
    <div class="two-col">
      <div class="card"><div class="card-head"><h3>${t('me.badges')}</h3><span class="chip primary">${earned}/${p.badges.length}</span></div>
        <div class="badges">${p.badges.map(b => `<div class="badge ${b.earned ? 'on' : ''}" title="${esc(t(`badge.${b.id}.d`))}">
          <span class="bi">${icon(b.earned ? BADGE_ICON[b.id] : 'lock')}</span><b>${t(`badge.${b.id}`)}</b><span>${t(`badge.${b.id}.d`)}</span></div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><h3>${t('me.leaderboard')}</h3><span class="muted small">${t('me.lbSub')}</span></div>
        <ol class="leaderboard">${lb.top.map(r => `<li class="${r.me ? 'me' : ''}"><span class="rank r${r.rank}">${r.rank}</span>
          <span class="nm"><span class="one">${esc(r.name)}</span>${r.me ? `<span class="chip primary">${t('me.you')}</span>` : ''}</span><span class="muted small">${t('lvl.short', r.level)}</span><b>${num(r.week_xp)} XP</b></li>`).join('')}</ol>
        ${lb.me && lb.me.rank > lb.top.length ? `<ol class="leaderboard" start="${lb.me.rank}"><li class="me"><span class="rank">${lb.me.rank}</span><span class="nm">${esc(lb.me.name)}</span><span class="muted small">${t('lvl.short', lb.me.level)}</span><b>${num(lb.me.week_xp)} XP</b></li></ol>` : ''}
        <p class="muted small" style="margin-top:.8rem">${t('me.xpHow')}</p></div>
    </div>
    <div class="card reminders" id="reminders" style="margin-top:1rem"></div>`;
  const saveName = async () => {
    const name = $('#disp-name').value.trim();
    if (!name) return toast(t('me.nameEmpty'));
    try { localStorage.setItem('ielts_name', name); } catch (e) {}
    refreshName();
    try { await api('/api/auth/me', { method: 'PUT', body: { full_name: name } }); if (me) me.full_name = name; } catch (e) {}
    toast(t('me.nameSaved'));
  };
  $('#disp-save').addEventListener('click', saveName);
  $('#disp-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveName(); });
  await reminderCard($('#reminders'));
}

// ---------- Writing ----------
const CRITERIA = { task_response: 'Task Response', coherence_cohesion: 'Coherence & Cohesion', lexical_resource: 'Lexical Resource', grammatical_range_accuracy: 'Grammar' };
function feedback(e) {
  const r = e.result;
  if (r.offline) return `<div class="card fb">
    <div class="card-head" style="margin:0"><h3>${t('wr.checklist')}</h3>
      <span class="chip ${r.words >= r.target ? 'ok' : ''}">${t('wr.words', r.words)} / ${r.target}</span></div>
    <ul class="checklist">${r.checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}">${icon(c.ok ? 'checkCircle' : 'info')}<span>${esc(c.text)}</span></li>`).join('')}</ul>
    <p class="muted small" style="margin-top:.8rem">${esc(r.note)}</p></div>`;
  return `<div class="card fb">
    <div class="card-head" style="margin:0"><div class="overall"><b>${r.overall.toFixed(1)}</b><div><h3>${t('wr.band')}</h3>
      <p class="muted small">${e.task_type === 'task1' ? 'Task 1' : 'Task 2'} · ${t('wr.words', e.words)} · ${when(e.created_at)}</p></div></div></div>
    <div class="bands">${Object.entries(CRITERIA).map(([k, label]) => `<div class="band"><div class="name">${label}</div><b>${r[k].band.toFixed(1)}</b><p>${esc(r[k].comment)}</p></div>`).join('')}</div>
    ${r.strengths.length ? `<h3>${t('wr.strengths')}</h3><ul>${r.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${r.improvements.length ? `<h3>${t('wr.improve')}</h3><ul>${r.improvements.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    ${r.corrections.length ? `<h3>${t('wr.fixes')}</h3>${r.corrections.map(c => `<div class="fix"><del>${esc(c.original)}</del><br><ins>${esc(c.corrected)}</ins><div class="explain">${esc(c.explanation)}</div></div>`).join('')}` : ''}
    ${r.sample_paragraph ? `<h3>${t('wr.sample')}</h3><p class="passage">${esc(r.sample_paragraph)}</p>` : ''}
    <p class="muted small" style="margin-top:1rem">${t('wr.disclaimer')}</p></div>`;
}
async function renderWriting() {
  const [status, history] = await Promise.all([api('/api/writing/status'), api('/api/writing/history')]);
  view.innerHTML = `
    <a class="crumb" href="#/practice">${icon('back')} ${t('nav.practice')}</a>
    <div class="page-head"><h1>${t('nav.writing')}</h1><p>${t('wr.sub')}</p></div>
    ${status.enabled ? '' : `<div class="note info" style="margin-bottom:1rem">${icon('info')}<span>${t('wr.offline')}</span></div>`}
    <div class="two">
      <form class="card" id="wform">
        <label>${t('wr.type')}<select name="task_type"><option value="task2">${t('wr.task2')}</option><option value="task1">${t('wr.task1')}</option></select></label>
        <label>${t('wr.prompt')}<textarea name="prompt" style="min-height:90px" required placeholder="${t('wr.promptPh')}"></textarea></label>
        <label><span class="row" style="justify-content:space-between">${t('wr.essay')} <span class="chip" id="wc">${t('wr.words', 0)}</span></span><textarea name="essay" required placeholder="${t('wr.essayPh')}"></textarea></label>
        <div class="row"><button class="btn primary">${icon('checkCircle')} ${t(status.enabled ? 'wr.grade' : 'wr.check')}</button><span class="muted small">${t(status.enabled ? 'wr.limit' : 'wr.checkHint', status.daily_limit)}</span></div>
      </form>
      <div class="card"><h3>${t('wr.tips')}</h3><ul class="tips">${[1, 2, 3, 4, 5].map(i => `<li>${icon('check')}<span>${t(`wr.tip${i}`)}</span></li>`).join('')}</ul></div>
    </div>
    <div id="result" style="margin-top:1rem"></div>
    ${history.length ? `<h2 style="margin:1.6rem 0 .8rem">${t('wr.history')}</h2>${history.map(feedback).join('')}` : ''}`;
  const essay = view.querySelector('[name=essay]');
  essay.addEventListener('input', () => { $('#wc').textContent = t('wr.words', (essay.value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length); });
  $('#wform').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = t('wr.grading');
    try {
      const r = await api('/api/writing/grade', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      $('#result').innerHTML = feedback(r);
      $('#result').scrollIntoView({ behavior: 'smooth' });
      xpToast(30);
    } catch (err) { toast(err.message); }
    btn.disabled = false; btn.innerHTML = `${icon('checkCircle')} ${t('wr.grade')}`;
  });
}

// ---------- Guided daily flow: one task at a time, auto-marked, auto-advancing ----------
/* #/learn/DAY/TASKID opens a single task's real activity. Finishing it marks the task
   done on the server and shows "Tiếp theo →" to the next unfinished task (auto-advancing
   after a beat). Everything here runs in the browser — no API key needed. */
let flowAdvTimer = null;
function stopFlow() { clearTimeout(flowAdvTimer); flowAdvTimer = null; }

const micSupported = () => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
const normWords = s => (s.toLowerCase().match(/[a-z0-9']+/g) || []);
function speechScore(said, target) {
  const b = normWords(target);
  if (!b.length) return 0;
  const pool = normWords(said);
  let hit = 0;
  b.forEach(w => { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } });
  return Math.round(hit / b.length * 100);
}

function flowSteps(ctx) {
  return `<div class="flow-top"><div class="flow-steps">${ctx.tasks.map((x, i) =>
      `<i class="k-${x.kind} ${ctx.done.includes(x.id) ? 'done' : ''} ${i === ctx.idx ? 'now' : ''}"></i>`).join('')}</div>
    <span class="flow-count">${t('flow.step', ctx.idx + 1, ctx.tasks.length)}</span></div>`;
}
function flowHead(ctx, body) {
  const task = ctx.task;
  view.innerHTML = `
    <a class="crumb" href="#/today">${icon('back')} ${t('nav.today')}</a>
    ${flowSteps(ctx)}
    <div class="page-head learn-head k-${task.kind}"><span class="kind">${icon(KIND_ICON[task.kind] || 'home')}</span>
      <div><h1>${esc(L(task, 'label'))}</h1><p>${esc(L(task, 'detail'))}</p></div></div>
    <div id="flow-body">${body}</div>
    <div id="flow-foot"></div>`;
}
async function flowComplete(ctx, info = {}) {
  if (ctx._done) return;
  ctx._done = true;
  let r = null;
  if (!ctx.done.includes(ctx.task.id)) {
    try { r = await api(`/api/days/${ctx.day}/tasks/${ctx.task.id}`, { method: 'PUT', body: { done: true } }); }
    catch (e) { toast(e.message); ctx._done = false; return; }
  }
  const doneIds = r ? r.done : ctx.done.includes(ctx.task.id) ? ctx.done : [...ctx.done, ctx.task.id];
  const next = ctx.tasks.find(x => !doneIds.includes(x.id));
  const html = `<div class="card flow-ok">
    <span class="done-ic">${icon('checkCircle')}</span>
    <h2>${t('flow.taskDone')}</h2>
    ${info.score != null ? `<p><span class="chip ${info.score === info.total ? 'ok' : ''}">${t('flow.score', info.score, info.total)}</span></p>` : ''}
    ${next ? `<p class="muted">${t('flow.nextIs')}: <b>${esc(L(next, 'label'))}</b></p>
        <a class="btn primary big" href="#/learn/${ctx.day}/${next.id}">${t('flow.next')} ${icon('fwd')}</a>`
      : `<p>${t('flow.dayDone')}</p><a class="btn primary big" href="#/today">${t('flow.backToday')}</a>`}</div>`;
  const foot = $('#flow-foot');
  if (foot) { foot.innerHTML = html; foot.querySelector('.card').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  else { view.innerHTML = `<div class="flash-wrap">${html}</div>`; enter(); }
  refreshLevel();
  if (next) { xpToast(10); flowAdvTimer = setTimeout(() => { if (location.hash.startsWith('#/learn/')) location.hash = `#/learn/${ctx.day}/${next.id}`; }, 2800); }
  else confetti();
}

async function renderLearn(arg) {
  const [dayStr, taskId] = String(arg).split('/');
  const day = Number(dayStr) || 1;
  let d;
  try { d = await api(`/api/days/${day}`); } catch (e) { view.innerHTML = `<div class="card error">${esc(e.message)}</div>`; return; }
  const idx = d.tasks.findIndex(x => x.id === taskId);
  if (idx < 0) { location.hash = `#/day/${day}`; return; }
  const ctx = { day, idx, task: d.tasks[idx], tasks: d.tasks, done: d.done.slice(), d };
  if (ctx.task.id === 'weekly_test') { location.hash = `#/exam/week/${Math.ceil(day / 7)}`; return; }
  const k = ctx.task.kind;
  if (k === 'vocab') return renderCards(ctx);
  if (k === 'grammar' || k === 'strategy') return learnFocus(ctx);
  if (k === 'listening' || k === 'reading') return learnQuiz(ctx);
  if (k === 'speaking') return learnSpeaking(ctx);
  if (k === 'writing') return learnWriting(ctx);
  return learnGeneric(ctx);  // review-day reflect / fix-mistakes
}

function learnGeneric(ctx, notReady) {
  flowHead(ctx, `<div class="card">
    <p class="lesson-explain">${esc(L(ctx.task, 'detail'))}</p>
    <div class="note info">${icon('info')}<span>${t(notReady ? 'flow.notReady' : 'flow.selfMark')}</span></div>
    <button class="btn primary big block" id="done-it">${icon('checkCircle')} ${t('flow.markDone')}</button></div>`);
  $('#done-it').addEventListener('click', () => { sfx.tick(); flowComplete(ctx); });
}

function learnFocus(ctx) {
  const lessons = Object.values(ctx.d.lessons || {});
  if (!lessons.length) return learnGeneric(ctx);
  flowHead(ctx, lessons.map(l => `<div class="card">
      <h2>${esc(L(l, 'title'))}</h2>
      <p class="lesson-explain" style="margin-top:.6rem">${esc(L(l, 'explain'))}</p>
      <div class="examples">${l.examples.map(x => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="card-head" style="margin:1.2rem 0 0"><h3>${t('day.exercises')}</h3>
        <div class="row"><span class="score"></span><button class="btn retry hidden">${icon('review')} <span></span></button></div></div>
      <div class="ex-list">${l.exercises.map(exercise).join('')}</div></div>`).join('')
    + `<div class="note info">${icon('info')}<span>${t('flow.focusHint')}</span></div>`);
  const allQ = [...view.querySelectorAll('.q')];
  const check = () => { if (allQ.length && allQ.every(q => q.dataset.done === 'right')) flowComplete(ctx, { score: allQ.length, total: allQ.length }); };
  view.querySelectorAll('.ex-list').forEach(list => wireExerciseList(list, check));
}

async function learnQuiz(ctx) {
  let act;
  try { act = await api(`/api/days/${ctx.day}/activity/${ctx.task.id}`); } catch (e) { return learnGeneric(ctx, true); }
  if (!act.ready) return learnGeneric(ctx, true);
  const listening = ctx.task.kind === 'listening';
  flowHead(ctx, `<div class="card">
    <p class="muted small card-sub">${t(listening ? 'act.listenHint' : 'act.readHint')}</p>
    <div class="quiz">${act.items.map((it, i) => listening
      ? `<div class="q quiz-q" data-answer="${it.answer}" data-i="${i}">
          <button class="btn block play-say" data-say="${esc(it.say)}">${icon('volume')} ${t('act.playAgain')}</button>
          <div class="qt">${t('act.whatMeaning')}</div>
          <div class="opts">${it.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')}</div></div>`
      : `<div class="q quiz-q" data-answer="${it.answer}" data-i="${i}">
          <div class="qt reading"><span class="qn">${i + 1}</span>${it.sentence.replace('______', '<span class="blank">______</span>')}</div>
          <div class="hint">${t('act.hint')}: <b>${esc(it.hint)}</b></div>
          <div class="opts">${it.options.map((o, j) => `<button class="opt" data-j="${j}">${esc(o)}</button>`).join('')}</div></div>`
    ).join('')}</div></div>`);
  const qs = [...view.querySelectorAll('.quiz-q')];
  view.querySelectorAll('.play-say').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
  if (listening) setTimeout(() => speak(act.items[0].say, true), 450);
  qs.forEach(q => q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    if (q.dataset.done) return;
    const ok = Number(q.dataset.answer), right = Number(b.dataset.j) === ok;
    q.dataset.done = right ? 'right' : 'wrong';
    sfx[right ? 'right' : 'wrong']();
    q.querySelectorAll('.opt').forEach(x => { if (Number(x.dataset.j) === ok) x.classList.add('right'); else if (x === b) x.classList.add('wrong'); });
    const nx = qs.find(z => !z.dataset.done);
    if (listening && nx) setTimeout(() => speak(act.items[Number(nx.dataset.i)].say, true), 550);
    if (!nx) flowComplete(ctx, { score: qs.filter(z => z.dataset.done === 'right').length, total: qs.length });
  })));
}

async function learnSpeaking(ctx) {
  let act;
  try { act = await api(`/api/days/${ctx.day}/activity/${ctx.task.id}`); } catch (e) { return learnGeneric(ctx, true); }
  if (!act.ready) return learnGeneric(ctx, true);
  const hasMic = micSupported();
  flowHead(ctx, `<div class="card">
    <p class="muted small card-sub">${t(hasMic ? 'act.speakHint' : 'act.speakHintNoMic')}</p>
    <div class="speak-list">${act.items.map((it, i) => `<div class="speak-item" data-i="${i}">
      <div class="s-top"><div><div class="s-text">${esc(it.text)}</div><div class="s-vi">${esc(it.ipa)} · ${esc(it.vi)}</div></div>
        <button class="speak s-play" data-say="${esc(it.text)}" aria-label="${t('listen')}">${icon('volume')}</button></div>
      <div class="s-actions">
        ${hasMic ? `<button class="btn mic-btn">${icon('mic')} ${t('act.tapSpeak')}</button>`
          : `<button class="btn self-ok">${icon('checkCircle')} ${t('act.saidIt')}</button>`}
        <span class="s-result"></span></div></div>`).join('')}</div></div>`);
  const items = [...view.querySelectorAll('.speak-item')];
  view.querySelectorAll('.s-play').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
  const pass = el => {
    el.classList.add('passed');
    if (items.every(x => x.classList.contains('passed'))) flowComplete(ctx, { score: items.length, total: items.length });
  };
  const selfBtn = (el, btn) => btn.addEventListener('click', () => {
    sfx.tick(); el.querySelector('.s-result').innerHTML = `<span class="chip ok">${icon('check')} ${t('act.good')}</span>`; pass(el);
  });
  items.forEach(el => {
    if (hasMic) el.querySelector('.mic-btn').addEventListener('click', () => listenOnce(el, act.items[Number(el.dataset.i)].text, () => pass(el)));
    else selfBtn(el, el.querySelector('.self-ok'));
  });
}
// One-shot browser speech recognition: transcribe, score word overlap, pass at ≥60%.
function listenOnce(el, target, onPass) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = el.querySelector('.mic-btn'), result = el.querySelector('.s-result');
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  let got = false;
  btn.classList.add('live'); btn.innerHTML = `${icon('mic')} ${t('act.listening')}`;
  result.textContent = '';
  rec.onresult = e => {
    got = true;
    const said = e.results[0][0].transcript, score = speechScore(said, target), ok = score >= 60;
    result.innerHTML = `<span class="chip ${ok ? 'ok' : 'bad'}">${score}%</span> <span class="said">“${esc(said)}”</span>`;
    sfx[ok ? 'right' : 'wrong']();
    if (ok) onPass();
  };
  rec.onerror = ev => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
      result.innerHTML = `<button class="btn small self-ok">${icon('checkCircle')} ${t('act.saidIt')}</button>`;
      result.querySelector('.self-ok').addEventListener('click', () => { sfx.tick(); result.innerHTML = `<span class="chip ok">${icon('check')} ${t('act.good')}</span>`; onPass(); });
    } else result.innerHTML = `<span class="muted small">${t('act.micRetry')}</span>`;
  };
  rec.onend = () => { btn.classList.remove('live'); btn.innerHTML = `${icon('mic')} ${got ? t('act.again') : t('act.tapSpeak')}`; };
  try { rec.start(); } catch (e) { /* already running */ }
}

async function learnWriting(ctx) {
  const status = await api('/api/writing/status').catch(() => ({ enabled: false, daily_limit: 5 }));
  flowHead(ctx, `<div class="card">
    <div class="note ${status.enabled ? 'ok' : 'info'}" style="margin-top:0">${icon('info')}<span>${t(status.enabled ? 'wr.aiOn' : 'wr.offline')}</span></div>
    <form id="wform">
      <input type="hidden" name="task_type" value="task1">
      <label>${t('wr.prompt')}<textarea name="prompt" style="min-height:70px" required>${esc(L(ctx.task, 'detail'))}</textarea></label>
      <label><span class="row" style="justify-content:space-between">${t('wr.essay')} <span class="chip" id="wc">${t('wr.words', 0)}</span></span>
        <textarea name="essay" required placeholder="${t('wr.essayPh')}"></textarea></label>
      <button class="btn primary big block">${icon('checkCircle')} ${t(status.enabled ? 'wr.grade' : 'wr.check')}</button>
    </form>
    <div id="result" style="margin-top:1rem"></div></div>`);
  const essay = view.querySelector('[name=essay]'), label = t(status.enabled ? 'wr.grade' : 'wr.check');
  essay.addEventListener('input', () => { $('#wc').textContent = t('wr.words', (essay.value.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length); });
  $('#wform').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = t('wr.grading');
    try {
      const r = await api('/api/writing/grade', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      $('#result').innerHTML = feedback(r);
      $('#result').scrollIntoView({ behavior: 'smooth' });
      flowComplete(ctx);
    } catch (err) { toast(err.message); btn.disabled = false; btn.innerHTML = `${icon('checkCircle')} ${label}`; }
  });
}

// ---------- Tests: hub, taking a test, attempt review ----------
const LEVEL_NAME = { A1: 'lv.A1', A2: 'lv.A2', B1: 'lv.B1', B2: 'lv.B2' };
const SECTION_KEY = { grammar: 'sec.grammar', vocab: 'sec.vocab', reading: 'sec.reading', strategy: 'sec.strategy', listening: 'sec.listening' };
const secName = k => (SECTION_KEY[k] ? t(SECTION_KEY[k]) : k);
const STATUS = { submitted: ['st.submitted', 'ok'], in_progress: ['st.in_progress', 'primary'], abandoned: ['st.abandoned', ''], expired: ['st.expired', ''] };
let timer = null;
function stopTimer() { clearInterval(timer); timer = null; window.onbeforeunload = null; }

function attemptRows(list, withLearner = false) {
  if (!list.length) return `<p class="muted">${t('ex.none')}</p>`;
  return `<div class="table-wrap"><table class="log ${withLearner ? '' : 'att'}">
    <tr><th>${t('ex.started')}</th>${withLearner ? `<th>${t('ad.learner')}</th>` : ''}<th>${t('ex.test')}</th><th>${t('ex.result')}</th><th>${t('ex.duration')}</th><th>${t('ex.status')}</th>${withLearner ? '' : '<th></th>'}</tr>
    ${list.map(a => {
      const [label, cls] = STATUS[a.status] || [a.status, ''];
      const result = a.status === 'submitted'
        ? `<b>${a.score}/${a.total}</b> · ${a.pct}% ${a.passed === true ? `<span class="chip ok">${t('ex.pass')}</span>` : a.passed === false ? `<span class="chip bad">${t('ex.fail')}</span>` : ''}`
        : '—';
      return `<tr><td>${when(a.started_at)}</td>
        ${withLearner ? `<td><a href="#/admin/learner/${encodeURIComponent(a.username)}">${esc(a.full_name)}</a><div class="muted small">${esc(a.username)}</div></td>` : ''}
        <td>${esc(L(a, 'title'))}</td><td>${result}</td>
        <td>${a.duration_s != null ? mmss(a.duration_s) : '—'}${a.overtime ? ` <span class="chip warn">${t('ex.overtime')}</span>` : ''}</td>
        <td><span class="chip ${cls}">${t(label)}</span></td>
        ${withLearner ? '' : `<td>${a.status === 'submitted' ? `<a href="#/attempt/${a.id}">${t('ex.view')}</a>` : ''}</td>`}</tr>`;
    }).join('')}</table></div>`;
}

async function renderExamHub() {
  const [hub, log] = await Promise.all([api('/api/exams'), api('/api/attempts')]);
  const p = hub.placement;
  view.innerHTML = `
    <div class="page-head"><h1>${t('nav.test')}</h1><p>${t('ex.sub')}</p></div>
    <div class="card">
      <div class="card-head tight"><h3>${t('ex.placement')}</h3>
        <a class="btn ${p ? '' : 'primary'}" href="#/exam/placement">${t(p ? 'ex.retake' : 'exam.take')}</a></div>
        <p class="muted small card-sub" style="margin:0">${t('ex.placementMeta')} · ${p ? t('ex.lastResult', p.score, p.total, esc(L(p, 'level')), esc(L(p, 'ielts_estimate'))) : t('ex.notTaken')} · ${t('ex.attempts', hub.placement_attempts)}</p>
    </div>
    <h2 style="margin:1.6rem 0 .8rem">${t('ex.weekly')}</h2>
    <div class="exam-grid">${hub.weeks.map(w => {
      const state = !w.ready ? [t('ex.soon'), ''] : !w.available ? [t('ex.locked'), ''] : w.passed ? [`${t('ex.pass')} · ${w.best_pct}%`, 'ok']
        : w.attempts ? [`${t('ex.fail')} · ${w.best_pct}%`, 'bad'] : [t('ex.todo'), 'primary'];
      const ph = w.week <= 4 ? 1 : w.week <= 8 ? 2 : 3;
      return `<div class="exam-card ph${ph} ${w.week === hub.current_week ? 'now' : ''}">
        <div class="row" style="justify-content:space-between"><span class="wnum">${t('week.n', w.week)}</span><span class="chip ${state[1]}">${state[0]}</span></div>
        <h4>${esc(L(w, 'title').replace(/^(Kiểm tra tuần \d+|Week \d+ test):\s*/, ''))}</h4>
        <p class="muted small">${w.ready ? t('ex.meta', w.questions, w.time_limit_min, w.pass_pct) : ''}${w.attempts ? ` · ${t('ex.attempts', w.attempts)}` : ''}</p>
        ${w.available ? `<a class="btn ${w.passed ? '' : 'primary'} block" href="#/exam/week/${w.week}">${t(w.attempts ? 'ex.retake' : 'exam.take')}</a>`
          : `<span class="btn block" aria-disabled="true">${icon('lock')} ${t('ex.opensAt', w.week)}</span>`}
      </div>`;
    }).join('')}</div>
    <h2 style="margin:1.8rem 0 .8rem">${t('es.title')}</h2>
    <p class="muted small" style="margin:-.4rem 0 .8rem">${t('es.sub')}</p>
    ${[['A2–B1', 'es.groupBasic'], ['B1', 'es.groupB1']].map(([lv, key]) => {
      const sets = (hub.englishscore || []).filter(s => s.level === lv);
      return sets.length ? `<h3 class="es-group">${t(key)} <span class="chip">${sets.length}</span></h3>
    <div class="exam-grid">${sets.map(s => {
      const state = s.attempts ? [esc(L(s, 'best_level')) || `${s.best_pct}%`, ['B1', 'B2'].includes(s.best_cefr) ? 'ok' : 'bad'] : [t('es.todo'), 'primary'];
      return `<div class="exam-card es">
        <div class="row" style="justify-content:space-between"><span class="wnum">${icon('mic')} ${t('es.set', s.set)} · ${esc(s.level)}</span><span class="chip ${state[1]}">${state[0]}</span></div>
        <h4>${esc(L(s, 'title'))}</h4>
        <p class="muted small">${t('es.meta', s.questions, s.time_limit_min)}${s.attempts ? ` · ${t('ex.attempts', s.attempts)}` : ''}</p>
        <a class="btn ${s.attempts ? '' : 'primary'} block" href="#/exam/es/${s.set}">${t(s.attempts ? 'ex.retake' : 'exam.take')}</a>
      </div>`;
    }).join('')}</div>` : '';
    }).join('')}
    <h2 style="margin:1.8rem 0 .8rem">${t('ex.history')}</h2>
    <div class="card">${attemptRows(log)}</div>`;
}

async function renderExam(arg) {
  const [kind, week] = arg.startsWith('week/') ? ['weekly', Number(arg.split('/')[1])]
    : arg.startsWith('es/') ? ['englishscore', Number(arg.split('/')[1])] : ['placement', null];
  const a = await api('/api/exams/start', { method: 'POST', body: { kind, week } });
  const answers = { ...(a.draft || {}) };  // restore answers picked before leaving
  let lastSection = null;
  const total = a.questions.length;
  const answeredN = () => Object.keys(answers).length;
  view.innerHTML = `
    <a class="crumb" href="#/test">${icon('back')} ${t('nav.test')}</a>
    <div class="page-head"><h1>${esc(L(a, 'title'))}</h1><p>${t('ex.runSub', total, Math.round(a.time_limit_s / 60))}${kind === 'placement' ? ` ${t('ex.noGuess')}` : ''}</p></div>
    <div class="test-bar"><span class="chip" id="clock">${icon('clock')} ${mmss(a.remaining_s)}</span>
      <div class="bar"><i id="tbar" style="width:${answeredN() / total * 100}%"></i></div><span class="chip primary" id="answered">${answeredN()}/${total}</span></div>
    <div class="card">
      ${a.questions.map((q, i) => {
        const level = LEVEL_NAME[q.section];
        const head = q.section !== lastSection ? `<div class="level-head"><span class="chip primary">${esc(level ? q.section : secName(q.section))}</span>
          <h3>${level ? t(level) : ''}</h3></div>
          ${q.section === (kind === 'placement' ? 'B1' : 'reading') && a.passage ? `<p class="passage" style="margin:.6rem 0">${esc(a.passage)}</p>` : ''}` : '';
        lastSection = q.section;
        const play = q.say ? `<button type="button" class="say-btn" data-say="${esc(q.say)}">${icon('play')} ${t('act.playAgain')}</button>` : '';
        return `${head}<div class="q" data-id="${q.id}"><div class="qt"><span class="qn">${i + 1}</span>${esc(L(q, 'q'))}</div>${play}
          <div class="opts">${q.options.map((o, j) => `<button class="opt ${answers[q.id] === j ? 'sel' : ''}" data-j="${j}">${esc(o)}</button>`).join('')}</div></div>`;
      }).join('')}
      <div class="row" style="margin-top:1.2rem"><button class="btn primary" id="submit-test">${t('ex.submit')}</button><span class="muted small">${t('ex.blankWrong')}</span></div>
    </div>`;
  view.querySelectorAll('.say-btn').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
  let saveTimer = null;
  const saveDraft = () => {  // debounced autosave so leaving and returning keeps the answers
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { api(`/api/attempts/${a.id}/answers`, { method: 'PUT', body: { answers } }).catch(() => {}); }, 600);
  };
  view.querySelectorAll('.q').forEach(q => q.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    q.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === b));
    answers[q.dataset.id] = Number(b.dataset.j);
    $('#answered').textContent = `${answeredN()}/${total}`;
    $('#tbar').style.width = `${answeredN() / total * 100}%`;
    saveDraft();
  })));
  let sent = false;
  const send = async auto => {
    if (sent) return;
    const left = total - Object.keys(answers).length;
    if (!auto && left && !confirm(t('ex.confirmLeft', left))) return;
    sent = true;
    stopTimer();
    try {
      const r = await api(`/api/attempts/${a.id}/submit`, { method: 'POST', body: { answers } });
      roadmapCache = null;
      celebrate = r.passed === true || ['B1', 'B2'].includes((r.result || {}).cefr);
      if (auto) toast(t('ex.autoSubmitted'));
      else xpToast(r.xp);
      location.hash = `#/attempt/${r.id}`;
    } catch (err) { sent = false; toast(err.message); }
  };
  $('#submit-test').addEventListener('click', () => send(false));
  const deadline = Date.now() + a.remaining_s * 1000;
  window.onbeforeunload = () => t('ex.leave');
  timer = setInterval(() => {
    const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    const c = $('#clock');
    if (c) { c.innerHTML = `${icon('clock')} ${mmss(s)}`; c.classList.toggle('bad', s <= 60); }
    if (!s) send(true);
  }, 1000);
}

let celebrate = false;  // set when a test was just passed, so the result page opens with confetti
async function renderAttempt(id) {
  const a = await api(`/api/attempts/${id}`);
  if (celebrate) { celebrate = false; setTimeout(confetti, 300); }
  if (a.status !== 'submitted') {
    view.innerHTML = `<a class="crumb" href="#/test">${icon('back')} ${t('nav.test')}</a><div class="card"><p>${t('ex.noResult', t((STATUS[a.status] || [a.status])[0]))}</p></div>`;
    return;
  }
  const r = a.result;
  const verdict = a.passed === true ? `<span class="chip ok">${t('ex.pass')}</span>` : a.passed === false ? `<span class="chip bad">${t('ex.failNeed', a.pass_pct)}</span>` : '';
  view.innerHTML = `
    <a class="crumb" href="#/test">${icon('back')} ${t('nav.test')}</a>
    <div class="card result-hero">
      <p class="muted">${esc(L(a, 'title'))}</p><div class="big" data-count>${a.score}/${a.total}</div>
      <div class="row" style="justify-content:center;margin:.7rem 0">${verdict}<span class="chip">${a.pct}%</span>
        <span class="chip">${icon('clock')} ${mmss(a.duration_s)}${a.overtime ? ` · ${t('ex.overtime')}` : ''}</span>${a.xp ? `<span class="chip xp">+${a.xp} XP</span>` : ''}</div>
      <p class="muted small">${t('ex.times', when(a.started_at), when(a.submitted_at))}</p>
      <div class="sections">${Object.entries(a.sections).map(([k, s]) => `
        <div><div class="row" style="justify-content:space-between"><span>${esc(LEVEL_NAME[k] ? `${k} · ${t(LEVEL_NAME[k])}` : secName(k))}</span><b>${s.correct}/${s.total}</b></div>
        <div class="bar"><i style="width:${s.correct / s.total * 100}%"></i></div></div>`).join('')}</div>
      ${r && a.kind === 'englishscore' ? `<div class="cefr-box"><span class="chip ok big">${esc(L(r, 'level'))}</span><span class="muted">${esc(L(r, 'range'))}</span></div>
        <p style="max-width:560px;margin:.7rem auto">${esc(L(r, 'advice'))}</p><p class="muted small">${esc(L(r, 'note'))}</p>`
        : r ? `<p style="max-width:560px;margin:1rem auto"><b>${esc(L(r, 'level'))}</b> · ${t('ex.ielts', esc(L(r, 'ielts_estimate')))}. ${esc(L(r, 'advice'))}</p>
        <p class="muted small">${esc(L(r, 'note'))}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:1rem">
        ${a.kind === 'englishscore' ? `<a class="btn" href="#/exam/es/${a.week}">${t('ex.retake')}</a><a class="btn primary" href="#/today">${t('ex.continue')}</a>`
          : r ? `<a class="btn primary" href="#/today">${t('ex.startFrom', r.start_week)}</a>` : a.passed ? `<a class="btn primary" href="#/today">${t('ex.continue')}</a>`
          : `<a class="btn primary" href="#/exam/week/${a.week}">${t('ex.retake')}</a>`}
      </div>
    </div>
    <div class="card"><div class="card-head"><h3>${t('ex.review')}</h3><span class="muted small">${t('ex.wrongCount', a.total - a.score)}</span></div>
      ${a.passage ? `<details style="margin-bottom:.6rem"><summary class="muted small">${t('ex.showPassage')}</summary><p class="passage" style="margin-top:.5rem">${esc(a.passage)}</p></details>` : ''}
      ${a.review.map((q, i) => `<div class="q"><div class="qt"><span class="qn">${i + 1}</span>${esc(L(q, 'q'))}
          ${q.correct ? `<span class="chip ok">${icon('check')}</span>` : `<span class="chip bad">${icon('x')}</span>`}</div>
        ${q.say ? `<button type="button" class="say-btn" data-say="${esc(q.say)}">${icon('play')} “${esc(q.say)}”</button>` : ''}
        <div class="opts">${q.options.map((o, j) => `<span class="opt ${j === q.answer ? 'right' : j === q.given ? 'wrong' : ''}">${esc(o)}</span>`).join('')}</div>
        ${q.given == null ? `<div class="explain">${t('ex.unanswered')}</div>` : ''}${L(q, 'explain') ? `<div class="explain">${esc(L(q, 'explain'))}</div>` : ''}</div>`).join('')}
    </div>`;
  view.querySelectorAll('.say-btn').forEach(b => b.addEventListener('click', () => speak(b.dataset.say)));
}

// ---------- Admin: charts ----------
const tipEl = $('#tip');
function hideTip() { tipEl.classList.add('hidden'); }
function bindTips(root) {
  root.querySelectorAll('[data-tip]').forEach(el => {
    el.addEventListener('mousemove', e => {
      if (!el.dataset.tip) return;
      tipEl.innerHTML = el.dataset.tip;
      tipEl.classList.remove('hidden');
      const x = Math.min(e.clientX + 14, window.innerWidth - tipEl.offsetWidth - 8);
      tipEl.style.left = `${x}px`;
      tipEl.style.top = `${e.clientY - tipEl.offsetHeight - 12}px`;
    });
    el.addEventListener('mouseleave', hideTip);
  });
}
/* Vertical bars: one series, one scale (no dual axes). Rounded data-end, square baseline, gaps between bars,
   recessive grid; each bar has a hover tooltip on a full-height invisible hit target. */
// width ≈ the rendered width (half-column ≈ 440px, full ≈ 920px) so axis text stays ~11px after scaling.
function barChart(points, { height = 150, width = 440, max, fmt = v => num(v), labelEvery = 1 } = {}) {
  const W = width, H = height, PAD_L = 34, PAD_B = 22, PAD_T = 8;
  const top = Math.max(max ?? 0, ...points.map(p => p.value ?? 0), 1);
  const mag = 10 ** Math.floor(Math.log10(top));
  const nice = top <= 5 ? 5 : top <= 10 ? 10 : Math.ceil(top / mag) * mag;
  const step = (W - PAD_L) / points.length;
  const bw = Math.min(36, step - 4);
  const y = v => PAD_T + (H - PAD_T - PAD_B) * (1 - v / nice);
  const grid = [0.5, 1].map(f => `<line x1="${PAD_L}" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}" class="grid"/>`).join('')
    + [0, 0.5, 1].map(f => `<text x="${PAD_L - 6}" y="${y(nice * f) + 4}" class="axis" text-anchor="end">${fmt(nice * f)}</text>`).join('');
  const bars = points.map((p, i) => {
    const x = PAD_L + i * step + (step - bw) / 2;
    const v = p.value ?? 0;
    const h = Math.max(0, y(0) - y(v));
    const r = Math.min(4, h, bw / 2);
    const path = h ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z` : '';
    const label = (points.length - 1 - i) % labelEvery === 0  // count back from the latest point so it is always labelled
      ?`<text x="${x + bw / 2}" y="${H - 6}" class="axis" text-anchor="middle">${esc(p.label)}</text>` : '';
    return `<g>${p.value == null ? `<text x="${x + bw / 2}" y="${y(0) - 4}" class="axis" text-anchor="middle">—</text>` : `<path d="${path}" fill="${p.color || '#4f46e5'}"/>`}
      <rect x="${PAD_L + i * step}" y="${PAD_T}" width="${step}" height="${H - PAD_T - PAD_B}" fill="transparent" data-tip="${esc(p.tip)}"/>${label}</g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${grid}<line x1="${PAD_L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="base"/>${bars}</svg>`;
}
function hbars(rows, color = '#4f46e5') {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="hbars">${rows.map(r => `<div class="hbar"><span>${esc(r.label)}</span>
    <div class="track"><i style="width:${r.value / max * 100}%;background:${color}"></i></div><b>${num(r.value)}</b></div>`).join('')}</div>`;
}
const PHASE_COLOR = ['#0d9488', '#4f46e5', '#e8590c'];

// ---------- Admin: overview ----------
async function renderAdmin() {
  const o = await api('/api/admin/overview');
  const short = d => new Date(d).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  view.innerHTML = `
    <div class="page-head row" style="justify-content:space-between"><div><h1>${t('ad.title')}</h1><p>${t('ad.sub')}</p></div>
      <div class="row"><button class="btn" id="exp-l">${icon('download')} ${t('ad.exportLearners')}</button><button class="btn" id="exp-a">${icon('download')} ${t('ad.exportAttempts')}</button></div></div>
    ${o.storage === 'file' ? `<div class="note" style="margin-bottom:1rem">${icon('info')}<span>${t('ad.storageWarn')}</span></div>` : ''}
    <div class="stats kpi8">
      ${stat('users', '#4f46e5', '#eef0ff', num(o.learners), t('ad.learners'))}
      ${stat('flame', '#e8590c', '#fff0e6', num(o.active_today), t('ad.activeToday'))}
      ${stat('zap', '#b45309', '#fff4e0', num(o.active_7d), t('ad.active7'))}
      ${stat('plus', '#0d9488', '#e3f5f3', num(o.new_7d), t('ad.new7'))}
      ${stat('clock', '#0d9488', '#e3f5f3', hours(o.minutes_7d), t('ad.hours7'))}
      ${stat('clipboard', '#7c3aed', '#f3edff', num(o.attempts_total), t('ad.attempts'))}
      ${stat('checkCircle', '#0f9d6b', '#e4f6ee', o.pass_rate == null ? '—' : `${o.pass_rate}%`, t('ad.passRate'))}
      ${stat('route', '#4f46e5', '#eef0ff', `${o.avg_progress}%`, t('ad.avgProgress'))}
    </div>
    <div class="two-col">
      <div class="card"><div class="card-head"><h3>${t('ad.activeChart')}</h3><span class="muted small">${t('ad.last14')}</span></div>
        ${barChart(o.trend.map(d => ({ label: short(d.date), value: d.active, tip: `<b>${short(d.date)}</b><br>${t('ad.activeN', d.active)}` })), { labelEvery: 3 })}</div>
      <div class="card"><div class="card-head"><h3>${t('ad.minutesChart')}</h3><span class="muted small">${t('ad.last14')}</span></div>
        ${barChart(o.trend.map(d => ({ label: short(d.date), value: d.minutes, color: '#0d9488', tip: `<b>${short(d.date)}</b><br>${t('min', num(d.minutes))}` })), { labelEvery: 3 })}</div>
    </div>
    <div class="card" style="margin-top:1rem"><div class="card-head"><h3>${t('ad.passChart')}</h3>
      <div class="legend">${[1, 2, 3].map(p => `<span><i style="background:${PHASE_COLOR[p - 1]}"></i>${t(`phase.${p}`)}</span>`).join('')}</div></div>
      ${barChart(o.weekly.map(w => ({ label: t('week.short', w.week), value: w.pass_rate, color: PHASE_COLOR[w.week <= 4 ? 0 : w.week <= 8 ? 1 : 2],
        tip: `<b>${t('week.n', w.week)}</b><br>${w.attempts ? `${t('ad.passRate')}: ${w.pass_rate}%<br>${t('ad.avgScore')}: ${w.avg_pct}%<br>${t('ad.attemptsN', w.attempts)} · ${t('ad.learnersN', w.learners)}` : t('ad.noAttempts')}` })),
        { max: 100, fmt: v => `${v}%`, width: 920, height: 190 })}</div>
    <div class="two-col" style="margin-top:1rem">
      <div class="card"><div class="card-head"><h3>${t('ad.placementChart')}</h3></div>
        ${o.placement.length ? hbars(o.placement.map(p => ({ label: L(p, 'level'), value: p.count }))) : `<p class="muted">${t('ad.noData')}</p>`}</div>
      <div class="card"><div class="card-head"><h3>${t('ad.top')}</h3><a href="#/admin/learners">${t('ad.all')} →</a></div>
        ${o.top.length ? `<ol class="leaderboard">${o.top.map((r, i) => `<li><span class="rank r${i + 1}">${i + 1}</span>
          <a class="nm" href="#/admin/learner/${encodeURIComponent(r.username)}">${esc(r.full_name)}</a><span class="muted small">${t('lvl.short', r.level)}</span><b>${num(r.week_xp)} XP</b></li>`).join('')}</ol>` : `<p class="muted">${t('ad.noData')}</p>`}</div>
    </div>`;
  bindTips(view);
  $('#exp-l').addEventListener('click', () => download('/api/admin/export/learners.csv', 'ielts-road-learners.csv'));
  $('#exp-a').addEventListener('click', () => download('/api/admin/export/attempts.csv', 'ielts-road-attempts.csv'));
}

// ---------- Admin: learners ----------
let learnerSort = { key: 'last_active', dir: -1 };
async function renderAdminLearners() {
  const rows = await api('/api/admin/learners');
  const COLS = [['full_name', 'ad.name'], ['placement_level', 'ad.placement'], ['current_day', 'ad.day'], ['progress_pct', 'ad.progress'],
    ['streak', 'stat.streak'], ['xp', 'XP'], ['tests_passed', 'ad.testsPassed'], ['avg_test_pct', 'ad.avgScore'], ['last_active', 'ad.lastActive']];
  view.innerHTML = `
    <div class="page-head row" style="justify-content:space-between"><div><h1>${t('nav.admin/learners')}</h1><p>${t('ad.learnersSub', rows.length)}</p></div>
      <button class="btn" id="exp-l">${icon('download')} ${t('ad.exportLearners')}</button></div>
    <details class="card create-card" ${rows.length ? '' : 'open'}>
      <summary><h3>${icon('plus')} ${t('ad.create')}</h3></summary>
      <p class="muted small" style="margin:.6rem 0">${t('ad.createHelp')}</p>
      <textarea id="new-learners" style="min-height:120px" placeholder="lop10a.an, Nguyễn Văn An&#10;lop10a.binh, Trần Thị Bình"></textarea>
      <div class="row" style="margin-top:.8rem"><button class="btn primary" id="create">${t('ad.createBtn')}</button></div>
      <div id="created"></div>
    </details>
    <div class="card" style="margin-top:1rem">
      <div class="card-head"><input id="q" placeholder="${t('ad.search')}" style="max-width:320px"><span class="muted small" id="count"></span></div>
      <div class="table-wrap"><table class="log sortable"><thead><tr>${COLS.map(([k, label]) => `<th data-k="${k}">${label === 'XP' ? 'XP' : t(label)}</th>`).join('')}<th></th></tr></thead><tbody id="rows"></tbody></table></div>
    </div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase();
    const list = rows.filter(r => !q || `${r.full_name} ${r.username}`.toLowerCase().includes(q))
      .sort((a, b) => ((a[learnerSort.key] ?? -1) > (b[learnerSort.key] ?? -1) ? 1 : -1) * learnerSort.dir);
    $('#count').textContent = t('ad.shown', list.length, rows.length);
    view.querySelectorAll('th[data-k]').forEach(th => th.classList.toggle('sorted', th.dataset.k === learnerSort.key));
    $('#rows').innerHTML = list.map(r => `<tr class="${r.active ? '' : 'inactive'}">
      <td><a href="#/admin/learner/${encodeURIComponent(r.username)}"><b>${esc(r.full_name)}</b></a><div class="muted small">${esc(r.username)}${r.active ? '' : ` · ${t('ad.locked')}`}</div></td>
      <td>${esc(L(r, 'placement_level') || '—')}</td><td>${r.current_day}</td>
      <td><div class="mini"><div class="bar"><i style="width:${r.progress_pct}%"></i></div><span>${r.progress_pct}%</span></div></td>
      <td>${r.streak}</td><td>${num(r.xp)}</td><td>${r.tests_passed}/12</td><td>${r.avg_test_pct != null ? `${r.avg_test_pct}%` : '—'}</td>
      <td>${r.last_active ? new Date(r.last_active).toLocaleDateString(locale()) : '—'}</td>
      <td><a href="#/admin/learner/${encodeURIComponent(r.username)}">${t('ad.open')}</a></td></tr>`).join('');
  };
  draw();
  $('#q').addEventListener('input', draw);
  view.querySelectorAll('th[data-k]').forEach(th => th.addEventListener('click', () => {
    learnerSort = { key: th.dataset.k, dir: learnerSort.key === th.dataset.k ? -learnerSort.dir : -1 };
    draw();
  }));
  $('#exp-l').addEventListener('click', () => download('/api/admin/export/learners.csv', 'ielts-road-learners.csv'));
  $('#create').addEventListener('click', async () => {
    const learners = $('#new-learners').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [username, full_name, password] = l.split(/\s*[,;\t]\s*/);
      return { username, full_name, password };
    });
    try {
      const created = await api('/api/admin/learners', { method: 'POST', body: { learners } });
      $('#created').innerHTML = `<div class="note info" style="margin-top:1rem">${icon('info')}<span>${t('ad.createdNote', created.length)}</span></div>
        <div class="table-wrap"><table class="log"><tr><th>${t('auth.username')}</th><th>${t('auth.fullname')}</th><th>${t('auth.password')}</th></tr>
        ${created.map(c => `<tr><td>${esc(c.username)}</td><td>${esc(c.full_name)}</td><td><code>${esc(c.password)}</code></td></tr>`).join('')}</table></div>
        <button class="btn" id="dl-created">${icon('download')} ${t('ad.downloadAccounts')}</button>`;
      $('#dl-created').addEventListener('click', () => csvDownload([['username', 'full_name', 'password', 'url'],
        ...created.map(c => [c.username, c.full_name, c.password, location.origin])], 'ielts-road-new-accounts.csv'));
      $('#new-learners').value = '';
      rows.push(...(await api('/api/admin/learners')).filter(r => created.some(c => c.username === r.username)));
      draw();
    } catch (err) { toast(err.message); }
  });
}

async function renderAdminLearner(username) {
  const d = await api(`/api/admin/learners/${encodeURIComponent(username)}`);
  const p = d.profile;
  const today = new Date();
  const days = [...Array(14)].map((_, i) => { const x = new Date(today); x.setDate(x.getDate() - 13 + i); return x.toLocaleDateString('sv-SE'); });
  const short = s => new Date(s).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  view.innerHTML = `
    <a class="crumb" href="#/admin/learners">${icon('back')} ${t('nav.admin/learners')}</a>
    <div class="page-head row" style="justify-content:space-between"><div><h1>${esc(d.full_name)}</h1>
      <p>${esc(d.username)} · ${t('ad.joined', new Date(d.created_at).toLocaleDateString(locale()))}${d.active ? '' : ` · <span class="chip bad">${t('ad.locked')}</span>`}</p></div>
      <div class="row"><button class="btn" id="toggle">${icon('lock')} ${t(d.active ? 'ad.lock' : 'ad.unlock')}</button><button class="btn" id="reset">${t('ad.resetPw')}</button></div></div>
    <div id="pw"></div>
    <div class="stats kpi8">
      ${stat('route', '#4f46e5', '#eef0ff', `${d.progress_pct}%`, t('ad.dayN', d.current_day))}
      ${stat('trophy', '#0d9488', '#e3f5f3', t('lvl.level', p.level), `${num(p.xp)} XP`)}
      ${stat('flame', '#e8590c', '#fff0e6', d.streak, t('me.bestN', p.best_streak))}
      ${stat('clock', '#0d9488', '#e3f5f3', hours(d.minutes_7d), t('ad.hours7'))}
      ${stat('test', '#7c3aed', '#f3edff', `${d.tests_passed}/12`, t('ad.testsPassed'))}
      ${stat('checkCircle', '#0f9d6b', '#e4f6ee', d.avg_test_pct != null ? `${d.avg_test_pct}%` : '—', t('ad.avgScore'))}
      ${stat('cards', '#7c3aed', '#f3edff', d.words_learned, t('ad.words'))}
      ${stat('pen', '#db2777', '#fde9f3', d.essays, t('ad.essays'))}
    </div>
    <div class="two-col">
      <div class="card"><div class="card-head"><h3>${t('ad.minutesChart')}</h3><span class="muted small">${t('ad.last14')}</span></div>
        ${barChart(days.map(x => ({ label: short(x), value: d.activity[x] || 0, color: '#0d9488', tip: `<b>${short(x)}</b><br>${t('min', d.activity[x] || 0)} · ${d.xp_days[x] || 0} XP` })), { labelEvery: 3 })}</div>
      <div class="card"><div class="card-head"><h3>${t('me.badges')}</h3><span class="chip primary">${p.badges.filter(b => b.earned).length}/${p.badges.length}</span></div>
        <div class="badges small-badges">${p.badges.map(b => `<div class="badge ${b.earned ? 'on' : ''}" title="${esc(t(`badge.${b.id}.d`))}"><span class="bi">${icon(b.earned ? BADGE_ICON[b.id] : 'lock')}</span><b>${t(`badge.${b.id}`)}</b></div>`).join('')}</div>
        ${d.placement ? `<p class="small" style="margin-top:1rem"><b>${t('ex.placement')}:</b> ${d.placement.score}/${d.placement.total} · ${esc(L(d.placement, 'level'))} · ${t('ex.ielts', esc(L(d.placement, 'ielts_estimate')))}</p>` : ''}</div>
    </div>
    <h2 style="margin:1.6rem 0 .8rem">${t('ex.history')}</h2>
    <div class="card">${attemptRows(d.attempts.map(a => ({ ...a, username: d.username, full_name: d.full_name })), true)}</div>`;
  bindTips(view);
  $('#toggle').addEventListener('click', async () => {
    if (!confirm(t(d.active ? 'ad.lockConfirm' : 'ad.unlockConfirm', d.full_name))) return;
    await api(`/api/admin/learners/${encodeURIComponent(username)}`, { method: 'PUT', body: { active: !d.active } }).catch(err => toast(err.message));
    renderAdminLearner(username);
  });
  $('#reset').addEventListener('click', async () => {
    if (!confirm(t('ad.resetConfirm', d.full_name))) return;
    const r = await api(`/api/admin/learners/${encodeURIComponent(username)}/reset-password`, { method: 'POST' }).catch(err => toast(err.message));
    if (r) $('#pw').innerHTML = `<div class="note info" style="margin-bottom:1rem">${icon('info')}<span>${t('ad.newPw', esc(r.username))} <code>${esc(r.password)}</code></span></div>`;
  });
}

async function renderAdminAttempts() {
  const all = await api('/api/admin/attempts');
  view.innerHTML = `
    <div class="page-head row" style="justify-content:space-between"><div><h1>${t('nav.admin/attempts')}</h1><p>${t('ad.attemptsSub')}</p></div>
      <button class="btn" id="exp-a">${icon('download')} ${t('ad.exportAttempts')}</button></div>
    <div class="card">
      <div class="row" style="margin-bottom:1rem">
        <input id="q" placeholder="${t('ad.search')}" style="max-width:260px">
        <select id="kind" style="max-width:200px"><option value="">${t('ad.allTests')}</option><option value="placement">${t('ex.placement')}</option>
          ${[...Array(12)].map((_, i) => `<option value="w${i + 1}">${t('week.n', i + 1)}</option>`).join('')}</select>
        <select id="status" style="max-width:180px"><option value="">${t('ad.allStatus')}</option>${Object.keys(STATUS).map(s => `<option value="${s}">${t(STATUS[s][0])}</option>`).join('')}</select>
        <span class="muted small" id="count"></span>
      </div>
      <div id="list"></div>
    </div>`;
  const draw = () => {
    const q = $('#q').value.trim().toLowerCase(), k = $('#kind').value, s = $('#status').value;
    const list = all.filter(a => (!q || `${a.full_name} ${a.username}`.toLowerCase().includes(q))
      && (!k || (k === 'placement' ? a.kind === 'placement' : a.kind === 'weekly' && `w${a.week}` === k)) && (!s || a.status === s));
    $('#count').textContent = t('ad.shown', list.length, all.length);
    $('#list').innerHTML = attemptRows(list, true);
  };
  draw();
  ['q', 'kind', 'status'].forEach(id => $(`#${id}`).addEventListener('input', draw));
  $('#exp-a').addEventListener('click', () => download('/api/admin/export/attempts.csv', 'ielts-road-attempts.csv'));
}

// ---------- Boot ----------
applyStatic();
if (token()) start().catch(showAuth); else showAuth();
