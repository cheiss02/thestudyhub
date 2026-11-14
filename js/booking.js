/* =====================================================================
   Find a tutor (index.html)
   Families browse tutors by language, pick an open time and send a
   request with homework photos. Signing in is only needed to send.
   ===================================================================== */

const state = { lang: 'All', week: 0, user: null, family: null, tutors: [], avail: [], dates: [], booked: new Set(), draft: null };
const PENDING_KEY = 'studyhub-pending-booking';

async function loadSchedule() {
  const days = [...Array(C.WEEKS_AHEAD).keys()].flatMap(weekDays);
  const [t, a, b, x] = await Promise.all([
    sb.from('tutors').select('id,name,grade,langs,subjects,bio').eq('status', 'active').order('name'),
    sb.from('availability').select('tutor_id,dow,slot'),
    sb.rpc('booked_slots', { from_date: days[0].date, to_date: days.at(-1).date }),
    sb.from('availability_dates').select('tutor_id,day,slot,open').gte('day', days[0].date).lte('day', days.at(-1).date),
  ]);
  state.dates = x.data || [];
  state.loadError = !!(t.error || a.error || b.error);
  state.tutors = t.data || [];
  state.avail = a.data || [];
  state.booked = new Set((b.data || []).map(r => `${r.tutor_id}|${r.session_date}|${r.slot}`));
}

const isOpen = (tid, d, slot) => openAt(state.avail, state.dates, tid, d.date, d.dow, slot);
// Times a tutor could ever offer (weekly + extra dates), so rows only show when needed.
const allTimes = () => [...new Set([...C.TIMES, ...state.dates.filter(x => x.open).map(x => x.slot)])].sort();

function weekGrid(t) {
  const days = weekDays(state.week);
  const times = allTimes().filter(tm => days.some(d => isOpen(t.id, d, tm) && !isPast(d.date, tm)));
  if (!times.length) {
    const later = [...Array(C.WEEKS_AHEAD).keys()].find(w => w > state.week && weekDays(w).some(d => allTimes().some(tm => isOpen(t.id, d, tm))));
    return `<div class="empty">No open times this week.${later !== undefined ? ` <button class="linkish" data-week="${later}">See ${later === state.week + 1 ? 'next week' : 'week of ' + weekDays(later)[0].label} →</button>` : ''}</div>`;
  }
  let h = `<div class="week"><div></div>${days.map(d => `<div class="dh">${d.name}<small>${d.label}</small></div>`).join('')}`;
  for (const tm of times) {
    h += `<div class="tm">${fmtTime(tm)}</div>`;
    for (const d of days) {
      if (!isOpen(t.id, d, tm) || isPast(d.date, tm)) h += '<div class="cell"></div>';
      else if (state.booked.has(`${t.id}|${d.date}|${tm}`)) h += '<div class="busy">Booked</div>';
      else h += `<button class="slot" data-book="${t.id}|${d.date}|${tm}" aria-label="Book ${esc(t.name)}, ${fmtDate(d.date)} at ${fmtTime(tm)}">Open</button>`;
    }
  }
  return h + '</div>';
}

function render() {
  if (state.loadError) {
    $('#schedule').innerHTML = `<div class="empty">We couldn't load tutor schedules right now. Check your internet connection and <button class="linkish" id="retry">try again</button>.</div>`;
    $('#retry').addEventListener('click', async () => { $('#schedule').innerHTML = skeleton(2); await loadSchedule(); render(); });
    return;
  }
  const langs = ['All', ...C.LANGUAGES.filter(l => state.tutors.some(t => t.langs.includes(l)))];
  const list = state.tutors.filter(t => state.lang === 'All' || t.langs.includes(state.lang));
  $('#schedule').innerHTML = `
    <div class="filters">
      ${weekNav(state.week, C.WEEKS_AHEAD, 'data-week')}
      <div class="chips" role="group" aria-label="Language">${langs.map(l => `<button class="chip ${state.lang === l ? 'on' : ''}" aria-pressed="${state.lang === l}" data-lang="${esc(l)}">${esc(l)}</button>`).join('')}</div>
    </div>
    <div class="grid2 enter">${list.map((t, i) => `<article class="card tutor-card" style="--i:${i}">
      <div class="who"><div class="av">${initials(t.name)}</div><div><h3>${esc(t.name)}</h3><div class="meta">${esc(t.grade)} grade tutor</div></div></div>
      ${t.bio ? `<p style="font-size:15px">${esc(t.bio)}</p>` : ''}
      <div class="tags">${t.langs.map(l => `<span class="tag lang">${esc(l)}</span>`).join('')}${t.subjects.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      ${weekGrid(t)}</article>`).join('') || `<div class="empty">${state.tutors.length ? 'No tutors for this language yet. Check back soon!' : 'Our first tutors are getting set up. Check back soon, or follow us on <a href="' + C.INSTAGRAM + '">Instagram</a> for updates!'}</div>`}</div>`;
}

/* ---------- request form ---------- */
function openForm(tid, date, slot) {
  const t = state.tutors.find(x => x.id === tid);
  if (!t) return toast('That tutor is no longer available.');
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('studyhub-parent') || '{}'); } catch (e) {}
  if (state.family?.parent_name) saved.name = state.family.parent_name;
  state.draft = { tid, date, slot, photos: [] };
  const subjects = [...new Set([...t.subjects, 'Any homework'])];
  openModal(`<form class="panel" id="bookf" novalidate>
    <div class="ph"><div><h2>Request a session</h2><p class="meta">A parent or guardian must fill this out. <a href="help.html#parents" target="_blank">Help</a></p></div>
      <button type="button" class="x" data-close aria-label="Close">✕</button></div>
    <div class="pick">${esc(t.name)} · ${fmtDate(date)} · ${fmtTime(slot)}</div>
    <div class="deal-mini"><b>Quick reminder</b> Tutors help with the part your child is stuck on, for 30 minutes or less. They won't do the whole assignment, and that's how kids learn.</div>
    <div class="f"><label for="b-parent">Your name</label><input type="text" id="b-parent" value="${esc(saved.name || '')}" autocomplete="name"></div>
    <div class="f2">
      <div class="f"><label for="b-child">Child's first name</label><input type="text" id="b-child"><div class="hint">First name only.</div></div>
      <div class="f"><label for="b-grade">Grade</label><select id="b-grade">${C.KID_GRADES.map(g => `<option>${g}</option>`).join('')}</select></div></div>
    <div class="f2">
      <div class="f"><label for="b-lang">Language</label><select id="b-lang">${[...t.langs, 'English'].map(l => `<option>${esc(l)}</option>`).join('')}</select></div>
      <div class="f"><label for="b-subj">Subject</label><select id="b-subj">${subjects.map(s => `<option>${esc(s)}</option>`).join('')}</select></div></div>
    <div class="f"><label for="b-note">Which part is your child stuck on?</label><textarea id="b-note" maxlength="600" placeholder="For example: doesn't understand the directions for the word problems on page 2."></textarea></div>
    <div class="f"><label for="b-photos">Photos of the homework</label>
      <div class="drop">Add up to ${C.MAX_PHOTOS} photos. Cover your child's last name and school first.<input type="file" id="b-photos" accept="image/*" multiple></div>
      <div class="thumbs" id="b-thumbs"></div></div>
    <div class="f" style="margin-top:20px">
      <label class="check"><input type="checkbox" id="b-c1"><span>I am this child's parent or legal guardian, and I give permission for this tutoring session.</span></label>
      <label class="check"><input type="checkbox" id="b-c2"><span>An adult will be nearby during the video call.</span></label>
      <label class="check"><input type="checkbox" id="b-c3"><span>I removed my child's full name and school from the photos.</span></label>
      <label class="check"><input type="checkbox" id="b-c5"><span>My child is learning English, and I understand the tutor helps with the hard part in <b>30 minutes or less</b>. They don't do the whole homework.</span></label>
      <label class="check"><input type="checkbox" id="b-c4"><span>I agree to the <a href="rules.html" target="_blank">Terms, Privacy Policy and Parent Consent</a>.</span></label></div>
    <div id="b-err" class="err" role="alert"></div>
    <div class="row" style="margin-top:10px"><button class="btn" type="submit">Send request</button><button type="button" class="btn ghost" data-close>Cancel</button></div>
  </form>`);
  $('#b-photos').addEventListener('change', addPhotos);
  $('#bookf').addEventListener('submit', submitRequest);
}

async function addPhotos(e) {
  const room = C.MAX_PHOTOS - state.draft.photos.length;
  for (const f of [...e.target.files].slice(0, room)) {
    try { const blob = await shrinkPhoto(f); state.draft.photos.push({ blob, url: URL.createObjectURL(blob) }); }
    catch (err) { $('#b-err').textContent = 'One photo could not be read. Try a JPG or PNG.'; }
  }
  e.target.value = '';
  drawThumbs();
}
function drawThumbs() {
  $('#b-thumbs').innerHTML = state.draft.photos.map((p, i) => `<div class="th"><img src="${p.url}" alt="Homework photo ${i + 1}"><button type="button" class="rm" data-rm="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>`).join('');
}

async function submitRequest(e) {
  e.preventDefault();
  const d = state.draft, v = id => $(id).value.trim();
  const errs = [];
  if (v('#b-parent').length < 2) errs.push('your name');
  if (!v('#b-child')) errs.push("your child's first name");
  if (!d.photos.length) errs.push('at least one homework photo');
  if (!['#b-c1', '#b-c2', '#b-c3', '#b-c4', '#b-c5'].every(id => $(id).checked)) errs.push('all the checkboxes');
  if (errs.length) { $('#b-err').textContent = `Please add ${errs.join(', ')}.`; return; }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…'; $('#b-err').textContent = '';
  try { localStorage.setItem('studyhub-parent', JSON.stringify({ name: v('#b-parent') })); } catch (err) {}

  // 1) upload photos to the private folder, 2) save the request
  const paths = [];
  try {
    for (const p of d.photos) {
      const path = `${state.user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('homework').upload(path, p.blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      paths.push(path);
    }
    const { error } = await sb.from('requests').insert({
      tutor_id: d.tid, session_date: d.date, slot: d.slot, parent_name: v('#b-parent'),
      child_first: v('#b-child').split(/\s+/)[0], grade: $('#b-grade').value, lang: $('#b-lang').value,
      subject: $('#b-subj').value, note: v('#b-note'), photo_paths: paths,
    });
    if (error) throw error;
  } catch (err) {
    if (paths.length) await sb.storage.from('homework').remove(paths);
    $('#b-err').textContent = niceError(err);
    btn.disabled = false; btn.textContent = 'Send request';
    return;
  }
  const t = state.tutors.find(x => x.id === d.tid);
  $('#bookf').innerHTML = `<div class="ph"><h2>Request sent!</h2><button type="button" class="x" data-close aria-label="Close">✕</button></div>
    <div class="ok"><b>${esc(t.name)}</b> will look at the homework and approve or decline your request. When it's approved, we'll email you the Google Meet link.</div>
    <p class="meta">Session: ${fmtDate(d.date)} at ${fmtTime(d.slot)}, about 30 minutes. Please stay nearby during the call.</p>
    <div class="row" style="margin-top:16px"><a class="btn" href="account.html">See my requests</a><button type="button" class="btn ghost" data-close>Done</button></div>`;
  await loadSchedule(); render();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-book],[data-lang],[data-week],[data-rm]');
  if (b?.disabled) return;
  if (!b) return;
  if (b.dataset.lang) { state.lang = b.dataset.lang; swap(render); }
  else if (b.dataset.week) { state.week = +b.dataset.week; swap(render); }
  else if (b.dataset.rm) { state.draft.photos.splice(+b.dataset.rm, 1); drawThumbs(); }
  else if (b.dataset.book) {
    const [tid, date, slot] = b.dataset.book.split('|');
    if (state.user) return familyGate(state.family, () => openForm(tid, date, slot));
    try { sessionStorage.setItem(PENDING_KEY, b.dataset.book); } catch (err) {}
    signInModal('parent', { stay: true, mode: 'up', message: 'Enter your email to request this time. We send the Meet link there.' });
  }
});

/* ---------- start ---------- */
(async function start() {
  $('#schedule').innerHTML = skeleton(2);
  ({ user: state.user, family: state.family } = await renderChrome('find'));
  if (!READY) { render(); return; }
  await loadSchedule(); render();
  // Coming back from the sign-in email? Open the time they picked.
  let pending = null; try { pending = sessionStorage.getItem(PENDING_KEY); } catch (e) {}
  if (pending && state.user) { sessionStorage.removeItem(PENDING_KEY); familyGate(state.family, () => openForm(...pending.split('|'))); }
  if (state.user && state.family?.status === 'pending') $('#schedule').insertAdjacentHTML('beforebegin', `<div style="margin-bottom:18px">${PENDING_HTML}</div>`);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !state.user) location.reload();
  });
})();
