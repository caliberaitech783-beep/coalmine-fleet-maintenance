export function closeResponsibilityError(request, status, idle = false) {
  if ((status === 'Closed' || idle) && !['OEM', 'NON OEM'].includes(request.oemResponsibility)) {
    return `Select and save OEM or NON OEM in Edit request before closing ${request.ref || 'this request'}.`;
  }
  return '';
}
