import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';
import pLimit from 'p-limit';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dailyDir = path.join(dataDir, 'daily');
const competitors = JSON.parse(fs.readFileSync(path.join(root, 'competitors.json'), 'utf8')).competitors || [];
const profile = JSON.parse(fs.readFileSync(path.join(root, 'config', 'hustlr_profile.json'), 'utf8'));

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'none';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

const parser = new Parser();
const limit = pLimit(6);

const TODAY = new Date().toISOString().slice(0,10);

async function gdeltSearch(query){
  const base = 'https://api.gdeltproject.org/api/v2/doc/doc';
  const params = new URLSearchParams({
    query, mode:'ArtList', maxrecords:'50', format:'json', sort:'DateDesc'
  });
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url);
  if(!res.ok) return [];
  const json = await res.json();
  const arts = (json.articles || []).map(a=>({
    title:a.title, url:a.url, source:a.sourceCommonName, lang:a.language, ts:a.seendate
  }));
  return arts;
}

function isRecent(ts){
  const d = new Date(ts);
  const ageH = (Date.now()-d.getTime())/36e5; // hours
  return ageH <= 36; // last 36h window for resilience
}

const KEYWORDS = [
  'acquisition','merger','funding','investment','raise','partnership','alliance','integration','launch','pilot','trial','rollout','pricing','price','discount','subscription','regulation','policy','fine','tender','RFP','contract','exclusive','layoff','hiring','expansion','Gauteng','South Africa','fraud','escrow','insurance','finance','warranty','mechanic','inspection','DEKRA','F&I'
];

function heuristicImpact(item){
  const t = (item.title||'').toLowerCase();
  const hits = KEYWORDS.filter(k=>t.includes(k.toLowerCase())).length;
  if(/acquisition|merger|exclusive|contract|funding|raise|integration/.test(t)) return 'High';
  if(/launch|pilot|pricing|expansion|partnership/.test(t)) return 'Medium';
  return hits>0 ? 'Low' : 'Low';
}

async function fromRSS(url){
  try{ const feed = await parser.parseURL(url); return feed.items.map(i=>({title:i.title, url:i.link, ts:i.isoDate||i.pubDate})); }catch{ return []; }
}

async function collectForCompetitor(c){
  const aliasQuery = `(${c.aliases.concat([c.name]).map(a=>`"${a}"`).join(' OR ')})`;
  const scope = '(sourcecountry:ZA OR South Africa OR Gauteng)';
  const intent = `(${(c.extraQueries||KEYWORDS).map(k=>`"${k}"`).join(' OR ')})`;
  const query = `${aliasQuery} AND ${scope} AND ${intent}`;

  const [gd, ...rss] = await Promise.all([
    gdeltSearch(query),
    ...(c.rss||[]).map(r=>fromRSS(r))
  ]);

  const items = [...gd, ...rss.flat()].filter(x=>isRecent(x.ts));
  // de-dupe by URL
  const seen = new Set();
  return items.filter(i=>{ if(seen.has(i.url)) return false; seen.add(i.url); return true; })
    .map(i=>({ competitor:c.name, title:i.title, url:i.url, ts:i.ts, impact:heuristicImpact(i) }));
}

async function llmSummarize(entries){
  if(LLM_PROVIDER==='openai' && LLM_API_KEY){
    const prompt = `You are a strategy analyst for Hustlr (SA auto marketplace).\nProfile:${JSON.stringify(profile)}\n\nFrom these items, produce JSON with fields: summary (3-6 sentences, only bottom-line implications), tags (array: Marketing, Innovation, New Business/Deals, Regulatory/Policy, Capital & Ops), impact (High/Medium/Low), and action_plan (3-5 concise, concrete counter-moves with title, owner, eta, effort, impact).\n\nItems:\n${entries.map((e,i)=>`[${i+1}] ${e.title} — ${e.url}`).join('\n')}\n`;
    const res = await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST', headers:{'Authorization':`Bearer ${LLM_API_KEY}`,'Content-Type':'application/json'},
      body: JSON.stringify({
        model: process.env.LLM_MODEL || 'gpt-4o-mini',
        messages: [{role:'system',content:'Be concise and operator-focused.'},{role:'user',content:prompt}],
        temperature: 0.2
      })
    });
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content || '{}';
    try{ return JSON.parse(text); }catch{ return null; }
  }
  // Fallback: rule-based mini-summary
  const summary = entries.slice(0,3).map(e=>e.title).join('. ');
  const action_plan = [
    {title:'Contact potential partner overlap', owner:'Partnerships', eta:'2d', effort:'Low', impact:'Medium'},
    {title:'Spin up targeted comms for Gauteng', owner:'Growth', eta:'3d', effort:'Low', impact:'Medium'}
  ];
  return { summary, tags:['New Business/Deals'], impact:'Medium', action_plan };
}

async function main(){
  if(!fs.existsSync(dailyDir)) fs.mkdirSync(dailyDir, {recursive:true});
  const all = [];
  for(const c of competitors){
    const items = await collectForCompetitor(c);
    if(items.length===0) continue;
    const agg = await llmSummarize(items);
    all.push({
      id: `${c.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${TODAY}`,
      competitor: c.name,
      tags: agg?.tags || [],
      impact: agg?.impact || 'Low',
      summary: agg?.summary || 'No high-signal items today.',
      sources: items.slice(0,6).map(i=>({url:i.url})),
      action_plan: agg?.action_plan || []
    });
  }

  const digest = { date: TODAY, generated_at: new Date().toISOString(), entries: all };
  const dailyPath = path.join(dailyDir, `${TODAY}.json`);
  fs.writeFileSync(dailyPath, JSON.stringify(digest, null, 2));
  fs.writeFileSync(
  path.join(dataDir, 'index.json'),
  JSON.stringify({ latest: `./data/daily/${TODAY}.json` }, null, 2) // ✅ relative
);
  console.log('Digest written:', dailyPath);
}

main().catch(err=>{ console.error(err); process.exit(1); });
