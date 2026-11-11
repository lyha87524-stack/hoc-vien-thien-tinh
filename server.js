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
app.disable('x-powered-by');app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));app.use(compression());app.use(express.json({limit:'2mb'}));
const q=(s,p=[])=>pool.query(s,p);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const passwordHash=(password,salt)=>crypto.scryptSync(password,salt,64).toString('hex');
const safeUser=u=>({id:u.id,username:u.username,displayName:u.display_name,role:u.role,avatar:u.avatar,bio:u.bio||'',createdAt:u.created_at,lastSeenAt:u.last_seen_at||null});
const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
async function migrate(){
 const sql=fs.readFileSync(path.join(__dirname,'db/migrations/001_init.sql'),'utf8');
 await q(sql); // Idempotent base schema; preserves existing records.
 await q("INSERT INTO schema_migrations(id) VALUES('001_init') ON CONFLICT DO NOTHING");
 const socialSql=fs.readFileSync(path.join(__dirname,'db/migrations/002_social_profiles.sql'),'utf8');
 await q(socialSql);
 await q("INSERT INTO schema_migrations(id) VALUES('002_social_profiles') ON CONFLICT DO NOTHING");
 const gameplaySql=fs.readFileSync(path.join(__dirname,'db/migrations/003_gameplay_mailbox.sql'),'utf8');
 await q(gameplaySql);
 await q("INSERT INTO schema_migrations(id) VALUES('003_gameplay_mailbox') ON CONFLICT DO NOTHING");

 // Chat schema: required by /api/chat/global and /api/chat/direct/:userId.
 // Kept idempotent so existing Render/PostgreSQL databases are upgraded safely.
 const chatSql=fs.readFileSync(path.join(__dirname,'db/migrations/004_chat.sql'),'utf8');
 await q(chatSql);
 await q("INSERT INTO schema_migrations(id) VALUES('004_chat') ON CONFLICT DO NOTHING");

 // Training/quest reward concurrency fix:
 // mailbox inserts used to acquire a KEY SHARE lock on characters through
 // mailbox_messages.character_id -> characters.id while gameplay transactions
 // already held FOR UPDATE on the same character. Removing that FK prevents
 // the lock inversion that could surface as PostgreSQL 57014 during training.
 const concurrencySql=fs.readFileSync(path.join(__dirname,'db/migrations/005_concurrency_fix.sql'),'utf8');
 await q(concurrencySql);
 await q("INSERT INTO schema_migrations(id) VALUES('005_concurrency_fix') ON CONFLICT DO NOTHING");
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
 const gained=level-Number(c.level);
 await client.query('UPDATE characters SET exp=$2,level=$3,stat_points=stat_points+$4,hp=LEAST(100+(($3-1)*20),hp+($5*20)),mp=LEAST(50+(($3-1)*10),mp+($5*10)),updated_at=NOW() WHERE id=$1',[charId,exp,level,points,gained]);
 return {level,exp,levelsGained:gained,points};
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
 const r=await q('INSERT INTO users(username,password_hash,display_name,last_seen_at) VALUES($1,$2,$3,NOW()) RETURNING *',[username,`${salt}:${ph}`,displayName.trim()]);
 const token=crypto.randomBytes(32).toString('base64url');await q("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[r.rows[0].id,hash(token)]);
 res.status(201).json({user:safeUser(r.rows[0]),token});
}));
app.post('/api/login',asyncRoute(async(req,res)=>{
 const {username,password}=req.body||{};const r=await q('SELECT * FROM users WHERE username=$1 AND is_active=TRUE',[String(username||'')]);
 if(!r.rowCount)return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
 const u=r.rows[0],[salt,stored]=u.password_hash.split(':');
 const actual=passwordHash(String(password||''),salt);
 if(!crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(stored,'hex')))return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});
 await q('UPDATE users SET last_seen_at=NOW() WHERE id=$1',[u.id]);
 const token=crypto.randomBytes(32).toString('base64url');await q("INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[u.id,hash(token)]);
 res.json({user:safeUser(u),token});
}));
app.post('/api/logout',auth,asyncRoute(async(req,res)=>{await q('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(req.get('authorization').slice(7))]);await q("UPDATE users SET last_seen_at=NOW()-INTERVAL '10 minutes' WHERE id=$1",[req.user.id]);res.json({ok:true});}));
app.post('/api/presence',auth,asyncRoute(async(req,res)=>{await q("UPDATE users SET last_seen_at=NOW() WHERE id=$1 AND (last_seen_at IS NULL OR last_seen_at<NOW()-INTERVAL '90 seconds')",[req.user.id]);res.json({ok:true});}));
app.patch('/api/profile',auth,asyncRoute(async(req,res)=>{const displayName=String(req.body?.displayName??req.user.display_name).trim(),bio=String(req.body?.bio??req.user.bio??'').trim(),avatar=String(req.body?.avatar??req.user.avatar??'🌟').trim();if(displayName.length<2||displayName.length>60)return res.status(400).json({error:'Tên hiển thị phải từ 2 đến 60 ký tự.'});if(bio.length>280)return res.status(400).json({error:'Giới thiệu tối đa 280 ký tự.'});if(avatar.length>500||(!/^https:\/\//i.test(avatar)&&avatar.length>20))return res.status(400).json({error:'Avatar không hợp lệ.'});const r=await q('UPDATE users SET display_name=$2,bio=$3,avatar=$4 WHERE id=$1 RETURNING *',[req.user.id,displayName,bio,avatar]);req.user=r.rows[0];res.json({user:safeUser(r.rows[0])});}));
app.get('/api/members',auth,asyncRoute(async(req,res)=>{const search=String(req.query.search||'').trim().slice(0,60),limit=Math.min(40,Math.max(1,Number(req.query.limit)||24)),offset=Math.max(0,Number(req.query.offset)||0);const like=search.replace(/[\\%_]/g,'\\$&')+'%';const r=await q(`SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.created_at,u.last_seen_at,(u.last_seen_at>NOW()-INTERVAL '3 minutes') AS online,EXISTS(SELECT 1 FROM friendships f WHERE (f.user_low=$1 AND f.user_high=u.id) OR (f.user_high=$1 AND f.user_low=u.id)) AS is_friend,EXISTS(SELECT 1 FROM friend_requests fr WHERE fr.status='pending' AND fr.requester_id=$1 AND fr.receiver_id=u.id) AS request_sent,EXISTS(SELECT 1 FROM friend_requests fr WHERE fr.status='pending' AND fr.requester_id=u.id AND fr.receiver_id=$1) AS request_received FROM users u WHERE u.is_active=TRUE AND u.id<>$1 AND ($2='' OR LOWER(u.username) LIKE LOWER($3) OR LOWER(u.display_name) LIKE LOWER($3)) ORDER BY online DESC,u.display_name ASC,u.id ASC LIMIT $4 OFFSET $5`,[req.user.id,search,like,limit,offset]);res.json({members:r.rows,limit,offset});}));
app.get('/api/friends',auth,asyncRoute(async(req,res)=>{const r=await q(`SELECT u.id,u.username,u.display_name,u.avatar,u.bio,u.created_at,u.last_seen_at,(u.last_seen_at>NOW()-INTERVAL '3 minutes') AS online,f.created_at AS friends_since FROM friendships f JOIN users u ON u.id=CASE WHEN f.user_low=$1 THEN f.user_high ELSE f.user_low END WHERE f.user_low=$1 OR f.user_high=$1 ORDER BY online DESC,u.display_name`,[req.user.id]);const incoming=await q(`SELECT fr.id,u.id AS user_id,u.username,u.display_name,u.avatar,u.bio,fr.created_at FROM friend_requests fr JOIN users u ON u.id=fr.requester_id WHERE fr.receiver_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC LIMIT 50`,[req.user.id]);const outgoing=await q(`SELECT fr.id,u.id AS user_id,u.username,u.display_name,u.avatar,fr.created_at FROM friend_requests fr JOIN users u ON u.id=fr.receiver_id WHERE fr.requester_id=$1 AND fr.status='pending' ORDER BY fr.created_at DESC LIMIT 50`,[req.user.id]);res.json({friends:r.rows,incoming:incoming.rows,outgoing:outgoing.rows});}));
app.post('/api/friends/request/:userId',auth,asyncRoute(async(req,res)=>{const target=Number(req.params.userId);if(!Number.isSafeInteger(target)||target===Number(req.user.id))return res.status(400).json({error:'Tài khoản không hợp lệ.'});const u=await q('SELECT id FROM users WHERE id=$1 AND is_active=TRUE',[target]);if(!u.rowCount)return res.status(404).json({error:'Không tìm thấy thành viên.'});const low=Math.min(target,Number(req.user.id)),high=Math.max(target,Number(req.user.id));const exists=await q('SELECT 1 FROM friendships WHERE user_low=$1 AND user_high=$2',[low,high]);if(exists.rowCount)return res.status(409).json({error:'Hai người đã là bạn bè.'});const reverse=await q("SELECT id FROM friend_requests WHERE requester_id=$1 AND receiver_id=$2 AND status='pending'",[target,req.user.id]);if(reverse.rowCount)return res.status(409).json({error:'Người này đã gửi lời mời cho bạn. Hãy chấp nhận trong mục Bạn bè.'});try{const r=await q("INSERT INTO friend_requests(user_low,user_high,requester_id,receiver_id) VALUES($1,$2,$3,$4) RETURNING id",[low,high,req.user.id,target]);res.status(201).json({ok:true,id:r.rows[0].id});}catch(e){if(e.code==='23505')return res.status(409).json({error:'Lời mời kết bạn đang chờ xử lý.'});throw e;}}));
app.post('/api/friends/respond/:requestId',auth,asyncRoute(async(req,res)=>{const id=Number(req.params.requestId),action=req.body?.action;if(!['accept','reject'].includes(action))return res.status(400).json({error:'Thao tác không hợp lệ.'});const client=await pool.connect();try{await client.query('BEGIN');const fr=(await client.query("SELECT * FROM friend_requests WHERE id=$1 AND receiver_id=$2 AND status='pending' FOR UPDATE",[id,req.user.id])).rows[0];if(!fr)throw Object.assign(Error('Lời mời không tồn tại hoặc đã được xử lý.'),{status:404});if(action==='accept'){await client.query('INSERT INTO friendships(user_low,user_high) VALUES($1,$2) ON CONFLICT DO NOTHING',[fr.user_low,fr.user_high]);}await client.query('UPDATE friend_requests SET status=$2,responded_at=NOW() WHERE id=$1',[id,action==='accept'?'accepted':'rejected']);await client.query('COMMIT');res.json({ok:true,status:action==='accept'?'accepted':'rejected'});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.delete('/api/friends/:userId',auth,asyncRoute(async(req,res)=>{const target=Number(req.params.userId),low=Math.min(target,Number(req.user.id)),high=Math.max(target,Number(req.user.id));const r=await q('DELETE FROM friendships WHERE user_low=$1 AND user_high=$2',[low,high]);if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy quan hệ bạn bè.'});res.json({ok:true});}));
app.get('/api/chat/global',auth,asyncRoute(async(req,res)=>{const limit=Math.min(60,Math.max(10,Number(req.query.limit)||40));const r=await q(`SELECT m.id,m.sender_id,m.body,m.created_at,u.display_name,u.avatar FROM chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.room_type='global' ORDER BY m.created_at DESC,m.id DESC LIMIT $1`,[limit]);res.json({messages:r.rows.reverse()});}));
app.post('/api/chat/global',auth,asyncRoute(async(req,res)=>{const body=String(req.body?.body||'').trim();if(!body||body.length>500)return res.status(400).json({error:'Tin nhắn phải từ 1 đến 500 ký tự.'});const r=await q(`INSERT INTO chat_messages(sender_id,room_type,body) VALUES($1,'global',$2) RETURNING id,created_at`,[req.user.id,body]);res.status(201).json({message:r.rows[0]});}));
app.get('/api/chat/direct/:userId',auth,asyncRoute(async(req,res)=>{const target=Number(req.params.userId);if(!Number.isSafeInteger(target)||target===Number(req.user.id))return res.status(400).json({error:'Tài khoản trò chuyện không hợp lệ.'});const low=Math.min(target,Number(req.user.id)),high=Math.max(target,Number(req.user.id));const friend=await q('SELECT 1 FROM friendships WHERE user_low=$1 AND user_high=$2',[low,high]);if(!friend.rowCount)return res.status(403).json({error:'Chỉ có thể trò chuyện riêng với bạn bè.'});const limit=Math.min(60,Math.max(10,Number(req.query.limit)||40));const r=await q(`SELECT m.id,m.sender_id,m.body,m.created_at,u.display_name,u.avatar FROM chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.room_type='direct' AND m.user_low=$1 AND m.user_high=$2 ORDER BY m.created_at DESC,m.id DESC LIMIT $3`,[low,high,limit]);res.json({messages:r.rows.reverse()});}));
app.post('/api/chat/direct/:userId',auth,asyncRoute(async(req,res)=>{const target=Number(req.params.userId);if(!Number.isSafeInteger(target)||target===Number(req.user.id))return res.status(400).json({error:'Tài khoản trò chuyện không hợp lệ.'});const body=String(req.body?.body||'').trim();if(!body||body.length>500)return res.status(400).json({error:'Tin nhắn phải từ 1 đến 500 ký tự.'});const low=Math.min(target,Number(req.user.id)),high=Math.max(target,Number(req.user.id));const friend=await q('SELECT 1 FROM friendships WHERE user_low=$1 AND user_high=$2',[low,high]);if(!friend.rowCount)return res.status(403).json({error:'Chỉ có thể trò chuyện riêng với bạn bè.'});const r=await q(`INSERT INTO chat_messages(sender_id,receiver_id,room_type,user_low,user_high,body) VALUES($1,$2,'direct',$3,$4,$5) RETURNING id,created_at`,[req.user.id,target,low,high,body]);res.status(201).json({message:r.rows[0]});}));
app.post('/api/media/avatar',auth,asyncRoute(async(req,res)=>{const data=String(req.body?.data||'');const match=data.match(/^data:(image\/(?:png|jpeg|webp|gif|heic|heif));base64,([A-Za-z0-9+/=]+)$/);if(!match)return res.status(400).json({error:'Chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc GIF.'});const bytes=Buffer.from(match[2],'base64');if(bytes.length>1024*1024)return res.status(413).json({error:'Ảnh tối đa 1 MB.'});const cloud=process.env.CLOUDINARY_CLOUD_NAME,key=process.env.CLOUDINARY_API_KEY,secret=process.env.CLOUDINARY_API_SECRET;if(!cloud||!key||!secret)return res.status(503).json({error:'Chưa cấu hình Cloudinary. Hãy thêm CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY và CLOUDINARY_API_SECRET trên Render để bật tải ảnh bền vững.'});const timestamp=Math.floor(Date.now()/1000),folder='hoc-vien-thien-tinh/avatars',params=`folder=${folder}&timestamp=${timestamp}`;const signature=crypto.createHash('sha1').update(params+secret).digest('hex');const form=new FormData();form.append('file',new Blob([bytes],{type:match[1]}),'avatar');form.append('api_key',key);form.append('timestamp',String(timestamp));form.append('folder',folder);form.append('signature',signature);const upload=await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`,{method:'POST',body:form});const result=await upload.json();if(!upload.ok)throw Object.assign(Error('Không thể tải ảnh lên kho lưu trữ.'),{status:502});res.status(201).json({url:result.secure_url});}));
app.get('/api/me',auth,asyncRoute(async(req,res)=>{const chars=await q('SELECT id,name,avatar,level,exp,star_coin,academy_point,crystal,hp,mp,100+(level-1)*20 AS max_hp,50+(level-1)*10 AS max_mp,atk,def,spd,intelligence,luk,stat_points FROM characters WHERE user_id=$1 ORDER BY id',[req.user.id]);res.json({user:safeUser(req.user),characters:chars.rows});}));
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
 if(allowed.avatar!==undefined){allowed.avatar=String(allowed.avatar);if(allowed.avatar.length>500||(!/^https:\/\//i.test(allowed.avatar)&&allowed.avatar.length>20))return res.status(400).json({error:'Ảnh OC không hợp lệ.'});}
 const sets=[],vals=[];for(const [k,v] of Object.entries(allowed)){vals.push(v);sets.push(`${k}=$${vals.length}`);}
 if(!sets.length)return res.status(400).json({error:'Không có dữ liệu cần cập nhật.'});
 vals.push(req.params.id,req.user.id);const r=await q(`UPDATE characters SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length-1} AND user_id=$${vals.length} RETURNING *`,vals);
 if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy OC hoặc bạn không có quyền sửa.'});res.json({character:r.rows[0]});
}));
app.post('/api/characters/:id/enroll',auth,asyncRoute(async(req,res)=>{
 const {departmentId,classId}=req.body||{},client=await pool.connect();try{await client.query('BEGIN');const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];
 if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});const d=await client.query('SELECT * FROM departments WHERE id=$1 AND active=TRUE',[departmentId]);if(!d.rowCount||c.level<d.rows[0].admission_level)throw Object.assign(Error('Chưa đủ điều kiện vào khoa.'),{status:400});
 if(classId){const cl=await client.query('SELECT id FROM academy_classes WHERE id=$1 AND department_id=$2',[classId,departmentId]);if(!cl.rowCount)throw Object.assign(Error('Lớp không thuộc khoa đã chọn.'),{status:400});}
 const r=await client.query('UPDATE characters SET department_id=$2,class_id=$3,updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,departmentId,classId||null]);await advanceQuestProgress(client,c.id,req.user.id,'academy',1);await client.query('COMMIT');res.json({character:r.rows[0]});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
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
async function advanceQuestProgress(client,charId,userId,questType,amount=1){
 const rows=await client.query(`UPDATE character_quests cq SET progress=LEAST(q.target_count,cq.progress+$3),status=CASE WHEN cq.progress+$3>=q.target_count THEN 'completed' ELSE 'active' END FROM quests q WHERE cq.quest_id=q.id AND cq.character_id=$1 AND cq.status='active' AND q.quest_type=$2 RETURNING cq.id,cq.quest_id,cq.progress,q.title,q.reward_exp,q.reward_coin,q.reward_point,q.target_count`,[charId,questType,amount]);
 for(const r of rows.rows){
  if(r.progress>=r.target_count){
   await client.query(`INSERT INTO mailbox_messages(user_id,character_id,title,body,message_type,source_type,source_id,payload) VALUES($1,$2,$3,$4,'quest_reward','quest_reward',$5,$6::jsonb) ON CONFLICT DO NOTHING`,[userId,charId,'Hoàn thành nhiệm vụ: '+r.title,'Bạn đã hoàn thành nhiệm vụ. Phần thưởng đang chờ bạn nhận trong hòm thư.',r.id,JSON.stringify({questId:r.quest_id,exp:Number(r.reward_exp),coin:Number(r.reward_coin),point:Number(r.reward_point)})]);
  }
 }
 return rows.rows;
}
app.post('/api/characters/:id/quests/:questId/progress',auth,asyncRoute(async(req,res)=>{
 const amount=needInt(req.body?.amount,1,100)?Number(req.body.amount):1,client=await pool.connect();
 try{await client.query('BEGIN');const own=await client.query('SELECT id FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id]);if(!own.rowCount)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const r=await client.query(`UPDATE character_quests cq SET progress=LEAST(q.target_count,cq.progress+$3),status=CASE WHEN cq.progress+$3>=q.target_count THEN 'completed' ELSE 'active' END FROM quests q WHERE cq.quest_id=q.id AND cq.character_id=$1 AND cq.quest_id=$2 AND cq.status='active' RETURNING cq.*`,[req.params.id,req.params.questId,amount]);
 if(!r.rowCount)throw Object.assign(Error('Nhiệm vụ không ở trạng thái có thể cập nhật.'),{status:400});
 const quest=(await client.query('SELECT quest_type FROM quests WHERE id=$1',[req.params.questId])).rows[0];
 if(r.rows[0].status==='completed'){const qdata=(await client.query('SELECT q.title,q.reward_exp,q.reward_coin,q.reward_point FROM quests q WHERE q.id=$1',[req.params.questId])).rows[0];await client.query(`INSERT INTO mailbox_messages(user_id,character_id,title,body,message_type,source_type,source_id,payload) VALUES($1,$2,$3,$4,'quest_reward','quest_reward',$5,$6::jsonb) ON CONFLICT DO NOTHING`,[req.user.id,req.params.id,'Hoàn thành nhiệm vụ: '+qdata.title,'Bạn đã hoàn thành nhiệm vụ. Phần thưởng đang chờ bạn nhận trong hòm thư.',r.rows[0].id,JSON.stringify({questId:Number(req.params.questId),exp:Number(qdata.reward_exp),coin:Number(qdata.reward_coin),point:Number(qdata.reward_point)})]);}
 await client.query('COMMIT');res.json({quest:r.rows[0],mailCreated:r.rows[0].status==='completed'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/characters/:id/quests/:questId/claim',auth,asyncRoute(async(req,res)=>res.status(410).json({error:'Phần thưởng nhiệm vụ hiện được gửi vào Hòm thư. Hãy mở Hòm thư để nhận.'})));
app.get('/api/mailbox',auth,asyncRoute(async(req,res)=>{const limit=Math.min(50,Math.max(1,Number(req.query.limit)||30)),offset=Math.max(0,Number(req.query.offset)||0);const r=await q(`SELECT id,character_id,title,body,message_type,payload,read_at,claimed_at,created_at FROM mailbox_messages WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`,[req.user.id,limit,offset]);const count=await q('SELECT COUNT(*)::int AS unread FROM mailbox_messages WHERE user_id=$1 AND read_at IS NULL',[req.user.id]);res.json({messages:r.rows,unread:count.rows[0].unread,limit,offset});}));
app.post('/api/mailbox/:mailId/read',auth,asyncRoute(async(req,res)=>{const r=await q('UPDATE mailbox_messages SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id',[req.params.mailId,req.user.id]);if(!r.rowCount)return res.status(404).json({error:'Không tìm thấy thư.'});res.json({ok:true});}));
app.post('/api/mailbox/:mailId/claim',auth,asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const m=(await client.query('SELECT * FROM mailbox_messages WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.mailId,req.user.id])).rows[0];if(!m)throw Object.assign(Error('Không tìm thấy thư.'),{status:404});if(m.message_type!=='quest_reward'||m.claimed_at)throw Object.assign(Error('Thư không có phần thưởng hoặc đã nhận.'),{status:409});const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[m.character_id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC nhận thưởng.'),{status:404});const p=m.payload||{},exp=Math.max(0,Number(p.exp)||0),coin=Math.max(0,Number(p.coin)||0),point=Math.max(0,Number(p.point)||0);const gain=await awardExp(client,c.id,exp);await client.query('UPDATE characters SET star_coin=star_coin+$2,academy_point=academy_point+$3 WHERE id=$1',[c.id,coin,point]);await client.query('UPDATE mailbox_messages SET claimed_at=NOW(),read_at=COALESCE(read_at,NOW()) WHERE id=$1',[m.id]);if(p.questId)await client.query("UPDATE character_quests SET status='claimed',claimed_at=NOW() WHERE character_id=$1 AND quest_id=$2 AND status='completed' AND claimed_at IS NULL",[c.id,p.questId]);await client.query('INSERT INTO transactions(character_id,transaction_type,currency,amount) VALUES($1,$2,$3,$4),($1,$5,$6,$7),($1,$8,$9,$10)',[c.id,'quest_reward','EXP',exp,'quest_reward','Star Coin',coin,'quest_reward','Academy Point',point]);await log(req.user.id,c.id,'mail.reward.claim',{mailId:m.id,exp,coin,point});await client.query('COMMIT');res.json({ok:true,reward:{exp,coin,point},level:gain.level,levelsGained:gain.levelsGained});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.post('/api/characters/:id/stats/allocate',auth,asyncRoute(async(req,res)=>{const attr=String(req.body?.attribute||''),amount=needInt(req.body?.amount,1,99)?Number(req.body.amount):1;const map={atk:'atk',def:'def',spd:'spd',intelligence:'intelligence',luk:'luk'};if(!map[attr])return res.status(400).json({error:'Thuộc tính không hợp lệ.'});const r=await q(`UPDATE characters SET ${map[attr]}=${map[attr]}+$3,stat_points=stat_points-$3,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND stat_points>=$3 RETURNING atk,def,spd,intelligence,luk,stat_points`,[req.params.id,req.user.id,amount]);if(!r.rowCount)return res.status(400).json({error:'Không đủ điểm thuộc tính hoặc không tìm thấy OC.'});res.json({stats:r.rows[0]});}));
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
 await client.query('INSERT INTO transactions(character_id,item_id,transaction_type,currency,amount,quantity) VALUES($1,$2,$3,$4,$5,$6)',[c.id,item.id,'purchase','Star Coin',cost,qty]);await advanceQuestProgress(client,c.id,req.user.id,'purchase',qty);
 await log(req.user.id,c.id,'shop.purchase',{itemId:item.id,quantity:qty,cost});await client.query('COMMIT');res.json({ok:true,remaining:Number(c.star_coin)-cost,item:item.name,quantity:qty});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/characters/:id/inventory/:itemId/use',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const item=(await client.query(`SELECT i.*,v.quantity FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.character_id=$1 AND v.item_id=$2 FOR UPDATE OF v`,[c.id,req.params.itemId])).rows[0];if(!item||item.quantity<1)throw Object.assign(Error('Không có vật phẩm.'),{status:400});
 if(item.category!=='consumable')throw Object.assign(Error('Vật phẩm này không thể sử dụng trực tiếp.'),{status:400});
 const effect=item.effect||{};if(Number(effect.exp||0)>0)await awardExp(client,c.id,Number(effect.exp));const current=(await client.query('SELECT hp,mp,level FROM characters WHERE id=$1',[c.id])).rows[0],maxHp=100+(Number(current.level)-1)*20,maxMp=50+(Number(current.level)-1)*10,hp=Math.min(maxHp,Number(current.hp)+Number(effect.hp||0)),mp=Math.min(maxMp,Number(current.mp)+Number(effect.mp||0));
 await client.query('UPDATE characters SET hp=$2,mp=$3 WHERE id=$1',[c.id,hp,mp]);
 await client.query('UPDATE inventory SET quantity=quantity-1,updated_at=NOW() WHERE character_id=$1 AND item_id=$2',[c.id,item.id]);
 await client.query('INSERT INTO transactions(character_id,item_id,transaction_type,currency,amount) VALUES($1,$2,$3,$4,$5)',[c.id,item.id,'use','item',1]);await advanceQuestProgress(client,c.id,req.user.id,'use_item',1);
 await log(req.user.id,c.id,'item.use',{itemId:item.id});await client.query('COMMIT');res.json({ok:true,hp,mp});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
app.post('/api/characters/:id/inventory/:itemId/equip',auth,asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});const it=(await client.query(`SELECT i.*,v.quantity,v.equipped FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.character_id=$1 AND v.item_id=$2 FOR UPDATE OF v`,[c.id,req.params.itemId])).rows[0];if(!it||it.quantity<1)throw Object.assign(Error('Không có vật phẩm.'),{status:404});if(!['weapon','armor','accessory'].includes(it.category))throw Object.assign(Error('Vật phẩm này không phải trang bị.'),{status:400});const effect=it.effect||{};if(it.equipped){for(const [k,v] of Object.entries(effect))if(['atk','def','spd','intelligence','luk'].includes(k))await client.query(`UPDATE characters SET ${k}=GREATEST(0,${k}-$2) WHERE id=$1`,[c.id,Number(v)||0]);await client.query('UPDATE inventory SET equipped=FALSE,updated_at=NOW() WHERE character_id=$1 AND item_id=$2',[c.id,it.id]);}else{const old=(await client.query(`SELECT i.effect,v.item_id FROM inventory v JOIN items i ON i.id=v.item_id WHERE v.character_id=$1 AND v.equipped=TRUE AND i.category=$2 FOR UPDATE OF v`,[c.id,it.category])).rows;for(const x of old){for(const [k,v] of Object.entries(x.effect||{}))if(['atk','def','spd','intelligence','luk'].includes(k))await client.query(`UPDATE characters SET ${k}=GREATEST(0,${k}-$2) WHERE id=$1`,[c.id,Number(v)||0]);await client.query('UPDATE inventory SET equipped=FALSE,updated_at=NOW() WHERE character_id=$1 AND item_id=$2',[c.id,x.item_id]);}for(const [k,v] of Object.entries(effect))if(['atk','def','spd','intelligence','luk'].includes(k))await client.query(`UPDATE characters SET ${k}=${k}+$2 WHERE id=$1`,[c.id,Number(v)||0]);await client.query('UPDATE inventory SET equipped=TRUE,updated_at=NOW() WHERE character_id=$1 AND item_id=$2',[c.id,it.id]);}await client.query('COMMIT');res.json({ok:true,equipped:!it.equipped});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));
app.post('/api/characters/:id/train',auth,asyncRoute(async(req,res)=>{
 const maxAttempts=3;
 let lastError=null;
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   // Keep the lock window short and retry transient lock/deadlock failures.
   await client.query("SET LOCAL lock_timeout='2500ms'");
   await client.query("SET LOCAL statement_timeout='8000ms'");

   const c=(await client.query(
    'SELECT id,hp,last_training_at FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',
    [req.params.id,req.user.id]
   )).rows[0];
   if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
   if(Number(c.hp)<5)throw Object.assign(Error('HP không đủ để luyện tập. Hãy dùng vật phẩm hồi phục.'),{status:400});
   if(c.last_training_at&&Date.now()-new Date(c.last_training_at).getTime()<30000)
    throw Object.assign(Error('Luyện tập đang hồi chiêu. Hãy thử lại sau 30 giây.'),{status:429});

   await client.query(
    'UPDATE characters SET hp=hp-5,last_training_at=NOW(),updated_at=NOW() WHERE id=$1',
    [c.id]
   );

   const gain=await awardExp(client,c.id,25);
   await advanceQuestProgress(client,c.id,req.user.id,'training',1);
   await log(req.user.id,c.id,'character.train',{exp:25,hpCost:5});

   await client.query('COMMIT');
   client.release();
   return res.json({ok:true,exp:25,hpCost:5,level:gain.level,levelsGained:gain.levelsGained});
  }catch(e){
   lastError=e;
   try{await client.query('ROLLBACK');}catch(_){}
   client.release();

   // PostgreSQL: 55P03 lock_not_available, 57014 query_canceled,
   // 40P01 deadlock_detected. A short retry makes mobile double-taps/
   // concurrent gameplay requests resilient without duplicating rewards.
   if(!['55P03','57014','40P01'].includes(e.code)||attempt===maxAttempts)throw e;
   await new Promise(resolve=>setTimeout(resolve,120*attempt));
  }
 }
 throw lastError||Error('Luyện tập thất bại.');
}));
app.post('/api/characters/:id/explore/:locationId',auth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();try{await client.query('BEGIN');
 const c=(await client.query('SELECT * FROM characters WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.user.id])).rows[0];if(!c)throw Object.assign(Error('Không tìm thấy OC.'),{status:404});
 const loc=(await client.query('SELECT * FROM locations WHERE id=$1 AND active',[req.params.locationId])).rows[0];if(!loc)throw Object.assign(Error('Khu vực không tồn tại.'),{status:404});
 if(c.level<loc.required_level)throw Object.assign(Error('Chưa đủ cấp độ để khám phá.'),{status:400});
 const ins=await client.query('INSERT INTO character_locations(character_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING *',[c.id,loc.id]);
 if(!ins.rowCount)throw Object.assign(Error('Bạn đã khám phá khu vực này.'),{status:409});
 const reward=await awardExp(client,c.id,loc.reward_exp);await advanceQuestProgress(client,c.id,req.user.id,'explore',1);await log(req.user.id,c.id,'location.explore',{locationId:loc.id});
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
   await maintenanceCleanup();
   setInterval(()=>maintenanceCleanup().catch(e=>console.error('[DB] Maintenance failed:',e.message)),24*60*60*1000).unref();
   return;
  }catch(e){
   databaseReady=false;
   console.error(`[DB] Initialization attempt ${attempt} failed:`,e.code||e.message);
   const delay=Math.min(60000,2000*Math.pow(2,Math.min(attempt-1,5)));
   if(!shuttingDown)await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
}
async function maintenanceCleanup(){
 // Bounded cleanup: expire sessions and prune only non-essential activity logs older than 90 days.
 for(let i=0;i<5;i++){const r=await q("DELETE FROM auth_sessions WHERE id IN (SELECT id FROM auth_sessions WHERE expires_at<NOW() ORDER BY expires_at LIMIT 1000)");if(r.rowCount<1000)break;}
 for(let i=0;i<5;i++){const r=await q("DELETE FROM activity_logs WHERE id IN (SELECT id FROM activity_logs WHERE created_at<NOW()-INTERVAL '90 days' ORDER BY created_at LIMIT 1000)");if(r.rowCount<1000)break;}
 for(let i=0;i<5;i++){const r=await q("DELETE FROM friend_requests WHERE id IN (SELECT id FROM friend_requests WHERE status<>'pending' AND responded_at<NOW()-INTERVAL '180 days' ORDER BY responded_at LIMIT 500)");if(r.rowCount<500)break;}
 for(let i=0;i<5;i++){const r=await q("DELETE FROM chat_messages WHERE id IN (SELECT id FROM chat_messages WHERE created_at<NOW()-INTERVAL '30 days' ORDER BY created_at LIMIT 1000)");if(r.rowCount<1000)break;}
}
async function shutdown(){
 if(shuttingDown)return;shuttingDown=true;
 if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();process.exit(0);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
