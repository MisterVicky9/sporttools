/* Blog engine: reads posts/index.json, renders markdown posts from posts/<slug>/post.md */
var Blog=(function(){
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function parse(txt){
    var m=/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(txt.replace(/\r/g,'')),meta={},body=txt;
    if(m){body=m[2];m[1].split('\n').forEach(function(l){var i=l.indexOf(':');if(i>0)meta[l.slice(0,i).trim().toLowerCase()]=l.slice(i+1).trim().replace(/^["']|["']$/g,'')})}
    return{meta:meta,body:body};
  }
  function fixUrls(html,slug){
    var base='posts/'+slug+'/';
    return html.replace(/(\s)(src|href|poster)="(?!https?:|\/\/|#|data:|mailto:|\/)([^"]+)"/g,function(_,sp,a,u){u=u;
      if(/^[\w-]+\.html(\?|#|$)/.test(u))return sp+a+'="'+u+'"'; /* links to site pages stay root-relative */
      if(/^\.\.\//.test(u))return sp+a+'="'+u.replace(/^\.\.\//,'')+'"';
      return sp+a+'="'+base+u+'"';});
  }
  function cards(html,slug){
    return html.replace(/<div class="statcard" data-src="([^"]+)"><\/div>/g,function(_,u){
      return '<div class="embed sc"><iframe src="statcard.html?embed=1&src='+encodeURIComponent('posts/'+slug+'/'+u)+'" loading="lazy" scrolling="no"></iframe></div>';});
  }
  window.addEventListener('message',function(e){
    if(!e.data||!e.data.sstCardHeight)return;
    [].forEach.call(document.querySelectorAll('.embed.sc iframe'),function(f){if(f.contentWindow===e.source)f.style.height=Math.ceil(e.data.sstCardHeight)+'px'});
  });
  function fmtDate(d){var t=new Date(d+'T12:00:00');return isNaN(t)?d:t.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}
  function exists(e){return fetch('posts/'+encodeURIComponent(e.slug)+'/post.md',{method:'HEAD',cache:'no-cache'}).then(function(r){return r.ok},function(){return true})}
  function load(){return fetch('posts/index.json',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(a){return Promise.all(a.map(exists)).then(function(ok){return a.filter(function(_,i){return ok[i]})})}).then(function(a){return a.sort(function(x,y){return x.date<y.date?1:x.date>y.date?-1:0})})}
  function fetchPost(slug){return fetch('posts/'+slug+'/post.md',{cache:'no-cache'}).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){var p=parse(t);p.slug=slug;p.html=cards(fixUrls(marked.parse(p.body,{gfm:true,breaks:false}),slug),slug);return p})}
  function render(p,full){
    var m=p.meta,h='<article class="post"><h2 class="ptitle"><a href="post.html?p='+encodeURIComponent(p.slug)+'">'+esc(m.title||p.slug)+'</a></h2>'+
      '<div class="meta">'+(m.date?fmtDate(m.date):'')+(m.read?' · '+esc(m.read)+' min read':'')+'</div>';
    if(m.cover)h+='<img class="cover" src="posts/'+p.slug+'/'+esc(m.cover)+'" alt="">';
    return h+'<div class="body">'+p.html+'</div></article>';
  }
  function feed(el,limit){
    return load().then(function(list){
      if(!list.length){el.innerHTML='<div class="empty">No posts yet.</div>';return}
      var shown=list.slice(0,limit||50);
      return Promise.all(shown.map(function(e){return fetchPost(e.slug).catch(function(){return null})})).then(function(ps){
        el.innerHTML=ps.filter(Boolean).map(function(p){return render(p)}).join('')+(list.length>shown.length?'<a class="readmore" href="blog.html">All posts →</a>':'');
      });
    }).catch(function(){el.innerHTML='<div class="empty">Posts could not be loaded (posts/index.json missing).</div>'});
  }
  function titles(el){
    return load().then(function(list){
      el.innerHTML=list.length?'<ul class="list">'+list.map(function(e){return '<li><a href="post.html?p='+encodeURIComponent(e.slug)+'"><div class="t">'+esc(e.title)+'</div><div class="d">'+fmtDate(e.date)+(e.summary?' — '+esc(e.summary):'')+'</div></a></li>'}).join('')+'</ul>':'<div class="empty">No posts yet.</div>';
    }).catch(function(){el.innerHTML='<div class="empty">Posts could not be loaded (posts/index.json missing).</div>'});
  }
  function single(el){
    var slug=new URLSearchParams(location.search).get('p');
    if(!slug){el.innerHTML='<div class="empty">No post selected.</div>';return}
    return fetchPost(slug).then(function(p){document.title=(p.meta.title||slug)+' – Sports Stat Tools';el.innerHTML=render(p)+'<a class="readmore" href="blog.html">← All posts</a>'}).catch(function(){el.innerHTML='<div class="empty">Post not found.</div>'});
  }
  return{feed:feed,titles:titles,single:single,parse:parse};
})();
