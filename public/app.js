import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,sendEmailVerification,sendPasswordResetEmail,GoogleAuthProvider,signInWithPopup,updateProfile} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
const fa=getAuth(initializeApp({apiKey:"AIzaSyARXrrAl8pfd7uaIU6zkrB_XNrZdz45YgE",authDomain:"ustamnerede-1b25c.firebaseapp.com",projectId:"ustamnerede-1b25c",appId:"1:249815630502:web:73490244c4fe0847a9ea67"}));
const CATS=[
 {id:'elektrik',n:'Elektrik',c:'#C98A00',i:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>'},
 {id:'su',n:'Su tesisatı',c:'#1E6FB8',i:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'},
 {id:'boya',n:'Boya & badana',c:'#B8431E',i:'<rect x="4" y="4" width="14" height="6" rx="1.5"/><path d="M18 7h2v5h-8v3"/><rect x="10" y="15" width="4" height="6" rx="1"/>'},
 {id:'klima',n:'Klima & kombi',c:'#1E8A7A',i:'<path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9"/>'}];
const CITIES=['Mersin','Adana','Antalya','Ankara','İstanbul','İzmir','Bursa'];
const COL=['#1E3F66','#7A3E8E','#2D7A5B','#A8442B','#3F5F8A'];
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hm=t=>new Date(t).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
const cn=id=>(CATS.find(c=>c.id===id)||{n:'Usta'}).n;
const FE={'auth/email-already-in-use':'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.','auth/invalid-credential':'E-posta veya şifre hatalı','auth/wrong-password':'E-posta veya şifre hatalı','auth/user-not-found':'E-posta veya şifre hatalı','auth/weak-password':'Şifre en az 6 karakter olmalı','auth/invalid-email':'Geçerli bir e-posta yaz','auth/missing-password':'Şifreni yaz','auth/too-many-requests':'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.','auth/popup-closed-by-user':'Google penceresi kapatıldı','auth/cancelled-popup-request':'Google penceresi kapatıldı','auth/network-request-failed':'İnternet bağlantını kontrol et','auth/operation-not-allowed':'Bu giriş yöntemi Firebase panelinde açık değil','auth/unauthorized-domain':'Bu site adresi Firebase panelinde yetkili değil (Authentication > Settings > Authorized domains)'};
const em=e=>FE[e&&e.code]||(e&&e.message)||'Bir hata oluştu';
let me=null,fu=null,U=[],st={cat:null,city:'Mersin',q:'',sort:'yeni'},cur=null,last=0,tm=null,tm2=null,busy=false,mode='login',rp='musteri',pend=null,flash='',scr='home',unr=0,pc=null;
const api=async(p,o={})=>{const t=fu?await fu.getIdToken():'';const r=await fetch('/api'+p,{method:o.m||'GET',headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:o.b?JSON.stringify(o.b):undefined});
 const j=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(j.error||'Bir hata oluştu');e.code=j.code;e.status=r.status;if(r.status===401&&fu){flash='Oturum süresi doldu, tekrar giriş yap.';signOut(fa)}throw e}return j};
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2600)};
const main=h=>{$('#main').innerHTML=h};
const dlg=$('#dlg'),modal=h=>{if(dlg.open)dlg.close();dlg.innerHTML=h;dlg.showModal()},closeDlg=()=>dlg.open&&dlg.close();
const card=h=>main(`<div class="wrap"><div class="authcard">${h}</div></div>`);
const errp=m=>`<p id="a_err" role="alert" class="err">${esc(m)}</p>`;
const lk=(id,t,c='ink')=>`<button class="lk" id="${id}" style="color:var(--${c})">${t}</button>`;
const okmsg=t=>{const x=$('#a_err');if(x){x.style.color='var(--ok)';x.textContent=t}};
const roleBox=()=>`<div class="chips"><button class="chip" data-r="musteri" aria-pressed="${rp==='musteri'}">Usta arıyorum</button><button class="chip" data-r="usta" aria-pressed="${rp==='usta'}">Ustayım</button></div>`;
const cityCat=()=>`<select class="f" id="a_c" aria-label="Şehir">${CITIES.map(c=>`<option${c===st.city?' selected':''}>${c}</option>`).join('')}</select>${rp==='usta'?`<select class="f" id="a_k" aria-label="Meslek">${CATS.map(c=>`<option value="${c.id}">${c.n}</option>`).join('')}</select>`:''}`;

/* --- Üst menü ve yönlendirme --- */
function renderNav(){$('#nav').innerHTML=me?`<a class="nl" href="#/">Ustalar</a><a class="nl" href="#/mesajlar">Mesajlar${unr?` (${unr})`:''}</a><button class="btn s" id="acc">Hesabım</button>`:fu?`<button class="nl" id="lo2">Çıkış yap</button>`:`<button class="nl" id="n_in">Giriş yap</button><button class="btn s" id="n_up">Üye ol</button>`}
function route(){clearInterval(tm);clearInterval(tm2);cur=null;if(fu&&!me)return;
 if(location.hash==='#/mesajlar'){if(!me){mode='login';flash='Mesajlarını görmek için giriş yap.';return auth()}return viewMsgs()}viewHome()}
addEventListener('hashchange',route);

/* --- Giriş / üye ol (Firebase) --- */
function auth(err=''){scr='auth';err=err||flash;flash='';clearInterval(tm);clearInterval(tm2);const r=mode==='register';
 card(`<h2>${r?'Hesap aç':'Giriş yap'}</h2><p class="mut">${r?'Ücretsiz üye ol, ustalarla uygulama içinden yaz.':'Mesajların seni bekliyor.'}</p>
 ${r?roleBox()+'<input class="f" id="a_n" placeholder="Ad soyad" autocomplete="name" aria-label="Ad soyad">':''}
 <input class="f" id="a_e" type="email" placeholder="E-posta" autocomplete="email" aria-label="E-posta"><input class="f" id="a_p" type="password" placeholder="Şifre (en az 6 karakter)" autocomplete="${r?'new-password':'current-password'}" aria-label="Şifre">${r?cityCat():''}
 ${errp(err)}<button class="btn" id="a_go" style="width:100%;padding:14px">${r?'Hesap aç':'Giriş yap'}</button>
 <button class="btn g" id="g_go" style="width:100%;margin-top:10px">Google ile devam et</button>
 ${lk('a_sw',r?'Hesabın var mı? Giriş yap':'Hesabın yok mu? Üye ol')}${r?'':lk('a_fg','Şifremi unuttum','mut')}`)}
async function submit(){const r=mode==='register',v=i=>($(i)||{}).value||'',email=v('#a_e').trim(),pw=v('#a_p');$('#a_go').disabled=true;
 try{if(r){const name=v('#a_n').trim();if(name.length<2)throw new Error('Ad soyad yaz');pend={name,role:rp,city:v('#a_c'),cat:v('#a_k')};
  const c=await createUserWithEmailAndPassword(fa,email,pw);try{await updateProfile(c.user,{displayName:name});await sendEmailVerification(c.user)}catch{}}
  else await signInWithEmailAndPassword(fa,email,pw)}
 catch(e){pend=null;const g=$('#a_go');if(g)g.disabled=false;const x=$('#a_err');x&&(x.textContent=em(e))}}
async function google(){pend=mode==='register'?{role:rp,city:($('#a_c')||{}).value||st.city,cat:($('#a_k')||{}).value}:null;
 try{await signInWithPopup(fa,new GoogleAuthProvider())}catch(e){pend=null;const x=$('#a_err');x&&(x.textContent=em(e))}}
function verifyScreen(msg=''){scr='verify';clearInterval(tm);
 card(`<h2>E-postanı doğrula</h2><p class="mut">${esc(fu.email)} adresine bir doğrulama bağlantısı gönderdik. Maildeki bağlantıya bas, sonra aşağıdaki düğmeye bas. Gelmediyse spam klasörüne bak.</p>${errp(msg)}
 <button class="btn" id="v_go" style="width:100%;padding:14px">Doğruladım</button>${lk('v_re','Maili tekrar gönder')}${lk('lo2','Çıkış yap','mut')}`)}
async function verifyCheck(){try{await fu.reload();if(!fu.emailVerified)return verifyScreen('Henüz doğrulanmamış görünüyor. Maildeki bağlantıya bastın mı?');await fu.getIdToken(true);boot()}catch(e){verifyScreen(em(e))}}
async function resend(){try{await sendEmailVerification(fu);verifyScreen();okmsg('Mail tekrar gönderildi.')}catch(e){verifyScreen(em(e))}}
function profileScreen(msg=''){scr='profile';
 card(`<h2>Profilini tamamla</h2><p class="mut">${esc(fu.email)}</p>${roleBox()}<input class="f" id="a_n" placeholder="Ad soyad" aria-label="Ad soyad" value="${esc(fu.displayName||'')}">${cityCat()}${errp(msg)}
 <button class="btn" id="pc_go" style="width:100%;padding:14px">Devam</button>${lk('lo2','Çıkış yap','mut')}`)}
function forgot(){scr='forgot';
 card(`<h2>Şifremi unuttum</h2><p class="mut">E-posta adresini yaz, sana şifre sıfırlama bağlantısı gönderelim.</p><input class="f" id="f_e" type="email" placeholder="E-posta" aria-label="E-posta">${errp('')}
 <button class="btn" id="f_go" style="width:100%;padding:14px">Bağlantı gönder</button>${lk('f_bk','Girişe dön')}`)}
async function forgotGo(){try{await sendPasswordResetEmail(fa,$('#f_e').value.trim());okmsg('Bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi. Spam klasörüne de bak.')}catch(e){$('#a_err').textContent=em(e)}}
async function boot(){if(!fu)return;if(!fu.emailVerified)return verifyScreen();
 try{me=await api('/me')}catch(e){if(e.code==='profile'){if(!pend)return profileScreen();try{me=await api('/init',{m:'POST',b:pend});pend=null}catch(x){return profileScreen(em(x))}}
  else if(e.code==='verify')return verifyScreen();else{flash=em(e);return signOut(fa)}}
 enter()}
function enter(){if(me.city&&!enter.d){st.city=me.city;enter.d=1}scr='home';renderNav();unread();clearInterval(enter.t);enter.t=setInterval(()=>{if(me&&!tm)unread()},6000);route()}
onAuthStateChanged(fa,u=>{fu=u;clearInterval(enter.t);if(!u){me=null;unr=0;renderNav();return flash?auth():route()}renderNav();boot()});

/* --- Usta listesi --- */
function viewHome(){scr='home';
 main(`<section class="hero"><div class="wrap"><h1>Evdeki işe doğru ustayı bul.</h1><p>Şehrini seç, ustalarla uygulama içinden yaz. Telefon numarası paylaşmadan, güvenle.</p>
 <div class="sbar"><select id="city" aria-label="Şehir">${CITIES.map(c=>`<option${c===st.city?' selected':''}>${c}</option>`).join('')}</select><input id="q" placeholder="Usta ya da iş ara: priz, musluk, boya…" aria-label="Usta ara" value="${esc(st.q)}"><button class="btn" id="go">Ara</button></div></div></section>
 <section class="wrap"><div class="cats" id="cats"></div><div class="sec"><h2 id="ltitle"></h2><div class="srt"><span class="mut" id="lcount"></span><select id="sort" aria-label="Sırala"><option value="yeni"${st.sort==='yeni'?' selected':''}>Yeni katılanlar</option><option value="fiyat"${st.sort==='fiyat'?' selected':''}>En uygun fiyat</option></select></div></div><div class="grid" id="list"></div></section>`);load()}
async function load(){try{U=await api(`/ustalar?city=${encodeURIComponent(st.city)}&cat=${st.cat||''}&q=${encodeURIComponent(st.q)}`)}catch{U=[]}draw()}
function draw(){if(!$('#list'))return;
 $('#cats').innerHTML=CATS.map(c=>`<button class="cat" data-id="${c.id}" aria-pressed="${st.cat===c.id}"><svg viewBox="0 0 24 24" style="stroke:${c.c}">${c.i}</svg>${c.n}</button>`).join('');
 const r=[...U].sort((a,b)=>st.sort==='fiyat'?(a.price||1e9)-(b.price||1e9):b.id-a.id);
 $('#ltitle').textContent=(st.cat?cn(st.cat):'Tüm ustalar')+' · '+st.city;$('#lcount').textContent=r.length+' usta';
 $('#list').innerHTML=r.length?r.map(u=>`<button class="card" data-i="${u.id}"><div class="ct"><div class="av" style="background:${COL[u.id%5]}">${esc(u.name[0])}</div><div><div class="nm">${esc(u.name)}</div><div class="mut">${cn(u.cat)}${u.district?' · '+esc(u.district):''}</div></div></div><p class="bio">${esc(u.bio||'Mesaj atıp işini anlatabilirsin.')}</p><div class="crow"><span class="tag">${u.phoneVerified?'Telefon onaylı':'Yeni usta'}</span><b>${u.price?u.price+' ₺':'Fiyat sor'}</b></div></button>`).join(''):`<div class="empty" style="grid-column:1/-1"><b>${esc(st.city)} için usta bulunamadı.</b><br>Başka bir kategori seç ya da aramanı kısalt.</div>`}
function detail(id){const u=U.find(x=>x.id==id);if(!u)return;
 modal(`<h3>${esc(u.name)}</h3><div class="mut">${cn(u.cat)} · ${esc(u.district||u.city)}, ${esc(u.city)}</div>
 <div class="kv"><div><b>${u.price?u.price+' ₺':'—'}</b>başlangıç</div><div><b>${cn(u.cat).split(' ')[0]}</b>alan</div><div><b>Yeni</b>üyelik</div></div>
 <p style="margin:0 0 14px;line-height:1.55">${esc(u.bio||'Usta henüz açıklama eklemedi. Mesaj atıp işini anlatabilirsin.')}</p>
 ${!me?'<button class="btn" data-act="chatlogin" style="width:100%;padding:14px">Mesaj göndermek için giriş yap</button>':me.role==='musteri'?`<button class="btn" data-chat="${u.id}" style="width:100%;padding:14px">Mesaj gönder</button>`:'<p class="mut">Usta hesabıyla mesajı müşteriler başlatır.</p>'}
 <p class="mut" style="text-align:center;margin:12px 0 0">Görüşme yalnızca uygulama içinden yapılır.</p><button class="btn g" data-act="close" style="width:100%;margin-top:10px">Kapat</button>`)}

/* --- Mesajlaşma (iki panelli sayfa) --- */
async function unread(){try{const l=await api('/convs'),n=l.reduce((a,c)=>a+c.unread,0);if(n!==unr){unr=n;renderNav()}}catch{}}
async function viewMsgs(){scr='msgs';
 main(`<div class="wrap"><div class="msgs" id="mx"><aside class="mlist" id="ib" aria-label="Konuşmalar"></aside><section class="mthread" id="th"><div class="empty">Soldan bir konuşma seç.</div></section></div></div>`);
 const paint=async()=>{try{const l=await api('/convs'),b=$('#ib');if(!b)return;
  b.innerHTML=`<div class="warn">Tüm görüşmeler uygulama içinde kalır. Telefon numarası paylaşımı kapalı.</div>`+(l.length?l.map(c=>`<button class="item${cur&&cur.id===c.id?' on':''}" data-k="${c.id}" data-n="${esc(c.name)}"><div class="av" style="background:${COL[c.id%5]}">${esc(c.name[0])}</div><div><div class="it-t"><span>${esc(c.name)}</span><span class="mut">${hm(c.ts)}</span></div><div class="it-s">${c.unread?'<b>'+esc(c.last)+'</b>':esc(c.last)||'Yeni konuşma'}</div></div>${c.unread?`<span class="tag">${c.unread}</span>`:''}</button>`).join(''):`<div class="empty"><b>Henüz mesajın yok.</b><br>${me.role==='musteri'?'Bir ustanın profilinden mesaj gönder.':'Müşteriler yazınca burada görünecek.'}</div>`);
  const n=l.reduce((a,c)=>a+c.unread,0);if(n!==unr){unr=n;renderNav()}}catch{}};
 await paint();tm=setInterval(paint,4000);if(pc){const c=pc;pc=null;openChat(c.id,c.name)}}
async function openChat(id,name){clearInterval(tm2);cur={id,name};last=0;$('#mx').classList.add('open');
 $('#th').innerHTML=`<div class="th-h"><button class="bkb" id="bk" aria-label="Geri">←</button><b>${esc(name)}</b></div><div class="body" id="mb"></div>
 ${me.role==='musteri'?'<div class="chips" style="padding:0 12px">'+['Bugün müsait misin?','Fiyat teklifi alabilir miyim?','Ne zaman gelebilirsin?'].map(q=>`<button class="chip" data-q="${q}">${q}</button>`).join('')+'</div>':''}
 <div class="compose"><input id="mi" placeholder="Mesaj yaz…" aria-label="Mesaj" maxlength="1000" autocomplete="off"><button class="btn" id="send">Gönder</button></div>`;
 document.querySelectorAll('#ib .item').forEach(x=>x.classList.toggle('on',x.dataset.k==id));
 await pull(true);tm2=setInterval(pull,2500);$('#mi')&&$('#mi').focus()}
async function pull(first){if(!cur||busy)return;busy=true;try{const m=await api(`/convs/${cur.id}/msgs?after=${last}`),b=$('#mb');if(!b)return;
 if(m.length){last=m[m.length-1].id;b.querySelector('.empty')&&(b.innerHTML='');b.insertAdjacentHTML('beforeend',m.map(x=>`<div class="bub ${x.mine?'me':''}">${esc(x.text)}<small>${hm(x.ts)}</small></div>`).join(''));b.scrollTop=b.scrollHeight}
 else if(first)b.innerHTML='<div class="empty">Henüz mesaj yok. İşini kısaca anlat.</div>'}catch{}busy=false}
async function send(){const i=$('#mi'),t=i.value.trim();if(!t)return;try{await api(`/convs/${cur.id}/msgs`,{m:'POST',b:{text:t}});i.value='';pull()}catch(e){toast(e.message)}}
async function startChat(uid){try{const c=await api('/convs',{m:'POST',b:{ustaId:uid}});closeDlg();pc=c;if(location.hash==='#/mesajlar')route();else location.hash='#/mesajlar'}catch(e){toast(e.message)}}

/* --- Hesabım --- */
function account(){const u=me,us=u.role==='usta';
 modal(`<h3>${esc(u.name)}</h3><div class="mut">${esc(u.email)} · ${us?'Usta hesabı':'Müşteri hesabı'}</div>
 ${us?`<p class="mut" style="margin:16px 0 0">Profilin müşterilere böyle görünür.</p><select class="f" id="p_k" aria-label="Meslek">${CATS.map(c=>`<option value="${c.id}"${c.id===u.cat?' selected':''}>${c.n}</option>`).join('')}</select>
 <select class="f" id="p_c" aria-label="Şehir">${CITIES.map(c=>`<option${c===u.city?' selected':''}>${c}</option>`).join('')}</select>
 <input class="f" id="p_d" placeholder="Hizmet verdiğin semt" aria-label="Semt" value="${esc(u.district)}"><input class="f" id="p_p" type="number" min="0" placeholder="Başlangıç ücreti (₺)" aria-label="Ücret" value="${u.price||''}">
 <textarea class="f" id="p_b" rows="3" placeholder="Hangi işleri yaparsın?" aria-label="Açıklama">${esc(u.bio)}</textarea><button class="btn" id="p_s" style="width:100%;margin-top:12px;padding:14px">Profili kaydet</button>`:''}
 <button class="btn g" id="lo" style="width:100%;margin-top:12px">Çıkış yap</button><button class="btn g" data-act="close" style="width:100%;margin-top:8px">Kapat</button>`)}
async function saveProfile(){const v=i=>$(i).value;try{me=await api('/profile',{m:'PUT',b:{cat:v('#p_k'),city:v('#p_c'),district:v('#p_d'),price:v('#p_p'),bio:v('#p_b')}});closeDlg();toast('Profil kaydedildi');st.city=me.city;if(scr==='home')viewHome()}catch(e){toast(e.message)}}

/* --- Olaylar --- */
document.addEventListener('click',e=>{const t=e.target.closest('button,a');if(t===dlg||(!t&&e.target===dlg)){closeDlg();return}if(!t)return;const d=t.dataset,id=t.id;
 if(id==='n_in'){mode='login';auth()}else if(id==='n_up'){mode='register';auth()}else if(id==='acc')account();else if(id==='lo'){closeDlg();signOut(fa)}
 else if(id==='go'){st.q=$('#q').value.trim();st.city=$('#city').value;load()}
 else if(d.id&&t.classList.contains('cat')){st.cat=st.cat===d.id?null:d.id;load()}
 else if(t.classList.contains('card'))detail(d.i);
 else if(d.chat)startChat(+d.chat);else if(d.act==='chatlogin'){closeDlg();mode='login';flash='Mesaj göndermek için giriş yap.';auth()}else if(d.act==='close')closeDlg();
 else if(d.k)openChat(+d.k,d.n);else if(id==='bk'){$('#mx').classList.remove('open');cur=null;clearInterval(tm2)}
 else if(id==='send')send();else if(d.q){$('#mi').value=d.q;send()}
 else if(d.r){rp=d.r;scr==='profile'?profileScreen():auth()}
 else if(id==='a_sw'){mode=mode==='login'?'register':'login';auth()}else if(id==='a_go')submit();else if(id==='g_go')google();else if(id==='a_fg')forgot();
 else if(id==='f_go')forgotGo();else if(id==='f_bk'){mode='login';auth()}else if(id==='v_go')verifyCheck();else if(id==='v_re')resend();else if(id==='lo2')signOut(fa);else if(id==='p_s')saveProfile();
 else if(id==='pc_go'){const v=i=>($(i)||{}).value||'',name=v('#a_n').trim();if(name.length<2)return profileScreen('Ad soyad yaz');pend={name,role:rp,city:v('#a_c'),cat:v('#a_k')};boot()}});
dlg.addEventListener('click',e=>{if(e.target===dlg)closeDlg()});
document.addEventListener('change',e=>{if(e.target.id==='city'){st.city=e.target.value;load()}else if(e.target.id==='sort'){st.sort=e.target.value;draw()}});
document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const id=e.target.id||'';if(id==='mi')send();else if(id==='q'){st.q=e.target.value.trim();st.city=$('#city').value;load()}else if(id==='f_e')forgotGo();else if(id.startsWith('a_')&&e.target.tagName==='INPUT')submit()});
