import assert from 'node:assert/strict';
import test from 'node:test';
import {cdirViewerContext,cdirDirectoryForViewer} from '../cdir-access.mjs';
const directory={matrix:{'office|A':[{cat:'A',name:'Director',contact:'1234567890',whatsapp:'1234567890',emergencyContact:'9988776655'}],'mine|A1':[{cat:'A1',contact:'1111111111'}]}};
test('only admins, directors and project managers see category A numbers',()=>{
 const profiles=[{session:{role:'super'},user:{adminLevel:'Admin'}},{session:{role:'super'},user:{adminLevel:'Super Admin'}},{session:{role:'super'},user:{adminLevel:'Manager',managerRole:'Project Manager'}},{session:{role:'normal'},user:{designation:'DIRECTOR'}},{session:{role:'normal'},user:{designation:'CHAIRMAN & MANAGING DIRECTOR'}}];
 for(const profile of profiles)assert.equal(cdirDirectoryForViewer(directory,cdirViewerContext(profile)).matrix['office|A'][0].contact,'1234567890');
});
test('other roles receive only stars in every A phone field; A1 and shared source stay intact',()=>{
 for(const assignedRole of ['General User','MIS User','Production User','Maintenance User']){
 const result=cdirDirectoryForViewer(directory,cdirViewerContext({session:{role:'normal',assignedRole},user:{}}));
 for(const field of ['contact','whatsapp','emergencyContact'])assert.equal(result.matrix['office|A'][0][field],'**********');
 assert.equal(result.matrix['mine|A1'][0].contact,'1111111111');
 assert.ok(!JSON.stringify(result).includes('1234567890'));
 }
 const manager=cdirViewerContext({session:{role:'super'},user:{adminLevel:'Manager',managerRole:'Maintenance Manager'}});
 assert.equal(manager.canViewAContacts,false);
 assert.equal(directory.matrix['office|A'][0].contact,'1234567890');
});
