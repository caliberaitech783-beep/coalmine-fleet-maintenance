// One loader per view/date/account. Failed later batches preserve loaded records.
export function createAccountPageLoader({url,token,onChange,fetchImpl=fetch}){
 const controller=new AbortController();let busy=false,disposed=false;
 let state={rows:[],loading:false,loadingMore:false,error:'',page:-1,hasMore:true,totalCount:null,countLoading:false,countError:''};
 const publish=patch=>{state={...state,...patch};if(!disposed)onChange(state);};
 async function loadCount(){
  if(disposed)return;publish({countLoading:true,countError:''});
  const [path,query='']=url.split('?');
  try{const response=await fetchImpl(path+'/count?'+query,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
   if(!response.headers.get('content-type')?.includes('application/json'))throw new Error('Total count unavailable');
   const body=await response.json();if(!response.ok||!Number.isSafeInteger(body.totalCount)||body.totalCount<0)throw new Error(body.error||'Total count unavailable');
   if(!disposed)publish({totalCount:body.totalCount,countLoading:false});
  }catch(error){if(!disposed)publish({countLoading:false,countError:'Total count unavailable — refresh to retry.'});}
 }
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
 return {loadMore,loadCount,dispose(){disposed=true;controller.abort();}};
}
