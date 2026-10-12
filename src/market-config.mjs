// Colosseum demo configuration. Generic Market Pulse packages contain no key.
export const MARKET_CONFIG={
  protocol:'capp.market-config.v1',providerMode:'jupiter',
  apiKey:'jup_21c8fa41b16f2a31cc55f2e4fa7f51d0a9ae9010f46a3986a7c475a63bc7b988',
  symbols:[{id:'So11111111111111111111111111111111111111112',label:'SOL / USD'}],
  candleMs:15000,pollMs:15000,rateMode:'conservative',budgetPerMinute:30,
  chartType:'candles',showVolume:true,remember:true,
};
