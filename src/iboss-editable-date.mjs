import React from 'react';
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
export function parseTypedDate(value){
 const text=String(value||'').trim();let year,month,day;
 const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
 const dmy=/^(\d{1,2})[-/ ](\d{1,2}|[a-z]{3})[-/ ](\d{2}|\d{4})$/i.exec(text);
 if(iso){[,year,month,day]=iso;}else if(dmy){day=dmy[1];month=/^\d+$/.test(dmy[2])?dmy[2]:months.indexOf(dmy[2].toLowerCase())+1;year=dmy[3].length===2?`20${dmy[3]}`:dmy[3];}else return '';
 year=Number(year);month=Number(month);day=Number(day);
 if(year<1900||year>9999||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return '';
 return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function typedDateDisplay(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('-'):value;}
export function typedDateRange(draft){
 const from=parseTypedDate(draft.from),to=parseTypedDate(draft.to);
 if(!from||!to)throw new Error('Enter valid dates, for example 01-04-2026 and 30-Sep-2026.');
 if(from>to)throw new Error('Activity from must be on or before the planning date.');
 return {from,to};
}
export default function EditableDateInput({value,onChange,label}){
 return React.createElement('span',{className:'iboss-editable-date'},
  React.createElement('input',{type:'text',value:typedDateDisplay(value),onChange,placeholder:'dd-mm-yyyy',maxLength:11,'aria-label':label,autoComplete:'off'}),
  React.createElement('input',{type:'date',value:parseTypedDate(value),onChange,'aria-label':`Choose ${label} from calendar`,className:'iboss-date-calendar',onClick:event=>{try{event.currentTarget.showPicker?.();}catch{}}})
 );
}
