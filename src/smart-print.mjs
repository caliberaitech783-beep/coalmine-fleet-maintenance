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
export function normalizePrintLayoutName(value) {
  const name=String(value??'').replace(/\s+/g,' ').trim();
  if(!name)throw new Error('Enter a report name.');
  if(name.length>80)throw new Error('Report name must be 80 characters or fewer.');
  return name;
}
export function nextPrintLayout(layouts,ids,name) {
  if(!ids.length)throw new Error('Select at least one column.');
  const normalizedName=normalizePrintLayoutName(name);
  if(layouts.some(layout=>String(layout.name||'').trim().toLowerCase()===normalizedName.toLowerCase()))
    throw new Error('A saved layout with this report name already exists.');
  return {number:Math.max(0,...layouts.map(layout=>Number(layout.number)||0))+1,name:normalizedName,columns:[...new Set(ids)]};
}
export function printLayoutStorageKey(account,options) {
  return `bdms:smart-print:v1:${JSON.stringify([account,options.map(option=>[option.id,option.label])])}`;
}

function validPrintLayouts(value) {
  return Array.isArray(value)?value
    .filter(item=>Number.isInteger(item.number)&&item.number>0&&Array.isArray(item.columns))
    .map(item=>({...item,name:String(item.name||`Layout ${item.number}`).trim()||`Layout ${item.number}`})):[];
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
    layouts=validPrintLayouts(JSON.parse(storage.getItem(key)||'[]'));
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
  body.append(make('p','Choose the columns to print. Save the selection with a report name, then print it directly from Saved report layouts.'));
  const controls=make('div',undefined,'smart-print-controls');body.append(controls);
  const layoutLabel=make('label','Saved report layouts');const layoutSelect=make('select');layoutLabel.append(layoutSelect);controls.append(layoutLabel);
  const notice=make('p',storageError,'smart-print-notice');notice.setAttribute('role','status');
  const updateLayouts=(number='')=>{layoutSelect.replaceChildren();const placeholder=make('option','Custom selection');placeholder.value='';layoutSelect.append(placeholder);for(const layout of layouts){const option=make('option',layout.name||`Layout ${layout.number}`);option.value=String(layout.number);layoutSelect.append(option);}layoutSelect.value=String(number);};
  updateLayouts();
  const checks=make('div',undefined,'smart-print-columns');checks.setAttribute('role','group');checks.setAttribute('aria-label','Columns to print');
  const checkboxes=[];
  const preview=make('div',undefined,'smart-print-preview');
  const footer=make('footer');dialog.append(footer);
  const count=make('span');footer.append(count);
  button('Cancel',close,footer);
  const printSelection=(ids,reportTitle=title)=>{
    const chosen=selectedPrintColumns(options,ids);if(!chosen.length)return;
    close();onPrint({title:reportTitle,columns:chosen,rows,highlightRow});
  };
  const printButton=button('Print current selection',()=>{
    const chosen=selectedPrintColumns(options,selected);if(!chosen.length)return;
    close();onPrint({title,columns:chosen,rows,highlightRow});
  },footer,'primary');
  const printSavedButton=button('Print saved layout',()=>{
    const layout=layouts.find(item=>String(item.number)===layoutSelect.value);
    if(layout)printSelection(layout.columns,layout.name||title);
  },controls,'smart-print-saved-print');
  const render=()=>{
    for(const {input,id} of checkboxes)input.checked=selected.includes(id);
    const chosen=selectedPrintColumns(options,selected);printButton.disabled=!chosen.length;
    const savedSelected=layouts.some(item=>String(item.number)===layoutSelect.value);
    printSavedButton.disabled=!savedSelected;
    printButton.hidden=savedSelected;
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
      const suggestedName=`${title} layout ${Math.max(0,...layouts.map(layout=>Number(layout.number)||0))+1}`;
      const requestedName=window.prompt('Enter a name for this report layout:',suggestedName);
      if(requestedName===null)return;
      const latest=validPrintLayouts(JSON.parse(storage.getItem(key)||'[]'));
      const layout=nextPrintLayout(latest,selected,requestedName);
      storage.setItem(key,JSON.stringify([...latest,layout]));layouts=[...latest,layout];updateLayouts(layout.number);
      notice.textContent=`Saved as “${layout.name}”. Use Print saved layout to print it now.`;
      render();
    }catch(error){notice.textContent=error?.message||'Could not save the layout. Browser storage may be unavailable.';}
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
