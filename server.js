'use strict';
const express=require('express'),compression=require('compression'),helmet=require('helmet');
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const {Pool}=require('pg');
const app=express(),PORT=Number(process.env.PORT)||10000;
const databaseUrl=(process.env.DATABASE_URL||'').trim();
const pool=new Pool({
 connectionString:databaseUrl||undefined,
 ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false,
 max:Math.max(1,Math.min(10,Number(process.env.DB_POOL_MAX)||5)),
 min:0,
 connectionTimeoutMillis:10000,
 idleTimeoutMillis:30000,
 keepAlive:true,
 keepAliveInitialDelayMillis:10000,
 statement_timeout:15000,
 query_timeout:20000,
 application_name:'hoc-vien-thien-tinh'
});
let databaseReady=false;
pool.on('error',err=>console.error('[DB] Unexpected idle-client error:',err.code||err.message));
const isDatabaseError=e=>Boolean(e)&&(
 ['ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','ENOTFOUND','08000','08001','08003','08006','DB_CONFIG_MISSING','57P01','53300'].includes(e.code)||
 /timeout exceeded when trying to connect|connection terminated unexpectedly|database system is starting up|the database system is in recovery/i.test(String(e.message||''))
);
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));app.use(compression());app.use(express.json({limit:'1mb'}));
const q=(s,p=[])=>pool.query(s,p);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const passwordHash=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const safeUser=u=>({id:u.id,username:u.username,displayName:u.display_name,role:u.role,avatar:u.avatar,createdAt:u.created_at});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function migrate(){
 const sql=fs.readFileSync(path.join(__dirname,'db/migrations/001_init.sql'),'utf8');
 await q(sql); // Idempotent DDL/seed statements; never touches the legacy database.
 await q("INSERT INTO schema_migrations(id) VALUES('001_init') ON CONFLICT DO NOTHING");
}
async function auth(req,res,next){
 try{const h=req.get('authorization')||'',token=h.startsWith('Bearer ')?h.slice(7):'';
 if(!token)return res.status(401).json({error:'Vui lòng đăng nhập.'});
 const r=await q(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.is_active=TRUE`,[hash(token)]);
 if(!r.rowCount)return res.status(401).json({error:'Phiên đăng nhập hết hạn.'});
 req.user=r.rows[0];next();}catch(e){next(e);}
}
const admin=(req,res,next)=>req.user?.role==='admin'?next():res.status(403).json({error:'Bạn không có quyền quản trị.'});
const log=async(userId,charId,action,details={})=>q('INSERT INTO activity_logs(actor_user_id,character_id,action,details) VALUES($1,$2,$3,$4)',[userId,charId,action,details]);
const needInt=(v,min=1,max=1e9)=>Number.isInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
async function awardExp(client,charId,amount){
 let c=(await client.query('SELECT * FROM characters WHERE id=$1 FOR UPDATE',[charId])).rows[0];if(!c)throw Error('Không tìm thấy nhân vật.');
 let exp=Number(c.exp)+Number(amount),level=Number(c.level),points=0;
 const cap=100;
 while(level<cap&&exp>=level*100){exp-=level*100;level++;points+=3;}
 await client.query('UPDATE characters SET exp=$2,level=$3,stat_points=stat_points+$4,updated_at=NOW() WHERE id=$1',[charId,exp,level,points]);
 return {level,exp,levelsGained:level-Number(c.level),points};
}
// Liveness: Render có thể xác nhận tiến trình Node còn hoạt động dù DB tạm gián đoạn.
app.get('/health',(req,res)=>res.status(200).json({ok:true,service:'hoc-vien-thien-tinh'}));
// Readiness: chỉ báo sẵn sàng phục vụ nghiệp vụ khi DB và migration đã hoạt động.
app.get('/ready',asyncRoute(async(req,res)=>{
 if(!databaseReady)return res.status(503).json({ok:false,database:'not_ready'});
 await q('SELECT 1');res.json({ok:true,database:'connected'});
}));
app.post('/api/register',asyncRoute(async(req,res)=>{
 const {username,password,displayName}=req.body||{};
 if(!/^[a-zA-Z0-9_]{3,24}$/.test(String(username||'')))return res.status(400).json({error:'Tên đăng nhập 3–24 ký tự, chỉ gồm chữ, số và _.'});
 if(typeof password!=='string'||password.length<10||password.length>128)return res.status(400).json({error:'Mật khẩu phải từ 10 đến 128 ký tự.'});
 if(typeof displayName!=='string'||displayName.trim().length<2||displayName.trim().length>60)return res.status(400).json({error:'Tên hiển thị phải từ 2 đến 60 ký tự.'});
 const salt=crypto.randomBytes(16).toString('hex'),ph=passwordHash(password,salt);
 const r=await q('INSERT INTO users(username,password_hash,display_name) VALUES($1,$2,$3) RETURNING *',[username,`${salt}:${ph}`,displayName.trim()]);
 const token=crypto.randomBytes(32).toString('base64url');await q("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[r.rows[0].id,hash(token)]);
 res.status(201).json({user:safeUser(r.rows[0]),token});
}));
app.post('/api/login',asyncRoute(async(req,res)=>{
 const {username,password}=req.body||{};const r=await q('SELECT * FROM users WHERE username=$1 AND is_active=TRUE',[String(username||'')]);
 if(!r.rowCount)return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
 const u=r.rows[0],[salt,stored]=u.password_hash.split(':');
 const actual=passwordHash(String(password||''),salt);
 if(!crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(stored,'hex')))return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
 const token=crypto.randomBytes(32).toString('base64url');await q("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[u.id,hash(token)]);
 res.json({user:safeUser(u),token});
}));
app.post('/api/logout',auth,asyncRoute(async(req,res)=>{await q('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(req.get('authorization').slice(7))]);res.json({ok:true});}));
app.get('/api/me',auth,asyncRoute(async(req,res)=>{const chars=await q('SELECT id,name,avatar,level,exp,star_coin,academy_point,crystal FROM characters WHERE user_id=$1 ORDER BY id',[req.user.id]);res.json({user:safeUser(req.user),characters:chars.rows});}));
app.get('/api/overview',auth,asyncRoute(async(req,res)=>{
 const [deps,quests,items,locations]=await Promise.all([q('SELECT * FROM departments WHERE active ORDER BY id'),q('SELECT * FROM quests WHERE active AND (ends_at IS NULL OR ends_at>NOW()) ORDER BY id'),q('SELECT id,name,description,category,rarity,icon,price_coin,price_point,effect FROM items WHERE active ORDER BY id'),q('SELECT * FROM locations WHERE active ORDER BY required_level,id')]);
 res.json({departments:deps.rows,quests:quests.rows,items:items.rows,locations:locations.rows});
}));
app.post('/api/characters',auth,asyncRoute(async(req,res)=>{
 const name=String(req.body?.name||'').trim();if(name.length<2||name.length>60)return res.status(400).json({error:'Tên OC phải từ 2 đến 60 ký tự.'});
 const r=await q('INSERT INTO characters(user_id,name,avatar,gender,race,biography) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[req.user.id,name,String(req.body.avatar||'🧚').slice(0,300),String(req.body.gender||'Không xác định'),String(req.body.race||'Nhân tộc'),String(req.body.biography||'').slice(0,3000)]);
 await log(req.user.id,r.rows[0].id,'character.create',{name});res.status(201).json({character:r.rows[0]});
}));
app.get('/api/characters/:id',auth,asyncRoute(async(req,res)=>{
 const r=await q(`SELECT c.*,u.display_name AS owner_name FROM characters c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,[req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy OC.'});
 const c=r.rows[0];if(Number(c.user_id)!==Number(req.user.id)&&req.user.role!=='admin'){delete c.star_coin;delete c.academy_point;delete c.crystal;}
 res.json({character:c});
}));
app.patch('/api/characters/:id',auth,asyncRoute(async(req,res)=>{
 const fields=['name','avatar','fullbody_url','gender','age','birthday','height_cm','weight_kg','race','personality','appearance','biography','hobbies','strengths','weaknesses'];
 const allowed={};for(const f of fields)if(req.body?.[f]!==undefined)allowed[f]=req.body[f];
 const sets=[],vals=[];for(const [k,v] of Object.entries(allowed)){vals.push(v);sets.push(`${k}=$${vals.length}`);}
 if(!sets.length)return res.status(400).json({error:'Không có dữ liệu cần cập nhật.'});
 vals.push(req.params.id,req.user.id);const r=await q(`UPDATE characters SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length-1} AND user_id=$${vals.length} RETURNING *`,vals);
 if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy OC hoặc bạn không có quyền sửa.'});res.json({character:r.rows[0]});
}));
app.post('/api/characters/:id/enroll',auth,asyncRoute(async(req,res)=>{
 const {departmentId,classId}=req.body||{};const c=await q('SELECT * FROM characters WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
 if(!c.rowCount)return res.status(404).json({error:'Không tìm thấy OC.'});
 const d=await q('SELECT * FROM departments WHERE id=$1 AND active=TRUE',[departmentId]);if(!d.rowCount||c.rows[0].level<d.rows[0].admission_level)return res.status(400).json({error:'Chưa đủ điều kiện vào khoa.'});
 if(classId){const cl=await q('SELECT id FROM academy_classes WHERE id=$1 AND department_id=$2',[classId,departmentId]);if(!cl.rowCount)return res.status(400).json({error:'Lớp không thuộc khoa đã chọn.'});}
 const r=await q('UPDATE characters SET department_id=$2,class_id=$3,updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,departmentId,classId||null]);res.json({character:r.rows[0]});
}));
app.get('/api/characters/:id/quests',auth,asyncRoute(async(req,res)=>{
 const own=await q('SELECT id FROM characters WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!own.rowCount)return res.status(404).json({error:'Không tìm thấy OC.'});
 const r=await q(`SELECT cq.*,q.title,q.description,q.quest_type,q.target_count,q.reward_exp,q.reward_coin,q.reward_point FROM character_quests cq JOIN quests q ON q.id=cq.quest_id WHERE cq.character_id=$1 ORDER BY cq.id DESC`,[req.params.id]);res.json({quests:r.rows});
}));
app.post('/api/characters/:id/quests/:questId/accept',auth,asyncRoute(async(req,res)=>{
 const own=await q('SELECT id,department_id FROM characters WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!own.rowCount)return res.status(404).json({error:'Không tìm thấy OC.'});
 const quest=await q('SELECT * FROM quests WHERE id=$1 AND active AND (ends_at IS NULL OR ends_at>NOW())',[req.params.questId]);if(!quest.rowCount)return res.status(404).json({error:'Nhiệm vụ không khả dụng.'});
 if(quest.rows[0].department_id&&String(quest.rows[0].department_id)!==String(own.rows[0].department_id))return res.status(403).json({error:'Nhiệm vụ dành cho khoa khác.'});
 const r=await q("INSERT INTO character_quests(character_id,quest_id) VALUES($1,$2) ON CONFLICT(character_id,quest_id) DO NOTHING RETURNING *",[req.params.id,req.params.questId]);res.status(r.rowCount?201:409).json({quest:r.rows[0]||null,error:r.rowCount?undefined:'Bạn đã nhận nhiệm vụ này.'});
}));
app.post('/api/characters/:id/quests/:questId/progress',auth,asyncRoute(async(req,res)=>{
 const amount=needInt(req.body?.amount,1,100)?Number(req.body.amount):1;
 const r=await q(`UPDATE character_quests cq SET progress=LEAST(q.target_count,cq.progress+$3),status=CASE WHEN cq.progress+$3>=q.target_count THEN 'completed' ELSE 'active' END FROM quests q WHERE cq.quest_id=q.id AND cq.character_id=$1 AND cq.quest_id=$2 AND cq.status='active' RETURNING cq.*`,[req.params.id,req.params.questId,amount]);
 if(!r.rowCount)return res.status(400).json({error:'Nhiệm vụ không ở trạng thái có thể cập nhật.'});res.json({quest:r.rows[0]});
}));
app.post('/api/characters/:id/quests/:questId/claim',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const cq=(await client.query(`SELECT cq.*,q.* FROM character_quests cq JOIN quests q ON q.id=cq.quest_id WHERE cq.character_id=$1 AND cq.quest_id=$2 FOR UPDATE OF cq`,[req.params.id,req.params.questId])).rows[0];
 if(!cq||cq.status!=='completed'||cq.claimed_at)throw Object.assign(Error('Nhiệm vụ chưa hoàn thành hoặc đã nhận thưởng.'),{status:409});
 const gain=await awardExp(client,c.id,cq.reward_exp);
 await client.query('UPDATE characters SET star_coin=star_coin+$2,academy_point=academy_point+$3 WHERE id=$1',[c.id,cq.reward_coin,cq.reward_point]);
 await client.query("UPDATE character_quests SET status='claimed',claimed_at=NOW() WHERE id=$1",[cq.id]);
 await client.query('INSERT INTO transactions(character_id,transaction_type,currency,amount) VALUES($1,$2,$3,$4)',[c.id,'quest_reward','EXP',cq.reward_exp]);
 await log(req.user.id,c.id,'quest.claim',{questId:cq.quest_id});await client.query('COMMIT');res.json({ok:true,level:gain.level,levelsGained:gain.levelsGained,reward:{exp:cq.reward_exp,coin:cq.reward_coin,point:cq.reward_point}});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get('/api/characters/:id/inventory',auth,asyncRoute(async(req,res)=>{
 const own=await q('SELECT id FROM characters WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!own.rowCount)return res.status(404).json({error:'Không tìm thấy OC.'});
 const r=await q('SELECT i.*,v.quantity,v.equipped FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.character_id=$1 AND v.quantity>0 ORDER BY i.category,i.id',[req.params.id]);res.json({items:r.rows});
}));
app.post('/api/characters/:id/shop/:itemId/buy',auth,asyncRoute(async(req,res)=>{
 const qty=needInt(req.body?.quantity,1,99)?Number(req.body.quantity):1,client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const item=(await client.query('SELECT * FROM items WHERE id=$1 AND active=TRUE FOR UPDATE',[req.params.itemId])).rows[0];if(!item)throw Object.assign(Error('Vật phẩm không còn bán.'),{status:404});
 const cost=Number(item.price_coin)*qty;if(!Number.isSafeInteger(cost)||Number(c.star_coin)<cost)throw Object.assign(Error('Không đủ Star Coin.'),{status:400});
 await client.query('UPDATE characters SET star_coin=star_coin-$2 WHERE id=$1',[c.id,cost]);
 await client.query('INSERT INTO inventory(character_id,item_id,quantity) VALUES($1,$2,$3) ON CONFLICT(character_id,item_id) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,updated_at=NOW()',[c.id,item.id,qty]);
 await client.query('INSERT INTO transactions(character_id,item_id,transaction_type,currency,amount,quantity) VALUES($1,$2,$3,$4,$5,$6)',[c.id,item.id,'purchase','Star Coin',cost,qty]);
 await log(req.user.id,c.id,'shop.purchase',{itemId:item.id,quantity:qty,cost});await client.query('COMMIT');res.json({ok:true,remaining:Number(c.star_coin)-cost,item:item.name,quantity:qty});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/characters/:id/inventory/:itemId/use',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const item=(await client.query(`SELECT i.*,v.quantity FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.character_id=$1 AND v.item_id=$2 FOR UPDATE OF v`,[c.id,req.params.itemId])).rows[0];if(!item||item.quantity<1)throw Object.assign(Error('Không có vật phẩm.'),{status:400});
 if(item.category!=='consumable')throw Object.assign(Error('Vật phẩm này không thể sử dụng trực tiếp.'),{status:400});
 const effect=item.effect||{};const hp=Math.min(1000,c.hp+Number(effect.hp||0)),mp=Math.min(1000,c.mp+Number(effect.mp||0));
 await client.query('UPDATE characters SET hp=$2,mp=$3 WHERE id=$1',[c.id,hp,mp]);
 await client.query('UPDATE inventory SET quantity=quantity-1,updated_at=NOW() WHERE character_id=$1 AND item_id=$2',[c.id,item.id]);
 await client.query('INSERT INTO transactions(character_id,item_id,transaction_type,currency,amount) VALUES($1,$2,$3,$4,$5)',[c.id,item.id,'use','item',1]);
 await log(req.user.id,c.id,'item.use',{itemId:item.id});await client.query('COMMIT');res.json({ok:true,hp,mp});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/characters/:id/explore/:locationId',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const loc=(await client.query('SELECT * FROM locations WHERE id=$1 AND active',[req.params.locationId])).rows[0];if(!loc)throw Object.assign(Error('Khu vực không tồn tại.'),{status:404});
 if(c.level<loc.required_level)throw Object.assign(Error('Chưa đủ cấp độ để khám phá.'),{status:400});
 const ins=await client.query('INSERT INTO character_locations(character_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *',[c.id,loc.id]);
 if(!ins.rowCount)throw Object.assign(Error('Bạn đã khám phá khu vực này.'),{status:409});
 const reward=await awardExp(client,c.id,loc.reward_exp);await log(req.user.id,c.id,'location.explore',{locationId:loc.id});
 await client.query('COMMIT');res.json({ok:true,rewardExp:loc.reward_exp,level:reward.level});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.get('/api/leaderboard',auth,asyncRoute(async(req,res)=>{
 const r=await q(`SELECT c.id,c.name,c.avatar,c.level,c.exp,c.star_coin,u.display_name AS owner_name,
 (SELECT COUNT(*) FROM character_quests cq WHERE cq.character_id=c.id AND cq.status='claimed') AS quests_done,
 (SELECT COUNT(*) FROM character_locations cl WHERE cl.character_id=c.id) AS explored
 FROM characters c JOIN users u ON u.id=c.user_id ORDER BY c.level DESC,c.exp DESC LIMIT 50`);res.json({rows:r.rows});
}));
app.get('/api/admin/summary',auth,admin,asyncRoute(async(req,res)=>{
 const r=await q(`SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM characters) characters,(SELECT COUNT(*) FROM quests) quests,(SELECT COUNT(*) FROM items) items`);res.json(r.rows[0]);
}));
app.post('/api/admin/quests',auth,admin,asyncRoute(async(req,res)=>{
 const b=req.body||{};if(!String(b.title||'').trim())return res.status(400).json({error:'Thiếu tên nhiệm vụ.'});
 const r=await q('INSERT INTO quests(title,description,quest_type,target_count,reward_exp,reward_coin,reward_point,department_id,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[String(b.title).slice(0,120),String(b.description||'').slice(0,2000),String(b.quest_type||'academy'),Number(b.target_count)||1,Number(b.reward_exp)||0,Number(b.reward_coin)||0,Number(b.reward_point)||0,b.department_id||null,b.ends_at||null]);
 await log(req.user.id,null,'admin.quest.create',{questId:r.rows[0].id});res.status(201).json({quest:r.rows[0]});
}));
app.get('/api/admin/users',auth,admin,asyncRoute(async(req,res)=>{const r=await q('SELECT id,username,display_name,role,is_active,created_at FROM users ORDER BY id DESC LIMIT 100');res.json({users:r.rows});}));
app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.use((err,req,res,next)=>{
 if(res.headersSent)return next(err);
 if(isDatabaseError(err)){
  console.error('[DB] Database unavailable:',err.code||err.message);
  return res.status(503).json({error:'Cơ sở dữ liệu đang tạm thời không kết nối được. Dữ liệu của bạn vẫn được giữ nguyên, vui lòng thử lại sau ít phút.',code:'DATABASE_UNAVAILABLE'});
 }
 console.error('[API]',err);
 res.status(err.status||500).json({error:err.status?err.message:'Máy chủ gặp lỗi. Vui lòng thử lại.'});
});
let server,shuttingDown=false;
// Mở cổng HTTP trước; không để sự cố DB làm Render hiểu nhầm ứng dụng bị crash.
server=app.listen(PORT,'0.0.0.0',()=>{
 console.log(`Học Viện Thiên Tinh listening on ${PORT}`);
 if(!databaseUrl)console.error('[DB] DATABASE_URL is missing. Set it in Render Environment.');
 initializeDatabase();
});
async function initializeDatabase(){
 let attempt=0;
 while(!shuttingDown&&!databaseReady){
  attempt++;
  try{
   if(!databaseUrl)throw Object.assign(new Error('DATABASE_URL is not configured'),{code:'DB_CONFIG_MISSING'});
   await pool.query('SELECT 1');
   await migrate();
   databaseReady=true;
   console.log('[DB] PostgreSQL connected; migrations are ready.');
   return;
  }catch(e){
   databaseReady=false;
   console.error(`[DB] Initialization attempt ${attempt} failed:`,e.code||e.message);
   const delay=Math.min(60000,2000*Math.pow(2,Math.min(attempt-1,5)));
   if(!shuttingDown)await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
}
async function shutdown(){
 if(shuttingDown)return;shuttingDown=true;
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();process.exit(0);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
