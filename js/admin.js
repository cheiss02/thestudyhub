/* =====================================================================
   Club admin (admin.html) — officers and advisor only
   Approve new tutors, pause tutors, see every session.
   Admin emails are listed in the "admins" table (see README).
   ===================================================================== */

const A = { tutors: [], priv: {}, avail: [], reqs: [], admins: [], families: [], all: [], since: {} };
const MAIN_ADMIN = 'help@thestudyhub.us';

async function load() {
  const from = isoDate(new Date(Date.now() - 7 * 864e5));
  const [t, p, a, r, ad, fm, all, cs, ns] = await Promise.all([
    sb.from('tutors').select('*').order('created_at'),
    sb.from('tutor_private').select('*'),
    sb.from('availability').select('tutor_id'),
    sb.from('requests').select('id,tutor_id,session_date,slot,child_first,grade,subject,status,parent_name,completed_at,attended,minutes,tutor_no_show_at,cancelled_by,parent_id').gte('session_date', from).order('session_date').order('slot'),
    sb.from('admins').select('email').order('email'),
    sb.from('families').select('*').order('created_at', { ascending: false }),
    sb.from('requests').select('id,tutor_id,created_at,completed_at,attended,minutes,photo_paths'),
    sb.from('club_settings').select('key,since'),
    sb.rpc('admin_no_show_counts'),
  ]);
  A.noShows = Object.fromEntries((ns.data || []).map(x => [x.kind + ':' + x.person, x.n]));
  A.all = all.data || [];
  A.since = Object.fromEntries((cs.data || []).map(x => [x.key, x.since]));
  A.families = fm.data || [];
  A.admins = (ad.data || []).map(x => x.email);
  A.tutors = t.data || []; A.avail = a.data || []; A.reqs = r.data || [];
  A.priv = Object.fromEntries((p.data || []).map(x => [x.tutor_id, x]));
}

// Counters that admins can reset ("start counting from today").
function metrics() {
  const after = (key, ts) => ts && ts >= (A.since[key] || '2000');
  const done = A.all.filter(r => r.completed_at);
  return {
    hours: done.filter(r => after('hours', r.completed_at)).reduce((n, r) => n + (r.minutes || 0), 0),
    sessions: done.filter(r => r.attended && after('sessions', r.completed_at)).length,
    requests: A.all.filter(r => after('requests', r.created_at)).length,
    families: A.families.filter(f => after('families', f.created_at)).length,
    tutorMins: id => done.filter(r => r.tutor_id === id && after('hours', r.completed_at)).reduce((n, r) => n + (r.minutes || 0), 0),
  };
}
const sinceLabel = key => !A.since[key] || A.since[key] < '2001' ? 'since the start' : `since ${fmtDate(A.since[key].slice(0, 10))}`;
const resettable = (key, value, label) => `<div class="stat"><b>${value}</b><span>${label}</span><small class="since">${sinceLabel(key)} · <button class="linkish" data-reset="${key}">Reset</button></small></div>`;

// 2 no-shows in 30 days = check in; 3 = pause.
const noShowCell = (kind, id) => { const n = A.noShows?.[kind + ':' + id] || 0; return n >= 3 ? `<span class="status declined">${n} · pause?</span>` : n === 2 ? `<span class="status log">${n} · check in</span>` : String(n); };

function render() {
  const active = A.tutors.filter(t => t.status === 'active');
  const apps = A.tutors.filter(t => t.status === 'pending');
  const name = id => A.tutors.find(t => t.id === id)?.name || '?';
  const upcoming = A.reqs.filter(r => r.session_date >= today());
  const count = s => upcoming.filter(r => r.status === s).length;
  const statusLabel = { pending: 'Needs review', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
  const M = metrics();
  $('#main').innerHTML = `<section class="band"><div class="wrap">
    <div class="top"><div><h1>Club admin</h1><p>Approve new families and tutors, pause anyone who can't tutor, manage admins and keep an eye on sessions. <a href="help.html#admins">Admin guide</a></p></div></div>
    <h2 style="margin-bottom:12px">Impact</h2>
    <div class="stats">
      ${resettable('hours', fmtHours(M.hours), 'of free help given')}
      ${resettable('sessions', M.sessions, 'sessions completed')}
      ${resettable('requests', M.requests, 'requests from families')}
      ${resettable('families', M.families, 'families signed up')}</div>
    <h2 style="margin-bottom:12px">Right now</h2>
    <div class="stats">
      <div class="stat"><b>${active.length}</b><span>active tutors</span></div>
      <div class="stat"><b>${new Set(active.flatMap(t => t.langs)).size}</b><span>languages</span></div>
      <div class="stat"><b>${count('pending')}</b><span>waiting on a tutor</span></div>
      <div class="stat"><b>${upcoming.filter(r => r.status === 'approved' && !r.completed_at).length}</b><span>sessions coming up</span></div>
      <div class="stat"><b>${A.families.filter(f => f.status === 'approved').length}</b><span>approved families</span></div></div>

    <h2 style="margin-bottom:12px">New families${A.families.filter(f => f.status === 'pending').length ? ` (${A.families.filter(f => f.status === 'pending').length})` : ''}</h2>
    ${A.families.some(f => f.status === 'pending') ? `<div class="stack1" style="margin-bottom:28px">${A.families.filter(f => f.status === 'pending').map(f => `<article class="card">
      <div class="row" style="justify-content:space-between"><h3>${esc(f.parent_name)}</h3><span class="meta">Signed up ${fmtDate(f.created_at.slice(0, 10))}</span></div>
      <p style="margin-top:6px;font-size:15px">${[f.city, f.home_lang && `Speaks ${f.home_lang} at home`].filter(Boolean).map(esc).join(' · ')}</p>
      ${f.heard ? `<p class="meta">Heard about us: ${esc(f.heard)}</p>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn go" data-fam="${f.id}|approved">Approve family</button><button class="btn no" data-fam="${f.id}|declined">Decline</button></div></article>`).join('')}</div>`
      : '<div class="empty" style="margin-bottom:28px">No families waiting.</div>'}

    <h2 style="margin-bottom:12px">Tutor applications</h2>
    ${apps.length ? `<div class="stack1" style="margin-bottom:28px">${apps.map(t => `<article class="card">
      <div class="row" style="justify-content:space-between"><h3>${esc(t.name)} · ${esc(t.grade)}</h3><span class="meta">${esc(A.priv[t.id]?.school_email || '')}</span></div>
      <div class="tags" style="margin-top:8px">${t.langs.map(l => `<span class="tag lang">${esc(l)}</span>`).join('')}${t.subjects.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      ${A.priv[t.id]?.why ? `<p style="font-size:15px"><b>Why:</b> ${esc(A.priv[t.id].why)}</p>` : ''}
      <p class="hint">Before approving: confirm with the advisor that the code of conduct is signed.</p>
      <div class="row" style="margin-top:12px"><button class="btn go" data-set="${t.id}|active">Approve tutor</button><button class="btn no" data-set="${t.id}|declined">Decline</button></div></article>`).join('')}</div>`
      : '<div class="empty" style="margin-bottom:28px">No applications waiting.</div>'}

    <h2 style="margin-bottom:12px">Tutors</h2>
    <div class="scroll" style="margin-bottom:28px"><table class="stack"><thead><tr><th>Tutor</th><th>Email</th><th>Languages</th><th>Weekly times</th><th>Meet link</th><th>Volunteer time</th><th>No-shows (30 days)</th><th>Status</th></tr></thead><tbody>
    ${A.tutors.filter(t => ['active', 'paused'].includes(t.status)).map(t => `<tr>
      <td data-l="Tutor"><b>${esc(t.name)}</b> · ${esc(t.grade)}</td>
      <td data-l="Email">${esc(A.priv[t.id]?.school_email || '')}</td>
      <td data-l="Languages">${esc(t.langs.join(', '))}</td>
      <td data-l="Weekly times">${A.avail.filter(a => a.tutor_id === t.id).length}</td>
      <td data-l="Meet link">${A.priv[t.id]?.meet_link ? 'Yes' : '<span style="color:var(--red)">Missing</span>'}</td>
      <td data-l="Volunteer time">${fmtHours(M.tutorMins(t.id))}</td>
      <td data-l="No-shows (30 days)">${noShowCell('tutor', t.id)}</td>
      <td data-l="Status"><div class="row"><button class="btn small ${t.status === 'active' ? 'ghost' : 'y'}" data-set="${t.id}|${t.status === 'active' ? 'paused' : 'active'}">${t.status === 'active' ? 'Active · pause' : 'Paused · turn on'}</button><button class="linkish danger" data-remove="tutors|${t.id}|${esc(t.name)}">Remove</button></div></td></tr>`).join('') || '<tr><td colspan="8">No tutors yet.</td></tr>'}
    </tbody></table></div>

    <h2 style="margin-bottom:6px">Club admins</h2>
    <p class="meta" style="margin-bottom:12px">Admins can approve tutors and see all sessions. Only people on this list can open this page.</p>
    <div class="card" style="margin-bottom:28px;max-width:680px">
      <ul class="admin-list">${A.admins.map(e => `<li><span class="me-av" aria-hidden="true">${esc(e[0].toUpperCase())}</span><span class="grow">${esc(e)}${e === MAIN_ADMIN ? ' <span class="tag">main account</span>' : ''}</span>${e === MAIN_ADMIN ? '' : `<button class="btn no small" data-unadmin="${esc(e)}">Remove</button>`}</li>`).join('')}</ul>
      <form id="add-admin" class="row" style="margin-top:14px" novalidate><input type="email" id="new-admin" placeholder="officer@school.org" aria-label="New admin email" style="flex:1;min-width:200px"><button class="btn small" type="submit">Add admin</button></form>
      <div id="admin-err" class="err" role="alert"></div></div>

    <h2 style="margin-bottom:12px">Sessions</h2>
    <div class="scroll"><table class="stack"><thead><tr><th>When</th><th>Tutor</th><th>Child</th><th>Subject</th><th>Parent</th><th>Status</th><th></th></tr></thead><tbody>
    ${A.reqs.map(r => `<tr>
      <td data-l="When" style="white-space:nowrap">${fmtDate(r.session_date)}, ${fmtTime(r.slot)}</td>
      <td data-l="Tutor">${esc(name(r.tutor_id))}</td>
      <td data-l="Child">${esc(r.child_first)} (${esc(r.grade)})</td>
      <td data-l="Subject">${esc(r.subject)}</td>
      <td data-l="Parent">${esc(r.parent_name)}</td>
      <td data-l="Status"><span class="status ${r.completed_at ? (r.attended ? 'approved' : 'declined') : r.status === 'approved' && isPast(r.session_date, r.slot) ? 'log' : r.status}">${sessionLabel(r) || (r.status === 'approved' && isPast(r.session_date, r.slot) ? 'Not logged yet' : r.status === 'cancelled' && r.cancelled_by ? `Cancelled by ${{ parent: 'family', tutor: 'tutor', admin: 'admin' }[r.cancelled_by]}` : statusLabel[r.status])}</span></td>
      <td data-l="">${['pending', 'approved'].includes(r.status) && !r.completed_at && !isPast(r.session_date, r.slot) ? `<button class="btn no small" data-cancel="${r.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No sessions yet.</td></tr>'}
    </tbody></table></div>

    <h2 style="margin:28px 0 12px">Families</h2>
    <div class="scroll"><table class="stack"><thead><tr><th>Parent</th><th>City</th><th>Language</th><th>No-shows (30 days)</th><th>Status</th><th></th></tr></thead><tbody>
    ${A.families.filter(f => f.status !== 'pending').map(f => `<tr><td data-l="Parent"><b>${esc(f.parent_name)}</b></td><td data-l="City">${esc(f.city)}</td><td data-l="Language">${esc(f.home_lang)}</td>
      <td data-l="No-shows (30 days)">${noShowCell('family', f.id)}</td>
      <td data-l="Status"><button class="btn small ${f.status === 'approved' ? 'ghost' : 'y'}" data-fam="${f.id}|${f.status === 'approved' ? 'declined' : 'approved'}">${f.status === 'approved' ? 'Can book · pause' : 'Paused · turn on'}</button></td>
      <td data-l=""><button class="linkish danger" data-remove="families|${f.id}|${esc(f.parent_name)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="6">No families yet.</td></tr>'}
    </tbody></table></div>

    <div class="card danger-zone">
      <h2>Start fresh after testing</h2>
      <p class="meta" style="margin:6px 0 14px">Use <b>Reset</b> on any counter above to start counting from today (records stay). To erase test data completely, delete every session and homework photo here. Remove test tutors and families with their <b>Remove</b> links.</p>
      <button class="btn no" id="wipe">Delete all sessions and photos…</button></div>
  </div></section>`;
}

document.addEventListener('submit', async e => {
  if (e.target.id !== 'add-admin') return;
  e.preventDefault();
  const email = $('#new-admin').value.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) { $('#admin-err').textContent = 'Please enter a valid email.'; return; }
  const { error } = await sb.from('admins').insert({ email });
  if (error) { $('#admin-err').textContent = /duplicate/.test(error.message) ? 'That email is already an admin.' : error.message; return; }
  toast(`${email} is now an admin. They sign in at thestudyhub.us/admin.html.`); await load(); render();
});

function confirmBox(title, body, yes, onYes, typeWord) {
  openModal(`<div class="panel"><div class="ph"><h2>${title}</h2><button class="x" data-close aria-label="Close">✕</button></div>${body}
    ${typeWord ? `<div class="f" style="margin-top:14px"><label for="cf-word">Type <b>${typeWord}</b> to confirm</label><input type="text" id="cf-word" autocomplete="off"></div>` : ''}
    <div class="row" style="margin-top:16px"><button class="btn no" id="cf-yes" ${typeWord ? 'disabled' : ''}>${yes}</button><button class="btn ghost" data-close>Cancel</button></div></div>`);
  $('#cf-word')?.addEventListener('input', e => { $('#cf-yes').disabled = e.target.value.trim().toUpperCase() !== typeWord; });
  $('#cf-yes').addEventListener('click', async () => { $('#cf-yes').disabled = true; await onYes(); closeModal(); await load(); render(); });
}
const LABELS = { hours: 'help hours', sessions: 'completed sessions', requests: 'requests', families: 'new families' };

document.addEventListener('click', async e => {
  const rs = e.target.closest('[data-reset]');
  if (rs) return confirmBox(`Reset ${LABELS[rs.dataset.reset]}?`, `<p>This counter starts again from zero today. Session records and history are not deleted.</p>`, 'Reset to zero', async () => {
    const { error } = await sb.rpc('reset_metric', { metric: rs.dataset.reset });
    toast(error ? error.message : 'Counter reset.');
  });
  const rm = e.target.closest('[data-remove]');
  if (rm) {
    const [table, id, name] = rm.dataset.remove.split('|');
    return confirmBox(`Remove ${esc(name)}?`, table === 'tutors'
      ? '<p>Removes this tutor, their weekly times and all their sessions and history. Their sign-in email stays, and they could apply again.</p>'
      : '<p>Removes this family profile. Their sessions stay until you delete them. They would need approval again to book.</p>', 'Remove', async () => {
      if (table === 'tutors') {
        const paths = A.all.filter(r => r.tutor_id === id).flatMap(r => r.photo_paths || []);
        if (paths.length) await sb.storage.from('homework').remove(paths);
      }
      const { error } = await sb.from(table).delete().eq('id', id);
      toast(error ? error.message : 'Removed.');
    });
  }
  if (e.target.id === 'wipe') return confirmBox('Delete all sessions and photos?', `<p>This permanently deletes <b>all ${A.all.length} session requests</b> and their homework photos, and resets every counter to zero. Tutors, families and admins stay. This can't be undone.</p>`, 'Delete everything', async () => {
    const paths = A.all.flatMap(r => r.photo_paths || []);
    for (let i = 0; i < paths.length; i += 100) await sb.storage.from('homework').remove(paths.slice(i, i + 100));
    const { error } = await sb.from('requests').delete().not('id', 'is', null);
    if (!error) for (const k of Object.keys(LABELS)) await sb.rpc('reset_metric', { metric: k });
    toast(error ? error.message : 'All test sessions deleted. Counters are at zero.');
  }, 'DELETE');
  const u = e.target.closest('[data-unadmin]');
  if (u) {
    const email = u.dataset.unadmin;
    openModal(`<div class="panel"><div class="ph"><h2>Remove admin?</h2><button class="x" data-close aria-label="Close">✕</button></div>
      <p><b>${esc(email)}</b> will no longer be able to open the Club admin page.</p>
      <div class="row" style="margin-top:16px"><button class="btn no" id="un-yes">Remove</button><button class="btn ghost" data-close>Keep</button></div></div>`);
    $('#un-yes').addEventListener('click', async () => {
      const { error } = await sb.from('admins').delete().eq('email', email);
      closeModal(); if (error) return toast(error.message);
      toast('Admin removed.'); await load(); render();
    });
    return;
  }
  const fb = e.target.closest('[data-fam]');
  if (fb) {
    fb.disabled = true;
    const [id, status] = fb.dataset.fam.split('|');
    const { error } = await sb.from('families').update({ status }).eq('id', id);
    if (error) { fb.disabled = false; return toast(error.message); }
    const was = A.families.find(f => f.id === id)?.status;
    toast(was === 'pending' ? (status === 'approved' ? 'Family approved. We emailed them.' : 'Family declined.') : (status === 'approved' ? 'Family can book again.' : 'Family paused. They can\'t book new sessions.')); await load(); render(); return;
  }
  const b = e.target.closest('[data-set],[data-cancel]'); if (!b) return;
  b.disabled = true;
  if (b.dataset.set) {
    const [id, status] = b.dataset.set.split('|');
    const { error } = await sb.from('tutors').update({ status }).eq('id', id);
    if (error) { b.disabled = false; return toast(error.message); }
    toast({ active: 'Tutor is active.', paused: 'Tutor paused.', declined: 'Application declined.' }[status]);
  } else {
    const { error } = await sb.rpc('cancel_request', { req: b.dataset.cancel });
    if (error) { b.disabled = false; return toast(error.message); }
    toast('Session cancelled. Both sides get an email.');
  }
  await load(); render();
});

(async function start() {
  const { user, admin } = await renderChrome('admin');
  const msg = h => { $('#main').innerHTML = `<section class="band"><div class="wrap">${h}</div></section>`; };
  if (!READY) return msg('<div class="empty">Coming soon.</div>');
  if (!user) { msg('<div class="card intro-card"><h1>Club admin</h1><p class="meta" style="margin:10px 0 18px">Only for club admins. Sign in with an email on the admin list. We email you a 6-digit code.</p><p class="meta" style="margin:-8px 0 18px">Want to be a club officer? Email the club founder at <a href="mailto:${C.CLUB_EMAIL}?subject=Club%20officer%20application">${C.CLUB_EMAIL}</a>.</p><button class="btn" id="go-in">Admin sign-in</button></div>'); $('#go-in').addEventListener('click', () => signInModal('admin', { mode: 'in' })); return; }
  if (!admin) return msg(`<div class="card intro-card"><h1>Club admin</h1><p class="meta" style="margin-top:10px">This page is only for club admins. ${esc(user.email)} isn't on the admin list. To become a club officer, email the club founder at <a href="mailto:${C.CLUB_EMAIL}?subject=Club%20officer%20application">${C.CLUB_EMAIL}</a>.</p><a class="btn ghost" href="index.html" style="margin-top:16px">Back to Find a tutor</a></div>`);
  await load(); render();
})();
