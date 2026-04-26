/* Húsfélag — POST-SETUP ("daglegur rekstur") state.
 * Used after the 6 onboarding steps are complete.
 *  - Identity hero with stjórn editable
 *  - Athugasemdir panel (action items, dismissable)
 *  - 4 primary actions: change stjórn, change owner, budget, claims
 *  - Bank accounts + rules below
 */
function HusfelagFinal() {
  const ATHUGA = [
    { icon:"warning",   color:"var(--warning)",  text:"2 íbúðir í vanskilum (apríl)",      cta:"Senda áminningar →" },
    { icon:"savings",   color:"var(--positive)", text:"Hússjóður með 32% umfram áætlun",  cta:"Skoða →" },
    { icon:"link_off",  color:"var(--text-tertiary)", text:"1 óflokkuð bankafærsla",      cta:"Flokka færslu →" },
    { icon:"check_circle", color:"var(--positive)", text:"Bankareikningar afstemmdir",    cta:"Síðast: í gær" },
  ];

  const PRIMARY_ACTIONS = [
    { icon:"swap_horiz",      title:"Breyta stjórn",        sub:"Skipta um formann eða gjaldkera" },
    { icon:"person_add",      title:"Skrá nýjan eiganda",   sub:"Tekur yfir fyrir fyrri eiganda íbúðar" },
    { icon:"assessment",      title:"Uppfæra áætlun",       sub:"Tekjur og gjöld 2026" },
    { icon:"event_repeat",    title:"Búa til innheimtu",    sub:"Mánaðargreiðslur eigenda" },
  ];

  return (
    <div className="app">
      <window.Sidebar active="husfelag" />
      <main className="main">
        <div className="ph">
          <div>
            <p className="ph__sub" style={{margin:"0 0 4px"}}>Húsfélag</p>
            <h1 className="ph__title">{H_DATA.name}</h1>
            <p className="ph__sub">Kennitala {H_DATA.kt} · {H_DATA.address} · stofnað 2008</p>
          </div>
          <div className="ph__actions">
            <button className="btn btn--ghost"><span className="material-icons-outlined">edit</span>Breyta upplýsingum</button>
            <button className="btn btn--primary"><span className="material-icons-outlined">person_add</span>Skrá nýjan eiganda</button>
          </div>
        </div>

        <div style={{padding:"24px 32px", overflow:"auto", flex:1, background:"#fff", display:"grid", gridTemplateColumns:"1fr 320px", gap:28}}>

          {/* LEFT: main content */}
          <div>
            {/* Top strip: stjórn + eignarhald */}
            <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:16}}>
              <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"18px 20px"}}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                  <div className="eyebrow eyebrow--navy">STJÓRN</div>
                  <button className="btn btn--ghost" style={{minHeight:0,padding:"4px 8px",fontSize:12}}><span className="material-icons-outlined">swap_horiz</span>Breyta stjórn</button>
                </div>
                <div style={{display:"flex", gap:18}}>
                  <div style={{flex:1, display:"flex", alignItems:"center", gap:12}}>
                    <div style={{width:42, height:42, borderRadius:"50%", background:"var(--brand-green-tint)", color:"var(--positive)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:14}}>JA</div>
                    <div><div style={{fontSize:13.5, fontWeight:500}}>{H_DATA.chair}</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Formaður · síðan jan 2024</div></div>
                  </div>
                  <div style={{flex:1, display:"flex", alignItems:"center", gap:12}}>
                    <div style={{width:42, height:42, borderRadius:"50%", background:"var(--brand-navy-tint)", color:"var(--brand-navy)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:14}}>JR</div>
                    <div><div style={{fontSize:13.5, fontWeight:500}}>{H_DATA.treasurer}</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Gjaldkeri · síðan jan 2024</div></div>
                  </div>
                </div>
              </div>
              <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"18px 20px"}}>
                <div className="eyebrow eyebrow--navy">EIGNARHALD</div>
                <div style={{display:"flex", justifyContent:"space-between", marginTop:10}}>
                  <div><div style={{fontSize:24, fontWeight:300}}>{H_DATA.apartments}</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Íbúðir</div></div>
                  <div><div style={{fontSize:24, fontWeight:300}}>{H_DATA.owners}</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>Eigendur</div></div>
                  <div><div style={{fontSize:24, fontWeight:300}}>425</div><div style={{fontSize:11.5, color:"var(--text-secondary)"}}>m²</div></div>
                </div>
              </div>
            </div>

            {/* Aðgerðir — 4 primary actions */}
            <div style={{marginTop:24}}>
              <h2 className="section-title" style={{marginBottom:12}}>Aðgerðir</h2>
              <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12}}>
                {PRIMARY_ACTIONS.map((a,i)=>(
                  <div key={i} style={{border:"1px solid var(--border)", borderRadius:6, padding:"14px 16px", cursor:"pointer", transition:"150ms"}}
                       onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand-navy)"}
                       onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                    <div style={{width:36, height:36, borderRadius:8, background:"var(--brand-navy-tint)", display:"flex", alignItems:"center", justifyContent:"center"}}>
                      <span className="material-icons-outlined" style={{fontSize:20, color:"var(--brand-navy)"}}>{a.icon}</span>
                    </div>
                    <div style={{fontSize:13.5, fontWeight:500, marginTop:12}}>{a.title}</div>
                    <div style={{fontSize:11.5, color:"var(--text-secondary)", marginTop:2, lineHeight:1.4}}>{a.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bankareikningar */}
            <div style={{marginTop:28}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                <h2 className="section-title">Bankareikningar</h2>
                <div style={{display:"flex", gap:8}}>
                  <button className="btn btn--secondary" style={{padding:"5px 12px",minHeight:0,fontSize:12.5}}><span className="material-icons-outlined">link</span>Tengja banka</button>
                  <button className="btn btn--primary" style={{padding:"5px 12px",minHeight:0,fontSize:12.5}}><span className="material-icons-outlined">add</span>Bæta við</button>
                </div>
              </div>
              <div style={{border:"1px solid var(--border)", borderRadius:4, overflow:"hidden"}}>
                {H_DATA.accounts.map((a,i)=>(
                  <div key={i} style={{display:"grid", gridTemplateColumns:"1fr 130px 220px 140px 40px", alignItems:"center", padding:"12px 18px", borderBottom: i<H_DATA.accounts.length-1?"1px solid var(--border-row)":"none", gap:12}}>
                    <div>
                      <div style={{fontSize:13.5, fontWeight:500}}>{a.name}</div>
                      <div style={{fontSize:11.5, color:"var(--text-disabled)", marginTop:2, display:"flex", alignItems:"center", gap:4}}><span className="material-icons-outlined" style={{fontSize:11, color:"var(--positive)"}}>fiber_manual_record</span>Tengt · afstemmt í gær</div>
                    </div>
                    <div className="amt" style={{fontSize:12, color:"var(--text-secondary)"}}>{a.num}</div>
                    <span className="chip chip--label" style={{justifySelf:"start"}}>{a.type}</span>
                    <div className="amt" style={{fontSize:14.5, fontWeight:500, textAlign:"right"}}>{fmt(a.balance)}</div>
                    <span className="iconbtn" style={{justifySelf:"end"}}><span className="material-icons-outlined">edit</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rules */}
            <div style={{marginTop:28}}>
              <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12}}>
                <div>
                  <h2 className="section-title">Flokkunarreglur</h2>
                  <p style={{fontSize:12, color:"var(--text-secondary)", margin:"2px 0 0"}}>Sjálfvirk flokkun bankafærslna eftir lykilorðum</p>
                </div>
                <button className="btn btn--primary" style={{padding:"5px 12px",minHeight:0,fontSize:12.5}}><span className="material-icons-outlined">add</span>Ný regla</button>
              </div>
              <div style={{border:"1px solid var(--border)", borderRadius:4, overflow:"hidden"}}>
                <table className="t">
                  <thead><tr><th>Skýring inniheldur</th><th>Flokkur</th><th className="r" style={{width:120}}>Notkun</th><th></th></tr></thead>
                  <tbody>
                    {H_DATA.rules.map((r,i)=>(
                      <tr key={i}>
                        <td><span className="amt" style={{fontSize:12}}>"{r.kw}"</span></td>
                        <td><span className="chip chip--label">{r.cat}</span></td>
                        <td className="r" style={{fontSize:12, color:"var(--text-secondary)"}}>{[12,3,8,4][i]} færslur</td>
                        <td className="r">
                          <span className="iconbtn"><span className="material-icons-outlined">edit</span></span>
                          <span className="iconbtn iconbtn--danger"><span className="material-icons-outlined">delete_outline</span></span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT: Athugasemdir panel */}
          <div>
            <div style={{border:"1px solid var(--border)", borderRadius:8, padding:"18px 20px", position:"sticky", top:0}}>
              <div className="eyebrow eyebrow--navy" style={{marginBottom:14}}>ATHUGASEMDIR</div>
              {ATHUGA.map((n,i)=>(
                <div key={i} style={{display:"flex", gap:12, padding:"12px 0", borderBottom: i<ATHUGA.length-1?"1px solid var(--border-row)":"none"}}>
                  <span className="material-icons-outlined" style={{fontSize:22, color:n.color, marginTop:1}}>{n.icon}</span>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13.5, lineHeight:1.4}}>{n.text}</div>
                    <div style={{fontSize:12.5, color:"var(--brand-navy)", marginTop:4, cursor:"pointer", fontWeight:500}}>{n.cta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.HusfelagFinal = HusfelagFinal;
