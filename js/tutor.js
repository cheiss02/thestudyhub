/* =====================================================================
   For tutors (tutor.html)
   - Not a tutor yet: application form
   - Waiting: "a club officer will review" message
   - Approved: requests (approve/decline), weekly schedule, profile
   ===================================================================== */

const T = { user: null, me: null, priv: null, avail: [], reqs: [], tab: 'requests', photos: {} };

async function loadMe() {
  const [t, p] = await Promise.all([
    sb.from('tutors').select('*').eq('id', T.user.id).maybeSingle(),
    sb.from('tutor_private').select('*').eq('tutor_id', T.user.id).maybeSingle(),
  ]);
  T.me = t.data; T.priv = p.data;
}
async function loadDashboard() {
  const from = isoDate(new Date(Date.now() - 7 * 864e5));
  const [a, r] = await Promise.all([
    sb.from('availability').select('dow,slot').eq('tutor_id', T.user.id),
    sb.from('requests').select('*').eq('tutor_id', T.user.id).gte('session_date', from).order('session_date').order('slot'),
  ]);
  T.avail = a.data || [];
  T.reqs = r.data || [];
  const links = await Promise.all(T.reqs.map(q => photoLinks(q.photo_paths)));
  T.reqs.forEach((q, i) => T.photos[q.id] = links[i]);
}

const page = html => { $('#main').innerHTML = `<section class="band"><div class="wrap">${html}</div></section>`; };
const checks = (cls, list, chosen = []) => `<div class="f2">${list.map(x => `<label class="check"><input type="checkbox" class="${cls}" value="${esc(x)}" ${chosen.includes(x) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>`;
const picked = cls => $$('.' + cls + ':checked').map(x => x.value);

/* ---------- not signed in ---------- */
function intro() {
  page(`<div style="max-width:720px"><span class="free">VOLUNTEER</span><h1>Do you speak two languages?<span class="help">Become a tutor.</span></h1>
    <p class="meta" style="margin:12px 0 20px;font-size:17px">Help elementary students who are still learning English with their homework, once a week or more, on Google Meet. Great for volunteer hours.</p>
    <div class="card" style="margin-bottom:20px"><h3 style="margin-bottom:8px">You're a great fit if you</h3>
      <ul style="margin:0;padding-left:20px"><li>Speak English and another language</li><li>Are a high school student</li><li>Are patient, kind and love to help</li></ul></div>
    <div class="row"><button class="btn" id="go-up">Sign up to tutor</button><button class="btn ghost" id="go-in">I already signed up</button></div>
    <p class="hint">Use your school email. It takes about 3 minutes.</p></div>`);
  $('#go-up').addEventListener('click', () => signInModal('tutor', { mode: 'up' }));
  $('#go-in').addEventListener('click', () => signInModal('tutor', { mode: 'in' }));
}

/* ---------- application ---------- */
function applyForm() {
  page(`<form class="card" id="applyf" novalidate style="max-width:680px">
    <h1 style="font-size:34px;margin-bottom:6px">Apply to tutor</h1>
    <p class="meta" style="margin-bottom:18px">A club officer reviews every application. You'll sign the code of conduct with the club advisor before your first session.</p>
    <div class="f2"><div class="f"><label for="a-name">Name families will see</label><input type="text" id="a-name" maxlength="40" placeholder="First name and last initial"></div>
      <div class="f"><label for="a-grade">Grade</label><select id="a-grade">${C.TUTOR_GRADES.map(g => `<option>${g}</option>`).join('')}</select></div></div>
    <div class="f"><label for="a-email">School email</label><input type="email" id="a-email" value="${esc(T.user.email)}"><div class="hint">We send new requests here.</div></div>
    <div class="f"><label>Languages besides English</label>${checks('a-lang', C.LANGUAGES)}<input type="text" id="a-other" placeholder="Another language"></div>
    <div class="f"><label>Subjects you can help with</label>${checks('a-subj', C.SUBJECTS)}</div>
    <div class="f"><label for="a-bio">A short intro for families</label><textarea id="a-bio" maxlength="400" placeholder="I love helping with reading and math. Hablo español en casa."></textarea></div>
    <div class="f"><label for="a-why">Why do you want to tutor?</label><textarea id="a-why" maxlength="600"></textarea><div class="hint">Only club officers see this.</div></div>
    <label class="check"><input type="checkbox" id="a-ok"><span>I've read the <a href="rules.html#conduct" target="_blank">Tutor Code of Conduct</a> and will follow it.</span></label>
    <div id="a-err" class="err" role="alert"></div>
    <button class="btn" type="submit" style="margin-top:10px">Send application</button></form>`);
  $('#applyf').addEventListener('submit', async e => {
    e.preventDefault();
    const langs = picked('a-lang'); const other = $('#a-other').value.trim(); if (other) langs.push(other);
    const name = $('#a-name').value.trim(), email = $('#a-email').value.trim();
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || !langs.length || !picked('a-subj').length || !$('#a-ok').checked) {
      $('#a-err').textContent = 'Please add your name, school email, at least one language and subject, and agree to the code of conduct.'; return;
    }
    const t = await sb.from('tutors').insert({ id: T.user.id, name, grade: $('#a-grade').value, langs, subjects: picked('a-subj'), bio: $('#a-bio').value.trim() });
    if (t.error) { $('#a-err').textContent = t.error.message; return; }
    const p = await sb.from('tutor_private').insert({ tutor_id: T.user.id, school_email: email, why: $('#a-why').value.trim(), conduct_agreed_at: new Date().toISOString() });
    if (p.error) { $('#a-err').textContent = p.error.message; return; }
    await loadMe(); route();
  });
}

/* ---------- dashboard ---------- */
function reqCard(r) {
  const label = { pending: 'Needs review', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' }[r.status];
  const upcoming = r.session_date >= today();
  return `<article class="card req ${r.status}">
    <div class="row" style="justify-content:space-between"><h3>${esc(r.child_first)} · ${esc(r.grade)} grade · ${esc(r.subject)}</h3><span class="status ${r.status}">${label}</span></div>
    <p style="margin-top:6px;font-weight:600">${fmtDate(r.session_date)}, ${fmtTime(r.slot)} · ${esc(r.lang)}</p>
    <p class="meta">Parent: ${esc(r.parent_name)}</p>
    ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
    <div class="thumbs">${(T.photos[r.id] || []).map((u, i) => `<button class="th" data-zoom="${esc(u)}" aria-label="Open photo ${i + 1}"><img src="${esc(u)}" alt="Homework photo ${i + 1}"></button>`).join('') || (r.photo_paths.length ? '' : '<span class="meta">Photos were deleted after 30 days.</span>')}</div>
    ${r.status === 'pending' && upcoming ? `<div class="f" style="margin-top:14px"><label for="m-${r.id}">Message to the family (optional)</label>
      <textarea id="m-${r.id}" maxlength="400" placeholder="For example: please have the reading book ready."></textarea></div>
      <div class="row"><button class="btn go" data-answer="${r.id}|1">Approve</button><button class="btn no" data-answer="${r.id}|0">Decline</button></div>` : ''}
    ${r.status === 'approved' && upcoming ? `<div class="row" style="margin-top:12px"><a class="btn y small" href="${esc(T.priv?.meet_link || '#')}" target="_blank" rel="noopener">Open my Meet</a><button class="btn no small" data-cancel="${r.id}">Cancel session</button></div>
      <p class="hint">The family got your Meet link by email.</p>` : ''}
  </article>`;
}

function weekEditor() {
  const has = (dow, s) => T.avail.some(a => a.dow === dow && a.slot === s);
  const nextWeek = weekDays(1);
  const bookedNext = (dow, s) => T.reqs.find(r => ['pending', 'approved'].includes(r.status) && r.slot === s && r.session_date === nextWeek.find(d => d.dow === dow)?.date);
  let h = `<div class="week"><div></div>${C.DAYS.map(d => `<div class="dh">${d.name}</div>`).join('')}`;
  for (const s of C.TIMES) {
    h += `<div class="tm">${fmtTime(s)}</div>`;
    for (const d of C.DAYS) {
      const on = has(d.dow, s), b = bookedNext(d.dow, s);
      h += `<button class="tog ${on ? 'on' : ''}" data-tog="${d.dow}|${s}" aria-pressed="${on}" title="${b ? 'Booked next week by ' + esc(b.child_first) : ''}">${on ? (b ? esc(b.child_first) : 'Open') : ''}</button>`;
    }
  }
  return h + '</div>';
}

function profileForm() {
  const t = T.me, p = T.priv || {};
  return `<form class="card" id="proff" novalidate style="max-width:680px"><h2 style="margin-bottom:16px">Profile</h2>
    <div class="f2"><div class="f"><label for="p-name">Name families see</label><input type="text" id="p-name" maxlength="40" value="${esc(t.name)}"></div>
      <div class="f"><label for="p-grade">Grade</label><select id="p-grade">${C.TUTOR_GRADES.map(g => `<option ${t.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div></div>
    <div class="f"><label>Languages besides English</label>${checks('p-lang', [...new Set([...C.LANGUAGES, ...t.langs])], t.langs)}</div>
    <div class="f"><label>Subjects</label>${checks('p-subj', C.SUBJECTS, t.subjects)}</div>
    <div class="f"><label for="p-meet">Your Google Meet link</label><input type="url" id="p-meet" value="${esc(p.meet_link || '')}" placeholder="https://meet.google.com/abc-defg-hij">
      <div class="hint">In Google Meet (signed in with your school account), choose "Create a meeting for later" and paste the link. Approved families get this link.</div></div>
    <div class="f"><label for="p-email">School email</label><input type="email" id="p-email" value="${esc(p.school_email || T.user.email)}"></div>
    <div class="f"><label for="p-bio">About you</label><textarea id="p-bio" maxlength="400">${esc(t.bio)}</textarea></div>
    <div id="p-err" class="err" role="alert"></div><button class="btn" type="submit">Save profile</button></form>`;
}

function dashboard() {
  const pending = T.reqs.filter(r => r.status === 'pending' && r.session_date >= today()).length;
  const order = { pending: 0, approved: 1, declined: 2, cancelled: 3 };
  const list = [...T.reqs].sort((a, b) => order[a.status] - order[b.status] || a.session_date.localeCompare(b.session_date) || a.slot.localeCompare(b.slot));
  let body;
  if (T.tab === 'requests') body = list.length ? `<div class="stack1">${list.map(reqCard).join('')}</div>` : '<div class="empty">No requests yet. Families see your open times on the Find a tutor page.</div>';
  else if (T.tab === 'week') body = `<div class="card"><h2>My weekly times</h2><p class="meta" style="margin:6px 0 16px">Tap a time to open or close it. It repeats every week. Closing a time doesn't cancel sessions already booked.</p>${weekEditor()}</div>`;
  else body = profileForm();
  page(`${T.me.status === 'paused' ? '<div class="warn" style="margin-bottom:18px">Your profile is paused by the club, so families can\'t see your times right now.</div>' : ''}
    ${!T.priv?.meet_link ? '<div class="warn" style="margin-bottom:18px">Add your Google Meet link in <b>Profile</b> so you can approve requests.</div>' : ''}
    <div class="top"><div><h1>Hi, ${esc(T.me.name.split(' ')[0])}</h1><p>${pending ? `${pending} request${pending > 1 ? 's' : ''} waiting for you. Look at the homework photos, then approve or decline within 48 hours.` : "You're all caught up."}</p></div></div>
    <div class="tabs">${[['requests', `Requests${pending ? ` (${pending})` : ''}`], ['week', 'My week'], ['profile', 'Profile']].map(([k, l]) => `<button class="tab ${T.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`);
  $('#proff')?.addEventListener('submit', saveProfile);
}

async function saveProfile(e) {
  e.preventDefault();
  const meet = $('#p-meet').value.trim();
  if (meet && !/^https:\/\/meet\.google\.com\//.test(meet)) { $('#p-err').textContent = 'The Meet link should start with https://meet.google.com/'; return; }
  const a = await sb.from('tutors').update({ name: $('#p-name').value.trim(), grade: $('#p-grade').value, langs: picked('p-lang'), subjects: picked('p-subj'), bio: $('#p-bio').value.trim() }).eq('id', T.user.id);
  const b = await sb.from('tutor_private').update({ meet_link: meet, school_email: $('#p-email').value.trim() }).eq('tutor_id', T.user.id);
  if (a.error || b.error) { $('#p-err').textContent = (a.error || b.error).message; return; }
  await loadMe(); toast('Profile saved.'); dashboard();
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tab],[data-tog],[data-answer],[data-cancel],[data-zoom]');
  if (!b) return;
  if (b.dataset.tab) { T.tab = b.dataset.tab; dashboard(); }
  else if (b.dataset.zoom) lightbox(b.dataset.zoom);
  else if (b.dataset.tog) {
    const [dow, slot] = b.dataset.tog.split('|'); const d = +dow;
    const on = T.avail.some(a => a.dow === d && a.slot === slot);
    const { error } = on
      ? await sb.from('availability').delete().match({ tutor_id: T.user.id, dow: d, slot })
      : await sb.from('availability').insert({ tutor_id: T.user.id, dow: d, slot });
    if (error) return toast(error.message);
    T.avail = on ? T.avail.filter(a => !(a.dow === d && a.slot === slot)) : [...T.avail, { dow: d, slot }];
    dashboard();
  } else if (b.dataset.answer) {
    const [id, yes] = b.dataset.answer.split('|');
    b.disabled = true;
    const { error } = await sb.rpc('respond_request', { req: id, approve: yes === '1', note: $('#m-' + id)?.value.trim() || '' });
    if (error) { b.disabled = false; return toast(error.message); }
    toast(yes === '1' ? 'Approved! The family gets your Meet link by email.' : 'Declined. We let the family know.');
    await loadDashboard(); dashboard();
  } else if (b.dataset.cancel) {
    const { error } = await sb.rpc('cancel_request', { req: b.dataset.cancel });
    if (error) return toast(error.message);
    toast('Session cancelled. We emailed the family.'); await loadDashboard(); dashboard();
  }
});

async function route() {
  if (!T.me) return applyForm();
  if (T.me.status === 'pending') return page(`<div class="card" style="max-width:640px"><span class="free">RECEIVED</span><h1 style="font-size:34px">Thanks, ${esc(T.me.name.split(' ')[0])}!</h1>
    <p style="margin-top:10px">A club officer will review your application. Next you'll sign the code of conduct with the club advisor, and then your dashboard opens here.</p></div>`);
  if (T.me.status === 'declined') return page(`<div class="card" style="max-width:640px"><h1 style="font-size:34px">Application not approved</h1><p style="margin-top:10px">Questions? Email <a href="mailto:${C.CLUB_EMAIL}">${C.CLUB_EMAIL}</a>.</p></div>`);
  await loadDashboard(); dashboard();
}

(async function start() {
  ({ user: T.user } = await renderChrome('tutor'));
  if (!READY) return page('<div class="empty">Tutor sign-up opens soon.</div>');
  if (!T.user) return intro();
  await loadMe(); route();
})();
