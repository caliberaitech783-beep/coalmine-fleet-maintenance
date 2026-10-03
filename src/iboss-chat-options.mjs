import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS} from '../iboss-accounts.mjs';
const prompts=[
 ['bank-balance',"Today's bank closing"],['day-book',"Today's vouchers"],
 ['payment-advice',"Today's payment advice"],['payable-receivable','Payable and receivable bills'],
 ['outstanding-180','Bills outstanding more than 180 days'],['imprest-balance','Current imprest balance'],
 ['tds-payable','TDS deductions'],['fixed-deposit','Fixed deposit register'],['emi-schedule','EMI schedule']
];
export function chatOptions(allowed){
 const keys=[...(allowed.includes('Masters')?ACCOUNT_SECTIONS.masters:[]),...(allowed.includes('Transactions')?ACCOUNT_SECTIONS.transactions:[])];
 return keys.map(view=>({view,title:ACCOUNT_VIEWS[view].title,prompt:prompts.find(([key])=>key===view)?.[1]||ACCOUNT_VIEWS[view].title}));
}
const normalize=text=>String(text).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function matchChatQuestion(question,options){
 const text=normalize(question);
 return options.find(option=>[option.prompt,option.title,...(option.view==='bank-balance'?['todays bank closing','today bank closing','bank closing','bank balance']:[])].some(alias=>normalize(alias)===text));
}
export function filterChatOptions(question,options){
 const words=normalize(question).split(' ').filter(Boolean);
 return options.filter(option=>words.every(word=>normalize(`${option.prompt} ${option.title}`).includes(word)));
}
