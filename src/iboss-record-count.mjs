export function recordCountLabel({totalCount,rows=[],countError},unit='records'){
 const loaded=rows.length.toLocaleString('en-IN');
 if(Number.isSafeInteger(totalCount)&&totalCount>=0)return `Total: ${totalCount.toLocaleString('en-IN')} ${unit} · ${loaded} loaded.`;
 return `${countError||'Counting total records…'} · ${loaded} ${unit} loaded.`;
}
