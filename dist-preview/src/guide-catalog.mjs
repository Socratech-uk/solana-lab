// One catalogue drives page buttons, Assistant offers and reset availability.
// Offers only select a workflow; the user still starts Guide explicitly.
export const PAGE_WORKFLOWS=Object.freeze({
 wallets:'prepare-demo-wallets',service:'demo-service',batch:'demo-batch',proof:'demo-proof',
 checkout:'understand-checkout',treasury:'understand-treasury',
 positions:'plan-position',recovery:'understand-recovery',
 policy:'reset-policy-proposal',network:'prepare-public-rpc',
 tokens:'demo-token-payment',requests:'create-payment-request',activity:'inspect-wallet-activity'
});
const resettable=new Set(['understand-recovery','understand-checkout','understand-treasury','demo-service','demo-batch','demo-proof','plan-position','demo-token-payment','create-payment-request','pay-payment-request','anchor-position-evidence']);
export const canResetWorkflow=id=>resettable.has(id);
export const workflowForPage=route=>PAGE_WORKFLOWS[String(route||'').replace(/^#?\/?/,'').split(/[/?]/)[0]];
const namedWorkflows=[
 [/\b(?:demo wallets?|payer and receiver|wallet setup|set up wallets?)\b/,'prepare-demo-wallets'],
 [/\b(?:pay|payer)\b.*\b(?:request|invoice)\b/,'pay-payment-request'],
 [/\b(?:position|arena)\b.*\bevidence\b/,'anchor-position-evidence'],
 [/\b(?:verify|verification)\b.*\b(?:payment|request|invoice)\b|\b(?:payment|request|invoice)\b.*\b(?:verify|verification)\b/,'verify-payment-request'],
 [/\b(?:payment requests?|requests?|invoices?|solana pay|qr)\b/,'create-payment-request'],
 [/\b(?:wallet activity|address activity|activity|history)\b/,'inspect-wallet-activity'],
 [/\b(?:tokens?|spl)\b/,'demo-token-payment'],
 [/\b(?:assets?|balances?)\b/,'inspect-assets'],
 [/\bstale\b/,'try-stale-intent'],[/\b(?:fees?|excessive)\b/,'try-excessive-fee'],
 [/\b(?:recovery|missing reply|lost (?:reply|response))\b/,'understand-recovery'],
 [/\b(?:service|report)\b/,'demo-service'],[/\b(?:batch|payouts?)\b/,'demo-batch'],
 [/\b(?:proof|document)\b/,'demo-proof'],[/\bcheckout\b/,'understand-checkout'],
 [/\b(?:treasury|quorum|group review)\b/,'understand-treasury'],[/\bpositions?\b/,'plan-position'],
 [/\bpolicy\b/,'reset-policy-proposal'],[/\b(?:network|rpc|connection)\b/,'prepare-public-rpc']
];
export function requestedWorkflow(prompt,route){
 const text=String(prompt||'');
 if(/\b(?:why|fail(?:ed|ing|ure)?|errors?|explain|don[’']?t|do not)\b/i.test(text))return null;
 if(!/\b(?:run|start|show|watch|try|walk|guide)\b/i.test(text))return null;
 const named=namedWorkflows.find(([pattern])=>pattern.test(text.toLowerCase()));
 if(!named&&!/\b(?:demo|walkthrough|through|me)\b/i.test(text))return null;
 return named?.[1]||workflowForPage(route)||'understand-recovery';
}
