// Print a separate copy so the dashboard and its scroll state remain untouched.
export function printRequestTimeline(content, title, css) {
  const frame = document.createElement('iframe');
  frame.title = 'Time breakdown print';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1120px;height:800px;border:0';
  document.body.append(frame);
  const printDocument = frame.contentDocument;
  printDocument.title = title;
  const style = printDocument.createElement('style');
  style.textContent = `${css}
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: white; color: #60718b; font: 12px Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1 { font-size: 18px; margin: 0 0 18px; }
    .request-timeline-content { padding: 0; overflow: visible; }
    .request-timeline-stages, .request-timeline-events { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .request-timeline-stages article, .request-timeline-events article, .request-timeline-updates li { break-inside: avoid; }
    button { display: none; }
  `;
  printDocument.head.append(style);
  const heading = printDocument.createElement('h1');
  heading.textContent = title;
  const copy = content.cloneNode(true);
  // Include all timeline details, even sections collapsed in the on-screen view.
  copy.querySelectorAll('details').forEach(detail => { detail.open = true; });
  printDocument.body.append(heading, copy);
  frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true });
  frame.contentWindow.requestAnimationFrame(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  });
}
