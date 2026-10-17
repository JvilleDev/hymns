import Database from "bun:sqlite";
import os from "os";
import express, { Response } from "express";
import { v4 as uuid } from "uuid";
import http from "http";
import { WebSocketServer } from "ws";
// @ts-ignore
import colorprint from "colorprint";
import cors from "cors";
import Fuse from "fuse.js";
import multer from "multer";
import path from "path";
const db = new Database("./src/data/database.db");
db.run("PRAGMA journal_mode=WAL;");
db.run("PRAGMA synchronous=NORMAL;");

const MERGE_THRESHOLD = Number(process.env.MERGE_THRESHOLD ?? 0.2);
const BREAK_THRESHOLD = Number(process.env.BREAK_THRESHOLD ?? 0.55);
const DEBUG = !!process.env.DEBUG;
const TRANSCRIBE_PIN = process.env.TRANSCRIBE_PIN || "";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// ponytail: se regenera en cada arranque; si cambia en el cliente, el backend se reinició y hay que recargar
const serverInstanceId = uuid();

function getColombianDate() {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota'
  });
  const parts = formatter.formatToParts(d);
  const weekday = parts.find(p => p.type === 'weekday')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  
  return `${weekday}, ${day} de ${month} de ${year}`.replace(/^\w/, (c) => c.toUpperCase());
}

// Explicitly handle WebSocket upgrades for /ws path
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const isWsPath = url.pathname === "/ws";

  if (isWsPath) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

const PORT = 3100;

app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

import fs from "fs";

const uploadDir = path.join(process.cwd(), "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuid()}${ext}`);
  },
});
const upload = multer({ storage });
// -- Auth Middleware --
const authAdmin = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const masterPassword = process.env.ADMIN_PASSWORD || "Jville24861937";
  if (authHeader === masterPassword) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
};

let fuse: Fuse<Canto>;

wss.on("connection", async (ws, request) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const clientId = url.searchParams.get("clientId") || "default";
  const connectionId = uuid();
  // @ts-ignore
  ws.clientId = clientId;
  // @ts-ignore
  ws.connectionId = connectionId;
  // @ts-ignore
  ws.isAlive = true;

  ws.on("pong", () => {
    // @ts-ignore
    ws.isAlive = true;
  });

  colorprint.NOTICE(`[WS Connected] Client: ${clientId}, Conn: ${connectionId}`);

  // Send initial state immediately (FASE 2: perfil slim para gran-diamante)
  const state = await getClientState(clientId);
  const initialData = clientId === "gran-diamante"
    ? { session: state.session, announcement: state.announcement, transcription: state.transcription, lastAnnouncementUpdate: state.lastAnnouncementUpdate, connectionId, serverInstanceId }
    : { ...state, connectionId, serverInstanceId };
  ws.send(JSON.stringify({ type: "initial", data: initialData }));

  ws.on("close", () => {
    colorprint.DEBUG(`[WS Disconnected] Client: ${clientId}`);
  });

  // ponytail: eventos client→server via WS directo, sin HTTP POST round-trip
  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const { type, data, from, to } = msg;

      // Skip if targeted to someone else
      if (to && to !== connectionId) return;

      colorprint.DEBUG(`[WS Event] Client: ${clientId}, Type: ${type}, From: ${from}, To: ${to}`);
      await handleWSEvent(clientId, connectionId, type, data, from, to);
    } catch (e) {
      console.error("[WS Message Error]", e);
    }
  });

  ws.on("error", (err) => {
    console.error("[WS Error]", err);
  });
});

// WS Heartbeat interval
const wsInterval = setInterval(() => {
  wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

process.on("close", () => {
  clearInterval(wsInterval);
  clearInterval(inactivityInterval);
});

// Inactivity check (every minute)
const inactivityInterval = setInterval(async () => {
  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;

  for (const [clientId, state] of clientStates.entries()) {
    // FASE 1: cierre unificado por session.lastActivity (2h); sin session viva no hay limpieza
    if (!state.session.live || (now - state.session.lastActivity <= twoHours)) continue;
    let changed = true;

    // Check transcription inactivity
    if (state.transcription.final || state.transcription.interim || state.transcription.active) {
      state.transcription = { active: false, producing: false, final: "", interim: "" };
      state.lastTranscriptionUpdate = now;
      broadcast(clientId, { type: "transcriptionState", data: state.transcription });
      broadcast(clientId, { type: "transcriptionUpdate", data: { final: "", interim: "" } });
      changed = true;
      colorprint.NOTICE(`[Cleanup] Cleared transcription for ${clientId} due to inactivity`);
    }

    // Check announcement inactivity
    {
      const defaultTopic = getColombianDate();
      if (state.announcement.text || state.announcement.active || state.announcement.topic !== defaultTopic) {
        state.announcement = {
          text: "",
          active: false,
          topic: defaultTopic,
        };
        state.lastAnnouncementUpdate = now;
        
        // Delete all announcements from DB for this client
        try {
          db.query("DELETE FROM anuncios WHERE clientId = ?").run(clientId);
        } catch (e) {
          console.error(`Error clearing announcements for ${clientId}:`, e);
        }

        broadcast(clientId, {
          type: "announcement",
          data: state.announcement,
          lastAnnouncementUpdate: state.lastAnnouncementUpdate,
        });
        broadcast(clientId, { type: "historyRefresh", data: true }); // Signal frontend to refresh history
        changed = true;
        colorprint.NOTICE(`[Cleanup] Cleared announcements for ${clientId} due to inactivity`);
      }
    }

    // FASE 1: cierre de session + limpieza de transcript_lines (session_id = clientId)
    state.session.live = false;
    try {
      db.query("DELETE FROM transcript_lines WHERE session_id = ?").run(clientId);
    } catch (e) {
      console.error(`Error clearing transcript_lines for ${clientId}:`, e);
    }
    broadcast(clientId, { type: "sessionState", data: state.session });
    colorprint.NOTICE(`[Cleanup] Closed session for ${clientId} due to inactivity`);

    if (changed) {
      saveClientState(clientId, state);
    }
  }
}, 60000);

// Transcription Ownership timeout check (every 5 seconds)
setInterval(async () => {
  const now = Date.now();
  const tenSeconds = 10 * 1000;

  for (const [clientId, state] of clientStates.entries()) {
    if (state.transcription.producing && state.lastTranscriptionUpdate && (now - state.lastTranscriptionUpdate > tenSeconds)) {
      state.transcription.producing = false;
      state.lastTranscriptionUpdate = now;
      
      broadcast(clientId, { 
        type: "transcriptionState", 
        data: state.transcription 
      });
      
      saveClientState(clientId, state);
      colorprint.NOTICE(`[Timeout] Revoked transcription ownership for ${clientId} due to 10s silence`);
    }
  }
}, 5000);

function broadcast(clientId: string, data: any) {
  // FASE 2: gran-diamante no recibe eventos de letras
  if (clientId === "gran-diamante" && (data?.type === "line" || data?.type === "activeSong" || data?.type === "index" || data?.type === "viewerActive")) return;
  const wsMsg = JSON.stringify(data);
  wss.clients.forEach((ws: any) => {
    if (ws.readyState === 1 && ws.clientId === clientId) {
      ws.send(wsMsg);
    }
  });
}

// FASE 1: session como fuente de verdad (helpers mínimos)
function touchSession(state: InitialInfo) {
  state.session.lastActivity = Date.now();
}
function openSession(clientId: string, state: InitialInfo) {
  const now = Date.now();
  state.session.lastActivity = now;
  if (!state.session.live) {
    state.session.live = true;
    state.session.openedAt = now;
    broadcast(clientId, { type: "sessionState", data: state.session });
  }
}
async function touchSessionById(clientId: string) {
  try {
    const st = await getClientState(clientId);
    touchSession(st);
    saveClientState(clientId, st);
  } catch {}
}

// SSE removed in favor of WebSockets

// -- Event Handler (shared by WS messages and HTTP POST fallback) --

async function handleWSEvent(clientId: string, connectionId: string, type: string, data: any, from: string, to?: string) {
  const state = await getClientState(clientId);

  switch (type) {
    case "newLine":
      state.activeLine = data;
      broadcast(clientId, { type: "line", data, from, to });
      break;

    case "changeCanto":
      state.activeCantoId = data;
      state.activeIndex = 0;
      try {
        const rawSongs = await getCantos(data);
        const rawSong = rawSongs[0];
        if (rawSong) {
          const parsed = parseSong(rawSong);
          state.activeSong = parsed;
          broadcast(clientId, { type: "activeSong", data: parsed, from, to });
          if (parsed.lines.length > 0) {
            state.activeLine = parsed.lines[0];
            broadcast(clientId, { type: "line", data: state.activeLine, from, to });
            broadcast(clientId, { type: "index", data: 0, from, to });
          }
        }
      } catch (e) {
        console.error("Error parsing song:", e);
        state.activeSong = null;
      }
      break;

    case "changeIndex":
      state.activeIndex = data;
      if (
        state.activeSong &&
        state.activeSong.lines[data] !== undefined
      ) {
        state.activeLine = state.activeSong.lines[data];
        broadcast(clientId, { type: "line", data: state.activeLine, from, to });
      }
      broadcast(clientId, { type: "index", data, from, to });
      break;

    case "view":
      state.viewerActive = data;
      broadcast(clientId, { type: "viewerActive", data, from, to });
      break;
    case "setAnnouncement":
      state.announcement = {
        ...state.announcement,
        text: data.text,
        active: data.active,
        topic: data.topic ?? state.announcement.topic ?? getColombianDate(),
      };
      state.lastAnnouncementUpdate = Date.now();
      // FASE 1: abre solo con active=true y texto no vacío; si no, mantiene
      if (data.active && String(data.text ?? "").trim()) openSession(clientId, state);
      else touchSession(state);
      broadcast(clientId, {
        type: "announcement",
        data: state.announcement,
        lastAnnouncementUpdate: state.lastAnnouncementUpdate,
        from,
        to,
      });
      broadcast(clientId, { type: "historyRefresh", data: true });
      if (data.active && state.transcription.active) {
        state.transcription.active = false;
        broadcast(clientId, {
          type: "transcriptionState",
          data: state.transcription,
          from, to
        });
      }
      break;

    case "setTranscriptionActive":
      state.transcription.active = data;
      state.lastTranscriptionUpdate = Date.now();
      if (data) {
        state.announcement.active = false;
        state.viewerActive = false;
        broadcast(clientId, {
          type: "announcement",
          data: state.announcement,
          lastAnnouncementUpdate: state.lastAnnouncementUpdate,
          from,
          to,
        });
        broadcast(clientId, { type: "viewerActive", data: false, from, to });
      }
      broadcast(clientId, {
        type: "transcriptionState",
        data: state.transcription,
        from, to
      });
      break;

    case "setTranscriptionProducing":
      state.transcription.producing = !!data;
      state.lastTranscriptionUpdate = Date.now();
      if (data) touchSession(state); // FASE 1: heartbeat/productor mantiene (sin broadcast de session)
      broadcast(clientId, {
        type: "transcriptionState",
        data: state.transcription,
        from, to
      });
      break;

    case "transcriptionUpdate":
      state.transcription.final = data.final;
      state.transcription.interim = data.interim;
      state.lastTranscriptionUpdate = Date.now();
      // FASE 1: red de seguridad — abre si hay texto; si no, mantiene
      if (String(data?.final ?? "").trim() || String(data?.interim ?? "").trim()) openSession(clientId, state);
      else touchSession(state);
      broadcast(clientId, { type: "transcriptionUpdate", data, from, to });
      break;

    default:
      // Forward any other events (like WebRTC signaling)
      broadcast(clientId, { type, data, from, to });
      break;
  }

  // ponytail: interim (~10/s) no persiste; solo finales, con debounce 1500ms
  if (type !== "transcriptionUpdate" || !data?.interim) saveClientState(clientId, state);
}

// -- HTTP POST fallback (kept for backwards compat) --

app.post("/api/ws-events/:type", async (req, res) => {
  const { type } = req.params;
  const { data, from, to } = req.body;
  const clientId = (req.headers["x-client-id"] as string) || "default";
  const connectionId = from || "";

  await handleWSEvent(clientId, connectionId, type, data, from, to);
  res.json({ success: true });
});

// -- Standard API Routes --

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HIMNARIO - Backend</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            background: #0f172a;
            color: #f8fafc;
            font-family: 'Outfit', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
        }
        .card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 40px;
            text-align: center;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .status {
            color: #6366f1;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 8px;
        }
        h1 { margin: 0; font-size: 2rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="status">● En línea</div>
        <h1>Himnario Backend</h1>
        <p style="color: #94a3b8">v2.0 - Multi-Tenant</p>
    </div>
</body>
</html>
  `);
});

app.get("/api/cantos", async (req, res) => {
  res.send(await getCantos());
});

app.get("/api/canto/:id", async (req, res) => {
  const answer = await getCantos(req.params.id);
  res.send(answer[0]);
});

app.post("/import", authAdmin, async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      res.status(400).json({ error: "El cuerpo debe ser un array de cantos." });
      return;
    }
    const cantos: Canto[] = req.body;
    const insert = db.query(
      "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)",
    );
    db.transaction(() => {
      for (const canto of cantos) {
        if (!canto.id || !canto.title || !canto.content) {
          console.warn("Canto con datos faltantes omitido:", canto);
          continue;
        }
        insert.run(canto.id, canto.title, canto.type, canto.nh, canto.content);
      }
    })();
    await updateFuse();
    res
      .status(200)
      .json({
        message: "Cantos importados exitosamente",
        count: cantos.length,
      });
  } catch (error: any) {
    console.error("Error al importar cantos:", error);
    res
      .status(500)
      .json({ error: "Error al importar cantos", message: error.message });
  }
});

app.post("/api/canto", authAdmin, async (req, res) => {
  try {
    const { title, type, nh, content } = req.body;
    const id = uuid();
    const query = db.query(
      "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)",
    );
    query.run(id, title, type, nh, content);
    await updateFuse();
    res.send("OK!");
  } catch (error) {
    res.send(`ERROR: ${error}`);
  }
});

app.put("/api/canto", authAdmin, async (req, res) => {
  try {
    const { id, title, type, nh, content } = req.body;
    if (!id) {
      res
        .status(400)
        .send("ERROR: 'id' es requerido para actualizar el canto.");
      return;
    }
    const query = db.query(
      "UPDATE cantos SET title = ?, type = ?, nh = ?, content = ? WHERE id = ?",
    );
    const result = query.run(title, type, nh, content, id);
    if (result.changes === 0) {
      res
        .status(404)
        .send("ERROR: No se encontró ningún canto con el ID proporcionado.");
      return;
    }
    await updateFuse();
    res.send("Canto actualizado correctamente.");
  } catch (error: any) {
    res.status(500).send(`ERROR: ${error.message}`);
  }
});

app.delete("/api/cantos", authAdmin, async (req, res) => {
  try {
    const query = db.query("DELETE FROM cantos");
    query.run();
    await updateFuse();
    res.send("OK! All songs deleted.");
  } catch (error: any) {
    console.error("Error deleting all songs:", error);
    res.status(500).send(`ERROR: ${error.message}`);
  }
});

app.get("/debug/routes", (req, res) => {
  res.json({ status: "ok", version: "sse-v1" });
});

app.delete("/api/canto/:id", authAdmin, async (req, res) => {
  try {
    const query = db.query("DELETE FROM cantos WHERE id = ?");
    const result = query.run(req.params.id);
    if (result.changes === 0) {
      res.status(404).send("ERROR: No se encontró ningún canto para eliminar.");
      return;
    }
    await updateFuse();
    res.send("OK!");
  } catch (error) {
    res.send(`ERROR: ${error}`);
  }
});

app.get("/api/anuncios", (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const query = db.query(
      "SELECT * FROM anuncios WHERE clientId = ? ORDER BY createdAt DESC",
    );
    const results = query.all(clientId);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/anuncios", (req, res) => {
  try {
    const { text, topic } = req.body;
    const clientId = (req.headers["x-client-id"] as string) || "default";
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const id = uuid();
    const createdAt = Date.now();
    const insert = db.query(
      "INSERT INTO anuncios (id, text, topic, createdAt, clientId) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run(id, text, topic || null, createdAt, clientId);
    broadcast(clientId, { type: "historyRefresh", data: true });
    void touchSessionById(clientId); // FASE 1: mutación anuncios mantiene
    res.json({ id, text, topic: topic || null, createdAt, clientId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/anuncios/:id", (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const query = db.query("DELETE FROM anuncios WHERE id = ? AND clientId = ?");
    query.run(req.params.id, clientId);
    broadcast(clientId, { type: "historyRefresh", data: true });
    void touchSessionById(clientId); // FASE 1: mutación anuncios mantiene
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/anuncios", (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const query = db.query("DELETE FROM anuncios WHERE clientId = ?");
    query.run(clientId);
    broadcast(clientId, { type: "historyRefresh", data: true });
    void touchSessionById(clientId); // FASE 1: mutación anuncios mantiene
    res.json({ success: true, message: "All announcements deleted for this client" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/anuncios/delete-selected", (req, res) => {
  try {
    const { ids } = req.body;
    const clientId = (req.headers["x-client-id"] as string) || "default";
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: "IDs array is required" });
      return;
    }
    const query = db.query("DELETE FROM anuncios WHERE id = ? AND clientId = ?");
    db.transaction(() => {
      for (const id of ids) {
        query.run(id, clientId);
      }
    })();
    broadcast(clientId, { type: "historyRefresh", data: true });
    void touchSessionById(clientId); // FASE 1: mutación anuncios mantiene
    res.json({ success: true, count: ids.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/media", (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const query = db.query(
      "SELECT * FROM media WHERE clientId = ? ORDER BY createdAt DESC"
    );
    const results = query.all(clientId);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/media", upload.single("file"), (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const { name, type } = req.body;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "File is required" });
      return;
    }
    const id = uuid();
    const url = `/uploads/${file.filename}`;
    const createdAt = Date.now();
    
    const insert = db.query(
      "INSERT INTO media (id, type, name, url, createdAt, clientId) VALUES (?, ?, ?, ?, ?, ?)"
    );
    insert.run(id, type || "image", name || file.originalname, url, createdAt, clientId);
    
    res.json({ id, type: type || "image", name: name || file.originalname, url, createdAt, clientId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/media/:id", (req, res) => {
  try {
    const clientId = (req.headers["x-client-id"] as string) || "default";
    const query = db.query("DELETE FROM media WHERE id = ? AND clientId = ?");
    query.run(req.params.id, clientId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/search", async (req, res) => {
  try {
    if (!req.query.q) {
      res.status(400).json({ error: "Search query is required" });
      return;
    }
    const searchTerm = req.query.q as string;
    if (!fuse) await setupFuse();
    const results = fuse.search(searchTerm);
    res.json({
      query: searchTerm,
      count: results.length,
      results: results.map((result) => ({
        ...result.item,
        score: result.score,
      })),
    });
  } catch (error: any) {
    console.error("Search error:", error);
    res
      .status(500)
      .json({
        error: "An error occurred while searching",
        message: error.message,
      });
  }
});

app.post("/api/punctuate", async (req, res) => {
  if (DEBUG) console.log("=== TEST ===")
  if (DEBUG) console.log("PUNCTUATION REQUESTED")
  try {
    const { text } = req.body;
    if (DEBUG) console.log("TEXT:", text)
    if (!text) {
      res.json({ text: "" });
      return;
    }
    
    // Call the local Python microservice
    const rpunctUrl = process.env.RPUNCT_URL || "http://127.0.0.1:8000";
    const response = await fetch(`${rpunctUrl}/punctuate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000),
    });
    
    if (response.ok) {
      const data = await response.json();
      if (DEBUG) console.log("RPUNCT RES:", data)
      res.json(data);
    } else {
      if (DEBUG) console.warn("Python service returned error status", response.status);
      res.json({ text }); // Fallback
    }
  } catch (error) {
    console.error("Error connecting to rpunct service proxy:", error);
    res.json({ text: req.body.text || "" }); // Fallback
  }
});

app.post("/api/segment", async (req, res) => {
  const startTime = Date.now();
  try {
    const { sentences, documentId, gaps } = req.body;
    const gapList: Array<number | null> = Array.isArray(gaps) ? gaps : [];
    const clientId = (req.headers["x-client-id"] as string) || "default";

    if (!Array.isArray(sentences) || sentences.length === 0) {
      res.status(400).json({ error: "sentences must be a non-empty array" });
      return;
    }
    if (!documentId) {
      res.status(400).json({ error: "documentId is required" });
      return;
    }

    const rpunctUrl = process.env.RPUNCT_URL || "http://127.0.0.1:8000";

    // Step 1: Normalize joined text
    let normalizedSentences: string[] = sentences;
    try {
      const normalizeRes = await fetch(`${rpunctUrl}/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentences.join(" ") }),
        signal: AbortSignal.timeout(5000),
      });
      if (normalizeRes.ok) {
        const normalizeData: any = await normalizeRes.json();
        const normalizedText: string = normalizeData.text || sentences.join(" ");
        // Step 2: Split normalized text into sentences by punctuation
        normalizedSentences = normalizedText
          .split(/(?<=[.!?])\s+/)
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
      }
    } catch (e) {
      if (DEBUG) console.warn("Normalize step failed, using raw sentences:", e);
    }

    if (normalizedSentences.length === 0) {
      normalizedSentences = sentences;
    }

    // Step 3: Segment — iterate over pairs of adjacent windows
    // window_A = [s[i-1], s[i]], window_B = [s[i+1], s[i+2]]
    // A "break" happens AFTER sentence i (between i and i+1)
    interface SegmentDecision {
      afterIndex: number; // break after this sentence index
      decision: string;
      breakScore: number;
    }
    const decisions: SegmentDecision[] = [];
    // ponytail: liturgical break anchors force cut without service call
    const liturgicalRe = /pueden tomar asiento|abran sus biblias|amén|aleluya|gloria a dios|oremos/i;
    const pendingWindows: { afterIndex: number; window_a: string[]; window_b: string[]; gapMs: number | null }[] = [];

    for (let i = 0; i < normalizedSentences.length - 1; i++) {
      if (liturgicalRe.test(normalizedSentences[i + 1] ?? "")) {
        decisions.push({ afterIndex: i, decision: "BREAK", breakScore: 1 });
        continue;
      }
      // gaps[j] = silencio previo a la oración j (frontend: ts_actual - ts_anterior por final)
      const g = gapList[i + 1];
      pendingWindows.push({
        afterIndex: i,
        window_a: [normalizedSentences[i - 1] ?? "", normalizedSentences[i]].filter(Boolean),
        window_b: [normalizedSentences[i + 1], normalizedSentences[i + 2] ?? ""].filter(Boolean),
        gapMs: typeof g === "number" ? g : null,
      });
    }

    // Q5: batch en 1 roundtrip; fallback a loop secuencial si 404/503 o error
    const batchByIndex = new Map<number, SegmentDecision>();
    if (pendingWindows.length > 0) {
      try {
        const batchRes = await fetch(`${rpunctUrl}/segment_batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ windows: pendingWindows }),
          signal: AbortSignal.timeout(5000),
        });
        if (batchRes.ok) {
          const batchData: any = await batchRes.json();
          const arr: any[] = Array.isArray(batchData) ? batchData : (batchData.decisions ?? batchData.results ?? []);
          arr.forEach((entry: any, idx: number) => {
            const s = entry.break_score ?? entry.breakScore ?? 0;
            const afterIndex = entry.afterIndex ?? entry.after_index ?? pendingWindows[idx]?.afterIndex;
            if (afterIndex == null) return;
            batchByIndex.set(afterIndex, {
              afterIndex,
              decision: entry.decision ?? (s >= BREAK_THRESHOLD ? "BREAK" : "CONTINUE"),
              breakScore: s,
            });
          });
        } else if (DEBUG) {
          console.warn(`segment_batch returned ${batchRes.status}, falling back to sequential`);
        }
      } catch (e) {
        if (DEBUG) console.warn("segment_batch failed, falling back to sequential:", e);
      }
      for (const w of pendingWindows) {
        const hit = batchByIndex.get(w.afterIndex);
        if (hit) decisions.push(hit);
      }
    }

    // Fallback secuencial solo para ventanas sin resultado batch
    for (const w of pendingWindows.filter((p) => !batchByIndex.has(p.afterIndex))) {
      let decision = "CONTINUE";
      let breakScore = 0;
      try {
        const segRes = await fetch(`${rpunctUrl}/segment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ window_a: w.window_a, window_b: w.window_b, gapMs: w.gapMs }),
          signal: AbortSignal.timeout(5000),
        });
        if (segRes.ok) {
          const segData: any = await segRes.json();
          breakScore = segData.break_score ?? 0;
          decision = segData.decision ?? (breakScore >= BREAK_THRESHOLD ? "BREAK" : "CONTINUE");
        }
      } catch (e) {
        if (DEBUG) console.warn(`Segment call failed at index ${w.afterIndex}:`, e);
      }

      decisions.push({ afterIndex: w.afterIndex, decision, breakScore });
    }

    // Step 4: Build paragraphs from BREAK decisions
    // Brain #3/#7: sesgo por longitud acumulada + zona gris AMBIGUOUS
    // (<25 unir, >90 cortar; AMBIGUOUS→MERGE si <40 palabras, si no BREAK)
    interface ParagraphAccumulator {
      sentenceIndices: number[];
      breakScores: number[];
    }
    const wordsOf = (idxs: number[]) =>
      idxs.reduce((n, si) => n + normalizedSentences[si].split(/\s+/).filter(Boolean).length, 0);
    const paragraphAccumulators: ParagraphAccumulator[] = [];
    let current: ParagraphAccumulator = { sentenceIndices: [0], breakScores: [] };
    let currentWords = wordsOf(current.sentenceIndices);

    const decisionByIndex = new Map(decisions.map((d) => [d.afterIndex, d]));
    for (let i = 0; i < normalizedSentences.length - 1; i++) {
      const dec = decisionByIndex.get(i);
      let score = dec?.breakScore ?? 0;
      if (currentWords < 25) score -= 0.10;
      else if (currentWords > 90) score += 0.10;
      score = Math.min(1, Math.max(0, Math.round(score * 10000) / 10000));
      const raw = dec?.decision;
      const isBreak = raw === "BREAK" || (raw === "AMBIGUOUS" && currentWords >= 40);
      if (isBreak) {
        current.breakScores.push(score);
        paragraphAccumulators.push(current);
        current = { sentenceIndices: [i + 1], breakScores: [] };
        currentWords = wordsOf(current.sentenceIndices);
      } else {
        current.sentenceIndices.push(i + 1);
        if (dec) current.breakScores.push(score);
        currentWords = wordsOf(current.sentenceIndices);
      }
    }
    paragraphAccumulators.push(current);

    // Brain #3: corte duro >140 palabras en el gap interno de mayor score
    const hardSplit: ParagraphAccumulator[] = [];
    for (const acc of paragraphAccumulators) {
      const internal = acc.breakScores.slice(0, acc.sentenceIndices.length - 1);
      if (wordsOf(acc.sentenceIndices) > 140 && internal.length > 0) {
        let bi = 0;
        for (let k = 1; k < internal.length; k++) if (internal[k] > internal[bi]) bi = k;
        const left = acc.sentenceIndices.slice(0, bi + 1);
        const right = acc.sentenceIndices.slice(bi + 1);
        if (left.length > 0 && right.length > 0) {
          hardSplit.push(
            { sentenceIndices: left, breakScores: internal.slice(0, bi + 1) },
            { sentenceIndices: right, breakScores: [...internal.slice(bi + 1), ...acc.breakScores.slice(internal.length)] },
          );
          continue;
        }
      }
      hardSplit.push(acc);
    }

    // Step 5: Build, persist, and return paragraphs
    const createdAt = Date.now();
    const paragraphs = hardSplit.map((acc, paragraphIndex) => {
      const text = acc.sentenceIndices
        .map((si) => normalizedSentences[si])
        .join(" ");
      const words = text.split(" ").filter(Boolean);
      const tokenCount = Math.round(words.length * 1.3);
      const startSentenceId = String(acc.sentenceIndices[0]);
      const endSentenceId = String(acc.sentenceIndices[acc.sentenceIndices.length - 1]);

      // confidenceScore: promedio de aporte por transición; score<=MERGE es merge
      // seguro (aporta 1), score>=BREAK es corte seguro (aporta 0)
      let confidenceScore = 1.0;
      if (acc.breakScores.length > 0) {
        const avg =
          acc.breakScores.reduce((sum, s) => sum + (s <= MERGE_THRESHOLD ? 1 : s >= BREAK_THRESHOLD ? 0 : 1 - s), 0) /
          acc.breakScores.length;
        confidenceScore = Math.round(avg * 1000) / 1000;
      }

      const id = uuid();

      // Persist to DB
      try {
        db.query(
          `INSERT INTO processed_paragraphs
            (id, documentId, clientId, paragraphIndex, text, tokenCount, embedding, startSentenceId, endSentenceId, hasSpeakerChange, confidenceScore, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 0, ?, ?)`
        ).run(id, documentId, clientId, paragraphIndex, text, tokenCount, startSentenceId, endSentenceId, confidenceScore, createdAt);
      } catch (e) {
        console.error(`Error saving paragraph ${paragraphIndex}:`, e);
      }

      return {
        id,
        documentId,
        paragraphIndex,
        text,
        tokenCount,
        confidenceScore,
        metadata: {
          startSentenceId,
          endSentenceId,
          hasSpeakerChange: false,
        },
      };
    });

    res.json({
      paragraphs,
      totalSentences: normalizedSentences.length,
      processingTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error("Error in /api/segment:", error);
    res.status(500).json({ error: "Segmentation failed", message: error.message });
  }
});

app.get("/api/paragraphs", (req, res) => {
  try {
    const documentId = req.query.documentId as string;
    const clientId = (req.query.clientId as string) || (req.headers["x-client-id"] as string) || "default";

    if (!documentId) {
      res.status(400).json({ error: "documentId query param is required" });
      return;
    }

    const rows = db
      .query(
        "SELECT * FROM processed_paragraphs WHERE documentId = ? AND clientId = ? ORDER BY paragraphIndex ASC"
      )
      .all(documentId, clientId) as any[];

    const paragraphs = rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      clientId: row.clientId,
      paragraphIndex: row.paragraphIndex,
      text: row.text,
      tokenCount: row.tokenCount,
      confidenceScore: row.confidenceScore,
      metadata: {
        startSentenceId: row.startSentenceId,
        endSentenceId: row.endSentenceId,
        hasSpeakerChange: !!row.hasSpeakerChange,
      },
    }));

    res.json(paragraphs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// -- Transcription persistence (F1) + PIN ownership (F2) --

const sessionIdOf = (req: any): string =>
  ((req.query.clientId as string) || (req.headers["x-client-id"] as string) || "default");

app.post("/api/transcription/claim", async (req, res) => {
  try {
    const sessionId = (req.body?.clientId as string) || (req.headers["x-client-id"] as string) || "default";
    const producerId = (req.body?.clientId as string) || sessionId;
    const pin = (req.body?.pin as string) || "";
    if (TRANSCRIBE_PIN && pin !== TRANSCRIBE_PIN) {
      res.status(403).json({ error: "PIN incorrecto" });
      return;
    }
    const state = await getClientState(sessionId);
    if (
      state.transcription.producing &&
      state.transcriptionProducer &&
      state.transcriptionProducer !== producerId
    ) {
      res.status(409).json({ error: "Otro productor activo" });
      return;
    }
    state.transcriptionProducer = producerId;
    state.transcription.producing = true;
    state.lastTranscriptionUpdate = Date.now();
    openSession(sessionId, state); // FASE 1: claim exitoso abre (y mantiene)
    persistClientState(sessionId, state);
    broadcast(sessionId, { type: "transcriptionState", data: state.transcription });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/transcription/state", (req, res) => {
  try {
    const sessionId = sessionIdOf(req);
    const rows = db
      .query("SELECT ts, text FROM transcript_lines WHERE session_id = ? ORDER BY ts ASC")
      .all(sessionId) as Array<{ ts: number; text: string }>;
    res.json({ lines: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/transcription/append", (req, res) => {
  try {
    const sessionId = (req.body?.clientId as string) || (req.headers["x-client-id"] as string) || "default";
    const { text, ts } = req.body || {};
    if (!text || !String(text).trim()) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    db.query("INSERT INTO transcript_lines (session_id, ts, text) VALUES (?, ?, ?)")
      .run(sessionId, Number(ts) || Date.now(), String(text));
    void touchSessionById(sessionId); // FASE 1: append mantiene
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/transcription/state", (req, res) => {
  try {
    const sessionId = sessionIdOf(req);
    db.query("DELETE FROM transcript_lines WHERE session_id = ?").run(sessionId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// -- Helpers & DB --

async function setupFuse() {
  const cantos: Canto[] = await getCantos();
  const options = {
    keys: [
      { name: "title", weight: 2 },
      { name: "content", weight: 1 },
      { name: "nh", weight: 1 },
      { name: "type", weight: 0.5 },
    ],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    useExtendedSearch: true,
    minMatchCharLength: 2,
  };
  fuse = new Fuse([], options);
  cantos.forEach((canto) => {
    if (canto.title && canto.content) {
      fuse.add(canto);
    }
  });
}

async function updateFuse() {
  const cantos = await getCantos();
  fuse.setCollection(cantos);
}

function parseSong(canto: Canto): ParsedSong {
  const lines: string[] = [];
  const actions: { text: string; index: number }[] = [];
  const prefix =
    canto.type === "Canto" && canto.nh ? `${canto.nh}` : "ESPECIAL";
  const headerLine = `${prefix} - ${(canto.title || "").toUpperCase()}`;
  lines.push(headerLine);
  actions.push({ text: "INICIO", index: 0 });
  const content = canto.content;
  const rawLines =
    typeof content === "string"
      ? content.split("\n").filter(Boolean)
      : Array.isArray(content)
        ? content
        : [];
  rawLines.forEach((line) => {
    lines.push(line);
    const currentIndex = lines.length - 1;
    const cleanLine = line.trim();
    const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/i;
    const regexTag = /^Al\s+(?:CORO|PRE[-]?CORO|ESTRIBILLO|FINAL)(?:\s+\d+)?/i;
    if (regexMark.test(cleanLine) || regexTag.test(cleanLine)) {
      let text = cleanLine.replace(/^Al\s+/i, "");
      actions.push({
        text: text || `Sec ${currentIndex}`,
        index: currentIndex + 1,
      });
    }
  });
  return {
    id: canto.id,
    title: canto.title,
    type: canto.type,
    nh: canto.nh,
    lines,
    quickActions: actions,
  };
}

interface InitialInfo {
  viewerActive: boolean;
  activeLine: string;
  activeCantoId: string;
  activeIndex: number;
  activeSong: ParsedSong | null;
  announcement: {
    text: string;
    active: boolean;
    topic: string;
  };
  transcription: { active: boolean; producing: boolean; final: string; interim: string };
  transcriptionProducer: string;
  lastTranscriptionUpdate: number;
  lastAnnouncementUpdate: number;
  session: { live: boolean; openedAt: number; lastActivity: number }; // FASE 1
}

const defaultInitialInfo = (): InitialInfo => ({
  viewerActive: false,
  activeLine: "",
  activeCantoId: "",
  activeIndex: 0,
  activeSong: null,
  announcement: {
    text: "",
    active: false,
    topic: getColombianDate(),
  },
  transcription: { active: false, producing: false, final: "", interim: "" },
  transcriptionProducer: "",
  lastTranscriptionUpdate: Date.now(),
  lastAnnouncementUpdate: Date.now(),
  session: { live: false, openedAt: 0, lastActivity: 0 },
});

const clientStates = new Map<string, InitialInfo>();

async function getClientState(clientId: string): Promise<InitialInfo> {
  if (clientStates.has(clientId)) {
    return clientStates.get(clientId)!;
  }

  // Try to load from DB
  try {
    const row: any = db.query("SELECT * FROM client_states WHERE clientId = ?").get(clientId);
    if (row) {
      const state = defaultInitialInfo();
      state.viewerActive = !!row.viewerActive;
      state.activeLine = row.activeLine || "";
      state.activeCantoId = row.activeCantoId || "";
      state.activeIndex = row.activeIndex || 0;
      state.announcement.text = row.announcementText || "";
      state.announcement.active = !!row.announcementActive;
      state.announcement.topic = row.announcementTopic || "ANUNCIO";
      state.transcription.active = !!row.transcriptionActive;
      state.transcription.producing = !!row.transcriptionProducing;
      state.transcriptionProducer = (row as any).transcriptionProducer || "";
      state.lastTranscriptionUpdate = row.lastTranscriptionUpdate || Date.now();
      state.lastAnnouncementUpdate = row.lastAnnouncementUpdate || Date.now();
      // FASE 1: session persiste en client_states (columnas nuevas; filas viejas → cerrada)
      state.session.live = !!(row as any).sessionLive;
      state.session.openedAt = (row as any).sessionOpenedAt || 0;
      state.session.lastActivity = (row as any).sessionLastActivity || 0;

      // Load song if activeCantoId exists (FASE 2: gran-diamante ni lo intenta)
      if (state.activeCantoId && clientId !== "gran-diamante") {
        const songs = await getCantos(state.activeCantoId);
        if (songs[0]) {
          state.activeSong = parseSong(songs[0]);
        }
      }
      
      clientStates.set(clientId, state);
      return state;
    }
  } catch (e) {
    console.error(`Error loading state for ${clientId}:`, e);
  }

  // Not found, use default
  const newState = defaultInitialInfo();
  clientStates.set(clientId, newState);
  return newState;
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function saveClientState(clientId: string, state: InitialInfo) {
  // ponytail: debounce 1500ms — transcriptionUpdate llega ~10/s
  const prev = saveTimers.get(clientId);
  if (prev) clearTimeout(prev);
  saveTimers.set(clientId, setTimeout(() => {
    saveTimers.delete(clientId);
    persistClientState(clientId, state);
  }, 1500));
}

function persistClientState(clientId: string, state: InitialInfo) {
  try {
    const query = db.query(`
      INSERT OR REPLACE INTO client_states (
        clientId, viewerActive, activeLine, activeCantoId, activeIndex, 
        announcementText, announcementActive, 
        announcementTopic, transcriptionActive, transcriptionProducing,
        transcriptionProducer,
        lastTranscriptionUpdate, lastAnnouncementUpdate,
        sessionLive, sessionOpenedAt, sessionLastActivity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    query.run(
      clientId,
      state.viewerActive ? 1 : 0,
      state.activeLine,
      state.activeCantoId,
      state.activeIndex,
      state.announcement.text,
      state.announcement.active ? 1 : 0,
      state.announcement.topic,
      state.transcription.active ? 1 : 0,
      state.transcription.producing ? 1 : 0,
      state.transcriptionProducer || "",
      state.lastTranscriptionUpdate,
      state.lastAnnouncementUpdate,
      state.session.live ? 1 : 0,
      state.session.openedAt,
      state.session.lastActivity
    );
  } catch (e) {
    console.error(`Error saving state for ${clientId}:`, e);
  }
}

async function prepareDb() {
  try {
    db.run(
      "CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, text TEXT NOT NULL, topic TEXT, createdAt INTEGER, clientId TEXT)",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, createdAt INTEGER, clientId TEXT)"
    );
    db.run(
      `CREATE TABLE IF NOT EXISTS client_states (
        clientId TEXT PRIMARY KEY,
        viewerActive INTEGER,
        activeLine TEXT,
        activeCantoId TEXT,
        activeIndex INTEGER,
        announcementText TEXT,
        announcementActive INTEGER,
        announcementTopic TEXT,
        transcriptionActive INTEGER,
        transcriptionProducing INTEGER,
        lastTranscriptionUpdate INTEGER,
        lastAnnouncementUpdate INTEGER,
        sessionLive INTEGER,
        sessionOpenedAt INTEGER,
        sessionLastActivity INTEGER
      )`,
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS processed_paragraphs (
        id TEXT PRIMARY KEY,
        documentId TEXT NOT NULL,
        clientId TEXT NOT NULL,
        paragraphIndex INTEGER NOT NULL,
        text TEXT NOT NULL,
        tokenCount INTEGER NOT NULL,
        embedding TEXT,
        startSentenceId TEXT,
        endSentenceId TEXT,
        hasSpeakerChange INTEGER DEFAULT 0,
        confidenceScore REAL DEFAULT 1.0,
        createdAt INTEGER NOT NULL
      )`
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_paragraphs_document ON processed_paragraphs(documentId, clientId)"
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS transcript_lines (session_id TEXT NOT NULL, ts INTEGER NOT NULL, text TEXT NOT NULL)"
    );
    db.run(
      "CREATE INDEX IF NOT EXISTS idx_transcript_session ON transcript_lines(session_id, ts)"
    );

    // Migrations
    try {
      db.run("ALTER TABLE client_states ADD COLUMN transcriptionProducing INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN transcriptionProducer TEXT");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN lastTranscriptionUpdate INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN lastAnnouncementUpdate INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN sessionLive INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN sessionOpenedAt INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN sessionLastActivity INTEGER");
    } catch (e) {}
  } catch (error) {
    console.error("Error preparing database:", error);
  }
}

async function getCantos(id?: string): Promise<Canto[]> {
  try {
    if (id) {
      const result = db.query("SELECT * FROM cantos WHERE id = ?").all(id);
      return result.length > 0 ? [result[0] as Canto] : [];
    } else {
      return db
        .query("SELECT id, title, nh, type, content FROM cantos ORDER BY nh")
        .all() as Canto[];
    }
  } catch (error) {
    console.error("Error fetching cantos:", error);
    return [];
  }
}

// -- Interfaces --

interface ParsedSong {
  id: string;
  title: string;
  type: string;
  nh: number;
  lines: string[];
  quickActions: { text: string; index: number }[];
}

interface Canto {
  id: string;
  title: string;
  type: string;
  nh: number;
  content: string;
}

// -- Start Server --

async function checkRpunct() {
  const url = process.env.RPUNCT_URL || "http://127.0.0.1:8000";
  try {
    const res = await fetch(`${url}/punctuate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "prueba de conexion con rpunct" }),
    });
    const data = await res.json();
    if (res.ok) {
      colorprint.INFO(`rpunct OK ${url} → ${JSON.stringify(data)}`);
    } else {
      colorprint.WARN(`rpunct respondió HTTP ${res.status} en ${url}`);
    }
  } catch (e: any) {
    colorprint.WARN(`rpunct NO accesible en ${url}: ${e.cause?.code ?? e.message}`);
  }
}

server.listen(PORT, "0.0.0.0", async () => {
  colorprint.INFO("Server running in http://0.0.0.0:" + PORT);
  await prepareDb();
  await setupFuse();
  checkRpunct();
});
