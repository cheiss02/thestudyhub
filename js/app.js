/* =====================================================================
   The Study Hub — shared code used by every page
   (Supabase connection, header, sign-in, dates, pop-ups)
   ===================================================================== */

const C = window.STUDYHUB;
const READY = !C.SUPABASE_URL.includes('YOUR-PROJECT');
const sb = READY ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_PUBLISHABLE_KEY) : null;

/* ---------- small helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- dates and times ---------- */
// '15:30' -> '3:30 pm'
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'am' : 'pm'}`;
}
// Date -> '2026-11-16'
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// '2026-11-16' -> Date (local)
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
// '2026-11-16' -> 'Mon, Nov 16'
const fmtDate = s => parseDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const today = () => isoDate(new Date());

// Days of a school week. offset 0 = this week, 1 = next week.
function weekDays(offset) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) + 7 * offset);
  return C.DAYS.map(d => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + d.dow - 1);
    return { ...d, date: isoDate(date), label: `${MONTHS[date.getMonth()]} ${date.getDate()}` };
  });
}
// Is this date + time already in the past?
function isPast(dateStr, slot) {
  const [h, m] = slot.split(':').map(Number);
  const d = parseDate(dateStr); d.setHours(h, m);
  return d < new Date();
}

/* ---------- sign-in ---------- */
async function currentUser() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
async function amIAdmin() {
  if (!sb) return false;
  const { data } = await sb.rpc('is_admin');
  return !!data;
}
function signInModal(message = 'Sign in to continue.') {
  const back = location.href.split('#')[0];
  openModal(`
    <form class="panel" id="signin" novalidate>
      <div class="ph"><div><h2>Sign in</h2><p class="meta">${esc(message)}</p></div>
        <button type="button" class="x" data-close aria-label="Close">✕</button></div>
      <div class="f"><label for="si-email">Email</label>
        <input type="email" id="si-email" autocomplete="email" required>
        <div class="hint">We'll email you a sign-in link. No password needed.</div></div>
      <div id="si-err" class="err" role="alert"></div>
      <div class="row"><button class="btn" type="submit">Email me a link</button>
        ${C.GOOGLE_LOGIN ? '<button type="button" class="btn ghost" id="si-google">Sign in with Google</button>' : ''}</div>
    </form>`);
  $('#signin').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#si-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('#si-err').textContent = 'Please enter a valid email.'; return; }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: back } });
    if (error) { $('#si-err').textContent = error.message; btn.disabled = false; return; }
    $('#signin').innerHTML = `<div class="ph"><h2>Check your email</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>
      <div class="ok">We sent a sign-in link to <b>${esc(email)}</b>. Open it on this device to continue.</div>
      <p class="meta">Don't see it? Check your spam folder.</p>`;
  });
  $('#si-google')?.addEventListener('click', () =>
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: back } }));
}
async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }

/* ---------- header + footer ---------- */
const SPARKS = [['1.5%', '14px', '#f7c948', 16], ['1.5%', '72%', '#2a9d8f', 12], ['97.5%', '10px', '#b79cf2', 13], ['97.5%', '75%', '#f7c948', 14]]
  .map(([x, y, c, s]) => `<svg class="spark" style="left:${x};top:${y}" width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0C11 7 13 9 20 10C13 11 11 13 10 20C9 13 7 11 0 10C7 9 9 7 10 0Z" fill="${c}" stroke="#1d2940"/></svg>`).join('');

async function renderChrome(active) {
  const user = await currentUser();
  const admin = user ? await amIAdmin() : false;
  const links = [['index.html', 'find', 'Find a tutor'], ['account.html', 'account', 'My requests'],
    ['tutor.html', 'tutor', 'For tutors'], ...(admin ? [['admin.html', 'admin', 'Club admin']] : []),
    ['rules.html', 'rules', 'Rules & privacy']];
  $('#site-header').innerHTML = `${SPARKS}<div class="wrap">
    <a class="brand" href="index.html"><img src="images/logo.svg" alt=""><div><b>The Study Hub</b><span>Bilingual high school volunteers for elementary students</span></div></a>
    <nav>${links.map(([h, k, t]) => `<a href="${h}" class="${k === active ? 'on' : ''}">${t}</a>`).join('')}
    ${!READY ? '' : user ? '<button id="nav-out" title="' + esc(user.email) + '">Sign out</button>' : '<button id="nav-in">Sign in</button>'}</nav></div>`;
  $('#nav-out')?.addEventListener('click', signOut);
  $('#nav-in')?.addEventListener('click', () => signInModal('Parents, tutors and club officers all sign in here.'));
  $('#site-footer').innerHTML = `<div class="wrap"><span>The Study Hub · a student club · always free · <a href="mailto:${C.CLUB_EMAIL}">${C.CLUB_EMAIL}</a></span>
    <span><a href="${C.INSTAGRAM}">Instagram</a> · <a href="rules.html">Terms, privacy and safety</a></span></div>`;
  if (!READY) $('#site-header').insertAdjacentHTML('afterend', '<div class="notice">Setup in progress: this site isn\'t connected to its database yet.</div>');
  return { user, admin };
}

/* ---------- pop-ups ---------- */
function openModal(html) {
  closeModal();
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'modal'; ov.innerHTML = html;
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeModal(); });
  document.body.append(ov); document.body.style.overflow = 'hidden';
  ov.querySelector('input,select,textarea')?.focus();
}
function closeModal() { $('#modal')?.remove(); document.body.style.overflow = ''; }
function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'light'; el.innerHTML = `<button class="x" aria-label="Close">✕</button><img src="${src}" alt="Homework photo">`;
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.role = 'status'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 3200);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); $('.light')?.remove(); } });

/* ---------- homework photos ---------- */
// Shrinks a phone photo to max 1600px JPEG before upload.
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? resolve(b) : reject(new Error('Could not read photo')), 'image/jpeg', 0.82);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read photo'));
    img.src = URL.createObjectURL(file);
  });
}
// Private photo paths -> temporary links (valid 1 hour).
async function photoLinks(paths) {
  if (!paths?.length) return [];
  const { data } = await sb.storage.from('homework').createSignedUrls(paths, 3600);
  return (data || []).map(d => d.signedUrl).filter(Boolean);
}
// Friendlier database error messages.
function niceError(error) {
  const m = error?.message || String(error);
  if (m.includes('requests_no_double')) return 'Sorry, someone just booked this time. Please pick another.';
  return m;
}
