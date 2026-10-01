// Accounts Report Merge: joins up to 10 Accounts reports that belong to one
// business process into a single row per anchor document (or party), without
// repeating shared columns, and builds the document trail used for drill-down.
// Table and field identifiers below are a fixed allowlist, never request input.
export const MAX_MERGE_STEPS=10;
const range=column=>`${column} >= TO_DATE(:from_date,'YYYY-MM-DD') AND ${column} < TO_DATE(:to_date,'YYYY-MM-DD')+1`;
const day=column=>`TO_CHAR(${column},'YYYY-MM-DD')`;
const f=(key,label,type='text',extra={})=>({key,label,type,...extra});
const amount=(key,label)=>f(key,label,'amount');
const date=(key,label)=>f(key,label,'date');

// Anchor-document chains filter on the anchor's own date; trail mode looks one anchor up by key.
const anchored=(dateColumn,keyExpression)=>scope=>scope.key?`${keyExpression} = :anchor_key`:range(dateColumn);
// Party chains filter every document on its own date, in list and trail mode.
const partyScoped=(dateColumn,keyExpression)=>scope=>scope.key?`${keyExpression} = :anchor_key AND ${range(dateColumn)}`:range(dateColumn);

const bgScope=anchored('a.bankgaurantydate','TO_CHAR(a.tno)');
const fdScope=anchored('a.fixeddepositdate','TO_CHAR(a.tno)');
const loanScope=anchored('a.loandate','TO_CHAR(a.tno)');

const paid=value=>['Y','YES','1','T','TRUE','PAID'].includes(String(value??'').trim().toUpperCase());
const today=()=>new Date().toISOString().slice(0,10);
const daysBetween=(from,to)=>Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);

export const MERGE_CHAINS={
 'bank-guarantee':{
  title:'Bank Guarantee Lifecycle',
  description:'Type and nature → Bank guarantee → Commission → Closure, one row per guarantee.',
  dateLabel:'Bank guarantee register date',
  steps:[
   {key:'bg',title:'Bank Guaranty Report',role:'anchor',docLabel:'BG Register No',dateLabel:'BG Register Date',
    fields:[f('COMPANYCODE','Company Code'),f('BGNO','Bank Guarantee No'),f('BANK_NAME','Issuing Bank'),f('BENEFICIARYNAME','Beneficiary'),f('TYPE_CODE','BG Type Code','text',{hiddenBy:'type'}),f('NATURE_CODE','BG Nature Code','text',{hiddenBy:'nature'}),date('ISSUE_DATE','Issue Date'),date('EXPIRY_DATE','Expiry Date'),date('CLAIM_VALIDITY_DATE','Claim Validity Date'),amount('AMOUNT','Guarantee Amount'),amount('BALANCE','Recorded BG Balance')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.bankgaurantyno AS doc_no,${day('a.bankgaurantydate')} AS doc_date,a.companycode,a.bgno,p.partyname AS bank_name,a.beneficiaryname,a.bankgaurantytypecode AS type_code,a.bankgaurantynaturecode AS nature_code,${day('a.issuedate')} AS issue_date,${day('a.expirydate')} AS expiry_date,${day('a.claimvaliditydate')} AS claim_validity_date,a.bankgaurantyamount AS amount,a.bgbalance AS balance FROM cmpl.bankgauranty a LEFT JOIN cmpl.party p ON p.partycode=a.issueingbankcode WHERE ${bgScope(s)} ORDER BY a.bankgaurantydate,a.tno`},
   {key:'type',title:'Bank Guaranty Type',role:'lookup',docLabel:'BG Type Code',fields:[f('TYPE_NAME','BG Type')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,t.bankgaurantytypecode AS doc_no,t.bankgaurantytypename AS type_name FROM cmpl.bankgauranty a JOIN cmpl.bankgaurantytype t ON t.bankgaurantytypecode=a.bankgaurantytypecode WHERE ${bgScope(s)}`},
   {key:'nature',title:'Bank Guaranty Nature',role:'lookup',docLabel:'BG Nature Code',fields:[f('NATURE_NAME','BG Nature')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,n.bankgaurantynaturecode AS doc_no,n.bankgaurantynaturename AS nature_name FROM cmpl.bankgauranty a JOIN cmpl.bankgaurantynature n ON n.bankgaurantynaturecode=a.bankgaurantynaturecode WHERE ${bgScope(s)}`},
   {key:'commission',title:'Bank Guaranty Commission',role:'many',docLabel:'Commission Nos',dateLabel:'Last Commission Date',
    sums:[amount('COMMISSION_AMOUNT','Commission Amount'),amount('TOTAL_AMOUNT','Commission incl. GST')],latest:[date('PERIOD_TO','Commission Paid Up To')],
    fields:[date('PERIOD_FROM','Period From'),date('PERIOD_TO','Period To'),f('COMMISSION_PERCENT','Commission %'),amount('COMMISSION_AMOUNT','Commission Amount'),amount('TOTAL_AMOUNT','Total incl. GST')],
    sql:s=>`SELECT TO_CHAR(c.bankgaurantytno) AS anchor,c.bankgaurantycommissionno AS doc_no,${day('c.bankgaurantycommissiondate')} AS doc_date,${day('c.fromdate')} AS period_from,${day('c.todate')} AS period_to,c.bgcommissionpercent AS commission_percent,c.bgcommissionamount AS commission_amount,c.totalamount AS total_amount FROM cmpl.bankgaurantycommission c JOIN cmpl.bankgauranty a ON a.tno=c.bankgaurantytno WHERE ${bgScope(s)} ORDER BY c.bankgaurantycommissiondate,c.tno`},
   {key:'closure',title:'Bank Guaranty Closer',role:'many',docLabel:'Closure No',dateLabel:'Closure Date',fields:[f('REMARK','Closure Remark')],
    sql:s=>`SELECT TO_CHAR(c.bankgaurantytno) AS anchor,c.bankgaurantycloserno AS doc_no,${day('c.bankgaurantycloserdate')} AS doc_date,c.remark FROM cmpl.bankgaurantycloser c JOIN cmpl.bankgauranty a ON a.tno=c.bankgaurantytno WHERE ${bgScope(s)} ORDER BY c.bankgaurantycloserdate,c.tno`}
  ],
  derived:[
   {key:'BG_STATUS',label:'BG Status',value:(row,groups)=>groups.closure?.length?'Closed':row.EXPIRY_DATE&&row.EXPIRY_DATE<today()?'Expired – not closed':'Active'},
   {key:'DAYS_TO_EXPIRY',label:'Days to Expiry',type:'number',value:(row,groups)=>groups.closure?.length||!row.EXPIRY_DATE?'':daysBetween(today(),row.EXPIRY_DATE)}
  ]
 },
 'fixed-deposit':{
  title:'Fixed Deposit Lifecycle',
  description:'Fixed deposit → Interest postings → Withdrawals, one row per deposit.',
  dateLabel:'Fixed deposit date',
  steps:[
   {key:'fd',title:'Fixed Deposit Register',role:'anchor',docLabel:'Fixed Deposit No',dateLabel:'Deposit Date',
    fields:[f('COMPANYCODE','Company Code'),f('ACCOUNT_NAME','Deposit Account'),f('CERTIFICATE_NO','Certificate No'),amount('DEPOSIT_AMOUNT','Deposit Amount'),f('INTEREST_RATE','Interest Rate'),date('MATURITY_DATE','Maturity Date'),amount('MATURITY_AMOUNT','Maturity Amount')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.fixeddepositno AS doc_no,${day('a.fixeddepositdate')} AS doc_date,a.companycode,p.partyname AS account_name,a.fixeddepositcertificateno AS certificate_no,a.fixeddepositamount AS deposit_amount,a.interestrate AS interest_rate,${day('a.maturitydate')} AS maturity_date,a.maturityamount AS maturity_amount FROM cmpl.fixeddeposit a LEFT JOIN cmpl.party p ON p.partycode=a.fixeddepositaccountcode WHERE ${fdScope(s)} ORDER BY a.fixeddepositdate,a.tno`},
   {key:'interest',title:'Fixed Deposit Interest',role:'many',docLabel:'Interest Nos',dateLabel:'Last Interest Date',
    sums:[amount('INTEREST_AMOUNT','Interest Earned'),amount('TDS_AMOUNT','TDS on Interest')],latest:[amount('CLOSING_BALANCE','Balance after Last Interest')],
    fields:[date('PERIOD_FROM','Period From'),date('PERIOD_TO','Period To'),amount('INTEREST_AMOUNT','Interest Amount'),amount('TDS_AMOUNT','TDS'),amount('CLOSING_BALANCE','Closing Balance')],
    sql:s=>`SELECT TO_CHAR(i.fixeddeposittno) AS anchor,i.fixeddepositinterestno AS doc_no,${day('i.fixeddepositinterestdate')} AS doc_date,${day('i.fromdate')} AS period_from,${day('i.todate')} AS period_to,i.interestamount AS interest_amount,i.tdsamount AS tds_amount,i.closingbalance AS closing_balance FROM cmpl.fixeddepositinterest i JOIN cmpl.fixeddeposit a ON a.tno=i.fixeddeposittno WHERE ${fdScope(s)} ORDER BY i.fixeddepositinterestdate,i.tno`},
   {key:'withdrawal',title:'Fixed Deposit Withdrawl',role:'many',docLabel:'Withdrawal Nos',dateLabel:'Last Withdrawal Date',
    sums:[amount('WITHDRAWAL_AMOUNT','Amount Withdrawn'),amount('CHARGES','Withdrawal Charges')],latest:[amount('WITHDRAWAL_CLOSING','Balance after Last Withdrawal')],
    fields:[f('WITHDRAWAL_TYPE','Withdrawal Type'),amount('WITHDRAWAL_AMOUNT','Withdrawal Amount'),amount('CHARGES','Charges'),amount('WITHDRAWAL_CLOSING','Closing Balance')],
    sql:s=>`SELECT TO_CHAR(w.fixeddeposittno) AS anchor,w.fixeddepositwithdrawlno AS doc_no,${day('w.fixeddepositwithdrawldate')} AS doc_date,w.withdrawltype AS withdrawal_type,w.withdrawlamount AS withdrawal_amount,w.charges,w.closingbalance AS withdrawal_closing FROM cmpl.fixeddepositwithdrawl w JOIN cmpl.fixeddeposit a ON a.tno=w.fixeddeposittno WHERE ${fdScope(s)} ORDER BY w.fixeddepositwithdrawldate,w.tno`}
  ],
  derived:[
   {key:'NET_INTEREST',label:'Net Interest after TDS',type:'amount',needs:['interest'],value:(row,groups)=>sum(groups.interest||[],'INTEREST_AMOUNT')-sum(groups.interest||[],'TDS_AMOUNT')},
   {key:'FD_STATUS',label:'FD Status',value:(row,groups)=>groups.withdrawal?.length?'Withdrawn':row.MATURITY_DATE&&row.MATURITY_DATE<today()?'Matured':'Running'}
  ]
 },
 'loan-emi':{
  title:'Loan → EMI → Payment',
  description:'Loan → EMI instalments → Payment advice, one row per loan.',
  dateLabel:'Loan date',
  steps:[
   {key:'loan',title:'Emi Details',role:'anchor',docLabel:'Loan No',dateLabel:'Loan Date',
    fields:[f('COMPANYCODE','Company Code'),f('PARTY_NAME','Lender / Party'),f('LOANGROUPNO','Loan Group No'),amount('LOAN_AMOUNT','Loan Amount'),f('ROI','Rate of Interest'),amount('EMI','EMI Amount'),f('NOOFEMI','Number of EMIs'),date('LOAN_START_DATE','Loan Start Date'),amount('BALANCE_AMOUNT','Recorded Loan Balance')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.loanno AS doc_no,${day('a.loandate')} AS doc_date,a.companycode,p.partyname AS party_name,a.loangroupno,a.loanamount AS loan_amount,a.roi,a.emi,a.noofemi,${day('a.loanstartdate')} AS loan_start_date,a.balanceamount AS balance_amount FROM cmpl.loan a LEFT JOIN cmpl.party p ON p.partycode=a.partycode WHERE ${loanScope(s)} ORDER BY a.loandate,a.tno`},
   {key:'instalments',title:'Combined and Individual EMI Schedule',role:'many',docLabel:'Instalments',dateLabel:'Last Due Date',
    sums:[amount('INSTALMENT_EMI','Total Scheduled EMI'),amount('PRINCIPLE_AMOUNT','Scheduled Principal'),amount('INTEREST_AMOUNT','Scheduled Interest')],
    fields:[f('SNO','Instalment No'),amount('INSTALMENT_EMI','EMI'),amount('PRINCIPLE_AMOUNT','Principal'),amount('INTEREST_AMOUNT','Interest'),amount('INSTALMENT_BALANCE','Balance'),f('ISPAID','Paid Flag')],
    sql:s=>`SELECT TO_CHAR(d.tno) AS anchor,'EMI '||TO_CHAR(d.sno) AS doc_no,${day('d.duedate')} AS doc_date,d.sno,d.emi AS instalment_emi,d.principleamount AS principle_amount,d.interestamount AS interest_amount,d.balanceamount AS instalment_balance,d.ispaid FROM cmpl.loandetail d JOIN cmpl.loan a ON a.tno=d.tno WHERE ${loanScope(s)} ORDER BY d.duedate,d.sno`},
   {key:'payment',title:'Payment Advice Register',role:'many',requires:['instalments'],docLabel:'Payment Advice Nos',dateLabel:'Last Payment Advice Date',
    sums:[amount('ADVICE_AMOUNT','Amount Advised')],
    fields:[amount('ADVICE_AMOUNT','Advice Amount'),f('PAYMENTDONE','Payment Done'),f('NARRATION','Narration')],
    sql:s=>`SELECT DISTINCT TO_CHAR(d.tno) AS anchor,pa.paymentadviceno AS doc_no,${day('pa.paymentadvicedate')} AS doc_date,pa.amount AS advice_amount,pa.paymentdone,pa.narration FROM cmpl.paymentadvice pa JOIN cmpl.loandetail d ON d.paymentadvicetno=pa.tno JOIN cmpl.loan a ON a.tno=d.tno WHERE ${loanScope(s)} ORDER BY doc_date,doc_no`}
  ],
  derived:[
   {key:'EMIS_PAID',label:'EMIs Paid',needs:['instalments'],value:(row,groups)=>{const list=groups.instalments||[];return `${list.filter(item=>paid(item.ISPAID)).length} / ${list.length}`;}},
   {key:'EMIS_OVERDUE',label:'Overdue EMIs',type:'number',needs:['instalments'],value:(row,groups)=>(groups.instalments||[]).filter(item=>!paid(item.ISPAID)&&item.DOC_DATE&&item.DOC_DATE<today()).length},
   {key:'NEXT_DUE',label:'Next EMI Due',type:'date',needs:['instalments'],value:(row,groups)=>(groups.instalments||[]).filter(item=>!paid(item.ISPAID)&&item.DOC_DATE>=today()).map(item=>item.DOC_DATE).sort()[0]||''}
  ]
 },
 'party-position':{
  title:'Party Position (Vendor / Customer)',
  description:'Party → purchases, notes, bill receipts, payments, TDS and outstanding, one row per party.',
  dateLabel:'Document date',
  partyChain:true,
  steps:[
   {key:'party',title:'Account Master',role:'anchor',docLabel:'Party Code',fields:[f('PARTY_NAME','Party'),f('ACCOUNT_TYPE','Account Type'),f('STATUS','Party Status')],
    sql:s=>`SELECT p.partycode AS anchor,p.partycode AS doc_no,p.partyname AS party_name,t.partytypename AS account_type,p.partystatus AS status FROM cmpl.party p LEFT JOIN cmpl.partytype t ON t.partytypecode=p.partytypecode WHERE ${s.key?'p.partycode = :anchor_key':`p.partycode IN (${s.partyKeys})`} ORDER BY p.partyname,p.partycode`},
   {key:'cash-purchase',title:'Cash Purchase Register',role:'many',docLabel:'Cash Purchase Nos',dateLabel:'Last Cash Purchase',sums:[amount('PURCHASE_AMOUNT','Cash Purchases')],
    fields:[f('PARTYBILLNO','Supplier Bill No'),amount('PURCHASE_AMOUNT','Purchase Amount'),f('NARRATION','Narration')],
    keys:`SELECT c.partycode FROM cmpl.cashpurchase c WHERE ${range('c.cashpurchasedate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.cashpurchaseno AS doc_no,${day('c.cashpurchasedate')} AS doc_date,c.partybillno,c.cashpurchaseamount AS purchase_amount,c.narration FROM cmpl.cashpurchase c WHERE ${partyScoped('c.cashpurchasedate','c.partycode')(s)} ORDER BY c.cashpurchasedate,c.tno`},
   {key:'debit-note',title:'Debit Note Register',role:'many',docLabel:'Debit Note Nos',dateLabel:'Last Debit Note',sums:[amount('DEBIT_AMOUNT','Debit Notes'),amount('DEBIT_PAID','Debit Notes Settled')],
    fields:[amount('DEBIT_AMOUNT','Note Amount'),amount('DEBIT_PAID','Paid Amount'),date('DUE_DATE','Due Date'),f('REMARK','Remark')],
    keys:`SELECT c.partycode FROM cmpl.debitnote c WHERE ${range('c.debitnotedate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.debitnoteno AS doc_no,${day('c.debitnotedate')} AS doc_date,c.debitnoteamount AS debit_amount,c.paidamount AS debit_paid,${day('c.duedate')} AS due_date,c.remark FROM cmpl.debitnote c WHERE ${partyScoped('c.debitnotedate','c.partycode')(s)} ORDER BY c.debitnotedate,c.tno`},
   {key:'credit-note',title:'Credit Note Register',role:'many',docLabel:'Credit Note Nos',dateLabel:'Last Credit Note',sums:[amount('CREDIT_AMOUNT','Credit Notes')],
    fields:[amount('CREDIT_AMOUNT','Note Amount'),amount('CREDIT_PAID','Paid Amount'),f('REMARK','Remark')],
    keys:`SELECT c.partycode FROM cmpl.creditnote c WHERE ${range('c.creditnotedate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.creditnoteno AS doc_no,${day('c.creditnotedate')} AS doc_date,c.creditnoteamount AS credit_amount,c.paidamount AS credit_paid,c.remark FROM cmpl.creditnote c WHERE ${partyScoped('c.creditnotedate','c.partycode')(s)} ORDER BY c.creditnotedate,c.tno`},
   {key:'bill-receipt',title:'Bill Receipt Register',role:'many',docLabel:'Bill Receipt Nos',dateLabel:'Last Bill Receipt',sums:[amount('RECEIPT_AMOUNT','Bills Received'),amount('RECEIPT_TDS','TDS on Bills')],
    fields:[amount('RECEIPT_AMOUNT','Amount'),amount('RECEIPT_DEDUCTED','Deducted'),amount('RECEIPT_TDS','TDS'),amount('PENALTY_AMOUNT','Penalty')],
    keys:`SELECT c.accountcode FROM cmpl.dfreightbillreceipt c WHERE ${range('c.dfreightbillreceiptdate')}`,
    sql:s=>`SELECT c.accountcode AS anchor,c.dfreightbillreceiptno AS doc_no,${day('c.dfreightbillreceiptdate')} AS doc_date,c.amount AS receipt_amount,c.deductedamount AS receipt_deducted,c.tdsamount AS receipt_tds,c.penaltyamount AS penalty_amount FROM cmpl.dfreightbillreceipt c WHERE ${partyScoped('c.dfreightbillreceiptdate','c.accountcode')(s)} ORDER BY c.dfreightbillreceiptdate,c.tno`},
   {key:'payment-advice',title:'Payment Advice Register',role:'many',docLabel:'Payment Advice Nos',dateLabel:'Last Payment Advice',sums:[amount('ADVICE_AMOUNT','Payments Advised')],
    fields:[amount('ADVICE_AMOUNT','Amount'),f('PAYMENTDONE','Payment Done'),f('PRIORITY','Priority'),f('NARRATION','Narration')],
    keys:`SELECT c.partycode FROM cmpl.paymentadvice c WHERE ${range('c.paymentadvicedate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.paymentadviceno AS doc_no,${day('c.paymentadvicedate')} AS doc_date,c.amount AS advice_amount,c.paymentdone,c.priority,c.narration FROM cmpl.paymentadvice c WHERE ${partyScoped('c.paymentadvicedate','c.partycode')(s)} ORDER BY c.paymentadvicedate,c.tno`},
   {key:'tds-payable',title:'TDS Payable Summary',role:'many',docLabel:'TDS Voucher Nos',dateLabel:'Last TDS Deduction',sums:[amount('TDS_PAYABLE','TDS Deducted (Payable)')],
    fields:[f('TAXSECTIONNAME','Tax Section'),amount('TDS_BASE','Deduction Base'),amount('TDS_PAYABLE','TDS Amount')],
    keys:`SELECT c.partycode FROM cmpl.tdsdetail c WHERE ${range('c.transactiondate')}`,
    sql:s=>`SELECT c.partycode AS anchor,v.voucherno AS doc_no,${day('c.transactiondate')} AS doc_date,c.taxsectionname,c.amount AS tds_base,c.tdsamount AS tds_payable FROM cmpl.tdsdetail c JOIN cmpl.voucher v ON v.tno=c.vouchertno WHERE ${partyScoped('c.transactiondate','c.partycode')(s)} ORDER BY c.transactiondate,c.tno`},
   {key:'tds-receivable',title:'TDS Receivable',role:'many',docLabel:'TDS Receipt Nos',dateLabel:'Last TDS Receipt',sums:[amount('TDS_RECEIVABLE','TDS Receivable')],
    fields:[f('BILLNO','Bill No'),amount('BILLAMOUNT','Bill Amount'),amount('TDS_RECEIVABLE','TDS Amount')],
    keys:`SELECT c.partycode FROM cmpl.dfreightbillreceiptfortdsr c WHERE ${range('c.dfreightbillreceiptdate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.dfreightbillreceiptno AS doc_no,${day('c.dfreightbillreceiptdate')} AS doc_date,c.billno,c.billamount,c.tdsamount AS tds_receivable FROM cmpl.dfreightbillreceiptfortdsr c WHERE ${partyScoped('c.dfreightbillreceiptdate','c.partycode')(s)} ORDER BY c.dfreightbillreceiptdate,c.billno`},
   {key:'outstanding',title:'Payable/Receivable Report',role:'many',docLabel:'Outstanding Bill Nos',dateLabel:'Latest Outstanding Bill',sums:[amount('OUTSTANDING','Current Outstanding')],latest:[f('SIDE','Payable / Receivable')],
    fields:[f('SIDE','Side'),amount('ORIGINAL_AMOUNT','Original Amount'),amount('SETTLED_AMOUNT','Settled'),amount('OUTSTANDING','Outstanding'),f('AGE_DAYS','Bill Age Days')],
    keys:`SELECT b.vendorcode FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND ${range('b.documentdate')} UNION SELECT r.accountcode FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND ${range('r.voucherdate')}`,
    sql:s=>`SELECT * FROM (SELECT b.vendorcode AS anchor,b.internalbillno AS doc_no,${day('b.documentdate')} AS doc_date,'Payable' AS side,b.originalamount AS original_amount,b.settledamount AS settled_amount,b.outstanding,TRUNC(SYSDATE)-TRUNC(b.documentdate) AS age_days FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND ${partyScoped('b.documentdate','b.vendorcode')(s)} UNION ALL SELECT r.accountcode AS anchor,r.billno AS doc_no,${day('r.voucherdate')} AS doc_date,'Receivable' AS side,r.voucheramount AS original_amount,r.allocatedamount AS settled_amount,r.totalbalance AS outstanding,r.billage AS age_days FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND ${partyScoped('r.voucherdate','r.accountcode')(s)}) ORDER BY doc_date,doc_no`}
  ],
  derived:[
   {key:'NET_NOTES',label:'Net Debit − Credit Notes',type:'amount',needs:['debit-note','credit-note'],value:(row,groups)=>sum(groups['debit-note']||[],'DEBIT_AMOUNT')-sum(groups['credit-note']||[],'CREDIT_AMOUNT')},
   {key:'DOCUMENT_COUNT',label:'Documents in Period',type:'number',value:(row,groups)=>Object.values(groups).reduce((total,list)=>total+list.length,0)}
  ]
 }
};

for(const chain of Object.values(MERGE_CHAINS)){
 chain.anchor=chain.steps.find(step=>step.role==='anchor').key;
 if(chain.steps.length>MAX_MERGE_STEPS)throw new Error(`${chain.title} has more than ${MAX_MERGE_STEPS} reports.`);
}

export function mergeChain(key){
 if(!Object.hasOwn(MERGE_CHAINS,key)){const error=new Error('Unknown Report Merge process.');error.code='INVALID_MERGE_CHAIN';throw error;}
 return MERGE_CHAINS[key];
}

// Adds the anchor and any bridge reports a selection needs, keeping process order.
export function resolveSelection(chainKey,selected=[]){
 const chain=mergeChain(chainKey),known=new Map(chain.steps.map(step=>[step.key,step]));
 const wanted=new Set([chain.anchor]),added=new Set([chain.anchor]);
 for(const key of selected){
  if(!known.has(key)){const error=new Error('Unknown report in this Report Merge process.');error.code='INVALID_MERGE_STEP';throw error;}
  wanted.add(key);
 }
 for(const key of [...wanted])for(const need of known.get(key).requires||[])if(!wanted.has(need)){wanted.add(need);added.add(need);}
 for(const key of selected)added.delete(key);
 const steps=chain.steps.filter(step=>wanted.has(step.key)).map(step=>step.key);
 if(steps.length>MAX_MERGE_STEPS){const error=new Error(`Select at most ${MAX_MERGE_STEPS} reports.`);error.code='INVALID_MERGE_STEP';throw error;}
 return {steps,autoAdded:[...added].filter(key=>steps.includes(key))};
}

// Builds the SQL and only the binds each statement actually uses.
export function mergeStatements(chainKey,steps,{from,to,anchorKey}={}){
 const chain=mergeChain(chainKey),scope={key:anchorKey!==undefined};
 if(chain.partyChain&&!scope.key){
  const children=chain.steps.filter(step=>steps.includes(step.key)&&step.keys);
  scope.partyKeys=children.length?children.map(step=>step.keys).join(' UNION '):'SELECT NULL FROM dual WHERE 1=0';
 }
 const values={from_date:from,to_date:to,anchor_key:anchorKey};
 return chain.steps.filter(step=>steps.includes(step.key)).map(step=>{
  const sql=step.sql(scope);
  const binds=Object.fromEntries([...new Set([...sql.matchAll(/:(from_date|to_date|anchor_key)\b/g)].map(match=>match[1]))].map(name=>[name,values[name]]));
  return {step:step.key,sql,binds};
 });
}

const docList=rows=>[...new Set(rows.map(row=>row.DOC_NO).filter(value=>value!==null&&value!==undefined&&value!==''))].map(String);

// One row per anchor. Each shared field appears once; child reports contribute
// their document numbers, counts, totals and latest values.
export function buildMergedReport(chainKey,steps,rowsByStep){
 const chain=mergeChain(chainKey),selected=chain.steps.filter(step=>steps.includes(step.key));
 const columns=[],labels=new Set();
 const add=column=>{if(labels.has(column.label))return;labels.add(column.label);columns.push(column);};
 for(const step of selected){
  if(step.role==='anchor'){
   add({key:'DOC_NO',label:step.docLabel,type:'doc',step:step.key});
   if(step.dateLabel)add({key:'DOC_DATE',label:step.dateLabel,type:'date',step:step.key});
   for(const field of step.fields)if(!field.hiddenBy||!steps.includes(field.hiddenBy))add({...field,step:step.key});
  }else if(step.role==='lookup'){
   for(const field of step.fields)add({...field,key:`${step.key}__${field.key}`,step:step.key});
  }else{
   add({key:`${step.key}__DOCS`,label:step.docLabel,type:'docs',step:step.key});
   add({key:`${step.key}__COUNT`,label:`${step.title} Count`,type:'number',step:step.key});
   if(step.dateLabel)add({key:`${step.key}__LAST_DATE`,label:step.dateLabel,type:'date',step:step.key});
   for(const field of step.sums||[])add({...field,key:`${step.key}__SUM_${field.key}`,step:step.key});
   for(const field of step.latest||[])add({...field,key:`${step.key}__LATEST_${field.key}`,step:step.key});
  }
 }
 const derived=(chain.derived||[]).filter(item=>(item.needs||[]).every(key=>steps.includes(key)));
 for(const item of derived)add({key:item.key,label:item.label,type:item.type||'text',step:'derived'});
 const grouped={};
 for(const step of selected){
  const map=new Map();
  for(const row of rowsByStep[step.key]||[]){const anchor=String(row.ANCHOR);if(!map.has(anchor))map.set(anchor,[]);map.get(anchor).push(row);}
  grouped[step.key]=map;
 }
 const anchorRows=[...grouped[chain.anchor].values()].map(list=>list[0]);
 const rows=anchorRows.map(anchorRow=>{
  const anchor=String(anchorRow.ANCHOR),row={...anchorRow,ID:anchor,ANCHOR:anchor,DOC_NO:String(anchorRow.DOC_NO??anchor)},groups={};
  for(const step of selected){
   if(step.role==='anchor')continue;
   const list=grouped[step.key].get(anchor)||[];
   if(step.role==='lookup'){for(const field of step.fields)row[`${step.key}__${field.key}`]=list[0]?.[field.key]??'';continue;}
   groups[step.key]=list;
   const latest=list.reduce((best,item)=>!best||String(item.DOC_DATE||'')>=String(best.DOC_DATE||'')?item:best,null);
   row[`${step.key}__DOCS`]=docList(list);
   row[`${step.key}__COUNT`]=list.length;
   row[`${step.key}__LAST_DATE`]=latest?.DOC_DATE||'';
   for(const field of step.sums||[])row[`${step.key}__SUM_${field.key}`]=list.length?sum(list,field.key):'';
   for(const field of step.latest||[])row[`${step.key}__LATEST_${field.key}`]=latest?.[field.key]??'';
  }
  for(const item of derived)row[item.key]=item.value(row,groups);
  return row;
 });
 const children=selected.filter(step=>step.role==='many');
 const visible=chain.partyChain&&children.length?rows.filter(row=>children.some(step=>row[`${step.key}__COUNT`]>0)):rows;
 return {columns,rows:visible};
}

// Every report in the chain for one anchor, in process order, for drill-down.
export function buildTrail(chainKey,rowsByStep){
 const chain=mergeChain(chainKey);
 return chain.steps.map(step=>{
  const fields=[...(step.dateLabel&&step.role!=='lookup'?[{key:'DOC_DATE',label:step.role==='many'?'Date':step.dateLabel,type:'date'}]:[]),...step.fields];
  return {key:step.key,title:step.title,role:step.role,docLabel:step.docLabel,
   documents:(rowsByStep[step.key]||[]).map(row=>({docNo:String(row.DOC_NO??''),docDate:row.DOC_DATE||'',details:fields.map(field=>({label:field.label,type:field.type,value:row[field.key]??''})).filter(item=>item.value!=='')}))};
 });
}
