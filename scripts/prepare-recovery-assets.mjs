import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
mkdirSync('recovery-assets',{recursive:true});
if(execFileSync('git',['rev-parse','--is-shallow-repository'],{encoding:'utf8'}).trim()==='true')execFileSync('git',['fetch','--unshallow','origin'],{stdio:'pipe'});
execFileSync('git',['fetch','origin','+refs/heads/*:refs/remotes/origin/*','--tags'],{stdio:'pipe'});
execFileSync('git',['bundle','create','recovery-assets/application.bundle','--all'],{stdio:'pipe'});
execFileSync('git',['bundle','verify','recovery-assets/application.bundle'],{stdio:'pipe'});
execFileSync('git',['archive','--format=zip','--output=recovery-assets/application-source.zip','HEAD'],{stdio:'pipe'});
console.log('Verified application source and Git-history recovery assets created.');
