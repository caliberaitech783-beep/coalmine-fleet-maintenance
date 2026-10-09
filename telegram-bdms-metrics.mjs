import {bdmsSiteCounts} from './telegram-bdms-site-counts.mjs';
import {equipmentSiteName} from './site-location.mjs';
const validDay=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
export function bdmsChatDateRange(text,today){
  if(!validDay(today))throw new Error('Invalid reporting day.');
  const input=String(text||'');
  if(/total bd today|आज के कुल/i.test(input))return {from:today,to:today};
  const days=input.match(/(?:last|पिछले)\s+(7|30)\s+(?:days|दिन)/i)?.[1];
  if(days){const date=new Date(today+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-Number(days)+1);return {from:date.toISOString().slice(0,10),to:today};}
  const match=input.match(/^\/bd\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
  if(match&&validDay(match[1])&&validDay(match[2])&&match[1]<=match[2]&&match[2]<=today)return {from:match[1],to:match[2]};
  return null;
}
export function bdmsChatMetricsReply({text,language='en',requests=[],fleetRecords=null,today}){
  const hi=language==='hi';
  if(/vehicle availability|on.?road|off.?road|वाहन उपलब्धता/i.test(text)){
    if(!Array.isArray(fleetRecords))return hi?'आपको फ्लीट डैशबोर्ड देखने की अनुमति नहीं है।':'Fleet dashboard data is not available for your permissions.';
    const count=status=>fleetRecords.filter(r=>r.dashboardRoadStatus===status).length;
    const vehicles=fleetRecords.filter(r=>['vehicle','vehicles'].includes(String(r.category||'').toLowerCase()));
    return `${hi?'वर्तमान फ्लीट उपलब्धता':'Current fleet availability'}\n${hi?'कुल वाहन और उपकरण':'Total vehicles and equipment'}: ${fleetRecords.length}\n${hi?'ऑन रोड':'On road'}: ${count('onroad')}\n${hi?'ऑफ रोड':'Off road'}: ${count('offroad')}\n${hi?'आइडल':'Idle'}: ${count('idle')}\n${hi?'स्थिति की पुष्टि बाकी':'Status unconfirmed'}: ${count('unknown')}\n\n${hi?'केवल वाहन':'Vehicles only'}: ${vehicles.length}\n${hi?'ऑन रोड':'On road'}: ${vehicles.filter(r=>r.dashboardRoadStatus==='onroad').length} · ${hi?'ऑफ रोड':'Off road'}: ${vehicles.filter(r=>r.dashboardRoadStatus==='offroad').length} · ${hi?'आइडल':'Idle'}: ${vehicles.filter(r=>r.dashboardRoadStatus==='idle').length}\n\n${bdmsSiteCounts(fleetRecords,[[hi?'कुल':'Total',()=>true],[hi?'ऑन रोड':'On road',r=>r.dashboardRoadStatus==='onroad'],[hi?'ऑफ रोड':'Off road',r=>r.dashboardRoadStatus==='offroad'],[hi?'आइडल':'Idle',r=>r.dashboardRoadStatus==='idle'],[hi?'अज्ञात':'Unknown',r=>r.dashboardRoadStatus==='unknown']],{language,siteFor:equipmentSiteName})}\n\n${hi?'वर्तमान स्थिति; तारीख के अनुसार ऐतिहासिक उपलब्धता नहीं। रनिंग बी डी वाहन ऑन रोड में शामिल हैं।':'Current snapshot, not historical availability for a date range. Running BD vehicles are included in On road.'}`;
  }
  const range=bdmsChatDateRange(text,today);
  if(!range)return hi?'तारीखें चुनें। उदाहरण: /bd 2026-10-01 2026-10-08\nसही तारीखें लिखें; अंतिम तारीख आज से आगे नहीं हो सकती।':'Choose dates. Example: /bd 2026-10-01 2026-10-08\nUse valid dates, with an end date no later than today.';
  const rows=requests.filter(r=>!r.archivedAt&&String(r.start||'').slice(0,10)>=range.from&&String(r.start||'').slice(0,10)<=range.to&&!r.vehicleIdle&&!['Idle','Ideal'].includes(r.status));
  const vehicles=new Set(rows.filter(r=>r.chassis||r.door||r.reg).map(r=>[r.site,String(r.chassis||r.door||r.reg).trim().toUpperCase()].join('|')));
  return `${hi?'अवधि में शुरू हुए ब्रेकडाउन':'Breakdowns started in period'}\n${range.from} → ${range.to} · IST\n${hi?'कुल अनुरोध':'Total requests'}: ${rows.length}\n${hi?'अलग वाहन पहचान':'Distinct vehicle identities'}: ${vehicles.size}\n${hi?'अभी खुले':'Currently open'}: ${rows.filter(r=>r.status!=='Closed').length}\n${hi?'अभी बंद':'Currently closed'}: ${rows.filter(r=>r.status==='Closed').length}\n${hi?'रनिंग बी डी':'Running BD'}: ${rows.filter(r=>r.status==='Running BD').length}\n\n${bdmsSiteCounts(rows,[[hi?'अनुरोध':'Requests',()=>true],[hi?'खुले':'Open',r=>r.status!=='Closed'],[hi?'बंद':'Closed',r=>r.status==='Closed'],[hi?'रनिंग बी डी':'Running BD',r=>r.status==='Running BD']],{language})}\n\n${hi?'गणना केवल आपकी अनुमति वाले अनुरोधों की है। आइडल प्रविष्टियाँ शामिल नहीं हैं।':'Counts cover your permitted requests only. Idle entries are excluded.'}`;
}
