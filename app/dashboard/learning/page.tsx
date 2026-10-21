"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, RefreshCw, ShieldCheck, Plus, Pencil, X, Download, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { compressImageForUpload } from "@/lib/image-compression";

type Homework = { id: string; class_id: string; title: string; subject: string; description: string | null; deadline: string | null; created_at: string; posted_by?: string };
type Material = { id: string; title: string; subject: string; file_url: string; file_type: string | null };
type SchoolClass = { id: string; grade: number; section: string };

const inputStyle = { width: "100%", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--border, #353535)", background: "var(--surface, #111)", color: "inherit", font: "inherit" };

export default function LearningPage() {
  const router = useRouter();
  const [homework, setHomework] = useState<Homework[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [uploadableClassIds, setUploadableClassIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [materialEditorOpen, setMaterialEditorOpen] = useState(false);
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialSubject, setMaterialSubject] = useState("");
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [searchText, setSearchText] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setMessage("");
    try {
      const db = createClient();
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) { router.replace("/"); return; }
      setUserId(auth.user.id);
      const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", auth.user.id);
      if (roleError) throw new Error("Role verification failed. Learning content is hidden.");
      const assigned = (roles ?? []).map((r: {role:string}) => r.role);
      const allowed = ["operator","admin","teacher","student","data_content_manager"].find((r) => assigned.includes(r));
      if (!allowed) throw new Error("Your assigned role does not include learning-hub access.");
      setRole(allowed);
      let studentClassId = "";
      if (allowed === "student") {
        const { data: student, error } = await db.from("students").select("class_id").eq("user_id", auth.user.id).maybeSingle();
        if (error) throw new Error("Could not verify your class assignment.");
        if (!student?.class_id) { setMessage("Your student profile or class is not linked yet. Ask the operator to complete account provisioning."); return; }
        studentClassId = student.class_id;
      }
      let homeworkQuery = db.from("homework").select("id,class_id,title,subject,description,deadline,created_at,posted_by").order("created_at",{ascending:false}).limit(100);
      let materialQuery = db.from("study_materials").select("id,title,subject,file_url,file_type").order("created_at",{ascending:false}).limit(100);
      if (studentClassId) {
        homeworkQuery = homeworkQuery.eq("class_id", studentClassId);
        materialQuery = materialQuery.eq("class_id", studentClassId);
      }
      const [hw, mats] = await Promise.all([homeworkQuery, materialQuery]);
      if (hw.error) throw new Error("Homework could not be loaded. Check the assigned database permissions.");
      if (mats.error) throw new Error("Study materials could not be loaded. Check the assigned database permissions.");
      setHomework((hw.data ?? []) as Homework[]);
      setMaterials((mats.data ?? []) as Material[]);
      if (["operator","admin","teacher"].includes(allowed)) {
        let classRows: SchoolClass[] = [];
        if (allowed === "teacher") {
          const [wholeClass, subjectClass] = await Promise.all([
            db.from("class_teachers").select("class_id").eq("teacher_id", auth.user.id),
            db.from("class_subject_teachers").select("class_id").eq("teacher_id", auth.user.id),
          ]);
          if (wholeClass.error || subjectClass.error) throw new Error("Could not verify teaching assignments.");
          const wholeClassIds = [...new Set((wholeClass.data ?? []).map((r: {class_id:string}) => r.class_id))];
          setUploadableClassIds(wholeClassIds);
          const ids = [...new Set([...wholeClassIds, ...(subjectClass.data ?? []).map((r: {class_id:string}) => r.class_id)])];
          if (ids.length) {
            const { data, error } = await db.from("classes").select("id,grade,section").in("id", ids).order("grade").order("section");
            if (error) throw new Error("Assigned classes could not be loaded.");
            classRows = (data ?? []) as SchoolClass[];
          }
        } else {
          const { data, error } = await db.from("classes").select("id,grade,section").order("grade").order("section").limit(200);
          if (error) throw new Error("Classes could not be loaded for content management.");
          classRows = (data ?? []) as SchoolClass[];
          setUploadableClassIds(classRows.map(c => c.id));
        }
        setClasses(classRows);
        if (classRows.length) setClassId(current => current || classRows[0].id);
      }
      if (!(hw.data ?? []).length && !(mats.data ?? []).length) setMessage("No homework or study materials are available yet.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to load learning content."); }
    finally { setBusy(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const search = searchText.trim().toLowerCase();
  const filteredHomework = homework.filter((item) => `${item.title} ${item.subject} ${item.description ?? ""}`.toLowerCase().includes(search));
  const filteredMaterials = materials.filter((item) => `${item.title} ${item.subject} ${item.file_type ?? ""}`.toLowerCase().includes(search));

  const startEdit = (item: Homework) => {
    setEditingId(item.id); setClassId(item.class_id); setSubject(item.subject); setTitle(item.title);
    setDescription(item.description ?? ""); setDeadline(item.deadline ? item.deadline.slice(0,10) : "");
    setEditorOpen(true); setMessage("");
  };
  const startNew = () => {
    setEditingId(""); setSubject(""); setTitle(""); setDescription(""); setDeadline("");
    if (classes.length) setClassId(classes[0].id);
    setEditorOpen(true); setMessage("");
  };
  const saveHomework = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classId || !title.trim() || !subject.trim()) { setMessage("Choose a class and enter both title and subject."); return; }
    setSaving(true); setMessage("");
    try {
      const db = createClient();
      const payload = { class_id: classId, title: title.trim(), subject: subject.trim(), description: description.trim() || null, deadline: deadline || null, ...(editingId ? {} : { posted_by: userId }) };
      const result = editingId
        ? await db.from("homework").update(payload).eq("id", editingId).select("id").maybeSingle()
        : await db.from("homework").insert(payload).select("id").maybeSingle();
      if (result.error) throw new Error(result.error.message.includes("row-level security") ? "Database permissions blocked this change. Check your class assignment." : "Homework could not be saved: " + result.error.message);
      if (!result.data) throw new Error("No row was changed. Your role may not have permission for this item.");
      setEditorOpen(false); setEditingId(""); setMessage("Homework saved successfully.");
      await load();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to save homework."); }
    finally { setSaving(false); }
  };

  const canCreateHomework = ["operator","admin","teacher"].includes(role) && classes.length > 0;
  const canUploadMaterial = ["operator","admin","teacher"].includes(role) && uploadableClassIds.length > 0;
  const uploadMaterial = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!classId || !materialTitle.trim() || !materialSubject.trim() || !materialFile) {
      setMessage("Choose a class and file, and enter the material title and subject.");
      return;
    }
    const allowedTypes = new Set([
      "application/pdf", "image/jpeg", "image/png", "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    if (!allowedTypes.has(materialFile.type)) {
      setMessage("Unsupported file type. Upload PDF, JPG, PNG, WEBP, DOCX, PPTX or XLSX.");
      return;
    }
    if (materialFile.size > 25 * 1024 * 1024) {
      setMessage("File is too large. Maximum size is 25 MB.");
      return;
    }
    setSaving(true);
    setMessage("");
    const db = createClient();
    let uploadedPath = "";
    try {
      const { data: auth, error: authError } = await db.auth.getUser();
      if (authError || !auth.user) throw new Error("Your session expired. Sign in again.");
      const uploadFile = materialFile.type.startsWith("image/")
        ? await compressImageForUpload(materialFile, { maxDimension: 2560, quality: 0.92 })
        : materialFile;
      const safeName = uploadFile.name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-120) || "resource";
      uploadedPath = classId + "/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await db.storage.from("kvsync-study-materials").upload(uploadedPath, uploadFile, {
        contentType: uploadFile.type,
        cacheControl: "60",
        upsert: false,
      });
      if (uploadError) throw new Error("File upload failed: " + uploadError.message);
      const { error: rowError } = await db.from("study_materials").insert({
        class_id: classId,
        title: materialTitle.trim(),
        subject: materialSubject.trim(),
        file_url: uploadedPath,
        file_type: uploadFile.type,
        uploaded_by: auth.user.id,
      });
      if (rowError) {
        await db.storage.from("kvsync-study-materials").remove([uploadedPath]);
        uploadedPath = "";
        throw new Error("File metadata could not be saved: " + rowError.message);
      }
      setMaterialEditorOpen(false);
      setMaterialTitle("");
      setMaterialSubject("");
      setMaterialFile(null);
      setMessage("Study material uploaded successfully.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to upload study material.");
    } finally {
      setSaving(false);
    }
  };
  const [openingFile, setOpeningFile] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const openMaterial = async (item: Material) => {
    setOpeningFile(item.id); setMessage("");
    try {
      const db = createClient();
      if (/^https?:\/\//i.test(item.file_url) || item.file_url.startsWith("/") || item.file_url.includes("..")) {
        throw new Error("This resource has an invalid storage path. Ask staff to re-upload it securely.");
      }
      const { data, error } = await db.storage.from("kvsync-study-materials").createSignedUrl(item.file_url, 60);
      if (error || !data?.signedUrl) throw new Error("Secure download could not be created. Check class access and the stored file path.");
      setDownloadUrl(data.signedUrl);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Unable to open resource."); }
    finally { setOpeningFile(""); }
  };
  const canEditHomework = (item: Homework) => ["operator","admin"].includes(role) || (role === "teacher" && item.posted_by === userId);

  return <main className="learning-page">
    <header><a className="learning-brand" href="/dashboard">KVSync <em>Pro</em></a><button type="button" onClick={() => router.push("/dashboard")}><ArrowLeft size={15}/> Overview</button></header>
    <section>
      <div className="learning-eyebrow">PM SHRI KENDRIYA VIDYALAYA · JANAKPURI</div>
      <div className="learning-title-row"><div><h1>Learning hub</h1><p>Homework and study resources available to your signed-in role.</p></div><button type="button" className="learning-refresh" onClick={() => void load()} disabled={busy}><RefreshCw size={14}/> Refresh</button></div>
      <div className="learning-verified"><ShieldCheck size={18}/><span><b>Role-checked content</b><small>{role ? role.replaceAll("_"," ") : "Checking role"} · Database row policies remain active</small></span></div>
      {(canCreateHomework || canUploadMaterial) && <div style={{display:"flex",justifyContent:"flex-end",gap:10,flexWrap:"wrap",margin:"16px 0"}}>
        {canCreateHomework && <button type="button" className="learning-refresh" onClick={startNew}><Plus size={15}/> Add homework</button>}
        {canUploadMaterial && <button type="button" className="learning-refresh" onClick={() => { setMaterialEditorOpen(true); setMessage(""); }}><Upload size={15}/> Upload study material</button>}
      </div>}
      {editorOpen && <form onSubmit={saveHomework} className="learning-panel" style={{display:"grid",gap:12,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>{editingId ? "Edit homework" : "Create homework"}</h2><button type="button" onClick={() => setEditorOpen(false)} aria-label="Close editor"><X size={18}/></button></div>
        <label>Class<select required value={classId} onChange={e => setClassId(e.target.value)} style={inputStyle}><option value="">Choose class</option>{classes.map(c => <option key={c.id} value={c.id}>Class {c.grade}-{c.section}</option>)}</select></label>
        <label>Subject<input required maxLength={80} value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} placeholder="e.g. Mathematics"/></label>
        <label>Homework title<input required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Enter a clear title"/></label>
        <label>Description<textarea maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} style={{...inputStyle,minHeight:100,resize:"vertical"}} placeholder="Instructions or details (optional)"/></label>
        <label>Deadline<input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inputStyle}/></label>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="submit" disabled={saving || !classes.length}>{saving ? "Saving…" : editingId ? "Save changes" : "Publish homework"}</button><button type="button" onClick={() => setEditorOpen(false)}>Cancel</button></div>
      </form>}
      {materialEditorOpen && <form onSubmit={uploadMaterial} className="learning-panel" style={{display:"grid",gap:12,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Upload study material</h2><button type="button" onClick={() => setMaterialEditorOpen(false)} aria-label="Close upload form"><X size={18}/></button></div>
        <label>Class<select required value={uploadableClassIds.includes(classId) ? classId : ""} onChange={e => setClassId(e.target.value)} style={inputStyle}><option value="">Choose class</option>{classes.filter(c => uploadableClassIds.includes(c.id)).map(c => <option key={c.id} value={c.id}>Class {c.grade}-{c.section}</option>)}</select></label>
        <label>Subject<input required maxLength={80} value={materialSubject} onChange={e => setMaterialSubject(e.target.value)} style={inputStyle} placeholder="e.g. Science"/></label>
        <label>Resource title<input required maxLength={160} value={materialTitle} onChange={e => setMaterialTitle(e.target.value)} style={inputStyle} placeholder="e.g. Chapter 4 notes"/></label>
        <label>File (PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX; max 25 MB)<input required type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.pptx,.xlsx" onChange={e => setMaterialFile(e.target.files?.[0] ?? null)} style={inputStyle}/></label>
        <small style={{color:"var(--muted,#a6a5ab)"}}>Images are resized to max 2560 px and converted to high-quality WebP before upload. PDF and Office documents are kept unchanged to preserve original content and formatting.</small>
        {materialFile && <small>{materialFile.name} · {(materialFile.size / (1024 * 1024)).toFixed(2)} MB{materialFile.type.startsWith("image/") ? " · Will be compressed to WebP" : " · Original file preserved"}</small>}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="submit" disabled={saving || !classes.length}>{saving ? "Uploading…" : "Upload resource"}</button><button type="button" onClick={() => setMaterialEditorOpen(false)}>Cancel</button></div>
      </form>}
      {downloadUrl && <div className="learning-inline-message">Your secure link is ready. <a href={downloadUrl} target="_blank" rel="noreferrer">Open resource ↗</a><button type="button" onClick={() => setDownloadUrl("")}>Dismiss</button></div>}
      <label style={{display:"block",marginBottom:14}}>Search homework and resources<input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Search title, subject, or description…" style={{...inputStyle,marginTop:7}} aria-label="Search learning resources"/></label>
      {busy ? <div className="learning-message">Loading learning resources securely…</div> : message && !homework.length && !materials.length ? <div className="learning-message" role="status" aria-live="polite">{message}</div> : <>
        <div className="learning-grid">
          <article className="learning-panel"><div className="learning-panel-head"><span><BookOpen size={18}/></span><div><h2>Homework</h2><p>{filteredHomework.length} item(s) match</p></div></div>
            {filteredHomework.length ? filteredHomework.map(item => <div className="learning-item" key={item.id}><div><span className="learning-subject">{item.subject || "General"}</span><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div><div style={{display:"grid",justifyItems:"end",gap:8}}><small>{item.deadline ? "Due "+new Date(item.deadline).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "No deadline listed"}</small>{canEditHomework(item) && <button type="button" onClick={() => startEdit(item)} aria-label={"Edit "+item.title}><Pencil size={14}/> Edit</button>}</div></div>) : <p className="learning-empty">{searchText ? "No homework matches your search." : "No homework items are visible to this account."}</p>}
          </article>
          <article className="learning-panel"><div className="learning-panel-head"><span><FileText size={18}/></span><div><h2>Study materials</h2><p>{filteredMaterials.length} resource(s) match</p></div></div>
            {filteredMaterials.length ? filteredMaterials.map(item => <div className="learning-item material" key={item.id}><div><span className="learning-subject">{item.subject || "General"}{item.file_type ? " · "+item.file_type : ""}</span><h3>{item.title}</h3></div><button type="button" onClick={() => void openMaterial(item)} disabled={openingFile === item.id}><Download size={14}/>{openingFile === item.id ? "Preparing…" : "Open securely"}</button></div>) : <p className="learning-empty">{searchText ? "No study materials match your search." : "No study materials are visible to this account."}</p>}
          </article>
        </div>
        {message && <div className="learning-inline-message" role="status" aria-live="polite">{message}</div>}
      </>}
      <p className="learning-caveat">Homework and study-material publishing are available to authorized staff. Study files stay in private storage and are opened through short-lived signed links. Upload permissions are limited to classes the account can manage directly.</p>
    </section>
  </main>;
}
