import {withSerialColumn} from '../serial-column.mjs';

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
export function removePrintLayout(layouts,number) {
  const selectedNumber=Number(number);
  if(!Number.isInteger(selectedNumber)||selectedNumber<=0)throw new Error('Select a saved report layout to delete.');
  const remaining=layouts.filter(layout=>Number(layout.number)!==selectedNumber);
  if(remaining.length===layouts.length)throw new Error('The selected report layout no longer exists.');
  return remaining;
}
export function printLayoutStorageKey(account,options) {
  return `bdms:smart-print:v1:${JSON.stringify([account,options.map(option=>[option.id,option.label])])}`;
}

function validPrintLayouts(value) {
  return Array.isArray(value)?value
    .filter(item=>Number.isInteger(item.number)&&item.number>0&&Array.isArray(item.columns))
    .map(item=>({...item,name:String(item.name||`Layout ${item.number}`).trim()||`Layout ${item.number}`})):[];
}

// Landscape page sizes offered before printing or exporting a PDF.
export const PRINT_PAGE_SIZES=[
  {name:'A4',detail:'297 × 210 mm landscape',widthMm:297,heightMm:210},
  {name:'A3',detail:'420 × 297 mm landscape',widthMm:420,heightMm:297},
];
export const printPageSize=name=>PRINT_PAGE_SIZES.find(page=>page.name===String(name||'').trim().toUpperCase())||PRINT_PAGE_SIZES[0];
/** Shrinks a report that is wider than the page so every column fits; never enlarges it. */
export function printFitScale(contentWidth,availableWidth,minimum=.3) {
  if(!(contentWidth>0)||!(availableWidth>0)||contentWidth<=availableWidth)return 1;
  return Math.max(minimum,Math.floor((availableWidth/contentWidth)*1000)/1000);
}
// The app registers one exporter so every Smart Print dialog offers the same PDF / Excel downloads.
let smartPrintExporter;
export function setSmartPrintExporter(exporter) {smartPrintExporter=exporter;}

export function openSmartPrint({title,columns=[],rows=[],highlightRow,reportGrouping,onPrint,onExport=smartPrintExporter,formatCell=value=>String(value??'')}) {
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
  // Print and PDF export first ask for the page size; the report is then fitted to that page.
  const pagePrompt=make('div',undefined,'smart-print-page-prompt');
  const askPageSize=(action,run)=>{
    const panel=make('div',undefined,'smart-print-page-size');panel.setAttribute('role','group');panel.setAttribute('aria-label','Select page size');
    panel.append(make('h3',`Select page size to ${action}`),make('p','The report is scaled to the selected page so no columns are cut off.'));
    const choices=make('div');panel.append(choices);
    const dismiss=()=>pagePrompt.replaceChildren();
    const pageButtons=PRINT_PAGE_SIZES.map(page=>button(`${page.name} · ${page.detail}`,()=>{dismiss();run(page.name);},choices,'primary'));
    button('Back',dismiss,choices);
    pagePrompt.replaceChildren(panel);pageButtons[0].focus?.();
  };
  // A selected saved layout supplies both its columns and its report name to print and export alike.
  const currentReport=()=>{
    const layout=layouts.find(item=>String(item.number)===layoutSelect.value);
    return {reportTitle:layout?.name||title,chosen:selectedPrintColumns(options,layout?layout.columns:selected)};
  };
  const printSelection=()=>{
    if(!currentReport().chosen.length)return;
    askPageSize('print',pageSize=>{
      const {reportTitle,chosen}=currentReport();if(!chosen.length)return;
      close();onPrint({title:reportTitle,columns:chosen,rows,highlightRow,reportGrouping,pageSize});
    });
  };
  let exporting=false;
  const runExport=(format,pageSize)=>{
    const {reportTitle,chosen}=currentReport();if(!chosen.length||exporting)return;
    const formatName=format==='pdf'?'PDF':'Excel';
    exporting=true;render();notice.textContent=`Preparing ${formatName} export…`;
    Promise.resolve().then(()=>onExport({format,pageSize,title:reportTitle,columns:chosen,rows,highlightRow,reportGrouping}))
      .then(()=>{notice.textContent=`${formatName} export downloaded with ${chosen.length} column${chosen.length===1?'':'s'} and ${rows.length} record${rows.length===1?'':'s'}.`;})
      .catch(error=>{notice.textContent=error?.message||`Could not create the ${formatName} export.`;})
      .finally(()=>{exporting=false;render();});
  };
  const exportButtons=onExport?[
    button('Export PDF',()=>{if(currentReport().chosen.length)askPageSize('export as PDF',pageSize=>runExport('pdf',pageSize));},footer,'smart-print-export'),
    button('Export Excel',()=>runExport('xlsx'),footer,'smart-print-export'),
  ]:[];
  const printButton=button('Print current selection',printSelection,footer,'primary');
  const printSavedButton=button('Print saved layout',printSelection,controls,'smart-print-saved-print');
  const deleteSavedButton=button('Delete saved layout',()=>{
    try{
      const layout=layouts.find(item=>String(item.number)===layoutSelect.value);
      if(!layout)throw new Error('Select a saved report layout to delete.');
      if(!window.confirm(`Delete the saved report layout “${layout.name}”?`))return;
      const latest=validPrintLayouts(JSON.parse(storage.getItem(key)||'[]'));
      layouts=removePrintLayout(latest,layout.number);
      storage.setItem(key,JSON.stringify(layouts));
      updateLayouts();
      notice.textContent=`Deleted “${layout.name}”. Your current column selection is still available to print or save again.`;
      render();
    }catch(error){notice.textContent=error?.message||'Could not delete the saved report layout.';}
  },controls,'smart-print-saved-delete');
  const render=()=>{
    for(const {input,id} of checkboxes)input.checked=selected.includes(id);
    const chosen=selectedPrintColumns(options,selected);printButton.disabled=!chosen.length;
    const savedSelected=layouts.some(item=>String(item.number)===layoutSelect.value);
    printSavedButton.disabled=!savedSelected;
    deleteSavedButton.disabled=!savedSelected||Boolean(storageError);
    printButton.hidden=savedSelected;
    printButton.disabled=!chosen.length||exporting;printSavedButton.disabled=!savedSelected||exporting;
    for(const exportButton of exportButtons)exportButton.disabled=!chosen.length||exporting;
    count.textContent=`${chosen.length} of ${options.length} columns · ${rows.length} records`;
    preview.replaceChildren(make('h3','Print preview — first 5 records'));
    if(!chosen.length){preview.append(make('p','Select at least one column.'));return;}
    // Mirror the final output: report name, record count, the automatic Sr. No. column and highlighted rows.
    const previewRows=rows.slice(0,5);
    const serial=withSerialColumn(chosen.map(column=>({key:column.key,label:String(column.label||'')})),previewRows.map(row=>chosen.map(column=>formatCell(column.value?.(row)))));
    const sheet=make('div',undefined,'smart-print-sheet');
    sheet.append(make('h4',currentReport().reportTitle),make('p',`${rows.length.toLocaleString('en-IN')} record${rows.length===1?'':'s'} · the same columns, order and rows are used for Print, PDF and Excel`));
    const table=make('table'),thead=make('thead'),tr=make('tr');for(const column of serial.columns)tr.append(make('th',column.label));thead.append(tr);table.append(thead);
    const tbody=make('tbody');serial.rows.forEach((cells,index)=>{const line=make('tr',undefined,highlightRow?.(previewRows[index])?'highlight-row':'');for(const cell of cells)line.append(make('td',cell));tbody.append(line);});
    if(!serial.rows.length){const line=make('tr'),cell=make('td','No records available');cell.colSpan=serial.columns.length;line.append(cell);tbody.append(line);}
    table.append(tbody);sheet.append(table);preview.append(sheet);
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
  layoutSelect.onchange=()=>{const layout=layouts.find(item=>String(item.number)===layoutSelect.value);if(layout)selected=layout.columns.filter(id=>options.some(option=>option.id===id));render();};
  for(const option of options){const label=make('label'),input=make('input');input.type='checkbox';input.checked=true;input.onchange=()=>{selected=input.checked?[...selected,option.id]:selected.filter(id=>id!==option.id);layoutSelect.value='';render();};label.append(input,make('span',option.label));checks.append(label);checkboxes.push({input,id:option.id});}
  body.append(notice,checks,preview);dialog.append(pagePrompt);
  // Keep keyboard navigation in this native top-layer dialog, even when it was
  // launched from a modal with its own document-level focus trap.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(pagePrompt.childElementCount)pagePrompt.replaceChildren();else close();});
  document.body.append(dialog);render();dialog.showModal();
}
