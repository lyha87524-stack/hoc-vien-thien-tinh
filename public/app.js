const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let token=localStorage.getItem('tinh_tu_token')||'',user=null,overview=null,characters=[],activeChar=Number(localStorage.getItem('tinh_tu_oc')||0),tab='login',memberOffset=0,memberSearch='',profileAvatar='🌟',chatMode='friends',chatFriendId=0,chatTimer=null,chatLoading=false;
const avatarChoices=['🌟','🌙','⭐','🦊','🐱','🐰','🐼','🐸','🦋','🌸','🧚','🧙','🧝','🐉','🦄','🐺','🪷','🎀'];
const avatarHtml=(value,cls='avatarSmall')=>/^https:\/\//i.test(String(value||''))?`<img class="${cls}" src="${esc(value)}" alt="Avatar" loading="lazy">`:`<span class="${cls}">${esc(value||'🌟')}</span>`;
const api=async(url,opts={})=>{const r=await fetch('/api'+url,{...opts,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Có lỗi xảy ra.');return d};
let msgTimer=0;
let msgHideTimer=0;
const msg=(s,duration=3000)=>{
  const el=$('#appMsg');
  if(!el)return;
  clearTimeout(msgTimer);
  clearTimeout(msgHideTimer);
  el.classList.remove('is-visible','is-hiding');
  el.textContent='';
  if(!s){
    el.setAttribute('aria-hidden','true');
    return;
  }
  el.textContent=String(s);
  el.setAttribute('aria-hidden','false');
  // Reflow is intentionally avoided; the bar animates only opacity/transform.
  requestAnimationFrame(()=>el.classList.add('is-visible'));
  msgTimer=setTimeout(()=>{
    el.classList.remove('is-visible');
    el.classList.add('is-hiding');
    msgHideTimer=setTimeout(()=>{
      el.textContent='';
      el.classList.remove('is-hiding');
      el.setAttribute('aria-hidden','true');
      msgTimer=0;
      msgHideTimer=0;
    },220);
  },Math.max(0,Number(duration)||3000));
};
function showAuth(){ $('#authView').classList.remove('hidden');$('#appView').classList.add('hidden');$('#mobileNav').classList.add('hidden');}
function showApp(){ $('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#mobileNav').classList.remove('hidden');$$('.adminOnly').forEach(x=>x.classList.toggle('hidden',user.role!=='admin'));}
function money(n){return Number(n||0).toLocaleString('vi-VN')}
function selected(){return characters.find(c=>Number(c.id)===activeChar)||characters[0]||null}
async function refresh(){const me=await api('/me');user=me.user;api('/presence',{method:'POST',body:'{}'}).catch(()=>{});characters=me.characters;if(!activeChar&&characters[0])activeChar=Number(characters[0].id);if(!characters.some(c=>Number(c.id)===activeChar))activeChar=Number(characters[0]?.id||0);localStorage.setItem('tinh_tu_oc',activeChar);overview=await api('/overview');showApp();render();loadMailbox().catch(()=>{});}
function render(){const c=selected();$('#charPicker').innerHTML=characters.length?`<select id="ocSelect">${characters.map(x=>`<option value="${x.id}" ${Number(x.id)===activeChar?'selected':''}>${/^https:\/\//i.test(String(x.avatar||''))?'🖼️':esc(x.avatar)} ${esc(x.name)} · Lv.${x.level}</option>`).join('')}</select>`:`<p>Bạn chưa có OC. Hãy tạo nhân vật đầu tiên ở mục Hồ sơ OC.</p>`;
if($('#ocSelect'))$('#ocSelect').onchange=e=>{activeChar=Number(e.target.value);localStorage.setItem('tinh_tu_oc',activeChar);render();};
$('#stats').innerHTML=c?`<div class="resourceBars"><div class="resource"><div class="resourceHead"><b>❤️ Sinh mệnh (HP)</b><strong>${money(c.hp)} / ${money(c.max_hp)}</strong></div><div class="bar"><span class="hpBar" style="width:${Math.min(100,100*Number(c.hp)/Math.max(1,Number(c.max_hp)))}%"></span></div></div><div class="resource"><div class="resourceHead"><b>💧 Ma lực (MP)</b><strong>${money(c.mp)} / ${money(c.max_mp)}</strong></div><div class="bar"><span class="mpBar" style="width:${Math.min(100,100*Number(c.mp)/Math.max(1,Number(c.max_mp)))}%"></span></div></div></div><div class="stat"><small>⭐ Cấp độ</small><b>Lv.${c.level}</b></div><div class="stat"><small>✨ EXP</small><b>${money(c.exp)} / ${money(Number(c.level)*100)}</b></div><div class="stat"><small>🪙 Star Coin</small><b>${money(c.star_coin)}</b></div><div class="stat"><small>🏅 Academy Point</small><b>${money(c.academy_point)}</b></div><div class="stat"><small>💎 Crystal</small><b>${money(c.crystal)}</b></div><div class="stat"><small>🧭 Nhân vật</small><b>${esc(c.name)}</b></div><div class="attributePanel"><div class="attributeTitle"><b>⚔️ Thuộc tính nhân vật</b><span>Điểm chưa phân bổ: <strong>${c.stat_points}</strong></span></div><div class="attributeGrid">${[['atk','⚔️ Công kích'],['def','🛡️ Phòng ngự'],['spd','💨 Tốc độ'],['intelligence','🔮 Trí tuệ'],['luk','🍀 May mắn']].map(([k,n])=>`<div class="attribute"><span>${n}</span><b>${c[k]}</b><button class="soft" data-allocate="${k}" ${Number(c.stat_points)<1?'disabled':''}>+1</button></div>`).join('')}</div><small class="muted">Mỗi lần lên cấp nhận 3 điểm thuộc tính. HP tối đa tăng 20 và MP tối đa tăng 10 mỗi cấp.</small></div>`:'';
$$('[data-allocate]').forEach(b=>b.onclick=async()=>{try{await api(`/characters/${c.id}/stats/allocate`,{method:'POST',body:JSON.stringify({attribute:b.dataset.allocate,amount:1})});await refresh();msg('Đã tăng thuộc tính.');}catch(e){msg(e.message)}});const trainBtn=$('#trainBtn');if(trainBtn){trainBtn.disabled=!c;trainBtn.onclick=async()=>{if(!c)return;trainBtn.disabled=true;try{const d=await api(`/characters/${c.id}/train`,{method:'POST',body:'{}'});await refresh();msg(`Luyện tập thành công: +${d.exp} EXP, -${d.hpCost} HP.`);if(!$('#quests').classList.contains('hidden'))await loadQuests();}catch(e){msg(e.message);}finally{trainBtn.disabled=false;}};}
$('#charCards').innerHTML=characters.map(x=>`<article class="tile"><div class="icon">${avatarHtml(x.avatar,'ocAvatar')}</div><h3>${esc(x.name)}</h3><p>Level ${x.level} · ${money(x.exp)} EXP</p><button class="soft" data-select="${x.id}">Chọn nhân vật</button><label class="filePick compact">Đổi ảnh OC<input type="file" accept="image/*" data-ocfile="${x.id}"></label></article>`).join('');
$$('[data-ocfile]').forEach(inp=>inp.onchange=async()=>{try{const url=await uploadAvatar(inp.files[0]);await api(`/characters/${inp.dataset.ocfile}`,{method:'PATCH',body:JSON.stringify({avatar:url})});await refresh();msg('Đã cập nhật ảnh đại diện OC.');}catch(e){msg(e.message)}finally{inp.value='';}});
$$('[data-select]').forEach(b=>b.onclick=()=>{activeChar=Number(b.dataset.select);localStorage.setItem('tinh_tu_oc',activeChar);render();});
$('#departments').innerHTML=overview.departments.map(d=>`<article class="tile"><div class="icon">${d.icon}</div><h3>${esc(d.name)}</h3><p>${esc(d.description)}</p><small>Điều kiện: Level ${d.admission_level}</small><button class="soft" data-enroll="${d.id}">Đăng ký khoa</button></article>`).join('');
$$('[data-enroll]').forEach(b=>b.onclick=async()=>{if(!c)return msg('Hãy tạo OC trước.');try{await api(`/characters/${c.id}/enroll`,{method:'POST',body:JSON.stringify({departmentId:Number(b.dataset.enroll)})});msg('Đã đăng ký khoa!');}catch(e){msg(e.message)}});
$('#questsList').innerHTML=overview.quests.map(q=>`<article class="tile"><div class="icon">📜</div><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><small>Tiến độ yêu cầu: ${q.target_count} · Thưởng: ${q.reward_exp} EXP · ${money(q.reward_coin)} Star Coin · ${q.reward_point} điểm</small><button class="soft" data-quest="${q.id}">Nhận nhiệm vụ</button></article>`).join('');
$$('[data-quest]').forEach(b=>b.onclick=async()=>{if(!c)return msg('Hãy tạo OC trước.');try{await api(`/characters/${c.id}/quests/${b.dataset.quest}/accept`,{method:'POST',body:'{}'});msg('Đã nhận nhiệm vụ.');await loadQuests();}catch(e){msg(e.message)}});
$('#shopList').innerHTML=overview.items.map(i=>`<article class="tile"><div class="icon">${i.icon}</div><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p><small class="itemMeta">${esc(i.category)} · ${esc(i.rarity)}</small><p class="effectText">${effectText(i.effect)}</p><b>${money(i.price_coin)} Star Coin</b><button class="soft" data-buy="${i.id}">Mua ×1</button></article>`).join('');
$$('[data-buy]').forEach(b=>b.onclick=async()=>{if(!c)return msg('Hãy tạo OC trước.');try{await api(`/characters/${c.id}/shop/${b.dataset.buy}/buy`,{method:'POST',body:JSON.stringify({quantity:1})});msg('Mua vật phẩm thành công!');await refresh();}catch(e){msg(e.message)}});
$('#mapList').innerHTML=overview.locations.map(l=>`<article class="tile"><div class="icon">${l.icon}</div><h3>${esc(l.name)}</h3><p>${esc(l.description)}</p><small>Mở ở Level ${l.required_level} · ${l.reward_exp} EXP</small><button class="soft" data-explore="${l.id}">Khám phá</button></article>`).join('');
$$('[data-explore]').forEach(b=>b.onclick=async()=>{if(!c)return msg('Hãy tạo OC trước.');try{const d=await api(`/characters/${c.id}/explore/${b.dataset.explore}`,{method:'POST',body:'{}'});msg(`Khám phá thành công! +${d.rewardExp} EXP`);await refresh();}catch(e){msg(e.message)}});
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$$('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#displayWrap').classList.toggle('hidden',tab!=='register');$('#authSubmit').textContent=tab==='login'?'Bước vào học viện ✨':'Tạo tài khoản ✨';});
$('#authForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),body=Object.fromEntries(f);try{const d=await api(tab==='login'?'/login':'/register',{method:'POST',body:JSON.stringify(body)});token=d.token;localStorage.setItem('tinh_tu_token',token);$('#authMsg').textContent='';await refresh();}catch(err){$('#authMsg').textContent=err.message;}};
const performLogout=async()=>{
  const logoutButtons=$$('[data-logout]');
  logoutButtons.forEach(button=>{button.disabled=true;});
  try{await api('/logout',{method:'POST'});}catch{}
  token='';user=null;localStorage.removeItem('tinh_tu_token');showAuth();
  logoutButtons.forEach(button=>{button.disabled=false;});
};
document.addEventListener('click',event=>{
  const logoutButton=event.target.closest('[data-logout]');
  if(!logoutButton)return;
  event.preventDefault();
  performLogout();
});
$('#createChar').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const d=await api('/characters',{method:'POST',body:JSON.stringify(f)});activeChar=Number(d.character.id);e.target.reset();await refresh();msg('Đã tạo OC thành công!');}catch(err){msg(err.message)}};
$$('[data-page]').forEach(b=>b.onclick=()=>{const page=b.dataset.page;$$('.page').forEach(x=>x.classList.toggle('hidden',x.id!==page));$$('.nav,#mobileNav [data-page]').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page==='inventory')loadInventory();if(page==='rank')loadRank();if(page==='admin')loadAdmin();if(page==='members')loadMembers(true);if(page==='profile')loadProfile();if(page==='mailbox')loadMailbox();if(page==='quests')loadQuests();if(page==='chat')loadChat();});
async function uploadAvatar(file){if(!file)throw Error('Bạn chưa chọn ảnh.');if(!/^image\/(png|jpeg|webp|gif|heic|heif)$/.test(file.type))throw Error('Định dạng ảnh không được hỗ trợ.');if(file.size>1024*1024)throw Error('Ảnh phải nhỏ hơn hoặc bằng 1 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Không đọc được file ảnh.'));reader.readAsDataURL(file);});const d=await api('/media/avatar',{method:'POST',body:JSON.stringify({data})});return d.url;}
function memberCard(m,kind='member'){const status=m.online?'<span class="presence online">● Đang online</span>':'<span class="presence offline">● Offline</span>';let action='';if(kind==='member'){action=m.is_friend?'<span class="friendTag">✓ Bạn bè</span>':m.request_sent?'<span class="muted">Đã gửi lời mời</span>':m.request_received?'<span class="muted">Có lời mời đang chờ bạn</span>':`<button class="soft" data-addfriend="${m.id}">＋ Kết bạn</button>`;}else if(kind==='friend'){action=`<button class="soft dangerText" data-unfriend="${m.id}">Hủy kết bạn</button>`;}return `<article class="memberCard">${avatarHtml(m.avatar,'memberAvatar')}<div class="memberInfo"><b>${esc(m.display_name)}</b><small>@${esc(m.username)}</small>${status}<p>${esc(m.bio||'Chưa có giới thiệu.')}</p><small>Tham gia: ${m.created_at?new Date(m.created_at).toLocaleDateString('vi-VN'):'—'}</small>${action}</div></article>`;}
async function loadMembers(reset=false){try{if(reset){memberOffset=0;memberSearch=$('#memberSearch')?.value.trim()||'';}const d=await api(`/members?search=${encodeURIComponent(memberSearch)}&limit=24&offset=${memberOffset}`);const html=d.members.map(m=>memberCard(m)).join('');$('#memberList').innerHTML=reset?html:$('#memberList').innerHTML+html;$('#memberMore').classList.toggle('hidden',d.members.length<24);memberOffset+=d.members.length;const f=await api('/friends');$('#friendRequests').innerHTML=[...f.incoming.map(x=>`<article class="memberCard">${avatarHtml(x.avatar,'memberAvatar')}<div class="memberInfo"><b>${esc(x.display_name)}</b><small>@${esc(x.username)}</small><div class="row"><button class="primary" data-accept="${x.id}">Chấp nhận</button><button class="soft" data-reject="${x.id}">Từ chối</button></div></div></article>`),...f.outgoing.map(x=>`<article class="tile"><b>Đã gửi đến ${esc(x.display_name)}</b><small>@${esc(x.username)}</small></article>`)].join('')||'<p>Không có lời mời nào.</p>';$('#friendList').innerHTML=f.friends.map(x=>memberCard(x,'friend')).join('')||'<p>Bạn chưa có bạn bè. Hãy tìm thành viên để kết bạn nhé!</p>';bindSocialActions();}catch(e){msg(e.message);}}
function bindSocialActions(){ $$('[data-addfriend]').forEach(b=>b.onclick=async()=>{try{await api(`/friends/request/${b.dataset.addfriend}`,{method:'POST',body:'{}'});msg('Đã gửi lời mời kết bạn.');await loadMembers(true);}catch(e){msg(e.message)}});$$('[data-accept],[data-reject]').forEach(b=>b.onclick=async()=>{try{await api(`/friends/respond/${b.dataset.accept||b.dataset.reject}`,{method:'POST',body:JSON.stringify({action:b.dataset.accept?'accept':'reject'})});msg(b.dataset.accept?'Đã kết bạn thành công.':'Đã từ chối lời mời.');await loadMembers(true);}catch(e){msg(e.message)}});$$('[data-unfriend]').forEach(b=>b.onclick=async()=>{if(!confirm('Bạn có chắc muốn hủy kết bạn?'))return;try{await api(`/friends/${b.dataset.unfriend}`,{method:'DELETE'});await loadMembers(true);msg('Đã hủy kết bạn.');}catch(e){msg(e.message)}});}
async function loadProfile(){try{const d=await api('/me');user=d.user;profileAvatar=user.avatar||'🌟';$('#profileAvatarPreview').innerHTML=avatarHtml(profileAvatar,'profileAvatarImg');$('#profileUsername').value=user.username;$('#profileCreated').value=new Date(user.createdAt).toLocaleDateString('vi-VN');$('#profileForm [name="displayName"]').value=user.displayName;$('#profileForm [name="bio"]').value=user.bio||'';$('#avatarLibrary').innerHTML=avatarChoices.map(a=>`<button type="button" class="avatarChoice ${profileAvatar===a?'selected':''}" data-avatar="${a}">${a}</button>`).join('');$$('[data-avatar]').forEach(b=>b.onclick=()=>{profileAvatar=b.dataset.avatar;$('#profileAvatarPreview').innerHTML=avatarHtml(profileAvatar,'profileAvatarImg');$$('[data-avatar]').forEach(x=>x.classList.toggle('selected',x===b));});const friends=await api('/friends');$('#profileFriends').innerHTML=friends.friends.map(x=>memberCard(x,'friend')).join('')||'<p>Chưa có bạn bè.</p>';bindSocialActions();}catch(e){msg(e.message)}}
$('#memberSearchBtn')?.addEventListener('click',()=>loadMembers(true));$('#memberSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadMembers(true);}});$('#memberMore')?.addEventListener('click',()=>loadMembers(false));$('#profileAvatarFile')?.addEventListener('change',async e=>{try{const url=await uploadAvatar(e.target.files[0]);profileAvatar=url;$('#profileAvatarPreview').innerHTML=avatarHtml(url,'profileAvatarImg');$$('[data-avatar]').forEach(x=>x.classList.remove('selected'));}catch(err){msg(err.message)}finally{e.target.value='';}});$('#profileForm')?.addEventListener('submit',async e=>{e.preventDefault();try{const f=Object.fromEntries(new FormData(e.target));const d=await api('/profile',{method:'PATCH',body:JSON.stringify({...f,avatar:profileAvatar})});user=d.user;msg('Đã lưu hồ sơ cá nhân.');}catch(err){msg(err.message)}});
setInterval(()=>{if(token){api('/presence',{method:'POST',body:'{}'}).catch(()=>{});if(!$('#members')?.classList.contains('hidden'))loadMembers(true);}},60000);
async function loadInventory(){const c=selected();if(!c)return;try{const d=await api(`/characters/${c.id}/inventory`);$('#inventoryList').innerHTML=d.items.map(i=>`<article class="tile"><div class="icon">${i.icon}</div><h3>${esc(i.name)} ×${i.quantity}</h3><p>${esc(i.description)}</p><p class="effectText">${effectText(i.effect)}</p>${i.category==='consumable'?`<button class="soft" data-use="${i.id}">Sử dụng</button>`:['weapon','armor','accessory'].includes(i.category)?`<button class="soft" data-equip="${i.id}">${i.equipped?'Tháo trang bị':'Trang bị'}</button>`:''}</article>`).join('')||'<p>Túi đồ đang trống.</p>';$$('[data-use]').forEach(b=>b.onclick=async()=>{try{await api(`/characters/${c.id}/inventory/${b.dataset.use}/use`,{method:'POST',body:'{}'});await loadInventory();await refresh();msg('Đã sử dụng vật phẩm.');}catch(e){msg(e.message)}});$$('[data-equip]').forEach(b=>b.onclick=async()=>{try{await api(`/characters/${c.id}/inventory/${b.dataset.equip}/equip`,{method:'POST',body:'{}'});await loadInventory();await refresh();msg('Đã cập nhật trang bị.');}catch(e){msg(e.message)}});}catch(e){msg(e.message)}}
function effectText(effect){const e=effect||{},labels={hp:'HP',mp:'MP',exp:'EXP',atk:'Công kích',def:'Phòng ngự',spd:'Tốc độ',intelligence:'Trí tuệ',luk:'May mắn'};const bits=Object.entries(e).filter(([k,v])=>labels[k]&&Number(v)!==0).map(([k,v])=>`${labels[k]} +${money(v)}`);return bits.length?'Hiệu quả: '+bits.join(' · '):'Chưa có hiệu ứng';}
async function loadQuests(){const c=selected();if(!c)return;try{const d=await api(`/characters/${c.id}/quests`),active=d.quests.filter(x=>x.status!=='claimed'),taken=new Set(d.quests.map(x=>String(x.quest_id)));$('#questsList').innerHTML=overview.quests.filter(x=>!taken.has(String(x.id))).map(q=>`<article class="tile"><div class="icon">📜</div><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><small>Yêu cầu: ${q.target_count} · Thưởng: ${q.reward_exp} EXP · ${money(q.reward_coin)} Star Coin · ${q.reward_point} điểm</small><button class="soft" data-quest="${q.id}">Nhận nhiệm vụ</button></article>`).join('')||'<p>Không còn nhiệm vụ mới.</p>';$$('[data-quest]').forEach(b=>b.onclick=async()=>{try{await api(`/characters/${c.id}/quests/${b.dataset.quest}/accept`,{method:'POST',body:'{}'});msg('Đã nhận nhiệm vụ.');await loadQuests();}catch(e){msg(e.message)}});$('#activeQuests').innerHTML=active.map(q=>{const pct=Math.min(100,Math.round(100*Number(q.progress)/Math.max(1,Number(q.target_count))));return `<article class="tile"><div class="icon">${q.status==='completed'?'📬':'📜'}</div><h3>${esc(q.title)}</h3><p>${esc(q.description)}</p><div class="questProgress"><div class="questProgressHead"><span>Tiến độ</span><strong>${pct}%</strong></div><div class="questBar"><span style="width:${pct}%"></span></div><small>${q.progress}/${q.target_count}</small></div><small>${q.status==='completed'?'Đã hoàn thành · Phần thưởng đã gửi vào Hòm thư':'Đang thực hiện'}</small></article>`;}).join('')||'<p>Chưa có nhiệm vụ nào đang thực hiện.</p>';}catch(e){msg(e.message)}}

async function loadChat(){
  if(!$('#chat'))return;
  if(chatTimer)clearInterval(chatTimer);
  const f=await api('/friends');
  const friends=f.friends||[];
  if(chatMode==='friends'&&!chatFriendId&&friends[0])chatFriendId=Number(friends[0].id);
  $('#friendChatPicker').innerHTML=chatMode==='friends'?(friends.length?friends.map(x=>`<button type="button" class="chatFriend ${Number(x.id)===chatFriendId?'active':''}" data-chat-friend="${x.id}">${avatarHtml(x.avatar,'chatAvatar')}<span>${esc(x.display_name)}</span></button>`).join(''):'<p class="muted">Bạn chưa có bạn bè. Hãy kết bạn trước để mở trò chuyện riêng.</p>'):'<div class="globalChatTitle">🌐 Kênh chung của học viện · tất cả thành viên</div>';
  $$('.chatTab').forEach(b=>b.classList.toggle('active',b.dataset.chatMode===chatMode));
  if(chatMode==='friends'&&!chatFriendId){$('#chatMessages').innerHTML='<div class="chatEmpty">Chọn một người bạn để bắt đầu trò chuyện.</div>';return;}
  await loadChatMessages();
  chatTimer=setInterval(()=>loadChatMessages(true).catch(()=>{}),10000);
}
async function loadChatMessages(silent=false){
  if(chatLoading)return;chatLoading=true;
  try{const qs=chatMode==='global'?'/chat/global?limit=60':`/chat/direct/${chatFriendId}?limit=60`;const d=await api(qs);const rows=d.messages||[];$('#chatMessages').innerHTML=rows.map(m=>`<div class="chatBubble ${Number(m.sender_id)===Number(user.id)?'mine':''}">${Number(m.sender_id)!==Number(user.id)?`<div class="chatSender">${avatarHtml(m.avatar,'chatAvatar')}<b>${esc(m.display_name)}</b></div>`:''}<div>${esc(m.body)}</div><time>${new Date(m.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join('')||'<div class="chatEmpty">Chưa có tin nhắn. Hãy bắt đầu câu chuyện ✨</div>';const box=$('#chatMessages');box.scrollTop=box.scrollHeight;}catch(e){if(!silent)msg(e.message);}finally{chatLoading=false;}
}
async function sendChat(body){if(!body.trim())return;const url=chatMode==='global'?'/chat/global':`/chat/direct/${chatFriendId}`;await api(url,{method:'POST',body:JSON.stringify({body:body.trim()})});$('#chatInput').value='';await loadChatMessages();}
$$('.chatTab').forEach(b=>b.addEventListener('click',()=>{chatMode=b.dataset.chatMode;chatFriendId=0;loadChat().catch(e=>msg(e.message));}));
document.addEventListener('click',e=>{const b=e.target.closest('[data-chat-friend]');if(!b)return;chatFriendId=Number(b.dataset.chatFriend);loadChat().catch(err=>msg(err.message));});
$('#chatForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await sendChat($('#chatInput').value);}catch(err){msg(err.message);}});
async function loadMailbox(){try{const d=await api('/mailbox');$('#mailUnread').textContent=d.unread;$('#mailUnreadTitle').textContent=d.unread;$('#mailList').innerHTML=d.messages.map(m=>{const p=m.payload||{},reward=m.message_type==='quest_reward';return `<article class="tile mailTile ${m.read_at?'':'unread'}"><div class="icon">${reward?'🎁':'✉️'}</div><h3>${esc(m.title)}</h3><p>${esc(m.body)}</p>${reward?`<div class="mailReward">🎁 ${money(p.exp)} EXP · ${money(p.coin)} Star Coin · ${money(p.point)} Academy Point</div>${m.claimed_at?'<span class="friendTag">✓ Đã nhận thưởng</span>':`<button class="primary" data-claimmail="${m.id}">Nhận phần thưởng</button>`}`:''}<small class="muted">${new Date(m.created_at).toLocaleString('vi-VN')}</small></article>`}).join('')||'<p>Hòm thư hiện chưa có thư.</p>';$$('[data-claimmail]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await api(`/mailbox/${b.dataset.claimmail}/claim`,{method:'POST',body:'{}'});msg(`Đã nhận thưởng: +${d.reward.exp} EXP, +${d.reward.coin} Star Coin.`);await refresh();await loadMailbox();await loadQuests();}catch(e){msg(e.message);b.disabled=false;}});const newlyRead=d.messages.filter(x=>!x.read_at);for(const m of newlyRead)api(`/mailbox/${m.id}/read`,{method:'POST',body:'{}'}).catch(()=>{});if(newlyRead.length){$('#mailUnread').textContent=Math.max(0,d.unread-newlyRead.length);$('#mailUnreadTitle').textContent=Math.max(0,d.unread-newlyRead.length);}}catch(e){msg(e.message)}}
async function loadRank(){
  const d=await api('/leaderboard');
  const rows=d.rows||[];
  $('#rankList').innerHTML=`<div class="rankTableWrap"><table class="table rankTable"><tr><th>OC</th><th>Chủ nhân</th><th>Level</th><th>EXP</th><th>Nhiệm vụ</th><th>Khám phá</th></tr>${rows.map(x=>`<tr><td><div class="rankCharacter">${avatarHtml(x.avatar,'rankAvatar')}<span>${esc(x.name)}</span></div></td><td>${esc(x.owner_name)}</td><td>${x.level}</td><td>${money(x.exp)}</td><td>${x.quests_done}</td><td>${x.explored}</td></tr>`).join('')}</table></div>`||'<p>Chưa có dữ liệu vinh danh.</p>';
  $$('.rankAvatar').forEach(img=>{
    if(img.tagName!=='IMG')return;
    img.addEventListener('error',()=>{
      const fallback=document.createElement('span');
      fallback.className='rankAvatar rankAvatarFallback';
      fallback.textContent='🌟';
      img.replaceWith(fallback);
    },{once:true});
  });
}
async function loadAdmin(){if(user.role!=='admin')return;const d=await api('/admin/summary');$('#adminSummary').innerHTML=`<div class="stats">${Object.entries(d).map(([k,v])=>`<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;}
$('#newQuest').onsubmit=async e=>{e.preventDefault();try{await api('/admin/quests',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});e.target.reset();msg('Đã tạo nhiệm vụ.');overview=await api('/overview');render();}catch(err){msg(err.message)}};
$('#themeBtn').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('tinh_tu_theme',document.body.classList.contains('dark')?'dark':'light')};
if(localStorage.getItem('tinh_tu_theme')==='dark')document.body.classList.add('dark');
(async()=>{if(!token)return showAuth();try{await refresh();}catch{token='';localStorage.removeItem('tinh_tu_token');showAuth();}})();


/* ===== HỌC VIỆN THIÊN TINH · LIGHTWEIGHT EFFECT ENGINE ===== */
(function initAcademyEffects(){
  if(window.__academyEffectsInitialized)return;
  window.__academyEffectsInitialized=true;
  const root=document.getElementById('academyEffects');
  if(!root)return;
  const starField=root.querySelector('.star-field');
  const petalField=root.querySelector('.petal-field');
  const lotusField=root.querySelector('.lotus-field');
  const spiritField=root.querySelector('.spirit-particles');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let resizeTimer=0;
  let activeProfile='';

  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  const rand=(min,max)=>Math.random()*(max-min)+min;
  const isWeakDevice=()=>{
    const cores=navigator.hardwareConcurrency||4;
    const memory=navigator.deviceMemory||4;
    return cores<=4||memory<=2;
  };
  const profile=()=>{
    if(reduced.matches)return {stars:0,petals:0,lotus:0,particles:0,key:'reduced'};
    const weak=isWeakDevice();
    const mobile=window.innerWidth<=600;
    if(mobile)return weak?{stars:12,petals:4,lotus:1,particles:8,key:'mobile-weak'}:{stars:20,petals:7,lotus:2,particles:12,key:'mobile'};
    return weak?{stars:22,petals:7,lotus:3,particles:14,key:'desktop-weak'}:{stars:34,petals:10,lotus:4,particles:20,key:'desktop'};
  };
  const clearField=(field)=>{while(field.firstChild)field.removeChild(field.firstChild)};
  const makeStars=(count)=>{
    clearField(starField);
    for(let i=0;i<count;i++){
      const star=document.createElement('span');
      star.className='cosmic-star'+(i%7===0?' is-sparkle':'');
      star.style.left=`${rand(1,99)}%`;
      star.style.top=`${rand(2,98)}%`;
      star.style.setProperty('--star-size',`${rand(1,2.8).toFixed(2)}px`);
      star.style.setProperty('--star-glow',`${rand(4,10).toFixed(1)}px`);
      star.style.setProperty('--star-opacity',rand(.25,.82).toFixed(2));
      star.style.setProperty('--star-duration',`${rand(2.8,6.8).toFixed(2)}s`);
      star.style.setProperty('--star-delay',`${rand(-7,0).toFixed(2)}s`);
      starField.appendChild(star);
    }
  };
  const makePetals=(count)=>{
    clearField(petalField);
    for(let i=0;i<count;i++){
      const el=document.createElement('span');el.className='petal';
      el.style.left=`${rand(-5,100)}%`;el.style.top=`${rand(-14,-2)}vh`;
      el.style.setProperty('--duration',`${rand(8,16).toFixed(2)}s`);
      el.style.setProperty('--delay',`${rand(-16,0).toFixed(2)}s`);
      el.style.setProperty('--opacity',rand(.34,.82).toFixed(2));
      el.style.setProperty('--sway1',`${rand(-8,12)}vw`);el.style.setProperty('--sway2',`${rand(-14,16)}vw`);
      el.style.setProperty('--sway3',`${rand(-12,18)}vw`);el.style.setProperty('--sway4',`${rand(-20,20)}vw`);
      const scale=rand(.65,1.25);el.style.transform=`scale(${scale})`;petalField.appendChild(el);
    }
  };
  const makeLotus=(count)=>{
    clearField(lotusField);
    for(let i=0;i<count;i++){
      const el=document.createElement('span');el.className='lotus-petal';
      const side=Math.random()<.5?'left':'right';
      el.style[side]=`${rand(0,14)}vw`;el.style.bottom=`${rand(5,38)}vh`;
      el.style.setProperty('--duration',`${rand(12,20).toFixed(2)}s`);el.style.setProperty('--delay',`${rand(-20,0).toFixed(2)}s`);
      el.style.setProperty('--opacity',rand(.22,.56).toFixed(2));el.style.setProperty('--drift',`${rand(-28,28)}px`);
      const scale=rand(.7,1.15);el.style.transform=`scale(${scale})`;lotusField.appendChild(el);
    }
  };
  const makeParticles=(count)=>{
    clearField(spiritField);
    const colors=['rgba(255,249,216,.82)','rgba(224,247,238,.72)','rgba(205,237,255,.68)'];
    for(let i=0;i<count;i++){
      const el=document.createElement('span');el.className='spirit-particle';
      el.style.left=`${rand(2,98)}%`;el.style.top=`${rand(8,94)}%`;
      el.style.setProperty('--size',`${rand(1,3.5).toFixed(2)}px`);el.style.setProperty('--glow',`${rand(3,8).toFixed(1)}px`);
      el.style.setProperty('--particle-color',colors[i%colors.length]);el.style.setProperty('--opacity',rand(.25,.7).toFixed(2));
      el.style.setProperty('--duration',`${rand(7,15).toFixed(2)}s`);el.style.setProperty('--delay',`${rand(-15,0).toFixed(2)}s`);
      el.style.setProperty('--dx',`${rand(-22,22)}px`);el.style.setProperty('--dy',`${rand(-34,12)}px`);
      spiritField.appendChild(el);
    }
  };
  const apply=()=>{
    const p=profile();
    if(p.key===activeProfile)return;
    activeProfile=p.key;
    makeStars(p.stars);makePetals(p.petals);makeLotus(p.lotus);makeParticles(p.particles);
  };
  const onMotionChange=()=>{activeProfile='';apply()};
  const onResize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(apply,180);};
  reduced.addEventListener?.('change',onMotionChange);
  if(!reduced.addEventListener)reduced.addListener?.(onMotionChange);
  window.addEventListener('resize',onResize,{passive:true});
  window.addEventListener('pagehide',()=>clearTimeout(resizeTimer),{once:true});
  apply();
})();
