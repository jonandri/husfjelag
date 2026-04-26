/* Húsfélag — current state recreation. */
const H_DATA = {
  name: "Maríugata 34 - 36, húsfélag",
  kt: "600525-0690",
  address: "Maríugötu 34, 210 Garðabær",
  apartments: 4,
  owners: 7,
  chair: "Jón Andri Sigurðarson",
  treasurer: "Jana Rós Reynisdóttir",
  accounts: [
    { name: "Veltureikningur", num: "0133-26-019111", type: "1200 - Innstæður í bönkum (rekstri)", balance: 242562 },
    { name: "Vaxtareikningur", num: "0133-15-011759", type: "1210 - Varasjóður",                   balance: 160000 },
  ],
  rules: [
    { kw: "Maríugata 34 - 36, húsfélag", cat: "Framkvæmdasjóður",   tone:"green" },
    { kw: "Maríugata 38-40, húsfélag",   cat: "Garðsláttur",        tone:"green" },
    { kw: "Maríugata 34-40, húsfélag",   cat: "Garðsláttur",        tone:"green" },
    { kw: "Sjóvá-Almennar tryggingar hf.", cat: "Húseigendatrygging",tone:"green" },
  ]
};

function HusfelagCurrent() {
  return (
    <div className="app">
      <window.Sidebar active="husfelag" />
      <main className="main">
        <div className="ph">
          <div>
            <h1 className="ph__title">{H_DATA.name}</h1>
            <p className="ph__sub">Kennitala: {H_DATA.kt} · {H_DATA.address}</p>
          </div>
          <div className="ph__actions">
            <button className="btn btn--primary"><span className="material-icons-outlined">add</span>Bæta við eiganda</button>
            <span className="iconbtn"><span className="material-icons-outlined">help_outline</span></span>
          </div>
        </div>

        <div style={{padding:"24px 32px", overflow:"auto", flex:1}}>
          {/* Stat cards */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16}}>
            <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"22px 20px", textAlign:"center"}}>
              <div style={{fontSize:32, color:"var(--positive)", fontWeight:300}}>{H_DATA.apartments}</div>
              <div style={{fontSize:13, color:"var(--text-secondary)", marginTop:6}}>Íbúðir</div>
            </div>
            <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"22px 20px", textAlign:"center"}}>
              <div style={{fontSize:32, color:"var(--positive)", fontWeight:300}}>{H_DATA.owners}</div>
              <div style={{fontSize:13, color:"var(--text-secondary)", marginTop:6}}>Eigendur</div>
            </div>
            <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"18px 20px", textAlign:"center", position:"relative"}}>
              <span className="material-icons-outlined" style={{position:"absolute", top:8, right:8, fontSize:16, color:"var(--text-disabled)"}}>edit</span>
              <div style={{fontSize:16, color:"var(--positive)", fontWeight:500, lineHeight:1.25}}>{H_DATA.chair}</div>
              <div style={{fontSize:13, color:"var(--text-secondary)", marginTop:6}}>Formaður</div>
            </div>
            <div style={{border:"1px solid var(--border)", borderRadius:6, padding:"18px 20px", textAlign:"center", position:"relative"}}>
              <span className="material-icons-outlined" style={{position:"absolute", top:8, right:8, fontSize:16, color:"var(--text-disabled)"}}>edit</span>
              <div style={{fontSize:16, color:"var(--positive)", fontWeight:500, lineHeight:1.25}}>{H_DATA.treasurer}</div>
              <div style={{fontSize:13, color:"var(--text-secondary)", marginTop:6}}>Gjaldkeri</div>
            </div>
          </div>

          {/* Bankareikningar */}
          <div style={{marginTop:24, border:"1px solid var(--border)", borderRadius:4, overflow:"hidden"}}>
            <div style={{padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <h3 className="section-title">Bankareikningar</h3>
              <div style={{display:"flex", gap:8}}>
                <button className="btn btn--secondary">Tengja banka</button>
                <button className="btn btn--primary"><span className="material-icons-outlined">add</span>Bæta við reikning</button>
              </div>
            </div>
            <table className="t">
              <thead><tr><th>HEITI</th><th>REIKNINGSNÚMER</th><th>BÓKHALDSLYKILL</th><th className="r">STAÐA</th><th></th></tr></thead>
              <tbody>
                {H_DATA.accounts.map((a,i)=>(
                  <tr key={i}>
                    <td>{a.name}</td>
                    <td className="amt" style={{color:"var(--text-secondary)"}}>{a.num}</td>
                    <td><span className="chip chip--label">{a.type}</span></td>
                    <td className="amt">{fmt(a.balance)}</td>
                    <td className="r"><span className="iconbtn"><span className="material-icons-outlined">edit</span></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Flokkunarreglur */}
          <div style={{marginTop:24, border:"1px solid var(--border)", borderRadius:4, overflow:"hidden"}}>
            <div style={{padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
              <h3 className="section-title">Flokkunarreglur</h3>
              <button className="btn btn--primary"><span className="material-icons-outlined">add</span>Ný regla</button>
            </div>
            <table className="t">
              <thead><tr><th>LYKILORÐ</th><th>FLOKKUR</th><th></th></tr></thead>
              <tbody>
                {H_DATA.rules.map((r,i)=>(
                  <tr key={i}>
                    <td>{r.kw}</td>
                    <td><span className="chip chip--label">{r.cat}</span></td>
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
      </main>
    </div>
  );
}

window.HusfelagCurrent = HusfelagCurrent;
window.H_DATA = H_DATA;
