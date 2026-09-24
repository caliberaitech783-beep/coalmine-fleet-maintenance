import {withSerialColumn} from '../serial-column.mjs';
import {DAILY_UPDATES_DETAIL_COLUMNS,prepareDailyUpdatesLayout} from './xlsx-daily-updates.mjs';

export function printColumnOptions(columns=[]) {
  const seen=new Map();
  return columns.map((column,index)=>{
    const base=String(column.key??column.label??index);
    const occurrence=seen.get(base)||0;seen.set(base,occurrence+1);
    return {id:JSON.stringify([base,occurrence]),label:String(column.label||`Column ${index+1}`),column};
  });
}
const jobReferenceOption=option=>/^job\s+ref(?:erence)?s?\.?$/i.test(String(option?.label||'').trim());
function normalizePrintColumnIds(options,ids) {
  const mandatory=options.filter(jobReferenceOption).map(option=>option.id);
  return [...mandatory,...ids.filter(id=>!mandatory.includes(id))];
}
export function selectedPrintColumns(options,ids) {
  const selected=new Set(normalizePrintColumnIds(options,ids));
  return [
    ...options.filter(option=>selected.has(option.id)&&jobReferenceOption(option)),
    ...options.filter(option=>selected.has(option.id)&&!jobReferenceOption(option)),
  ].map(option=>option.column);
}
const dailyUpdatesColumn=column=>column?.key==='dailyRemarks'||/daily\s+(?:updates?|remarks?)/i.test(String(column?.label||''));
/** Smart Print keeps one maintenance record to a normal row instead of putting its full update journal in one cell. */
export function compactDailyUpdatesForPrint(value){
  const lines=String(value??'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length||lines.every(line=>line==='—'))return '—';
  const latest=lines.at(-1);
  const dateTime=latest.match(/^#\d+\s*\|\s*([^|]+)/)?.[1]?.trim();
  return `${lines.length} update${lines.length===1?'':'s'}${dateTime?`\nLatest ${dateTime}`:''}`;
}
export function compactSmartPrintColumns(columns=[]){
  return columns.map(column=>dailyUpdatesColumn(column)?{...column,value:row=>compactDailyUpdatesForPrint(column.value?.(row))}:column);
}
const arrayColumns=columns=>columns.map((column,index)=>({...column,value:row=>row[index]}));
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

// Print options asked after the page size. They apply when the print helper sends the job itself;
// the browser print window, used as a fallback, has its own pages and sides settings.
export const PRINT_DUPLEX_OPTIONS=[
  {value:'one-sided',label:'Single-sided'},
  {value:'long-edge',label:'Double-sided · flip on the long edge (book)'},
  {value:'short-edge',label:'Double-sided · flip on the short edge (notepad)'},
];
export const PRINT_OPTIONS_STORAGE_KEY='bdms:smart-print:options';
export const DEFAULT_PRINT_OPTIONS=Object.freeze({pages:'',duplex:'one-sided',copies:1});
/** "1-3, 5 ,8" -> "1-3,5,8"; blank means all pages. Throws on anything else. */
export function normalizePageRanges(text){
  const value=String(text??'').replace(/\s+/g,'');
  if(!value)return '';
  if(!/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(value))throw new Error('Enter the pages to print like 1-3,5 or leave it blank for all pages.');
  const parts=value.split(',').map(part=>part.split('-').map(Number));
  if(parts.some(([from,to])=>from<1||(to!==undefined&&to<from)))throw new Error('Page numbers start at 1 and each range must go from a lower page to a higher one.');
  return parts.map(([from,to])=>to===undefined||to===from?String(from):`${from}-${to}`).join(',');
}
export function normalizePrintOptions(options={}){
  const duplex=PRINT_DUPLEX_OPTIONS.some(option=>option.value===options.duplex)?options.duplex:DEFAULT_PRINT_OPTIONS.duplex;
  const copies=Math.min(99,Math.max(1,Math.trunc(Number(options.copies))||1));
  const printer=String(options.printer||'').replace(/\s+/g,' ').trim().slice(0,200);
  return {pages:normalizePageRanges(options.pages),duplex,copies,...(printer?{printer}:{})};
}
// The app registers one printer source (the print helper's list); the dialog offers it when it answers.
let smartPrintPrinterSource=null;
export function setSmartPrintPrinterSource(source){smartPrintPrinterSource=source;}
/** Sides and copies are remembered on this PC; the page selection is always asked fresh. */
export function loadPrintOptions(storage=globalThis.window?.localStorage){
  try{const saved=JSON.parse(storage?.getItem(PRINT_OPTIONS_STORAGE_KEY)||'{}');return normalizePrintOptions({...saved,pages:''});}catch{return {...DEFAULT_PRINT_OPTIONS};}
}
export function savePrintOptions(options,storage=globalThis.window?.localStorage){
  try{storage?.setItem(PRINT_OPTIONS_STORAGE_KEY,JSON.stringify({duplex:options.duplex,copies:options.copies}));}catch{/* private mode */}
}
/** Shrinks a report that is wider than the page so every column fits; never enlarges it. */
export function printFitScale(contentWidth,availableWidth,minimum=.3) {
  if(!(contentWidth>0)||!(availableWidth>0)||contentWidth<=availableWidth)return 1;
  return Math.max(minimum,Math.floor((availableWidth/contentWidth)*1000)/1000);
}
// The app registers one exporter so every Smart Print dialog offers the same PDF / Excel downloads.
let smartPrintExporter;
export function setSmartPrintExporter(exporter) {smartPrintExporter=exporter;}

export function openSmartPrint({title,columns=[],rows=[],highlightRow,reportGrouping,onPrint,onExport=smartPrintExporter,onListPrinters=smartPrintPrinterSource,formatCell=value=>String(value??''),snapshot='',exportFormat='',exportOnly=false}) {
  const options=printColumnOptions(columns);
  let selected=normalizePrintColumnIds(options,options.map(option=>option.id)),layouts=[],storage,key;
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
  const exportName=exportFormat==='pdf'?'PDF':exportFormat==='xlsx'?'Excel':'';
  const dialog=document.createElement('dialog');dialog.className='smart-print-dialog';dialog.setAttribute('aria-label',exportOnly?'Smart Export':'Smart Print');
  const make=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  const button=(text,action,parent,className)=>{const node=make('button',text,className);node.type='button';node.onclick=action;parent.append(node);return node;};
  const close=()=>{dialog.close();dialog.remove();if(previousFocus?.isConnected)previousFocus.focus();};
  const header=make('header');
  const back=button('←',close,header);back.setAttribute('aria-label','Back');
  const heading=make('div');heading.append(make('h2',exportOnly?'Smart Export':'Smart Print'),make('p',title));header.append(heading);
  const closeButton=button('×',close,header);closeButton.setAttribute('aria-label','Close Smart Print');dialog.append(header);
  const body=make('div',undefined,'smart-print-body');dialog.append(body);
  // A snapshot (a dashboard) prints as it is on screen, so there are no columns to choose.
  body.append(make('p',snapshot||'Tick columns in the preview header. All columns are selected by default and the same selection is used for Smart Print, PDF and Excel.'));
  const controls=make('div',undefined,'smart-print-controls');body.append(controls);
  const layoutLabel=make('label','Saved report layouts');const layoutSelect=make('select');layoutLabel.append(layoutSelect);controls.append(layoutLabel);
  const notice=make('p',snapshot?'':storageError,'smart-print-notice');notice.setAttribute('role','status');
  const updateLayouts=(number='')=>{layoutSelect.replaceChildren();const placeholder=make('option','Custom selection');placeholder.value='';layoutSelect.append(placeholder);for(const layout of layouts){const option=make('option',layout.name||`Layout ${layout.number}`);option.value=String(layout.number);layoutSelect.append(option);}layoutSelect.value=String(number);};
  updateLayouts();
  const preview=make('div',undefined,'smart-print-preview');
  const footer=make('footer');dialog.append(footer);
  const count=make('span');footer.append(count);
  button('Cancel',close,footer);
  // Print first asks for the page size, and Export asks for the format, in one shared prompt.
  const pagePrompt=make('div',undefined,'smart-print-page-prompt');
  const askChoice=(heading,hint,label,options,run)=>{
    const panel=make('div',undefined,'smart-print-page-size');panel.setAttribute('role','group');panel.setAttribute('aria-label',label);
    panel.append(make('h3',heading),make('p',hint));
    const choices=make('div');panel.append(choices);
    const dismiss=()=>pagePrompt.replaceChildren();
    const optionButtons=options.map(option=>button(option.label,()=>{dismiss();run(option.value);},choices,'primary'));
    button('Back',dismiss,choices);
    pagePrompt.replaceChildren(panel);optionButtons[0].focus?.();
  };
  // A selected saved layout supplies both its columns and its report name to print and export alike.
  const currentReport=()=>{
    const layout=layouts.find(item=>String(item.number)===layoutSelect.value);
    return {reportTitle:layout?.name||title,chosen:selectedPrintColumns(options,layout?normalizePrintColumnIds(options,layout.columns):selected)};
  };
  const printableReport=()=>{
    const {reportTitle,chosen}=currentReport();
    const layout=prepareDailyUpdatesLayout({title:reportTitle,sheet:{name:'Report',title:reportTitle,columns:chosen,rows},formatCell});
    const appendices=layout.detailRows.length?[{
      title:`${reportTitle} · Daily Updates`,
      columns:arrayColumns(DAILY_UPDATES_DETAIL_COLUMNS),
      rows:layout.detailRows,
    }]:[];
    return {reportTitle,chosen:compactSmartPrintColumns(chosen),appendices};
  };
  // Second step after the page size: which pages, single or double-sided, and how many copies.
  const askPrintOptions=(pageSize,run)=>{
    const remembered=loadPrintOptions();
    const state={pages:'',pagesMode:'all',duplex:remembered.duplex,copies:remembered.copies,printer:''};
    const panel=make('div',undefined,'smart-print-page-size smart-print-options');panel.setAttribute('role','group');panel.setAttribute('aria-label','Print options');
    panel.append(make('h3',`Print options · ${pageSize}`),make('p','Choose the pages, the sides and the number of copies. These apply when the report goes straight to the printer.'));
    const field=(legend)=>{const box=make('fieldset');box.append(make('legend',legend));panel.append(box);return box;};
    const radio=(parent,name,value,label,checked,onPick)=>{
      const wrap=make('label',undefined,'smart-print-radio');const input=make('input');input.type='radio';input.name=name;input.value=value;input.checked=checked;input.onchange=()=>onPick(value);
      wrap.append(input,make('span',label));parent.append(wrap);return input;
    };
    // Printer: the helper's list when it answers; otherwise the print window chooses.
    const printerBox=field('Printer');
    const printerNote=make('p','Loading the printers on this PC…','smart-print-printer-note');
    printerBox.append(printerNote);
    let printerSelect=null,printerRequest=0;
    const showPrinters=(result)=>{
      if(!result||!Array.isArray(result.printers)||!result.printers.length){printerNote.textContent='The printer is chosen in the print window.';return;}
      printerSelect=make('select');printerSelect.setAttribute('aria-label','Printer');
      const preferred=result.printers.includes(result.remembered)?result.remembered:result.printers.includes(result.defaultPrinter)?result.defaultPrinter:result.printers[0];
      result.printers.forEach(name=>{const option=make('option',name===result.defaultPrinter?`${name} (default)`:name);option.value=name;if(name===preferred)option.selected=true;printerSelect.append(option);});
      printerSelect.value=preferred;state.printer=preferred;
      printerSelect.onchange=()=>{state.printer=printerSelect.value;};
      printerBox.replaceChildren(printerBox.children[0],printerSelect);
    };
    if(typeof onListPrinters==='function'){
      const request=++printerRequest;
      Promise.resolve().then(()=>onListPrinters()).then(result=>{if(request===printerRequest)showPrinters(result);}).catch(()=>showPrinters(null));
    }else showPrinters(null);
    const pagesBox=field('Pages');
    radio(pagesBox,'smart-print-pages','all','All pages',true,()=>{state.pagesMode='all';});
    radio(pagesBox,'smart-print-pages','custom','Only these pages',false,()=>{state.pagesMode='custom';pagesInput.focus?.();});
    const pagesInput=make('input');pagesInput.type='text';pagesInput.placeholder='e.g. 1-3,5';pagesInput.setAttribute('aria-label','Pages to print');
    pagesInput.oninput=()=>{state.pages=pagesInput.value;state.pagesMode='custom';customRadio.checked=true;};
    const customRadio=pagesBox.children[pagesBox.children.length-1].children[0];
    pagesBox.append(pagesInput);
    const sidesBox=field('Sides');
    PRINT_DUPLEX_OPTIONS.forEach(option=>radio(sidesBox,'smart-print-duplex',option.value,option.label,option.value===state.duplex,value=>{state.duplex=value;}));
    const copiesBox=field('Copies');
    const copiesInput=make('input');copiesInput.type='number';copiesInput.min='1';copiesInput.max='99';copiesInput.step='1';copiesInput.value=String(state.copies);copiesInput.setAttribute('aria-label','Copies');
    copiesInput.oninput=()=>{state.copies=copiesInput.value;};
    copiesBox.append(copiesInput);
    const error=make('p',undefined,'smart-print-options-error');panel.append(error);
    const actions=make('div');panel.append(actions);
    const dismiss=()=>pagePrompt.replaceChildren();
    button('Print now',()=>{
      let options;
      try{options=normalizePrintOptions({pages:state.pagesMode==='custom'?state.pages:'',duplex:state.duplex,copies:state.copies,printer:state.printer});}
      catch(problem){error.textContent=problem.message;return;}
      if(state.pagesMode==='custom'&&!options.pages){error.textContent='Enter the pages to print, or choose All pages.';return;}
      savePrintOptions(options);dismiss();run(options);
    },actions,'primary');
    button('Back',dismiss,actions);
    pagePrompt.replaceChildren(panel);
  };
  const printSelection=()=>{
    if(!snapshot&&!currentReport().chosen.length)return;
    askChoice('Select page size to print','The report is scaled to the selected page so no columns are cut off. With the print helper installed it goes straight to the printer on this paper size; otherwise, in the print window keep Paper size set to the same size.','Select page size',PRINT_PAGE_SIZES.map(page=>({label:`${page.name} · ${page.detail}`,value:page.name})),pageSize=>{
      askPrintOptions(pageSize,printOptions=>{
        const {reportTitle,chosen,appendices}=printableReport();if(!snapshot&&!chosen.length)return;
        close();onPrint({title:reportTitle,columns:chosen,rows,highlightRow,reportGrouping,appendices,pageSize,printOptions});
      });
    });
  };
  let exporting=false;
  const runExport=format=>{
    const report=format==='xlsx'?{...currentReport(),appendices:[]} : printableReport();
    const {reportTitle,chosen,appendices}=report;if(!chosen.length||exporting)return;
    const formatName=format==='pdf'?'PDF':'Excel';
    exporting=true;render();notice.textContent=`Preparing ${formatName} export…`;
    Promise.resolve().then(()=>onExport({format,title:reportTitle,columns:chosen,rows,highlightRow,reportGrouping,appendices}))
      .then(()=>{notice.textContent=`${formatName} export downloaded with ${chosen.length} column${chosen.length===1?'':'s'} and ${rows.length} record${rows.length===1?'':'s'}.`;})
      .catch(error=>{notice.textContent=error?.message||`Could not create the ${formatName} export.`;})
      .finally(()=>{exporting=false;render();});
  };
  // One Export button: choose PDF or Excel, then the file downloads straight away with the current selection.
  const exportButtons=onExport&&!snapshot&&!exportOnly?[button('Export',()=>{
    if(currentReport().chosen.length)askChoice('Export as PDF or Excel','The export uses the selected columns, their order and the same records as the preview.','Select export format',[{label:'PDF',value:'pdf'},{label:'Excel (.xlsx)',value:'xlsx'}],runExport);
  },footer,'smart-print-export')]:[];
  const directExportButton=exportOnly&&exportName?button(`Download ${exportName}`,()=>runExport(exportFormat),footer,'primary'):null;
  const printButton=exportOnly?null:button(snapshot?'Print as shown on screen':'Print current selection',printSelection,footer,'primary');
  const printSavedButton=exportOnly?null:button('Print saved layout',printSelection,controls,'smart-print-saved-print');
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
    if(snapshot){
      printButton.hidden=false;printButton.disabled=exporting;
      count.textContent='Printed exactly as shown on screen';
      preview.replaceChildren(make('h3','Print preview'),make('p','The finished pages are shown after you choose the paper and printer. Nothing prints until you click Print there.'));
      return;
    }
    const {chosen,appendices}=printableReport();if(printButton)printButton.disabled=!chosen.length;
    const savedSelected=layouts.some(item=>String(item.number)===layoutSelect.value);
    if(printSavedButton)printSavedButton.disabled=!savedSelected;
    deleteSavedButton.disabled=!savedSelected||Boolean(storageError);
    if(printButton){printButton.hidden=savedSelected;printButton.disabled=!chosen.length||exporting;}
    if(printSavedButton)printSavedButton.disabled=!savedSelected||exporting;
    if(directExportButton)directExportButton.disabled=!chosen.length||exporting;
    for(const exportButton of exportButtons)exportButton.disabled=!chosen.length||exporting;
    count.textContent=`${chosen.length} of ${options.length} columns · ${rows.length} records`;
    preview.replaceChildren(make('h3',exportOnly?`Export preview — first 5 records`:'Print preview — first 5 records'));
    if(!chosen.length){preview.append(make('p','Select at least one column.'));return;}
    // Header ticks stay visible for every available column, so an unchecked column can be selected again.
    const previewRows=rows.slice(0,5);
    const previewOptions=[
      ...options.filter(jobReferenceOption),
      ...options.filter(option=>!jobReferenceOption(option)),
    ];
    const previewColumns=compactSmartPrintColumns(previewOptions.map(option=>option.column));
    const serial=withSerialColumn(previewColumns.map(column=>({key:column.key,label:String(column.label||'')})),previewRows.map(row=>previewColumns.map(column=>formatCell(column.value?.(row)))));
    const sheet=make('div',undefined,'smart-print-sheet');
    sheet.append(make('h4',currentReport().reportTitle),make('p',`${rows.length.toLocaleString('en-IN')} record${rows.length===1?'':'s'} · complete update history prints in the Daily Updates section and exports to its Excel sheet`));
    const table=make('table'),thead=make('thead'),tr=make('tr');
    const serialAlreadyPresent=serial.columns.length===previewOptions.length;
    if(!serialAlreadyPresent)tr.append(make('th',serial.columns[0]?.label||'Sr. No.'));
    previewOptions.forEach((option)=>{
      const checked=selected.includes(option.id),header=make('th',undefined,checked?'':'smart-print-column-off'),label=make('label',undefined,'smart-print-header-check'),input=make('input');
      input.type='checkbox';input.checked=checked;if(jobReferenceOption(option)){input.disabled=true;label.title='Job reference is mandatory in every print layout.';}
      input.onchange=()=>{selected=normalizePrintColumnIds(options,input.checked?[...selected,option.id]:selected.filter(id=>id!==option.id));layoutSelect.value='';render();};
      label.append(input,make('span',option.label));header.append(label);tr.append(header);
    });
    thead.append(tr);table.append(thead);
    const tbody=make('tbody');serial.rows.forEach((cells,index)=>{
      const line=make('tr',undefined,highlightRow?.(previewRows[index])?'highlight-row':'');
      cells.forEach((cell,cellIndex)=>{
        const td=make('td',cell);
        const optionIndex=serialAlreadyPresent?cellIndex:cellIndex-1;
        if(optionIndex>=0&&!selected.includes(previewOptions[optionIndex]?.id))td.className='smart-print-column-off';
        line.append(td);
      });
      tbody.append(line);
    });
    if(!serial.rows.length){const line=make('tr'),cell=make('td','No records available');cell.colSpan=serial.columns.length;line.append(cell);tbody.append(line);}
    table.append(tbody);sheet.append(table);preview.append(sheet);
    for(const appendix of appendices){
      const detail=make('div',undefined,'smart-print-sheet smart-print-appendix');
      detail.append(make('h4',appendix.title),make('p',`Showing the first ${Math.min(10,appendix.rows.length)} of ${appendix.rows.length.toLocaleString('en-IN')} update rows · every update is included in the printed report`));
      const detailTable=make('table'),detailHead=make('thead'),detailHeadRow=make('tr');
      for(const column of appendix.columns)detailHeadRow.append(make('th',column.label));
      detailHead.append(detailHeadRow);detailTable.append(detailHead);
      const detailBody=make('tbody');
      appendix.rows.slice(0,10).forEach((row)=>{const line=make('tr');for(const column of appendix.columns)line.append(make('td',formatCell(column.value?.(row))));detailBody.append(line);});
      detailTable.append(detailBody);detail.append(detailTable);preview.append(detail);
    }
  };
  button('Select all',()=>{selected=normalizePrintColumnIds(options,options.map(option=>option.id));layoutSelect.value='';render();},controls);
  button('Clear selection',()=>{selected=normalizePrintColumnIds(options,[]);layoutSelect.value='';render();},controls);
  const save=button('Save as new layout',()=>{
    try{
      const suggestedName=`${title} layout ${Math.max(0,...layouts.map(layout=>Number(layout.number)||0))+1}`;
      const requestedName=window.prompt('Enter a name for this report layout:',suggestedName);
      if(requestedName===null)return;
      const latest=validPrintLayouts(JSON.parse(storage.getItem(key)||'[]'));
      const layout=nextPrintLayout(latest,normalizePrintColumnIds(options,selected),requestedName);
      storage.setItem(key,JSON.stringify([...latest,layout]));layouts=[...latest,layout];updateLayouts(layout.number);
      notice.textContent=`Saved as “${layout.name}”. Use Print saved layout to print it now.`;
      render();
    }catch(error){notice.textContent=error?.message||'Could not save the layout. Browser storage may be unavailable.';}
  },controls);save.disabled=Boolean(storageError);
  layoutSelect.onchange=()=>{const layout=layouts.find(item=>String(item.number)===layoutSelect.value);if(layout)selected=normalizePrintColumnIds(options,layout.columns.filter(id=>options.some(option=>option.id===id)));render();};
  body.append(notice,preview);dialog.append(pagePrompt);
  if(snapshot)controls.hidden=true;
  // Keep keyboard navigation in this native top-layer dialog, even when it was
  // launched from a modal with its own document-level focus trap.
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(pagePrompt.childElementCount)pagePrompt.replaceChildren();else close();});
  document.body.append(dialog);render();dialog.showModal();
}
