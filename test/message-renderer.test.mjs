import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTicketMessage} from '../lib/message-renderer.mjs';
import {operations,executeOperation} from '../lib/operations.mjs';
const fixture={summary:{id:1,order_id:'T-123',customer:{first_name:'Alex',last_name:'Smith',fullName:'Alex Smith',email:'test@example.invalid'}},devices:[{id:2,manufacturer_name:'Custom PC',device_name:'Tower',PostPreCategoryName:'Computers',status:{name:'In Progress'}}]};
const sms=operations.find(o=>o.name==='repairdesk_ticket_sms');
const args={body:{ticketId:1,mobile:'+61000000000',content:'Hi {customer_first_name}, {manufacturer_name} {Device_Name} / {repair_category} / {Ticket_Id} / {Status}'},confirmed:true};
test('actual ticket fields populate all requested message fields, including both device token spellings',()=>{
 assert.equal(renderTicketMessage(args.body.content,fixture),'Hi Alex, Custom PC Tower / Computers / T-123 / In Progress');
 assert.equal(renderTicketMessage('{Device Name}: {customer name}',fixture),'Tower: Alex Smith');
});
test('unknown, missing, nested and ambiguous values never become outgoing placeholders',()=>{
 assert.throws(()=>renderTicketMessage('{unknown}',fixture),/Unknown/);
 assert.throws(()=>renderTicketMessage('{manufacturer_name}',{...fixture,devices:[{id:2}]}),/no value/);
 assert.throws(()=>renderTicketMessage('{Device_Name}',{...fixture,devices:[...fixture.devices,{id:3,device_name:'Phone'}]}),/ticket_line_id/);
 assert.throws(()=>renderTicketMessage('{customer_first_name}',fixture,{lineId:99}),/does not belong/);
 assert.throws(()=>renderTicketMessage('{customer_first_name}',{...fixture,summary:{customer:{first_name:'{bad}'}}}),/still contains/);
});
test('email substitution escapes record values while preserving template HTML',()=>{
 const t=structuredClone(fixture);t.summary.customer.first_name='<Alex & Jo>';
 assert.equal(renderTicketMessage('<p>Hi {customer_first_name}</p>',t,{html:true}),'<p>Hi &lt;Alex &amp; Jo&gt;</p>');
});
test('preview only reads and sending sends resolved text through the documented SMS endpoint',async()=>{
 let writes=0;
 const deps={request:async(method,path,options)=>{
  if(method==='GET'){assert.equal(path,'/tickets/1');return fixture;}
  writes++;assert.equal(path,'/v1/ticket/sendsms');assert.equal(options.body.content,'Hi Alex, Custom PC Tower / Computers / T-123 / In Progress');return {success:true};
 }};
 const preview=await executeOperation(sms,{...args,confirmed:false,preview:true},deps);
 assert.equal(preview.sent,false);assert.equal(writes,0);
 const result=await executeOperation(sms,args,deps);assert.equal(writes,1);assert.ok(result.rendered.content.includes('Alex'));
});
test('template failures or unapproved sends never perform a send',async()=>{
 let writes=0;const deps={request:async method=>{if(method==='GET')return fixture;writes++;}};
 await assert.rejects(executeOperation(sms,{...args,body:{...args.body,content:'{unknown}'}},deps),/Unknown/);
 await assert.rejects(executeOperation(sms,{...args,ticket_line_id:99},deps),/does not belong/);
 const r=await executeOperation(sms,{...args,confirmed:false},deps);assert.equal(r.confirmation_required,true);assert.equal(writes,0);
});
