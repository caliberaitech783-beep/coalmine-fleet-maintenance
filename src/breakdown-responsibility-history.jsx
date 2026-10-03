import React from 'react';


export function responsibilityHistoryText(request, formatDate = value => value) {
  const history = request.oemResponsibilityHistory || [];
  return history.length ? history.map(entry => `${entry.from || 'Not assigned'} → ${entry.to} · ${entry.changedBy || entry.login} · ${formatDate(entry.changedAt)}`).join('\n')
    : request.oemResponsibility ? `${request.oemResponsibility} · No recorded changes` : 'Not assigned';
}

export default function BreakdownResponsibilityHistory({request, formatDate}) {
  return <div className="responsibility-history-cell" style={{whiteSpace:'pre-wrap', overflowWrap:'anywhere'}}>{responsibilityHistoryText(request, formatDate)}</div>;
}
