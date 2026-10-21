"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase";

const roles: Record<string,string> = { operator:"Operator",admin:"Administrator",teacher:"Teacher",student:"Student",system_moderator:"System Moderator",data_content_manager:"Data & Content Manager",tester:"Tester",support_manager:"Support Manager" };

export default function ProfilePage() {
  const router=useRouter();
  const [busy,setBusy]=useState(true);
  const [email,setEmail]=useState("");
  const [avatarUrl,setAvatarUrl]=useState("");
  const [name,setName]=useState("");
  const [createdAt,setCreatedAt]=useState("");
  const [assigned,setAssigned]=useState<string[]>([]);
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setBusy(true);setNotice("");
    try{
      const db=createClient();
      const {data:{user},error}=await db.auth.getUser();
      if(error||!user){router.replace("/");return;}
      setEmail(user.email??"");
      setName(String(user.user_metadata?.full_name??user.user_metadata?.display_name??""));
      const avatarPath=String(user.user_metadata?.avatar_path??"");
      if(avatarPath){const {data}=await db.storage.from("kvsync-avatars").createSignedUrl(avatarPath,3600);if(data?.signedUrl)setAvatarUrl(data.signedUrl);}
      setCreatedAt(user.created_at??"");
      const {data,error:roleError}=await db.from("user_roles").select("role").eq("user_id",user.id);
      if(roleError) throw roleError;
      setAssigned((data??[]).map((r:{role:string})=>roles[r.role]??r.role));
    }catch(e){setNotice(e instanceof Error?e.message:"Could not load profile.");}
    finally{setBusy(false);}
  },[router]);
  useEffect(()=>{void load();},[load]);
  return <main style={{minHeight:"100vh",background:"#08090c",color:"#f4f0e6",padding:"28px 18px 56px"}}><section style={{maxWidth:900,margin:"0 auto"}}><header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:26}}><a href="/dashboard" aria-label="KVSync Pro dashboard" style={{display:"inline-flex",alignItems:"center",gap:10,color:"#f0d9a0",textDecoration:"none",fontWeight:800}}><img src="https://raw.githubusercontent.com/astryxleo/KVSyncPro/main/download.png" alt="" width="34" height="34" style={{objectFit:"contain",borderRadius:8}}/>KVSync <span style={{color:"#d3a64f"}}>Pro</span></a><button type="button" onClick={()=>router.push("/dashboard")} style={btn}><ArrowLeft size={15}/> Overview</button></header><div style={eyebrow}>ACCOUNT · IDENTITY</div><h1 style={{fontSize:"clamp(28px,5vw,42px)",margin:"8px 0"}}>My profile</h1><p style={{color:"#a6a5ab",marginTop:0}}>Your signed-in account and assigned school roles.</p><section style={panel}><div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22}}><div style={{width:64,height:64,borderRadius:"50%",overflow:"hidden",display:"grid",placeItems:"center",background:"#282116",color:"#f0d9a0",flexShrink:0,border:"1px solid #5d4a2c"}}>{avatarUrl?<img src={avatarUrl} alt="Profile photo" width={64} height={64} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<UserRound size={25}/>}</div><div><h2 style={{margin:"0 0 4px",fontSize:21}}>{name||"School account"}</h2><p style={{margin:0,color:"#a6a5ab"}}>{email||"Loading account…"}</p></div></div>{busy?<p>Loading account details…</p>:<><div style={grid}><Info label="Display name" value={name||"Not set"}/><Info label="Login ID" value={email||"Not available"}/><Info label="Account created" value={createdAt?new Date(createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"Not available"}/><div><div style={label}>Assigned roles</div><div style={{display:"flex",flexWrap:"wrap",gap:7,marginTop:8}}>{assigned.length?assigned.map(r=><span key={r} style={chip}>{r}</span>):<span style={{color:"#a6a5ab"}}>No roles found</span>}</div></div></div><div style={{borderTop:"1px solid #302d28",paddingTop:16,marginTop:22,display:"flex",gap:10,alignItems:"center",color:"#cfc3a4"}}><ShieldCheck size={18}/> Permissions are controlled by your assigned role and database policies.</div></>}{notice&&<p role="status" style={{color:"#f0b7a9"}}>{notice}</p>}<button type="button" onClick={()=>void load()} disabled={busy} style={{...btn,marginTop:18}}><RefreshCw size={14}/>{busy?"Loading…":"Refresh profile"}</button><button type="button" onClick={()=>router.push("/dashboard/settings")} style={{...btn,marginLeft:8}}>Profile & security settings →</button></section></section></main>;
}
function Info({label,value}:{label:string;value:string}){return <div><div style={labelStyle}>{label}</div><div style={{marginTop:7,overflowWrap:"anywhere"}}>{value}</div></div>}
const panel:React.CSSProperties={background:"linear-gradient(145deg,#181817,#101115)",border:"1px solid #393124",borderRadius:18,padding:22};
const btn:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:8,padding:"10px 13px",borderRadius:10,border:"1px solid #5d4a2c",background:"#201b13",color:"#f0d9a0",cursor:"pointer"};
const eyebrow:React.CSSProperties={color:"#cba75b",fontSize:11,letterSpacing:".16em",fontWeight:800};
const grid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:22};
const labelStyle:React.CSSProperties={fontSize:12,color:"#a6a5ab",textTransform:"uppercase",letterSpacing:".08em"};
const label=labelStyle;
const chip:React.CSSProperties={padding:"6px 9px",borderRadius:999,background:"#292216",border:"1px solid #514126",color:"#f0d9a0",fontSize:12};
