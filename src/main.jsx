import React,{useEffect,useMemo,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{AreaChart,Area,ResponsiveContainer,XAxis,YAxis,Tooltip,CartesianGrid}from'recharts';
import{Activity,AlertTriangle,BarChart3,Download,Pause,Play,RadioTower,RotateCcw,Settings2,ShieldCheck,Signal}from'lucide-react';
import './style.css';

// Three shared baseband groups; each EU feeds three remote small-cell heads.
const GROUPS=[{id:'EU-01',color:'#20a5ff',pci:10},{id:'EU-02',color:'#ff9c36',pci:20},{id:'EU-03',color:'#a777ff',pci:30}];
const SITES=[
 {x:115,y:110},{x:245,y:120},{x:165,y:250},
 {x:420,y:100},{x:550,y:145},{x:465,y:265},
 {x:225,y:365},{x:360,y:375},{x:320,y:490}
].map((p,i)=>({...p,id:`SC-${String(i+1).padStart(2,'0')}`,group:Math.floor(i/3),pci:GROUPS[Math.floor(i/3)].pci,color:GROUPS[Math.floor(i/3)].color}));
const DEFAULT_TRANSPORT={fiberLoss:0,connectorLoss:0,splitterLoss:0,euInsertion:0,auInsertion:0,fhgwLatency:0.15,auLatency:0.10,euLatency:0.08,packetLoss:0,groupCapacity:273};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
// Stable, evenly distributed UE positions. Each site receives at least 3 UEs.
const MIN_UES=27, DEFAULT_UES=36, MAX_UES=90;
const UE_POOL=Array.from({length:MAX_UES},(_,i)=>{
 const siteIndex=i%SITES.length, ring=Math.floor(i/SITES.length);
 const site=SITES[siteIndex];
 const angle=(ring*2.3999632297+siteIndex*1.31)%(2*Math.PI);
 const radius=25+(ring%4)*12;
 return {id:`UE-${String(i+1).padStart(2,'0')}`,x:clamp(site.x+radius*Math.cos(angle),20,620),y:clamp(site.y+radius*Math.sin(angle),20,520)};
});
const FAULTS=[
{id:'interference',label:'Inter-cell Interference',desc:'Extra interference from neighboring cells',icon:'◉',unit:'dB',max:25,defaultValue:8},
{id:'power',label:'Transmit Power Reduction',desc:'Target small-cell transmit power backoff',icon:'↘',unit:'dB',max:30,defaultValue:6},
{id:'congestion',label:'Cell Congestion',desc:'Additional offered traffic load',icon:'▥',unit:'%',max:100,defaultValue:50},
{id:'outage',label:'Small Cell Outage',desc:'Target small cell becomes unavailable',icon:'⏻',unit:'',max:1,defaultValue:1}
];
const initialFaults=()=>Object.fromEntries(FAULTS.map(f=>[f.id,{enabled:false,value:f.defaultValue,target:1}]));
const dbmToMw=dbm=>10**(dbm/10);
// Seeded, reproducible stochastic innovations. No Math.random() in React render.
const hash01=(seed)=>{let x=(seed|0)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296;};
const gaussian=(key,t)=>Math.sqrt(-2*Math.log(Math.max(1e-9,hash01(key*1031+t*7919+17))))*Math.cos(2*Math.PI*hash01(key*8171+t*1543+91));
// Stationary AR(1) constructed from a finite seeded innovation history.
const correlated=(key,t,rho=.80)=>{let v=0,weight=Math.sqrt(1-rho*rho);for(let k=0;k<28;k++){v+=weight*gaussian(key,t-k)*Math.pow(rho,k);}return v;};
const trafficDemand=(ueIndex,t,faults,group)=>{
 const congestion=faults.congestion.enabled&&SITES[faults.congestion.target].group===group?faults.congestion.value/100:0;
 // Bursty ON/OFF sessions plus correlated packet-demand fluctuations.
 const session=Math.floor(t/12);
 const on=hash01(ueIndex*311+session*67+13)>.24;
 const baseline=on?25:5;
 return clamp(Math.round(baseline+11*correlated(ueIndex+700,t,.77)+congestion*90),0,130);
};
// Activity is driven by the offered PRB demand in each shared EU pool.
const groupActivity=(ues,t,faults,transport)=>{
 const offered=[0,0,0];
 ues.forEach((u,i)=>{
  const closest=SITES.reduce((best,s,j)=>Math.hypot(u.x-s.x,u.y-s.y)<Math.hypot(u.x-SITES[best].x,u.y-SITES[best].y)?j:best,0);
  const gi=SITES[closest].group;
  offered[gi]+=trafficDemand(i,t,faults,gi);
 });
 return offered.map(v=>clamp(v/Math.max(1,transport.groupCapacity),.04,1));
};
// Three synchronized heads per EU; one PCI and one PRB pool per EU.
// This is an illustrative system-level model, not a calibrated 3GPP PHY.
function calculate(ue,faults,tick,transport=DEFAULT_TRANSPORT,activity=[.5,.5,.5],ueIndex=0){
 const active=id=>faults[id].enabled,val=id=>faults[id].value,target=id=>faults[id].target;
 const noise=dbmToMw(-105);
 const rfLoss=transport.fiberLoss+transport.connectorLoss+transport.splitterLoss+transport.euInsertion+transport.auInsertion;
 const powers=SITES.map((s,i)=>{
  if(active('outage')&&target('outage')===i)return -200;
  const dist=Math.max(18,Math.hypot(ue.x-s.x,ue.y-s.y));
  // Slow shadowing (3 dB) + fast correlated fading (0.9 dB).
  const shadow=3*correlated(10000+ueIndex*19+i,tick,.975);
  const fast=.9*correlated(20000+ueIndex*19+i,tick,.46);
  return -42-31*Math.log10(dist/20)+shadow+fast-rfLoss-(active('power')&&target('power')===i?val('power'):0);
 });
 const groupMw=GROUPS.map((_,gi)=>SITES.reduce((sum,s,i)=>sum+(s.group===gi&&powers[i]>-180?dbmToMw(powers[i]):0),0));
 const servingGroup=groupMw.some(x=>x>0)?groupMw.indexOf(Math.max(...groupMw)):-1;
 const serving=servingGroup<0?-1:powers.reduce((best,p,i)=>SITES[i].group===servingGroup&&(best<0||p>powers[best])?i:best,-1);
 const signal=servingGroup<0?0:groupMw[servingGroup];
 const rsrp=signal>0?10*Math.log10(signal):-140;
 const interference=groupMw.reduce((sum,p,gi)=>{
  if(gi===servingGroup)return sum;
  const faultGroup=active('interference')?SITES[target('interference')].group:-1;
  const factor=.16*activity[gi]*(faultGroup===gi?10**(val('interference')/10):1);
  return sum+p*factor;
 },0);
 const sinr=servingGroup<0?-20:10*Math.log10(signal/(noise+interference));
 const cqi=servingGroup<0?0:clamp(Math.round((sinr+8)/2.2),0,15);
 const mcs=servingGroup<0?0:clamp(Math.round(cqi*1.8),0,27);
 // Logistic BLER approximation, sensitive to selected MCS and SINR.
 const threshold=-5+mcs*.68;
 const bler=servingGroup<0?100:clamp(100/(1+Math.exp(clamp((sinr-threshold)/2.6,-30,30))),.1,100);
 const congestion=active('congestion')&&servingGroup===SITES[target('congestion')].group?val('congestion'):0;
 const demand=servingGroup<0?0:trafficDemand(ueIndex,tick,faults,servingGroup);
 return {serving,servingGroup,rsrp,sinr,cqi,mcs,bler,congestion,demand,prb:0,cellPrbUtil:0,allocatedPrbs:0,throughput:0,powers,groupPowers:groupMw.map(x=>x>0?10*Math.log10(x):-200)};
}
const COVERAGE_BASE_RADIUS=95;
const coverageRadius=(i,faults)=>COVERAGE_BASE_RADIUS*Math.pow(10,-(faults.power.enabled&&faults.power.target===i?faults.power.value:0)/31);
function allocateResources(raw,transport){
 const result=raw.map(x=>({...x}));
 GROUPS.forEach((g,gi)=>{
  const indices=result.map((r,i)=>r.servingGroup===gi&&r.rsrp>-105?i:-1).filter(i=>i>=0);
  const budget=transport.groupCapacity;
  const demand=indices.map(i=>({i,prbs:result[i].demand}));
  const totalDemand=demand.reduce((sum,x)=>sum+x.prbs,0);
  const scale=Math.min(1,budget/Math.max(1,totalDemand));
  const allocations=demand.map(d=>({...d,alloc:Math.floor(d.prbs*scale)}));
  let remaining=Math.max(0,budget-allocations.reduce((sum,x)=>sum+x.alloc,0));
  // Largest-remainder apportionment, never exceeding individual demand or pool capacity.
  allocations.sort((a,b)=>(b.prbs*scale-b.alloc)-(a.prbs*scale-a.alloc));
  for(const item of allocations){if(remaining<=0)break;if(item.alloc<item.prbs){item.alloc++;remaining--;}}
  const used=allocations.reduce((sum,x)=>sum+x.alloc,0);
  allocations.forEach(({i,alloc})=>{
   const r=result[i];r.allocatedPrbs=alloc;
   r.prb=100*alloc/budget;
   r.cellPrbUtil=100*used/budget;
   // Simplified effective PRB payload rate, bounded by MCS and BLER.
   const spectralEfficiency=.25+5.3*(r.mcs/27);
   r.throughput=Math.max(0,alloc*.36*spectralEfficiency*(1-r.bler/100)*(1-transport.packetLoss/100));
  });
 });
 return result;
}
function Equipment({src,label,subtitle,compact=false}){
 const [missing,setMissing]=useState(false);
 return <div className={'equipment '+(compact?'equipmentCompact':'')}>
  <div className="equipmentVisual">{missing?<div className="equipmentFallback"><RadioTower size={compact?26:36}/></div>:<img src={src} alt={label} onError={()=>setMissing(true)}/>}</div>
  <strong>{label}</strong>{subtitle&&<small>{subtitle}</small>}
 </div>;
}
function TransportTopology({transport,setTransport,summary,all,faults}){
 const update=(key,value)=>setTransport(v=>({...v,[key]:value}));
 const rfLoss=transport.fiberLoss+transport.connectorLoss+transport.splitterLoss+transport.euInsertion+transport.auInsertion;
 const latency=transport.fhgwLatency+transport.auLatency+transport.euLatency;
 return <div className="transportPage">
  <div className="transportHeading"><h2>Transport & Distributed Small-Cell Topology</h2><p>One shared 5G Core · three logical cells (unique PCIs) · three synchronized heads per EU · common carrier · no UEs shown</p></div>
  <div className="architecture architectureHorizontal">
   <div className="architectureFlow">
    <div className="architectureShared"><Equipment src="/5g-core.png" label="5G CORE" subtitle="Shared 5GC"/><span className="flowWire"/><Equipment src="/server.png" label="CU" subtitle="Central Unit"/><span className="flowWire"/><Equipment src="/server.png" label="DU" subtitle="Distributed Unit"/><span className="flowWire"/><Equipment src="/fhgw.png" label="FHGW" subtitle="Fronthaul Gateway"/></div>
    <div className="architectureTrunk" aria-hidden="true"><span className="trunkIncoming"/><span className="trunkVertical"/>{GROUPS.map(g=><span key={g.id} className="trunkOutgoing" style={{'--branch':g.color}}/>)}</div>
    <div className="architectureRows">{GROUPS.map((g,gi)=>{
     const sites=SITES.filter(s=>s.group===gi);
     const users=all.filter(a=>a.servingGroup===gi);
     const allocated=users.reduce((sum,a)=>sum+a.allocatedPrbs,0);
     return <div className="architectureRow" key={g.id} style={{'--branch':g.color}}>
      <Equipment src="/au.png" label={`AU-${String(gi+1).padStart(2,'0')}`} subtitle="Access Unit"/>
      <span className="flowWire" aria-hidden="true"/>
      <Equipment src="/eu.png" label={g.id} subtitle={`PCI ${g.pci} · shared PRBs`}/>
      <div className="smallCellFan"><span className="fanStem" aria-hidden="true"/><div className="smallCellNodes">{sites.map(s=><div className={'smallCellNode '+(faults.outage.enabled&&faults.outage.target===SITES.indexOf(s)?'offline':'')} key={s.id}><span className="smallCellWire"/><Equipment compact src="/small-cell.png.PNG" label={s.id} subtitle={faults.outage.enabled&&faults.outage.target===SITES.indexOf(s)?'OFFLINE':'ONLINE'}/></div>)}</div></div>
      <div className="architectureRowStats">PCI {g.pci} · {users.length} UEs · {allocated.toFixed(0)}/{transport.groupCapacity} PRBs · {users.reduce((v,a)=>v+a.throughput,0).toFixed(1)} Mbps</div>
     </div>;
    })}</div>
   </div>
   <div className="architectureLegend">Equipment image files: <code>5g-core.png</code> · <code>fhgw.png</code> · <code>au.png</code> · <code>eu.png</code> in <code>public/</code>. Missing images display an icon until uploaded.</div>
  </div>
  <div className="transportColumns"><section className="transportCard"><h3>Optional RF link-budget assumptions <span>Editable · dB</span></h3>{[['fiberLoss','Fiber / feeder attenuation'],['connectorLoss','Connector loss'],['splitterLoss','Distribution / splitting loss'],['euInsertion','EU insertion loss'],['auInsertion','AU insertion loss']].map(([key,label])=><label key={key}>{label}<input type="number" min="0" max="30" step="0.1" value={transport[key]} onChange={e=>update(key,clamp(Number(e.target.value)||0,0,30))}/><span>dB</span></label>)}<div className="transportTotal">Total modeled RF attenuation <strong>{rfLoss.toFixed(2)} dB</strong></div><p>Optional equivalent analog RF loss only. Keep at 0 dB for digital eCPRI transport; digital transport impairment is modeled separately.</p></section>
  <section className="transportCard"><h3>Digital transport <span>Editable</span></h3>{[['euLatency','EU latency','ms'],['auLatency','AU latency','ms'],['fhgwLatency','Gateway latency','ms'],['packetLoss','Packet loss','%'],['groupCapacity','PRB pool per EU','PRBs']].map(([key,label,unit])=><label key={key}>{label}<input type="number" min="0" max={key==='groupCapacity'?330:100} step={key==='groupCapacity'?1:.01} value={transport[key]} onChange={e=>update(key,key==='groupCapacity'?clamp(Math.round(Number(e.target.value)||1),1,330):clamp(Number(e.target.value)||0,0,100))}/><span>{unit}</span></label>)}<div className="transportTotal">One-way modeled transport latency <strong>{latency.toFixed(2)} ms</strong></div><p>Packet loss reduces effective throughput. Latency is reported as a transport KPI, not converted into RF path loss. This is an architectural approximation, not a protocol-level eCPRI/5GC emulator.</p></section></div>
 </div>;
}
function ChartPanel({title,data,field,color,unit}){
 return <div className="chartPanel"><div className="chartHead"><span><i style={{background:color}}/>{title}</span><b style={{color}}>{data.length?data[data.length-1][field].toFixed(1):'--'} {unit}</b></div><ResponsiveContainer width="100%" height={130}><AreaChart data={data} margin={{top:10,right:10,bottom:0,left:-20}}><defs><linearGradient id={'grad'+field} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".36"/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#1a3551" strokeDasharray="3 3"/><XAxis dataKey="t" tick={{fill:'#829bb6',fontSize:10}}/><YAxis domain={['auto','auto']} tick={{fill:'#829bb6',fontSize:10}}/><Tooltip contentStyle={{background:'#0a1c31',border:'1px solid #2b4661',borderRadius:8,color:'#fff'}}/><Area type="monotone" dataKey={field} stroke={color} fill={'url(#grad'+field+')'} strokeWidth={2} isAnimationActive={false} dot={false}/></AreaChart></ResponsiveContainer></div>
}
function App(){
 const[faults,setFaults]=useState(initialFaults),[running,setRunning]=useState(true),[tick,setTick]=useState(0),[selected,setSelected]=useState(3),[view,setView]=useState('Network View'),[history,setHistory]=useState([]),[networkHistory,setNetworkHistory]=useState([]),[events,setEvents]=useState([{t:0,level:'INFO',message:'Simulator initialized · 9 small cells / 3 EUs / 36 UEs'}]),[transport,setTransport]=useState(DEFAULT_TRANSPORT),[ueCount,setUeCount]=useState(DEFAULT_UES);
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(timer)},[running]);
 const ues=useMemo(()=>UE_POOL.slice(0,ueCount),[ueCount]);
 const all=useMemo(()=>{const activity=groupActivity(ues,tick,faults,transport);return allocateResources(ues.map((u,i)=>calculate(u,faults,tick,transport,activity,i)),transport)},[ues,faults,tick,transport]),current=all[Math.min(selected,ueCount-1)];
 useEffect(()=>{setHistory(h=>[...h,{t:tick,sinr:current.sinr,bler:current.bler,throughput:current.throughput,prb:current.prb}].slice(-35))},[tick,selected,faults]);
 // Aggregate network KPIs, independent of the currently selected UE.
 useEffect(()=>{
  const connected=all.filter(a=>a.serving>=0 && a.rsrp>-105);
  const totalThroughput=all.reduce((sum,a)=>sum+a.throughput,0);
  const avgSinr=connected.length?connected.reduce((sum,a)=>sum+a.sinr,0)/connected.length:0;
  const prbUtil=100*GROUPS.reduce((sum,_,gi)=>sum+all.filter(a=>a.servingGroup===gi).reduce((v,a)=>v+a.allocatedPrbs,0),0)/(GROUPS.length*transport.groupCapacity);
  setNetworkHistory(h=>[...h,{t:tick,networkThroughput:totalThroughput,avgSinr,prbUtil,connectedUes:connected.length}].slice(-45));
 },[tick,all,transport.groupCapacity]);
 const lastNetworkState=useRef(null);
 useEffect(()=>{
  const connected=all.filter(a=>a.serving>=0&&a.rsrp>-105).length;
  const disconnected=ueCount-connected;
  const allocated=all.reduce((n,a)=>n+a.allocatedPrbs,0);
  const utilization=100*allocated/(3*transport.groupCapacity);
  const outage=faults.outage.enabled?SITES[faults.outage.target].id:null;
  const state={disconnected,overloaded:utilization>=95,outage};
  const previous=lastNetworkState.current;
  if(previous){
   if(disconnected!==previous.disconnected)record(disconnected?'WARNING':'INFO',`${disconnected} UEs below connection threshold (RSRP ≤ -105 dBm)`);
   if(state.overloaded!==previous.overloaded)record(state.overloaded?'WARNING':'INFO',state.overloaded?`Network PRB utilization high: ${utilization.toFixed(1)}%`:'Network PRB utilization returned below 95%');
  }
  lastNetworkState.current=state;
 },[tick,ueCount,faults,transport.groupCapacity]);
 useEffect(()=>{
  if(tick>0&&tick%30===0){
   const connected=all.filter(a=>a.serving>=0&&a.rsrp>-105).length;
   const throughput=all.reduce((n,a)=>n+a.throughput,0);
   record('INFO',`Network update: ${connected}/${ueCount} UEs connected · ${throughput.toFixed(1)} Mbps DL`);
  }
 },[tick]);
 const record=(level,message)=>setEvents(e=>[{t:tick,level,message},...e].slice(0,35));
 const changeFault=(id,patch)=>setFaults(old=>({...old,[id]:{...old[id],...patch}}));
 const toggleFault=(id,enabled)=>{changeFault(id,{enabled});const f=FAULTS.find(x=>x.id===id);record(enabled?'WARNING':'INFO',`${f.label} ${enabled?'enabled':'disabled'} on ${SITES[faults[id].target].id}`)};
 const clearFaults=()=>{setFaults(old=>Object.fromEntries(Object.entries(old).map(([id,f])=>[id,{...f,enabled:false}])));record('INFO','All faults disabled')};
 const reset=()=>{lastNetworkState.current=null;setFaults(initialFaults());setTransport(DEFAULT_TRANSPORT);setUeCount(DEFAULT_UES);setSelected(3);setTick(0);setHistory([]);setNetworkHistory([]);setEvents([{t:0,level:'INFO',message:'Simulation reset · 9 small cells / 3 EUs'}]);setRunning(true)};
 const download=()=>{const rows=[['time_s','SINR_dB','BLER_pct','throughput_Mbps','PRB_pct'],...history.map(h=>[h.t,h.sinr.toFixed(2),h.bler.toFixed(2),h.throughput.toFixed(2),h.prb.toFixed(2)])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download='aces-ran-kpis.csv';a.click();URL.revokeObjectURL(a.href)};
 const summary=SITES.map((s,i)=>{const group=all.filter(x=>x.serving===i);return{...s,count:group.length,rsrp:group.length?group.reduce((a,b)=>a+b.rsrp,0)/group.length:0,sinr:group.length?group.reduce((a,b)=>a+b.sinr,0)/group.length:0,prb:group.length?group.reduce((a,b)=>a+b.prb,0)/group.length:0,rate:group.reduce((a,b)=>a+b.throughput,0),online:!(faults.outage.enabled&&faults.outage.target===i)}});
  // Per-physical-head statistics; PRBs remain allocated from the shared EU pool.
  const scSummary=SITES.map((site,i)=>{
   const online=!(faults.outage.enabled&&faults.outage.target===i);
   const attached=all.filter(a=>a.serving===i&&a.rsrp>-105);
   const mean=key=>attached.length?attached.reduce((sum,a)=>sum+a[key],0)/attached.length:null;
   const allocated=attached.reduce((sum,a)=>sum+a.allocatedPrbs,0);
   const euAllocated=all.filter(a=>a.servingGroup===site.group).reduce((sum,a)=>sum+a.allocatedPrbs,0);
   return {...site,online,connected:attached.length,avgRsrp:mean('rsrp'),avgSinr:mean('sinr'),allocated,euUtil:100*euAllocated/transport.groupCapacity,rate:attached.reduce((sum,a)=>sum+a.throughput,0)};
  });
 const networkCharts=<div className="networkMiniGrid">
  <ChartPanel title="Network Throughput" data={networkHistory} field="networkThroughput" color="#13b981" unit="Mbps"/>
  <ChartPanel title="Average SINR" data={networkHistory} field="avgSinr" color="#278fff" unit="dB"/>
  <ChartPanel title="Total PRB Utilization" data={networkHistory} field="prbUtil" color="#a46eff" unit="%"/>
  <ChartPanel title="Connected UEs" data={networkHistory} field="connectedUes" color="#f5a623" unit=""/>
 </div>;
 const charts=<div className="analysisGrid"><ChartPanel title="SINR" data={history} field="sinr" color="#2c9eff" unit="dB"/><ChartPanel title="BLER" data={history} field="bler" color="#f05c58" unit="%"/><ChartPanel title="Throughput" data={history} field="throughput" color="#1fce8b" unit="Mbps"/><ChartPanel title="EU PRB Share" data={history} field="prb" color="#ae79ff" unit="%"/></div>;
 return <div className="app"><header><div className="brand"><img src="/ACES-logo.png" alt="ACES logo"/></div><div className="heading"><strong>Small Cell PULSE</strong><small>Performance, Utilization & Load Simulation Engine</small><small>Designed and developed by ACES R&D.</small></div><div className="toolbar"><button className="primary" onClick={()=>setRunning(!running)}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'Pause':'Start'}</button><button onClick={reset}><RotateCcw size={15}/> Reset</button><span className="timer">SIM TIME <b>{String(Math.floor(tick/60)).padStart(2,'0')}:{String(tick%60).padStart(2,'0')}</b></span></div></header>
 <nav>{['Network View','Transport Topology','Performance Analysis','UE Table','SC Table'].map(v=><button className={view===v?'active':''} onClick={()=>setView(v)} key={v}>{v}</button>)}</nav>
 {view==='Transport Topology'?<TransportTopology transport={transport} setTransport={setTransport} summary={summary} all={all} faults={faults}/>:<main className={view==='Network View'?'networkMain':''}><div className="networkLeft"><div className="networkTop"><aside className="panel controls"><div className="panelTitle"><Settings2 size={16}/> RAN Fault Injection <span className="activeCount">{FAULTS.filter(f=>faults[f.id].enabled).length} active</span></div><div className="faults">{FAULTS.map(f=><div key={f.id} className={'faultCard '+(faults[f.id].enabled?'enabled':'')}><label className="faultToggle"><span className="faultIcon">{f.icon}</span><span className="faultText"><b>{f.label}</b><small>{f.desc}</small></span><input type="checkbox" checked={faults[f.id].enabled} onChange={e=>toggleFault(f.id,e.target.checked)} aria-label={'Enable '+f.label}/></label>{faults[f.id].enabled&&<div className="faultConfig"><label>Target Small Cell</label><select value={faults[f.id].target} onChange={e=>changeFault(f.id,{target:+e.target.value})}>{SITES.map((s,i)=><option value={i} key={s.id}>{s.id} ({GROUPS[s.group].id})</option>)}</select>{f.id!=='outage'?<><label>{f.id==='congestion'?'Additional load':'Fault magnitude'} <b>{faults[f.id].value} {f.unit}</b></label><input type="range" min="0" max={f.max} step="1" value={faults[f.id].value} onChange={e=>changeFault(f.id,{value:+e.target.value})}/></>:<p className="outageNote">Only this physical small cell is switched OFF; the other two heads in its EU remain active.</p>}</div>}</div>)}</div><div className="hint">Interference and congestion affect the target's entire logical cell (EU group); power reduction and outage affect one physical small cell. Same-group heads combine non-coherently; other groups interfere on the common carrier. Illustrative, not calibrated 3GPP results.</div><button className="secondary wide" onClick={clearFaults}>Disable All Faults</button></aside>
 <section className="panel topology"><div className="panelTitle split"><span><RadioTower size={16}/> {view==='Network View'?'Small-Cell Coverage & UE Association':view}</span></div>
 {view==='Network View'?<div className="map"><div className="ueCountControl"><label htmlFor="ue-count">Connected UE population <strong>{ueCount} UEs</strong></label><input id="ue-count" type="range" min={MIN_UES} max={MAX_UES} step="9" value={ueCount} onChange={e=>{const count=Number(e.target.value);setUeCount(count);setSelected(i=>Math.min(i,count-1));record('INFO',`UE population changed: ${count} UEs`);}}/><span>27 minimum · 3–10 UEs positioned near each small cell · 90 maximum</span></div><svg viewBox="-15 -15 670 620" role="img" aria-label="Nine small cells with adjustable UE population"><defs><pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M 34 0 L 0 0 0 34" fill="none" stroke="#dce5ef" strokeWidth="1"/></pattern><radialGradient id="blue"><stop stopColor="#1797f2" stopOpacity=".46"/><stop offset="1" stopColor="#1797f2" stopOpacity="0"/></radialGradient><radialGradient id="orange"><stop stopColor="#f59e37" stopOpacity=".48"/><stop offset="1" stopColor="#f59e37" stopOpacity="0"/></radialGradient><radialGradient id="purple"><stop stopColor="#9d6dff" stopOpacity=".45"/><stop offset="1" stopColor="#9d6dff" stopOpacity="0"/></radialGradient></defs><rect width="640" height="540" fill="#f8fafc"/><rect width="640" height="540" fill="url(#grid)"/>
 {SITES.map((s,i)=><g key={s.id}>
 <circle cx={s.x} cy={s.y} r={coverageRadius(i,faults)} className="coverageCircle" fill={`url(#${['blue','orange','purple'][s.group]})`} stroke={s.color} strokeWidth="1.5" strokeDasharray="7 7" strokeOpacity=".65" opacity={faults.outage.enabled&&faults.outage.target===i?.25:1}/>
 {/* v1.3: actual radio product image replaces the original antenna-tower path. */}
 <image href="/small-cell.png.PNG" x={s.x-28} y={s.y-28} width="56" height="56" preserveAspectRatio="xMidYMid meet" opacity={faults.outage.enabled&&faults.outage.target===i?.35:1} style={{pointerEvents:'none'}}/>
 <text x={s.x} y={s.y+44} textAnchor="middle" fill="#1d305f" fontSize="11" fontWeight="700">{s.id}</text>
 <text x={s.x} y={s.y+59} textAnchor="middle" fill={s.color} fontSize="11">{faults.outage.enabled&&faults.outage.target===i?'OFFLINE':`${GROUPS[s.group].id} · PCI ${s.pci}`}</text>
 </g>)}
 {ues.map((u,i)=><g key={u.id} onClick={()=>setSelected(i)} style={{cursor:'pointer'}}><line x1={u.x} y1={u.y} x2={SITES[all[i].serving]?.x??u.x} y2={SITES[all[i].serving]?.y??u.y} stroke="#6d829e" strokeOpacity=".35" strokeDasharray="4 5"/><circle cx={u.x} cy={u.y} r={selected===i?8:5} fill={all[i].serving<0?'#f04455':selected===i?'#ffbd4a':'#2bdfac'} stroke="#ffffff" strokeWidth="2"/><text x={u.x+10} y={u.y-9} fill="#1d305f" fontSize="11" fontWeight="600">{ueCount<=36||selected===i?u.id:""}</text></g>)}</svg><div className="mapLabel">Conceptual geometry · Select any UE</div></div>
 :view==='Performance Analysis'?charts
 :view==='UE Table'?<div className="tableWrap"><table><thead><tr>{['UE','Serving Small Cell','RSRP','SINR','CQI','MCS','BLER','DL Mbps'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{all.map((a,i)=><tr key={i} onClick={()=>{setSelected(i);setView('Network View')}}><td>{ues[i].id}</td><td>{SITES[a.serving]?.id??'None'}</td><td>{a.rsrp.toFixed(1)}</td><td>{a.sinr.toFixed(1)}</td><td>{a.cqi}</td><td>{a.mcs}</td><td>{a.bler.toFixed(1)}%</td><td>{a.throughput.toFixed(1)}</td></tr>)}</tbody></table></div>
  :view==='SC Table'?<div className="tableWrap scTableWrap"><table><thead><tr>{['Small Cell','EU / PCI','Status','Connected UEs','Avg RSRP (dBm)','Avg SINR (dB)','Allocated PRBs','EU PRB Util.','DL Mbps'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{scSummary.map((sc,i)=><tr key={sc.id} onClick={()=>{const first=all.findIndex(a=>a.serving===i&&a.rsrp>-105);if(first>=0){setSelected(first);setView('Network View')}}} title={sc.connected?'Click to select a connected UE':'No connected UE on this small cell'}><td><b>{sc.id}</b></td><td>{GROUPS[sc.group].id} / {sc.pci}</td><td><span className={sc.online?'scOnline':'scOffline'}>{sc.online?'ON':'OFF'}</span></td><td>{sc.connected}</td><td>{sc.avgRsrp===null?'—':sc.avgRsrp.toFixed(1)}</td><td>{sc.avgSinr===null?'—':sc.avgSinr.toFixed(1)}</td><td>{sc.allocated}</td><td>{sc.euUtil.toFixed(1)}%</td><td>{sc.rate.toFixed(1)}</td></tr>)}</tbody></table><p className="scTableNote">Allocated PRBs are summed per physical small cell; EU PRB utilization is shared by all three heads of the same EU. Averages exclude disconnected UEs.</p></div>
 :view==='Alarms & Events'?<div className="eventList">{events.map((e,i)=><div key={i}><span>{String(Math.floor(e.t/60)).padStart(2,'0')}:{String(e.t%60).padStart(2,'0')}</span><b className={e.level==='WARNING'?'warning':'info'}>{e.level}</b>{e.message}</div>)}</div>
 :<div className="comparison"><h3>Healthy vs Current Scenario</h3><p>Selected UE: {ues[selected].id}</p>{['rsrp','sinr','bler','throughput'].map(k=>{const base=allocateResources(ues.map((u,i)=>calculate(u,initialFaults(),tick,transport,groupActivity(ues,tick,initialFaults(),transport),i)),transport)[selected][k];return <div key={k}><span>{k.toUpperCase()}</span><b>{base.toFixed(1)} → {current[k].toFixed(1)}</b></div>})}</div>}</section>
 </div><section className="panel charts"><div className="panelTitle split"><span><Activity size={16}/> Key Performance Indicators · {ues[selected].id}</span><button className="textBtn" onClick={download}><Download size={14}/> CSV</button></div><div className="chartGrid"><ChartPanel title="SINR" data={history} field="sinr" color="#2c9eff" unit="dB"/><ChartPanel title="BLER" data={history} field="bler" color="#f05c58" unit="%"/><ChartPanel title="DL Throughput" data={history} field="throughput" color="#1fce8b" unit="Mbps"/><ChartPanel title="EU PRB Share" data={history} field="prb" color="#ae79ff" unit="%"/></div></section>
 <section className="panel alarmPanel"><div className="panelTitle"><AlertTriangle size={16}/> Alarms & Events</div><div className="eventList">{events.slice(0,7).map((e,i)=><div key={i}><span>{String(Math.floor(e.t/60)).padStart(2,'0')}:{String(e.t%60).padStart(2,'0')}</span><b className={e.level==='WARNING'?'warning':'info'}>{e.level}</b>{e.message}</div>)}</div></section></div><div className="networkRight"><section className="panel cellSummary"><div className="panelTitle"><BarChart3 size={16}/> Overall Network Performance</div>{networkCharts}<div className="networkSummaryFoot">9 small cells · 3 shared PRB pools · {ueCount} simulated UEs</div></section>
 <aside className="panel details"><div className="panelTitle"><Signal size={16}/> Selected UE</div><select value={selected} onChange={e=>setSelected(+e.target.value)}>{ues.map((u,i)=><option key={u.id} value={i}>{u.id}</option>)}</select><div className="status"><span className="dot"/> {current.serving<0?'DISCONNECTED':'CONNECTED'}</div>{[['Serving Small Cell',SITES[current.serving]?.id??'None'],['Logical Cell / PCI',current.servingGroup<0?'None':`${GROUPS[current.servingGroup].id} / ${GROUPS[current.servingGroup].pci}`]/*,['Location',`${ues[selected].x}, ${ues[selected].y} m`]*/,['RSRP',`${current.rsrp.toFixed(1)} dBm`],['SINR',`${current.sinr.toFixed(1)} dB`],['CQI',current.cqi],['MCS',current.mcs],['BLER',`${current.bler.toFixed(1)} %`],['UE PRB Share',`${current.prb.toFixed(1)} %`],['Logical Cell PRB Utilization',`${current.cellPrbUtil.toFixed(1)} %`],['DL Throughput',`${current.throughput.toFixed(1)} Mbps`]].map(([a,b])=><div className="metric" key={a}><span>{a}</span><b>{b}</b></div>)}<div className="panelTitle section">Individual Small-Cell Received Power</div>{current.powers.map((p,i)=><div className="metric" key={i}><span>{SITES[i].id}</span><b>{p< -180?'OFF':p.toFixed(1)+' dBm'}</b></div>)}</aside>
 </div></main>}<footer><ShieldCheck size={14}/> Designed and developed by ACES R&D. </footer></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
