export {MARKET_COMPONENT} from './market-metadata.mjs';
const locked=()=>{throw Object.assign(new Error('Live pricing requires the installed app.'),{code:'LAB_PREVIEW_ONLY'});};
export const connectMarket=locked;
export const mountLabMarket=locked;
export const watchMarketRuntime=()=>()=>{};
