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

const db = new Database("./src/data/database.db");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

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

  // Send initial state immediately
  const state = await getClientState(clientId);
  ws.send(JSON.stringify({ type: "initial", data: { ...state, connectionId } }));

  ws.on("close", () => {
    colorprint.DEBUG(`[WS Disconnected] Client: ${clientId}`);
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
    let changed = false;

    // Check transcription inactivity
    if (state.lastTranscriptionUpdate && (now - state.lastTranscriptionUpdate > twoHours)) {
      if (state.transcription.final || state.transcription.interim || state.transcription.active) {
        state.transcription = { active: false, producing: false, final: "", interim: "" };
        state.lastTranscriptionUpdate = now;
        broadcast(clientId, { type: "transcriptionState", data: state.transcription });
        broadcast(clientId, { type: "transcriptionUpdate", data: { final: "", interim: "" } });
        changed = true;
        colorprint.NOTICE(`[Cleanup] Cleared transcription for ${clientId} due to inactivity`);
      }
    }

    // Check announcement inactivity
    if (state.lastAnnouncementUpdate && (now - state.lastAnnouncementUpdate > twoHours)) {
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
  const wsMsg = JSON.stringify(data);
  wss.clients.forEach((ws: any) => {
    if (ws.readyState === 1 && ws.clientId === clientId) {
      ws.send(wsMsg);
    }
  });
}

// SSE removed in favor of WebSockets

// -- Real-time Actions (Previously WS) --

app.post("/api/ws-events/:type", async (req, res) => {
  const { type } = req.params;
  const { data, from, to } = req.body;
  const clientId = (req.headers["x-client-id"] as string) || "default";
  
  colorprint.DEBUG(`[Event] Client: ${clientId}, Type: ${type}, From: ${from}, To: ${to}`);

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
      broadcast(clientId, {
        type: "announcement",
        data: state.announcement,
        lastAnnouncementUpdate: state.lastAnnouncementUpdate,
        from,
        to,
      });
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
      broadcast(clientId, { type: "transcriptionUpdate", data, from, to });
      break;

    default:
      // Forward any other events (like WebRTC signaling)
      broadcast(clientId, { type, data, from, to });
      break;
  }

  saveClientState(clientId, state);
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
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const query = db.query(
      "SELECT * FROM anuncios WHERE clientId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
    );
    const results = query.all(clientId, limit, offset);
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
    res.json({ success: true, count: ids.length });
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
  try {
    const { text } = req.body;
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
    });
    
    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      console.warn("Python service returned error status", response.status);
      res.json({ text }); // Fallback
    }
  } catch (error) {
    console.error("Error connecting to rpunct service proxy:", error);
    res.json({ text: req.body.text || "" }); // Fallback
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
  lastTranscriptionUpdate: number;
  lastAnnouncementUpdate: number;
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
  lastTranscriptionUpdate: Date.now(),
  lastAnnouncementUpdate: Date.now(),
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
      state.lastTranscriptionUpdate = row.lastTranscriptionUpdate || Date.now();
      state.lastAnnouncementUpdate = row.lastAnnouncementUpdate || Date.now();

      // Load song if activeCantoId exists
      if (state.activeCantoId) {
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

function saveClientState(clientId: string, state: InitialInfo) {
  try {
    const query = db.query(`
      INSERT OR REPLACE INTO client_states (
        clientId, viewerActive, activeLine, activeCantoId, activeIndex, 
        announcementText, announcementActive, 
        announcementTopic, transcriptionActive, transcriptionProducing,
        lastTranscriptionUpdate, lastAnnouncementUpdate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      state.lastTranscriptionUpdate,
      state.lastAnnouncementUpdate
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
        lastAnnouncementUpdate INTEGER
      )`,
    );

    // Migrations
    try {
      db.run("ALTER TABLE client_states ADD COLUMN transcriptionProducing INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN lastTranscriptionUpdate INTEGER");
    } catch (e) {}
    try {
      db.run("ALTER TABLE client_states ADD COLUMN lastAnnouncementUpdate INTEGER");
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

server.listen(PORT, "0.0.0.0", async () => {
  colorprint.INFO("Server running in http://0.0.0.0:" + PORT);
  await prepareDb();
  await setupFuse();
});
