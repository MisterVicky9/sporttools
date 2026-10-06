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
    var h='<thead><tr>'+(o.rank?'<th class="nosort">#</th>':'');
    o.cols.forEach(function(c){
      var sortable=o.onSort && c.sortable!==false;
      h+='<th class="'+(c.txt?'txt ':'')+(c.k==='Name'?'name ':'')+(c.k===o.sortKey?'sorted ':'')+(sortable?'':'nosort')+'" data-k="'+esc(c.k)+'">'+esc(c.label)+(c.k===o.sortKey?(o.sortDir==='asc'?' ▲':' ▼'):'')+'</th>';
    });
    h+='</tr></thead><tbody>';
    o.rows.forEach(function(r,i){
      h+='<tr'+(o.rowClass&&o.rowClass(r)?' class="'+o.rowClass(r)+'"':'')+'>'+(o.rank?'<td class="rank">'+(i+1)+'</td>':'');
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
  function Picker(ctx,onChange){
    var self=this; this.ctx=ctx; this.onChange=onChange;
    var saved=null; try{ saved=JSON.parse(lsGet(LS_KEY)); }catch(e){}
    this.chosen=Array.isArray(saved)? saved.filter(function(n){ return n in ctx.meta; }) : VP.defaultCols(ctx);
    $('pickQ').addEventListener('input',function(){ self.draw(); });
    $('colsBtn').addEventListener('click',function(){ $('picker').classList.toggle('hidden'); });
    $('pickClear').addEventListener('click',function(){ self.set([]); });
    $('pickReset').addEventListener('click',function(){ self.set(VP.defaultCols(ctx)); });
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
  Picker.prototype.save=function(){ lsSet(LS_KEY,JSON.stringify(this.chosen)); };
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
    return 'Vicky+: 100 = league average, 20 points = 1 standard deviation within each season. Inputs: '+names+(ctx.full?'':' (add Z-Contact% and SwStr% to the export for the full six-input version)')+'.';
  }
  return {$:$, esc:esc, dataCol:dataCol, sortRows:sortRows, drawTable:drawTable, downloadCSV:downloadCSV, Picker:Picker, PICKER_HTML:PICKER_HTML, inputsNote:inputsNote};
})();
