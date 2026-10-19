import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient,loadConfig} from '../lib/client.mjs';
const config = () => ({key:'test-secret',base:'https://example.invalid/api/web/v1'});
const ok = data => new Response(JSON.stringify({success:true,data}),{status:200});

test('base normalization, query encoding and JSON payload',async()=>{
 let seen;
 const request=createClient({getConfig:config,interval:0,fetchImpl:async(u,o)=>{seen={u,o};return ok({id:7});}});
 assert.deepEqual(await request('POST','/v1/ticket/sendsms',{body:{content:'hello'}}),{id:7});
 assert.equal(seen.u.pathname,'/api/web/v1/ticket/sendsms');
 assert.equal(seen.u.searchParams.get('api_key'),'test-secret');
 assert.equal(seen.o.body,'{"content":"hello"}');
});
test('bearer auth excludes API key and credentials cannot be overridden by tool query',async()=>{
 let seen;
 const request=createClient({getConfig:()=>({token:'bearer-secret',base:config().base}),interval:0,fetchImpl:async(u,o)=>{seen={u,o};return ok({});}});
 await request('GET','/tickets');
 assert.equal(seen.o.headers.Authorization,'Bearer bearer-secret');assert.equal(seen.u.search,'');
 await assert.rejects(request('GET','/tickets',{params:{api_key:'other'}}),/configuration/);
 assert.equal(loadConfig('/missing',{REPAIRDESK_API_KEY:'key',REPAIRDESK_ACCESS_TOKEN:'token'}).key,undefined);
});
test('writes are never retried on rate limit or network ambiguity',async()=>{
 for(const failure of ['rate','network']){
  let calls=0;const request=createClient({getConfig:config,interval:0,fetchImpl:async()=>{calls++;if(failure==='network')throw Error('secret');return new Response('rate limit',{status:429});}});
  await assert.rejects(request('POST','/invoices',{body:{}}),failure==='network'?/outcome is unknown/:/No automatic retry/);
  assert.equal(calls,1);
 }
});
test('GET retries once and a failed request does not poison queue',async()=>{
 let calls=0;const request=createClient({getConfig:config,interval:0,sleep:async()=>{},fetchImpl:async()=>++calls===1?new Response('',{status:429,headers:{'retry-after':'1'}}):ok({calls})});
 assert.deepEqual(await request('GET','/tickets'),{calls:2});
 assert.deepEqual(await request('GET','/tickets'),{calls:3});
});
test('credential values are redacted in API errors and nested failure is rejected',async()=>{
 const request=createClient({getConfig:config,interval:0,fetchImpl:async()=>new Response('failed api_key=test-secret',{status:400})});
 await assert.rejects(request('GET','/tickets'),e=>!e.message.includes('test-secret')&&e.message.includes('[REDACTED]'));
 const nested=createClient({getConfig:config,interval:0,fetchImpl:async()=>ok({success:false,message:'bad'})});
 await assert.rejects(nested('POST','/tickets',{body:{}}),/rejected/);
});
test('multipart does not set JSON content type or serialize file bytes',async()=>{
 const form=new FormData();form.append('file',new Blob(['pdf']),'test.pdf');
 const request=createClient({getConfig:config,interval:0,fetchImpl:async(u,o)=>{assert.equal(o.body,form);assert.equal(o.headers['Content-Type'],undefined);return ok({});}});
 await request('POST','/v1/ticket/uploadattachments',{form});
});

test('optional web status policy blocks every update route before network, including mixed timer requests',async()=>{
 let calls=0;
 const request=createClient({getConfig:config,interval:0,statusMode:'web',fetchImpl:async()=>{calls++;return ok({});}});
 for(const [method,path,body] of [
  ['POST','/ticket/updateticketstatus',{id:1,ticketInvId:2,status:'Repaired'}],
  ['POST','/v1/ticket/updateticketstatus',{id:1,ticketInvId:2,status:'In Progress',timerAction:'start'}],
  ['PUT','/ticket/updateticket',{summary:{id:1},devices:[{id:2,status:'Pending'}]}],
  ['PUT','/tickets/1',{devices:[{status:'Completed'}]}],
  ['PUT','/ticket/updateticket',{summary:{id:1,status:''}}]
 ]) await assert.rejects(request(method,path,{body}),/RepairDesk website/);
 assert.equal(calls,0);
 await request('POST','/ticket/updateticketstatus',{body:{id:1,ticketInvId:2,timerAction:'start'}});
 await request('PUT','/ticket/updateticket',{body:{summary:{id:1},devices:[{id:2,additional_notes:'Test'}]}});
 await request('GET','/tickets',{params:{status:'Pending'}});
 assert.equal(calls,3);
});

test('status API is enabled by default and invalid modes fail closed',async()=>{
 assert.throws(()=>createClient({getConfig:config,statusMode:'typo'}),/STATUS_MODE/);
 let calls=0;
 const request=createClient({getConfig:config,interval:0,fetchImpl:async()=>{calls++;return ok({});}});
 await request('POST','/ticket/updateticketstatus',{body:{id:1,ticketInvId:2,status:'In Progress'}});
 assert.equal(calls,1);
});
