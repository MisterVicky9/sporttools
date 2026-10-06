/* Shared top navigation. Edit LINKS to change the menu on every page. */
(function(){
  if(window.top!==window){var q=document.createElement('style');q.textContent='.page-nav{display:none!important}body::before{display:none!important}';document.head.appendChild(q);return;} /* no nav inside embeds */
  var LINKS=[
    {t:'Home',h:'index.html'},
    {t:'Blog',h:'blog.html'},
    {t:'Stat Card Builder',h:'statcard.html'},
    {t:'Leaderboards',k:[['Vicky+ Pitchers','vickyplus.html'],['Position Players','hitters.html']]},
    {t:'Calculators',k:[['wOBA','woba.html'],['wRC+','wrc-plus.html'],['FIP','fip.html'],['FIP-','fip-minus.html'],['Passer Rating','passer-rating.html'],['NBA Shooting','nba-shooting.html'],['Trade Value','trade-values.html']]}
  ];
  var css='.sitenav{position:sticky;top:0;z-index:9000;margin-top:5px;background:var(--blue-dark,#27646B);font-family:"Segoe UI",Arial,sans-serif;box-shadow:0 1px 0 rgba(0,0,0,.15)}'+
  '.sitenav-in{max-width:1100px;margin:0 auto;display:flex;align-items:center;padding:0 12px;position:relative}'+
  '.sitenav .brand{color:#fff;font-weight:800;letter-spacing:-.3px;font-size:17px;text-decoration:none;padding:12px 14px 12px 4px}'+
  '.sitenav ul{list-style:none;display:flex;margin:0;padding:0}'+
  '.sitenav li{position:relative}'+
  '.sitenav li>a{display:block;color:#e4f3f5;text-decoration:none;font-size:14px;font-weight:600;padding:14px 13px;background:none}'+
  '.sitenav li>a:hover,.sitenav li:hover>a,.sitenav li.cur>a{background:var(--blue,#3A9098);color:#fff}'+
  '.sitenav li.cur>a{box-shadow:inset 0 -3px 0 var(--red,#C8202F)}'+
  '.sitenav .dd{display:none;position:absolute;left:0;top:100%;min-width:180px;background:#fff;border-top:3px solid var(--red,#C8202F);box-shadow:0 6px 16px rgba(0,0,0,.2)}'+
  '.sitenav li:hover .dd,.sitenav li.open .dd{display:block}'+
  '.sitenav .dd a{display:block;padding:10px 16px;color:#1a1a1a;text-decoration:none;font-size:14px;background:none;white-space:nowrap}'+
  '.sitenav .dd a:hover,.sitenav .dd a.cur{background:var(--blue-tint,#E8F4F6);color:var(--blue-dark,#27646B)}'+
  '.sitenav .burger{display:none;margin-left:auto;background:none;border:0;color:#fff;font-size:26px;line-height:1;padding:8px 10px;cursor:pointer}'+
  '@media(max-width:760px){.sitenav .burger{display:block}.sitenav ul{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;background:var(--blue-dark,#27646B);max-height:80vh;overflow:auto}'+
  '.sitenav.open ul{display:flex}.sitenav li:hover .dd{display:none}.sitenav li.open .dd{display:block}.sitenav .dd{position:static;box-shadow:none;border-top:0;background:rgba(0,0,0,.18)}'+
  '.sitenav .dd a{color:#e4f3f5;padding-left:28px}.sitenav .dd a:hover,.sitenav .dd a.cur{background:var(--blue,#3A9098);color:#fff}}'+
  '.page-nav{display:none!important}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  var here=location.pathname.split('/').pop()||'index.html';
  if(here==='post.html')here='blog.html';
  var h='<div class="sitenav-in"><a class="brand" href="index.html">Sports Stat Tools</a><button class="burger" aria-label="Menu">&#9776;</button><ul>';
  LINKS.forEach(function(l){
    if(l.k){var cur=l.k.some(function(x){return x[1]===here});
      h+='<li class="'+(cur?'cur':'')+'"><a href="#" data-dd>'+l.t+' &#9662;</a><div class="dd">'+l.k.map(function(x){return '<a href="'+x[1]+'"'+(x[1]===here?' class="cur"':'')+'>'+x[0]+'</a>'}).join('')+'</div></li>';
    }else h+='<li class="'+(l.h===here?'cur':'')+'"><a href="'+l.h+'">'+l.t+'</a></li>';
  });
  h+='</ul></div>';
  var nav=document.createElement('nav');nav.className='sitenav';nav.innerHTML=h;
  function mount(){var cs=getComputedStyle(document.body),pl=parseFloat(cs.paddingLeft)||0,pr=parseFloat(cs.paddingRight)||0,pt=parseFloat(cs.paddingTop)||0;
    nav.style.marginLeft=-pl+'px';nav.style.marginRight=-pr+'px';nav.style.top='0';if(pt)nav.style.marginTop=(5-pt)+'px';nav.style.marginBottom='12px';
    document.body.insertBefore(nav,document.body.firstChild);
    nav.querySelector('.burger').onclick=function(){nav.classList.toggle('open')};
    [].forEach.call(nav.querySelectorAll('[data-dd]'),function(a){a.onclick=function(e){e.preventDefault();a.parentNode.classList.toggle('open')}});}
  if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
})();
