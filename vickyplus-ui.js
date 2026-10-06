// Shared table / column-picker helpers for the Vicky+ pages.
var VPUI = (function(){
  var LS_KEY='vp_cols_v3';
  var $=function(id){ return document.getElementById(id); };
  var esc=function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  function dataCol(ctx,name){
    var m=ctx.meta[name], i=ctx.idx[name];
    var col={k:'c:'+name, label:name, txt:m.type==='text', get:function(r){ return r.raw[i]; }, fmt:VP.fmtFor(m)};
    // WAR links to the WAR editor when the page provides VPUI.warHref(row) (single-season position player rows only)
    if(name==='WAR') col.html=function(r,s){ var h=VPUI.warHref&&VPUI.warHref(r); return h? '<a class="warlink" href="'+esc(h)+'" title="Open in WAR editor">'+esc(s)+'</a>' : esc(s); };
    return col;
  }
  function sortRows(rows,col,dir){
    var d=dir==='asc'?1:-1;
    return rows.slice().sort(function(a,b){
      var x=col.get(a), y=col.get(b), xn=(x==null||x===''), yn=(y==null||y==='');
      if(xn&&yn) return 0; if(xn) return 1; if(yn) return -1;
      return typeof x==='string' ? d*x.localeCompare(y) : d*(x-y);
    });
  }
  // o: {el, cols, rows, sortKey, sortDir, rank, onSort(k), rowClass(r)}
  function drawTable(o){
    var h='<thead><tr>'+(o.check?'<th class="nosort"></th>':'')+(o.rank?'<th class="nosort">#</th>':'');
    o.cols.forEach(function(c){
      var sortable=o.onSort && c.sortable!==false;
      h+='<th class="'+(c.txt?'txt ':'')+(c.k==='Name'?'name ':'')+(c.k===o.sortKey?'sorted ':'')+(sortable?'':'nosort')+'" data-k="'+esc(c.k)+'">'+esc(c.label)+(c.k===o.sortKey?(o.sortDir==='asc'?' ▲':' ▼'):'')+'</th>';
    });
    h+='</tr></thead><tbody>';
    o.rows.forEach(function(r,i){
      h+='<tr'+(o.rowClass&&o.rowClass(r)?' class="'+o.rowClass(r)+'"':'')+'>'+(o.check?'<td class="sel"><input type="checkbox" data-i="'+i+'"'+(o.check.on(r)?' checked':'')+(o.check.off(r)?' disabled':'')+' aria-label="Select row"></td>':'')+(o.rank?'<td class="rank">'+(i+1)+'</td>':'');
      o.cols.forEach(function(c){
        var v=c.get(r), s=c.fmt? c.fmt(v,r) : (v==null?'':v);
        s = c.html ? c.html(r,s) : esc(s);
        h+='<td class="'+(c.txt?'txt ':'')+(c.k==='Name'?'name ':'')+(c.bold?'key':'')+'">'+s+'</td>';
      });
      h+='</tr>';
    });
    o.el.innerHTML=h+'</tbody>';
    if(o.onSort) o.el.querySelectorAll('th[data-k]:not(.nosort)').forEach(function(th){ th.addEventListener('click',function(){ o.onSort(th.getAttribute('data-k')); }); });
  }
  function downloadCSV(cols,rows,filename,rank){
    var q=function(s){ s=String(s==null?'':s); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"' : s; };
    var out=[(rank?['Rank']:[]).concat(cols.map(function(c){return c.label;})).map(q).join(',')];
    rows.forEach(function(r,i){ out.push((rank?[i+1]:[]).concat(cols.map(function(c){ var v=c.get(r); return typeof v==='number'? Math.round(v*10000)/10000 : v; })).map(q).join(',')); });
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([out.join('\n')],{type:'text/csv'})); a.download=filename;
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  }

  // Column picker: shared selection (saved in localStorage) across pages.
  function Picker(ctx,onChange,opts){
    var self=this; this.ctx=ctx; this.onChange=onChange; this.key=(opts&&opts.key)||LS_KEY; this.defaults=(opts&&opts.defaults)||function(c){ return VP.defaultCols(c); };
    var saved=null; try{ saved=JSON.parse(lsGet(this.key)); }catch(e){}
    this.chosen=Array.isArray(saved)? saved.filter(function(n){ return n in ctx.meta; }) : this.defaults(ctx);
    $('pickQ').addEventListener('input',function(){ self.draw(); });
    $('colsBtn').addEventListener('click',function(){ $('picker').classList.toggle('hidden'); });
    $('pickClear').addEventListener('click',function(){ self.set([]); });
    $('pickReset').addEventListener('click',function(){ self.set(self.defaults(ctx)); });
    $('pickStats').addEventListener('click',function(){
      self.set(self.chosen.concat(ctx.columns.filter(function(c){return c.kind==='stat'&&self.chosen.indexOf(c.name)<0;}).map(function(c){return c.name;})));
    });
    $('picker').addEventListener('change',function(e){
      var n=e.target.getAttribute('data-n'); if(n===null) return; var i=self.chosen.indexOf(n);
      if(e.target.checked&&i<0) self.chosen.push(n); else if(!e.target.checked&&i>=0) self.chosen.splice(i,1);
      self.save(); onChange();
    });
    this.draw();
  }
  Picker.prototype.save=function(){ lsSet(this.key,JSON.stringify(this.chosen)); };
  Picker.prototype.set=function(a){ this.chosen=a; this.save(); this.draw(); this.onChange(); };
  Picker.prototype.draw=function(){
    var self=this, q=$('pickQ').value.trim().toLowerCase();
    ['info','stat'].forEach(function(kind){
      var h='';
      self.ctx.columns.forEach(function(c){
        if(c.kind!==kind || c.name==='Name' || c.name==='Season') return;
        if(q && c.name.toLowerCase().indexOf(q)<0) return;
        h+='<label><input type="checkbox" data-n="'+esc(c.name)+'"'+(self.chosen.indexOf(c.name)>=0?' checked':'')+'>'+esc(c.name)+'</label>';
      });
      $(kind==='info'?'pickInfo':'pickStat').innerHTML=h||'<span style="font-size:12px;color:#999">none</span>';
    });
  };
  Picker.prototype.cols=function(skip){
    var self=this; return this.chosen.filter(function(n){ return n!=='Name'&&n!=='Season'&&n!==skip; }).map(function(n){ return dataCol(self.ctx,n); });
  };
  var PICKER_HTML='<div class="picker hidden" id="picker"><div class="top"><input type="search" id="pickQ" placeholder="Find a column…"><button id="pickStats" type="button">Add all stats</button><button id="pickClear" type="button">Clear</button><button id="pickReset" type="button">Reset</button></div><h4>Player info</h4><div class="grid" id="pickInfo"></div><h4>Stats</h4><div class="grid" id="pickStat"></div></div>';
  function inputsNote(ctx){
    var names=ctx.feats.map(function(f){return f.key;}).join(', ');
    return 'Vicky+ is a composite of '+names+', weighted and scaled so 100 = league average (weighted by innings pitched) and 20 points = 1 standard deviation within each season.'+(ctx.full?'':' Add Z-Contact% and SwStr% to the export for the full six-input version.');
  }

  // ---- Stat card handoff (opens statcard.html with a prebuilt card) ----
  var MLB_NAMES={ARI:'Arizona Diamondbacks',ATL:'Atlanta Braves',BAL:'Baltimore Orioles',BOS:'Boston Red Sox',CHC:'Chicago Cubs',CHW:'Chicago White Sox',CWS:'Chicago White Sox',CIN:'Cincinnati Reds',CLE:'Cleveland Guardians',COL:'Colorado Rockies',DET:'Detroit Tigers',HOU:'Houston Astros',KCR:'Kansas City Royals',KC:'Kansas City Royals',LAA:'Los Angeles Angels',LAD:'Los Angeles Dodgers',MIA:'Miami Marlins',MIL:'Milwaukee Brewers',MIN:'Minnesota Twins',NYM:'New York Mets',NYY:'New York Yankees',OAK:'Oakland Athletics',ATH:'Oakland Athletics',PHI:'Philadelphia Phillies',PIT:'Pittsburgh Pirates',SDP:'San Diego Padres',SD:'San Diego Padres',SEA:'Seattle Mariners',SFG:'San Francisco Giants',SF:'San Francisco Giants',STL:'St. Louis Cardinals',TBR:'Tampa Bay Rays',TB:'Tampa Bay Rays',TEX:'Texas Rangers',TOR:'Toronto Blue Jays',WSN:'Washington Nationals',WSH:'Washington Nationals'};
  var CARD_COLORS=['#111111','#A71930','#5A5A5A','#1A5FB4','#2E7D32','#6A1B9A'];
  function teamName(s){
    if(!s) return '';
    var t=String(s).split(/[^A-Za-z]+/);
    for(var i=0;i<t.length;i++) if(MLB_NAMES[t[i].toUpperCase()]) return MLB_NAMES[t[i].toUpperCase()];
    return '';
  }
  // columns: [{label, row}] (max 6); statCols: [{label,get,fmt}]; opts: {title, team, subtitle}
  function buildCardState(columns, statCols, opts){
    columns=columns.slice(0,6);
    var rows=statCols.map(function(c){
      return {label:c.label, isPctl:false, values:columns.map(function(k){
        var v=c.get(k.row), s=c.fmt? c.fmt(v,k.row) : (v==null?'':String(v));
        return {value:(s===''||s==null)?'—':String(s), rawstat:''};
      })};
    });
    return {version:1, title:opts.title||'', team:opts.team||'', subtitle:opts.subtitle||'', cardStyle:'table', mainPhoto:null,
      columns:columns.map(function(k,i){ return {label:k.label, team:(k.team!=null?k.team:teamName((k.row&&(k.row.Team||k.row.Name))||'')), color:CARD_COLORS[i]||'#333333', photo:null}; }), rows:rows};
  }
  function launchCard(state){
    var b=btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    location.href='statcard.html#vp='+b;
  }

  // Season-by-season line chart of any stat. opts: {host, ctx, extra:[{k,label,get,fmt}], rows (one total row per season), seasons, def (key)}
  var chartKey=null, showLg=(lsGet('vp_chart_lg')!=='0');
  function statChart(o){
    var opts=[].concat(o.extra||[]);
    Object.keys(o.ctx.meta).forEach(function(n){
      var m=o.ctx.meta[n]; if(m.type==='text'||n==='Season'||n==='Name'||n==='Team') return;
      opts.push(dataCol(o.ctx,n));
    });
    opts=opts.filter(function(c){ return o.rows.some(function(r){ var v=c.get(r); return typeof v==='number'&&isFinite(v); }); });
    var seen={}; opts=opts.filter(function(c){ if(seen[c.label]) return false; seen[c.label]=1; return true; });
    if(!opts.length){ o.host.innerHTML=''; return; }
    var cur=opts.filter(function(c){ return c.k===chartKey; })[0] || opts.filter(function(c){ return c.k===o.def; })[0] || opts[0];
    function draw(){
      var pts=o.rows.map(function(r){ return {Season:r.Season, y:cur.get(r), r:r}; }).filter(function(p){ return typeof p.y==='number'&&isFinite(p.y); });
      var W=640,H=220,L=48,R=16,T=18,B=30;
      var meta=o.ctx.meta[cur.label], plain=meta&&meta.agg==='sum';
      var lg=!showLg? [] : o.seasons.map(function(s){
        var rs=o.pop? o.pop(s) : [], sw=0, sv=0, n=0;
        rs.forEach(function(r){ var v=cur.get(r); if(typeof v!=='number'||!isFinite(v)) return; var w=plain?1:(o.wt(r)||0); sw+=w; sv+=v*w; n++; });
        return (n>=5&&sw>0)? {Season:s, y:sv/sw} : null;
      }).filter(Boolean);
      var ys=pts.map(function(p){return p.y;}).concat(lg.map(function(p){return p.y;}));
      var lo=Math.min.apply(null,ys), hi=Math.max.apply(null,ys); if(hi===lo){ hi+=1; lo-=1; }
      var span=hi-lo, pw=Math.pow(10,Math.floor(Math.log10(span))), step=[1,2,2.5,5,10].map(function(m){return m*pw;}).filter(function(s){ return span/s<=6; })[0]||pw*10;
      lo=Math.floor(lo/step-1e-9)*step; hi=Math.ceil(hi/step+1e-9)*step;
      var sea=o.seasons, x=function(s){ return L+(sea.length>1?(s-sea[0])/(sea[sea.length-1]-sea[0]):0.5)*(W-L-R); };
      var y=function(v){ return T+(1-(v-lo)/(hi-lo))*(H-T-B); };
      var f=function(v,r){ return cur.fmt? cur.fmt(v,r) : (Math.abs(v)>=100? String(Math.round(v)) : (+v.toFixed(3)).toString()); };
      var g='', t;
      for(t=lo;t<=hi+step/2;t+=step){ var yy=y(t); g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+yy+'" y2="'+yy+'" stroke="#e4e4e4"/><text x="'+(L-6)+'" y="'+(yy+4)+'" text-anchor="end" font-size="11" fill="#888">'+esc(f(+t.toFixed(6)))+'</text>'; }
      if(lg.length) g+='<path d="'+lg.map(function(p,i){ return (i?'L':'M')+x(p.Season)+','+y(p.y); }).join(' ')+'" fill="none" stroke="#C8202F" stroke-width="2" stroke-dasharray="5 4"/>'+lg.map(function(p){ return '<circle cx="'+x(p.Season)+'" cy="'+y(p.y)+'" r="2.5" fill="#C8202F"/>'; }).join('');
      sea.forEach(function(s){ g+='<text x="'+x(s)+'" y="'+(H-10)+'" text-anchor="middle" font-size="11" fill="#888">'+s+'</text>'; });
      g+='<path d="'+pts.map(function(p,i){ return (i?'L':'M')+x(p.Season)+','+y(p.y); }).join(' ')+'" fill="none" stroke="#3A9098" stroke-width="2.5"/>';
      pts.forEach(function(p){ g+='<circle cx="'+x(p.Season)+'" cy="'+y(p.y)+'" r="4" fill="#3A9098"/><text x="'+x(p.Season)+'" y="'+(y(p.y)-9)+'" text-anchor="middle" font-size="11" font-weight="700" fill="#222">'+esc(f(p.y,p.r))+'</text>'; });
      o.host.querySelector('.chartsvg').innerHTML='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(cur.label)+' by season">'+g+'</svg>';
    }
    o.host.innerHTML='<div style="margin:0 0 6px"><select class="chartsel" aria-label="Chart stat" style="padding:6px 8px;border:1px solid #cfc8b8;border-radius:4px;font-size:14px;background:#fff">'+opts.map(function(c){ return '<option value="'+esc(c.k)+'"'+(c===cur?' selected':'')+'>'+esc(c.label)+'</option>'; }).join('')+'</select> <label style="font-size:13px;color:#C8202F;margin-left:10px;cursor:pointer;white-space:nowrap"><input type="checkbox" class="chartlg"'+(showLg?' checked':'')+'> - - League average</label></div><div class="chartsvg"></div>';
    o.host.querySelector('.chartsel').onchange=function(){ var k=this.value; cur=opts.filter(function(c){return c.k===k;})[0]; chartKey=k; draw(); };
    o.host.querySelector('.chartlg').onchange=function(){ showLg=this.checked; lsSet('vp_chart_lg',showLg?'1':'0'); draw(); };
    draw();
  }
  return {statChart:statChart, $:$, esc:esc, dataCol:dataCol, sortRows:sortRows, drawTable:drawTable, downloadCSV:downloadCSV, Picker:Picker, PICKER_HTML:PICKER_HTML, inputsNote:inputsNote, teamName:teamName, buildCardState:buildCardState, launchCard:launchCard};
})();
