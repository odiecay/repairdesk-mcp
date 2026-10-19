import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('stdio server exposes all tools and blocks unapproved messages without a network call',async()=>{
 const client=new Client({name:'test',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:['server.mjs'],env:{PATH:process.env.PATH,REPAIRDESK_API_KEY:'fake',REPAIRDESK_BASE_URL:'http://127.0.0.1:1',REPAIRDESK_LOG_DIR:mkdtempSync(join(tmpdir(),'rd-log-'))},stderr:'pipe'});
 try{
  await client.connect(transport);
  const {tools}=await client.listTools();
  assert.equal(tools.length,40);
  const email=tools.find(t=>t.name==='repairdesk_ticket_email');
  assert.ok(email.inputSchema.properties.body.required.includes('ticketId'));
  const result=await client.callTool({name:email.name,arguments:{body:{ticketId:1,subject:'Test',body:'Test'}}});
  assert.equal(JSON.parse(result.content[0].text).confirmation_required,true);
  for (const [name,args] of [
    ['repairdesk_tickets_write',{action:'update',ticket_id:'T-123',status:'Repaired',confirmed:true}],
    ['repairdesk_ticket_status_timer',{body:{id:1,ticketInvId:2,status:'In Progress',timerAction:'start'},confirmed:true}],
    ['repairdesk_ticket_update',{body:{summary:{id:1},devices:[{id:2,name:'Repair',device:3,status:'Completed'}]},confirmed:true}]
  ]) {
    const blocked=await client.callTool({name,arguments:args});
    assert.equal(blocked.isError,true);
    assert.match(blocked.content[0].text,/RepairDesk website/);
    assert.doesNotMatch(blocked.content[0].text,/request failed/);
  }

 }finally{await client.close();}
});
