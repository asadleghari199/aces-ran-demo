import React,{useEffect,useMemo,useState} from 'react';
import{createRoot}from'react-dom/client';
import{AreaChart,Area,LineChart,Line,ResponsiveContainer,XAxis,YAxis,Tooltip,CartesianGrid}from'recharts';
import{Activity,AlertTriangle,BarChart3,ChartNoAxesCombined,ChevronDown,Download,Pause,Play,RadioTower,RotateCcw,Settings2,ShieldCheck,Signal,Wifi, Zap}from'lucide-react';
import './style.css';
const SITES=[{id:'gNB-01',pci:10,x:145,y:145,color:'#20a5ff'},{id:'gNB-02',pci:20,x:490,y:145,color:'#ff9c36'},{id:'gNB-03',pci:30,x:320,y:390,color:'#a777ff'}];
const INITIAL_UE=[{x:90,y:70},{x:220,y:75},{x:95,y:230},{x:305,y:210},{x:550,y:75},{x:470,y:245},{x:575,y:220},{x:225,y:340},{x:405,y:345},{x:320,y:490}].map((p,i)=>({...p,id:`UE-${String(i+1).padStart(2,'0')}`}));
const FAULTS=[
 {id:'interference',label:'Inter-cell Interference',desc:'Extra interference from neighboring cells',icon:'◉',unit:'dB',max:25,defaultValue:8},
 {id:'power',label:'Transmit Power Reduction',desc:'Target gNB transmit power backoff',icon:'↘',unit:'dB',max:30,defaultValue:6},
 {id:'congestion',label:'Cell Congestion',desc:'Additional offered traffic load',icon:'▥',unit:'%',max:100,defaultValue:50},
 {id:'outage',label:'gNB Outage',desc:'Target cell becomes unavailable',icon:'⏻',unit:'',max:1,defaultValue:1}
];
const initialFaults=()=>Object.fromEntries(FAULTS.map(f=>[f.id,{enabled:false,value:f.defaultValue,target:1}]));
const dbmToMw=dbm=>10**(dbm/10);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function calculate(ue,faults,tick){
 const active=id=>faults[id].enabled;
 const val=id=>faults[id].value;
 const target=id=>faults[id].target;
 const noise=dbmToMw(-105);
 const powers=SITES.map((s,i)=>{
  if(active('outage')&&target('outage')===i)return -200;
  const dist=Math.max(18,Math.hypot(ue.x-s.x,ue.y-s.y));
  const fading=1.2*Math.sin(tick*.21+i*1.8+ue.x*.06);
  return -42-31*Math.log10(dist/20)+fading-(active('power')&&target('power')===i?val('power'):0);
 });
 const cells=powers.map((p,i)=>({p,i})).filter(x=>x.p>-180).sort((a,b)=>b.p-a.p);
 const serving=cells[0]?.i??-1;
 const rsrp=serving>=0?powers[serving]:-140;
 const interference=cells.filter(x=>x.i!==serving).reduce((acc,x)=>{
  const factor=active('interference')&&target('interference')===x.i ? .08*10**(val('interference')/10):.08;
  return acc+dbmToMw(x.p)*factor;
 },0);
 const sinr=serving<0?-20:10*Math.log10(dbmToMw(rsrp)/(noise+interference));
 const cqi=serving<0?0:clamp(Math.round((sinr+8)/2.2),0,15);
 const mcs=serving<0?0:clamp(Math.round(cqi*1.8),0,27);
 const bler=serving<0?100:clamp(25*Math.exp(-(sinr+3)/8),.1,100);
 const congestion=active('congestion')&&serving===target('congestion')?val('congestion'):0;
 const prb=serving<0?0:clamp(36+congestion*.67+6*Math.sin(tick*.09),0,100);
 const throughput=serving<0?0:Math.max(0,((mcs+1)/28)*115*(1-bler/100)*(1-congestion*.0065));
 return {serving,rsrp,sinr,cqi,mcs,bler,prb,throughput,powers};
}
// Visual coverage uses the same 31 dB/decade path-loss slope as calculate().
// At a fixed RSRP threshold: R/R0 = 10^(-powerBackoffDb/31).
// This is a conceptual coverage overlay, not a validated cell boundary.
const COVERAGE_BASE_RADIUS = 155;
const coverageRadius = (siteIndex, faults) => {
  const f = faults.power;
  const backoffDb = f.enabled && f.target === siteIndex ? f.value : 0;
  return COVERAGE_BASE_RADIUS * Math.pow(10, -backoffDb / 31);
};

function ChartPanel({title,data,field,color,unit,domain}){return <div className="chartPanel"><div className="chartHead"><span><i style={{background:color}}/>{title}</span><b style={{color}}>{data.length?data[data.length-1][field].toFixed(1):'--'} {unit}</b></div><ResponsiveContainer width="100%" height={130}><AreaChart data={data} margin={{top:10,right:10,bottom:0,left:-20}}><defs><linearGradient id={'grad'+field} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={.36}/><stop offset="100%" stopColor={color} stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#1a3551" strokeDasharray="3 3"/><XAxis dataKey="t" tick={{fill:'#829bb6',fontSize:10}}/><YAxis domain={domain||['auto','auto']} tick={{fill:'#829bb6',fontSize:10}}/><Tooltip contentStyle={{background:'#0a1c31',border:'1px solid #2b4661',borderRadius:8,color:'#fff'}}/><Area type="monotone" dataKey={field} stroke={color} fill={'url(#grad'+field+')'} strokeWidth={2} isAnimationActive={false} dot={false}/></AreaChart></ResponsiveContainer></div>}
function App(){
 const[faults,setFaults]=useState(initialFaults),[running,setRunning]=useState(true),[tick,setTick]=useState(0),[selected,setSelected]=useState(3),[view,setView]=useState('Network View'),[overlay,setOverlay]=useState('RSRP'),[history,setHistory]=useState([]),[events,setEvents]=useState([{t:0,level:'INFO',message:'Simulator initialized · 3 gNBs / 10 UEs'}]);
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(timer)},[running]);
 const all=useMemo(()=>INITIAL_UE.map(u=>calculate(u,faults,tick)),[faults,tick]);const current=all[selected];
 useEffect(()=>{setHistory(h=>[...h,{t:tick,sinr:current.sinr,bler:current.bler,throughput:current.throughput,prb:current.prb}].slice(-35))},[tick,selected,faults]);
 const record=(level,message)=>setEvents(e=>[{t:tick,level,message},...e].slice(0,35));
 const changeFault=(id,patch)=>setFaults(old=>({...old,[id]:{...old[id],...patch}}));
 const toggleFault=(id,enabled)=>{
  changeFault(id,{enabled});
  const f=FAULTS.find(x=>x.id===id);
  record(enabled?'WARNING':'INFO',`${f.label} ${enabled?'enabled':'disabled'} on ${SITES[faults[id].target].id}`);
 };
 const clearFaults=()=>{setFaults(old=>Object.fromEntries(Object.entries(old).map(([id,f])=>[id,{...f,enabled:false}])));record('INFO','All faults disabled')};
 const reset=()=>{setFaults(initialFaults());setTick(0);setHistory([]);setEvents([{t:0,level:'INFO',message:'Simulation reset'}]);setRunning(true)};
 const download=()=>{const rows=[['time_s','SINR_dB','BLER_pct','throughput_Mbps','PRB_pct'],...history.map(h=>[h.t,h.sinr.toFixed(2),h.bler.toFixed(2),h.throughput.toFixed(2),h.prb.toFixed(2)])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'}));a.download='aces-ran-kpis.csv';a.click();URL.revokeObjectURL(a.href)};
 const summary=SITES.map((s,i)=>{const group=all.filter(x=>x.serving===i);return{...s,count:group.length,rsrp:group.length?group.reduce((a,b)=>a+b.rsrp,0)/group.length:0,sinr:group.length?group.reduce((a,b)=>a+b.sinr,0)/group.length:0,prb:group.length?group.reduce((a,b)=>a+b.prb,0)/group.length:0,rate:group.reduce((a,b)=>a+b.throughput,0),online:!(faults.outage.enabled&&faults.outage.target===i)}});
 return <div className="app"><header><div className="brand"><img src="/ACES-logo.png" alt="ACES logo" onError={e=>{e.currentTarget.style.display="none";e.currentTarget.parentElement.textContent="ACES"}}/></div><div className="heading"><strong>5G RAN Fault Injection & Performance Analyzer</strong><small>Interactive multi-cell network simulation · Browser demo</small></div><div className="toolbar"><button className="primary" onClick={()=>setRunning(!running)}>{running?<Pause size={15}/>:<Play size={15}/>} {running?'Pause':'Start'}</button><button onClick={reset}><RotateCcw size={15}/> Reset</button><span className="timer">SIM TIME <b>{String(Math.floor(tick/60)).padStart(2,'0')}:{String(tick%60).padStart(2,'0')}</b></span></div></header>
 <nav>{['Network View','Performance Analysis','UE Table','Alarms & Events','Scenario Comparison'].map(v=><button className={view===v?'active':''} onClick={()=>setView(v)} key={v}>{v}</button>)}</nav>
 <main><aside className="panel controls"><div className="panelTitle"><Settings2 size={16}/> RAN Fault Injection <span className="activeCount">{FAULTS.filter(f=>faults[f.id].enabled).length} active</span></div>
 <div className="faults">{FAULTS.map(f=><div key={f.id} className={'faultCard '+(faults[f.id].enabled?'enabled':'')}>
  <label className="faultToggle"><span className="faultIcon">{f.icon}</span><span className="faultText"><b>{f.label}</b><small>{f.desc}</small></span><input type="checkbox" checked={faults[f.id].enabled} onChange={e=>toggleFault(f.id,e.target.checked)} aria-label={'Enable '+f.label}/></label>
  {faults[f.id].enabled&&<div className="faultConfig">
   <label>Target gNB</label><select value={faults[f.id].target} onChange={e=>changeFault(f.id,{target:+e.target.value})}>{SITES.map((s,i)=><option value={i} key={s.id}>{s.id} (PCI {s.pci})</option>)}</select>
   {f.id!=='outage'?<><label>{f.label==='Cell Congestion'?'Additional load':'Fault magnitude'} <b>{faults[f.id].value} {f.unit}</b></label><input type="range" min="0" max={f.max} step="1" value={faults[f.id].value} onChange={e=>changeFault(f.id,{value:+e.target.value})}/></>:<p className="outageNote">Target cell is switched OFF while enabled.</p>}
  </div>}
 </div>)}</div>
 <div className="hint">Each fault has its own target and magnitude. Multiple faults can be active simultaneously. Values are illustrative, not calibrated 3GPP results.</div>
 <button className="secondary wide" onClick={clearFaults}>Disable All Faults</button></aside>
 <section className="panel topology"><div className="panelTitle split"><span><RadioTower size={16}/> {view==='Network View'?'Network Topology & Radio Coverage':view}</span><span className="seg">{['RSRP','SINR','Cells'].map(x=><button key={x} onClick={()=>setOverlay(x)} className={overlay===x?'on':''}>{x}</button>)}</span></div>
 {view==='Network View'?<div className="map"><svg viewBox="0 0 640 540" role="img" aria-label="Three cell topology with ten selectable user devices"><defs><pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M 34 0 L 0 0 0 34" fill="none" stroke="#17324d" strokeWidth="1"/></pattern><radialGradient id="blue"><stop stopColor="#1797f2" stopOpacity=".46"/><stop offset="1" stopColor="#1797f2" stopOpacity="0"/></radialGradient><radialGradient id="orange"><stop stopColor="#f59e37" stopOpacity=".48"/><stop offset="1" stopColor="#f59e37" stopOpacity="0"/></radialGradient><radialGradient id="purple"><stop stopColor="#9d6dff" stopOpacity=".45"/><stop offset="1" stopColor="#9d6dff" stopOpacity="0"/></radialGradient></defs><rect width="640" height="540" fill="#071b30"/><rect width="640" height="540" fill="url(#grid)"/>{SITES.map((s,i)=><g key={s.id}><circle cx={s.x} cy={s.y} r={coverageRadius(i,faults)} className="coverageCircle" fill={overlay==='Cells'?'none':`url(#${['blue','orange','purple'][i]})`} stroke={s.color} strokeWidth="1.5" strokeDasharray="7 7" strokeOpacity=".65" opacity={faults.outage.enabled&&faults.outage.target===i?.25:1}/><circle cx={s.x} cy={s.y} r="26" fill="#0d2743" stroke={s.color} strokeWidth="2"/><path d={`M${s.x} ${s.y-15}v29 m-11 0h22 m-17-17 6-10 6 10`} stroke={s.color} strokeWidth="3" fill="none"/><text x={s.x} y={s.y+44} textAnchor="middle" fill="white" fontSize="14" fontWeight="700">{s.id}</text><text x={s.x} y={s.y+59} textAnchor="middle" fill={s.color} fontSize="11">{faults.outage.enabled&&faults.outage.target===i?'OFFLINE':`PCI ${s.pci}`}</text></g>)}{INITIAL_UE.map((u,i)=><g key={u.id} onClick={()=>setSelected(i)} style={{cursor:'pointer'}}><line x1={u.x} y1={u.y} x2={SITES[all[i].serving]?.x??u.x} y2={SITES[all[i].serving]?.y??u.y} stroke="#9ac4dd" strokeOpacity=".35" strokeDasharray="4 5"/><circle cx={u.x} cy={u.y} r={selected===i?12:8} fill={all[i].serving<0?'#f04455':selected===i?'#ffbd4a':'#2bdfac'} stroke="#d8f8ff" strokeWidth="2"/><text x={u.x+13} y={u.y-11} fill="white" fontSize="12" fontWeight="600">{u.id}</text></g>)}</svg><div className="mapLabel">Conceptual geometry · Select any UE</div></div>:view==='Performance Analysis'?<div className="analysisGrid"><ChartPanel title="SINR" data={history} field="sinr" color="#2c9eff" unit="dB"/><ChartPanel title="BLER" data={history} field="bler" color="#f05c58" unit="%"/><ChartPanel title="Throughput" data={history} field="throughput" color="#1fce8b" unit="Mbps"/><ChartPanel title="PRB Utilization" data={history} field="prb" color="#ae79ff" unit="%"/></div>:view==='UE Table'?<div className="tableWrap"><table><thead><tr>{['UE','Serving gNB','RSRP','SINR','CQI','MCS','BLER','DL Mbps'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{all.map((a,i)=><tr key={i} onClick={()=>{setSelected(i);setView('Network View')}}><td>{INITIAL_UE[i].id}</td><td>{SITES[a.serving]?.id??'None'}</td><td>{a.rsrp.toFixed(1)}</td><td>{a.sinr.toFixed(1)}</td><td>{a.cqi}</td><td>{a.mcs}</td><td>{a.bler.toFixed(1)}%</td><td>{a.throughput.toFixed(1)}</td></tr>)}</tbody></table></div>:view==='Alarms & Events'?<div className="eventList">{events.map((e,i)=><div key={i}><span>{String(Math.floor(e.t/60)).padStart(2,'0')}:{String(e.t%60).padStart(2,'0')}</span><b className={e.level==='WARNING'?'warning':'info'}>{e.level}</b>{e.message}</div>)}</div>:<div className="comparison"><h3>Healthy vs Current Scenario</h3><p>Selected UE: {INITIAL_UE[selected].id}</p>{['rsrp','sinr','bler','throughput'].map(k=>{const base=calculate(INITIAL_UE[selected],initialFaults(),tick)[k];return <div key={k}><span>{k.toUpperCase()}</span><b>{base.toFixed(1)} → {current[k].toFixed(1)}</b></div>})}</div>}</section>
 <aside className="panel details"><div className="panelTitle"><Signal size={16}/> Selected UE</div><select value={selected} onChange={e=>setSelected(+e.target.value)}>{INITIAL_UE.map((u,i)=><option key={u.id} value={i}>{u.id}</option>)}</select><div className="status"><span className="dot"/> {current.serving<0?'DISCONNECTED':'CONNECTED'}</div>{[['Serving gNB',SITES[current.serving]?.id??'None'],['Location',`${INITIAL_UE[selected].x}, ${INITIAL_UE[selected].y} m`],['RSRP',`${current.rsrp.toFixed(1)} dBm`],['SINR',`${current.sinr.toFixed(1)} dB`],['CQI',current.cqi],['MCS',current.mcs],['BLER',`${current.bler.toFixed(1)} %`],['PRB Utilization',`${current.prb.toFixed(1)} %`],['DL Throughput',`${current.throughput.toFixed(1)} Mbps`]].map(([a,b])=><div className="metric" key={a}><span>{a}</span><b>{b}</b></div>)}<div className="panelTitle section">Neighbor Cell RSRP</div>{current.powers.map((p,i)=><div className="metric" key={i}><span>{SITES[i].id}</span><b>{p< -180?'OFF':p.toFixed(1)+' dBm'}</b></div>)}</aside>
 <section className="panel charts"><div className="panelTitle split"><span><Activity size={16}/> Key Performance Indicators · {INITIAL_UE[selected].id}</span><button className="textBtn" onClick={download}><Download size={14}/> CSV</button></div><div className="chartGrid"><ChartPanel title="SINR" data={history} field="sinr" color="#2c9eff" unit="dB"/><ChartPanel title="BLER" data={history} field="bler" color="#f05c58" unit="%"/><ChartPanel title="DL Throughput" data={history} field="throughput" color="#1fce8b" unit="Mbps"/><ChartPanel title="PRB Utilization" data={history} field="prb" color="#ae79ff" unit="%"/></div></section>
 <section className="panel cellSummary"><div className="panelTitle"><BarChart3 size={16}/> Cell Performance Summary</div><table><thead><tr><th>Metric</th>{SITES.map(s=><th key={s.id}>{s.id}</th>)}</tr></thead><tbody>{[['Status',x=>x.online?'ON':'OFF'],['Connected UEs',x=>x.count],['Avg RSRP',x=>x.count?x.rsrp.toFixed(1):'—'],['Avg SINR',x=>x.count?x.sinr.toFixed(1):'—'],['PRB %',x=>x.count?x.prb.toFixed(0):'—'],['DL Mbps',x=>x.rate.toFixed(1)]].map(([name,fn])=><tr key={name}><td>{name}</td>{summary.map(s=><td key={s.id}>{fn(s)}</td>)}</tr>)}</tbody></table></section>
 <section className="panel alarmPanel"><div className="panelTitle"><AlertTriangle size={16}/> Alarms & Events</div><div className="eventList">{events.slice(0,7).map((e,i)=><div key={i}><span>{String(Math.floor(e.t/60)).padStart(2,'0')}:{String(e.t%60).padStart(2,'0')}</span><b className={e.level==='WARNING'?'warning':'info'}>{e.level}</b>{e.message}</div>)}</div></section></main><footer><ShieldCheck size={14}/> DEMO / SIMULATED DATA — simplified conceptual radio model; not validated against 3GPP link-level results or real srsRAN measurements.</footer></div>
}
createRoot(document.getElementById('root')).render(<App/>);
