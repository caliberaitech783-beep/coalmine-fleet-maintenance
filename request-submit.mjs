/**
 * Submit a maintenance request and propagate the server result/error.
 * The form must not close or report success until persistence completes.
 */
export async function submitMaintenanceRequest(onSubmit, request) {
  if (typeof onSubmit !== "function") {
    throw new Error("Could not save request: no save handler is available.");
  }
  return onSubmit(request);
}
