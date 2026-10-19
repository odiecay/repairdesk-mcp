import test from 'node:test';
import assert from 'node:assert/strict';
import {executeOperation,operations} from '../lib/operations.mjs';
const op=operations.find(o=>o.name==='repairdesk_inventory_update');
const fixture=()=>({id:'15',name:'Existing item',category_name:'Accessories',manufacturer_id:'7',device_id:'8',in_stock:'4',cost_price:'7.50',prices:{retail_price:'19.95',cost_price:'7.50'},price:'18.14',original_price:'19.95',tax_class:{id:'9'},tax_inclusive:'1',sku:'KEEP-SKU',upc_code:'123',supplier:'',is_serialize:0,reorder_level:'2',stock_warning:'1',minimum_price:'0.00',description:'Old description',physical_location:'Bin 1',additional_details:{condition:'New'},warranty:'',warranty_timeframe:'0',customer_group_prices:[],serials:[],skus:[]});
function harness(before,after,{failReadback=false}={}){
 const calls=[];
 return {calls,request:async(method,path,options)=>{
  calls.push({method,path,...options});
  if(method==='PUT')return {id:15};
  if(calls.length>1&&failReadback)throw Error('read timeout');
  return {inventoryListData:[structuredClone(calls.length===1?before:after)]};
 }};
}
const run=(changes,h)=>executeOperation(op,{path:{id:'15'},body:{id:15,...changes},confirmed:true},h);

test('partial inventory edit preserves stored gross price, cost, stock, SKU, tax and device fields',async()=>{
 const before=fixture(),after={...fixture(),description:'Updated',physical_location:'Bin 2'};
 const h=harness(before,after);const result=await run({description:'Updated',physical_location:'Bin 2'},h);
 const sent=h.calls[1].body;
 assert.deepEqual(h.calls.map(x=>x.method),['GET','PUT','GET']);
 assert.equal(h.calls[0].params.keyword,'15');assert.equal(sent.name,'Existing item');
 assert.equal(sent.price,19.95);assert.equal(sent.cost_price,7.5);assert.equal(sent.in_stock,4);
 assert.equal(sent.sku,'KEEP-SKU');assert.equal(sent.tax_class,9);assert.equal(sent.tax_inclusive,1);
 assert.equal(sent.manufacturer,7);assert.equal(sent.device,'8');assert.equal(result.verified,true);
});
test('inventory cents and explicit zeros/empty strings survive preservation',async()=>{
 for(const value of [12.35,0]){
  const after={...fixture(),prices:{retail_price:String(value),cost_price:'0'},cost_price:'0',sku:'',description:''};
  const h=harness(fixture(),after);const result=await run({price:value,cost_price:0,sku:'',description:''},h);
  assert.equal(h.calls[1].body.price,value);assert.equal(h.calls[1].body.sku,'');assert.equal(result.verified,true);
 }
});
test('inventory rejects fractional quantity without contacting API',async()=>{
 const h=harness(fixture(),fixture());await assert.rejects(run({in_stock:0.5},h));assert.equal(h.calls.length,0);
});
test('ignored inventory field and unrequested loss are reported after one write',async()=>{
 const before={...fixture(),warranty:'Days',warranty_timeframe:'30'};
 const h=harness(before,fixture());const result=await run({minimum_price:'10.00'},h);
 assert.equal(result.verified,false);assert.deepEqual(result.mismatches.map(x=>x.field),['minimum_price','warranty','warranty_timeframe']);
 assert.equal(h.calls.filter(x=>x.method==='PUT').length,1);
});
test('inventory fields absent from GET are marked unverified, not proven by write echo',async()=>{
 const h=harness(fixture(),fixture());const result=await run({notes:'<p>New notes</p>'},h);
 assert.equal(result.verified,false);assert.deepEqual(result.unverified_fields,['notes']);assert.deepEqual(result.mismatches,[]);
});
test('an ignored empty long description is reported from the write response without claiming independent verification',async()=>{
 const h=harness(fixture(),fixture()),request=h.request;
 h.request=async(...args)=>{const result=await request(...args);return args[0]==='PUT'?{...result,notes:'<p>Existing notes</p>'}:result;};
 const result=await run({notes:''},h);
 assert.equal(result.verified,false);assert.deepEqual(result.unverified_fields,['notes']);
 assert.deepEqual(result.mismatches,[{field:'notes',requested:'',actual:'<p>Existing notes</p>',source:'write_response'}]);
});
test('inventory missing/wrong item and missing stored price stop before writing',async()=>{
 for(const before of [{...fixture(),id:'16'},{...fixture(),prices:undefined,original_price:undefined}]){
  const h=harness(before,fixture());await assert.rejects(run({description:'Update'},h));assert.equal(h.calls.length,1);
 }
});
test('inventory readback failure is distinguished from write failure and never retried',async()=>{
 const h=harness(fixture(),fixture(),{failReadback:true});const result=await run({description:'Update'},h);
 assert.equal(result.write_performed,true);assert.equal(result.verified,false);assert.equal(h.calls.length,3);
});
