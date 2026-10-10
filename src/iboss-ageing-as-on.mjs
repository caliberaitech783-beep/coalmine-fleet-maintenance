import {parseTypedDate} from './iboss-editable-date.mjs';
export function ageingAsOnRange(range,value){
 const to=parseTypedDate(value);
 if(!to)throw new Error('Enter a valid As on date, for example 30-Sep-2026.');
 const year=Number(to.slice(0,4))-(Number(to.slice(5,7))<4?1:0);
 return {...range,from:range.from<=to?range.from:`${year}-04-01`,to};
}
