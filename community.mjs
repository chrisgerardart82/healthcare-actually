import { getStore } from '@netlify/blobs';
const EPISODES=new Set(['finance','shortage','ai','nursing','pram','ron','martyn']);
const VALUES=[20,25,15,20,20,20,20,20,20];
const originHeaders={'Content-Type':'application/json','Cache-Control':'no-store'};
const respond=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:originHeaders});
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const safeAlias=v=>String(v||'').trim().replace(/[<>\\]/g,'').slice(0,25);
async function leaders(store,episode){const keys=await store.list({prefix:episode+'/'});const vals=await Promise.all(keys.blobs.slice(0,1000).map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return vals.filter(Boolean).sort((a,b)=>b.points-a.points||a.updated-b.updated).slice(0,25).map(v=>({id:v.id,alias:v.alias,points:v.points}));}
export default async function handler(request){try{
const u=new URL(request.url);
const store=getStore('ha-community-v1');
if(request.method==='GET'){
 const ep=u.searchParams.get('episode');if(!EPISODES.has(ep))return respond(400,{error:'Invalid episode'});
 return respond(200,{leaders:await leaders(store,ep)});
}
if(request.method!=='POST')return respond(405,{error:'Method not allowed'});
if(Number(request.headers.get('content-length')||0)>5000)return respond(413,{error:'Request too large'});
let data;try{data=await request.json()}catch{return respond(400,{error:'Invalid request'})}
const {episode,id,action}=data;
if(!EPISODES.has(episode)||!validId(id))return respond(400,{error:'Invalid episode or identifier'});
if(action==='question'){
 const question=String(data.question||'').trim();if(question.length<12||question.length>500)return respond(400,{error:'Question must be 12–500 characters'});
 const questions=getStore('ha-editorial-questions-v1');const key=episode+'/'+crypto.randomUUID();
 await questions.setJSON(key,{episode,question,alias:safeAlias(data.alias),submittedAt:new Date().toISOString(),status:'pending'});
 return respond(200,{received:true});
}
if(!['award','alias'].includes(action))return respond(400,{error:'Invalid action'});
const key=episode+'/'+id;let record=await store.get(key,{type:'json'})||{id,episode,alias:'',activities:[],points:0,updated:Date.now()};
if(action==='award'){
 const i=data.activity;if(!Number.isInteger(i)||i<0||i>=VALUES.length)return respond(400,{error:'Invalid activity'});
 if(!record.activities.includes(i))record.activities.push(i);
}
if(typeof data.alias==='string')record.alias=safeAlias(data.alias);
record.activities=[...new Set(record.activities)].filter(i=>Number.isInteger(i)&&i>=0&&i<VALUES.length);
record.points=record.activities.reduce((sum,i)=>sum+VALUES[i],0);
record.updated=Date.now();await store.setJSON(key,record);
return respond(200,{ok:true,points:record.points});
}catch(err){return respond(500,{error:'Server temporarily unavailable'})}}
export const config={path:'/.netlify/functions/community'};
