import { useEffect, useState } from "react";
import HomePage from "./pages/HomePage";
import AssistantPage from "./pages/AssistantPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import PulseMark from "./components/PulseMark";
import CustomCursor from "./components/CustomCursor";

const TABS=[
  {key:"home",label:"Overview",glyph:"✦"},
  {key:"assistant",label:"Ask AI Assistant",glyph:"◌"},
  {key:"recommendations",label:"Explore & Recommend",glyph:"↗"}
];
export default function App(){
  const [active,setActive]=useState("home");
  useEffect(() => {
    // Every section starts at its real beginning instead of preserving a
    // previous scroll position near the embedded dashboard or page footer.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [active]);
  return <div className="app-shell"><CustomCursor/><header className="site-header"><button className="brand" onClick={()=>setActive("home")}><PulseMark width={46} height={18} strokeWidth={2.6}/><span>Conference <i>Pulse</i></span></button><nav className="main-nav">{TABS.map(t=><button key={t.key} onClick={()=>setActive(t.key)} className={active===t.key?"active":""}><small>{t.glyph}</small>{t.label}</button>)}</nav><div className="status"><span></span>LIVE DATA</div></header><main key={active} className="page-transition">{active==="home"&&<HomePage/>}{active==="assistant"&&<AssistantPage/>}{active==="recommendations"&&<RecommendationsPage/>}</main></div>}
