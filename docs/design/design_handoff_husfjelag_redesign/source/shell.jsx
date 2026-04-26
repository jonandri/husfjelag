/* Shared shell components — sidebar, page header, helpers. */
const { useState } = React;

function Sidebar({ active = "yfirlit", association = "Maríugata 34 - 36, h..." }) {
  const NAV = [
    { id: "yfirlit",   label: "Yfirlit",   icon: "bar_chart" },
    { id: "husfelag",  label: "Húsfélag",  icon: "business" },
    { id: "ibudir",    label: "Íbúðir",    icon: "home" },
    { id: "eigendur",  label: "Eigendur",  icon: "group" },
    { id: "aaetlun",   label: "Áætlun",    icon: "assessment" },
    { id: "innheimta", label: "Innheimta", icon: "account_balance_wallet" },
    { id: "faerslur",  label: "Færslur",   icon: "receipt_long" },
  ];
  return (
    <aside className="sb">
      <div className="sb__logo">
        <img src="ds/assets/logo-full.png" alt="Húsfjelagið" />
      </div>
      <div className="sb__switch">
        <div className="sb__switch-l">Húsfélag</div>
        <div className="sb__switch-n">{association}</div>
      </div>
      <nav className="sb__nav">
        {NAV.map(n => (
          <div key={n.id} className={`sb__item ${active === n.id ? "sb__item--active" : ""}`}>
            <span className="material-icons-outlined">{n.icon}</span>
            <span>{n.label}</span>
          </div>
        ))}
      </nav>
      <div className="sb__bottom">
        <div className="sb__item">
          <span className="material-icons-outlined">settings_suggest</span>
          <span>Kerfisstjórn</span>
          <span className="material-icons-outlined" style={{marginLeft:"auto", fontSize:16}}>expand_more</span>
        </div>
        <div className="sb__item">
          <span className="material-icons-outlined">tune</span>
          <span>Stillingar</span>
        </div>
        <div className="sb__item sb__item--logout">
          <span className="material-icons-outlined">logout</span>
          <span>Útskráning</span>
        </div>
      </div>
    </aside>
  );
}

/* Number formatter (matches production) */
function fmt(n) {
  const v = Math.round(parseFloat(n) || 0);
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${abs} kr.`;
}
function fmtShort(n) {
  const v = Math.round(parseFloat(n) || 0);
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${abs}`;
}
function fmtPct(n) { return (parseFloat(n)||0).toFixed(0) + "%"; }

Object.assign(window, { Sidebar, fmt, fmtShort, fmtPct });
