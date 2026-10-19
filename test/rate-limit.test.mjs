import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createSharedLimiter} from '../lib/rate-limit.mjs';
import {createClient} from '../lib/client.mjs';
const config=()=>({base:'https://example.invalid',key:'private-test-key'});

test('independent processes share pacing without storing credentials',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'rd-shared-rate-'));
 const module=new URL('../lib/rate-limit.mjs',import.meta.url).href;
 const code=`import {createSharedLimiter} from ${JSON.stringify(module)}; const r=createSharedLimiter({stateDir:process.argv[1],getConfig:()=>({base:'https://example.invalid',key:'private-test-key'}),interval:100}); await r.acquire(); console.log(Date.now());`;
 const run=()=>new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',code,dir]);let out='',err='';
  p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',n=>n?reject(Error(err)):resolve(Number(out.trim())));
 });
 const times=(await Promise.all([run(),run(),run()])).sort();
 assert.ok(times[1]-times[0]>=80);assert.ok(times[2]-times[1]>=80);
 const files=readdirSync(dir);assert.equal(files.length,1);assert.ok(!files[0].includes('private-test-key'));assert.ok(!readFileSync(join(dir,files[0]),'utf8').includes('private-test-key'));
});
test('cooldown survives a new limiter instance and long waits fail before requests',async()=>{
 const stateDir=mkdtempSync(join(tmpdir(),'rd-cooldown-'));
 const one=createSharedLimiter({stateDir,getConfig:config,interval:0,maxWait:10});
 await one.defer(60000);
 const two=createSharedLimiter({stateDir,getConfig:config,interval:0,maxWait:10});
 await assert.rejects(two.acquire(),/No API request sent/);
});
test('429 without Retry-After sets a shared cooldown without rapid retry',async()=>{
 let calls=0,cooldown=0;
 const request=createClient({getConfig:config,interval:0,rateLimiter:{acquire:async()=>{},defer:async ms=>cooldown=ms},fetchImpl:async()=>{calls++;return new Response('',{status:429});}});
 await assert.rejects(request('GET','/tickets'),/Retry after at least 60 seconds/);
 assert.equal(calls,1);assert.equal(cooldown,60000);
});
