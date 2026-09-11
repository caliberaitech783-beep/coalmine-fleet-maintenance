// Capture the rendered dashboard, not a separate table of KPI values.
export async function downloadDashboardPdf(dashboard, filename, print = false) {
  if (!dashboard) throw new Error("Dashboard is not available. Please reopen it and try again.");
  const [{toCanvas}, {jsPDF}] = await Promise.all([import("html-to-image"), import("jspdf")]);
  await document.fonts.ready;
  const clone = dashboard.cloneNode(true);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1;";
  host.style.width = `${dashboard.getBoundingClientRect().width}px`;
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    clone.style.margin = "0";
    clone.style.width = "100%";
    clone.style.height = "auto";
    clone.style.maxHeight = "none";
    clone.style.overflow = "visible";
    const originals = dashboard.querySelectorAll("input, select, textarea");
    clone.querySelectorAll("input, select, textarea").forEach((control, index) => {
      control.value = originals[index].value;
      if (control.tagName === "SELECT") Array.from(control.options).forEach(option => option.selected = option.value === control.value);
      else control.setAttribute("value", control.value);
    });
    clone.querySelectorAll(".export-menu, .overlay, [role=dialog]").forEach(node => node.remove());
    // Expand internal scroll areas so all charts and rows are included.
    clone.querySelectorAll("*").forEach(node => {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
        node.style.maxHeight = "none";
        node.style.height = `${node.scrollHeight}px`;
        node.style.overflowY = "visible";
      }
      if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth) {
        node.style.width = `${node.scrollWidth}px`;
        node.style.maxWidth = "none";
        node.style.overflowX = "visible";
      }
    });
    const width = Math.ceil(Math.max(clone.scrollWidth, clone.getBoundingClientRect().width));
    const height = Math.ceil(clone.scrollHeight);
    const canvas = await toCanvas(clone, {width, height, pixelRatio: Math.min(2, Math.sqrt(24000000 / (width * height))), backgroundColor: getComputedStyle(clone).backgroundColor || "#ffffff"});
    if (print) {
      await printDashboardCanvas(canvas, filename);
      return;
    }
    const pageWidth = 1100;
    const scale = pageWidth / canvas.width;
    const sliceHeight = Math.min(canvas.height, Math.floor(14000 / scale));
    let pdf;
    for (let top = 0; top < canvas.height; top += sliceHeight) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(sliceHeight, canvas.height - top);
      const context = part.getContext("2d", {alpha: false});
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, part.width, part.height);
      context.drawImage(canvas, 0, top, part.width, part.height, 0, 0, part.width, part.height);
      const pageHeight = part.height * scale;
      const orientation = pageWidth > pageHeight ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({unit: "pt", format: [pageWidth, pageHeight], orientation, compress: true});
      else pdf.addPage([pageWidth, pageHeight], orientation);
      // Explicit browser JPEG encoding avoids PNG predictor/alpha corruption in PDF viewers.
      pdf.addImage(part.toDataURL("image/jpeg", 0.98), "JPEG", 0, 0, pageWidth, pageHeight);
    }
    pdf.save(filename);
  } finally {
    host.remove();
  }
}

export function printDashboard(dashboard, title) {
  return downloadDashboardPdf(dashboard, title, true);
}

async function printDashboardCanvas(canvas, title) {
  const frame = document.createElement("iframe");
  frame.title = "Dashboard print preview";
  frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.title = title;
    const style = doc.createElement("style");
    style.textContent = "@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0}section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}img{display:block;width:100%;height:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}";
    doc.head.appendChild(style);
    // A4 landscape printable area: 281 x 194 mm. Use a little spare height.
    const pagePixels = Math.floor(canvas.width * 192 / 281);
    const images = [];
    for (let top = 0; top < canvas.height; top += pagePixels) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(pagePixels, canvas.height - top);
      const context = part.getContext("2d", {alpha:false});
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, part.width, part.height);
      context.drawImage(canvas, 0, top, part.width, part.height, 0, 0, part.width, part.height);
      const page = doc.createElement("section");
      const image = doc.createElement("img");
      image.alt = `Dashboard page ${images.length + 1}`;
      image.src = part.toDataURL("image/jpeg", 0.98);
      page.appendChild(image);
      doc.body.appendChild(page);
      images.push(image);
    }
    await Promise.all(images.map(image => image.decode()));
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {once:true});
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 300000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
