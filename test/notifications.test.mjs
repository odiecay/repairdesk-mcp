import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectNotifications} from '../lib/notification-result.mjs';
import {updateTicket} from '../lib/ticket-write.mjs';
import {operations,executeOperation} from '../lib/operations.mjs';
const ticket=(status,messages=[])=>({devices:[{id:2,status:{name:status}}],communication_history:messages});
test('notification results distinguish new malformed history, older defects, absence and unavailable history',()=>{
 const old={id:10,via:'SMS',message:'Hi {customer_first_name}'};
 const before=ticket('Pending',[old]);
 assert.equal(inspectNotifications(before,ticket('Repaired',[old,{id:11,via:'SMS',message:'Hi {Device_Name}'}])).state,'malformed_template');
 const clean=inspectNotifications(before,ticket('Repaired',[old,{id:11,via:'SMS',message:'Hi Alex, your laptop is ready.'}]));
 assert.equal(clean.state,'recorded');assert.equal(clean.delivery_verified,false);
 assert.equal(inspectNotifications(before,ticket('Repaired',[old])).state,'none_observed');
 assert.equal(inspectNotifications({},{}).state,'unverified');
});
test('legacy status update verifies save and reports malformed notification without a second write',async()=>{
 let reads=0,writes=0;
 const result=await updateTicket({action:'update',ticket_id:'1',status:'Repaired',confirmed:true},{
  get:async()=>++reads===1?ticket('Pending'):ticket('Repaired',[{id:11,message:'Hi {customer_first_name}'}]),
  post:async()=>{writes++;return {};}
 });
 assert.equal(result.verified,true);assert.equal(result.notifications.state,'malformed_template');assert.equal(writes,1);
});
test('already applied legacy status does not send another notification',async()=>{
 const result=await updateTicket({action:'update',ticket_id:'1',status:'Repaired',confirmed:true},{get:async()=>ticket('Repaired'),post:async()=>assert.fail('duplicate write')});
 assert.equal(result.changed,false);assert.equal(result.notifications.state,'not_triggered');
});
test('dedicated and general status tools read back and report malformed history',async()=>{
 for(const [name,body] of [
  ['repairdesk_ticket_status_timer',{id:1,ticketInvId:2,status:'Repaired'}],
  ['repairdesk_ticket_update',{summary:{id:1},devices:[{id:2,name:'Repair',device:3,status:'Repaired'}]}]
 ]){
  let reads=0,writes=0;
  const r=await executeOperation(operations.find(o=>o.name===name),{body,confirmed:true},{request:async method=>{
   if(method==='GET')return ++reads===1?ticket('Pending'):ticket('Repaired',[{id:11,message:'Hi {manufacturer_name}'}]);
   writes++;return {};
  }});
  assert.equal(r.verified,true);assert.equal(r.notifications.state,'malformed_template');assert.equal(writes,1);
 }
});
test('same-status timer request performs only the timer action',async()=>{
 const op=operations.find(o=>o.name==='repairdesk_ticket_status_timer');
 let writes=0;
 const deps={request:async(method,path,options)=>{
  if(method==='GET')return ticket('In Progress');
  writes++;assert.equal(options.body.status,undefined);assert.equal(options.body.timerAction,'start');return {};
 }};
 const noop=await executeOperation(op,{body:{id:1,ticketInvId:2,status:'In Progress'},confirmed:true},deps);
 assert.equal(noop.changed,false);assert.equal(writes,0);
 await executeOperation(op,{body:{id:1,ticketInvId:2,status:'In Progress',timerAction:'start'},confirmed:true},deps);
 assert.equal(writes,1);
});
test('wrong line is rejected before mutation, and failed readback is not success',async()=>{
 const op=operations.find(o=>o.name==='repairdesk_ticket_status_timer');
 const args={body:{id:1,ticketInvId:99,status:'Repaired'},confirmed:true};
 let writes=0;
 const deps={request:async(method)=>{if(method==='GET')return ticket('Pending');writes++;return {};}};
 await assert.rejects(executeOperation(op,args,deps),/does not belong/);assert.equal(writes,0);
 await assert.rejects(executeOperation(op,{...args,body:{...args.body,ticketInvId:2}},deps),/readback did not match/);assert.equal(writes,1);
});
