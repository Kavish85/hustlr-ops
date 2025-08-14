const $ = (sel) => document.querySelector(sel);
const home = $('#home');
const view = $('#view');

// Live clock
function tick(){
  const now = new Date();
  const opts = {weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'};
  $('.clock').textContent = now.toLocaleString(undefined, opts);
}
setInterval(tick, 1000); tick();

// Home → Competitor News
$('#open-competitor-news').addEventListener('click', async ()=>{
  await renderCompetitorNews();
});

async function renderCompetitorNews(){
  home.hidden = true; view.hidden = false; view.innerHTML = '';
  let digest;
+  try {
+    const latest = await (await fetch('./data/index.json', {cache:'no-store'})).json();
+    digest = await (await fetch(latest.latest, {cache:'no-store'})).json();
+  } catch (err) {
+    const card = document.createElement('div');
+    card.className = 'card';
+    card.innerHTML = `<h3>Couldn’t load today’s digest</h3>
+    <p class="meta">Check your connection, then pull to refresh. The last saved digest will still be available offline.</p>`;
+    view.appendChild(card);
+    return;
+  }

  const hdr = document.createElement('div');
  hdr.className = 'card';
  hdr.innerHTML = `<div class="row"><span class="badge">${digest.date}</span><span class="meta">Last updated: ${fmtSAST(digest.generated_at)}</span></div>
   <h2>Competitor News</h2>
  <div class="actions">
    <button class="btn" id="back">← Back</button>
    <button class="btn" id="share">Share</button>
    <button class="btn" id="copy">Copy</button>
    <button class="btn" id="filter">Filter</button>
  </div>`;
  view.appendChild(hdr);
  $('#back').onclick = ()=>{ view.hidden = true; home.hidden = false; };
  $('#share').onclick = ()=>shareDigest(digest);
  $('#copy').onclick = ()=>copyDigest(digest);
  $('#filter').onclick = ()=>filterUI(digest);

  if(!digest.entries || digest.entries.length===0){
    const empty = document.createElement('div');
    empty.className = 'empty card';
    empty.textContent = 'No bottom-line events found for the selected window.';
    view.appendChild(empty);
    return;
  }

  for(const entry of digest.entries){
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = renderEntry(entry);

    // action handlers
    card.querySelectorAll('[data-action="ack"]').forEach(btn=>{
      btn.onclick = ()=> acknowledge(entry);
    });

    view.appendChild(card);
  }
}

function renderEntry(e){
  const tags = e.tags?.map(t=>`<span class="badge">${t}</span>`).join(' ') || '';
  const actions = (e.action_plan||[]).map(a=>`<li><strong>${a.title}</strong> — owner: ${a.owner||'Ops'}, ETA: ${a.eta||'n/a'} · ${a.effort||'—'} / ${a.impact||'—'}</li>`).join('');
  const links = (e.sources||[]).slice(0,4).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname}</a>`).join(' · ');
  return `
    <div class="row">${tags}</div>
    <h3>${e.competitor}</h3>
    <p>${e.summary}</p>
    <div class="meta">${links}</div>
    <hr />
    <strong>Action Plan</strong>
    <ol>${actions}</ol>
    <div class="actions">
      <button class="btn" data-action="ack" ${isAck ? 'disabled' : ''}>${isAck ? 'Acknowledged' : 'Mark acknowledged'}</button>
    </div>
  `;
}

function acknowledge(entry){
  const key = `ack-${entry.id}`;
  localStorage.setItem(key, '1');
  const t = document.getElementById('toaster');
  t.textContent = `Acknowledged: ${entry.competitor}`; t.hidden = false; setTimeout(()=>t.hidden=true, 2500);
}

async function shareDigest(digest){
  const text = `Hustlr competitor digest — ${digest.date}\n\n` + digest.entries.map(e=>`• ${e.competitor}: ${e.summary}`).join('\n');
  if(navigator.share){ await navigator.share({title:'Hustlr digest', text}); }
  else { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
}
function copyDigest(digest){
  const text = `Hustlr competitor digest — ${digest.date}\n\n` + digest.entries.map(e=>`• ${e.competitor}: ${e.summary}\n  Actions: ${(e.action_plan||[]).map(a=>a.title).join('; ')}`).join('\n\n');
  navigator.clipboard.writeText(text).then(()=>{
    const t = document.getElementById('toaster');
    t.textContent = 'Digest copied'; t.hidden = false; setTimeout(()=>t.hidden=true, 2500);
  });
}

function filterUI(digest){
  const impact = prompt('Filter by impact (High/Medium/Low) or leave blank');
  if(!impact) return renderFrom(digest.entries);
  renderFrom(digest.entries.filter(e=> (e.impact||'').toLowerCase()===impact.toLowerCase()));
}
function renderFrom(entries){
  const cards = entries.map(e=>`<div class='card'>${renderEntry(e)}</div>`).join('');
  view.innerHTML = view.innerHTML.replace(/<div class="card">[\s\S]*?<\/div>(?=\s*<div class="card">|$)/g, '');
  // naive refresh: re-render
  view.innerHTML = `<div class="card">${$('#view .card')?.innerHTML || ''}</div>` + cards;
}

+ function fmtSAST(iso){
+   if(!iso) return '';
+   try {
+     return new Date(iso).toLocaleString(undefined, {
+       timeZone: 'Africa/Johannesburg',
+       year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'
+     });
+   } catch { return iso; }
+ }

const ackKey = `ack-${e.id}`;
+  const isAck = localStorage.getItem(ackKey) === '1';
   const tags = e.tags?.map(t=>`<span class="badge">${t}</span>`).join(' ') || '';
   const actions = (e.action_plan||[]).map(a=>`<li><strong>${a.title}</strong> — owner: ${a.owner||'Ops'}, ETA: ${a.eta||'n/a'} · ${a.effort||'—'} / ${a.impact||'—'}</li>`).join('');
   const links = (e.sources||[]).slice(0,4).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${new URL(s.url).hostname}</a>`).join(' · ');
   return `
     <div class="row">${tags}</div>
     <h3>${e.competitor}</h3>
     <p>${e.summary}</p>
     <div class="meta">${links}</div>
     <hr />
     <strong>Action Plan</strong>
     <ol>${actions}</ol>
     <div class="actions">
