import {ledgerSql} from './iboss-bank-ledger.mjs';
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
const voucherScope=s=>s.key?"v.tno = TO_NUMBER(:anchor_key DEFAULT NULL ON CONVERSION ERROR)":range('v.voucherdate');

const paid=value=>['Y','YES','1','T','TRUE','PAID'].includes(String(value??'').trim().toUpperCase());
const today=()=>new Date().toISOString().slice(0,10);
const daysBetween=(from,to)=>Math.round((Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number(row[key])||0),0);
// Vehicle numbers are matched the same way as the fleet log-book lookup: letters and digits only.
const vehicle=column=>`REGEXP_REPLACE(UPPER(NVL(${column},'')),'[^A-Z0-9]','')`;
const INTERNAL_PARTIES="p.partytypecode<>'ACCOUNTGROUP' AND p.partycode IN (SELECT partycode FROM cmpl.party START WITH partycode='BRANCHDIVISIONS' CONNECT BY NOCYCLE PRIOR partycode=parentcode)";
// Calculate each ledger through To date from vouchers, including brought-forward entries.
function balanceStep(key,title,condition){
 return {key,title,role:'many',docLabel:`${title} Rows`,dateLabel:`${title} Closing As Of`,
  sums:[amount('BALANCEAMOUNT',`${title} (Cr + / Dr −)`)],
  fields:[f('COMPANYCODE','Company Code'),amount('OPENING_BALANCE','Opening (Cr + / Dr −)'),amount('DEBITAMOUNT','Period Debit'),amount('CREDITAMOUNT','Period Credit'),amount('CLOSING_DEBIT','Closing Dr'),amount('CLOSING_CREDIT','Closing Cr'),amount('BALANCEAMOUNT','Closing (Cr + / Dr −)')],
  keys:`SELECT DISTINCT d.accountcode FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno JOIN cmpl.party p ON p.partycode=d.accountcode WHERE ${condition} AND v.voucherdate<TO_DATE(:to_date,'YYYY-MM-DD')+1`,
  sql:s=>`SELECT b.*,b.account_code AS anchor,'Balance '||b.companycode AS doc_no,b.snapshot_date AS doc_date FROM (${ledgerSql(condition,s.key?'anchor_key':'')}) b ORDER BY b.companycode,b.account_code`};
}
export const MERGE_CHAINS={
 'bank-guarantee':{
  title:'Bank Guarantee Lifecycle',
  description:'Type and nature → Bank guarantee → Commission → Closure, one row per guarantee.',
  dateLabel:'Bank guarantee register date',
  steps:[
   {key:'bg',title:'Bank Guaranty Report',role:'anchor',docLabel:'BG Register No',dateLabel:'BG Register Date',
    fields:[f('COMPANYCODE','Company Code'),f('BGNO','Bank Guarantee No'),f('BANK_CODE','Issuing Bank Code','text',{link:'bank-position'}),f('BANK_NAME','Issuing Bank'),f('BENEFICIARYNAME','Beneficiary'),f('TYPE_CODE','BG Type Code','text',{hiddenBy:'type'}),f('NATURE_CODE','BG Nature Code','text',{hiddenBy:'nature'}),date('ISSUE_DATE','Issue Date'),date('EXPIRY_DATE','Expiry Date'),date('CLAIM_VALIDITY_DATE','Claim Validity Date'),amount('AMOUNT','Guarantee Amount'),amount('BALANCE','Recorded BG Balance')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.bankgaurantyno AS doc_no,${day('a.bankgaurantydate')} AS doc_date,a.companycode,a.bgno,a.issueingbankcode AS bank_code,p.partyname AS bank_name,a.beneficiaryname,a.bankgaurantytypecode AS type_code,a.bankgaurantynaturecode AS nature_code,${day('a.issuedate')} AS issue_date,${day('a.expirydate')} AS expiry_date,${day('a.claimvaliditydate')} AS claim_validity_date,a.bankgaurantyamount AS amount,a.bgbalance AS balance FROM cmpl.bankgauranty a LEFT JOIN cmpl.party p ON p.partycode=a.issueingbankcode WHERE ${bgScope(s)} ORDER BY a.bankgaurantydate,a.tno`},
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
    fields:[f('COMPANYCODE','Company Code'),f('ACCOUNT_CODE','Deposit Account Code','text',{link:'party-position'}),f('ACCOUNT_NAME','Deposit Account'),f('CERTIFICATE_NO','Certificate No'),amount('DEPOSIT_AMOUNT','Deposit Amount'),f('INTEREST_RATE','Interest Rate'),date('MATURITY_DATE','Maturity Date'),amount('MATURITY_AMOUNT','Maturity Amount')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.fixeddepositno AS doc_no,${day('a.fixeddepositdate')} AS doc_date,a.companycode,a.fixeddepositaccountcode AS account_code,p.partyname AS account_name,a.fixeddepositcertificateno AS certificate_no,a.fixeddepositamount AS deposit_amount,a.interestrate AS interest_rate,${day('a.maturitydate')} AS maturity_date,a.maturityamount AS maturity_amount FROM cmpl.fixeddeposit a LEFT JOIN cmpl.party p ON p.partycode=a.fixeddepositaccountcode WHERE ${fdScope(s)} ORDER BY a.fixeddepositdate,a.tno`},
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
    fields:[f('COMPANYCODE','Company Code'),f('PARTY_CODE','Lender / Party Code','text',{link:'party-position'}),f('PARTY_NAME','Lender / Party'),f('LOANGROUPNO','Loan Group No'),amount('LOAN_AMOUNT','Loan Amount'),f('ROI','Rate of Interest'),amount('EMI','EMI Amount'),f('NOOFEMI','Number of EMIs'),date('LOAN_START_DATE','Loan Start Date'),amount('BALANCE_AMOUNT','Recorded Loan Balance')],
    sql:s=>`SELECT TO_CHAR(a.tno) AS anchor,a.loanno AS doc_no,${day('a.loandate')} AS doc_date,a.companycode,a.partycode AS party_code,p.partyname AS party_name,a.loangroupno,a.loanamount AS loan_amount,a.roi,a.emi,a.noofemi,${day('a.loanstartdate')} AS loan_start_date,a.balanceamount AS balance_amount FROM cmpl.loan a LEFT JOIN cmpl.party p ON p.partycode=a.partycode WHERE ${loanScope(s)} ORDER BY a.loandate,a.tno`},
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
  description:'Party → vendor details, opening, purchases, notes, bill receipts, payments, day book, TDS / TCS, outstanding and balances, one row per party.',
  dateLabel:'Document date',
  keyed:true,rowLabel:'party',
  defaults:['party','cash-purchase','debit-note','credit-note','bill-receipt','payment-advice','tds-payable','tds-receivable','outstanding'],
  steps:[
   {key:'party',title:'Account Master',role:'anchor',docLabel:'Party Code',fields:[f('PARTY_NAME','Party'),f('ACCOUNT_TYPE','Account Type'),f('STATUS','Party Status')],
    sql:s=>`SELECT p.partycode AS anchor,p.partycode AS doc_no,p.partyname AS party_name,t.partytypename AS account_type,p.partystatus AS status FROM cmpl.party p LEFT JOIN cmpl.partytype t ON t.partytypecode=p.partytypecode WHERE ${s.key?'p.partycode = :anchor_key':`p.partycode IN (${s.keys})`} ORDER BY p.partyname,p.partycode`},
   {key:'vendor',title:'Vendor Master',role:'lookup',docLabel:'Vendor Code',fields:[f('VENDORCATEGORY','Vendor Category'),f('VENDORSTATUSCODE','Vendor Status'),f('CONTACTPERSON','Contact Person'),f('OFFICEMOBILENO','Mobile'),f('OFFICEEMAILID','Email')],
    sql:s=>`SELECT v.vendorcode AS anchor,v.vendorcode AS doc_no,v.vendorcategory,v.vendorstatuscode,v.contactperson,v.officemobileno,v.officeemailid FROM cmpl.vendor v WHERE ${s.key?'v.vendorcode = :anchor_key':`v.vendorcode IN (${s.keys})`}`},
   {key:'account-opening',title:'Account Opening Register',role:'many',docLabel:'Opening Nos',dateLabel:'Last Opening Entry',sums:[amount('OPENINGAMOUNT','Opening Balance Entries')],
    fields:[f('FINANCIALYEARCODE','Financial Year'),amount('OPENINGAMOUNT','Opening Amount'),f('OPENING_BILL_NO','Bill No')],
    keys:`SELECT a.accountcode FROM cmpl.accountopening a WHERE ${range('a.accountopeningdate')}`,
    sql:s=>`SELECT a.accountcode AS anchor,a.accountopeningno AS doc_no,${day('a.accountopeningdate')} AS doc_date,a.financialyearcode,a.openingamount,a.billno AS opening_bill_no FROM cmpl.accountopening a WHERE ${partyScoped('a.accountopeningdate','a.accountcode')(s)} ORDER BY a.accountopeningdate,a.tno`},
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
   {key:'day-book',title:'Day Book',role:'many',docLink:{chain:'voucher',keyField:'VOUCHER_TNO'},docLabel:'Voucher Nos',dateLabel:'Last Voucher',sums:[amount('VOUCHER_AMOUNT','Net Day Book Amount (signed)')],
    fields:[f('DOCTYPE_NAME','Document Type'),amount('VOUCHER_AMOUNT','Signed Amount'),f('VOUCHER_NARRATION','Narration')],
    keys:`SELECT d.accountcode FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno WHERE ${range('v.voucherdate')}`,
    sql:s=>`SELECT d.accountcode AS anchor,v.voucherno AS doc_no,TO_CHAR(v.tno) AS voucher_tno,${day('v.voucherdate')} AS doc_date,t.doctypename AS doctype_name,d.amount AS voucher_amount,COALESCE(d.narration,v.narration) AS voucher_narration FROM cmpl.voucher v JOIN cmpl.voucherdetail d ON d.tno=v.tno LEFT JOIN cmpl.doctype t ON t.doctypecode=v.doctypecode WHERE ${partyScoped('v.voucherdate','d.accountcode')(s)} ORDER BY v.voucherdate,v.tno,d.sno`},
   {key:'tds-payable',title:'TDS Payable Summary',role:'many',docLink:{chain:'voucher',keyField:'VOUCHER_TNO'},docLabel:'TDS Voucher Nos',dateLabel:'Last TDS Deduction',sums:[amount('TDS_PAYABLE','TDS Deducted (Payable)')],
    fields:[f('TAXSECTIONNAME','Tax Section'),amount('TDS_BASE','Deduction Base'),amount('TDS_PAYABLE','TDS Amount')],
    keys:`SELECT c.partycode FROM cmpl.tdsdetail c WHERE ${range('c.transactiondate')}`,
    sql:s=>`SELECT c.partycode AS anchor,v.voucherno AS doc_no,TO_CHAR(v.tno) AS voucher_tno,${day('c.transactiondate')} AS doc_date,c.taxsectionname,c.amount AS tds_base,c.tdsamount AS tds_payable FROM cmpl.tdsdetail c JOIN cmpl.voucher v ON v.tno=c.vouchertno WHERE ${partyScoped('c.transactiondate','c.partycode')(s)} ORDER BY c.transactiondate,c.tno`},
   {key:'tds-receivable',title:'TDS Receivable',role:'many',docLabel:'TDS Receipt Nos',dateLabel:'Last TDS Receipt',sums:[amount('TDS_RECEIVABLE','TDS Receivable')],
    fields:[f('BILLNO','Bill No'),amount('BILLAMOUNT','Bill Amount'),amount('TDS_RECEIVABLE','TDS Amount')],
    keys:`SELECT c.partycode FROM cmpl.dfreightbillreceiptfortdsr c WHERE ${range('c.dfreightbillreceiptdate')}`,
    sql:s=>`SELECT c.partycode AS anchor,c.dfreightbillreceiptno AS doc_no,${day('c.dfreightbillreceiptdate')} AS doc_date,c.billno,c.billamount,c.tdsamount AS tds_receivable FROM cmpl.dfreightbillreceiptfortdsr c WHERE ${partyScoped('c.dfreightbillreceiptdate','c.partycode')(s)} ORDER BY c.dfreightbillreceiptdate,c.billno`},
   {key:'party-tcs',title:'Party Wise TCS Summary',role:'many',docLabel:'TCS Type',dateLabel:'Last TCS Voucher',sums:[amount('TCS','TCS Amount')],
    fields:[f('TAX_LINES','Tax Lines'),amount('TCS','TCS Amount')],
    keys:`SELECT a.partycode FROM cmpl.taxinoutdetail a WHERE NVL(a.tcs,0)<>0 AND ${range('a.voucherdate')}`,
    sql:s=>`SELECT a.partycode AS anchor,a.type||' TCS' AS doc_no,${day('MAX(a.voucherdate)')} AS doc_date,COUNT(*) AS tax_lines,SUM(a.tcs) AS tcs FROM cmpl.taxinoutdetail a WHERE NVL(a.tcs,0)<>0 AND ${partyScoped('a.voucherdate','a.partycode')(s)} GROUP BY a.partycode,a.type ORDER BY a.type`},
   {key:'outstanding',title:'Payable/Receivable Report',role:'many',docLabel:'Outstanding Bill Nos',dateLabel:'Latest Outstanding Bill',sums:[amount('OUTSTANDING','Current Outstanding')],latest:[f('SIDE','Payable / Receivable')],
    fields:[f('SIDE','Side'),amount('ORIGINAL_AMOUNT','Original Amount'),amount('SETTLED_AMOUNT','Settled'),amount('OUTSTANDING','Outstanding'),f('AGE_DAYS','Bill Age Days')],
    keys:`SELECT b.vendorcode FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND ${range('b.documentdate')} UNION SELECT r.accountcode FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND ${range('r.voucherdate')}`,
    sql:s=>`SELECT * FROM (SELECT b.vendorcode AS anchor,b.internalbillno AS doc_no,${day('b.documentdate')} AS doc_date,'Payable' AS side,b.originalamount AS original_amount,b.settledamount AS settled_amount,b.outstanding,TRUNC(SYSDATE)-TRUNC(b.documentdate) AS age_days FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND ${partyScoped('b.documentdate','b.vendorcode')(s)} UNION ALL SELECT r.accountcode AS anchor,r.billno AS doc_no,${day('r.voucherdate')} AS doc_date,'Receivable' AS side,r.voucheramount AS original_amount,r.allocatedamount AS settled_amount,r.totalbalance AS outstanding,r.billage AS age_days FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND ${partyScoped('r.voucherdate','r.accountcode')(s)}) ORDER BY doc_date,doc_no`},
   {key:'outstanding-180',title:'Bill Outstanding More than 180 Days',role:'many',docLabel:'Bills > 180 Days',dateLabel:'Latest Bill > 180 Days',sums:[amount('AGED_OUTSTANDING','Outstanding > 180 Days')],
    fields:[f('SIDE','Side'),amount('AGED_OUTSTANDING','Outstanding'),f('AGE_DAYS','Bill Age Days')],
    keys:`SELECT b.vendorcode FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND TRUNC(SYSDATE)-TRUNC(b.documentdate)>180 UNION SELECT r.accountcode FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND r.billage>180`,
    sql:s=>`SELECT * FROM (SELECT b.vendorcode AS anchor,b.internalbillno AS doc_no,${day('b.documentdate')} AS doc_date,'Payable' AS side,b.outstanding AS aged_outstanding,TRUNC(SYSDATE)-TRUNC(b.documentdate) AS age_days FROM cmpl.ap_bill_payable_v b WHERE NVL(b.outstanding,0)<>0 AND TRUNC(SYSDATE)-TRUNC(b.documentdate)>180${s.key?' AND b.vendorcode = :anchor_key':''} UNION ALL SELECT r.accountcode AS anchor,r.billno AS doc_no,${day('r.voucherdate')} AS doc_date,'Receivable' AS side,r.totalbalance AS aged_outstanding,r.billage AS age_days FROM cmpl.bi_receivable r WHERE NVL(r.totalbalance,0)<>0 AND r.billage>180${s.key?' AND r.accountcode = :anchor_key':''}) ORDER BY doc_date,doc_no`},
   balanceStep('imprest','Imprest Balance',"p.partytypecode='IMPREST'"),
   balanceStep('internal','Internal Balance Details',INTERNAL_PARTIES)
  ],
  derived:[
   {key:'NET_NOTES',label:'Net Debit − Credit Notes',type:'amount',needs:['debit-note','credit-note'],value:(row,groups)=>sum(groups['debit-note']||[],'DEBIT_AMOUNT')-sum(groups['credit-note']||[],'CREDIT_AMOUNT')},
   {key:'DOCUMENT_COUNT',label:'Documents in Period',type:'number',value:(row,groups)=>Object.values(groups).reduce((total,list)=>total+list.length,0)}
  ]
 },
 'bank-position':{
  title:'Bank Position',
  description:'Bank account → ledger closing → interest → FDs → BGs issued → loans, one row per bank.',
  dateLabel:'Document date (bank closing: through To date)',
  keyed:true,rowLabel:'bank',
  steps:[
   {key:'bank',title:'Account Master (Banks)',role:'anchor',docLabel:'Bank Account Code',fields:[f('BANK_NAME','Bank'),f('STATUS','Account Status')],
    sql:s=>`SELECT p.partycode AS anchor,p.partycode AS doc_no,p.partyname AS bank_name,p.partystatus AS status FROM cmpl.party p WHERE p.partytypecode='BANK' AND ${s.key?'p.partycode = :anchor_key':`p.partycode IN (${s.keys})`} ORDER BY p.partyname,p.partycode`},
   balanceStep('balance','Bank Balance Details',"p.partytypecode='BANK'"),
   {key:'interest',title:'Bank Interest',role:'many',docLabel:'Interest Periods',dateLabel:'Last Interest For Date',sums:[amount('INTEREST_AMOUNT','Bank Interest'),amount('OD_INTEREST_AMOUNT','OD Interest')],latest:[amount('LIMITAMOUNT','Latest Limit Amount'),f('INTERESTRATE','Latest Interest Rate')],
    fields:[date('FROM_DATE','Calculation From'),date('TO_DATE','Calculation To'),amount('INTEREST_BALANCE','Balance'),amount('LIMITAMOUNT','Limit Amount'),f('INTERESTRATE','Interest Rate'),amount('INTEREST_AMOUNT','Interest Amount'),amount('OD_INTEREST_AMOUNT','OD Interest Amount')],
    keys:`SELECT b.accountcode FROM cmpl.bankinterestreport b WHERE ${range('b.fordate')}`,
    sql:s=>`SELECT b.accountcode AS anchor,'Interest '||TO_CHAR(b.fordate,'DD-MM-YYYY') AS doc_no,${day('b.fordate')} AS doc_date,${day('b.fromdate')} AS from_date,${day('b.todate')} AS to_date,b.balance AS interest_balance,b.limitamount,b.interestrate,b.interestamount AS interest_amount,b.odinterestamount AS od_interest_amount FROM cmpl.bankinterestreport b WHERE ${partyScoped('b.fordate','b.accountcode')(s)} ORDER BY b.fordate,b.tno,b.sno`},
   {key:'fd',title:'Fixed Deposit Register',role:'many',docLink:{chain:'fixed-deposit',keyField:'RECORD_TNO'},docLabel:'Fixed Deposit Nos',dateLabel:'Last Fixed Deposit',sums:[amount('DEPOSIT_AMOUNT','FDs Placed'),amount('MATURITY_AMOUNT','FD Maturity Value')],
    fields:[f('CERTIFICATE_NO','Certificate No'),amount('DEPOSIT_AMOUNT','Deposit Amount'),f('INTEREST_RATE','Interest Rate'),date('MATURITY_DATE','Maturity Date'),amount('MATURITY_AMOUNT','Maturity Amount')],
    keys:`SELECT a.fixeddepositaccountcode FROM cmpl.fixeddeposit a WHERE ${range('a.fixeddepositdate')}`,
    sql:s=>`SELECT a.fixeddepositaccountcode AS anchor,a.fixeddepositno AS doc_no,TO_CHAR(a.tno) AS record_tno,${day('a.fixeddepositdate')} AS doc_date,a.fixeddepositcertificateno AS certificate_no,a.fixeddepositamount AS deposit_amount,a.interestrate AS interest_rate,${day('a.maturitydate')} AS maturity_date,a.maturityamount AS maturity_amount FROM cmpl.fixeddeposit a WHERE ${partyScoped('a.fixeddepositdate','a.fixeddepositaccountcode')(s)} ORDER BY a.fixeddepositdate,a.tno`},
   {key:'bg',title:'Bank Guaranty Report',role:'many',docLink:{chain:'bank-guarantee',keyField:'RECORD_TNO'},docLabel:'BG Register Nos',dateLabel:'Last BG Issued',sums:[amount('AMOUNT','BGs Issued'),amount('BALANCE','Recorded BG Balance')],
    fields:[f('BGNO','Bank Guarantee No'),f('BENEFICIARYNAME','Beneficiary'),date('EXPIRY_DATE','Expiry Date'),amount('AMOUNT','Guarantee Amount'),amount('BALANCE','BG Balance')],
    keys:`SELECT a.issueingbankcode FROM cmpl.bankgauranty a WHERE ${range('a.bankgaurantydate')}`,
    sql:s=>`SELECT a.issueingbankcode AS anchor,a.bankgaurantyno AS doc_no,TO_CHAR(a.tno) AS record_tno,${day('a.bankgaurantydate')} AS doc_date,a.bgno,a.beneficiaryname,${day('a.expirydate')} AS expiry_date,a.bankgaurantyamount AS amount,a.bgbalance AS balance FROM cmpl.bankgauranty a WHERE ${partyScoped('a.bankgaurantydate','a.issueingbankcode')(s)} ORDER BY a.bankgaurantydate,a.tno`},
   {key:'loan',title:'Emi Details',role:'many',docLink:{chain:'loan-emi',keyField:'RECORD_TNO'},docLabel:'Loan Nos',dateLabel:'Last Loan',sums:[amount('LOAN_AMOUNT','Loans Taken'),amount('BALANCE_AMOUNT','Recorded Loan Balance')],
    fields:[amount('LOAN_AMOUNT','Loan Amount'),f('ROI','Rate of Interest'),amount('EMI','EMI Amount'),f('NOOFEMI','Number of EMIs'),amount('BALANCE_AMOUNT','Recorded Balance')],
    keys:`SELECT a.partycode FROM cmpl.loan a WHERE ${range('a.loandate')}`,
    sql:s=>`SELECT a.partycode AS anchor,a.loanno AS doc_no,TO_CHAR(a.tno) AS record_tno,${day('a.loandate')} AS doc_date,a.loanamount AS loan_amount,a.roi,a.emi,a.noofemi,a.balanceamount AS balance_amount FROM cmpl.loan a WHERE ${partyScoped('a.loandate','a.partycode')(s)} ORDER BY a.loandate,a.tno`}
  ],
  derived:[
   {key:'NET_BANK_INTEREST',label:'Net Interest (Bank − OD)',type:'amount',needs:['interest'],value:(row,groups)=>sum(groups.interest||[],'INTEREST_AMOUNT')-sum(groups.interest||[],'OD_INTEREST_AMOUNT')}
  ]
 },
 'vehicle-cost':{
  title:'Vehicle Cost',
  description:'Vehicle → EMI schedule → Payment advice → Vehicle expenses, one row per vehicle / door no.',
  dateLabel:'EMI due date / expense date',
  keyed:true,rowLabel:'vehicle',
  steps:[
   {key:'vehicle',title:'Vehicle / Door No',role:'anchor',docLabel:'Vehicle / Door No',fields:[],
    sql:s=>s.key?'SELECT :anchor_key AS anchor,:anchor_key AS doc_no FROM dual':`SELECT k AS anchor,k AS doc_no FROM (${s.keys}) WHERE k IS NOT NULL GROUP BY k ORDER BY k`},
   {key:'emi',title:'EMI Schedule',role:'many',docLabel:'EMI Agreement Nos',dateLabel:'Last EMI Due',
    sums:[amount('TOTALEMI','EMI Due in Period'),amount('PRINCIPLEAMOUNT','EMI Principal'),amount('INTERESTAMOUNT','EMI Interest')],
    latest:[f('EQUIPMENTNO','Equipment No'),f('LEDGERNAME','Financier / Ledger'),f('CURRENTLOCATION','Current Location')],
    fields:[f('LEDGERNAME','Ledger'),f('EQUIPMENTNO','Equipment No'),amount('INSTALLMENTAMOUNT','Instalment Amount'),amount('PRINCIPLEAMOUNT','Principal'),amount('INTERESTAMOUNT','Interest'),amount('TOTALEMI','Total EMI'),f('EMISTATUS','EMI Status'),f('PAIDBYPAYMENTADVICENO','Payment Advice No'),f('CURRENTLOCATION','Current Location')],
    keys:`SELECT ${vehicle('e.doorno')} AS k FROM cmpl.emireport e WHERE ${range('e.duedate')}`,
    sql:s=>`SELECT ${vehicle('e.doorno')} AS anchor,e.agreementno AS doc_no,${day('e.duedate')} AS doc_date,e.ledgername,e.equipmentno,e.installmentamount,e.principleamount,e.interestamount,e.totalemi,e.emistatus,e.paidbypaymentadviceno,e.currentlocation FROM cmpl.emireport e WHERE ${partyScoped('e.duedate',vehicle('e.doorno'))(s)} ORDER BY e.duedate,e.agreementno`},
   {key:'payment',title:'Payment Advice Register',role:'many',requires:['emi'],docLabel:'Payment Advice Nos',dateLabel:'Last Payment Advice',sums:[amount('ADVICE_AMOUNT','Amount Advised')],
    fields:[amount('ADVICE_AMOUNT','Advice Amount'),f('PAYMENTDONE','Payment Done'),f('NARRATION','Narration')],
    sql:s=>`SELECT DISTINCT ${vehicle('e.doorno')} AS anchor,pa.paymentadviceno AS doc_no,${day('pa.paymentadvicedate')} AS doc_date,pa.amount AS advice_amount,pa.paymentdone,pa.narration FROM cmpl.emireport e JOIN cmpl.paymentadvice pa ON pa.paymentadviceno=e.paidbypaymentadviceno AND pa.companycode=e.companycode WHERE ${partyScoped('e.duedate',vehicle('e.doorno'))(s)} ORDER BY doc_date,doc_no`},
   {key:'expense',title:'Expense Vehiclewise',role:'many',docLabel:'Expense Document Nos',dateLabel:'Last Expense',sums:[amount('EXPENSE_AMOUNT','Vehicle Expenses')],
    fields:[f('MODULENAME','Module'),f('CATEGORIES','Category'),f('QUANTITY','Quantity'),amount('EXPENSE_AMOUNT','Amount')],
    keys:`SELECT ${vehicle('x.vehicleno')} AS k FROM cmpl.vehicleexpensetable x WHERE ${range('x.moduledate')}`,
    sql:s=>`SELECT ${vehicle('x.vehicleno')} AS anchor,x.moduleno AS doc_no,${day('x.moduledate')} AS doc_date,x.modulename,x.categories,x.quantity,x.amount AS expense_amount FROM cmpl.vehicleexpensetable x WHERE ${partyScoped('x.moduledate',vehicle('x.vehicleno'))(s)} ORDER BY x.moduledate,x.moduleno`}
  ],
  derived:[
   {key:'EMIS_WITHOUT_ADVICE',label:'Past-due EMIs without Payment Advice',type:'number',needs:['emi'],value:(row,groups)=>(groups.emi||[]).filter(item=>!item.PAIDBYPAYMENTADVICENO&&item.DOC_DATE&&item.DOC_DATE<today()).length},
   {key:'VEHICLE_TOTAL_COST',label:'EMI + Expenses in Period',type:'amount',needs:['emi','expense'],value:(row,groups)=>sum(groups.emi||[],'TOTALEMI')+sum(groups.expense||[],'EXPENSE_AMOUNT')}
  ]
 },
 // Drill-down only: opened from voucher numbers, not offered in the Report Merge picker.
 voucher:{
  title:'Voucher',drillOnly:true,
  description:'Voucher header, ledger lines and TDS deducted on it.',
  dateLabel:'Voucher date',
  steps:[
   {key:'voucher',title:'Voucher',role:'anchor',docLabel:'Voucher No',dateLabel:'Voucher Date',fields:[f('COMPANYCODE','Company Code'),f('LOCATION_NAME','Location'),f('DOCTYPE_NAME','Document Type'),f('NARRATION','Narration'),f('CREATOR','Created by (ERP login)'),f('CREATOR_NAME','Creator name'),f('CREATED_AT','Created date / time (ERP)'),f('MODULECODE','Source module'),f('MODULETNO','Source record')],
    sql:s=>`SELECT TO_CHAR(v.tno) AS anchor,v.voucherno AS doc_no,${day('v.voucherdate')} AS doc_date,v.companycode,l.locationname AS location_name,t.doctypename AS doctype_name,v.narration,v.creator,v.modulecode,v.moduletno,TO_CHAR(v.creationtime,'DD-MM-YYYY HH24:MI:SS') created_at,(SELECT MAX(COALESCE(e.employeename,u.bossusername)) FROM cmpl.bossuser u LEFT JOIN cmpl.employee e ON e.employeecode=u.employeecode WHERE u.bossusercode=v.creator) creator_name FROM cmpl.voucher v LEFT JOIN cmpl.location l ON l.locationcode=v.locationcode LEFT JOIN cmpl.doctype t ON t.doctypecode=v.doctypecode WHERE ${voucherScope(s)} ORDER BY v.voucherdate,v.tno`},
   {key:'lines',title:'Voucher Lines',role:'many',docLabel:'Ledger Lines',fields:[f('ACCOUNT_CODE','Account Code','text',{link:'party-position'}),f('ACCOUNT_NAME','Account'),amount('LINE_AMOUNT','Signed Amount'),f('LINE_NARRATION','Line Narration')],
    sql:s=>`SELECT TO_CHAR(d.tno) AS anchor,'Line '||TO_CHAR(d.sno)||' · '||NVL(p.partyname,d.accountcode) AS doc_no,d.accountcode AS account_code,p.partyname AS account_name,d.amount AS line_amount,d.narration AS line_narration FROM cmpl.voucherdetail d JOIN cmpl.voucher v ON v.tno=d.tno LEFT JOIN cmpl.party p ON p.partycode=d.accountcode WHERE ${voucherScope(s)} ORDER BY d.sno`},
   {key:'tds',title:'TDS on this Voucher',role:'many',docLabel:'TDS Sections',fields:[f('PARTYCODE','Party Code','text',{link:'party-position'}),f('PARTYNAME','Party'),amount('TDS_BASE','Deduction Base'),amount('TDSAMOUNT','TDS Amount')],
    sql:s=>`SELECT TO_CHAR(c.vouchertno) AS anchor,c.taxsectionname AS doc_no,${day('c.transactiondate')} AS doc_date,c.partycode,c.partyname,c.amount AS tds_base,c.tdsamount FROM cmpl.tdsdetail c JOIN cmpl.voucher v ON v.tno=c.vouchertno WHERE ${voucherScope(s)}${s.key?" AND c.vouchertno = TO_NUMBER(:anchor_key DEFAULT NULL ON CONVERSION ERROR)":""} ORDER BY c.tno`}
  ]
 }
};

for(const chain of Object.values(MERGE_CHAINS)){
 chain.anchor=chain.steps.find(step=>step.role==='anchor').key;
 chain.rowLabel||='main record';
 chain.defaults||=chain.steps.slice(0,MAX_MERGE_STEPS).map(step=>step.key);
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
 if(chain.keyed&&!scope.key){
  const children=chain.steps.filter(step=>steps.includes(step.key)&&step.keys);
  scope.keys=children.length?children.map(step=>step.keys).join(' UNION '):'SELECT NULL FROM dual WHERE 1=0';
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
 const visible=chain.keyed&&children.length?rows.filter(row=>children.some(step=>row[`${step.key}__COUNT`]>0)):rows;
 return {columns,rows:visible};
}

// Every report in the chain for one anchor, in process order, for drill-down.
export function buildTrail(chainKey,rowsByStep){
 const chain=mergeChain(chainKey);
 return chain.steps.map(step=>{
  const fields=[...(step.dateLabel&&step.role!=='lookup'?[{key:'DOC_DATE',label:step.role==='many'?'Date':step.dateLabel,type:'date'}]:[]),...step.fields];
  return {key:step.key,title:step.title,role:step.role,docLabel:step.docLabel,
   documents:(rowsByStep[step.key]||[]).map(row=>{
    const document={docNo:String(row.DOC_NO??''),docDate:row.DOC_DATE||'',details:fields.map(field=>({label:field.label,type:field.type,value:row[field.key]??'',...(field.link&&row[field.key]?{link:{chain:field.link,key:String(row[field.key])}}:{})})).filter(item=>item.value!=='')};
    if(step.docLink&&row[step.docLink.keyField])document.link={chain:step.docLink.chain,key:String(row[step.docLink.keyField])};
    return document;
   })};
 });
}
