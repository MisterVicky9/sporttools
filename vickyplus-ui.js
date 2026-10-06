// Shared table / column-picker helpers for the Vicky+ pages.
var VPUI = (function(){
  var LS_KEY='vp_cols_v3';
  var $=function(id){ return document.getElementById(id); };
  var esc=function(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); };
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  function dataCol(ctx,name){
    var m=ctx.meta[name], i=ctx.idx[name];
    return {k:'c:'+name, label:name, txt:m.type==='text', get:function(r){ return r.raw[i]; }, fmt:VP.fmtFor(m)};
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
  return {$:$, esc:esc, dataCol:dataCol, sortRows:sortRows, drawTable:drawTable, downloadCSV:downloadCSV, Picker:Picker, PICKER_HTML:PICKER_HTML, inputsNote:inputsNote, teamName:teamName, buildCardState:buildCardState, launchCard:launchCard};
})();
