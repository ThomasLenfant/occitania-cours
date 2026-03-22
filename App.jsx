import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const MIN_WORDS = 15;

const callClaude = async (prompt, max_tokens = 2000) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const d = await res.json();
  return d.content?.map(i => i.text || "").join("") || "";
};

const parseBlock = (text, startKey, endKey) => {
  const start = text.search(new RegExp(startKey, "i"));
  if (start === -1) return "";
  const afterColon = text.indexOf(":", start) + 1;
  const end = endKey ? text.search(new RegExp(endKey, "i")) : text.length;
  return text.slice(afterColon, end === -1 ? text.length : end).trim();
};

const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
};

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

const TABS = [
  { id: "transcription", label: "Transcription" },
  { id: "resume", label: "Résumé" },
  { id: "points", label: "Points clés" },
  { id: "qa", label: "Q / R" },
  { id: "fiches", label: "Fiches" },
];

const S = {
  app: { minHeight: "100vh", background: "#0f1117", color: "#e2e8f0", fontFamily: "system-ui,sans-serif", fontSize: 14 },
  sidebar: { width: 220, minWidth: 220, background: "#161b27", borderRight: "1px solid #2d3448", display: "flex", flexDirection: "column" },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  header: { background: "#161b27", borderBottom: "1px solid #2d3448", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  btn: { background: "transparent", border: "1px solid #3d4460", color: "#a0aec0", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 },
  btnPrimary: { background: "#5b6af0", border: "1px solid #5b6af0", color: "#fff", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500 },
  btnRec: { background: "#e53e3e22", border: "1px solid #e53e3e88", color: "#fc8181", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 13 },
  btnStop: { background: "#38a16922", border: "1px solid #38a16988", color: "#68d391", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 13 },
  input: { background: "#1e2536", border: "1px solid #3d4460", color: "#e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 14, width: "100%", boxSizing: "border-box", outline: "none" },
  card: { background: "#1a2035", border: "1px solid #2d3448", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 },
  tab: { padding: "8px 16px", cursor: "pointer", fontSize: 13, borderBottom: "2px solid transparent", color: "#718096", whiteSpace: "nowrap" },
  tabActive: { padding: "8px 16px", cursor: "pointer", fontSize: 13, borderBottom: "2px solid #5b6af0", color: "#e2e8f0", fontWeight: 500, whiteSpace: "nowrap" },
  badge: { fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#5b6af022", color: "#818cf8", border: "1px solid #5b6af044" },
  corrBox: { display: "flex", gap: 10, background: "#1a2035", border: "1px solid #f6ad5544", borderRadius: 10, padding: "0.75rem", marginBottom: 8 },
  corrL: { flex: 1, background: "#2d1f1f", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: 13, color: "#fc8181" },
  corrR: { flex: 1, background: "#1a2d1f", borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: 13, color: "#68d391" },
  sideItem: (active) => ({ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 8px", borderRadius: 8, cursor: "pointer", background: active ? "#252d42" : "transparent", color: active ? "#e2e8f0" : "#a0aec0", marginBottom: 2 }),
  textarea: { background: "#1a2035", border: "1px solid #2d3448", borderRadius: 10, padding: "1rem 1.25rem", minHeight: 320, fontSize: 13, color: "#c7d2e0", whiteSpace: "pre-wrap", lineHeight: 1.8, overflowY: "auto", maxHeight: 520 },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [folders, setFolders] = useState([]);
  const [notions, setNotions] = useState([]);
  const [view, setView] = useState("home");
  const [selFolder, setSelFolder] = useState(null);
  const [selCours, setSelCours] = useState(null);
  const [coursList, setCoursList] = useState([]);
  const [activeTab, setActiveTab] = useState("transcription");
  const [newFolder, setNewFolder] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [matiere, setMatiere] = useState("");
  const [recording, setRecording] = useState(false);
  const [rawTranscript, setRawTranscript] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [corrections, setCorrections] = useState([]);
  const [notes, setNotes] = useState({ transcription: "", resume: "", points: "", qa: "", fiches: "" });

  const recRef = useRef(null);
  const activeRef = useRef(false);
  const bufRef = useRef("");
  const timerRef = useRef(null);
  const rawRef = useRef("");
  const userRef = useRef(null);

  useEffect(() => { rawRef.current = rawTranscript; }, [rawTranscript]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) { loadFolders(); loadNotions(); }
  }, [user]);

  const loadFolders = async () => {
    const { data } = await supabase.from("folders").select("*").order("created_at");
    setFolders(data || []);
  };

  const loadNotions = async () => {
    const { data } = await supabase.from("notions").select("*").order("nom");
    setNotions(data || []);
  };

  const loadCours = async (folderId) => {
    const { data } = await supabase.from("cours").select("*").eq("folder_id", folderId).order("created_at", { ascending: false });
    setCoursList(data || []);
  };

  const signIn = async () => {
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  const signUp = async () => {
    setAuthLoading(true); setAuthError("");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthError(error.message);
    else setAuthError("Vérifiez votre email pour confirmer votre compte !");
    setAuthLoading(false);
  };

  const signOut = async () => { await supabase.auth.signOut(); setView("home"); setFolders([]); setNotions([]); };

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    await supabase.from("folders").insert({ name: newFolder.trim(), user_id: user.id });
    setNewFolder(""); setShowNewFolder(false); loadFolders();
  };

  const deleteFolder = async (id) => {
    await supabase.from("folders").delete().eq("id", id);
    loadFolders();
    if (selFolder?.id === id) { setSelFolder(null); setView("home"); }
  };

  const startRec = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus("Utilisez Safari (iOS) ou Chrome (PC/Android)"); return; }
    setRawTranscript(""); bufRef.current = "";
    setNotes({ transcription: "", resume: "", points: "", qa: "", fiches: "" });
    setCorrections([]);

    const launch = () => {
      if (!activeRef.current) return;
      const r = new SR();
      r.lang = "fr-FR"; r.continuous = !isIOS(); r.interimResults = false;
      r.onresult = (e) => {
        let f = "";
        for (let i = e.resultIndex; i < e.results.length; i++)
          if (e.results[i].isFinal) f += e.results[i][0].transcript + " ";
        if (f) { setRawTranscript(p => p + f); bufRef.current += f; }
      };
      r.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Micro: " + e.error); };
      r.onend = () => { if (activeRef.current) setTimeout(launch, 300); };
      r.start(); recRef.current = r;
    };

    activeRef.current = true; launch();
    setRecording(true); setStatus("Enregistrement actif...");
    timerRef.current = setInterval(() => {
      const buf = bufRef.current;
      if (buf.trim().split(" ").length >= MIN_WORDS) {
        bufRef.current = ""; analyzeNotes(rawRef.current, false);
      }
    }, 60000);
  };

  const stopRec = async () => {
    activeRef.current = false; recRef.current?.stop();
    clearInterval(timerRef.current); setRecording(false);
    bufRef.current = "";
    await analyzeNotes(rawRef.current, true);
  };

  const analyzeNotes = async (text, withCorrections) => {
    if (!text || text.trim().split(" ").length < MIN_WORDS) { setStatus("Pas assez de contenu."); return; }
    setLoading(true);

    const notesPrompt = `Tu es un assistant de prise de notes pour un cours de "${matiere}". Voici la transcription brute :\n\n${text}\n\nRéponds UNIQUEMENT avec ce format exact :\n\n##TRANSCRIPTION_NETTOYEE##\n[transcription épurée sans bavardages]\n\n##RESUME##\n[résumé structuré détaillé]\n\n##POINTS_CLES##\n[points clés et définitions]\n\n##QA##\n[questions/réponses]\n\n##FICHES##\n[fiches de révision]\n\n##NOTIONS##\n[JSON uniquement: [{"notion":"nom","contenu":"description"}] ou []]`;

    setLoadingStep("Génération des notes...");
    let out = "";
    try { out = await callClaude(notesPrompt, 2000); } catch { setLoading(false); setStatus("Erreur réseau"); return; }

    const parsed = {
      transcription: parseBlock(out, "##TRANSCRIPTION_NETTOYEE##", "##RESUME##"),
      resume: parseBlock(out, "##RESUME##", "##POINTS_CLES##"),
      points: parseBlock(out, "##POINTS_CLES##", "##QA##"),
      qa: parseBlock(out, "##QA##", "##FICHES##"),
      fiches: parseBlock(out, "##FICHES##", "##NOTIONS##"),
    };
    setNotes(parsed);

    const notionsRaw = parseBlock(out, "##NOTIONS##", null);
    const notionsList = parseJSON(notionsRaw);
    if (notionsList.length > 0 && userRef.current) {
      for (const { notion, contenu } of notionsList) {
        if (!notion) continue;
        const key = notion.toLowerCase().trim();
        const { data: existing } = await supabase.from("notions").select("*").eq("user_id", userRef.current.id).eq("key", key).single();
        if (existing) {
          await supabase.from("notions").update({
            contenu: existing.contenu + "\n\n[" + matiere + "] " + contenu,
            matieres: existing.matieres.includes(matiere) ? existing.matieres : [...existing.matieres, matiere],
          }).eq("id", existing.id);
        } else {
          await supabase.from("notions").insert({ user_id: userRef.current.id, key, nom: notion, contenu, matieres: [matiere] });
        }
      }
      loadNotions();
    }

    if (withCorrections && parsed.transcription) {
      setLoadingStep("Analyse des corrections...");
      const corrPrompt = `Voici la transcription d'un cours de "${matiere}" :\n\n${parsed.transcription}\n\nIdentifie les erreurs factuelles ou de terminologie. Réponds UNIQUEMENT avec un tableau JSON :\n[{"original":"...","corrige":"...","raison":"..."}]\nSi aucune erreur : []`;
      try { const co = await callClaude(corrPrompt, 800); setCorrections(parseJSON(co)); } catch {}
    }

    setLoading(false); setLoadingStep("");
    setStatus(withCorrections ? "Analyse complète ✓" : "Notes mises à jour ✓");
    if (withCorrections) setView("review");
  };

  const saveCours = async () => {
    if (!selFolder || !user) return;
    await supabase.from("cours").insert({
      folder_id: selFolder.id, user_id: user.id,
      matiere, date: new Date().toLocaleDateString("fr-FR"),
      raw_transcript: rawTranscript, notes, corrections,
    });
    loadCours(selFolder.id);
    setView("folder"); setRawTranscript("");
    setNotes({ transcription: "", resume: "", points: "", qa: "", fiches: "" });
    setCorrections([]);
  };

  const exportTxt = (content, name) => {
    const b = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b);
    a.download = name + ".txt"; a.click();
  };

  const exportAll = (n) => {
    const all = TABS.map(t => `=== ${t.label.toUpperCase()} ===\n\n${n[t.id] || ""}`).join("\n\n\n");
    exportTxt(all, `${matiere}_${new Date().toLocaleDateString("fr-FR")}`);
  };

  // AUTH SCREEN
  if (!user) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ background: "#161b27", border: "1px solid #2d3448", borderRadius: 16, padding: "2rem", width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#e2e8f0" }}>OccitanIA Cours</div>
          <div style={{ fontSize: 12, color: "#5b6af0", marginTop: 4 }}>Modèle développé par Thomas Lenfant</div>
        </div>
        <div style={{ display: "flex", marginBottom: 20, background: "#1a2035", borderRadius: 8, padding: 4 }}>
          {["login", "signup"].map(m => (
            <div key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, textAlign: "center", padding: "6px", borderRadius: 6, cursor: "pointer", background: authMode === m ? "#5b6af0" : "transparent", color: authMode === m ? "#fff" : "#718096", fontSize: 13 }}>
              {m === "login" ? "Connexion" : "Inscription"}
            </div>
          ))}
        </div>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={{ ...S.input, marginBottom: 10 }} />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" type="password" style={{ ...S.input, marginBottom: 16 }} onKeyDown={e => e.key === "Enter" && (authMode === "login" ? signIn() : signUp())} />
        {authError && <div style={{ fontSize: 12, color: authError.includes("Vérifiez") ? "#68d391" : "#fc8181", marginBottom: 12 }}>{authError}</div>}
        <button onClick={authMode === "login" ? signIn : signUp} disabled={authLoading} style={{ ...S.btnPrimary, width: "100%", padding: "10px" }}>
          {authLoading ? "..." : authMode === "login" ? "Se connecter" : "Créer un compte"}
        </button>
      </div>
    </div>
  );

  const CorrectionBlock = ({ corrs }) => corrs?.length > 0 ? (
    <div style={{ ...S.card, borderColor: "#f6ad5544", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: "#f6ad55", marginBottom: 10 }}>⚠ {corrs.length} correction{corrs.length > 1 ? "s" : ""} proposée{corrs.length > 1 ? "s" : ""}</div>
      {corrs.map((c, i) => (
        <div key={i} style={S.corrBox}>
          <div style={S.corrL}><div style={{ fontSize: 11, color: "#fc818166", marginBottom: 4 }}>Version prof</div>{c.original}</div>
          <div style={S.corrR}><div style={{ fontSize: 11, color: "#68d39166", marginBottom: 4 }}>Correction IA</div>{c.corrige}<div style={{ fontSize: 11, color: "#68d39166", marginTop: 4 }}>{c.raison}</div></div>
        </div>
      ))}
    </div>
  ) : null;

  const TabBar = () => (
    <div style={{ display: "flex", borderBottom: "1px solid #2d3448", overflowX: "auto" }}>
      {TABS.map(t => <div key={t.id} onClick={() => setActiveTab(t.id)} style={activeTab === t.id ? S.tabActive : S.tab}>{t.label}</div>)}
    </div>
  );

  const Sidebar = () => (
    <div style={S.sidebar}>
      <div style={{ padding: "1.25rem 1rem 0.75rem", borderBottom: "1px solid #2d3448" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0" }}>OccitanIA Cours</div>
        <div style={{ fontSize: 11, color: "#5b6af0", marginTop: 2 }}>par Thomas Lenfant</div>
      </div>
      <div style={{ padding: "0.75rem 0.5rem", flex: 1, overflowY: "auto" }}>
        <div onClick={() => setView("home")} style={S.sideItem(view === "home")}>🏠 Accueil</div>
        <div style={{ fontSize: 11, color: "#4a5568", padding: "8px 8px 4px", letterSpacing: "0.05em" }}>MATIÈRES</div>
        {folders.map(f => (
          <div key={f.id} style={S.sideItem(selFolder?.id === f.id && view === "folder")}>
            <span onClick={() => { setSelFolder(f); loadCours(f.id); setView("folder"); }} style={{ flex: 1 }}>📁 {f.name}</span>
            <span onClick={e => { e.stopPropagation(); deleteFolder(f.id); }} style={{ color: "#4a5568", padding: "0 4px", fontSize: 12 }}>✕</span>
          </div>
        ))}
        {showNewFolder ? (
          <div style={{ padding: "4px 8px" }}>
            <input value={newFolder} onChange={e => setNewFolder(e.target.value)} onKeyDown={e => e.key === "Enter" && createFolder()} placeholder="Nom de la matière..." style={{ ...S.input, fontSize: 13, padding: "6px 10px" }} autoFocus />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={createFolder} style={{ ...S.btn, flex: 1, fontSize: 12 }}>Créer</button>
              <button onClick={() => setShowNewFolder(false)} style={{ ...S.btn, fontSize: 12 }}>✕</button>
            </div>
          </div>
        ) : (
          <div onClick={() => setShowNewFolder(true)} style={{ padding: "7px 8px", color: "#5b6af0", cursor: "pointer", fontSize: 13, borderRadius: 8 }}>+ Nouvelle matière</div>
        )}
        <div style={{ marginTop: 12, borderTop: "1px solid #2d3448", paddingTop: 8 }}>
          <div onClick={() => setView("notions")} style={S.sideItem(view === "notions")}>
            🧠 Notions <span style={{ ...S.badge, marginLeft: 4 }}>{notions.length}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid #2d3448" }}>
        <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
        <button onClick={signOut} style={{ ...S.btn, width: "100%", fontSize: 12 }}>Déconnexion</button>
      </div>
    </div>
  );

  const views = {
    home: () => (
      <div style={{ padding: "2rem 1.5rem", maxWidth: 500 }}>
        <h2 style={{ fontSize: 22, fontWeight: 600, color: "#e2e8f0", margin: "0 0 6px" }}>Bienvenue</h2>
        <p style={{ color: "#718096", marginBottom: 24, lineHeight: 1.6 }}>Créez un dossier matière dans la sidebar, puis démarrez un enregistrement.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["📁", "Matières", folders.length], ["🧠", "Notions", notions.length]].map(([icon, label, val]) => (
            <div key={label} style={S.card}>
              <div style={{ fontSize: 22 }}>{icon}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "#e2e8f0", marginTop: 4 }}>{val}</div>
              <div style={{ fontSize: 12, color: "#718096" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    folder: () => {
      const linked = notions.filter(n => n.matieres?.includes(selFolder?.name));
      return (
        <div style={{ padding: "1.5rem", maxWidth: 700 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "#e2e8f0" }}>📁 {selFolder?.name}</h2>
            <button onClick={() => { setMatiere(selFolder.name); setView("record"); }} style={S.btnPrimary}>+ Nouveau cours</button>
          </div>
          {coursList.length === 0 ? <p style={{ color: "#4a5568" }}>Aucun cours enregistré.</p> : coursList.map(c => (
            <div key={c.id} onClick={() => { setSelCours(c); setActiveTab("transcription"); setView("cours"); }} style={{ ...S.card, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontWeight: 500, color: "#e2e8f0" }}>{c.matiere}</div><div style={{ fontSize: 12, color: "#718096", marginTop: 2 }}>{c.date}</div></div>
              <span style={{ color: "#4a5568" }}>›</span>
            </div>
          ))}
          {linked.length > 0 && <>
            <div style={{ fontSize: 13, color: "#718096", margin: "20px 0 10px" }}>Notions liées</div>
            {linked.map(n => (
              <div key={n.id} style={{ ...S.card, borderColor: "#5b6af044" }}>
                <div style={{ fontWeight: 500, color: "#818cf8", marginBottom: 4 }}>{n.nom}</div>
                <div style={{ fontSize: 13, color: "#a0aec0" }}>{n.contenu.slice(0, 200)}{n.contenu.length > 200 ? "..." : ""}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>{n.matieres?.map(m => <span key={m} style={S.badge}>{m}</span>)}</div>
              </div>
            ))}
          </>}
        </div>
      );
    },
    record: () => (
      <div style={{ padding: "1.5rem", maxWidth: 700 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>{matiere}</h2>
          {!recording ? <button onClick={startRec} style={S.btnRec}>● Démarrer</button> : <button onClick={stopRec} style={S.btnStop}>■ Terminer</button>}
        </div>
        {recording && <div style={{ fontSize: 13, color: "#f6ad55", marginBottom: 10 }}>⏺ Actif — notes toutes les minutes · corrections à la fin</div>}
        {loading && <div style={{ fontSize: 13, color: "#818cf8", marginBottom: 8 }}>⏳ {loadingStep || status}</div>}
        <div style={{ ...S.textarea, minHeight: 160, maxHeight: 260, marginBottom: 10 }}>
          {rawTranscript || <span style={{ color: "#4a5568" }}>La transcription brute apparaîtra ici...</span>}
        </div>
        {notes.transcription && <>
          <div style={{ fontSize: 12, color: "#4a5568", marginBottom: 6 }}>Aperçu nettoyé</div>
          <div style={{ ...S.textarea, minHeight: 80, maxHeight: 160, fontSize: 12, color: "#a0aec0" }}>{notes.transcription}</div>
        </>}
      </div>
    ),
    review: () => {
      const content = notes[activeTab] || "";
      return (
        <div style={{ padding: "1.5rem", maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>{matiere} — Révision</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => navigator.clipboard.writeText(content)} style={S.btn}>Copier</button>
              <button onClick={() => exportAll(notes)} style={S.btn}>Exporter .txt</button>
              <button onClick={saveCours} style={S.btnPrimary}>Sauvegarder</button>
            </div>
          </div>
          <CorrectionBlock corrs={corrections} />
          <TabBar />
          <div style={{ ...S.textarea, marginTop: 12 }}>{content || <span style={{ color: "#4a5568" }}>Aucun contenu.</span>}</div>
        </div>
      );
    },
    cours: () => {
      if (!selCours) return null;
      const content = selCours.notes?.[activeTab] || "";
      return (
        <div style={{ padding: "1.5rem", maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <button onClick={() => setView("folder")} style={{ ...S.btn, fontSize: 12 }}>← Retour</button>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#e2e8f0" }}>{selCours.matiere} — {selCours.date}</h2>
            <button onClick={() => exportAll(selCours.notes)} style={S.btn}>Exporter .txt</button>
          </div>
          <CorrectionBlock corrs={selCours.corrections} />
          <TabBar />
          <div style={{ ...S.textarea, marginTop: 12 }}>{content || <span style={{ color: "#4a5568" }}>Aucun contenu.</span>}</div>
        </div>
      );
    },
    notions: () => (
      <div style={{ padding: "1.5rem", maxWidth: 700 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, color: "#e2e8f0", marginBottom: 20 }}>🧠 Notions transversales</h2>
        {notions.length === 0
          ? <p style={{ color: "#4a5568" }}>Aucune notion enregistrée. Elles apparaîtront automatiquement au fil des cours.</p>
          : notions.map(n => (
            <div key={n.id} style={{ ...S.card, borderColor: "#5b6af044" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontWeight: 500, color: "#818cf8", fontSize: 15 }}>{n.nom}</div>
                <div style={{ display: "flex", gap: 4 }}>{n.matieres?.map(m => <span key={m} style={S.badge}>{m}</span>)}</div>
              </div>
              <div style={{ fontSize: 13, color: "#a0aec0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{n.contenu}</div>
            </div>
          ))}
      </div>
    ),
  };

  return (
    <div style={{ ...S.app, display: "flex" }}>
      <Sidebar />
      <div style={S.main}>
        <div style={S.header}>
          <span style={{ fontSize: 13, color: "#4a5568" }}>
            {view === "home" && "Accueil"}
            {view === "folder" && `📁 ${selFolder?.name}`}
            {view === "record" && `⏺ ${matiere}`}
            {view === "review" && "Révision"}
            {view === "cours" && selCours?.matiere}
            {view === "notions" && "Notions transversales"}
          </span>
          {loading && <span style={{ fontSize: 12, color: "#818cf8" }}>⏳ {loadingStep}</span>}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>{views[view]?.()}</div>
      </div>
    </div>
  );
}