export function marketResponse(price=150,blockId=123456){
  return Promise.resolve(new Response(JSON.stringify({So11111111111111111111111111111111111111112:{usdPrice:price,blockId,priceChange24h:2.5}}),{status:200,headers:{'content-type':'application/json'}}));
}
