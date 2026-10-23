import {createCipheriv,createDecipheriv,randomBytes,publicEncrypt,privateDecrypt,createHash,constants} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {open,stat,writeFile,appendFile,rm} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';

export function encryptionHeader(publicKey){
  const key=randomBytes(32),iv=randomBytes(12);
  const header=Buffer.from(JSON.stringify({format:'Caliber Pulse encrypted recovery',version:1,algorithm:'AES-256-GCM/RSA-OAEP-SHA256',keyId:createHash('sha256').update(publicKey).digest('hex'),iv:iv.toString('base64'),wrappedKey:publicEncrypt({key:publicKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64')})+'\n');
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
  return {header,cipher};
}
export async function encryptStream(input,output,publicKey){
  const {header,cipher}=encryptionHeader(publicKey);
  await writeFile(output,header,{flag:'wx',mode:0o600});
  try{
    await pipeline(input,cipher,createWriteStream(output,{flags:'a',mode:0o600}));
    await appendFile(output,cipher.getAuthTag());
  }catch(error){await rm(output,{force:true});throw error;}
}
export async function decryptFile(input,output,privateKey){
  const size=(await stat(input)).size,handle=await open(input,'r');
  let header,tag;
  try{
    const first=Buffer.alloc(Math.min(size,8192));await handle.read(first,0,first.length,0);
    const end=first.indexOf(10);if(end<0)throw Error('Invalid encrypted archive header');
    header=first.subarray(0,end+1);tag=Buffer.alloc(16);await handle.read(tag,0,16,size-16);
  }finally{await handle.close();}
  const metadata=JSON.parse(header.toString());
  if(metadata.format!=='Caliber Pulse encrypted recovery'||metadata.version!==1)throw Error('Unsupported recovery archive');
  const key=privateDecrypt({key:privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(metadata.wrappedKey,'base64'));
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(metadata.iv,'base64'));cipher.setAAD(header);cipher.setAuthTag(tag);
  // Reserve output before the cleanup scope, so EEXIST never deletes a user's file.
  await writeFile(output,Buffer.alloc(0),{flag:'wx',mode:0o600});
  try{await pipeline(createReadStream(input,{start:header.length,end:size-17}),cipher,createWriteStream(output,{flags:'r+',mode:0o600}));}
  catch(error){await import('node:fs/promises').then(fs=>fs.rm(output,{force:true}));throw error;}
}
