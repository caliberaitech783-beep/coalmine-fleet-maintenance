// Verify inside isolated App Service, where its database resolves.
// No runtime credentials are read into the deployment runner.
try{
  const response=await fetch(`${process.env.STAGING_URL}/api/health/telegram-membership?deployment=${process.env.DEPLOY_SHA}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Readiness HTTP '+response.status);
  const result=await response.json();
  console.log(JSON.stringify(result));
  if(result.commit!==process.env.DEPLOY_SHA||result.ready!==true){
    console.error('Membership release stopped: register all eight site groups and grant the bot administrator and invitation permissions.');process.exitCode=1;
  }
}catch{
  console.error('Staging Telegram membership readiness could not be verified; production swap stopped.');process.exitCode=1;
}
