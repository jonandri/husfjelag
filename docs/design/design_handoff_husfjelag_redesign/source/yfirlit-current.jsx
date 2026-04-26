/* Yfirlit (dashboard) — current state recreation + 3 redesign variations.
 * Priorities: Upcoming things (meetings, payments due) + Budget vs actual variance.
 */
const { useState: useStateY } = React;

/* ---------- Shared data ---------- */
const Y_KPIS = {
  bank: 242562,
  unpaid: 83459,
  budget: 1001500,
  monthly: 83458,
};

const Y_BUDGET = [
  { cat: "Bankakostnaður",     budget: 0,        actual: -2745   },
  { cat: "Framkvæmdasjóður",   budget: -240000,  actual: -160000 },
  { cat: "Garðsláttur",        budget: -64500,   actual: -14475  },
  { cat: "Hitaveita",          budget: -480000,  actual: -140884 },
  { cat: "Húseigendatrygging", budget: -142000,  actual: 0       },
  { cat: "Rafmagn",            budget: -30000,   actual: -1739   },
  { cat: "Varasjóður",         budget: -20000,   actual: 0       },
  { cat: "Þrif á sorptunnum",  budget: -25000,   actual: 0       },
];
const Y_INCOME = [
  { cat: "Framkvæmdasjóður", actual: 160000 },
  { cat: "Hússjóður",        actual: 259845 },
];
const Y_MONTHS = ["Jan","Feb","Mar","Apr","Maí","Jún","Júl","Ágú","Sep","Okt","Nóv","Des"];
const Y_BARS = [
  { in: 95000, out: -84000 },
  { in: 102000, out: -78000 },
  { in: 222845, out: -135127 },
  null,null,null,null,null,null,null,null,null,
];

const Y_UPCOMING = [
  { date: "01. maí",  type: "Innheimta",   title: "Mánaðarleg innheimta",        meta: "8 íbúðir · 200.750 kr.",         icon: "event_repeat", tone: "navy" },
  { date: "12. maí",  type: "Aðalfundur",  title: "Aðalfundur 2026",             meta: "Kl. 19:30 · Sameign · Skylda",  icon: "groups",       tone: "green" },
  { date: "15. maí",  type: "Reikningur",  title: "Hitaveita — Veitur",          meta: "Áætlað ~140.000 kr.",            icon: "local_fire_department", tone: "warning" },
  { date: "20. maí",  type: "Áminning",    title: "Senda áminningar (2 íbúðir)", meta: "0202 · 0302 — apríl",            icon: "mail",         tone: "neg" },
];

const Y_VARIANCE = Y_BUDGET.map(b => {
  const variance = b.budget - b.actual; // remaining (positive = under budget)
  const pct = b.budget !== 0 ? Math.abs(b.actual / b.budget) : 0;
  return { ...b, variance, pct };
});

/* =======================================================================
 *  V0 — CURRENT (recreation of the screenshot)
 * ======================================================================= */
function YfirlitCurrent() {
  return (
    <div className="app">
      <window.Sidebar active="yfirlit" />
      <main className="main">
        <div className="ph">
          <div>
            <h1 className="ph__title">Yfirlit</h1>
          </div>
          <div className="ph__actions">
            <span className="iconbtn"><span className="material-icons-outlined">help_outline</span></span>
          </div>
        </div>
        <div style={{padding:"12px 32px", borderBottom:"1px solid var(--border)", background:"var(--bg-toolbar)"}}>
          <button className="chip chip--label-navy" style={{padding:"6px 12px",fontWeight:500,border:"1px solid #d8d8d8",background:"#fff",color:"var(--text-body)",borderRadius:4}}>2026 ▾</button>
        </div>

        <div style={{padding:"24px 32px", overflow:"auto", flex:1}}>
          {/* KPI tiles */}
          <div style={{display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:16}}>
            {[
              {label:"Innstæður í bönkum", val: fmt(Y_KPIS.bank), color:"var(--positive)"},
              {label:"Ógreidd innheimta",  val: fmt(Y_KPIS.unpaid), color:"var(--negative)"},
              {label:"Áætlun 2026",        val: fmt(Y_KPIS.budget), color:"var(--brand-navy)"},
              {label:"Mánaðarleg innheimta",val: fmt(Y_KPIS.monthly), color:"var(--positive)"},
            ].map((k,i)=>(
              <div key={i} style={{border:"1px solid var(--border)",borderRadius:6,padding:"18px 20px",textAlign:"center"}}>
                <div className="amt" style={{fontSize:22, color:k.color, fontWeight:500}}>{k.val}</div>
                <div style={{fontSize:13, color:"var(--text-secondary)",marginTop:6}}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div style={{marginTop:24, border:"1px solid var(--border)",borderRadius:6,padding:"16px 20px"}}>
            <div className="eyebrow eyebrow--navy" style={{marginBottom:12}}>MÁNAÐARLEG HREYFING</div>
            <div style={{display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:8, height:120}}>
              {Y_BARS.map((b,i)=>(
                <div key={i} style={{flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4}}>
                  <div style={{display:"flex", gap:2, alignItems:"flex-end", height:90}}>
                    {b && <>
                      <div style={{width:14, background:"var(--brand-green)", height: (b.in/250000)*90}}/>
                      <div style={{width:14, background:"#e57373", height: Math.abs(b.out/250000)*90}}/>
                    </>}
                  </div>
                  <div style={{fontSize:11, color:"var(--text-secondary)"}}>{Y_MONTHS[i]}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11.5, color:"var(--text-disabled)", marginTop:8}}>Smelltu á mánuð til að sjá sundurliðun</div>
          </div>

          {/* Tekjur */}
          <div className="eyebrow" style={{marginTop:24, marginBottom:8}}>TEKJUR</div>
          <table className="t" style={{border:"1px solid var(--border)", borderRadius:4}}>
            <thead><tr><th>FLOKKUR</th><th className="r">RAUN</th></tr></thead>
            <tbody>
              {Y_INCOME.map((r,i)=>(
                <tr key={i}><td>{r.cat}</td><td className="amt amt--pos">{fmt(r.actual)}</td></tr>
              ))}
            </tbody>
            <tfoot><tr><td>Samtals tekjur</td><td className="amt amt--pos">{fmt(Y_INCOME.reduce((s,r)=>s+r.actual,0))}</td></tr></tfoot>
          </table>

          {/* Gjöld */}
          <div className="eyebrow eyebrow--neg" style={{marginTop:24, marginBottom:8, color:"var(--negative)"}}>GJÖLD</div>
          <table className="t" style={{border:"1px solid var(--border)", borderRadius:4}}>
            <thead><tr><th>FLOKKUR</th><th className="r">ÁÆTLUN</th><th className="r">RAUN</th><th className="r">FRÁVIK</th><th className="r">%</th></tr></thead>
            <tbody>
              {Y_VARIANCE.map((r,i)=>(
                <tr key={i}>
                  <td>{r.cat}</td>
                  <td className="amt amt--zero">{r.budget? fmt(r.budget) : "—"}</td>
                  <td className={"amt " + (r.actual<0?"amt--neg":r.actual>0?"amt--pos":"amt--zero")}>{r.actual? fmt(r.actual) : "—"}</td>
                  <td className={"amt " + (r.variance>0?"amt--pos":r.variance<0?"amt--neg":"amt--zero")}>{r.variance? fmt(r.variance) : "—"}</td>
                  <td className="amt amt--zero">{r.budget? Math.round(r.pct*100)+"%" : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Samtals gjöld</td>
                <td className="amt">{fmt(Y_VARIANCE.reduce((s,r)=>s+r.budget,0))}</td>
                <td className="amt">{fmt(Y_VARIANCE.reduce((s,r)=>s+r.actual,0))}</td>
                <td className="amt amt--pos">{fmt(Y_VARIANCE.reduce((s,r)=>s+r.variance,0))}</td>
                <td className="amt">32%</td>
              </tr>
            </tfoot>
          </table>

          {/* Niðurstaða */}
          <div style={{marginTop:16, background:"var(--brand-navy)", color:"#fff", padding:"14px 20px", display:"flex", justifyContent:"space-between", borderRadius:4}}>
            <div style={{fontWeight:500, fontSize:14}}>Niðurstaða (Tekjur − Gjöld)</div>
            <div className="amt" style={{fontWeight:600}}>{fmt(100002)}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.YfirlitCurrent = YfirlitCurrent;
