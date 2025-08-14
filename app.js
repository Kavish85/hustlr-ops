const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const home = $('#home');
const view = $('#view');

// Live clock
function tick(){
  const now = new Date();
  const opts = {weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'};
  $('.clock').textContent = now.toLocaleString(undefined, opts);
}
setInterval(tick, 1000); tick();

/* ============= ACCORDIONS (animated) ============= */
window.addEventListener('DOMContentLoaded', ()=>{
  // ensure panels aren't "display:none" so transitions can run
  document.querySelectorAll('.panel[hidden]').forEach(p=>p.hidden=false);
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.accordion');
  if (!btn) return;
  const panel = btn.nextElementSibling;
  if (!panel || !panel.classList.contains('panel')) return;

  const expanded = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!expanded));
  if (!expanded) {
    panel.classList.add('open');
    // allow height to fit content smoothly
    panel.style.maxHeight = panel.scrollHeight + 'px';
  } else {
    panel.style.maxHeight = panel.scrollHeight + 'px'; // set current height
    requestAnimationFrame(()=>{                         // then collapse
      panel.classList.remove('open');
      panel.style.maxHeight = '0px';
    });
  }
});

/* ============= SUB-APP: Competitor News ============= */
$('#open-competitor-news').addEventListener('click', renderCompetitorNews);

function fmtSAST(iso){
  if(!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      timeZone: 'Africa/Johannesburg',
      year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'
    });
  } catch { return iso; }
}

async function renderCompetitorNews(){
  home.hidden = true; view.hidden = false; view.innerHTML = '';

  // Load the latest digest safely
  let digest;
  try {
    const latest = await (await fetch('./data/index.json', {cache:'no-store'})).json();
    digest = await (await fetch(latest.latest, {cache:'no-store'})).json();
  } catch (err) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>Couldn’t load today’s digest</h3>
    <p class="meta">Check your connection, then pull to refresh. The last saved digest will still be available offline.</p>`;
    view.appendChild(card);
    return;
  }

  // You’ve seen the latest; hide the "New" badge on the home tile
  localStorage.setItem('lastSeenDigest', digest.date);
  const nb = document.getElementById('news-badge');
  if (nb) nb.hidden = true;

  const hdr = document.createElement('div');
  hdr.className = 'card';
  hdr.innerHTML = `<div class="row"><span class="badge">${digest.date}</span><span class="meta">Last updated: ${fmtSAST(digest.generated_at)}</span></div>
  <h2>Competitor News</h2>
  <div class="row" style="gap:8px;margin-top:6px">
    <button class="btn" id="back">← Back</button>
    <button class="btn" id="share">Share</button>
    <button class="btn" id="copy">Copy</button>
    <button class="btn subtle" id="filter">Filter</button>
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
    const ackBtn = card.querySelector('[data-action="ack"]');
    if (ackBtn) ackBtn.onclick = ()=> acknowledge(entry, card);
    view.appendChild(card);
  }
}

function renderEntry(e){
  const ackKey = `ack-${e.id}`;
  const isAck = localStorage.getItem(ackKey) === '1';
  const tags = e.tags?.map(t=>`<span class="badge">${t}</span>`).join(' ') || '';
  const actions = (e.action_plan||[]).map(a=>`<li><strong>${a.title}</strong> — owner: ${a.owner||'Ops'}, ETA: ${a.eta||'n/a'} · ${a.effort||'—'} / ${a.impact||'—'}</li>`).join('');
  const links = (e.sources||[]).slice(0,4).map(s=>{
    try { return `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${new URL(s.url).hostname}</a>`; }
    catch { return ''; }
  }).join(' · ');
  return `
    <div class="row">${tags}</div>
    <h3>${e.competitor}</h3>
    <p>${e.summary}</p>
    <div class="meta">${links}</div>
    <hr />
    <strong>Action Plan</strong>
    <ol>${actions}</ol>
    <div class="row">
      <button class="btn" data-action="ack" ${isAck ? 'disabled' : ''}>${isAck ? 'Acknowledged' : 'Mark acknowledged'}</button>
    </div>
  `;
}

function acknowledge(entry, cardEl){
  const key = `ack-${entry.id}`;
  localStorage.setItem(key, '1');
  const t = $('#toaster'); t.textContent = `Acknowledged: ${entry.competitor}`; t.hidden = false; setTimeout(()=>t.hidden=true, 2500);
  const btn = cardEl?.querySelector('[data-action="ack"]');
  if (btn) { btn.textContent = 'Acknowledged'; btn.disabled = true; }
}

async function shareDigest(digest){
  const text = `Hustlr competitor digest — ${digest.date}\n\n` + digest.entries.map(e=>`• ${e.competitor}: ${e.summary}`).join('\n');
  if(navigator.share){ await navigator.share({title:'Hustlr digest', text}); }
  else { await navigator.clipboard.writeText(text); alert('Copied to clipboard'); }
}
function copyDigest(digest){
  const text = `Hustlr competitor digest — ${digest.date}\n\n` + digest.entries.map(e=>`• ${e.competitor}: ${e.summary}\n  Actions: ${(e.action_plan||[]).map(a=>a.title).join('; ')}`).join('\n\n');
  navigator.clipboard.writeText(text).then(()=>{
    const t = $('#toaster'); t.textContent = 'Digest copied'; t.hidden = false; setTimeout(()=>t.hidden=true, 2500);
  });
}
function filterUI(digest){
  const impact = prompt('Filter by impact (High/Medium/Low) or leave blank');
  if(!impact) return renderFrom(digest.entries);
  renderFrom(digest.entries.filter(e=> (e.impact||'').toLowerCase()===impact.toLowerCase()));
}
function renderFrom(entries){
  const cards = entries.map(e=>`<div class='card'>${renderEntry(e)}</div>`).join('');
  // simple re-render in place
  view.querySelectorAll('.card:not(:first-child)').forEach(n=>n.remove());
  view.insertAdjacentHTML('beforeend', cards);
}

/* ============= SUB-APP: Weekly meal planner ============= */
const MEAL_OPTIONS = {
  Monday:    ["Chicken stir-fry","Beef mince tacos","Veg pasta","Grilled fish + salad","Bunny chow (lite)","Chicken wrap","Lentil curry","Burger night","Sushi bowls","Tomato soup + toast"],
  Tuesday:   ["Roast chicken & veg","Mac & cheese","Butter chicken","Poke bowls","Spaghetti bolognese","Falafel wraps","Thai green curry","Sausage & mash"],
  Wednesday: ["Lamb stew","Veggie fajitas","Chicken biryani","Teriyaki salmon","Toasted sarmies","Ramen (quick)","Caesar salad","Chow mein"],
  Thursday:  ["Pizza night","Pasta alfredo","Chicken schnitzel","Tuna salad","Cape Malay curry","Buddha bowls","Quesadillas","Soup & rolls"],
  Friday:    ["Takeaway treat","Braai night","Fish & chips","Homemade burgers","Prawn pasta","Nachos","Pizza leftovers","Sushi treat"]
};
// week key so locks reset weekly
function weekKey(date=new Date()){
  // ISO week key in SAST
  const d = new Date(date.toLocaleString('en-ZA', { timeZone:'Africa/Johannesburg' }));
  // Thursday trick to get ISO week
  const day = (d.getUTCDay()+6)%7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(),0,4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay()+6)%7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}

function renderMealPlanner(){
  const root = $('#meal-planner'); root.innerHTML = '';
  const wk = weekKey();
  Object.keys(MEAL_OPTIONS).forEach(day=>{
    const lockedKey = `meal-lock-${wk}-${day}`;
    const choiceKey = `meal-choice-${wk}-${day}`;
    const locked = localStorage.getItem(lockedKey)==='1';
    const saved = localStorage.getItem(choiceKey) || '';
    const card = document.createElement('div'); card.className = 'card';
    const opts = MEAL_OPTIONS[day].map(o=>`<option value="${o}" ${o===saved?'selected':''}>${o}</option>`).join('');
    card.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">${day}</h3>
        <span class="meta">${wk}</span>
      </div>
      <label class="meta" for="sel-${day}">Choose tonight’s meal</label>
      <select id="sel-${day}" class="select" ${locked?'disabled':''}>
        <option value="" ${saved===''?'selected':''} disabled>— Select —</option>
        ${opts}
      </select>
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn" id="lock-${day}" ${locked||!saved?'disabled':''}>${locked?'Locked':'Lock in'}</button>
        <button class="btn subtle" id="change-${day}" ${locked?'':'disabled'}>Change</button>
      </div>
    `;
    root.appendChild(card);

    const sel = card.querySelector(`#sel-${day}`);
    const lockBtn = card.querySelector(`#lock-${day}`);
    const changeBtn = card.querySelector(`#change-${day}`);

    sel?.addEventListener('change', ()=>{
      const pick = sel.value;
      if (!pick) return;
      if (confirm(`Confirm ${day}: "${pick}"?`)) {
        localStorage.setItem(choiceKey, pick);
        lockBtn.disabled = false;
      } else {
        sel.value = saved || '';
      }
    });

    lockBtn?.addEventListener('click', ()=>{
      const pick = sel.value;
      if (!pick) return;
      if (confirm(`Lock in ${day}: "${pick}"?`)) {
        localStorage.setItem(lockedKey, '1');
        sel.disabled = true; lockBtn.disabled = true; changeBtn.disabled = false; lockBtn.textContent = 'Locked';
        toast(`${day} locked: ${pick}`);
      }
    });

    changeBtn?.addEventListener('click', ()=>{
      if (confirm(`Unlock ${day}?`)) {
        localStorage.removeItem(lockedKey);
        sel.disabled = false; lockBtn.disabled = false; changeBtn.disabled = true; lockBtn.textContent = 'Lock in';
      }
    });
  });
}

/* ============= SUB-APP: Laya's Homework ============= */
/** File structure you maintain weekly:
 * data/homework/index.json
 *   { "current": "./data/homework/2025-W33.json" }
 * data/homework/2025-W33.json
 *   { "week":"2025-W33","week_of":"2025-08-11","tasks":[{"id":"math-1","text":"Fractions worksheet #4","due":"2025-08-13"}] }
 */
async function loadHomework(){
  const meta = $('#homework-meta');
  const list = $('#homework-list');
  list.innerHTML = ''; meta.textContent = '';
  try{
    const idx = await (await fetch('./data/homework/index.json', {cache:'no-store'})).json();
    const hw = await (await fetch(idx.current, {cache:'no-store'})).json();
    meta.textContent = `Week ${hw.week} — starting ${hw.week_of}`;
    for(const t of (hw.tasks||[])){
      const key = `hw-${hw.week}-${t.id}`;
      const checked = localStorage.getItem(key)==='1';
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <label class="row" style="gap:10px">
          <input type="checkbox" ${checked?'checked':''} id="${key}">
          <div>
            <div><strong>${t.text}</strong></div>
            <div class="meta">${t.due ? 'Due: '+t.due : ''}</div>
          </div>
        </label>
      `;
      list.appendChild(row);
      row.querySelector('input').addEventListener('change', (e)=>{
        if(e.target.checked) localStorage.setItem(key,'1'); else localStorage.removeItem(key);
      });
    }
  }catch(e){
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `<h3>Homework not found</h3><p class="meta">Create <code>data/homework/index.json</code> and a week file as shown in the docs below.</p>`;
    list.appendChild(row);
  }
}
$('#reload-homework')?.addEventListener('click', loadHomework);
$('#reset-homework')?.addEventListener('click', ()=>{
  if(!confirm('Clear all ticks for the current week?')) return;
  // Only clear this week's keys:
  const wk = $('#homework-meta').textContent.match(/Week\s([^\s]+)/)?.[1];
  if(!wk) return;
  Object.keys(localStorage).forEach(k=>{ if(k.startsWith(`hw-${wk}-`)) localStorage.removeItem(k); });
  loadHomework();
});

/* ============= helpers ============= */
function toast(msg){
  const t = $('#toaster'); t.textContent = msg; t.hidden = false; setTimeout(()=>t.hidden=true, 2500);
}

/* ============= boot ============= */
renderMealPlanner();
loadHomework();
