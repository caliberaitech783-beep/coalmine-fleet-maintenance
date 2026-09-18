// Preview of the finished report before it is sent to the printer through the
// print helper. Shows the exact PDF that will be printed, with Print / Cancel.
// Styles: src/print-preview.css, imported by main.jsx so this module stays importable under node for tests.

const DUPLEX_LABELS={'one-sided':'Single-sided','long-edge':'Double-sided · long edge','short-edge':'Double-sided · short edge'};

/** One line describing the job: "A3 · Pages 1-3,5 · Double-sided · long edge · 2 copies · iR C3326". */
export function describePrintJob({page={},printOptions={},printer=''}={}){
  const copies=Math.max(1,Math.trunc(Number(printOptions.copies))||1);
  return [
    page.name||'',
    printOptions.pages?`Pages ${printOptions.pages}`:'All pages',
    DUPLEX_LABELS[printOptions.duplex]||DUPLEX_LABELS['one-sided'],
    `${copies} ${copies===1?'copy':'copies'}`,
    printer||'Default printer',
  ].filter(Boolean).join(' · ');
}

/**
 * Opens the preview and resolves true when the user clicks Print, false when they cancel or close it.
 * `pdf` is the Blob that will be printed; the same bytes are shown, so what you see is what prints.
 */
export function showPrintPreview({pdf,title,page,printOptions={},printer='',doc=globalThis.document,createUrl=(blob)=>URL.createObjectURL(blob),revokeUrl=(url)=>URL.revokeObjectURL(url),canShowPdf=globalThis.navigator?.pdfViewerEnabled!==false}){
  return new Promise((resolve)=>{
    const make=(tag,text,className)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
    const dialog=make('dialog',undefined,'print-preview-dialog');
    dialog.setAttribute('aria-label',`Print preview: ${title}`);
    const url=createUrl(pdf);
    let settled=false;
    const finish=(value)=>{
      if(settled)return;settled=true;
      try{dialog.close()}catch{/* already closed */}
      dialog.remove();
      try{revokeUrl(url)}catch{/* nothing to revoke */}
      resolve(value);
    };
    const header=make('header');
    const heading=make('div');heading.append(make('h2','Print preview'),make('p',title),make('small',describePrintJob({page,printOptions,printer})));
    const closeButton=make('button','×','print-preview-close');closeButton.type='button';closeButton.setAttribute('aria-label','Close preview');closeButton.onclick=()=>finish(false);
    header.append(heading,closeButton);
    const body=make('div',undefined,'print-preview-body');
    if(canShowPdf){
      const frame=make('iframe');frame.title=`Preview of ${title}`;frame.src=`${url}#toolbar=1&view=FitH`;
      body.append(frame);
    }else{
      const note=make('div',undefined,'print-preview-unavailable');
      note.append(make('b','This device cannot show PDF previews here.'),make('span',' The report will print exactly as the Print preview table in Smart Print shows it.'));
      const open=make('a','Open the PDF in a new tab');open.href=url;open.target='_blank';open.rel='noopener';
      note.append(open);body.append(note);
    }
    const footer=make('footer');
    const cancel=make('button','Cancel');cancel.type='button';cancel.onclick=()=>finish(false);
    const print=make('button','Print','primary');print.type='button';print.onclick=()=>finish(true);
    footer.append(make('span','Check the pages, then print or cancel. Nothing is sent to the printer until you click Print.'),cancel,print);
    dialog.append(header,body,footer);
    dialog.addEventListener('cancel',(event)=>{event.preventDefault?.();finish(false);});
    dialog.addEventListener('close',()=>finish(false));
    doc.body.appendChild(dialog);
    try{dialog.showModal()}catch{/* older browsers: shown as a block */}
    print.focus?.();
  });
}
