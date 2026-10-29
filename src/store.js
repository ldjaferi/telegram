import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  constructor(path) {
    if(path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY,finished_at INTEGER NOT NULL,practice INTEGER NOT NULL,food TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scores (round_id TEXT NOT NULL,user_id TEXT NOT NULL,name TEXT NOT NULL,score INTEGER NOT NULL,rank INTEGER NOT NULL,PRIMARY KEY(round_id,user_id));
      CREATE INDEX IF NOT EXISTS scores_user ON scores(user_id);
      INSERT OR IGNORE INTO settings VALUES ('food','cheeks');`);
  }
  get(key) { return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
  set(key,value) { this.db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value)); }
  getFood() { return this.get('food'); }
  saveRound(room) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('INSERT INTO rounds VALUES (?,?,?,?)').run(room.roundId,Date.now(),Number(room.practice),room.foodStyle);
      const insert=this.db.prepare('INSERT INTO scores VALUES (?,?,?,?,?)');
      for(const p of room.results) insert.run(room.roundId,p.id,p.name,p.score,p.rank);
      // Keep six months of history; high scores use the retained rounds.
      const cutoff=Date.now()-180*86400000;
      this.db.prepare('DELETE FROM scores WHERE round_id IN (SELECT id FROM rounds WHERE finished_at < ?)').run(cutoff);
      this.db.prepare('DELETE FROM rounds WHERE finished_at < ?').run(cutoff);
      this.db.exec('COMMIT');
    } catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  leaderboard() {
    return this.db.prepare(`SELECT s.user_id AS id, MAX(s.name) AS name, MAX(s.score) AS best,
      COUNT(*) AS games, SUM(CASE WHEN s.rank=1 THEN 1 ELSE 0 END) AS wins
      FROM scores s JOIN rounds r ON r.id=s.round_id WHERE r.practice=0
      GROUP BY s.user_id ORDER BY best DESC,wins DESC LIMIT 20`).all();
  }
  close() { this.db.close(); }
}
