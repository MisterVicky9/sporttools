// Vicky+ core: data loading, Vicky+ scoring, grouping/aggregation, projections. No DOM access.
var VP = (function(){
  var FEATS = [
    {key:'K-BB%',      sign: 1, w:0.1000},
    {key:'Stuff+',     sign: 1, w:0.5744},
    {key:'Pitching+',  sign: 1, w:0.1576},
    {key:'Z-Contact%', sign:-1, w:0.0813},
    {key:'SwStr%',     sign: 1, w:0.0439},
    {key:'GB%',        sign: 1, w:0.0427}
  ];
  // Projection constants: K = IP shrink, b = runs/9 (or ERA) per shrunk z, rho = year-to-year carry.
  // "full" = all six inputs in the data file, "lite" = the four inputs that are available without Z-Contact%/SwStr%.
  var CONSTS = {
    full:{K:10, b:0.5701, bERA:0.5885, rho:0.9149},
    lite:{K:10, b:0.5604, bERA:0.5810, rho:0.9090}
  };
  var REF_IP = 20;

  function ipToThirds(ip){ var w=Math.floor(ip+1e-9), f=Math.round((ip-w)*10)/10; return w+f*10/3; }
  function mean(a){ var s=0; for(var i=0;i<a.length;i++) s+=a[i]; return s/a.length; }
  function sd(a){ var m=mean(a),s=0; for(var i=0;i<a.length;i++) s+=(a[i]-m)*(a[i]-m); return Math.sqrt(s/(a.length-1)); }

  // ---------- load ----------
  function load(data){
    var idx={}, meta={};
    data.columns.forEach(function(c,i){ idx[c.name]=i; meta[c.name]=c; });
    var miss=['Season','Name','IP'].filter(function(n){ return !(n in idx); });
    if(miss.length) throw new Error('Data file is missing column(s): '+miss.join(', '));
    var ctx={columns:data.columns, idx:idx, meta:meta, rows:data.rows};
    ctx.feats=FEATS.filter(function(f){
      if(!(f.key in idx)) return false;
      var n=0; for(var i=0;i<data.rows.length;i++) if(data.rows[i][idx[f.key]]!==null) n++;
      return n>data.rows.length*0.5;
    });
    if(ctx.feats.length<2) throw new Error('Not enough Vicky+ input columns in the data file.');
    ctx.full = ctx.feats.length===FEATS.length;
    ctx.idCol = 'MLBAMID' in idx ? 'MLBAMID' : ('PlayerId' in idx ? 'PlayerId' : null);
    ctx.hasR = 'R' in idx; ctx.hasERA = 'ERA' in idx;
    ctx.recs=[];
    data.rows.forEach(function(row){
      var season=row[idx['Season']], ip=row[idx['IP']];
      if(season===null||ip===null||season===undefined) return;
      ctx.recs.push(makeRec(ctx,row));
    });
    if(!ctx.recs.length) throw new Error('No usable rows in the data file.');
    return ctx;
  }
  function roleOf(ctx,row,ipt){
    var G=('G' in ctx.idx)?row[ctx.idx['G']]:null, GS=('GS' in ctx.idx)?row[ctx.idx['GS']]:null;
    return (G && GS!==null && GS!==undefined) ? ((GS/G)>=0.5?'sp':'rp') : (ipt>=80?'sp':'rp');
  }
  function makeRec(ctx,row){
    var idx=ctx.idx, ip=row[idx['IP']], ipt=ipToThirds(ip);
    var r={raw:row, Season:row[idx['Season']], SeasonLabel:String(row[idx['Season']]), Name:row[idx['Name']]||'',
           Team:('Team' in idx)?(row[idx['Team']]||''):'', IP:ip, IPt:ipt, n:1,
           id: ctx.idCol? String(row[idx[ctx.idCol]]) : (row[idx['Name']]||''), role:roleOf(ctx,row,ipt), f:{}};
    FEATS.forEach(function(f){ r.f[f.key]= (f.key in idx)? row[idx[f.key]] : null; });
    return r;
  }

  // ---------- aggregation ----------
  // Merge several rows of the same kind (stints, seasons, a whole team) into one row.
  function aggregate(group, ctx){
    var n=group.length; if(n===1){ var g=group[0]; return {raw:g.raw, Season:g.Season, SeasonLabel:g.SeasonLabel, Name:g.Name, Team:g.Team, IP:g.IP, IPt:g.IPt, n:1, id:g.id, role:g.role, f:g.f, V:g.V, Cz:g.Cz, rows:group}; }
    var cols=ctx.columns, out=new Array(cols.length), W=0, i, j;
    group.forEach(function(r){ W+=r.IPt; });
    for(i=0;i<cols.length;i++){
      var m=cols[i], v=null, a, w, s;
      if(m.agg==='sum'){ s=0; a=0; for(j=0;j<n;j++){ var x=group[j].raw[i]; if(x!==null&&x!==undefined){ s+=x; a++; } } v=a?s:null; }
      else if(m.agg==='ip'){ v=null; var outs=Math.round(W*3); v=Math.floor(outs/3)+(outs%3)/10; }
      else if(m.agg==='max'){ for(j=0;j<n;j++){ var y=group[j].raw[i]; if(y!==null&&y!==undefined&&(v===null||y>v)) v=y; } }
      else if(m.agg==='wavg'){ s=0; w=0; var su=0, c=0; for(j=0;j<n;j++){ var z=group[j].raw[i]; if(z!==null&&z!==undefined){ s+=z*group[j].IPt; w+=group[j].IPt; su+=z; c++; } } v= c? (w>0? s/w : su/c) : null; }
      else { v=group[0].raw[i]; if(m.type==='text'){ for(j=1;j<n;j++) if(group[j].raw[i]!==v){ v= (m.name==='Team')? '- - -' : v; break; } } }
      out[i]=v;
    }
    var seasons=group.map(function(r){return r.Season;}), lo=Math.min.apply(null,seasons), hi=Math.max.apply(null,seasons);
    var r={raw:out, Season:hi, SeasonLabel: lo===hi? String(hi) : lo+'-'+hi, Name:group[0].Name, n:n, rows:group,
           id:group[0].id, IPt:W, f:{}};
    r.IP=out[ctx.idx['IP']];
    var teams={}; group.forEach(function(g){ teams[g.Team]=1; });
    r.Team = Object.keys(teams).length>1 ? '- - -' : group[0].Team;
    r.role=roleOf(ctx,out,W);
    FEATS.forEach(function(f){ r.f[f.key]=(f.key in ctx.idx)? out[ctx.idx[f.key]] : null; });
    var vs=0, vw=0, zs=0; group.forEach(function(g){ if(g.V!==undefined){ vs+=g.V*g.IPt; zs+=g.Cz*g.IPt; vw+=g.IPt; } });
    if(vw>0){ r.V=vs/vw; r.Cz=zs/vw; }
    return r;
  }
  function groupBy(recs,keyFn){
    var m={}, order=[];
    recs.forEach(function(r){ var k=keyFn(r); if(!(k in m)){ m[k]=[]; order.push(k); } m[k].push(r); });
    return order.map(function(k){ return m[k]; });
  }

  // ---------- scoring ----------
  // Reference mean/sd come from player-season totals (all of a player's teams combined); stints are scored against the same reference.
  function score(ctx){
    var feats=ctx.feats, wsum=0; feats.forEach(function(f){ wsum+=f.w; });
    var totals=groupBy(ctx.recs,function(r){ return r.Season+'|'+r.id; }).map(function(g){ return aggregate(g,ctx); });
    var seasons=[], seen={}; totals.forEach(function(t){ if(!seen[t.Season]){ seen[t.Season]=1; seasons.push(t.Season); } });
    seasons.sort(function(a,b){return a-b;});
    var lg={}, teams={};
    ctx.recs.forEach(function(r){ if(r.Team) teams[r.Team]=1; });
    seasons.forEach(function(s){
      var T=totals.filter(function(t){ return t.Season===s; }), S=ctx.recs.filter(function(r){ return r.Season===s; });
      // league baseline for projections: runs/9 if R exists, otherwise IP-weighted ERA
      var num=0, den=0;
      S.forEach(function(r){
        var x = ctx.hasR? r.raw[ctx.idx['R']] : (ctx.hasERA? r.raw[ctx.idx['ERA']] : null);
        if(x===null||x===undefined) return;
        if(ctx.hasR){ num+=x; den+=r.IPt; } else { num+=x*r.IPt; den+=r.IPt; }
      });
      lg[s]= den>0? (ctx.hasR? 9*num/den : num/den) : null;
      var refT=T.filter(function(t){ return t.IPt>=REF_IP; }); if(refT.length<10) refT=T;
      var zs={};
      feats.forEach(function(f){
        var vals=[]; refT.forEach(function(t){ var v=t.f[f.key]; if(v!==null&&v!==undefined) vals.push(v*f.sign); });
        zs[f.key]= vals.length>1? {m:mean(vals), s:sd(vals)||1} : {m:0,s:1};
      });
      var comp=function(r){ var C=0; feats.forEach(function(f){ var v=r.f[f.key]; var z=(v===null||v===undefined)?0:(v*f.sign-zs[f.key].m)/zs[f.key].s; C+=z*f.w/wsum; }); return C; };
      var cv=refT.map(comp), cm=mean(cv), cs=sd(cv)||1;
      // 100 = IP-weighted league average (like wRC+ / FIP-): centre on the innings-weighted mean of every pitcher's season total
      var mw=0, ww=0; T.forEach(function(t){ mw+=((comp(t)-cm)/cs)*t.IPt; ww+=t.IPt; }); var mu=ww>0? mw/ww : 0;
      var setV=function(r){ r.Cz=(comp(r)-cm)/cs-mu; r.V=100+20*r.Cz; };
      T.forEach(setV);
      S.forEach(setV);
    });
    return {ctx:ctx, recs:ctx.recs, totals:totals, seasons:seasons, lg:lg, teams:Object.keys(teams).sort()};
  }

  // ---------- views ----------
  // o: {mode:'player'|'team', from, to, team, splitTeams, splitSeasons, role, minIP, q}
  function view(sc,o){
    var ctx=sc.ctx, q=(o.q||'').toLowerCase();
    var S=sc.recs.filter(function(r){
      if(r.Season<o.from || r.Season>o.to) return false;
      if(o.team && o.team!=='all' && r.Team!==o.team) return false;
      if(o.role && o.role!=='all' && r.role!==o.role) return false;
      return true;
    });
    var inRange=function(r){ return r.IPt>=(o.minIP||0) && (o.maxIP==null || r.IPt<=o.maxIP); };
    var rows;
    if(o.mode==='team'){
      // pitcher-level IP filter first (a pitcher's IP with that team, per season unless seasons are combined), then roll up to teams
      var pit=groupBy(S,function(r){ return r.Team+'|'+r.id+'|'+(o.splitSeasons? r.Season:''); }).map(function(g){ return aggregate(g,ctx); }).filter(inRange);
      rows=groupBy(pit,function(r){ return r.Team+'|'+(o.splitSeasons? r.Season:''); }).map(function(g){ var a=aggregate(g,ctx); a.Name=g[0].Team; a.Team=g[0].Team; a.pitchers=g.length; return a; });
      return rows.filter(function(r){ return !q || (r.Name).toLowerCase().indexOf(q)>=0; });
    }
    var key=function(r){ return r.id+'|'+(o.splitSeasons? r.Season:'')+'|'+(o.splitTeams? r.Team:''); };
    rows=groupBy(S,key).map(function(g){ return aggregate(g,ctx); });
    return rows.filter(function(r){
      if(!inRange(r)) return false;
      if(q && (r.Name+' '+r.Team).toLowerCase().indexOf(q)<0) return false;
      return true;
    });
  }

  // ---------- projection ----------
  function project(sc){
    var ctx=sc.ctx, s=sc.seasons[sc.seasons.length-1], c=ctx.full?CONSTS.full:CONSTS.lite, base=sc.lg[s];
    var b = ctx.hasR? c.b : c.bERA, out=[];
    sc.totals.forEach(function(t){
      if(t.Season!==s) return;
      var rel=t.IPt/(t.IPt+c.K), x=t.Cz*rel;
      var p=Object.create(t); p.rel=rel; p.PV=100+20*c.rho*x; p.PT=(base===null?null:base-b*x);
      out.push(p);
    });
    return {season:s, rows:out, base:base, target:ctx.hasR?'RA9':'ERA'};
  }

  // ---------- formatting / columns ----------
  function fmtFor(m){
    switch(m.fmt){
      case 'pct':    return function(v){ return v==null?'':(v*100).toFixed(1)+'%'; };
      case 'pctraw': return function(v){ return v==null?'':v.toFixed(1)+'%'; };
      case 'int':    return function(v){ return v==null?'':String(Math.round(v)); };
      case 'd1':     return function(v){ return v==null?'':v.toFixed(1); };
      case 'd2':     return function(v){ return v==null?'':v.toFixed(2); };
      default:       return function(v){ return v==null?'':String(v); };
    }
  }
  function defaultCols(ctx){
    var want=['Team','IP','ERA','WAR'].concat(ctx.feats.map(function(f){return f.key;}));
    return want.filter(function(n){ return n in ctx.meta; });
  }
  function fetchData(url){
    return fetch(url).then(function(r){ if(!r.ok) throw new Error('Could not load '+url+' ('+r.status+').'); return r.json(); });
  }
  return {FEATS:FEATS, CONSTS:CONSTS, load:load, score:score, view:view, project:project, aggregate:aggregate,
          groupBy:groupBy, fmtFor:fmtFor, defaultCols:defaultCols, fetchData:fetchData};
})();
if(typeof module!=='undefined') module.exports=VP;
