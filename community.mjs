import { getStore } from '@netlify/blobs';
const EPISODES = new Set(['finance','shortage','ai','nursing','pram','ron','martyn']);
const VALUES = [20,25,15,20,20,20,20,20,20];
const respond = (status, obj) => new Response(JSON.stringify(obj), {status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const validId = id => typeof id==='string' && /^[a-f0-9-]{36}$/.test(id);
const aliasOf = value => String(value||'').trim().replace(/[<>\\]/g,'').slice(0,25);
async function topLeaders(store, episode) {
  const records=[]; let cursor;
  do {
    const page=await store.list({prefix:`${episode}/`,...(cursor?{cursor}:{})});
    const pageRecords=await Promise.all(page.blobs.map(async item => {
      try { return await store.get(item.key,{type:'json',consistency:'strong'}); } catch(error){console.error('Leaderboard record read failed', item.key, error);return null;}
    }));
    records.push(...pageRecords.filter(x=>x&&x.episode===episode));
    cursor=page.cursor;
  } while(cursor && records.length < 2000);
  return records.sort((a,b)=> (b.points||0)-(a.points||0) || (a.updated||0)-(b.updated||0)).slice(0,25).map(({id,alias,points})=>({id,alias,points}));
}
export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const episode = request.method === 'GET' ? url.searchParams.get('episode') : null;
    const store = getStore('ha-community-v1');
    if (request.method==='GET') {
      if(!EPISODES.has(episode))return respond(400,{error:'Invalid episode'});
      return respond(200,{leaders:await topLeaders(store,episode)});
    }
    if(request.method!=='POST')return respond(405,{error:'Method not allowed'});
    if(Number(request.headers.get('content-length')||0)>5000)return respond(413,{error:'Request too large'});
    let data;try{data=await request.json()}catch{return respond(400,{error:'Invalid JSON'})}
    if(!EPISODES.has(data.episode)||!validId(data.id))return respond(400,{error:'Invalid episode or visitor ID'});
    if(data.action==='question'){
      const question=String(data.question||'').trim();
      if(question.length<12 || question.length>500)return respond(400,{error:'Please enter a question between 12 and 500 characters'});
      const questions=getStore('ha-editorial-questions-v1');
      await questions.setJSON(`${data.episode}/${crypto.randomUUID()}`,{episode:data.episode,question,alias:aliasOf(data.alias),submittedAt:new Date().toISOString(),status:'pending'});
      return respond(200,{received:true});
    }
    if(!['alias','award'].includes(data.action))return respond(400,{error:'Invalid action'});
    const key=`${data.episode}/${data.id}`;
    const existing=await store.get(key,{type:'json',consistency:'strong'});
    const record=existing||{id:data.id,episode:data.episode,alias:'',activities:[],points:0,updated:0};
    if(data.action==='award'){
      if(!Number.isInteger(data.activity)||data.activity<0||data.activity>=VALUES.length)return respond(400,{error:'Invalid activity'});
      if(!record.activities.includes(data.activity))record.activities.push(data.activity);
    }
    if(typeof data.alias==='string')record.alias=aliasOf(data.alias);
    record.activities=[...new Set(record.activities)].filter(v=>Number.isInteger(v)&&v>=0&&v<VALUES.length);
    record.points=record.activities.reduce((sum,i)=>sum+VALUES[i],0);
    record.updated=Date.now();
    await store.setJSON(key,record);
    // Verify storage read on the same request so a false success is not reported.
    const confirmed=await store.get(key,{type:'json',consistency:'strong'});
    if(!confirmed || confirmed.id!==data.id)throw new Error('Stored leaderboard entry could not be read back');
    return respond(200,{ok:true,points:confirmed.points,alias:confirmed.alias,saved:true});
  } catch(error) {
    console.error('Healthcare Actually community function error:',error);
    return respond(500,{error:'Leaderboard storage error. Check Cloud compute → Functions → community logs.',code:'STORAGE_ERROR'});
  }
}
export const config={path:'/.netlify/functions/community'};
