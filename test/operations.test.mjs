import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {operations,executeOperation,operationShape} from '../lib/operations.mjs';
import {updateTicket} from '../lib/ticket-write.mjs';
const op=name=>operations.find(o=>o.name===`repairdesk_${name}`);

test('all 33 new operations have usable input shapes and unique names',()=>{
 assert.equal(operations.length,33);assert.equal(new Set(operations.map(o=>o.name)).size,33);
 for(const o of operations)assert.ok(operationShape(o));
});
test('message/payment writes require authorization and validate required fields',async()=>{
 let calls=0;const deps={request:async()=>{calls++;}};
 const input={body:{ticketId:1,subject:'Test',body:'Hello'}};
 const result=await executeOperation(op('ticket_email'),input,deps);
 assert.equal(result.confirmation_required,true);assert.equal(calls,0);
 await assert.rejects(executeOperation(op('ticket_email'),{body:{ticketId:1},confirmed:true},deps));
 await assert.rejects(executeOperation(op('invoice_payment'),{path:{'Invoice-Id':'1'},body:{amount:-1,method:'Cash'},confirmed:true},deps),/positive/);
 assert.equal(calls,0);
});
test('repair timers validate actions and send exact line ID',async()=>{
 let seen;const deps={request:async(...args)=>{seen=args;return {timer_duration:60};}};
 await assert.rejects(executeOperation(op('ticket_status_timer'),{body:{id:1,ticketInvId:2,timerAction:'custom'},confirmed:true},deps),/greater than zero/);
 await assert.rejects(executeOperation(op('ticket_status_timer'),{body:{id:1,ticketInvId:2},confirmed:true},deps),/Provide status/);
 await executeOperation(op('ticket_status_timer'),{body:{id:1,ticketInvId:2,timerAction:'custom',minutes:1},confirmed:true},deps);
 assert.equal(seen[1],'/ticket/updateticketstatus');assert.equal(seen[2].body.ticketInvId,2);
});
test('uploads enforce roots/extensions, resolve symlinks and send bytes as multipart',async()=>{
 const root=mkdtempSync(join(tmpdir(),'rd-upload-'));const allowed=join(root,'allowed');mkdirSync(allowed);
 const pdf=join(allowed,'quote.pdf');writeFileSync(pdf,'%PDF-test');
 const outside=join(root,'outside.pdf');writeFileSync(outside,'private');symlinkSync(outside,join(allowed,'escape.pdf'));
 const html=join(allowed,'quote.html');writeFileSync(html,'<html>');
 let seen;const deps={uploadRoots:[allowed],request:async(...args)=>{seen=args;return {count:1,attachments:[{id:10,ticket_id:1,ticket_inv:2,filename:'quote.pdf'}]};}};
 const args={body:{ticket_id:1,ticket_inv_id:2},file_paths:[pdf],confirmed:true};
 await executeOperation(op('attachments'),args,deps);
 assert.equal(seen[2].form.get('ticket_id'),'1');assert.equal(await seen[2].form.get('file').text(),'%PDF-test');
 for (const path of [outside,join(allowed,'escape.pdf'),html]) await assert.rejects(executeOperation(op('attachments'),{...args,file_paths:[path]},deps));
 await assert.rejects(executeOperation(op('attachments'),args,{...deps,uploadRoots:[]}),/UPLOAD_ROOTS/);
});
test('read report preserves filters and does not require confirmed flag',async()=>{
 let seen;await executeOperation(op('transaction_report'),{query:{from:1790812800,to:1792368000}},{request:async(...args)=>{seen=args;return [];}});
 assert.equal(seen[0],'GET');assert.equal(seen[2].params.from,1790812800);
});
test('ticket update uses documented endpoint and readback, leaves other lines alone',async()=>{
 let puts=[],gets=0;
 const selected={id:'2',name:'Diagnostics',device:{id:3},price:'90',gst:'9',additional_notes:''};
 const deps={get:async()=>({devices:[{...selected,additional_notes:gets++?'Test note':''},{id:'8'}]}),put:async(...a)=>puts.push(a),post:async()=>{throw Error('wrong route');}};
 await assert.rejects(updateTicket({action:'update',ticket_id:'1',additional_notes:'Test note',confirmed:true},deps),/ticket_line_id/);
 gets=0;
 const result=await updateTicket({action:'update',ticket_id:'1',ticket_line_id:'2',additional_notes:'Test note',confirmed:true},deps);
 assert.equal(result.verified,true);assert.equal(puts[0][0],'/ticket/updateticket');assert.equal(puts[0][1].devices.length,1);assert.equal(puts[0][1].devices[0].price,'90');
});
test('ticket readback mismatch is reported instead of claiming success',async()=>{
 const deps={get:async()=>({devices:[{id:2,name:'Diagnostics',device:{id:3},assigned_to:{id:0}}]}),put:async()=>({success:true})};
 await assert.rejects(updateTicket({action:'assign',ticket_id:'1',technician_id:'4',confirmed:true},deps),/did not match/);
});

test('every new non-file operation builds its documented request with synthetic fields',async()=>{
 const {spec}=await import('../lib/operations.mjs');
 function sample(s={}){
  if(s.$ref)return sample(spec.components[s.$ref.split('/').at(-1)]);
  if(s.enum)return s.enum[0];
  if(s.allOf)return Object.assign({},...s.allOf.map(sample));
  if(s.oneOf||s.anyOf)return sample((s.oneOf||s.anyOf)[0]);
  if(s.type==='object'||s.properties)return Object.fromEntries((s.required||[]).map(k=>[k,sample(s.properties[k])]));
  if(s.type==='array')return Array.from({length:s.minItems||1},()=>sample(s.items));
  if(s.type==='integer'||s.type==='number')return Math.max(s.minimum||1,1);
  if(s.type==='boolean')return true;
  return 'test';
 }
 for(const o of operations){
  if(o.requestBody?.content?.['multipart/form-data'])continue;
  const args={};
  if(o.method!=='GET'&&o.path!=='/appointment/timeslots')args.confirmed=true;
  for(const p of o.parameters||[])if(p.required){args[p.in]??={};args[p.in][p.name]=sample(p.schema);}
  if(o.requestBody)args.body=sample(o.requestBody.content['application/json']?.schema);
  if(o.path==='/ticket/updateticketstatus')args.body.timerAction='start';
  if(o.path==='/invoices/{Invoice-Id}/payments')args.body={amount:1,method:'Cash'};
  let called=0;
  await executeOperation(o,args,{request:async(method,path)=>{called++;assert.equal(method,o.method);assert.ok(!path.includes('{'));return {};}});
  assert.equal(called,1,o.name);
 }
});

test('an upload response for the wrong ticket is not reported as success',async()=>{
 const root=mkdtempSync(join(tmpdir(),'rd-identity-'));const path=join(root,'test.txt');writeFileSync(path,'test');
 await assert.rejects(executeOperation(op('attachments'),{body:{ticket_id:1},file_paths:[path],confirmed:true},{uploadRoots:[root],request:async()=>({attachments:[{id:3,ticket_id:9}]})}),/intended ticket/);
});
