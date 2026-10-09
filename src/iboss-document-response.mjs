export async function documentResponse(response){
 const text=await response.text();let body;
 try{body=JSON.parse(text);}catch{
  if(response.status===401)throw new Error('Your session has expired. Please sign in again.');
  if([502,503,504].includes(response.status))throw new Error('The document service did not respond in time or is temporarily unavailable. Please retry.');
  throw new Error('The server returned a page instead of document data. Please retry; if it continues, refresh the portal.');
 }
 if(!response.ok)throw new Error(body?.error||'Could not load the document. Please retry.');
 if(!body||!Array.isArray(body.steps))throw new Error('The document response was incomplete. Please retry.');
 return body;
}
