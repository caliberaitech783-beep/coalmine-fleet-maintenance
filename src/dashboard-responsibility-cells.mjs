import React from 'react';
import {tableElements, tableModel} from './table-actions-model.mjs';

export function withDashboardResponsibilityCells(children, requests) {
  const {sections, columns} = tableModel(children);
  if (columns.some(column => column.key === 'oemResponsibility')) return children;
  return sections.map(section => !['thead','tbody','tfoot'].includes(section.type) ? section :
    React.cloneElement(section, {}, tableElements(section.props.children).map(row => {
      const cells = tableElements(row.props.children);
      if (cells.length === 1 && cells[0].props.colSpan > 1) return React.cloneElement(row, {},
        React.cloneElement(cells[0], {colSpan: cells[0].props.colSpan + 1}));
      const request = requests.get(row.props['data-request-reference']);
      const value = request?.oemResponsibility || row.props['data-oem-responsibility'];
      const cell = section.type === 'thead'
        ? React.createElement('th', {key:'oemResponsibility', sortKey:'oemResponsibility'}, 'OEM / NON OEM')
        : React.createElement('td', {key:'oemResponsibility'}, ['OEM','NON OEM'].includes(value) ? value : 'Not selected');
      return React.cloneElement(row, {}, cell, cells);
    })));
}
