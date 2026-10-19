import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import lockfile from 'proper-lockfile';

// Share pacing between MCP processes using the same account credentials/cache.
// The cache contains timestamps only; credentials are never written to it.
export function createSharedLimiter({stateDir,getConfig,interval=1250,maxWait=30000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}) {
  if(!Number.isFinite(interval)||interval<0)throw new Error('Request interval must be a finite non-negative number.');
  mkdirSync(stateDir,{recursive:true,mode:0o700});
  async function transaction(fn) {
    const c=getConfig();
    const key=createHash('sha256').update(`${c.base}\0${c.key || c.token}`).digest('hex');
    const path=join(stateDir,`rate-${key}.json`);
    const release=await lockfile.lock(path,{realpath:false,stale:10000,update:2000,retries:{retries:40,factor:1,minTimeout:25,maxTimeout:25}});
    try {
      let state={nextAt:0,cooldownUntil:0};
      try{state=JSON.parse(readFileSync(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Shared request-pacing state is unreadable; no API request sent.');}
      if(!['nextAt','cooldownUntil'].every(k=>Number.isFinite(state[k])&&state[k]>=0))throw new Error('Invalid shared request-pacing state; no API request sent.');
      const result=fn(state);
      writeFileSync(path,JSON.stringify(state),{mode:0o600});
      return result;
    } finally {await release();}
  }
  return {
    async acquire() {
      const deadline=now()+maxWait;
      for(;;){
        const wait=await transaction(state=>{
          const delay=Math.max(0,state.nextAt-now(),state.cooldownUntil-now());
          if(!delay)state.nextAt=now()+interval;
          return delay;
        });
        if(!wait)return;
        if(now()+wait>deadline)throw new Error(`RepairDesk shared request cooldown: retry in at least ${Math.ceil(wait/1000)} seconds. No API request sent.`);
        await sleep(wait);
      }
    },
    async defer(milliseconds){await transaction(state=>{state.cooldownUntil=Math.max(state.cooldownUntil,now()+milliseconds);});}
  };
}
