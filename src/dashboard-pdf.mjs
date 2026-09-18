// Capture the rendered dashboard, not a separate table of KPI values.
// A print keeps the screen's Day or Night palette and the clock row the dashboard sits under;
// a PDF download stays on the Day palette.
async function captureDashboard(dashboard, {forPrint = false} = {}) {
  if (!dashboard) throw new Error("Dashboard is not available. Please reopen it and try again.");
  const {toCanvas} = await import("html-to-image");
  await document.fonts.ready;
  const clone = dashboard.cloneNode(true);
  // Reports stay on the Day palette even when the screen is in Night mode.
  if (!forPrint) clone.classList.replace("mine-dashboard-night", "mine-dashboard-day");
  const background = forPrint ? pageBackground(dashboard) : "";
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;z-index:-1;";
  host.style.width = `${dashboard.getBoundingClientRect().width}px`;
  // A print starts with the row showing the live time and date, as the screen does.
  const clockRow = forPrint ? document.querySelector(".content > .top, .normal > header") : null;
  let root = clone;
  if (clockRow) {
    root = document.createElement("div");
    root.style.background = background;
    const rowClone = clockRow.cloneNode(true);
    rowClone.style.width = "100%";
    rowClone.style.margin = "0";
    root.append(rowClone, clone);
  }
  host.appendChild(root);
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
    root.querySelectorAll(".export-menu, .overlay, [role=dialog]").forEach(node => node.remove());
    // Expand internal scroll areas so all charts and rows are included.
    root.querySelectorAll("*").forEach(node => {
      const style = getComputedStyle(node);
      // The copy starts at the top of the page, where a sticky banner would slide down over the charts.
      if (style.position === "sticky") node.style.position = "static";
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
    const width = Math.ceil(Math.max(root.scrollWidth, root.getBoundingClientRect().width));
    const height = Math.ceil(root.scrollHeight);
    const canvas = await toCanvas(root, {width, height, pixelRatio: Math.min(2, Math.sqrt(24000000 / (width * height))), backgroundColor: background || getComputedStyle(clone).backgroundColor || "#ffffff"});
    return {canvas, background: background || "#ffffff"};
  } finally {
    host.remove();
  }
}

// The colour behind the dashboard on screen: the dark page in Night mode, the light page in Day mode.
function pageBackground(element) {
  for (let node = element; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(color)) return color;
  }
  return "#ffffff";
}

// jsPDF paints with #rrggbb; the canvas normalises any CSS colour to that form.
function hexColor(color) {
  const probe = document.createElement("canvas").getContext("2d");
  probe.fillStyle = "#ffffff";
  probe.fillStyle = color;
  return /^#[0-9a-f]{6}$/i.test(probe.fillStyle) ? probe.fillStyle : "#ffffff";
}

export async function downloadDashboardPdf(dashboard, filename) {
  const {canvas} = await captureDashboard(dashboard);
  const {jsPDF} = await import("jspdf");
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
}

export async function printDashboard(dashboard, title) {
  const {canvas, background} = await captureDashboard(dashboard, {forPrint: true});
  await printDashboardCanvas(canvas, title, background);
}

const MM_TO_PT = 72 / 25.4;
const PRINT_MARGIN_MM = 8;

/**
 * Where each printed page starts and ends, in canvas rows. A page ends on a blank band between
 * panels when one is in the lower half of the page, so a panel is not split over two sheets.
 */
export function dashboardPageSlices(totalHeight, pageHeight, isBlankRow = () => false, search = 0.5) {
  const size = Math.max(1, Math.floor(pageHeight)), slices = [];
  for (let top = 0; top < totalHeight;) {
    let bottom = Math.min(totalHeight, top + size);
    if (bottom < totalHeight) {
      const lowest = Math.max(top + 1, Math.ceil(bottom - size * search));
      for (let row = bottom; row >= lowest; row--) if (isBlankRow(row)) { bottom = row; break; }
    }
    slices.push({top, height: bottom - top});
    top = bottom;
  }
  return slices;
}

// A row is blank when every sampled pixel matches its first pixel: the gap between two panels.
function blankRowDetector(canvas) {
  const context = canvas.getContext("2d", {willReadFrequently: true});
  return (row) => {
    if (row <= 0 || row >= canvas.height) return false;
    const data = context.getImageData(0, row, canvas.width, 1).data;
    for (let i = 16; i < data.length; i += 16) {
      if (Math.abs(data[i] - data[0]) > 6 || Math.abs(data[i + 1] - data[1]) > 6 || Math.abs(data[i + 2] - data[2]) > 6) return false;
    }
    return true;
  };
}

/** The dashboard as it is on screen, on landscape pages of the paper chosen in Smart Print. */
export async function dashboardPrintPdf(dashboard, page = {widthMm: 297, heightMm: 210}) {
  const {canvas, background} = await captureDashboard(dashboard, {forPrint: true});
  const {jsPDF} = await import("jspdf");
  const paper = hexColor(background);
  const pageWidth = page.widthMm * MM_TO_PT, pageHeight = page.heightMm * MM_TO_PT, margin = PRINT_MARGIN_MM * MM_TO_PT;
  const printableWidth = pageWidth - margin * 2, printableHeight = pageHeight - margin * 2;
  const scale = printableWidth / canvas.width;
  const pdf = new jsPDF({unit: "pt", format: [pageWidth, pageHeight], orientation: "landscape", compress: true});
  dashboardPageSlices(canvas.height, printableHeight / scale, blankRowDetector(canvas)).forEach(({top, height}, index) => {
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = height;
    const context = part.getContext("2d", {alpha: false});
    context.fillStyle = paper;
    context.fillRect(0, 0, part.width, part.height);
    context.drawImage(canvas, 0, top, part.width, height, 0, 0, part.width, height);
    if (index) pdf.addPage([pageWidth, pageHeight], "landscape");
    // The whole sheet takes the page colour, so Night mode prints dark to the edge instead of on white.
    pdf.setFillColor(paper);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.addImage(part.toDataURL("image/jpeg", 0.98), "JPEG", margin, margin, printableWidth, height * scale);
  });
  return pdf.output("blob");
}

async function printDashboardCanvas(canvas, title, background = "#ffffff") {
  const frame = document.createElement("iframe");
  frame.title = "Dashboard print preview";
  frame.style.cssText = "position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0";
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.title = title;
    const style = doc.createElement("style");
    style.textContent = `@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0;background:${background};print-color-adjust:exact;-webkit-print-color-adjust:exact}section{break-after:page;page-break-after:always}section:last-child{break-after:auto;page-break-after:auto}img{display:block;width:100%;height:auto;print-color-adjust:exact;-webkit-print-color-adjust:exact}`;
    doc.head.appendChild(style);
    // A4 landscape printable area: 281 x 194 mm. Use a little spare height.
    const pagePixels = Math.floor(canvas.width * 192 / 281);
    const images = [];
    for (let top = 0; top < canvas.height; top += pagePixels) {
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = Math.min(pagePixels, canvas.height - top);
      const context = part.getContext("2d", {alpha:false});
      context.fillStyle = background;
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
