import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/store.js';
import {backupDatabase} from '../scripts/backup.js';
test('results and admin setting survive restart and a verified backup restore',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'snake-test-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const path=join(directory,'source.sqlite');const store=new Store(path);store.set('food','star');
  store.saveRound({roundId:'test',practice:false,foodStyle:'cheeks',results:[{id:'a',name:'Anna',score:30,rank:1}]});
  store.saveRound({roundId:'practice',practice:true,foodStyle:'cheeks',results:[{id:'a',name:'Anna',score:999,rank:1}]});
  const backup=await backupDatabase(path,join(directory,'backups'));store.close();
  const restored=new Store(backup);try {assert.equal(restored.getFood(),'star');assert.equal(restored.leaderboard()[0].best,30);assert.equal(restored.leaderboard()[0].wins,1);}finally{restored.close();}
});
