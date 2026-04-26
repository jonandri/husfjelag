/* Húsfélag V3 — Empty / Onboarding state.
 *   Brand-new association, almost nothing set up. Heavy CTAs in context.
 */
function HusfelagV3() {
  return (
    <div className="app">
      <window.Sidebar active="husfelag" />
      <main className="main">
        <div className="ph">
          <div>
            <h1 className="ph__title">Maríugata 34 - 36, húsfélag</h1>
            <p className="ph__sub">Kennitala 600525-0690 · stofnað 12. apríl 2026</p>
          </div>
          <div className="ph__actions">
            <button className="btn btn--ghost"><span className="material-icons-outlined">help_outline</span>Leiðbeiningar</button>
          </div>
        </div>

        <div style={{padding:"28px 32px", overflow:"auto", flex:1, background:"#fff"}}>

          {/* Big setup hero */}
          <div style={{border:"1px solid var(--border)", borderRadius:8, padding:"28px 32px"}}>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
              <div>
                <div className="eyebrow">UPPSETNING · 2 AF 6 LOKIÐ</div>
                <h2 style={{fontSize:24, fontWeight:300, margin:"6px 0 4px"}}>Settu upp húsfélagið — <span style={{fontWeight:600}}>4 skref eftir</span></h2>
                <p style={{fontSize:13.5, color:"var(--text-secondary)", margin:0}}>Eftir uppsetningu sér kerfið um innheimtu, afstemmingu og ársskýrslu.</p>
              </div>
              <div style={{textAlign:"right"}}>
                <div className="amt" style={{fontSize:28, fontWeight:300, color:"var(--brand-navy)"}}>33%</div>
                <div style={{fontSize:11, color:"var(--text-disabled)", letterSpacing:"0.06em"}}>LOKIÐ</div>
              </div>
            </div>
            <div style={{height:5, background:"#f0f0f0", borderRadius:3, marginTop:18, overflow:"hidden", display:"flex"}}>
              <div style={{width:"33%", background:"var(--brand-green)"}}/>
            </div>
            <div style={{display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginTop:20}}>
              {[
                {done:true, icon:"business", title:"Stofna húsfélag", sub:"Heiti, kennitala, heimilisfang"},
                {done:true, icon:"group", title:"Bæta við stjórn", sub:"Formaður og gjaldkeri skráðir"},
                {done:false, primary:true, icon:"home", title:"Skrá íbúðir", sub:"4 íbúðir + eignarhlutföll"},
                {done:false, icon:"account_balance", title:"Tengja banka", sub:"Sjálfvirk afstemming"},
                {done:false, icon:"rule", title:"Setja flokkunarreglur", sub:"Sjálfvirk flokkun bankafærslna"},
                {done:false, icon:"event_repeat", title:"Hefja innheimtu", sub:"Mánaðarlegar greiðslur"},
              ].map((s,i)=>(
                <div key={i} style={{
                  border: s.primary?"1.5px solid var(--brand-navy)":"1px solid var(--border)",
                  background: s.done? "var(--bg-toolbar)": s.primary?"var(--brand-navy-tint)":"#fff",
                  borderRadius:6, padding:"14px 16px", opacity: s.done?0.7:1, cursor:"pointer"
                }}>
                  <div style={{display:"flex", alignItems:"center", gap:10}}>
                    <span className="material-icons-outlined" style={{fontSize:18, color: s.done?"var(--positive)": s.primary?"var(--brand-navy)":"var(--text-secondary)"}}>{s.done?"check_circle":s.icon}</span>
                    <span style={{fontSize:13.5, fontWeight:500, color: s.primary?"var(--brand-navy)":"var(--text-primary)"}}>{s.title}</span>
                  </div>
                  <div style={{fontSize:11.5, color:"var(--text-secondary)", marginTop:6, marginLeft:28}}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Stjórn (the only filled-in thing besides identity) */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:28}}>
            <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"18px 20px"}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                <div className="eyebrow eyebrow--navy">STJÓRN</div>
                <button className="btn btn--ghost" style={{minHeight:0,padding:"4px 8px",fontSize:12}}><span className="material-icons-outlined">edit</span>Breyta</button>
              </div>
              <div style={{display:"flex", gap:14, alignItems:"center", padding:"8px 0"}}>
                <div style={{width:38, height:38, borderRadius:"50%", background:"var(--brand-green-tint)", color:"var(--positive)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:13}}>JA</div>
                <div><div style={{fontSize:13.5, fontWeight:500}}>Jón Andri Sigurðarson</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Formaður</div></div>
              </div>
              <div style={{display:"flex", gap:14, alignItems:"center", padding:"8px 0"}}>
                <div style={{width:38, height:38, borderRadius:"50%", background:"var(--brand-navy-tint)", color:"var(--brand-navy)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:13}}>JR</div>
                <div><div style={{fontSize:13.5, fontWeight:500}}>Jana Rós Reynisdóttir</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Gjaldkeri</div></div>
              </div>
            </div>

            <div style={{border:"1.5px dashed #c5cfe8", borderRadius:6, padding:"18px 20px", background:"#fafbfd", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"flex-start"}}>
              <div className="eyebrow eyebrow--navy">ÍBÚÐIR · NÆSTA SKREF</div>
              <div style={{fontSize:14.5, fontWeight:500, margin:"6px 0 4px"}}>Engar íbúðir skráðar enn</div>
              <p style={{fontSize:12.5, color:"var(--text-secondary)", margin:"0 0 14px"}}>Skráðu íbúðirnar fjórar svo eignarhlutföllin reiknist sjálfkrafa.</p>
              <button className="btn btn--primary"><span className="material-icons-outlined">add</span>Skrá íbúðir</button>
            </div>
          </div>

          {/* Empty bank + rules */}
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:16}}>
            <div style={{border:"1.5px dashed #c5cfe8", borderRadius:6, padding:"22px", background:"#fafbfd", textAlign:"center"}}>
              <span className="material-icons-outlined" style={{fontSize:32, color:"var(--brand-navy)"}}>account_balance</span>
              <div style={{fontSize:14.5, fontWeight:500, marginTop:8}}>Tengja banka</div>
              <p style={{fontSize:12, color:"var(--text-secondary)", margin:"4px 0 14px"}}>Bankafærslur birtast sjálfkrafa og afstemmast við innheimtur</p>
              <div style={{display:"flex", gap:8, justifyContent:"center"}}>
                <button className="btn btn--secondary">Tengja Landsbanka</button>
                <button className="btn btn--ghost">Annað →</button>
              </div>
            </div>
            <div style={{border:"1.5px dashed #c5cfe8", borderRadius:6, padding:"22px", background:"#fafbfd", textAlign:"center"}}>
              <span className="material-icons-outlined" style={{fontSize:32, color:"var(--brand-navy)"}}>rule</span>
              <div style={{fontSize:14.5, fontWeight:500, marginTop:8}}>Engar flokkunarreglur</div>
              <p style={{fontSize:12, color:"var(--text-secondary)", margin:"4px 0 14px"}}>Búðu til reglur til að flokka bankafærslur sjálfkrafa</p>
              <button className="btn btn--secondary">Búa til fyrstu reglu</button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

window.HusfelagV3 = HusfelagV3;
