/* Yfirlit V1 — "Editorial focus" — restructured around the most-asked questions.
 *  - Hero KPI band: cash position with sparkline trend
 *  - Side-by-side: "Næstu skref" (upcoming) + "Áætlun" (variance bars)
 *  - Lower: full variance table — collapsible
 * Keeps DNA (navy/green, flat, tabular). Adds rhythm via section eyebrows.
 */
function YfirlitV1() {
  const totalBudget = Y_VARIANCE.reduce((s,r)=>s+Math.abs(r.budget),0);
  const totalActual = Y_VARIANCE.reduce((s,r)=>s+Math.abs(r.actual),0);

  return (
    <div className="app">
      <window.Sidebar active="yfirlit" />
      <main className="main">
        <div className="ph">
          <div>
            <h1 className="ph__title">Yfirlit</h1>
            <p className="ph__sub">Maríugata 34 - 36, húsfélag · 2026</p>
          </div>
          <div className="ph__actions">
            <button className="btn btn--ghost"><span className="material-icons-outlined">event</span>2026 ▾</button>
            <button className="btn btn--secondary"><span className="material-icons-outlined">download</span>Sækja ársskýrslu</button>
          </div>
        </div>

        <div style={{padding:"28px 32px", overflow:"auto", flex:1, background:"#fff"}}>

          {/* Hero KPI band */}
          <div style={{display:"grid", gridTemplateColumns:"1.5fr 1fr 1fr 1fr", gap:0, border:"1px solid var(--border)", borderRadius:6, overflow:"hidden"}}>
            <div style={{padding:"22px 24px", background:"linear-gradient(135deg, #1D366F 0%, #0d2154 100%)", color:"#fff"}}>
              <div className="eyebrow" style={{color:"rgba(255,255,255,0.7)"}}>STAÐA Í BÖNKUM</div>
              <div className="amt" style={{fontSize:30, fontWeight:500, marginTop:8, color:"#fff"}}>{fmt(Y_KPIS.bank + 160000)}</div>
              <div style={{fontSize:12, color:"rgba(255,255,255,0.7)", marginTop:6, display:"flex", alignItems:"center", gap:8}}>
                <span style={{color:"#7ed8b1"}}>▲ {fmt(58400)}</span> síðustu 30 daga
              </div>
              {/* sparkline */}
              <svg viewBox="0 0 200 40" style={{width:"100%", height:36, marginTop:12}}>
                <path d="M0,30 L20,28 L40,25 L60,26 L80,22 L100,24 L120,18 L140,15 L160,12 L180,10 L200,8" stroke="#08C076" strokeWidth="2" fill="none"/>
                <path d="M0,30 L20,28 L40,25 L60,26 L80,22 L100,24 L120,18 L140,15 L160,12 L180,10 L200,8 L200,40 L0,40 Z" fill="rgba(8,192,118,0.15)"/>
              </svg>
            </div>
            <div style={{padding:"22px 24px", borderLeft:"1px solid var(--border)"}}>
              <div className="eyebrow eyebrow--mute">ÓGREIDD INNHEIMTA</div>
              <div className="amt" style={{fontSize:24, fontWeight:500, marginTop:8, color:"var(--negative)"}}>{fmt(Y_KPIS.unpaid)}</div>
              <div style={{fontSize:12, color:"var(--text-secondary)", marginTop:6}}>2 íbúðir í vanskilum</div>
            </div>
            <div style={{padding:"22px 24px", borderLeft:"1px solid var(--border)"}}>
              <div className="eyebrow eyebrow--mute">RAUN VS ÁÆTLUN</div>
              <div className="amt" style={{fontSize:24, fontWeight:500, marginTop:8}}>{Math.round(totalActual/totalBudget*100)}%</div>
              <div style={{fontSize:12, color:"var(--text-secondary)", marginTop:6}}>nýtt af áætlun ársins</div>
              <div style={{height:4, background:"#eee", borderRadius:2, marginTop:8, overflow:"hidden"}}>
                <div style={{width:Math.round(totalActual/totalBudget*100)+"%", height:"100%", background:"var(--brand-navy)"}}/>
              </div>
            </div>
            <div style={{padding:"22px 24px", borderLeft:"1px solid var(--border)"}}>
              <div className="eyebrow eyebrow--mute">MÁNAÐARLEG INNHEIMTA</div>
              <div className="amt" style={{fontSize:24, fontWeight:500, marginTop:8, color:"var(--positive)"}}>{fmt(Y_KPIS.monthly)}</div>
              <div style={{fontSize:12, color:"var(--text-secondary)", marginTop:6}}>Næst: 1. maí</div>
            </div>
          </div>

          {/* Two columns: Upcoming + Variance overview */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:24, marginTop:32}}>

            {/* Upcoming */}
            <div>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
                <h2 className="section-title">Næstu skref</h2>
                <a style={{fontSize:12, color:"var(--brand-navy)", textDecoration:"none"}}>Skoða allt →</a>
              </div>
              <div style={{border:"1px solid var(--border)", borderRadius:6}}>
                {Y_UPCOMING.map((u,i)=>(
                  <div key={i} style={{display:"flex", gap:14, padding:"14px 16px", borderBottom: i<Y_UPCOMING.length-1?"1px solid var(--border-row)":"none", alignItems:"center"}}>
                    <div style={{width:42, textAlign:"center", flexShrink:0}}>
                      <div style={{fontSize:11, color:"var(--text-disabled)", textTransform:"uppercase", letterSpacing:"0.06em"}}>{u.date.split(" ")[1]}</div>
                      <div style={{fontSize:18, fontWeight:600, lineHeight:1.1}}>{u.date.split(" ")[0]}</div>
                    </div>
                    <div style={{width:32, height:32, borderRadius:8, background: u.tone==="navy"?"var(--brand-navy-tint)":u.tone==="green"?"var(--brand-green-tint)":u.tone==="warning"?"var(--chip-imported-bg)":"#fdeded", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0}}>
                      <span className="material-icons-outlined" style={{fontSize:18, color: u.tone==="navy"?"var(--brand-navy)":u.tone==="green"?"var(--positive)":u.tone==="warning"?"var(--warning)":"var(--negative)"}}>{u.icon}</span>
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13.5, fontWeight:500}}>{u.title}</div>
                      <div style={{fontSize:12, color:"var(--text-secondary)", marginTop:2}}>{u.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Variance summary as bars */}
            <div>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
                <h2 className="section-title">Áætlun vs raun · 2026</h2>
                <span style={{fontSize:12, color:"var(--text-disabled)"}}>Eftir flokki</span>
              </div>
              <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"6px 0"}}>
                {Y_VARIANCE.slice(0,6).map((r,i)=>{
                  const pct = Math.round(r.pct*100);
                  return (
                    <div key={i} style={{padding:"10px 16px", display:"grid", gridTemplateColumns:"160px 1fr 100px 50px", gap:12, alignItems:"center", fontSize:13}}>
                      <div style={{whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis"}}>{r.cat}</div>
                      <div style={{height:6, background:"#f0f0f0", borderRadius:3, overflow:"hidden", position:"relative"}}>
                        <div style={{width: Math.min(100,pct)+"%", height:"100%", background: pct>90?"var(--negative)":pct>50?"var(--warning)":"var(--brand-navy)"}}/>
                      </div>
                      <div className="amt" style={{textAlign:"right", fontSize:12, color:"var(--text-secondary)"}}>{fmt(Math.abs(r.actual))}</div>
                      <div className="amt" style={{textAlign:"right", fontSize:12, color:"var(--text-disabled)"}}>{pct}%</div>
                    </div>
                  );
                })}
                <div style={{padding:"10px 16px", borderTop:"1px solid var(--border)", marginTop:4, display:"flex", justifyContent:"space-between", alignItems:"center"}}>
                  <span style={{fontSize:13, fontWeight:600}}>Samtals nýtt</span>
                  <div style={{display:"flex", gap:16, alignItems:"center"}}>
                    <span className="amt" style={{fontSize:13}}>{fmt(totalActual)} / {fmt(totalBudget)}</span>
                    <span className="chip chip--label">{Math.round(totalActual/totalBudget*100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full variance table — kept for the CFOs */}
          <div style={{marginTop:32}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12}}>
              <h2 className="section-title">Sundurliðun</h2>
              <div style={{display:"flex", gap:8}}>
                <button className="btn btn--ghost" style={{fontSize:12,padding:"4px 10px",minHeight:0}}>Tekjur</button>
                <button className="btn btn--secondary" style={{fontSize:12,padding:"4px 10px",minHeight:0}}>Gjöld</button>
              </div>
            </div>
            <div style={{border:"1px solid var(--border)", borderRadius:4, overflow:"hidden"}}>
              <table className="t">
                <thead><tr><th>Flokkur</th><th className="r">Áætlun</th><th className="r">Raun</th><th className="r">Frávik</th><th className="r" style={{width:120}}>Nýting</th></tr></thead>
                <tbody>
                  {Y_VARIANCE.map((r,i)=>{
                    const pct = Math.round(r.pct*100);
                    return (
                      <tr key={i}>
                        <td>{r.cat}</td>
                        <td className="amt amt--zero">{r.budget? fmt(r.budget) : "—"}</td>
                        <td className={"amt " + (r.actual<0?"amt--neg":r.actual>0?"amt--pos":"amt--zero")}>{r.actual? fmt(r.actual) : fmt(0)}</td>
                        <td className={"amt amt--pos"}>{fmt(Math.abs(r.variance))}</td>
                        <td>
                          <div style={{display:"flex", alignItems:"center", gap:8, justifyContent:"flex-end"}}>
                            <div style={{width:60, height:5, background:"#f0f0f0", borderRadius:3, overflow:"hidden"}}>
                              <div style={{width:Math.min(100,pct)+"%", height:"100%", background:pct>90?"var(--negative)":"var(--brand-navy)"}}/>
                            </div>
                            <span className="amt" style={{fontSize:12, color:"var(--text-disabled)", width:32, textAlign:"right"}}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

window.YfirlitV1 = YfirlitV1;
