import React, { useEffect, useMemo, useState } from "react";
import "./index.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000";
const MimeAccept = "audio/*,video/*";

function App() {
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [sortKey, setSortKey] = useState("date_desc"); // date_desc | date_asc | title | filename | category
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [controller, setController] = useState(null);
  const [activeTab, setActiveTab] = useState("transcribe"); // transcribe | saved
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return localStorage.getItem("theme") || "light";
  });

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "date_asc":
          return new Date(a.uploaded_at) - new Date(b.uploaded_at);
        case "title":
          return (a.title || a.filename).localeCompare(b.title || b.filename);
        case "filename":
          return a.filename.localeCompare(b.filename);
        case "category":
          return a.category.localeCompare(b.category);
        case "date_desc":
        default:
          return new Date(b.uploaded_at) - new Date(a.uploaded_at);
      }
    });
    return copy;
  }, [items, sortKey]);

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/files`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to load files");
      const list = json.items || [];
      setItems(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load files");
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", theme);
    }
  }, [theme]);

  const summaryLines = (text) =>
    (text || "")
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[-*\u2022]\s*/, ""))
      .filter(Boolean);

  const handleUpload = async () => {
    if (!files.length) return alert("Choose at least one file");
    if (loading) return;

    setLoading(true);
    setError("");

    const formData = new FormData();
    for (let f of files) {
      formData.append("files", f);
    }

    const ctrl = new AbortController();
    setController(ctrl);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
        signal: ctrl.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Upload failed");
      const newItems = json.items || [];
      setItems((prev) => [...newItems, ...prev]);
      if (newItems[0]) setSelectedId(newItems[0].id);
    } catch (err) {
      if (err.name === "AbortError") {
        setError("Upload cancelled");
      } else {
        setError(err.message || "Upload failed");
      }
    } finally {
      setLoading(false);
      setController(null);
    }
  };

  const handleCancel = () => {
    if (controller) {
      controller.abort();
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/files/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.detail || "Delete failed");
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (selectedId === id) {
        setSelectedId(items.find((i) => i.id !== id)?.id || null);
      }
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const tabs = [
    { id: "transcribe", label: "Transcribe" },
    { id: "saved", label: "Saved" },
  ];

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Connected Mine Resource Page</p>
          <h1>Summarise Our Meetings</h1>
          <p className="sub">
            Upload the MP3, get a full summary of the meeting. Go to the saved tab to access all automatically saved transcripts.
          </p>
        </div>
      </header>

      <div className="topbar">
        <div className="tab-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-pill ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className="theme-toggle" onClick={toggleTheme}>
          <span className="icon" aria-hidden>
            {theme === "light" ? "\u2600" : "\u{1F319}"}
          </span>
          <span className="toggle-label">
            {theme === "light" ? "Light mode" : "Dark mode"}
          </span>
        </button>
      </div>

      {activeTab === "transcribe" && (
        <main className="layout">
          <section className="card">
            <h2>Upload</h2>
            <input
              type="file"
              multiple
              accept={MimeAccept}
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <button onClick={handleUpload} disabled={loading}>
              {loading ? "Uploading..." : "Upload & Transcribe"}
            </button>
            {loading && (
              <button className="ghost danger" onClick={handleCancel}>
                Cancel Upload
              </button>
            )}
            {error && <div className="error">{error}</div>}
          </section>

          {selectedItem && (
            <section className="card detail">
              <div className="detail-head">
                <div>
                  <p className="eyebrow">
                    {selectedItem.category} - {new Date(selectedItem.uploaded_at).toLocaleString()}
                  </p>
                  <h2>{selectedItem.title || selectedItem.filename}</h2>
                </div>
              </div>
              <div className="section">
                <h3>Summary</h3>
                <ul className="summary-list">
                  {summaryLines(selectedItem.summary).map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="section">
                <h3>Transcription</h3>
                <pre className="text-block">{selectedItem.transcription}</pre>
              </div>
            </section>
          )}
        </main>
      )}

      {activeTab === "saved" && (
        <main className="layout saved-layout">
          <section className="card list-card">
            <div className="list-header">
              <h2>Saved Transcripts</h2>
              <button className="ghost" onClick={fetchItems} disabled={loading}>
                Refresh
              </button>
              <select
                className="ghost select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                disabled={loading}
              >
                <option value="date_desc">Newest</option>
                <option value="date_asc">Oldest</option>
                <option value="title">Title A-Z</option>
                <option value="filename">File name A-Z</option>
                <option value="category">Category A-Z</option>
              </select>
            </div>
            <div className="list">
              {items.length === 0 && <div className="muted">No transcripts yet.</div>}
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className={`list-item-row ${item.id === selectedId ? "active" : ""}`}
                >
                  <button
                    className="list-item"
                    onClick={() => setSelectedId(item.id)}
                  >
                    <div className="title">{item.filename}</div>
                    <div className="meta">
                      <span className="badge">{item.category}</span>
                    </div>
                  </button>
                  <button className="ghost danger small" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>

          {selectedItem && (
            <section className="card detail">
              <div className="detail-head">
                <div>
                  <p className="eyebrow">
                    {selectedItem.category} - {new Date(selectedItem.uploaded_at).toLocaleString()}
                  </p>
                  <h2>{selectedItem.title || selectedItem.filename}</h2>
                </div>
                <button className="ghost danger small" onClick={() => handleDelete(selectedItem.id)}>
                  Delete
                </button>
              </div>
              <div className="section">
                <h3>Summary</h3>
                <ul className="summary-list">
                  {summaryLines(selectedItem.summary).map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="section">
                <h3>Transcription</h3>
                <pre className="text-block">{selectedItem.transcription}</pre>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
