import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS} from '../iboss-accounts.mjs';
const prompts=[['bank-balance',"Today's bank closing"],['day-book',"Today's vouchers"],['payment-advice',"Today's payment advice"],['payable-receivable','Payable and receivable bills'],['outstanding-180','Bills outstanding more than 180 days'],['imprest-balance','Current imprest balance'],['tds-payable','TDS deductions'],['fixed-deposit','Fixed deposit register'],['emi-schedule','EMI schedule']];
export function chatOptions(allowed){
 const keys=[...(allowed.includes('Masters')?ACCOUNT_SECTIONS.masters:[]),...(allowed.includes('Transactions')?ACCOUNT_SECTIONS.transactions:[])];
 const options=keys.map(view=>({view,title:ACCOUNT_VIEWS[view].title,prompt:prompts.find(([key])=>key===view)?.[1]||ACCOUNT_VIEWS[view].title}));
 if(allowed.includes('Transactions'))options.unshift(
 {view:'chat-payment-summary',prompt:"Today's payment advice count and total amount",keywords:'payment advise created total amount sum how many'},
 {view:'chat-payment-summary',prompt:'Payment advice count and amount for selected dates',keywords:'payment advice created total'},
 {view:'chat-payment-done',prompt:'Payments marked done in ERP',keywords:'payment release released paid completed'},
 {view:'chat-payment-pending',prompt:'Payments not done in ERP',keywords:'payment pending unpaid not done outstanding'},
 {view:'chat-emi-summary',prompt:'How many EMI are paid and pending?',keywords:'emi instalment installment paid unpaid pending count preclosed loan'},
 {view:'chat-account-balances',prompt:'All account ledger closing balances',keywords:'all ledger closing balance accounts'},
 {view:'chat-account-closing',prompt:'Closing balance for any account ledger',keywords:'account ledger bank customer employee balance',needsVendor:true},
 {view:'chat-vendor-closing',prompt:'Closing balance for a vendor',keywords:'vendor supplier contractor transporter closing balance ledger',needsVendor:true}
 );
 return options.map(option=>({...option,title:option.title||ACCOUNT_VIEWS[option.view].title}));
}
const normalize=text=>String(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchChatQuestion(question,options){
 const text=normalize(question);
 return options.find(option=>[option.prompt,...(!option.needsVendor?[option.title]:[]),...(option.view==='bank-balance'?['todays bank closing','today bank closing','bank closing','bank balance']:[])].some(alias=>normalize(alias)===text));
}
function near(a,b){
 if(a.length<4||Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(i<a.length||j<b.length?1:0)<=1;
}
export function filterChatOptions(question,options){
 const words=normalize(question).split(' ').filter(word=>word&&!['how','many','is','are','the','for','of','a','an','and','me','show','have'].includes(word));
 if(!words.length)return options;
 return options.map(option=>{const terms=normalize(`${option.prompt} ${option.title} ${option.keywords||''}`).split(' ');return {option,score:words.reduce((sum,word)=>sum+(terms.includes(word)?4:terms.some(term=>term.includes(word))?2:terms.some(term=>near(word,term))?1:0),0)};}).filter(hit=>hit.score>0).sort((a,b)=>b.score-a.score).map(hit=>hit.option);
}
export function vendorSearchText(question){
 return String(question).replace(/\b(closing|balance|vendor|supplier|ledger|account|any|for|of|show|me|the|please)\b/gi,'').trim().slice(0,120);
}
