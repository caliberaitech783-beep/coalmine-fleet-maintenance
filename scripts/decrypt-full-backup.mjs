import {readFile} from 'node:fs/promises';
import {decryptFile} from '../backup-crypto.mjs';
const [input,keyFile,output]=process.argv.slice(2);
if(!input||!keyFile||!output)throw Error('Usage: node scripts/decrypt-full-backup.mjs archive.enc private-key.pem output.zip');
await decryptFile(input,output,await readFile(keyFile,'utf8'));
console.log('Authenticated archive decrypted. Keep the output protected.');
