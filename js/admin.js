/* =====================================================================
   Club admin (admin.html) — officers and advisor only
   Approve new tutors, pause tutors, see every session.
   Admin emails are listed in the "admins" table (see README).
   ===================================================================== */

const A = { tutors: [], priv: {}, avail: [], reqs: [] };

async function load() {
  const from = isoDate(new Date(Date.now() - 7 * 864e5));
  const [t, p, a, r] = await Promise.all([
    sb.from('tutors').select('*').order('created_at'),
    sb.from('tutor_private').select('*'),
    sb.from('availability').select('tutor_id'),
    sb.from('requests').select('id,tutor_id,session_date,slot,child_first,grade,subject,status,parent_name').gte('session_date', from).order('session_date').order('slot'),
  ]);
  A.tutors = t.data || []; A.avail = a.data || []; A.reqs = r.data || [];
  A.priv = Object.fromEntries((p.data || []).map(x => [x.tutor_id, x]));
}

function render() {
  const active = A.tutors.filter(t => t.status === 'active');
  const apps = A.tutors.filter(t => t.status === 'pending');
  const name = id => A.tutors.find(t => t.id === id)?.name || '?';
  const upcoming = A.reqs.filter(r => r.session_date >= today());
  const count = s => upcoming.filter(r => r.status === s).length;
  const statusLabel = { pending: 'Needs review', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
  $('#main').innerHTML = `<section class="band"><div class="wrap">
    <div class="top"><div><h1>Club admin</h1><p>Approve new tutors after they sign the code of conduct, pause anyone who can't tutor, and keep an eye on sessions.</p></div></div>
    <div class="stats">
      <div class="stat"><b>${active.length}</b><span>active tutors</span></div>
      <div class="stat"><b>${new Set(active.flatMap(t => t.langs)).size}</b><span>languages</span></div>
      <div class="stat"><b>${count('pending')}</b><span>waiting on a tutor</span></div>
      <div class="stat"><b>${count('approved')}</b><span>sessions coming up</span></div></div>

    <h2 style="margin-bottom:12px">Tutor applications</h2>
    ${apps.length ? `<div class="stack1" style="margin-bottom:28px">${apps.map(t => `<article class="card">
      <div class="row" style="justify-content:space-between"><h3>${esc(t.name)} · ${esc(t.grade)}</h3><span class="meta">${esc(A.priv[t.id]?.school_email || '')}</span></div>
      <div class="tags" style="margin-top:8px">${t.langs.map(l => `<span class="tag lang">${esc(l)}</span>`).join('')}${t.subjects.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      ${A.priv[t.id]?.why ? `<p style="font-size:15px"><b>Why:</b> ${esc(A.priv[t.id].why)}</p>` : ''}
      <p class="hint">Before approving: confirm with the advisor that the code of conduct is signed.</p>
      <div class="row" style="margin-top:12px"><button class="btn go" data-set="${t.id}|active">Approve tutor</button><button class="btn no" data-set="${t.id}|declined">Decline</button></div></article>`).join('')}</div>`
      : '<div class="empty" style="margin-bottom:28px">No applications waiting.</div>'}

    <h2 style="margin-bottom:12px">Tutors</h2>
    <div class="scroll" style="margin-bottom:28px"><table class="stack"><thead><tr><th>Tutor</th><th>Email</th><th>Languages</th><th>Weekly times</th><th>Meet link</th><th>Status</th></tr></thead><tbody>
    ${A.tutors.filter(t => ['active', 'paused'].includes(t.status)).map(t => `<tr>
      <td data-l="Tutor"><b>${esc(t.name)}</b> · ${esc(t.grade)}</td>
      <td data-l="Email">${esc(A.priv[t.id]?.school_email || '')}</td>
      <td data-l="Languages">${esc(t.langs.join(', '))}</td>
      <td data-l="Weekly times">${A.avail.filter(a => a.tutor_id === t.id).length}</td>
      <td data-l="Meet link">${A.priv[t.id]?.meet_link ? 'Yes' : '<span style="color:var(--red)">Missing</span>'}</td>
      <td data-l="Status"><button class="btn small ${t.status === 'active' ? 'ghost' : 'y'}" data-set="${t.id}|${t.status === 'active' ? 'paused' : 'active'}">${t.status === 'active' ? 'Active · pause' : 'Paused · turn on'}</button></td></tr>`).join('') || '<tr><td colspan="6">No tutors yet.</td></tr>'}
    </tbody></table></div>

    <h2 style="margin-bottom:12px">Sessions</h2>
    <div class="scroll"><table class="stack"><thead><tr><th>When</th><th>Tutor</th><th>Child</th><th>Subject</th><th>Parent</th><th>Status</th><th></th></tr></thead><tbody>
    ${A.reqs.map(r => `<tr>
      <td data-l="When" style="white-space:nowrap">${fmtDate(r.session_date)}, ${fmtTime(r.slot)}</td>
      <td data-l="Tutor">${esc(name(r.tutor_id))}</td>
      <td data-l="Child">${esc(r.child_first)} (${esc(r.grade)})</td>
      <td data-l="Subject">${esc(r.subject)}</td>
      <td data-l="Parent">${esc(r.parent_name)}</td>
      <td data-l="Status"><span class="status ${r.status}">${statusLabel[r.status]}</span></td>
      <td data-l="">${['pending', 'approved'].includes(r.status) && r.session_date >= today() ? `<button class="btn no small" data-cancel="${r.id}">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No sessions yet.</td></tr>'}
    </tbody></table></div>
  </div></section>`;
}

document.addEventListener('click', async e => {
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
  if (!user) { msg('<h1>Club admin</h1><p class="meta" style="margin:10px 0 18px">For club officers and the advisor.</p><button class="btn" id="go-in">Sign in</button>'); $('#go-in').addEventListener('click', () => signInModal('Club officers only.')); return; }
  if (!admin) return msg(`<h1>Club admin</h1><p class="meta" style="margin-top:10px">This page is only for club officers. Ask the club to add ${esc(user.email)} as an admin.</p>`);
  await load(); render();
})();
