import React, { useEffect, useMemo, useState } from "react";
import "./index.css";

const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000";

function App() {
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [controller, setController] = useState(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) || null,
    [items, selectedId]
  );

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/files`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to load files");
      setItems(json.items || []);
      if (!selectedId && json.items && json.items.length > 0) {
        setSelectedId(json.items[0].id);
      }
    } catch (err) {
      setError(err.message || "Failed to load files");
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Connected Mine Resource Page</p>
          <h1>Transcribe & Summarize</h1>
          <p className="sub">
            Upload the MP3, get a full summary of the meeting.
          </p>
        </div>
      </header>

      <main className="layout">
        <section className="card">
          <h2>Upload</h2>
          <input
            type="file"
            multiple
            accept="audio/*,video/*"
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

        <section className="card list-card">
          <div className="list-header">
            <h2>Saved Transcripts</h2>
            <button className="ghost" onClick={fetchItems} disabled={loading}>
              Refresh
            </button>
          </div>
          <div className="list">
            {items.length === 0 && <div className="muted">No transcripts yet.</div>}
            {items.map((item) => (
              <button
                key={item.id}
                className={`list-item ${item.id === selectedId ? "active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="title">{item.filename}</div>
                <div className="meta">
                  <span className="badge">{item.category}</span>
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedItem && (
          <section className="card detail">
            <div className="detail-head">
              <div>
                <p className="eyebrow">{selectedItem.category}</p>
                <h2>{selectedItem.filename}</h2>
              </div>
            </div>
            <div className="section">
              <h3>Summary</h3>
              <pre className="text-block">{selectedItem.summary}</pre>
            </div>
            <div className="section">
              <h3>Transcription</h3>
              <pre className="text-block">{selectedItem.transcription}</pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
