import {createTicketMailer} from './ticket-email.mjs';
import {ensureOemDeliveryDetails,safeOemError,safeOemRetry} from './oem-email-delivery-state.mjs';
import {oemEmailRecipients,oemEmailRows,buildOemEmailWithAttachments,OEM_TRIAL_CC} from './oem-breakdown-email.mjs';

export function registerOemEmailAdmin(app,{pool,requireSuper,requireAdministrator,loadData,scheduledJobsEnabled,mailerFactory=createTicketMailer}) {
  // Deliberately use full Admin guards, never the User Sessions read-only exception.
  app.get('/api/oem-email-deliveries',requireSuper,requireAdministrator,async(req,res,next)=>{
    try {
      const mailer=mailerFactory();
      const exists=await pool.query("SELECT to_regclass('oem_email_deliveries') AS name");
      let deliveries=[];
      if(exists.rows[0]?.name){
        await ensureOemDeliveryDetails(pool);
        deliveries=(await pool.query('SELECT day,recipient_key,email,oem,level,status,case_count,error,message_id,acknowledgement_status,attachments,retry_safe,last_attempt_at,sent_at,updated_at,attempts FROM oem_email_deliveries ORDER BY updated_at DESC LIMIT 500')).rows;
      }
      res.set('Cache-Control','no-store');
      res.json({deliveries,schedulerEnabled:scheduledJobsEnabled,configured:!!mailer.transporter,sender:mailer.config.user,
        schedule:'5:00 PM IST · L1 daily · L2 every 3 days · L3 every 7 days · L4 every 10 days',
        note:'Latest 500 attempts. No row can mean not due, no matching active cases, or a scheduler failure before sending. Configuration is not proof of successful authentication.'});
    }catch(error){next(error);}
  });
  app.post('/api/oem-email-deliveries/check',requireSuper,requireAdministrator,async(req,res,next)=>{
    try {
      const mailer=mailerFactory();
      if(!mailer.transporter)return res.status(400).json({error:'SMTP is not configured.'});
      await mailer.transporter.verify();
      res.json({message:'SMTP connection and authentication succeeded. No email was sent.'});
    }catch(error){res.status(502).json({error:safeOemError(error)});}
  });
  app.post('/api/oem-email-deliveries/retry',requireSuper,requireAdministrator,async(req,res,next)=>{
    const {day,recipientKey,reason}=req.body||{};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||typeof recipientKey!=='string'||recipientKey.length>150||!String(reason||'').trim()||String(reason).length>500)
      return res.status(400).json({error:'Select a failed delivery and provide a reason (up to 500 characters).'});
    let client,locked=false;
    try {
      client=await pool.connect();
      locked=(await client.query('SELECT pg_try_advisory_lock(71903541) AS locked')).rows[0].locked;
      if(!locked)return res.status(409).json({error:'Another OEM send is in progress. Try again after it finishes.'});
      await ensureOemDeliveryDetails(client);
      const row=(await client.query('SELECT * FROM oem_email_deliveries WHERE day=$1 AND recipient_key=$2',[day,recipientKey])).rows[0];
      if(!row||row.status!=='Failed / review required'||!row.retry_safe||row.message_id)
        return res.status(409).json({error:'Retry is blocked: this email may already have been accepted, or the failure needs manual review.'});
      const data=await loadData();
      const recipient=oemEmailRecipients(data.contacts).find(contact=>contact.recipientKey===recipientKey.split(':')[0]&&contact.email===row.email);
      if(!recipient)return res.status(409).json({error:'The OEM contact has changed or is no longer eligible. Review OEM Master.'});
      const rows=oemEmailRows({...data,recipient});
      if(!rows.length)return res.status(409).json({error:'No matching active OEM BD cases. No email sent.'});
      const mailer=mailerFactory();
      if(!mailer.transporter)return res.status(400).json({error:'SMTP is not configured.'});
      const audit={at:new Date().toISOString(),actor:req.session.login,reason:String(reason).trim(),previousStatus:row.status,previousError:row.error,previousMessageId:row.message_id};
      const claimed=await client.query(`UPDATE oem_email_deliveries SET status='Sending',retry_safe=FALSE,error=NULL,
        attempts=attempts||$3::jsonb,last_attempt_at=NOW(),updated_at=NOW(),case_count=$4
        WHERE day=$1 AND recipient_key=$2 AND retry_safe=TRUE AND status='Failed / review required' RETURNING day`,[day,recipientKey,JSON.stringify([audit]),rows.length]);
      if(!claimed.rowCount)return res.status(409).json({error:'This delivery has already been claimed.'});
      let sendStarted=false,report,result;
      try {
        report=await buildOemEmailWithAttachments({recipient,rows,shifts:data.shifts,now:new Date()});
        report.subject=`Retry — ${report.subject}`;
        await client.query('UPDATE oem_email_deliveries SET attachments=$3::jsonb WHERE day=$1 AND recipient_key=$2',[day,recipientKey,JSON.stringify(report.attachments.map(file=>({filename:file.filename,bytes:file.content.length})))]);
        sendStarted=true;
        result=await mailer.transporter.sendMail({from:`Nerve Center <${mailer.config.user}>`,to:recipient.email,...(row.trial_cc?{cc:OEM_TRIAL_CC.filter(email=>email!==recipient.email)}:{}),...report});
        if(!result.accepted?.some(email=>String(email).toLowerCase()===recipient.email))throw new Error('SMTP did not accept the OEM recipient; manual review required.');
      }catch(error){
        await client.query("UPDATE oem_email_deliveries SET status='Failed / review required',error=$3,retry_safe=$4,updated_at=NOW() WHERE day=$1 AND recipient_key=$2",[day,recipientKey,safeOemError(error),safeOemRetry(error,sendStarted)]);
        return res.status(502).json({error:safeOemError(error)});
      }
      await client.query("UPDATE oem_email_deliveries SET status='SMTP accepted',message_id=$3,sent_at=NOW(),updated_at=NOW() WHERE day=$1 AND recipient_key=$2",[day,recipientKey,result.messageId||'']);
      if(row.trial_cc){
        let acknowledgement='SMTP accepted';
        try {
          const ack=await mailer.transporter.sendMail({from:`Nerve Center <${mailer.config.user}>`,to:OEM_TRIAL_CC,subject:`Sending confirmation — ${report.subject}`,
            inReplyTo:result.messageId,references:result.messageId,attachments:report.attachments,
            text:`SMTP accepted the retry for ${recipient.email}. This is not proof of inbox delivery or reading.\nMessage ID: ${result.messageId||'Not provided'}\n\n${report.text}`});
          if(!OEM_TRIAL_CC.every(email=>ack.accepted?.includes(email)))throw new Error('Confirmation not accepted for all recipients.');
        }catch(error){acknowledgement=`Failed / review required: ${safeOemError(error)}`;}
        await client.query('UPDATE oem_email_deliveries SET acknowledgement_status=$3 WHERE day=$1 AND recipient_key=$2',[day,recipientKey,acknowledgement]);
      }
      res.json({message:'SMTP accepted the retry. This does not confirm inbox delivery or reading.'});
    }catch(error){next(error);}
    finally{if(locked)await client.query('SELECT pg_advisory_unlock(71903541)').catch(()=>{});client?.release();}
  });
}
