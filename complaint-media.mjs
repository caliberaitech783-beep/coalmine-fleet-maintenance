export const COMPLAINT_MEDIA_LIMIT = 5 * 1024 * 1024;
export function validComplaintMedia(items) {
  if (!Array.isArray(items) || items.length > 2) return false;
  const kinds = new Set();
  return items.every(item => {
    if (!item || typeof item.name !== 'string' || item.name.length > 200 || typeof item.data !== 'string') return false;
    const match = item.data.match(/^data:(image\/(?:jpeg|png|webp)|video\/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length % 4 !== 0) return false;
    const kind = match[1].split('/')[0];
    if (kinds.has(kind)) return false;
    kinds.add(kind);
    const bytes = match[2].length * 3 / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
    return bytes > 0 && bytes <= COMPLAINT_MEDIA_LIMIT;
  });
}
export async function readComplaintMedia(form) {
  const items = [];
  for (const [field, kind] of [['complaintPhoto','image'],['complaintVideo','video']]) {
    const file = form.get(field);
    if (!file?.size) continue;
    if (file.size > COMPLAINT_MEDIA_LIMIT || !file.type.startsWith(kind + '/')) throw new Error('Choose a supported photo or video, maximum 5 MB each.');
    const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('Could not read attachment. Please select it again.')); reader.readAsDataURL(file); });
    items.push({name:file.name.slice(0,200),data});
  }
  if (!validComplaintMedia(items)) throw new Error('Supported formats: JPEG, PNG, WebP, MP4, WebM or MOV; maximum 5 MB each.');
  return items;
}
