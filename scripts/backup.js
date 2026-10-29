import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,readdir,unlink,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export async function backupDatabase(source,directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const target=join(directory,`snake-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
  const db=new DatabaseSync(source,{readOnly:true});
  try {await backup(db,target);}finally{db.close();}
  await chmod(target,0o600);
  const verify=new DatabaseSync(target,{readOnly:true});
  try {if(verify.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');}finally{verify.close();}
  const files=(await readdir(directory)).filter(n=>/^snake-\d{4}-\d{2}-\d{2}T[\d.-]+Z\.sqlite$/.test(n)).sort().reverse();
  for(const file of files.slice(14))await unlink(join(directory,file));
  return target;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const target=await backupDatabase(process.env.DB_PATH||'data/snake.sqlite',process.env.BACKUP_DIR||'data/backups');console.log(`Verified backup: ${target}`);
}
