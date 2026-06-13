import { useState, useRef, useCallback } from "react";

const API = "http://localhost:8000/api/v1";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0a0a0a; --surface:#111111; --surface2:#181818;
    --border:#242424; --border2:#2e2e2e;
    --gold:#c8a84b; --gold-dim:#7a6430; --gold-glow:rgba(200,168,75,0.12);
    --green:#3d9970; --red:#c0392b; --blue:#2980b9;
    --text:#e8e8e0; --text-dim:#888880; --text-faint:#444440;
    --mono:'IBM Plex Mono',monospace; --sans:'IBM Plex Sans',sans-serif;
    --r:3px;
  }
  html,body,#root { background:var(--bg); color:var(--text); font-family:var(--sans); font-size:14px; line-height:1.6; min-height:100vh; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-track { background:var(--bg); }
  ::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }

  .shell { display:grid; grid-template-rows:48px 1fr; min-height:100vh; }
  .topbar { display:flex; align-items:center; justify-content:space-between; padding:0 24px; border-bottom:1px solid var(--border); background:var(--surface); position:sticky; top:0; z-index:100; }
  .brand { font-family:var(--mono); font-size:11px; font-weight:600; letter-spacing:.12em; color:var(--gold); text-transform:uppercase; }
  .topstatus { font-family:var(--mono); font-size:10px; color:var(--text-faint); letter-spacing:.08em; display:flex; align-items:center; gap:7px; }
  .dot { width:6px; height:6px; border-radius:50%; background:var(--green); animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  .main { display:grid; grid-template-columns:300px 1fr; min-height:calc(100vh - 48px); }
  @media(max-width:768px){ .main{grid-template-columns:1fr} .left-panel{border-right:none;border-bottom:1px solid var(--border)} }

  .left-panel { border-right:1px solid var(--border); display:flex; flex-direction:column; }
  .sec { border-bottom:1px solid var(--border); padding:18px; }
  .sec-lbl { font-family:var(--mono); font-size:9px; font-weight:600; letter-spacing:.14em; color:var(--text-faint); text-transform:uppercase; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
  .sec-lbl::after { content:''; flex:1; height:1px; background:var(--border); }

  .dropzone { border:1px dashed var(--border2); border-radius:var(--r); padding:28px 16px; text-align:center; cursor:pointer; background:var(--surface2); transition:all .2s; }
  .dropzone:hover,.dropzone.drag { border-color:var(--gold); background:var(--gold-glow); }
  .dz-icon { font-size:26px; margin-bottom:10px; opacity:.55; }
  .dz-title { font-family:var(--mono); font-size:11px; font-weight:500; margin-bottom:5px; letter-spacing:.05em; }
  .dz-sub { font-size:11px; color:var(--text-faint); }

  .prog { height:2px; background:var(--border); border-radius:1px; overflow:hidden; margin-top:10px; }
  .prog-fill { height:100%; background:var(--gold); border-radius:1px; transition:width .4s ease; }

  .pill { display:inline-flex; align-items:center; gap:5px; font-family:var(--mono); font-size:10px; font-weight:500; letter-spacing:.07em; padding:3px 9px; border-radius:2px; text-transform:uppercase; }
  .pill-idle { background:#1a1a1a; color:var(--text-faint); border:1px solid var(--border); }
  .pill-loading { background:rgba(200,168,75,.1); color:var(--gold); border:1px solid var(--gold-dim); }
  .pill-done { background:rgba(61,153,112,.1); color:var(--green); border:1px solid rgba(61,153,112,.3); }
  .pill-error { background:rgba(192,57,43,.1); color:var(--red); border:1px solid rgba(192,57,43,.3); }

  .gauge-wrap { display:flex; flex-direction:column; align-items:center; padding:6px 0; }
  .ring-bg { fill:none; stroke:var(--border2); }
  .ring-fill { fill:none; stroke-linecap:butt; transition:stroke-dashoffset 1s cubic-bezier(.4,0,.2,1); }
  .ring-num { font-family:var(--mono); font-size:30px; font-weight:600; dominant-baseline:middle; text-anchor:middle; }
  .ring-lbl { font-family:var(--mono); font-size:9px; letter-spacing:.14em; fill:var(--text-faint); dominant-baseline:middle; text-anchor:middle; }
  .grade-badge { font-family:var(--mono); font-size:18px; font-weight:600; padding:2px 14px; border-radius:2px; letter-spacing:.06em; margin-top:8px; }
  .gA{background:rgba(61,153,112,.15);color:#3d9970;border:1px solid rgba(61,153,112,.3)}
  .gB{background:rgba(200,168,75,.12);color:var(--gold);border:1px solid var(--gold-dim)}
  .gC{background:rgba(230,126,34,.12);color:#e67e22;border:1px solid rgba(230,126,34,.3)}
  .gD{background:rgba(192,57,43,.12);color:var(--red);border:1px solid rgba(192,57,43,.3)}
  .gF{background:rgba(192,57,43,.18);color:var(--red);border:1px solid rgba(192,57,43,.4)}

  .cbar-row { display:grid; grid-template-columns:1fr 26px; align-items:center; gap:6px; margin-bottom:9px; }
  .cbar-name { font-family:var(--mono); font-size:9px; color:var(--text-faint); letter-spacing:.04em; margin-bottom:3px; display:flex; justify-content:space-between; }
  .cbar-track { height:2px; background:var(--border); border-radius:1px; overflow:hidden; }
  .cbar-fill { height:100%; border-radius:1px; transition:width .8s ease; }
  .cbar-val { font-family:var(--mono); font-size:9px; text-align:right; }

  .chip-row { display:flex; flex-wrap:wrap; gap:5px; }
  .chip { font-family:var(--mono); font-size:10px; padding:3px 8px; border-radius:2px; }
  .cm { background:rgba(192,57,43,.08); color:#c0392b; border:1px solid rgba(192,57,43,.2); }
  .cb { background:rgba(61,153,112,.08); color:var(--green); border:1px solid rgba(61,153,112,.2); }

  .right-panel { display:grid; grid-template-rows:auto 1fr; }
  .tabs { display:flex; border-bottom:1px solid var(--border); padding:0 22px; background:var(--surface); }
  .tab { font-family:var(--mono); font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--text-faint); border:none; background:none; padding:13px 14px; cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; transition:all .15s; }
  .tab:hover { color:var(--text); }
  .tab.on { color:var(--gold); border-bottom-color:var(--gold); }
  .cnt { display:inline-flex; align-items:center; justify-content:center; width:15px; height:15px; border-radius:2px; background:var(--border2); font-size:9px; margin-left:5px; }
  .tab.on .cnt { background:var(--gold-dim); color:var(--gold); }

  .tab-body { padding:22px; overflow-y:auto; max-height:calc(100vh - 48px - 41px); }

  .cat-wrap { margin-bottom:18px; }
  .cat-lbl { font-family:var(--mono); font-size:9px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:var(--text-faint); margin-bottom:7px; display:flex; align-items:center; gap:8px; }
  .cat-lbl::after { content:''; flex:1; height:1px; background:var(--border); }
  .tags { display:flex; flex-wrap:wrap; gap:5px; }
  .tag { font-family:var(--mono); font-size:11px; padding:3px 9px; border-radius:2px; background:var(--surface2); border:1px solid var(--border2); color:var(--text); transition:all .15s; cursor:default; }
  .tag:hover { border-color:var(--gold); color:var(--gold); }
  .tag .occ { font-size:9px; color:var(--text-faint); margin-left:4px; }
  .cat-languages .tag { border-left:2px solid #2980b9; }
  .cat-web_frameworks .tag { border-left:2px solid #8e44ad; }
  .cat-databases .tag { border-left:2px solid #27ae60; }
  .cat-cloud_devops .tag { border-left:2px solid #e67e22; }
  .cat-data_ml .tag { border-left:2px solid #e74c3c; }
  .cat-tools_practices .tag { border-left:2px solid #16a085; }
  .cat-soft_skills .tag { border-left:2px solid #7f8c8d; }

  .jcard { border:1px solid var(--border); border-radius:var(--r); padding:14px 16px; margin-bottom:10px; background:var(--surface2); position:relative; overflow:hidden; transition:border-color .15s; }
  .jcard::before { content:''; position:absolute; left:0;top:0;bottom:0; width:2px; background:var(--gold); opacity:0; transition:opacity .15s; }
  .jcard:hover::before,.jcard.top::before { opacity:1; }
  .jcard-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; }
  .jrank { font-family:var(--mono); font-size:9px; color:var(--text-faint); letter-spacing:.07em; margin-bottom:3px; }
  .jtitle { font-size:13px; font-weight:600; color:var(--text); margin-bottom:2px; }
  .jco { font-size:11px; color:var(--text-dim); }
  .jpct { font-family:var(--mono); font-size:20px; font-weight:600; color:var(--gold); white-space:nowrap; }
  .jpct span { font-size:11px; color:var(--gold-dim); }
  .jmeta { display:flex; gap:10px; margin-bottom:8px; flex-wrap:wrap; }
  .jmeta-c { font-family:var(--mono); font-size:10px; color:var(--text-faint); }
  .jskills { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:9px; }
  .ms { font-family:var(--mono); font-size:10px; padding:2px 6px; border-radius:2px; background:rgba(61,153,112,.1); color:var(--green); border:1px solid rgba(61,153,112,.25); }
  .mss { font-family:var(--mono); font-size:10px; padding:2px 6px; border-radius:2px; background:rgba(192,57,43,.08); color:#c0392b; border:1px solid rgba(192,57,43,.2); }
  .jbars { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; padding-top:9px; border-top:1px solid var(--border); }
  .mscore { font-family:var(--mono); font-size:9px; color:var(--text-faint); letter-spacing:.05em; }
  .mscore b { font-size:13px; font-weight:600; display:block; margin-bottom:1px; }
  .rtoggle { font-family:var(--mono); font-size:10px; color:var(--text-faint); background:none; border:none; cursor:pointer; padding:6px 0 2px; letter-spacing:.05em; }
  .rtoggle:hover { color:var(--gold); }
  .rlist { padding:6px 0 2px; }
  .ri { font-size:11.5px; color:var(--text-faint); padding:2px 0 2px 12px; position:relative; line-height:1.5; }
  .ri::before { content:'→'; position:absolute; left:0; opacity:.5; }

  .sug-item { display:flex; gap:10px; padding:11px 0; border-bottom:1px solid var(--border); }
  .sug-item:last-child { border-bottom:none; }
  .sug-num { font-family:var(--mono); font-size:10px; color:var(--text-faint); min-width:20px; padding-top:1px; }
  .sug-txt { font-size:12.5px; color:var(--text-dim); line-height:1.6; }
  .sug-item:first-child .sug-txt { color:var(--gold); font-weight:500; }

  .empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:260px; gap:10px; color:var(--text-faint); font-family:var(--mono); font-size:11px; letter-spacing:.08em; }
  .empty-ico { font-size:30px; opacity:.25; }
  .spin { width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite; }
  @keyframes spin { to{transform:rotate(360deg)} }
`;

const sc = v => v >= 75 ? "#3d9970" : v >= 55 ? "#c8a84b" : v >= 35 ? "#e67e22" : "#c0392b";
const CAT_ORD = ["languages","web_frameworks","databases","cloud_devops","data_ml","tools_practices","soft_skills"];

function Ring({ score = 0 }) {
  const R = 50, sw = 5, C = 2 * Math.PI * R;
  return (
    <div className="gauge-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle className="ring-bg" cx="60" cy="60" r={R} strokeWidth={sw} />
        <circle className="ring-fill" cx="60" cy="60" r={R} strokeWidth={sw}
          stroke={sc(score)} strokeDasharray={C}
          strokeDashoffset={C - (score / 100) * C}
          transform="rotate(-90 60 60)" />
        <text className="ring-num" x="60" y="57" fill={sc(score)}>{score.toFixed(0)}</text>
        <text className="ring-lbl" x="60" y="75">ATS SCORE</text>
      </svg>
    </div>
  );
}

function CBar({ name, score, weight }) {
  const short = { "Skill Match":"SKILLS","Experience Relevance":"EXPERIENCE","Keyword Optimisation":"KEYWORDS","Education Fit":"EDUCATION" }[name] || name.toUpperCase();
  return (
    <div className="cbar-row">
      <div>
        <div className="cbar-name"><span>{short}</span><span>{Math.round(weight * 100)}%</span></div>
        <div className="cbar-track"><div className="cbar-fill" style={{ width:`${score}%`, background:sc(score) }} /></div>
      </div>
      <div className="cbar-val" style={{ color:sc(score) }}>{score.toFixed(0)}</div>
    </div>
  );
}

function JCard({ job }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`jcard${job.rank===1?" top":""}`}>
      <div className="jcard-head">
        <div>
          <div className="jrank">#{job.rank} MATCH</div>
          <div className="jtitle">{job.title}</div>
          <div className="jco">{job.company}</div>
        </div>
        <div className="jpct">{job.match_pct.toFixed(1)}<span>%</span></div>
      </div>
      <div className="jmeta">
        {job.location && <span className="jmeta-c">◎ {job.location}</span>}
        {job.salary_range && <span className="jmeta-c">$ {job.salary_range}</span>}
        {job.experience_required > 0 && <span className="jmeta-c">⌛ {job.experience_required}yr req.</span>}
      </div>
      <div className="jskills">
        {job.matched_skills.slice(0,8).map(s=><span key={s} className="ms">{s}</span>)}
        {job.missing_skills.slice(0,4).map(s=><span key={s} className="mss">−{s}</span>)}
      </div>
      <div className="jbars">
        {[["SKILL",job.skill_score],["SEMANTIC",job.semantic_score],["EXPERIENCE",job.experience_score]].map(([l,v])=>(
          <div className="mscore" key={l}><b style={{color:sc(v)}}>{v.toFixed(0)}</b>{l}</div>
        ))}
      </div>
      {job.reasons?.length > 0 && <>
        <button className="rtoggle" onClick={()=>setOpen(o=>!o)}>
          {open?"▾ HIDE":"▸ SHOW"} REASONS
        </button>
        {open && <div className="rlist">{job.reasons.map((r,i)=><div key={i} className="ri">{r}</div>)}</div>}
      </>}
    </div>
  );
}

function SkillsTab({ skills, byCategory }) {
  if (!skills?.length) return <div className="empty"><div className="empty-ico">◈</div>NO SKILLS EXTRACTED</div>;
  const cats = Object.keys(byCategory).sort((a,b)=>CAT_ORD.indexOf(a)-CAT_ORD.indexOf(b));
  return <div>
    {cats.map(cat=>(
      <div key={cat} className={`cat-wrap cat-${cat}`}>
        <div className="cat-lbl">{cat.replace(/_/g," ")}<span style={{fontFamily:"var(--mono)",fontSize:9,color:"var(--text-faint)"}}>{byCategory[cat].length}</span></div>
        <div className="tags">
          {byCategory[cat].map(name=>{
            const sk = skills.find(s=>s.name===name);
            return <span key={name} className="tag">{name}{sk?.occurrences>1&&<span className="occ">×{sk.occurrences}</span>}</span>;
          })}
        </div>
      </div>
    ))}
  </div>;
}

export default function App() {
  const [stage, setStage] = useState("idle");
  const [drag, setDrag] = useState(false);
  const [fname, setFname] = useState(null);
  const [prog, setProg] = useState(0);
  const [upload, setUpload] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [matches, setMatches] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("skills");
  const ref = useRef();

  const run = useCallback(async f => {
    setFname(f.name); setErr(null); setProg(10);
    try {
      setStage("uploading");
      const form = new FormData(); form.append("file", f);
      const ur = await fetch(`${API}/upload-resume`,{method:"POST",body:form});
      if (!ur.ok) throw new Error((await ur.json()).detail||"Upload failed");
      const ud = await ur.json();
      setUpload(ud); setProg(35);

      setStage("analyzing");
      const ar = await fetch(`${API}/analyze?resume_id=${ud.resume_id}`);
      if (!ar.ok) throw new Error((await ar.json()).detail||"Analysis failed");
      const ad = await ar.json();
      setAnalysis(ad); setProg(65);

      setStage("matching");
      const mr = await fetch(`${API}/match-jobs?resume_id=${ud.resume_id}&top_n=5`);
      if (!mr.ok) throw new Error((await mr.json()).detail||"Match failed");
      const md = await mr.json();
      setMatches(md); setProg(100);

      setStage("done");
    } catch(e) {
      setErr(e.message||String(e)); setStage("error"); setProg(0);
    }
  }, []);

  const onFiles = useCallback(files => {
    const f = files[0]; if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf","docx"].includes(ext)) { setErr("Only PDF and DOCX supported."); setStage("error"); return; }
    run(f);
  }, [run]);

  const labels = { idle:"READY", uploading:"UPLOADING…", analyzing:"ANALYSING…", matching:"MATCHING…", done:"COMPLETE", error:"ERROR" };
  const pillCls = { idle:"pill-idle", uploading:"pill-loading", analyzing:"pill-loading", matching:"pill-loading", done:"pill-done", error:"pill-error" };

  const ats = analysis?.ats_score;
  const nlp = analysis?.analysis;
  const skCnt = nlp?.skill_count ?? 0;
  const mCnt = matches?.matches?.length ?? 0;
  const sugCnt = ats?.suggestions?.length ?? 0;

  return <>
    <style>{css}</style>
    <div className="shell">
      <header className="topbar">
        <span className="brand">Resume Analyzer</span>
        <span className="topstatus"><span className="dot" />{labels[stage]||stage.toUpperCase()}</span>
      </header>

      <div className="main">
        {/* LEFT */}
        <aside className="left-panel">
          <div className="sec">
            <div className="sec-lbl">Upload</div>
            <div className={`dropzone${drag?" drag":""}`}
              onDragOver={e=>{e.preventDefault();setDrag(true)}}
              onDragLeave={()=>setDrag(false)}
              onDrop={e=>{e.preventDefault();setDrag(false);onFiles(e.dataTransfer.files)}}
              onClick={()=>ref.current?.click()}>
              <input ref={ref} type="file" accept=".pdf,.docx" style={{display:"none"}} onChange={e=>onFiles(e.target.files)} />
              <div className="dz-icon">{stage==="done"?"✓":"⤒"}</div>
              <div className="dz-title">{fname||"DROP RESUME HERE"}</div>
              <div className="dz-sub">{fname?"Click to replace":"PDF or DOCX · max 10 MB"}</div>
            </div>
            {stage!=="idle" && <div className="prog"><div className="prog-fill" style={{width:`${prog}%`}} /></div>}
            {stage!=="idle" && (
              <div style={{marginTop:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span className={`pill ${pillCls[stage]}`}>
                  {pillCls[stage]==="pill-loading"&&<div className="spin" style={{width:8,height:8,borderWidth:1.5}} />}
                  {labels[stage]}
                </span>
                {upload && <span style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--text-faint)"}}>{upload.word_count.toLocaleString()} words</span>}
              </div>
            )}
            {err && <div style={{marginTop:10,fontFamily:"var(--mono)",fontSize:11,color:"var(--red)",lineHeight:1.5}}>⚠ {err}</div>}
          </div>

          <div className="sec">
            <div className="sec-lbl">ATS Score</div>
            {ats ? <>
              <Ring score={ats.ats_score} />
              <div style={{textAlign:"center"}}>
                <span className={`grade-badge g${ats.grade}`}>Grade {ats.grade}</span>
              </div>
              <div style={{marginTop:16}}>
                {ats.components.map(c=><CBar key={c.name} name={c.name} score={c.raw_score} weight={c.weight} />)}
              </div>
            </> : (
              <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text-faint)",textAlign:"center",padding:"18px 0"}}>
                {stage==="idle"||stage==="error" ? "—" : <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}><div className="spin" />SCORING</div>}
              </div>
            )}
          </div>

          {ats?.missing_skills?.length > 0 && (
            <div className="sec">
              <div className="sec-lbl">Skill Gaps</div>
              <div className="chip-row">{ats.missing_skills.map(s=><span key={s} className="chip cm">−{s}</span>)}</div>
            </div>
          )}
          {ats?.bonus_skills?.length > 0 && (
            <div className="sec">
              <div className="sec-lbl">Bonus Skills</div>
              <div className="chip-row">{ats.bonus_skills.map(s=><span key={s} className="chip cb">+{s}</span>)}</div>
            </div>
          )}
        </aside>

        {/* RIGHT */}
        <section className="right-panel">
          <div className="tabs">
            {[["skills","Skills",skCnt],["matches","Job Matches",mCnt],["suggestions","Suggestions",sugCnt]].map(([id,lbl,ct])=>(
              <button key={id} className={`tab${tab===id?" on":""}`} onClick={()=>setTab(id)}>
                {lbl}{ct>0&&<span className="cnt">{ct}</span>}
              </button>
            ))}
          </div>

          <div className="tab-body">
            {tab==="skills" && (
              !nlp
                ? <div className="empty"><div className="empty-ico">◈</div>{stage==="idle"||stage==="error"?"UPLOAD A RESUME TO BEGIN":<><div className="spin" />EXTRACTING</>}</div>
                : <>
                    <SkillsTab skills={nlp.skills} byCategory={nlp.skills_by_category} />
                    {nlp.education?.length>0 && <div style={{marginTop:24}}>
                      <div className="cat-lbl">Education</div>
                      {nlp.education.map((e,i)=>(
                        <div key={i} style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text-dim)",marginBottom:6}}>
                          {e.degree} {e.field&&`· ${e.field}`}
                          {e.institution&&<span style={{color:"var(--text-faint)"}}> · {e.institution}</span>}
                          {e.year&&<span style={{color:"var(--text-faint)"}}> · {e.year}</span>}
                        </div>
                      ))}
                    </div>}
                    {nlp.experience?.length>0 && <div style={{marginTop:18}}>
                      <div className="cat-lbl">Experience</div>
                      {nlp.experience.map((ex,i)=>(
                        <div key={i} style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--text-dim)",marginBottom:6}}>
                          {ex.title}{ex.company&&<span style={{color:"var(--text-faint)"}}> @ {ex.company}</span>}
                          {ex.start_year&&<span style={{color:"var(--text-faint)"}}> · {ex.start_year}–{ex.end_year??"present"}</span>}
                        </div>
                      ))}
                    </div>}
                  </>
            )}

            {tab==="matches" && (
              !matches
                ? <div className="empty"><div className="empty-ico">⊙</div>{stage==="idle"||stage==="error"?"NO MATCHES YET":<><div className="spin" />MATCHING JOBS</>}</div>
                : matches.matches.length===0
                  ? <div className="empty"><div className="empty-ico">⊙</div>NO JOBS ABOVE THRESHOLD</div>
                  : <div>
                      <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--text-faint)",marginBottom:14,letterSpacing:".07em"}}>
                        SEARCHED {matches.total_jobs_searched} POSITIONS · TOP {matches.matches.length} MATCHES
                      </div>
                      {matches.matches.map(m=><JCard key={m.job_id} job={m} />)}
                    </div>
            )}

            {tab==="suggestions" && (
              !ats
                ? <div className="empty"><div className="empty-ico">☰</div>{stage==="idle"||stage==="error"?"UPLOAD TO GET SUGGESTIONS":<><div className="spin" />GENERATING</>}</div>
                : <div>
                    <div style={{fontFamily:"var(--mono)",fontSize:10,color:"var(--text-faint)",marginBottom:18,letterSpacing:".07em"}}>
                      {ats.suggestions.length} PRIORITISED RECOMMENDATIONS
                    </div>
                    {ats.suggestions.map((s,i)=>(
                      <div key={i} className="sug-item">
                        <div className="sug-num">{String(i+1).padStart(2,"0")}</div>
                        <div className="sug-txt">{s}</div>
                      </div>
                    ))}
                  </div>
            )}
          </div>
        </section>
      </div>
    </div>
  </>;
}
