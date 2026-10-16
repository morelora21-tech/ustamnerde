// ustamnerde backend: Express + yerleşik SQLite (node:sqlite, Node 22.13+)
const express=require('express'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(path.join(__dirname,'data.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,pass TEXT,role TEXT,city TEXT,cat TEXT,district TEXT DEFAULT '',bio TEXT DEFAULT '',price INTEGER DEFAULT 0,created INTEGER);
CREATE TABLE IF NOT EXISTS convs(id INTEGER PRIMARY KEY,cust INTEGER,usta INTEGER,c_read INTEGER DEFAULT 0,u_read INTEGER DEFAULT 0,UNIQUE(cust,usta));
CREATE TABLE IF NOT EXISTS msgs(id INTEGER PRIMARY KEY,conv INTEGER,sender INTEGER,text TEXT,ts INTEGER);
CREATE INDEX IF NOT EXISTS ix_m ON msgs(conv,id);
CREATE TABLE IF NOT EXISTS codes(id INTEGER PRIMARY KEY,kind TEXT,k TEXT,hash TEXT,exp INTEGER,tries INTEGER DEFAULT 0,ts INTEGER);
CREATE TABLE IF NOT EXISTS admin_log(id INTEGER PRIMARY KEY,admin TEXT,action TEXT,target TEXT,detail TEXT,ts INTEGER);`);
for(const c of ['email_verified INTEGER DEFAULT 0','phone TEXT','phone_verified INTEGER DEFAULT 0','google_id TEXT','banned INTEGER DEFAULT 0','ban_reason TEXT'])try{db.exec('ALTER TABLE users ADD COLUMN '+c)}catch{}
const sf=path.join(__dirname,'.secret');
const SECRET=process.env.SECRET||(fs.existsSync(sf)?fs.readFileSync(sf,'utf8'):(()=>{const s=crypto.randomBytes(32).toString('hex');fs.writeFileSync(sf,s);return s})());
const CATS=['elektrik','su','boya','klima'];
// Giriş/üyelik Firebase Authentication ile yapılır (LEGACY_AUTH=1 ile eski kendi sistemimize dönülür).
const PID=process.env.FIREBASE_PROJECT_ID||'ustamnerede-1b25c',FB=process.env.LEGACY_AUTH!=='1';
const q1=(s,...a)=>db.prepare(s).get(...a),qa=(s,...a)=>db.prepare(s).all(...a),run=(s,...a)=>db.prepare(s).run(...a);
const hmac=p=>crypto.createHmac('sha256',SECRET).update(p).digest('base64url');
const sign=o=>{const p=Buffer.from(JSON.stringify(o)).toString('base64url');return p+'.'+hmac(p)};
const verify=t=>{try{const[p,s]=t.split('.');if(!crypto.timingSafeEqual(Buffer.from(s),Buffer.from(hmac(p))))return;const o=JSON.parse(Buffer.from(p,'base64url'));return o.exp>Date.now()?o:null}catch{}};
const hash=(pw,salt=crypto.randomBytes(16).toString('hex'))=>salt+':'+crypto.scryptSync(pw,salt,64).toString('hex');
const check=(pw,h)=>{const[s,k]=h.split(':');return crypto.timingSafeEqual(Buffer.from(k,'hex'),crypto.scryptSync(pw,s,64))};
const pub=u=>({id:u.id,name:u.name,email:u.email,role:u.role,city:u.city,cat:u.cat,district:u.district,bio:u.bio,price:u.price,emailVerified:!!u.email_verified,phoneVerified:!!u.phone_verified,phone:u.phone?u.phone.slice(0,6)+'•••'+u.phone.slice(-2):''});
// Müşterilere giden herkese açık kart: e-posta ve telefon ASLA yok
const card=u=>({id:u.id,name:u.name,role:u.role,city:u.city,cat:u.cat,district:u.district,bio:u.bio,price:u.price,phoneVerified:!!u.phone_verified});
const bad=t=>/\d{7,}/.test(t.replace(/[\s.\-()]/g,''))||/whats?app|telegram|instagram|@/i.test(t);
const hits={};const limit=(req,res,next)=>{const k=req.ip,n=Date.now();hits[k]=(hits[k]||[]).filter(t=>n-t<600000);if(hits[k].length>=20)return res.status(429).json({error:'Çok fazla deneme. Biraz sonra tekrar dene.'});hits[k].push(n);next()};
// E-posta (SMTP) ve SMS (Twilio). Ayar yoksa kodlar sunucu konsoluna yazılır (geliştirme modu).
let mailer=null;if(process.env.SMTP_HOST){mailer=require('nodemailer').createTransport({host:process.env.SMTP_HOST,port:+process.env.SMTP_PORT||587,secure:process.env.SMTP_PORT==='465',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}})}
const mail=async(to,subject,text)=>{if(!mailer)return console.log(`[GELİŞTİRME] E-posta → ${to}: ${text}`);await mailer.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to,subject,text})};
const sms=async(to,text)=>{const{TWILIO_SID:sid,TWILIO_TOKEN:tk,TWILIO_FROM:from}=process.env;if(!sid)return console.log(`[GELİŞTİRME] SMS → ${to}: ${text}`);
 const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(sid+':'+tk).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,From:from,Body:text})});if(!r.ok)throw new Error('SMS gönderilemedi')};
async function issue(kind,k,deliver){const o=q1('SELECT ts FROM codes WHERE kind=? AND k=? ORDER BY id DESC LIMIT 1',kind,k);if(o&&Date.now()-o.ts<60000)throw new Error('Yeni kod için 60 saniye bekle');
 const code=String(crypto.randomInt(100000,1000000));run('DELETE FROM codes WHERE kind=? AND k=?',kind,k);run('INSERT INTO codes(kind,k,hash,exp,ts) VALUES(?,?,?,?,?)',kind,k,hmac(kind+k+code),Date.now()+6e5,Date.now());await deliver(code)}
function consume(kind,k,code){const c=q1('SELECT * FROM codes WHERE kind=? AND k=?',kind,k);if(!c||c.exp<Date.now())return false;if(c.tries>=5){run('DELETE FROM codes WHERE id=?',c.id);return false}
 run('UPDATE codes SET tries=tries+1 WHERE id=?',c.id);const ok=hmac(kind+k+String(code||'').trim())===c.hash;if(ok)run('DELETE FROM codes WHERE id=?',c.id);return ok}
const sendMail=u=>issue('email',String(u.id),c=>mail(u.email,'ustamnerde doğrulama kodu',`Doğrulama kodun: ${c} (10 dakika geçerli)`));
const needV=(req,res)=>{if(req.u.email_verified)return false;res.status(403).json({error:'Önce e-postanı doğrula'});return true};
// E-posta servisi (SMTP) ayarlı değilse doğrulama kodu gönderilemez: kayıtta e-posta doğrulaması kapalı sayılır.
if(!mailer&&!FB){run('UPDATE users SET email_verified=1 WHERE email_verified=0');console.log('Bilgi: SMTP ayarlı değil, e-posta doğrulaması kapalı (herkes kayıttan sonra doğrudan kullanabilir).')}
const app=express();app.use(express.json({limit:'20kb'}));app.use(express.static(path.join(__dirname,'public')));
app.use(['/api/register','/api/login','/api/forgot','/api/reset','/api/google','/api/email'],(q,r,n)=>FB?r.status(410).json({error:'Bu yöntem kapalı, giriş Firebase ile yapılıyor'}):n());
let _j,_k;const fbVerify=async t=>{_j=_j||await import('jose');_k=_k||_j.createRemoteJWKSet(new URL(process.env.FIREBASE_JWKS_URL||'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
 return (await _j.jwtVerify(t,_k,{issuer:'https://securetoken.google.com/'+PID,audience:PID})).payload};
const bearer=req=>(req.headers.authorization||'').replace('Bearer ','');
const auth=async(req,res,next)=>{let u;try{
 if(FB){const c=await fbVerify(bearer(req));if(!c.email||!c.email_verified)return res.status(403).json({error:'Önce e-postanı doğrula',code:'verify'});
  u=q1('SELECT * FROM users WHERE email=?',String(c.email).toLowerCase());if(!u)return res.status(428).json({error:'Profil tamamlanmamış',code:'profile'});
  if(!u.email_verified){run('UPDATE users SET email_verified=1 WHERE id=?',u.id);u.email_verified=1}}
 else{const o=verify(bearer(req));u=o&&q1('SELECT * FROM users WHERE id=?',o.id)}}catch{return res.status(401).json({error:'Oturum süresi doldu'})}
 if(!u)return res.status(401).json({error:'Oturum süresi doldu'});if(u.banned)return res.status(403).json({error:'Hesabın askıya alındı. Destek için bize yaz.'});req.u=u;next()};
const tok=u=>sign({id:u.id,exp:Date.now()+30*864e5});
app.post('/api/register',limit,(req,res)=>{const b=req.body||{},name=String(b.name||'').trim().slice(0,60),email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||'');
 if(name.length<2)return res.status(400).json({error:'Ad soyad yaz'});if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Geçerli bir e-posta yaz'});if(pw.length<6)return res.status(400).json({error:'Şifre en az 6 karakter olmalı'});
 const role=b.role==='usta'?'usta':'musteri',cat=role==='usta'&&CATS.includes(b.cat)?b.cat:null;
 if(q1('SELECT 1 FROM users WHERE email=?',email))return res.status(409).json({error:'Bu e-posta zaten kayıtlı'});
 const r=run('INSERT INTO users(name,email,pass,role,city,cat,created) VALUES(?,?,?,?,?,?,?)',name,email,hash(pw),role,String(b.city||'Mersin').slice(0,40),cat,Date.now());
 if(!mailer)run('UPDATE users SET email_verified=1 WHERE id=?',r.lastInsertRowid);const u=q1('SELECT * FROM users WHERE id=?',r.lastInsertRowid);if(mailer)sendMail(u).catch(e=>console.error(e.message));res.json({token:tok(u),user:pub(u)})});
app.post('/api/login',limit,(req,res)=>{const b=req.body||{},u=q1('SELECT * FROM users WHERE email=?',String(b.email||'').trim().toLowerCase());
 if(!u||!check(String(b.password||''),u.pass))return res.status(401).json({error:'E-posta veya şifre hatalı'});if(u.banned)return res.status(403).json({error:'Hesabın askıya alındı. Destek için bize yaz.'});res.json({token:tok(u),user:pub(u)})});
app.get('/api/me',auth,(req,res)=>res.json(pub(req.u)));
app.put('/api/profile',auth,(req,res)=>{const b=req.body||{},u=req.u;if(u.role!=='usta')return res.status(403).json({error:'Sadece usta hesapları'});
 run('UPDATE users SET city=?,cat=?,district=?,bio=?,price=? WHERE id=?',String(b.city||u.city).slice(0,40),CATS.includes(b.cat)?b.cat:u.cat,String(b.district||'').slice(0,60),String(b.bio||'').slice(0,500),Math.max(0,parseInt(b.price)||0),u.id);
 res.json(pub(q1('SELECT * FROM users WHERE id=?',u.id)))});
app.get('/api/ustalar',(req,res)=>{const{city='',cat='',q=''}=req.query,l='%'+String(q).toLowerCase()+'%';
 res.json(qa(`SELECT * FROM users WHERE role='usta' AND email_verified=1 AND banned=0 AND city=? AND (?='' OR cat=?) AND (lower(name||' '||bio||' '||district) LIKE ?) ORDER BY created DESC LIMIT 100`,city,cat,cat,l).map(card))});
app.post('/api/convs',auth,(req,res)=>{if(needV(req,res))return;if(req.u.role!=='musteri')return res.status(403).json({error:'Mesajı müşteri başlatır'});
 const t=q1(`SELECT * FROM users WHERE id=? AND role='usta'`,+req.body.ustaId);if(!t)return res.status(404).json({error:'Usta bulunamadı'});
 run('INSERT OR IGNORE INTO convs(cust,usta) VALUES(?,?)',req.u.id,t.id);res.json({id:q1('SELECT id FROM convs WHERE cust=? AND usta=?',req.u.id,t.id).id,name:t.name})});
const mine=(req,res)=>{const c=q1('SELECT * FROM convs WHERE id=? AND (cust=? OR usta=?)',+req.params.id,req.u.id,req.u.id);if(!c)res.status(404).json({error:'Konuşma yok'});return c};
app.get('/api/convs',auth,(req,res)=>{const me=req.u.id;res.json(qa('SELECT * FROM convs WHERE cust=? OR usta=?',me,me).map(c=>{const isC=c.cust===me,o=q1('SELECT name FROM users WHERE id=?',isC?c.usta:c.cust),l=q1('SELECT * FROM msgs WHERE conv=? ORDER BY id DESC LIMIT 1',c.id),rd=isC?c.c_read:c.u_read;
 return{id:c.id,name:o.name,last:l?l.text:'',ts:l?l.ts:0,unread:q1('SELECT COUNT(*) n FROM msgs WHERE conv=? AND id>? AND sender!=?',c.id,rd,me).n}}).sort((a,b)=>b.ts-a.ts))});
app.get('/api/convs/:id/msgs',auth,(req,res)=>{const c=mine(req,res);if(!c)return;const m=qa('SELECT id,sender,text,ts FROM msgs WHERE conv=? AND id>? ORDER BY id LIMIT 200',c.id,+req.query.after||0);
 if(m.length)run(`UPDATE convs SET ${c.cust===req.u.id?'c_read':'u_read'}=? WHERE id=?`,m[m.length-1].id,c.id);res.json(m.map(x=>({id:x.id,text:x.text,ts:x.ts,mine:x.sender===req.u.id})))});
app.post('/api/convs/:id/msgs',auth,(req,res)=>{if(needV(req,res))return;const c=mine(req,res);if(!c)return;const t=String((req.body||{}).text||'').trim().slice(0,1000);if(!t)return res.status(400).json({error:'Mesaj boş'});
 if(bad(t))return res.status(400).json({error:'Telefon ve harici iletişim bilgisi paylaşılamaz. Görüşme uygulama içinde kalmalı.'});
 run('INSERT INTO msgs(conv,sender,text,ts) VALUES(?,?,?,?)',c.id,req.u.id,t,Date.now());res.json({ok:true})});
const norm=p=>{const m=String(p||'').replace(/[\s()\-]/g,'').match(/^(?:\+?90|0)?(5\d{9})$/);return m?'+90'+m[1]:null};
app.get('/api/config',(q,r)=>r.json({google:process.env.GOOGLE_CLIENT_ID||null}));
app.post('/api/email/send',limit,auth,async(req,res)=>{try{if(!req.u.email_verified)await sendMail(req.u);res.json({ok:true})}catch(e){res.status(429).json({error:e.message})}});
app.post('/api/email/verify',auth,(req,res)=>{if(!consume('email',String(req.u.id),(req.body||{}).code))return res.status(400).json({error:'Kod hatalı ya da süresi dolmuş'});run('UPDATE users SET email_verified=1 WHERE id=?',req.u.id);res.json(pub(q1('SELECT * FROM users WHERE id=?',req.u.id)))});
app.post('/api/forgot',limit,async(req,res)=>{const email=String((req.body||{}).email||'').trim().toLowerCase();if(q1('SELECT 1 FROM users WHERE email=?',email))try{await issue('reset',email,c=>mail(email,'ustamnerde şifre sıfırlama',`Şifre sıfırlama kodun: ${c} (10 dakika geçerli). Sen istemediysen bu e-postayı yok say.`))}catch{}res.json({ok:true})});
app.post('/api/reset',limit,(req,res)=>{const b=req.body||{},email=String(b.email||'').trim().toLowerCase(),pw=String(b.password||'');if(pw.length<6)return res.status(400).json({error:'Şifre en az 6 karakter olmalı'});
 if(!consume('reset',email,b.code))return res.status(400).json({error:'Kod hatalı ya da süresi dolmuş'});run('UPDATE users SET pass=?,email_verified=1 WHERE email=?',hash(pw),email);res.json({ok:true})});
app.post('/api/phone/send',limit,auth,async(req,res)=>{const ph=norm((req.body||{}).phone);if(!ph)return res.status(400).json({error:'Geçerli bir cep numarası yaz (05xx xxx xx xx)'});
 if(q1('SELECT 1 FROM users WHERE phone=? AND phone_verified=1 AND id!=?',ph,req.u.id))return res.status(409).json({error:'Bu numara başka bir hesapta kayıtlı'});
 try{await issue('phone',String(req.u.id),c=>sms(ph,`ustamnerde doğrulama kodun: ${c}`));run('UPDATE users SET phone=?,phone_verified=0 WHERE id=?',ph,req.u.id);res.json({ok:true})}catch(e){res.status(429).json({error:e.message})}});
app.post('/api/phone/verify',auth,(req,res)=>{if(!req.u.phone||!consume('phone',String(req.u.id),(req.body||{}).code))return res.status(400).json({error:'Kod hatalı ya da süresi dolmuş'});run('UPDATE users SET phone_verified=1 WHERE id=?',req.u.id);res.json(pub(q1('SELECT * FROM users WHERE id=?',req.u.id)))});
app.post('/api/google',limit,async(req,res)=>{const id=process.env.GOOGLE_CLIENT_ID;if(!id)return res.status(501).json({error:'Google girişi ayarlanmamış'});
 try{const b=req.body||{},r=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(String(b.credential||''))),g=await r.json();
  if(!(r.ok&&g.aud===id&&String(g.email_verified)==='true'&&/^(https:\/\/)?accounts\.google\.com$/.test(g.iss)))return res.status(401).json({error:'Google doğrulaması başarısız'});
  const email=String(g.email).toLowerCase();let u=q1('SELECT * FROM users WHERE email=?',email);
  if(!u){const role=b.role==='usta'?'usta':'musteri',x=run('INSERT INTO users(name,email,pass,role,city,cat,created,email_verified,google_id) VALUES(?,?,?,?,?,?,?,1,?)',String(g.name||email.split('@')[0]).slice(0,60),email,hash(crypto.randomBytes(24).toString('hex')),role,String(b.city||'Mersin').slice(0,40),role==='usta'?(CATS.includes(b.cat)?b.cat:'elektrik'):null,Date.now(),g.sub);u=q1('SELECT * FROM users WHERE id=?',x.lastInsertRowid)}
  else if(!u.email_verified){run('UPDATE users SET email_verified=1 WHERE id=?',u.id);u.email_verified=1}
  if(u.banned)return res.status(403).json({error:'Hesabın askıya alındı. Destek için bize yaz.'});res.json({token:tok(u),user:pub(u)})}catch{res.status(502).json({error:'Google ile bağlantı kurulamadı'})}});
/* ---------- YÖNETİCİ PANELİ API ---------- */
// Yönetici = ADMIN_EMAIL listesindeki ve e-postası doğrulanmış hesap. Her işlem admin_log'a yazılır.
const ADMINS=(process.env.ADMIN_EMAIL||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
const adm=(req,res,next)=>auth(req,res,()=>{if(!ADMINS.includes(req.u.email)||!req.u.email_verified)return res.status(403).json({error:'Bu hesabın yönetici yetkisi yok'});next()});
const alog=(req,a,t,d='')=>run('INSERT INTO admin_log(admin,action,target,detail,ts) VALUES(?,?,?,?,?)',req.u.email,a,String(t),String(d||'').slice(0,300),Date.now());
const day=(tb,col,from)=>qa(`SELECT strftime('%Y-%m-%d',${col}/1000,'unixepoch','localtime') d,COUNT(*) n FROM ${tb} WHERE ${col}>? GROUP BY d`,from);
const av=u=>({...pub(u),phone:u.phone||'',banned:!!u.banned,reason:u.ban_reason||'',created:u.created,google:!!u.google_id,mc:u.mc||0});
app.get('/api/admin/stats',adm,(req,res)=>{const n=x=>q1(x).n,w=Date.now()-7*864e5;
 res.json({users:n('SELECT COUNT(*) n FROM users'),ustas:n(`SELECT COUNT(*) n FROM users WHERE role='usta'`),musteri:n(`SELECT COUNT(*) n FROM users WHERE role='musteri'`),unverified:n('SELECT COUNT(*) n FROM users WHERE email_verified=0'),phoneOk:n('SELECT COUNT(*) n FROM users WHERE phone_verified=1'),banned:n('SELECT COUNT(*) n FROM users WHERE banned=1'),convs:n('SELECT COUNT(*) n FROM convs'),msgs:n('SELECT COUNT(*) n FROM msgs'),
  signups:day('users','created',w),msgDays:day('msgs','ts',w),cities:qa(`SELECT city k,COUNT(*) n FROM users WHERE role='usta' GROUP BY city ORDER BY n DESC`),cats:qa(`SELECT cat k,COUNT(*) n FROM users WHERE role='usta' GROUP BY cat ORDER BY n DESC`)})});
app.get('/api/admin/users',adm,(req,res)=>{const{q='',role='',status='',page=1}=req.query,off=(Math.max(1,+page||1)-1)*25;
 const w=`(?='' OR role=?) AND lower(name||' '||email) LIKE ? AND (?='' OR (?='banned' AND banned=1) OR (?='unverified' AND email_verified=0))`,a=[role,role,'%'+String(q).toLowerCase()+'%',status,status,status];
 res.json({total:q1(`SELECT COUNT(*) n FROM users WHERE ${w}`,...a).n,rows:qa(`SELECT *,(SELECT COUNT(*) FROM msgs WHERE sender=users.id) mc FROM users WHERE ${w} ORDER BY id DESC LIMIT 25 OFFSET ?`,...a,off).map(av)})});
const tgt=(req,res)=>{const u=q1('SELECT * FROM users WHERE id=?',+req.params.id);if(!u){res.status(404).json({error:'Kullanıcı yok'});return}if(ADMINS.includes(u.email)){res.status(400).json({error:'Yönetici hesabına işlem yapılamaz'});return}return u};
app.post('/api/admin/users/:id/ban',adm,(req,res)=>{const u=tgt(req,res);if(!u)return;const b=!!(req.body||{}).banned,why=String((req.body||{}).reason||'').slice(0,200);
 run('UPDATE users SET banned=?,ban_reason=? WHERE id=?',b?1:0,b?why:null,u.id);alog(req,b?'askıya_al':'aktif_et',u.email,why);res.json({ok:true})});
app.post('/api/admin/users/:id/verify',adm,(req,res)=>{const u=tgt(req,res);if(!u)return;run('UPDATE users SET email_verified=1 WHERE id=?',u.id);alog(req,'eposta_onayla',u.email);res.json({ok:true})});
app.delete('/api/admin/users/:id',adm,(req,res)=>{const u=tgt(req,res);if(!u)return;db.exec('BEGIN');
 try{for(const c of qa('SELECT id FROM convs WHERE cust=? OR usta=?',u.id,u.id))run('DELETE FROM msgs WHERE conv=?',c.id);run('DELETE FROM convs WHERE cust=? OR usta=?',u.id,u.id);run('DELETE FROM codes WHERE k IN (?,?)',String(u.id),u.email);run('DELETE FROM users WHERE id=?',u.id);db.exec('COMMIT')}catch{db.exec('ROLLBACK');return res.status(500).json({error:'Silinemedi'})}
 alog(req,'hesap_sil',u.email);res.json({ok:true})});
app.get('/api/admin/convs',adm,(req,res)=>res.json(qa(`SELECT c.id,cu.name cn,cu.email ce,us.name un,us.email ue,(SELECT COUNT(*) FROM msgs WHERE conv=c.id) n,COALESCE((SELECT MAX(ts) FROM msgs WHERE conv=c.id),0) last FROM convs c JOIN users cu ON cu.id=c.cust JOIN users us ON us.id=c.usta ORDER BY last DESC LIMIT 100`)));
app.get('/api/admin/convs/:id',adm,(req,res)=>{const c=q1('SELECT * FROM convs WHERE id=?',+req.params.id);if(!c)return res.status(404).json({error:'Konuşma yok'});alog(req,'konuşma_görüntüle','#'+c.id);
 res.json(qa('SELECT id,sender,text,ts FROM msgs WHERE conv=? ORDER BY id',c.id).map(m=>({...m,who:m.sender===c.cust?'musteri':'usta'})))});
app.delete('/api/admin/msgs/:id',adm,(req,res)=>{const m=q1('SELECT * FROM msgs WHERE id=?',+req.params.id);if(!m)return res.status(404).json({error:'Mesaj yok'});run('DELETE FROM msgs WHERE id=?',m.id);alog(req,'mesaj_sil','#'+m.id,m.text);res.json({ok:true})});
app.get('/api/admin/log',adm,(req,res)=>res.json(qa('SELECT * FROM admin_log ORDER BY id DESC LIMIT 200')));
app.get('/api/admin/export.csv',adm,(req,res)=>{alog(req,'csv_indir','kullanıcılar');const e=v=>`"${String(v??'').replace(/"/g,'""')}"`;
 const rows=qa('SELECT * FROM users ORDER BY id').map(u=>[u.id,u.name,u.email,u.role,u.city,u.cat,u.email_verified,u.phone,u.phone_verified,u.banned,new Date(u.created).toISOString()].map(e).join(','));
 res.type('text/csv; charset=utf-8').set('Content-Disposition','attachment; filename=kullanicilar.csv').send('\ufeff'+['id,ad,e-posta,rol,şehir,meslek,e-posta onaylı,telefon,telefon onaylı,askıda,kayıt'].concat(rows).join('\n'))});
app.get('/api/admin/backup',adm,(req,res)=>{const f=path.join(require('os').tmpdir(),'ustamnerde-yedek-'+Date.now()+'.db');db.exec(`VACUUM INTO '${f.replace(/'/g,"''")}'`);alog(req,'yedek_indir','veritabanı');res.download(f,'ustamnerde-yedek.db',()=>fs.unlink(f,()=>{}))});
// Firebase ile giriş yapan kişinin uygulama profilini (rol, şehir, meslek) oluşturur. E-postası doğrulanmış olmalı.
app.post('/api/init',async(req,res)=>{if(!FB)return res.status(404).json({error:'Kapalı'});let c;try{c=await fbVerify(bearer(req))}catch{return res.status(401).json({error:'Oturum süresi doldu'})}
 if(!c.email||!c.email_verified)return res.status(403).json({error:'Önce e-postanı doğrula',code:'verify'});
 const email=String(c.email).toLowerCase(),b=req.body||{};let u=q1('SELECT * FROM users WHERE email=?',email);
 if(!u){const name=String(b.name||c.name||email.split('@')[0]).trim().slice(0,60),role=b.role==='usta'?'usta':'musteri',cat=role==='usta'?(CATS.includes(b.cat)?b.cat:'elektrik'):null;
  const r=run('INSERT INTO users(name,email,pass,role,city,cat,created,email_verified,google_id) VALUES(?,?,?,?,?,?,?,1,?)',name,email,'firebase',role,String(b.city||'Mersin').slice(0,40),cat,Date.now(),c.sub);u=q1('SELECT * FROM users WHERE id=?',r.lastInsertRowid)}
 else if(!u.email_verified){run('UPDATE users SET email_verified=1 WHERE id=?',u.id);u=q1('SELECT * FROM users WHERE id=?',u.id)}
 res.json(pub(u))});
const P=process.env.PORT||3000;app.listen(P,()=>console.log('ustamnerde: http://localhost:'+P));
