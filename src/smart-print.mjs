export function printColumnOptions(columns=[]) {
  const seen=new Map();
  return columns.map((column,index)=>{
    const base=String(column.key??column.label??index);
    const occurrence=seen.get(base)||0;seen.set(base,occurrence+1);
    return {id:JSON.stringify([base,occurrence]),label:String(column.label||`Column ${index+1}`),column};
  });
}
export function selectedPrintColumns(options,ids) {
  const selected=new Set(ids);
  return options.filter(option=>selected.has(option.id)).map(option=>option.column);
}
export function nextPrintLayout(layouts,ids) {
  if(!ids.length)throw new Error('Select at least one column.');
  return {number:Math.max(0,...layouts.map(layout=>Number(layout.number)||0))+1,columns:[...new Set(ids)]};
}
export function printLayoutStorageKey(account,options) {
  return `bdms:smart-print:v1:${JSON.stringify([account,options.map(option=>[option.id,option.label])])}`;
}

export function openSmartPrint({title,columns=[],rows=[],highlightRow,onPrint,formatCell=value=>String(value??'')}) {
  const options=printColumnOptions(columns);
  let selected=options.map(option=>option.id),layouts=[],storage,key;
  let storageError='';
  try{
    storage=window.localStorage;
    const session=JSON.parse(storage.getItem('nerveCenterSession')||window.sessionStorage.getItem('nerveCenterSession')||'null');
    const account=session?.login||session?.name;
    if(!account)throw new Error('Sign in again to save print layouts.');
    key=printLayoutStorageKey(account,options);
    const saved=JSON.parse(storage.getItem(key)||'[]');
    layouts=Array.isArray(saved)?saved.filter(item=>Number.isInteger(item.number)&&item.number>0&&Array.isArray(item.columns)):[];
  }catch{storageError='Layouts cannot be saved in this browser right now. You can still customize and print.';}
  const previousFocus=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='smart-print-dialog';dialog.setAttribute('aria-label','Smart Print');
  const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,parent,className)=>{const node=make('button',text,className);node.type='button';node.onclick=action;parent.append(node);return node;};
  const close=()=>{dialog.close();dialog.remove();if(previousFocus?.isConnected)previousFocus.focus();};
  const header=make('header');
  const back=button('←',close,header);back.setAttribute('aria-label','Back');
  const heading=make('div');heading.append(make('h2','Smart Print'),make('p',title));header.append(heading);
  const closeButton=button('×',close,header);closeButton.setAttribute('aria-label','Close Smart Print');dialog.append(header);
  const body=make('div',undefined,'smart-print-body');dialog.append(body);
  body.append(make('p','Choose the columns to print. Saved layouts are numbered and available for your account in this browser for this column set.'));
  const controls=make('div',undefined,'smart-print-controls');body.append(controls);
  const layoutLabel=make('label','Saved layout');const layoutSelect=make('select');layoutLabel.append(layoutSelect);controls.append(layoutLabel);
  const notice=make('p',storageError,'smart-print-notice');notice.setAttribute('role','status');
  const updateLayouts=(number='')=>{layoutSelect.replaceChildren();const placeholder=make('option','Custom selection');placeholder.value='';layoutSelect.append(placeholder);for(const layout of layouts){const option=make('option',`Layout ${layout.number}`);option.value=String(layout.number);layoutSelect.append(option);}layoutSelect.value=String(number);};
  updateLayouts();
  const checks=make('div',undefined,'smart-print-columns');checks.setAttribute('role','group');checks.setAttribute('aria-label','Columns to print');
  const checkboxes=[];
  const preview=make('div',undefined,'smart-print-preview');
  const footer=make('footer');dialog.append(footer);
  const count=make('span');footer.append(count);
  button('Cancel',close,footer);
  const printButton=button('Print selected columns',()=>{
    const chosen=selectedPrintColumns(options,selected);if(!chosen.length)return;
    close();onPrint({title,columns:chosen,rows,highlightRow});
  },footer,'primary');
  const render=()=>{
    for(const {input,id} of checkboxes)input.checked=selected.includes(id);
    const chosen=selectedPrintColumns(options,selected);printButton.disabled=!chosen.length;
    count.textContent=`${chosen.length} of ${options.length} columns · ${rows.length} records`;
    preview.replaceChildren(make('h3','Print preview — first 5 records'));
    if(!chosen.length){preview.append(make('p','Select at least one column.'));return;}
    const table=make('table'),thead=make('thead'),tr=make('tr');for(const column of chosen)tr.append(make('th',String(column.label||'')));thead.append(tr);table.append(thead);
    const tbody=make('tbody');for(const row of rows.slice(0,5)){const line=make('tr');for(const column of chosen)line.append(make('td',formatCell(column.value?.(row))));tbody.append(line);}table.append(tbody);preview.append(table);
  };
  button('Select all',()=>{selected=options.map(option=>option.id);layoutSelect.value='';render();},controls);
  button('Clear selection',()=>{selected=[];layoutSelect.value='';render();},controls);
  const save=button('Save as new layout',()=>{
    try{
      const current=JSON.parse(storage.getItem(key)||'[]');
      const latest=Array.isArray(current)?current.filter(item=>Number.isInteger(item.number)&&item.number>0&&Array.isArray(item.columns)):[];
      const layout=nextPrintLayout(latest,selected);
      storage.setItem(key,JSON.stringify([...latest,layout]));layouts=[...latest,layout];updateLayouts(layout.number);
      notice.textContent=`Saved as Layout ${layout.number}.`;
    }catch(error){notice.textContent=selected.length?'Could not save the layout. Browser storage may be unavailable.':error.message;}
  },controls);save.disabled=Boolean(storageError);
  layoutSelect.onchange=()=>{const layout=layouts.find(item=>String(item.number)===layoutSelect.value);if(layout){selected=layout.columns.filter(id=>options.some(option=>option.id===id));render();}};
  for(const option of options){const label=make('label'),input=make('input');input.type='checkbox';input.checked=true;input.onchange=()=>{selected=input.checked?[...selected,option.id]:selected.filter(id=>id!==option.id);layoutSelect.value='';render();};label.append(input,make('span',option.label));checks.append(label);checkboxes.push({input,id:option.id});}
  body.append(notice,checks,preview);
  // Keep keyboard navigation in this native top-layer dialog, even when it was
  // launched from a modal with its own document-level focus trap.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  document.body.append(dialog);render();dialog.showModal();
}
