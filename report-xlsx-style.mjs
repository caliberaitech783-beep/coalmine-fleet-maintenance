// Native Excel report tables plus explicit banding for viewers that ignore table styles.
export const REPORT_XLSX_STYLES = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"4\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"14\"/><color rgb=\"FF10284C\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"10\"/><color rgb=\"FF000000\"/><name val=\"Calibri\"/></font><font><i/><sz val=\"10\"/><color rgb=\"FF65758B\"/><name val=\"Calibri\"/></font></fonts><fills count=\"5\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFF8CACA\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFFFFFFF\"/><bgColor indexed=\"64\"/></patternFill></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFF2F2F2\"/><bgColor indexed=\"64\"/></patternFill></fill></fills><borders count=\"2\"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style=\"thin\"><color rgb=\"FF000000\"/></left><right style=\"thin\"><color rgb=\"FF000000\"/></right><top style=\"thin\"><color rgb=\"FF000000\"/></top><bottom style=\"thin\"><color rgb=\"FF000000\"/></bottom><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"7\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"1\" applyBorder=\"1\" xfId=\"0\" applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"top\"/></xf><xf numFmtId=\"0\" fontId=\"0\" fillId=\"2\" borderId=\"1\" applyBorder=\"1\" xfId=\"0\" applyFill=\"1\" applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"top\"/></xf><xf numFmtId=\"0\" fontId=\"1\" fillId=\"0\" borderId=\"1\" applyBorder=\"1\" xfId=\"0\" applyFont=\"1\" applyAlignment=\"1\"><alignment vertical=\"center\"/></xf><xf numFmtId=\"0\" fontId=\"3\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/><xf numFmtId=\"0\" fontId=\"2\" fillId=\"3\" borderId=\"1\" applyBorder=\"1\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\" applyAlignment=\"1\"><alignment horizontal=\"center\" vertical=\"center\" wrapText=\"1\"/></xf><xf numFmtId=\"0\" fontId=\"0\" fillId=\"4\" borderId=\"1\" xfId=\"0\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"><alignment wrapText=\"1\" vertical=\"top\"/></xf></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles><tableStyles count=\"0\" defaultTableStyle=\"TableStyleLight15\" defaultPivotStyle=\"PivotStyleLight16\"/></styleSheet>";

export function styleReportSheets(sheets) {
  return sheets.map((sheet, index) => {
    const rows = [...sheet.content.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)];
    const header = rows.find(row => row[1] === '3');
    const labels = [...(header?.[2] || '').matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map(match => match[1]);
    const lastCell = [...(rows.at(-1)?.[2] || '').matchAll(/<c r="([^"]+)"/g)].at(-1)?.[1] || 'A3';
    const ref = 'A3:' + lastCell;
    const seen = new Set();
    const names = labels.map((label, i) => {
      const base = label || 'Column ' + (i + 1);
      let name = base;
      for(let n = 2; seen.has(name.toLowerCase()); n++) name = base + ' (' + n + ')';
      seen.add(name.toLowerCase());
      return name;
    });
    const content = sheet.content
      .replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
      .replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (_, number, attributes, cells) => {
        const row = Number(number);
        const style = row === 1 ? 3 : row === 2 ? 4 : row === 3 ? 5 : row % 2 === 0 ? 6 : 1;
        if (row === 3) {
          let heading = 0;
          cells = cells.replace(/(<t(?: [^>]*)?>)[\s\S]*?<\/t>/g, (_, opening) => opening + names[heading++] + '</t>');
        }
        return '<row r="' + number + '"' + attributes + '>' + cells.replace(/<c r="([^"]+)"/g, '<c r="$1" s="' + style + '"') + '</row>';
      })
      .replace('</worksheet>', '<tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>');
    return {...sheet, content, table: '<?xml version="1.0" encoding="UTF-8"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="' + (index+1) + '" name="ReportTable' + (index+1) + '" displayName="ReportTable' + (index+1) + '" ref="' + ref + '" totalsRowShown="0"><autoFilter ref="' + ref + '"/><tableColumns count="' + names.length + '">' + names.map((name, i) => '<tableColumn id="' + (i+1) + '" name="' + name.replace(/"/g, '&quot;') + '"/>').join('') + '</tableColumns><tableStyleInfo name="TableStyleLight15" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>'};
  });
}
