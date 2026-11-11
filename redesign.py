from pathlib import Path
p=Path('/mnt/data/hvt_work/public/index.html')
s=p.read_text()
# remove external font import from CSS later
old='''<header class="top"><div class="brand"><span class="logo">✦</span><div><b>HỌC VIỆN THIÊN TINH</b><small>星辰學院 · FANTASY ACADEMY</small></div></div><button id="themeBtn" class="soft">☾</button></header>'''
new='''<header class="top academyTop">
  <div class="brand academyBrand">
    <span class="logo brandCrest" aria-hidden="true">✦</span>
    <div class="brandText"><b>HỌC VIỆN THIÊN TINH</b><small>星辰學院 · DREAM AMONG THE STARS</small></div>
  </div>
  <div class="topActions"><button id="themeBtn" class="topIcon" aria-label="Đổi giao diện">☾</button></div>
</header>'''
s=s.replace(old,new)
old_nav='''<div class="layout"><aside class="sidebar card"><button data-page="dashboard" class="nav active">🏠 Tổng quan</button><button data-page="characters" class="nav">🧚 Hồ sơ OC</button><button data-page="members" class="nav">👥 Thành viên</button><button data-page="chat" class="nav">💬 Chat</button><button data-page="profile" class="nav">🪪 Hồ sơ cá nhân</button><button data-page="academy" class="nav">🏫 Khoa & lớp</button><button data-page="quests" class="nav">📜 Nhiệm vụ</button><button data-page="mailbox" class="nav">✉️ Hòm thư <span id="mailUnread" class="mailCount">0</span></button><button data-page="shop" class="nav">🛍️ Cửa hàng</button><button data-page="inventory" class="nav">🎒 Túi đồ</button><button data-page="map" class="nav">🗺️ Khám phá</button><button data-page="rank" class="nav">🏆 Thành tích</button><button data-page="admin" class="nav adminOnly hidden">⚙️ Quản trị</button></aside>'''
new_nav='''<div class="layout"><aside class="sidebar academyMenu card">
  <div class="menuTitle"><span class="titleSeal">✦</span><div><strong>HỌC VIỆN</strong><small>ĐIỀU HƯỚNG</small></div></div>
  <div class="navGrid">
    <button data-page="dashboard" class="nav active"><span class="navIcon"><svg><use href="#i-home"/></svg></span><span class="navLabel">Tổng quan</span></button>
    <button data-page="characters" class="nav"><span class="navIcon"><svg><use href="#i-character"/></svg></span><span class="navLabel">Hồ sơ OC</span></button>
    <button data-page="members" class="nav"><span class="navIcon"><svg><use href="#i-members"/></svg></span><span class="navLabel">Thành viên</span></button>
    <button data-page="chat" class="nav"><span class="navIcon"><svg><use href="#i-chat"/></svg></span><span class="navLabel">Trò chuyện</span></button>
    <button data-page="profile" class="nav"><span class="navIcon"><svg><use href="#i-profile"/></svg></span><span class="navLabel">Hồ sơ cá nhân</span></button>
    <button data-page="academy" class="nav"><span class="navIcon"><svg><use href="#i-academy"/></svg></span><span class="navLabel">Khoa & lớp</span></button>
    <button data-page="quests" class="nav"><span class="navIcon"><svg><use href="#i-quest"/></svg></span><span class="navLabel">Nhiệm vụ</span></button>
    <button data-page="mailbox" class="nav"><span class="navIcon"><svg><use href="#i-mail"/></svg></span><span class="navLabel">Hòm thư</span><span id="mailUnread" class="mailCount">0</span></button>
    <button data-page="shop" class="nav"><span class="navIcon"><svg><use href="#i-shop"/></svg></span><span class="navLabel">Cửa hàng</span></button>
    <button data-page="inventory" class="nav"><span class="navIcon"><svg><use href="#i-bag"/></svg></span><span class="navLabel">Túi đồ</span></button>
    <button data-page="map" class="nav"><span class="navIcon"><svg><use href="#i-map"/></svg></span><span class="navLabel">Khám phá</span></button>
    <button data-page="rank" class="nav"><span class="navIcon"><svg><use href="#i-rank"/></svg></span><span class="navLabel">Thành tích</span></button>
    <button data-page="admin" class="nav adminOnly hidden"><span class="navIcon"><svg><use href="#i-admin"/></svg></span><span class="navLabel">Quản trị</span></button>
  </div>
</aside>'''
if old_nav not in s: raise SystemExit('nav block not found')
s=s.replace(old_nav,new_nav)
old_mobile='''<nav class="mobileNav hidden" id="mobileNav"><button data-page="dashboard">🏠</button><button data-page="characters">🧚</button><button data-page="members">👥</button><button data-page="profile">🪪</button><button data-page="quests">📜</button><button data-page="chat">💬</button><button data-page="mailbox">✉️</button><button data-page="shop">🛍️</button></nav>'''
new_mobile='''<nav class="mobileNav hidden" id="mobileNav" aria-label="Điều hướng nhanh">
  <button data-page="dashboard"><svg><use href="#i-home"/></svg><span>Tổng quan</span></button>
  <button data-page="characters"><svg><use href="#i-character"/></svg><span>OC</span></button>
  <button data-page="members"><svg><use href="#i-members"/></svg><span>Thành viên</span></button>
  <button data-page="chat"><svg><use href="#i-chat"/></svg><span>Chat</span></button>
  <button data-page="profile"><svg><use href="#i-profile"/></svg><span>Hồ sơ</span></button>
  <button data-page="academy"><svg><use href="#i-academy"/></svg><span>Khoa</span></button>
  <button data-page="quests"><svg><use href="#i-quest"/></svg><span>Nhiệm vụ</span></button>
  <button data-page="mailbox"><svg><use href="#i-mail"/></svg><span>Hòm thư</span></button>
  <button data-page="shop"><svg><use href="#i-shop"/></svg><span>Cửa hàng</span></button>
  <button data-page="inventory"><svg><use href="#i-bag"/></svg><span>Túi đồ</span></button>
  <button data-page="map"><svg><use href="#i-map"/></svg><span>Khám phá</span></button>
  <button data-page="rank"><svg><use href="#i-rank"/></svg><span>Thành tích</span></button>
</nav>'''
if old_mobile not in s: raise SystemExit('mobile block not found')
s=s.replace(old_mobile,new_mobile)
# Replace emoji headings/primary labels with cleaner text, preserving IDs and functionality
repls={
'<h2>✧ Bảng tin học viện</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>HỌC VIỆN THIÊN TINH</small><h2>Bảng tin học viện</h2></div></div>',
'<button id="trainBtn" class="primary" type="button">⚔️ Luyện tập (+25 EXP · -5 HP)</button>':'<button id="trainBtn" class="primary actionBtn" type="button"><span class="btnIcon">✦</span> Luyện tập <small>(+25 EXP · −5 HP)</small></button>',
'<h2>🧚 Hồ sơ nhân vật OC</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>NHÂN VẬT</small><h2>Hồ sơ OC</h2></div></div>',
'<h2>💬 Phòng trò chuyện</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>KẾT NỐI HỌC VIỆN</small><h2>Trò chuyện</h2></div></div>',
'<h2>👥 Thành viên học viện</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>CỘNG ĐỒNG</small><h2>Thành viên học viện</h2></div></div>',
'<h2>🪪 Hồ sơ cá nhân</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>HỌC VIÊN</small><h2>Hồ sơ cá nhân</h2></div></div>',
'<h2>🏫 Các khoa của học viện</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>HỌC VIỆN</small><h2>Khoa & lớp</h2></div></div>',
'<h2>📜 Nhiệm vụ</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>HÀNH TRÌNH</small><h2>Nhiệm vụ</h2></div></div>',
'<h2>✉️ Hòm thư học viện <span id="mailUnreadTitle" class="mailCount">0</span></h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>TIN NHẮN & PHẦN THƯỞNG</small><h2>Hòm thư học viện <span id="mailUnreadTitle" class="mailCount">0</span></h2></div></div>',
'<h2>🛍️ Cửa hàng tinh tú</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>GIAO DỊCH</small><h2>Cửa hàng tinh tú</h2></div></div>',
'<h2>🎒 Túi đồ OC</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>TÀI SẢN</small><h2>Túi đồ OC</h2></div></div>',
'<h2>🗺️ Bản đồ học viện</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>KHÁM PHÁ</small><h2>Bản đồ học viện</h2></div></div>',
'<h2>🏆 Bảng thành tích</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>VINH DANH</small><h2>Bảng thành tích</h2></div></div>',
'<h2>⚙️ Bảng quản trị</h2>':'<div class="sectionRibbon"><span class="ribbonMark">✦</span><div><small>HỆ THỐNG</small><h2>Bảng quản trị</h2></div></div>'
}
for a,b in repls.items(): s=s.replace(a,b)
# Add SVG symbol definitions immediately after body
symbols='''\n<svg class="iconDefs" aria-hidden="true" focusable="false"><defs>\n<symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v8.2a2 2 0 0 1-2 2h-4.8v-6.2H9.8V21H5a2 2 0 0 1-2-2z"/><path d="M8 21v-6.2h8V21"/></symbol>\n<symbol id="i-character" viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.2"/><path d="M5.5 20c.7-4.2 3-6.2 6.5-6.2s5.8 2 6.5 6.2"/><path d="M5 5.5 3.7 8l2 1.2M19 5.5 20.3 8l-2 1.2"/></symbol>\n<symbol id="i-members" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 19c.5-4 2.4-6 5.5-6s5 2 5.5 6M14 14.5c2.8-.2 4.7 1.2 5.3 4.5"/></symbol>\n<symbol id="i-chat" viewBox="0 0 24 24"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H10l-4.5 4v-4.5A3.5 3.5 0 0 1 4 11.5z"/><path d="M8 7.5h8M8 10.5h5"/></symbol>\n<symbol id="i-profile" viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="3.2"/><path d="M5.5 20c.8-4.2 3-6.2 6.5-6.2s5.7 2 6.5 6.2"/><path d="M17.5 3.5h3v3"/></symbol>\n<symbol id="i-academy" viewBox="0 0 24 24"><path d="m3 9 9-5 9 5-9 5z"/><path d="M6 11v5.5c2.8 2 9.2 2 12 0V11M12 14v6"/></symbol>\n<symbol id="i-quest" viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 12h6M9 16h5"/><path d="m9 8 1 1 2-2"/></symbol>\n<symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></symbol>\n<symbol id="i-shop" viewBox="0 0 24 24"><path d="M4 10h16v10H4zM3 10l2-5h14l2 5"/><path d="M7 5v5M12 5v5M17 5v5"/></symbol>\n<symbol id="i-bag" viewBox="0 0 24 24"><path d="M5 8h14l1 13H4z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M9 13h6"/></symbol>\n<symbol id="i-map" viewBox="0 0 24 24"><path d="m4 5 6-2 4 2 6-2v16l-6 2-4-2-6 2z"/><path d="M10 3v16M14 5v16"/></symbol>\n<symbol id="i-rank" viewBox="0 0 24 24"><path d="m12 3 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9L9.5 8z"/><path d="M7 20h10"/></symbol>\n<symbol id="i-admin" viewBox="0 0 24 24"><path d="M12 3 20 6v5c0 5-3.3 8-8 10-4.7-2-8-5-8-10V6z"/><path d="M12 8v5M12 16h.01"/></symbol>\n</defs></svg>\n'''
s=s.replace('<body>', '<body>'+symbols,1)
p.write_text(s)
