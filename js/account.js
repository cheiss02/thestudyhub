/* =====================================================================
   My requests (account.html) — for parents
   See each request's status, get the Meet link once approved,
   cancel, or delete all family data.
   ===================================================================== */

let mine = [];

async function load() {
  const { data, error } = await sb.rpc('my_requests');
  if (error) { toast(error.message); mine = []; } else mine = data || [];
}

function render(user) {
  const upcoming = mine.filter(r => r.session_date >= today() && ['pending', 'approved'].includes(r.status));
  const past = mine.filter(r => !upcoming.includes(r));
  const label = { pending: 'Waiting for tutor', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };
  const card = r => `<article class="card req ${r.status}">
    <div class="row" style="justify-content:space-between"><h3>${esc(r.child_first)} · ${esc(r.subject)}</h3><span class="status ${r.status}">${label[r.status]}</span></div>
    <p style="margin-top:6px;font-weight:600">${fmtDate(r.session_date)} at ${fmtTime(r.slot)} with ${esc(r.tutor_name)}</p>
    ${r.tutor_note ? `<div class="note"><b>Note from ${esc(r.tutor_name)}:</b> ${esc(r.tutor_note)}</div>` : ''}
    ${r.status === 'approved' && r.meet_link && r.session_date >= today() ? `<div class="row" style="margin-top:12px"><a class="btn go" href="${esc(r.meet_link)}" target="_blank" rel="noopener">Join Google Meet</a><span class="meta">Please stay nearby during the call.</span></div>` : ''}
    ${r.status === 'declined' ? '<p class="meta" style="margin-top:8px">This tutor couldn\'t take this one. <a href="index.html">Pick another time</a>.</p>' : ''}
    ${upcoming.includes(r) ? `<div class="row" style="margin-top:12px"><button class="btn no small" data-cancel="${r.id}">Cancel session</button></div>` : ''}
  </article>`;
  $('#main').innerHTML = `<section class="band"><div class="wrap">
    <div class="top"><div><h1>My requests</h1><p>Signed in as ${esc(user.email)}. We also email you when a tutor answers.</p></div><a class="btn y" href="index.html">Book another session</a></div>
    <h2 style="margin-bottom:12px">Coming up</h2>
    ${upcoming.length ? `<div class="stack1">${upcoming.map(card).join('')}</div>` : '<div class="empty">No upcoming sessions. <a href="index.html">Find a tutor</a>.</div>'}
    ${past.length ? `<h2 style="margin:28px 0 12px">Past and closed</h2><div class="stack1">${past.map(card).join('')}</div>` : ''}
    <div class="card" style="margin-top:32px;max-width:640px"><h3>Your family's information</h3>
      <p class="meta" style="margin:6px 0 12px">Homework photos are deleted automatically 30 days after each session. You can delete everything now.</p>
      <button class="btn no small" id="del-all">Delete all my requests and photos</button></div>
  </div></section>`;
}

async function cancel(id) {
  const { error } = await sb.rpc('cancel_request', { req: id });
  if (error) return toast(error.message);
  toast('Session cancelled. We let the tutor know.');
  await load(); render(await currentUser());
}

function confirmDelete() {
  openModal(`<div class="panel"><div class="ph"><h2>Delete everything?</h2><button class="x" data-close aria-label="Close">✕</button></div>
    <p>This deletes all your requests and homework photos and cancels any upcoming sessions. It can't be undone.</p>
    <div class="row" style="margin-top:16px"><button class="btn no" id="del-yes">Yes, delete</button><button class="btn ghost" data-close>Keep</button></div></div>`);
  $('#del-yes').addEventListener('click', async () => {
    const paths = mine.flatMap(r => r.photo_paths || []);
    if (paths.length) await sb.storage.from('homework').remove(paths);
    const { error } = await sb.rpc('delete_my_family_data');
    closeModal();
    if (error) return toast(error.message);
    toast('Deleted.'); await load(); render(await currentUser());
  });
}

document.addEventListener('click', e => {
  const c = e.target.closest('[data-cancel]'); if (c) cancel(c.dataset.cancel);
  if (e.target.id === 'del-all') confirmDelete();
});

(async function start() {
  const { user } = await renderChrome('account');
  if (!READY) { $('#main').innerHTML = '<section class="band"><div class="wrap"><div class="empty">Coming soon.</div></div></section>'; return; }
  if (user) $('#main').innerHTML = `<section class="band"><div class="wrap">${skeleton(1)}</div></section>`;
  if (!user) {
    $('#main').innerHTML = `<section class="band"><div class="wrap"><div class="card intro-card">
      <h1>My requests</h1>
      <p style="margin:10px 0 6px">This is where parents see the sessions they've requested, get the Google Meet link once a tutor approves, and cancel if plans change.</p>
      <p class="meta" style="margin-bottom:20px">No account needed to browse tutors. You only sign in when you send a request.</p>
      <div class="row"><button class="btn" id="go-in">Sign in with my email</button><a class="btn ghost" href="index.html">Find a tutor</a></div></div></div></section>`;
    $('#go-in').addEventListener('click', () => signInModal('parent'));
    return;
  }
  await load(); render(user);
})();
