import {accountView,accountRecord} from './iboss-accounts.mjs';
import {purchaseOrderRange} from './purchase-order-report.mjs';
export const ACCOUNT_PAGE_SIZE=500;
export function accountPageNumber(value=0){
 if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>1000000){const error=new Error('Invalid Accounts page.');error.code='INVALID_ACCOUNT_PAGE';throw error;}
 return Number(value);
}
export function accountPageQuery(view,from,to,page=0){
 const definition=accountView(view),number=accountPageNumber(page),offset=number*ACCOUNT_PAGE_SIZE;
 const binds=definition.asOf?{to_date:purchaseOrderRange(to,to).to_date}:definition.dated?purchaseOrderRange(from,to):{};
 return {page:number,offset,binds:{...binds,bdms_page_start:offset,bdms_page_end:offset+ACCOUNT_PAGE_SIZE+1},sql:`SELECT * FROM (SELECT accounts_source.*,ROWNUM AS BDMS_PAGE_ROW FROM (${definition.sql}) accounts_source WHERE ROWNUM<=:bdms_page_end) WHERE BDMS_PAGE_ROW>:bdms_page_start ORDER BY BDMS_PAGE_ROW`};
}
export function accountPageResult(rows,page,checkedAt=new Date().toISOString()){
 const offset=accountPageNumber(page)*ACCOUNT_PAGE_SIZE;
 return {page:Number(page),pageSize:ACCOUNT_PAGE_SIZE,hasMore:rows.length>ACCOUNT_PAGE_SIZE,rows:rows.slice(0,ACCOUNT_PAGE_SIZE).map(({BDMS_PAGE_ROW,...row},i)=>accountRecord(row,offset+i)),checkedAt};
}
