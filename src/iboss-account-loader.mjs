// One loader per view/date/account. Failed later batches preserve loaded records.
export function createAccountPageLoader({url,token,onChange,fetchImpl=fetch}){
 const controller=new AbortController();let busy=false,disposed=false;
 let state={rows:[],loading:false,loadingMore:false,error:'',page:-1,hasMore:true};
 const publish=patch=>{state={...state,...patch};if(!disposed)onChange(state);};
 async function loadMore(){
  if(disposed||busy||!state.hasMore)return;busy=true;
  const page=state.page+1;publish({loading:page===0,loadingMore:page>0,error:''});
  try{
   const response=await fetchImpl(`${url}&page=${page}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Accounts service did not return data. Please retry.');
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load Accounts data.');
   if(!Array.isArray(body.rows)||body.page!==page||typeof body.hasMore!=='boolean')throw new Error('Invalid Accounts page response. Please retry.');
   if(!disposed)publish({...body,rows:[...state.rows,...body.rows],loading:false,loadingMore:false,error:''});
  }catch(error){if(!disposed)publish({loading:false,loadingMore:false,error:error.message});}
  finally{busy=false;}
 }
 return {loadMore,dispose(){disposed=true;controller.abort();}};
}
