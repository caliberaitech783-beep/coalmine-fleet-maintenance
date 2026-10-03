import {canonicalSiteName} from './site-location.mjs';
import {REGION_DATA,userSiteSelection} from './region-scope.mjs';

export const TELEGRAM_SITES=REGION_DATA.flatMap(region=>region.sites);
export function telegramSiteName(value){
  const key=canonicalSiteName(value);
  return TELEGRAM_SITES.find(site=>canonicalSiteName(site)===key||canonicalSiteName(site).replace(/ 2nd$/,'')===key)||'';
}
export function telegramUserHasSite(user,site){
  const name=telegramSiteName(site);
  return Boolean(name&&userSiteSelection(user||{}).some(value=>telegramSiteName(value)===name));
}
export function normalizeTelegramSiteGroups(value){
  const groups=[];const usedSites=new Set();const usedChats=new Set();
  for(const item of Array.isArray(value)?value:[]){
    const site=telegramSiteName(item?.site),chatId=String(item?.chatId||'').trim();
    if(!site||!/^-[1-9]\d*$/.test(chatId)||usedSites.has(site)||usedChats.has(chatId))continue;
    usedSites.add(site);usedChats.add(chatId);
    groups.push({site,chatId,title:String(item.title||'').slice(0,160),inviteLink:String(item.inviteLink||'')});
  }
  return groups;
}
