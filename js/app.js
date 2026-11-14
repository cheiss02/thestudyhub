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
// 135 minutes -> '2 h 15 min'
function fmtHours(mins) {
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
const sessionLabel = r => r.completed_at ? (r.attended ? `Done · ${r.minutes} min` : r.tutor_no_show_at ? "Tutor didn't join" : "Child didn't join") : null;
// Minutes from now until a session starts (negative once it has started). Sessions last 30 minutes.
function minsToStart(dateStr, slot) { const [h, m] = slot.split(':').map(Number); const d = parseDate(dateStr); d.setHours(h, m); return (d - new Date()) / 60000; }
// Simple yes/no pop-up.
function askConfirm(title, text, yes, onYes, no = 'Go back') {
  openModal(`<div class="panel"><div class="ph"><h2>${title}</h2><button class="x" data-close aria-label="Close">✕</button></div>
    <p>${text}</p><div class="row" style="margin-top:16px"><button class="btn no" id="ask-yes">${yes}</button><button class="btn ghost" data-close>${no}</button></div></div>`);
  $('#ask-yes').addEventListener('click', async e => { e.target.disabled = true; closeModal(); await onYes(); });
}
// Running late / can't make it: pick how many minutes, then send.
function lateModal(r, rpcDone) {
  openModal(`<div class="panel"><div class="ph"><h2>Running late?</h2><button class="x" data-close aria-label="Close">✕</button></div>
    <p>We'll email the other person right away. The session still ends at its usual time.</p>
    <div class="chips" style="margin:14px 0" role="group" aria-label="How late">${[5, 10, 15, 20, 30].map(n => `<button class="chip" data-late-min="${n}">About ${n} min</button>`).join('')}</div>
    <p class="meta">More than 15 minutes late? It's usually better to tap <b>Can't make it</b> and book another time.</p></div>`);
  $('#modal .panel').addEventListener('click', async e => {
    const b = e.target.closest('[data-late-min]'); if (!b) return;
    b.disabled = true;
    const { error } = await sb.rpc('running_late', { req: r.id, mins: Number(b.dataset.lateMin) });
    closeModal();
    if (error) return toast(error.message);
    toast('Sent! They know you are on your way.'); rpcDone();
  });
}

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
// Is a tutor open at this date/time? Weekly schedule, unless that date has its own change.
function openAt(avail, dates, tid, dateStr, dow, slot) {
  const o = dates.find(x => x.tutor_id === tid && x.day === dateStr && x.slot === slot);
  return o ? o.open : avail.some(a => a.tutor_id === tid && a.dow === dow && a.slot === slot);
}
// 'Nov 16 – 20' for a list of week days
const weekRange = days => `${days[0].label} – ${days.at(-1).label.split(' ')[0] === days[0].label.split(' ')[0] ? days.at(-1).label.split(' ')[1] : days.at(-1).label}`;
// Week picker: ‹ This week · Nov 16 – 20 ›
function weekNav(offset, max, attr) {
  const days = weekDays(offset);
  const name = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : `In ${offset} weeks`;
  return `<div class="weeknav" role="group" aria-label="Choose week">
    <button class="wk-btn" ${attr}="${offset - 1}" ${offset <= 0 ? 'disabled' : ''} aria-label="Previous week">‹</button>
    <div class="wk-label"><b>${name}</b><span>${weekRange(days)}</span></div>
    <button class="wk-btn" ${attr}="${offset + 1}" ${offset >= max - 1 ? 'disabled' : ''} aria-label="Next week">›</button></div>`;
}

// Is this date + time already in the past?
function isPast(dateStr, slot) {
  const [h, m] = slot.split(':').map(Number);
  const d = parseDate(dateStr); d.setHours(h, m);
  return d < new Date();
}

/* ---------- motion ---------- */
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Smoothly cross-fade a screen update (browsers that support it), otherwise just update.
function swap(update) {
  if (document.startViewTransition && !REDUCED) {
    const t = document.startViewTransition(update);
    // A quick second click cancels the first animation; that's fine, so don't log it as an error.
    t.ready.catch(() => {}); t.finished.catch(() => {});
  } else update();
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
async function myRole(user) {
  if (!user) return { admin: false, tutor: null, family: null };
  const [admin, t, f] = await Promise.all([amIAdmin(),
    sb.from('tutors').select('status').eq('id', user.id).maybeSingle(),
    sb.from('families').select('*').eq('id', user.id).maybeSingle()]);
  return { admin, tutor: t.data?.status || null, family: f.data || null };
}

// Sign in and sign up use the same email link. "Get started" (sign up) and "Sign in"
// only change the words and where the person lands afterwards.
const ROLES = {
  parent: { up: 'Create a free parent account', in: 'Parent sign-in', msg: 'Use any email. We send your session links there.', upPage: 'account.html', page: 'account.html' },
  tutor:  { up: 'Sign up to tutor', in: 'Tutor sign-in', msg: 'Use your school email.', upPage: 'tutor.html', page: 'tutor.html' },
  admin:  { up: 'Admin sign-in', in: 'Admin sign-in', msg: 'Use the email on the club admin list, like help@thestudyhub.us.', upPage: 'admin.html', page: 'admin.html' },
};
// Remember the last email used on this device so returning people sign in in one tap.
const LAST_KEY = 'studyhub-last-signin';
function lastSignIn() { try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; } }
function rememberSignIn(email, role) { try { localStorage.setItem(LAST_KEY, JSON.stringify({ email, role })); } catch (e) {} }

function signInModal(role, opts = {}) {
  const mode = opts.mode || 'in';
  const last = lastSignIn();
  if (!role) {
    openModal(`<div class="panel">
      <div class="ph"><div><h2>${mode === 'up' ? 'Get started' : 'Welcome back'}</h2><p class="meta">${mode === 'up' ? 'It\'s free. Who are you?' : 'Who\'s signing in?'}</p></div>
        <button type="button" class="x" data-close aria-label="Close">✕</button></div>
      ${mode === 'in' && last ? `<button class="role again" id="si-again"><span class="me-av" aria-hidden="true">${esc(last.email[0].toUpperCase())}</span><span><b>Continue as ${esc(last.email)}</b><small>We'll email you a sign-in code</small></span></button>
        <p class="or">or choose</p>` : ''}
      <div class="roles">
        <button class="role" data-role="parent"><span class="role-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M2.5 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M13.5 20c.2-2.6 1.6-4.6 3.5-4.6s3.4 2 3.5 4.6"/></svg></span><span><b>I'm a parent or guardian</b><small>${mode === 'up' ? 'Get free homework help for my child' : 'See my requests and Meet links'}</small></span></button>
        <button class="role" data-role="tutor"><span class="role-ic tutor" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z"/><path d="M12 6v13.5"/></svg></span><span><b>I'm a high school student</b><small>${mode === 'up' ? 'Volunteer as a bilingual tutor' : 'Open my tutor dashboard'}</small></span></button>
      </div>
      <p class="hint" style="margin-top:16px">${mode === 'up' ? 'Already have an account? <button class="linkish" data-switch="in">Sign in</button>' : 'New here? <button class="linkish" data-switch="up">Get started</button>'}</p></div>`);
    $('#si-again')?.addEventListener('click', () => quickSignIn(last));
    $$('#modal [data-role]').forEach(b => b.addEventListener('click', () => signInModal(b.dataset.role, { mode })));
    $$('#modal [data-switch]').forEach(b => b.addEventListener('click', () => signInModal(null, { mode: b.dataset.switch })));
    return;
  }
  const r = ROLES[role];
  const dest = opts.stay ? location.href.split('#')[0] : new URL(mode === 'up' ? r.upPage : r.page, location.href).href;
  openModal(`<form class="panel" id="signin" novalidate>
      <div class="ph"><div><h2>${mode === 'up' ? r.up : r.in}</h2><p class="meta">${esc(opts.message || r.msg)}</p></div>
        <button type="button" class="x" data-close aria-label="Close">✕</button></div>
      <div class="f"><label for="si-email">Email</label>
        <input type="email" id="si-email" autocomplete="email" inputmode="email" required value="${esc(opts.email || (last && last.role === role ? last.email : ''))}">
        <div class="hint">We'll email you a link to ${mode === 'up' ? 'finish signing up' : 'sign in'}. No password to remember.</div></div>
      <div id="si-err" class="err" role="alert"></div>
      <div class="row"><button class="btn" type="submit">${mode === 'up' ? 'Continue' : 'Email me a sign-in link'}</button>
        ${C.GOOGLE_LOGIN && role !== 'parent' ? '<button type="button" class="btn ghost" id="si-google">Continue with Google</button>' : ''}
        ${opts.stay ? '' : '<button type="button" class="linkish" id="si-back">Back</button>'}</div>
    </form>`);
  $('#si-back')?.addEventListener('click', () => signInModal(null, { mode }));
  $('#signin').addEventListener('submit', async e => {
    e.preventDefault();
    if (!$('#si-email')) return; // already on the code step
    const email = $('#si-email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('#si-err').textContent = 'Please enter a valid email.'; return; }
    const btn = e.target.querySelector('button[type=submit]'); const label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
    // Sign in only works for existing accounts; Get started creates one (or signs in if it already exists).
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: dest, shouldCreateUser: mode === 'up' || role === 'admin' } });
    btn.disabled = false; btn.textContent = label;
    if (error) {
      if (/signups? not allowed|user not found|otp_disabled/i.test(error.message + (error.code || ''))) {
        $('#si-err').innerHTML = role === 'admin'
          ? 'That email isn\'t a club admin. Ask a club admin to add you.'
          : `We don't have an account for <b>${esc(email)}</b> yet. <button type="button" class="linkish" id="si-create">Create my free account</button>`;
        $('#si-create')?.addEventListener('click', () => signInModal(role, { ...opts, mode: 'up', email }));
      } else $('#si-err').textContent = error.message;
      return;
    }
    rememberSignIn(email, role);
    showCodeStep(email, dest, mode);
  });
  $('#si-google')?.addEventListener('click', () => sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: dest } }));
}
// Step 2: the email has a link AND a code. The code lets someone read the email
// on their phone and finish signing in on their computer.
function showCodeStep(email, dest, mode) {
  $('#signin').innerHTML = `<div class="ph"><h2>Check your email</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>
    <div class="ok sent"><span class="mail" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/></svg></span>
      <div>We sent an email to <b>${esc(email)}</b>.</div></div>
    <div class="f"><label for="si-code">Type the code from the email</label>
      <input type="text" id="si-code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
      <div class="hint">Reading the email on another device, like your phone? Just type the code here. Or tap the link in the email if you're on this device.</div></div>
    <div id="si-err" class="err" role="alert"></div>
    <div class="row"><button class="btn" type="submit">Sign in</button><button type="button" class="linkish" id="si-resend">Send a new email</button></div>
    <p class="meta" style="margin-top:12px">Don't see it in a minute? Check your spam folder.</p>`;
  const input = $('#si-code');
  input.focus();
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
  $('#si-resend').addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: dest } });
    toast(error ? error.message : 'New email sent. Use the newest code.');
  });
  $('#signin').onsubmit = async e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const token = input.value.trim();
    if (token.length < 6) { $('#si-err').textContent = 'Enter the code from the email.'; return; }
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Checking…';
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
    if (error) {
      $('#si-err').textContent = /expired|invalid/i.test(error.message) ? 'That code didn\'t work or has expired. Check the newest email, or send a new one.' : error.message;
      btn.disabled = false; btn.textContent = 'Sign in'; return;
    }
    const isNew = data?.user && Date.now() - new Date(data.user.created_at).getTime() < 10 * 60 * 1000;
    try { sessionStorage.setItem('studyhub-welcome', mode === 'up' && !isNew ? 'back' : isNew ? 'new' : 'in'); } catch (err) {}
    location.href = dest;
  };
}

// One tap for returning people: send the code to the email used last time.
async function quickSignIn(last) {
  const r = ROLES[last.role] || ROLES.parent;
  const dest = new URL(r.page, location.href).href;
  openModal(`<form class="panel" id="signin" novalidate><p class="meta">Sending your code…</p></form>`);
  const { error } = await sb.auth.signInWithOtp({ email: last.email, options: { emailRedirectTo: dest, shouldCreateUser: false } });
  if (error) { signInModal(last.role, { mode: 'in', email: last.email }); setTimeout(() => { $('#si-err') && ($('#si-err').textContent = error.message); }, 50); return; }
  showCodeStep(last.email, dest, 'in');
}

// After signing in: a friendly note (shown once).
function welcomeNote() {
  let w = null; try { w = sessionStorage.getItem('studyhub-welcome'); sessionStorage.removeItem('studyhub-welcome'); } catch (e) {}
  if (w === 'back') toast('Welcome back! You already had an account, so we signed you in.');
  else if (w === 'new') toast('Your free account is ready!');
  else if (w === 'in') toast('Signed in. Welcome back!');
}

async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }

/* ---------- header + footer ---------- */
const SPARKS = [['1.5%', '14px', '#f7c948', 16], ['1.5%', '72%', '#2a9d8f', 12], ['97.5%', '10px', '#b79cf2', 13], ['97.5%', '75%', '#f7c948', 14]]
  .map(([x, y, c, s]) => `<svg class="spark" style="left:${x};top:${y}" width="${s}" height="${s}" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0C11 7 13 9 20 10C13 11 11 13 10 20C9 13 7 11 0 10C7 9 9 7 10 0Z" fill="${c}" stroke="#1d2940"/></svg>`).join('');

async function renderChrome(active) {
  const user = await currentUser();
  const role = await myRole(user);
  // Signed out: only what a visitor needs. Signed in: their own pages.
  const links = [['index.html', 'find', 'Find a tutor']];
  if (user) links.push(['account.html', 'account', 'My requests']);
  links.push(['tutor.html', 'tutor', role.tutor && role.tutor !== 'declined' ? 'Tutor dashboard' : 'Become a tutor']);
  if (role.admin) links.push(['admin.html', 'admin', 'Club admin']);
  links.push(['about.html', 'about', 'About']);
  links.push(['help.html', 'help', 'Help']);
  links.push(['rules.html', 'rules', 'Rules & privacy']);
  const acct = !READY ? '' : user
    ? `<span class="me" title="${esc(user.email)}"><span class="me-av" aria-hidden="true">${esc(user.email[0].toUpperCase())}</span><span class="me-mail">${esc(user.email)}</span></span><button class="nav-btn" id="nav-out">Sign out</button>`
    : '<button class="nav-btn" id="nav-in">Sign in</button><button class="nav-btn primary" id="nav-up">Get started</button>';
  $('#site-header').innerHTML = `${SPARKS}<div class="wrap">
    <a class="brand" href="index.html"><img src="images/logo.svg" alt="" width="58" height="58"><div><b>The Study Hub</b><span>Bilingual high school volunteers for elementary students</span></div></a>
    ${READY && !user ? '<button class="quick-in" id="quick-in">Sign in</button>' : ''}
    <button class="menu-btn" aria-expanded="false" aria-controls="site-nav"><span class="bars" aria-hidden="true"></span><span class="menu-txt">Menu</span></button>
    <nav id="site-nav" aria-label="Main">${links.map(([h, k, t]) => `<a href="${h}" ${k === active ? 'class="on" aria-current="page"' : ''}>${t}</a>`).join('')}<span class="acct">${acct}</span></nav></div>`;
  const mb = $('.menu-btn');
  mb.addEventListener('click', () => { const open = $('#site-nav').classList.toggle('open'); mb.setAttribute('aria-expanded', open); });
  $('#nav-out')?.addEventListener('click', signOut);
  $('#nav-in')?.addEventListener('click', () => signInModal(null, { mode: 'in' }));
  $('#quick-in')?.addEventListener('click', () => signInModal(null, { mode: 'in' }));
  $$('[data-signin]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); signInModal(null, { mode: 'in' }); }));
  if (user) welcomeNote();
  $('#nav-up')?.addEventListener('click', () => signInModal(null, { mode: 'up' }));
  $$('[data-start]').forEach(b => b.addEventListener('click', () => signInModal(b.dataset.start, { mode: 'up' })));
  $('#site-footer').innerHTML = `<div class="wrap"><span>The Study Hub · a student club · always free · <a href="mailto:${C.CLUB_EMAIL}">${C.CLUB_EMAIL}</a></span>
    <span><a href="es.html" lang="es">Español</a> · <a href="${C.INSTAGRAM}">Instagram</a> · <a href="rules.html">Terms, privacy and safety</a></span></div>`;
  if (!READY) $('#site-header').insertAdjacentHTML('afterend', '<div class="notice">Setup in progress: this site isn\'t connected to its database yet.</div>');
  return { user, admin: role.admin, tutorStatus: role.tutor, family: role.family };
}

/* ---------- family accounts (approved by a club admin) ---------- */
function familyFormHTML() {
  return `<div class="deal-mini"><b>Good to know</b> The Study Hub is for elementary students who are <b>learning English</b>. Tutors help with the hard part of the homework, 30 minutes or less per session.</div>
    <div class="f"><label for="fm-name">Your name (parent or guardian)</label><input type="text" id="fm-name" maxlength="60" autocomplete="name"></div>
    <div class="f2"><div class="f"><label for="fm-city">City</label><input type="text" id="fm-city" maxlength="60" placeholder="Fullerton"></div>
      <div class="f"><label for="fm-lang">Language at home</label><select id="fm-lang">${[...C.LANGUAGES, 'English', 'Other'].map(l => `<option>${esc(l)}</option>`).join('')}</select></div></div>
    <div class="f"><label for="fm-heard">How did you hear about us?</label><input type="text" id="fm-heard" maxlength="200" placeholder="Teacher, school flyer, Instagram, a friend…"></div>
    <label class="check"><input type="checkbox" id="fm-ok"><span>I'm a parent or legal guardian and I agree to the <a href="rules.html" target="_blank">Terms and Privacy Policy</a>.</span></label>
    <div id="fm-err" class="err" role="alert"></div>`;
}
async function saveFamily() {
  const name = $('#fm-name').value.trim();
  if (name.length < 2 || !$('#fm-ok').checked) { $('#fm-err').textContent = 'Please add your name and agree to the terms.'; return false; }
  const user = await currentUser();
  const { error } = await sb.from('families').insert({ id: user.id, parent_name: name, city: $('#fm-city').value.trim(), home_lang: $('#fm-lang').value, heard: $('#fm-heard').value.trim() });
  if (error) { $('#fm-err').textContent = error.message; return false; }
  try { localStorage.setItem('studyhub-parent', JSON.stringify({ name })); } catch (e) {}
  return true;
}
const PENDING_HTML = `<div class="ok"><b>Thanks! Your family account is waiting for approval.</b><br>A club admin reviews every new family to keep kids safe. This usually takes 1–2 days, and we'll email you when you can book.</div>`;
// Make sure a signed-in parent has an approved family account. Calls onApproved() when they do.
function familyGate(family, onApproved) {
  if (family?.status === 'approved') return onApproved();
  if (family?.status === 'pending') return openModal(`<div class="panel"><div class="ph"><h2>Almost there</h2><button class="x" data-close aria-label="Close">✕</button></div>${PENDING_HTML}<button class="btn" data-close>OK</button></div>`);
  if (family?.status === 'declined') return openModal(`<div class="panel"><div class="ph"><h2>Booking is paused</h2><button class="x" data-close aria-label="Close">✕</button></div><p>Your family account can't book sessions right now. Questions? Email <a href="mailto:${C.CLUB_EMAIL}">${C.CLUB_EMAIL}</a>.</p></div>`);
  openModal(`<form class="panel" id="famf" novalidate><div class="ph"><div><h2>Tell us about your family</h2><p class="meta">One time only. A club admin approves new families before the first booking.</p></div><button type="button" class="x" data-close aria-label="Close">✕</button></div>
    ${familyFormHTML()}<div class="row" style="margin-top:10px"><button class="btn" type="submit">Send for approval</button></div></form>`);
  $('#famf').addEventListener('submit', async e => {
    e.preventDefault();
    if (await saveFamily()) $('#famf').innerHTML = `<div class="ph"><h2>Request sent</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>${PENDING_HTML}<button type="button" class="btn" data-close>OK</button>`;
  });
}

/* ---------- pop-ups ---------- */
let lastFocus = null;
function openModal(html) {
  if (!$('#modal')) lastFocus = document.activeElement;
  closeModal(true, true);
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = html;
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeModal(); });
  const h = ov.querySelector('h2'); if (h) { h.id = 'modal-title'; ov.setAttribute('aria-labelledby', 'modal-title'); }
  document.body.append(ov); document.body.style.overflow = 'hidden';
  setTimeout(() => (ov.querySelector('input:not([type=checkbox]),select,textarea,button.role') || ov.querySelector('button'))?.focus(), 60);
}
// Keep keyboard focus inside an open pop-up.
document.addEventListener('keydown', e => {
  const ov = $('#modal'); if (!ov || e.key !== 'Tab') return;
  const items = $$('a[href],button:not([disabled]),input,select,textarea', ov).filter(el => el.offsetParent);
  if (!items.length) return;
  const first = items[0], last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function closeModal(instant, replacing) {
  const ov = $('#modal'); if (!ov) return;
  document.body.style.overflow = '';
  if (!replacing && lastFocus?.isConnected) setTimeout(() => lastFocus.focus({ preventScroll: true }), 0);
  if (instant || REDUCED) { ov.remove(); return; }
  ov.id = ''; ov.classList.add('out');
  setTimeout(() => ov.remove(), 180);
}
function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'light'; el.innerHTML = `<button class="x" aria-label="Close">✕</button><img src="${src}" alt="Homework photo">`;
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
}
function toast(msg) {
  $('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.role = 'status'; t.textContent = msg;
  document.body.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 3200);
}
// Grey placeholder cards while data loads.
const skeleton = (n = 2) => `<div class="grid2">${'<div class="card sk"><div class="sk-row"><span class="sk-c"></span><span class="sk-l" style="width:40%"></span></div><span class="sk-l"></span><span class="sk-l" style="width:70%"></span><span class="sk-b"></span></div>'.repeat(n)}</div>`;
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
