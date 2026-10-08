export function chartMagnitude(value){return value==null||value===''||!Number.isFinite(Number(value))?null:Math.abs(Number(value));}
export function chartScale(values){return Math.max(1,...values.map(chartMagnitude).filter(value=>value!==null));}
export function adviceCompletion(rows=[]){
 const pending=rows.filter(row=>row.STATE==='Pending').reduce((sum,row)=>sum+Math.max(0,Number(row.RECORDS)||0),0);
 const completed=rows.filter(row=>row.STATE==='Completed').reduce((sum,row)=>sum+Math.max(0,Number(row.RECORDS)||0),0);
 return {pending,completed,total:pending+completed,percent:pending+completed?completed/(pending+completed)*100:null};
}
