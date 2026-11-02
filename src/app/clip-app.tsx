'use client';
import {useEffect,useRef,useState} from 'react';
import {canUpdateClip,clipStage,type Clip,type ClipPerson} from '../lib/clip-core';
import './clips.css';
type Person={id:string;name:string};
type Draft={due_date?:string;id?:string;revision?:number;title:string;notes:string;participants:ClipPerson[];progress:number};
async function api(body?:unknown){const r=await fetch('/api/clips',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await r.json() as {clips:Clip[];people:Person[];directory:Person[];error?:string};if(!r.ok)throw Error(data.error||'Could not load clips.');return data}
function ClipCard({clip,people,editable,admin,busy,onProgress,onEdit,onArchive}:{clip:Clip;people:Person[];editable:boolean;admin:boolean;busy:boolean;onProgress:(progress:number)=>void;onEdit:()=>void;onArchive:()=>void}){
 const [value,setValue]=useState(clip.progress);useEffect(()=>setValue(clip.progress),[clip.progress,clip.revision]);const stage=clipStage(clip.progress),preview=clipStage(value);
 return <article className={'clip-card '+stage.className}>
  <header><span className="clip-stage">{stage.label}</span><strong className="clip-percent">{clip.progress}%</strong></header>
  <h2>{clip.title}</h2>{clip.due_date&&<p className="clip-muted">Deadline: {clip.due_date}</p>}{clip.notes&&<p className="clip-notes">{clip.notes}</p>}
  <div className="clip-meter" role="progressbar" aria-label={clip.title+' progress'} aria-valuenow={clip.progress} aria-valuemin={0} aria-valuemax={100}><span style={{width:clip.progress+'%'}} /></div>
  <ul className="clip-crew" aria-label="Assigned crew">{clip.participants.map(p=><li key={p.id} className={p.editing?'editing':''}><span>{people.find(person=>person.id===p.id)?.name||'Crew member'}</span>{p.editing&&<b>Editing</b>}</li>)}</ul>
  {!clip.participants.length&&<p className="clip-muted">No crew assigned yet.</p>}
  {editable&&!clip.archived?<div className="clip-controls"><label>Progress for {clip.title}<input type="range" min="0" max="100" step="1" value={value} onChange={e=>setValue(Number(e.target.value))} disabled={busy} /></label>
    <div className="clip-progress-value"><input aria-label={'Progress percentage for '+clip.title} type="number" min="0" max="100" step="1" value={value} disabled={busy} onChange={e=>setValue(Math.min(100,Math.max(0,Number(e.target.value))))} /><span>% · {preview.label}</span><button className="primary" disabled={busy||value===clip.progress} onClick={()=>onProgress(value)}>Save progress</button></div>
    <div className="clip-milestones">{[[0,'Not started'],[50,'Filmed'],[100,'Finished']].map(([n,label])=><button key={n} disabled={busy||clip.progress===n} onClick={()=>onProgress(Number(n))}>{label} · {n}%</button>)}</div>
  </div>:!clip.archived&&<p className="clip-muted">Assigned crew can update this clip.</p>}
  <footer><span>Updated {new Date(clip.updated_at).toLocaleDateString('en-CA',{timeZone:'America/Vancouver'})}</span>{admin&&<div>{!clip.archived&&<button disabled={busy} onClick={onEdit}>Edit clip & crew</button>}<button disabled={busy} onClick={onArchive}>{clip.archived?'Restore':'Archive'}</button></div>}</footer>
 </article>
}
export default function ClipApp({userId,displayName,admin}:{userId:string;displayName:string;admin:boolean}){
 const [clips,setClips]=useState<Clip[]>([]),[people,setPeople]=useState<Person[]>([]),[directory,setDirectory]=useState<Person[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('active'),[draft,setDraft]=useState<Draft|null>(null),[crewSearch,setCrewSearch]=useState('');
 const dialog=useRef<HTMLDialogElement>(null);
 async function load(){try{const d=await api();setClips(d.clips);setPeople(d.people);setDirectory(d.directory)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(draft){setCrewSearch('');dialog.current?.showModal()}else dialog.current?.close()},[draft?.id,draft===null]);
 async function mutate(body:unknown){setBusy(true);setError('');setNotice('');try{await api(body);await load();setNotice('Clip saved.');return true}catch(e){setError((e as Error).message);return false}finally{setBusy(false)}}
 const shown=clips.filter(c=>(filter==='archived'?!!c.archived:!c.archived)&&(filter!=='mine'||c.participants.some(p=>p.id===userId))&&(c.title+' '+c.notes+' '+c.participants.map(p=>people.find(person=>person.id===p.id)?.name||'').join(' ')).toLowerCase().includes(search.toLowerCase()));
 const active=clips.filter(c=>!c.archived),formPeople=directory.concat(people.filter(p=>!directory.some(d=>d.id===p.id)&&draft?.participants.some(d=>d.id===p.id)));
 return <div className="member-shell clip-shell"><header className="clip-header"><a className="clip-brand" href="/members"><img src="/gwgtv-logo.png" width="42" height="42" alt="GWG TV"/><span>GWG TV <small>MEMBER SPACE</small></span></a><nav aria-label="Member tools"><a href="/members">Member Space home</a><a href="/members/gear">Gear & bookings</a><a href="/members/plans">Shoot plans</a><a href="/members/clips" aria-current="page">Clip Progress</a></nav><span>{displayName}{admin?' · Admin':''}</span></header>
  <main className="clip-main"><div className="clip-intro"><div><span className="member-eyebrow">CLIP PROGRESS TRACKER</span><h1>From first idea to final cut.</h1><p>Your crew, editing assignments, and production progress in one place.</p></div>{admin&&<button className="primary" onClick={()=>{setError('');setDraft({title:'',notes:'',participants:[],progress:0})}}>+ Create clip</button>}</div>
  <div className="clip-summary"><span><b>{active.length}</b> Active clips</span><span><b>{active.filter(c=>c.progress>=50&&c.progress<100).length}</b> Filmed</span><span><b>{active.filter(c=>c.progress===100).length}</b> Finished</span></div>
  <div className="clip-toolbar"><label>Search clips or crew<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Clip title or a person's name" /></label><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">All active clips</option><option value="mine">My clips</option><option value="archived">Archived clips</option></select></label><button className="secondary" disabled={busy} onClick={load}>Refresh</button></div>
  {error&&<p className="member-error" role="alert">{error}</p>}{notice&&<p className="clip-success" role="status">{notice}</p>}
  <p className="clip-legend"><span>0–49% · In production</span><span>50–99% · Filmed</span><span>100% · Finished</span></p>
  {loading?<p role="status">Loading clips…</p>:!shown.length?<div className="clip-empty"><h2>{active.length?'No matching clips':'The next story starts here.'}</h2><p>{admin?'Create a clip and choose its crew. Mark the people handling the edit.':'An administrator can create a clip and assign you to its crew.'}</p></div>:<div className="clip-grid">{shown.map(clip=><ClipCard key={clip.id} clip={clip} people={people} admin={admin} busy={busy} editable={canUpdateClip(clip,userId,admin)} onEdit={()=>{setError('');setDraft({...clip})}} onProgress={progress=>mutate({action:'progress',id:clip.id,revision:clip.revision,progress})} onArchive={()=>mutate({action:clip.archived?'restore':'archive',id:clip.id,revision:clip.revision})}/>)}</div>}
  </main>
  <dialog ref={dialog} className="clip-dialog" onCancel={e=>{e.preventDefault();if(!busy)setDraft(null)}} onClose={()=>{if(!busy)setDraft(null)}} aria-labelledby="clip-form-title">{draft&&<form onSubmit={async e=>{e.preventDefault();if(await mutate({...draft,action:draft.id?'edit':'create'}))setDraft(null)}}><header><h2 id="clip-form-title">{draft.id?'Edit clip & crew':'Create clip'}</h2><button type="button" aria-label="Close clip form" disabled={busy} onClick={()=>setDraft(null)}>×</button></header>
   <label>Clip title<input required autoFocus maxLength={140} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
   <label>Notes<textarea maxLength={3000} rows={3} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
   <label>Deadline (optional)<input type="date" value={draft.due_date||''} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label>
   <label>Progress (%)<input required type="number" min="0" max="100" step="1" value={draft.progress} onChange={e=>setDraft({...draft,progress:Number(e.target.value)})}/></label>
   <fieldset><legend>Crew & editors</legend><p>Choose people working on this clip, then mark who is editing.</p><input aria-label="Find crew member" placeholder="Search member names" value={crewSearch} onChange={e=>setCrewSearch(e.target.value)}/>
    <div className="clip-person-list">{formPeople.filter(p=>p.name.toLowerCase().includes(crewSearch.toLowerCase())).map(p=>{const picked=draft.participants.find(a=>a.id===p.id);return <div key={p.id} className="clip-person"><label><input type="checkbox" checked={!!picked} onChange={e=>setDraft({...draft,participants:e.target.checked?[...draft.participants,{id:p.id,editing:false}]:draft.participants.filter(a=>a.id!==p.id)})}/>{p.name}</label><label><input type="checkbox" aria-label={'Editing: '+p.name} disabled={!picked} checked={!!picked?.editing} onChange={e=>setDraft({...draft,participants:draft.participants.map(a=>a.id===p.id?{...a,editing:e.target.checked}:a)})}/>Editing</label></div>})}{!formPeople.length&&<p>No approved members yet.</p>}</div>
   </fieldset>{error&&<p className="member-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Saving…':'Save clip'}</button>
  </form>}</dialog>
 </div>
}
