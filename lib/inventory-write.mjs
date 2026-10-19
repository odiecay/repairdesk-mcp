const same = (a,b) => a == null && b == null || String(a ?? '') === String(b ?? '');
const numeric = new Set(['manufacturer','in_stock','cost_price','price','tax_class','tax_inclusive','supplier','valuation_method','is_serialize','reorder_level','stock_warning','minimum_price']);

function readableFields(item) {
  const fields = {
    name:item.name, item_type:item.category_name, manufacturer:item.manufacturer_id,
    device:item.device_id, in_stock:item.in_stock,
    cost_price:item.prices?.cost_price ?? item.cost_price,
    // price is tax-exclusive in list responses; original_price/retail_price is
    // the stored amount to send together with its original tax_inclusive flag.
    price:item.prices?.retail_price ?? item.original_price,
    tax_class:item.tax_class?.id, tax_inclusive:item.tax_inclusive,
    sku:item.sku, supplier:item.supplier, upc_code:item.upc_code,
    valuation_method:item.valuation_method, is_serialize:item.is_serialize,
    reorder_level:item.reorder_level, stock_warning:item.stock_warning,
    minimum_price:item.minimum_price, description:item.description,
    condition:item.additional_details?.condition ?? item.condition,
    physical_location:item.physical_location ?? item.additional_details?.physical_location,
  };
  if (Object.hasOwn(item,'notes')) fields.notes=item.notes;
  return fields;
}

async function lookup(request,id) {
  const data=await request('GET','/inventory',{params:{keyword:String(id),pagesize:1000}});
  const matches=(data.inventoryListData || []).filter(i=>String(i.id)===String(id));
  if(matches.length!==1)throw new Error('Inventory lookup did not return exactly the requested item. Inspect before updating.');
  return matches[0];
}

export async function updateInventory(id,changes,{request}) {
  if(String(changes.id)!==String(id))throw new Error('Inventory body ID must match the path ID. No update sent.');
  const before=await lookup(request,id);
  const existing=readableFields(before);
  for(const key of ['name','item_type','in_stock','cost_price','price','tax_inclusive']) {
    if(existing[key]===undefined || existing[key]===null || existing[key]==='')throw new Error(`Inventory readback is missing ${key}; cannot preserve the existing item. No update sent.`);
  }
  const body={};
  for(const [key,value] of Object.entries(existing)) {
    if(value===undefined)continue;
    if(numeric.has(key)) {
      // Missing optional identifiers have no existing value to preserve.
      if((value===''||value===null)&&['manufacturer','tax_class','supplier','valuation_method'].includes(key))continue;
      if(value===null||value===''||!Number.isFinite(Number(value)))throw new Error(`Invalid existing inventory ${key}; no update sent.`);
      body[key]=['reorder_level','stock_warning','minimum_price'].includes(key)?String(value):Number(value);
    } else body[key]=value == null ? '' : String(value);
  }
  Object.assign(body,changes);
  const apiResult=await request('PUT',`/inventory/${encodeURIComponent(String(id))}`,{body});
  let after;
  try {after=await lookup(request,id);}
  catch {return {write_performed:true,verified:false,item_id:id,api_result:apiResult,message:'Update returned, but independent readback failed. Inspect the item before any retry.'};}
  const actual=readableFields(after);
  const mismatches=[];
  const unverified=[];
  for(const [key,wanted] of Object.entries(body)) {
    if(key==='id')continue;
    if(actual[key]===undefined){
      unverified.push(key);
      if(key==='notes'&&Object.hasOwn(apiResult,'notes')&&!same(apiResult.notes,wanted))mismatches.push({field:key,requested:wanted,actual:apiResult.notes,source:'write_response'});
      continue;
    }
    const matches=numeric.has(key)?Number(actual[key])===Number(wanted):same(actual[key],wanted);
    if(!matches)mismatches.push({field:key,requested:wanted,actual:actual[key]});
  }
  // These fields are visible in GET but not in the documented Item write schema.
  // Detect any unexpected loss without pretending they were proven preservable.
  for(const key of ['warranty','warranty_timeframe','customer_group_prices','serials','skus']) {
    if(Object.hasOwn(before,key)&&!Object.hasOwn(changes,key)&&JSON.stringify(before[key])!==JSON.stringify(after[key]))mismatches.push({field:key,reason:'Unrequested change observed'});
  }
  return {write_performed:true,verified:mismatches.length===0&&unverified.length===0,item_id:id,
    api_result:apiResult,readback:after,mismatches,unverified_fields:unverified,
    message:mismatches.length?'The update returned, but some fields differ from the intended values. Do not retry automatically; inspect the listed differences.':unverified.length?'Readable fields match. Some submitted fields are not exposed by GET and still require UI verification.':'Updated fields and preserved readable fields verified by independent readback.'};
}
