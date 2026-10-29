function source(id,name,state,baseUrl,merchantId,address,city,zip){
  return Object.freeze({id,name,state,stateCode:state,platform:'cityhive',baseUrl,
    hostname:new URL(baseUrl).hostname,merchantId,address,city,zip,
    storeId:`${id}:${merchantId}`,sourceLabel:`${name} first-party pickup inventory`,
    categoryUrl:`${baseUrl}/shop/?subtype=Bourbon&merchant-id=${merchantId}`});
}

// One pure reviewed-premise registry for collection and customer validation.
// Registration is research only; this file grants no production activation.
export const CENTRAL_CITYHIVE_EXPANSION_SOURCES=Object.freeze([
  source('liquorguys-wauwatosa','Liquorguys','WI','https://liquorguys.com','634464e2ec82c44b45abf3ef',
    '11728 W North Ave, Wauwatosa, WI 53226, USA','Wauwatosa','53226'),
  source('yucatan-liquor-okc','Yucatan Liquor','OK','https://yucatanliquor.com','67fe7b7c8a5eea0bf6837355',
    '9109 S May Ave, Oklahoma City, OK 73159, USA','Oklahoma City','73159'),
  source('byrons-liquor-okc',"Byron's Liquor Warehouse",'OK','https://byronsliquor.com','6060f5bded7ffb6a9c4c64b8',
    '2322 N Broadway Ave, Oklahoma City, OK 73103, USA','Oklahoma City','73103'),
]);
