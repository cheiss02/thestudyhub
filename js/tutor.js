/* =====================================================================
   For tutors (tutor.html)
   - Not a tutor yet: application form
   - Waiting: "a club officer will review" message
   - Approved: requests (approve/decline), weekly schedule, profile
   ===================================================================== */

const T = { user: null, me: null, priv: null, avail: [], dates: [], reqs: [], history: [], tab: 'requests', week: 0, photos: {} };

async function loadMe() {
  const [t, p] = await Promise.all([
    sb.from('tutors').select('*').eq('id', T.user.id).maybeSingle(),
    sb.from('tutor_private').select('*').eq('tutor_id', T.user.id).maybeSingle(),
  ]);
  T.me = t.data; T.priv = p.data;
}
async function loadDashboard() {
  const from = isoDate(new Date(Date.now() - 30 * 864e5));
  const [a, r, h, x] = await Promise.all([
    sb.from('availability').select('tutor_id,dow,slot').eq('tutor_id', T.user.id),
    sb.from('requests').select('*').eq('tutor_id', T.user.id).gte('session_date', from).order('session_date').order('slot'),
    sb.from('requests').select('id,parent_id,parent_name,child_first,grade,subject,session_date,slot,attended,minutes,session_note,completed_at')
      .eq('tutor_id', T.user.id).not('completed_at', 'is', null).order('session_date', { ascending: false }),
    sb.from('availability_dates').select('tutor_id,day,slot,open').eq('tutor_id', T.user.id).gte('day', today()),
  ]);
  T.dates = x.data || [];
  T.avail = a.data || [];
  // Hide finished sessions older than a week from the Requests list (they live in History).
  const weekAgo = isoDate(new Date(Date.now() - 7 * 864e5));
  T.reqs = (r.data || []).filter(q => q.session_date >= weekAgo || (q.status === 'approved' && !q.completed_at));
  T.history = h.data || [];
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
const needsLog = r => r.status === 'approved' && !r.completed_at && isPast(r.session_date, r.slot);
function reqCard(r) {
  const label = sessionLabel(r) || (needsLog(r) ? 'Log this session' : { pending: 'Needs review', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' }[r.status]);
  const upcoming = r.session_date >= today() && !isPast(r.session_date, r.slot);
  return `<article class="card req ${r.status}">
    <div class="row" style="justify-content:space-between"><h3>${esc(r.child_first)} · ${esc(r.grade)} grade · ${esc(r.subject)}</h3><span class="status ${needsLog(r) ? 'log' : r.completed_at && !r.attended ? 'declined' : r.status}">${label}</span></div>
    <p style="margin-top:6px;font-weight:600">${fmtDate(r.session_date)}, ${fmtTime(r.slot)} · ${esc(r.lang)}</p>
    <p class="meta">Parent: ${esc(r.parent_name)}</p>
    ${needsLog(r) ? `<div class="log-box"><div><b>How did it go?</b><span>Mark this session as done so it counts toward your volunteer hours.</span></div><button class="btn go" data-done="${r.id}">Mark as done</button></div>` : ''}
    ${r.completed_at && r.session_note ? `<div class="note"><b>Your notes:</b> ${esc(r.session_note)}</div>` : ''}
    ${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}
    <div class="thumbs">${(T.photos[r.id] || []).map((u, i) => `<button class="th" data-zoom="${esc(u)}" aria-label="Open photo ${i + 1}"><img src="${esc(u)}" alt="Homework photo ${i + 1}"></button>`).join('') || (r.photo_paths.length ? '' : '<span class="meta">Photos were deleted after 30 days.</span>')}</div>
    ${r.status === 'pending' && upcoming ? `<div class="f" style="margin-top:14px"><label for="m-${r.id}">Message to the family (optional)</label>
      <textarea id="m-${r.id}" maxlength="400" placeholder="For example: please have the reading book ready."></textarea></div>
      <div class="row"><button class="btn go" data-answer="${r.id}|1">Approve</button><button class="btn no" data-answer="${r.id}|0">Decline</button></div>` : ''}
    ${r.status === 'approved' && upcoming ? `<div class="row" style="margin-top:12px"><a class="btn y small" href="${esc(T.priv?.meet_link || '#')}" target="_blank" rel="noopener">Open my Meet</a><button class="btn no small" data-cancel="${r.id}">Cancel session</button></div>
      <p class="hint">The family got your Meet link by email.</p>` : ''}
  </article>`;
}

// Every-week schedule (repeats).
function weekEditor() {
  const has = (dow, sl) => T.avail.some(a => a.dow === dow && a.slot === sl);
  let h = `<div class="week"><div></div>${C.DAYS.map(d => `<div class="dh">${d.name}</div>`).join('')}`;
  for (const sl of C.TIMES) {
    h += `<div class="tm">${fmtTime(sl)}</div>`;
    for (const d of C.DAYS) {
      const on = has(d.dow, sl);
      h += `<button class="tog ${on ? 'on' : ''}" data-tog="${d.dow}|${sl}" aria-pressed="${on}" aria-label="Every ${d.name} at ${fmtTime(sl)}">${on ? 'Open' : ''}</button>`;
    }
  }
  return h + '</div>';
}

// Calendar for specific dates: day off, or extra times, up to WEEKS_AHEAD.
const dateCell = (date, dow, sl) => {
  const o = T.dates.find(x => x.day === date && x.slot === sl);
  const weekly = T.avail.some(a => a.dow === dow && a.slot === sl);
  const booked = T.reqs.find(r => r.session_date === date && r.slot === sl && ['pending', 'approved'].includes(r.status));
  if (booked) return { state: 'bk', label: esc(booked.child_first) };
  if (o) return o.open ? { state: 'extra', label: 'Extra', o } : { state: 'off', label: 'Off', o };
  return weekly ? { state: 'on', label: 'Open' } : { state: '', label: '' };
};
function calendarEditor() {
  const days = weekDays(T.week);
  let h = `<div class="week cal"><div></div>${days.map(d => {
    const past = d.date < today();
    const anyOpen = C.TIMES.some(sl => ['on', 'extra'].includes(dateCell(d.date, d.dow, sl).state));
    return `<div class="dh">${d.name}<small>${d.label}</small>${past ? '' : `<button class="dayoff" data-dayoff="${d.date}|${d.dow}" ${anyOpen ? '' : 'data-restore="1"'}>${anyOpen ? 'Day off' : 'Undo'}</button>`}</div>`;
  }).join('')}`;
  for (const sl of C.TIMES) {
    h += `<div class="tm">${fmtTime(sl)}</div>`;
    for (const d of days) {
      const c = dateCell(d.date, d.dow, sl);
      const past = isPast(d.date, sl);
      h += past || c.state === 'bk'
        ? `<div class="tog ${c.state === 'bk' ? 'bk' : 'past'}" title="${c.state === 'bk' ? 'Booked' : 'Past'}">${c.state === 'bk' ? c.label : ''}</div>`
        : `<button class="tog ${c.state}" data-cal="${d.date}|${d.dow}|${sl}" aria-label="${d.name} ${d.label} at ${fmtTime(sl)}: ${c.label || 'closed'}">${c.label}</button>`;
    }
  }
  return h + '</div>';
}
async function toggleDate(date, dow, sl) {
  const c = dateCell(date, dow, sl);
  const key = { tutor_id: T.user.id, day: date, slot: sl };
  const weekly = T.avail.some(a => a.dow === dow && a.slot === sl);
  const { error } = c.o
    ? await sb.from('availability_dates').delete().match(key)                                   // back to the weekly default
    : await sb.from('availability_dates').upsert({ ...key, open: !weekly });                     // weekly → off, closed → extra
  if (error) return toast(error.message);
  T.dates = c.o ? T.dates.filter(x => !(x.day === date && x.slot === sl)) : [...T.dates, { ...key, open: !weekly }];
  swap(dashboard);
}
async function toggleDay(date, dow, restore) {
  if (restore) {
    const { error } = await sb.from('availability_dates').delete().eq('tutor_id', T.user.id).eq('day', date);
    if (error) return toast(error.message);
    T.dates = T.dates.filter(x => x.day !== date);
  } else {
    const rows = C.TIMES.filter(sl => dateCell(date, dow, sl).state === 'on' && !isPast(date, sl)).map(sl => ({ tutor_id: T.user.id, day: date, slot: sl, open: false }));
    const extras = T.dates.filter(x => x.day === date && x.open);
    if (extras.length) await sb.from('availability_dates').delete().eq('tutor_id', T.user.id).eq('day', date).eq('open', true);
    if (rows.length) { const { error } = await sb.from('availability_dates').upsert(rows); if (error) return toast(error.message); }
    T.dates = [...T.dates.filter(x => !(x.day === date && x.open)), ...rows];
    toast('Day off saved. Families can\'t book you that day.');
  }
  swap(dashboard);
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
  const order = r => needsLog(r) ? 0 : r.status === 'pending' ? 1 : r.status === 'approved' && !r.completed_at ? 2 : r.completed_at ? 3 : 4;
  const list = [...T.reqs].sort((a, b) => order(a) - order(b) || a.session_date.localeCompare(b.session_date) || a.slot.localeCompare(b.slot));
  const toLog = T.reqs.filter(needsLog).length;
  let body;
  if (T.tab === 'requests') body = list.length ? `<div class="stack1">${list.map(reqCard).join('')}</div>` : '<div class="empty">No requests yet. Families see your open times on the Find a tutor page.</div>';
  else if (T.tab === 'history') body = historyView();
  else if (T.tab === 'week') body = `<div class="sched">
    <div class="card"><h2><span class="sched-n">1</span>Every week</h2><p class="meta" style="margin:6px 0 14px">Your usual times. <b>Set them once</b> and they repeat every week. Closing a time doesn't cancel sessions already booked.</p>${weekEditor()}</div>
    <div class="card"><h2><span class="sched-n blue">2</span>Calendar</h2><p class="meta" style="margin:6px 0 14px">For <b>one specific date</b> only, up to ${C.WEEKS_AHEAD} weeks ahead. Tap a time to change just that day: <span class="key on">Open</span> <span class="key extra">Extra</span> <span class="key off">Off</span>. Use <b>Day off</b> for games, tests and holidays. Booked sessions show the child's name.</p>
      ${weekNav(T.week, C.WEEKS_AHEAD, 'data-tweek')}${calendarEditor()}</div></div>`;
  else body = profileForm();
  page(`${T.me.status === 'paused' ? '<div class="warn" style="margin-bottom:18px">Your profile is paused by the club, so families can\'t see your times right now.</div>' : ''}
    ${!T.priv?.meet_link ? '<div class="warn" style="margin-bottom:18px">Add your Google Meet link in <b>Profile</b> so you can approve requests.</div>' : ''}
    <div class="top"><div><h1>Hi, ${esc(T.me.name.split(' ')[0])}</h1><p>${[pending ? `${pending} request${pending > 1 ? 's' : ''} waiting for you. Look at the homework photos, then approve or decline within 48 hours.` : '', toLog ? `${toLog} finished session${toLog > 1 ? 's' : ''} to mark as done.` : ''].filter(Boolean).join(' ') || "You're all caught up."}</p></div>
    <div class="stat mini"><b>${fmtHours(T.history.reduce((n, h) => n + (h.minutes || 0), 0))}</b><span>volunteer time logged</span></div></div>
    <div class="tabs">${[['requests', `Requests${pending + toLog ? ` (${pending + toLog})` : ''}`], ['week', 'My schedule'], ['history', 'History'], ['profile', 'Profile']].map(([k, l]) => `<button class="tab ${T.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`);
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

/* ---------- history: every child this tutor has helped ---------- */
function historyView() {
  if (!T.history.length) return '<div class="empty">No finished sessions yet. After each session, tap <b>Mark as done</b> and it shows up here.</div>';
  const groups = {};
  for (const h of T.history) (groups[h.parent_id + '|' + h.child_first.toLowerCase()] ||= []).push(h);
  const total = T.history.reduce((n, h) => n + (h.minutes || 0), 0);
  const joined = T.history.filter(h => h.attended).length;
  return `<div class="stats"><div class="stat"><b>${fmtHours(total)}</b><span>volunteer time</span></div>
      <div class="stat"><b>${joined}</b><span>sessions taught</span></div>
      <div class="stat"><b>${Object.keys(groups).length}</b><span>kids helped</span></div></div>
    <div class="stack1">${Object.values(groups).map(list => {
      const k = list[0], mins = list.reduce((n, h) => n + (h.minutes || 0), 0);
      return `<article class="card"><div class="row" style="justify-content:space-between"><h3>${esc(k.child_first)} · ${esc(k.grade)} grade</h3><span class="meta">${list.filter(h => h.attended).length} session${list.length > 1 ? 's' : ''} · ${fmtHours(mins)}</span></div>
        <p class="meta">Parent: ${esc(k.parent_name)}</p>
        <ul class="hist">${list.map(h => `<li><span class="hd">${fmtDate(h.session_date)}</span><span class="hs ${h.attended ? '' : 'miss'}">${h.attended ? `${h.minutes} min · ${esc(h.subject)}` : "Didn't join"}</span>${h.session_note ? `<span class="hn">${esc(h.session_note)}</span>` : ''}</li>`).join('')}</ul></article>`;
    }).join('')}</div>`;
}

function doneModal(id) {
  const r = T.reqs.find(q => q.id === id);
  openModal(`<form class="panel" id="donef" novalidate><div class="ph"><div><h2>Mark as done</h2><p class="meta">${esc(r.child_first)} · ${fmtDate(r.session_date)}, ${fmtTime(r.slot)}</p></div><button type="button" class="x" data-close aria-label="Close">✕</button></div>
    <fieldset class="f seg"><legend>Did ${esc(r.child_first)} join the call?</legend>
      <label><input type="radio" name="joined" value="1" checked><span>Yes, we met</span></label>
      <label><input type="radio" name="joined" value="0"><span>No, they didn't join</span></label></fieldset>
    <div class="f" id="d-mins-wrap"><label for="d-mins">How long was the session?</label>
      <select id="d-mins">${[10, 15, 20, 25, 30].map(m => `<option value="${m}" ${m === 30 ? 'selected' : ''}>${fmtHours(m)}</option>`).join('')}</select></div>
    <div class="f"><label for="d-note">What did you work on? (optional)</label><textarea id="d-note" maxlength="600" placeholder="Practiced subtracting with regrouping. Finished 6 of 8 problems."></textarea>
      <div class="hint">The family can see this note.</div></div>
    <div id="d-err" class="err" role="alert"></div>
    <div class="row"><button class="btn go" type="submit">Save</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
  $$('#donef input[name=joined]').forEach(i => i.addEventListener('change', () => { $('#d-mins-wrap').hidden = $('#donef input[name=joined]:checked').value === '0'; }));
  $('#donef').addEventListener('submit', async e => {
    e.preventDefault();
    const joined = $('#donef input[name=joined]:checked').value === '1';
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const { error } = await sb.rpc('complete_session', { req: id, joined, mins: +$('#d-mins').value, note: $('#d-note').value.trim() });
    if (error) { $('#d-err').textContent = error.message; btn.disabled = false; return; }
    closeModal(); toast(joined ? 'Logged! It counts toward your volunteer hours.' : 'Logged as a no-show.');
    await loadDashboard(); dashboard();
  });
}

/* ---------- events ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-tab],[data-tog],[data-answer],[data-cancel],[data-zoom],[data-done],[data-cal],[data-tweek],[data-dayoff]');
  if (!b || b.disabled) return;
  if (b.dataset.tweek) { T.week = +b.dataset.tweek; return swap(dashboard); }
  if (b.dataset.cal) { const [d, dow, sl] = b.dataset.cal.split('|'); return toggleDate(d, +dow, sl); }
  if (b.dataset.dayoff) { const [d, dow] = b.dataset.dayoff.split('|'); return toggleDay(d, +dow, !!b.dataset.restore); }
  if (b.dataset.done) return doneModal(b.dataset.done);
  if (b.dataset.tab) { T.tab = b.dataset.tab; dashboard(); }
  else if (b.dataset.zoom) lightbox(b.dataset.zoom);
  else if (b.dataset.tog) {
    const [dow, slot] = b.dataset.tog.split('|'); const d = +dow;
    const on = T.avail.some(a => a.dow === d && a.slot === slot);
    const { error } = on
      ? await sb.from('availability').delete().match({ tutor_id: T.user.id, dow: d, slot })
      : await sb.from('availability').insert({ tutor_id: T.user.id, dow: d, slot });
    if (error) return toast(error.message);
    T.avail = on ? T.avail.filter(a => !(a.dow === d && a.slot === slot)) : [...T.avail, { tutor_id: T.user.id, dow: d, slot }];
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
