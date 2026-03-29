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
import { tunnelmole } from "tunnelmole";

const db = new Database("./src/data/database.db");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Explicitly handle WebSocket upgrades for /ws path
server.on("upgrade", (request, socket, head) => {
  const url = request.url || "";
  const host = request.headers.host || "unknown";
  
  // Log for debugging tunnel issues
  colorprint.DEBUG(`[Upgrade Request] Host: ${host}, URL: ${url}`);

  // Use a more flexible path detection
  const isWsPath = url === "/ws" || url.endsWith("/ws") || url.includes("/ws?");

  if (isWsPath) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    colorprint.WARN(`[Upgrade Rejected] Path not matched: ${url}`);
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

let currentTunnelUrl = "";

const PORT = 3100;

app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "5mb" }));

let fuse: Fuse<Canto>;

// -- Real-time Sync Logic (SSE & WS) --

let clients: { id: string; res: Response }[] = [];
let wsClients: any[] = [];

wss.on("connection", (ws) => {
  // @ts-ignore
  ws.isAlive = true;
  ws.on("pong", () => {
    // @ts-ignore
    ws.isAlive = true;
  });

  wsClients.push(ws);
  colorprint.NOTICE(`[WS Client Connected] Count: ${wsClients.length}`);

  // Send initial state immediately
  ws.send(JSON.stringify({ type: "initial", data: initialInfo }));

  ws.on("close", () => {
    wsClients = wsClients.filter((c) => c !== ws);
    colorprint.DEBUG(`[WS Client Disconnected] Count: ${wsClients.length}`);
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
});

function getTunnel() {
  return tunnelmole({
    port: PORT,
  });
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "localhost";
}

async function sendNotification(
  message: string,
  url?: string,
) {
  console.log("NOTIFICATION");
  console.log("TUNNEL HOSTNAME:", new URL(url || "").hostname)
  const res = await fetch("https://ntfy.sh/himnario", {
    method: "POST",
    headers: {"Content-Type": "application/json", "Actions": `view, Abrir, ${url}, clear=true`},
    body: message,
  });
  console.log(`NOTIFICATION STATUS: ${res.status}`);
  console.log("NOTIFICATION SENT")
}

function broadcast(data: any) {
  // 1. SSE Broadcast
  const sseMsg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => client.res.write(sseMsg));

  // 2. WS Broadcast
  const wsMsg = JSON.stringify(data);
  wsClients.forEach((ws) => {
    if (ws.readyState === 1) {
      // WebSocket.OPEN
      ws.send(wsMsg);
    }
  });
}

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  // Common header to disable buffering in Nginx and other proxies
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const clientId = uuid();
  clients.push({ id: clientId, res });

  colorprint.NOTICE(`[SSE Client Connected] ID: ${clientId}`);

  // Send initial state immediately
  res.write(
    `data: ${JSON.stringify({ type: "initial", data: initialInfo })}\n\n`,
  );

  // SSE Keep-alive interval
  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    clients = clients.filter((c) => c.id !== clientId);
    colorprint.DEBUG(`[SSE Client Disconnected] ID: ${clientId}`);
  });
});

// -- Real-time Actions (Previously WS) --

app.post("/api/ws-events/:type", async (req, res) => {
  const { type } = req.params;
  const { data } = req.body;
  colorprint.DEBUG(`[Event] Type: ${type}`);

  switch (type) {
    case "newLine":
      colorprint.INFO(`[Line] ${data}`);
      initialInfo.activeLine = data;
      broadcast({ type: "line", data });
      break;

    case "changeCanto":
      colorprint.INFO(`[Canto Change] New ID: ${data}`);
      initialInfo.activeCantoId = data;
      initialInfo.activeIndex = 0;
      try {
        const rawSongs = await getCantos(data);
        const rawSong = rawSongs[0];
        if (rawSong) {
          const parsed = parseSong(rawSong);
          initialInfo.activeSong = parsed;
          broadcast({ type: "activeSong", data: parsed });
          if (parsed.lines.length > 0) {
            initialInfo.activeLine = parsed.lines[0];
            broadcast({ type: "line", data: initialInfo.activeLine });
            broadcast({ type: "index", data: 0 });
          }
        }
      } catch (e) {
        console.error("Error parsing song:", e);
        initialInfo.activeSong = null;
      }
      break;

    case "changeIndex":
      colorprint.INFO(`[Index Change] Line: ${data + 1}`);
      initialInfo.activeIndex = data;
      if (
        initialInfo.activeSong &&
        initialInfo.activeSong.lines[data] !== undefined
      ) {
        initialInfo.activeLine = initialInfo.activeSong.lines[data];
        broadcast({ type: "line", data: initialInfo.activeLine });
      }
      broadcast({ type: "index", data });
      break;

    case "view":
      colorprint.WARN(`[Viewer State] ${data ? "ENABLED" : "DISABLED"}`);
      initialInfo.viewerActive = data;
      broadcast({ type: "viewerActive", data });
      break;

    case "setAnnouncement":
      colorprint.NOTICE(
        `[Announcement] ${data.active ? "SHOW:" : "HIDE:"} ${data.text}`,
      );
      initialInfo.announcement = {
        ...initialInfo.announcement,
        text: data.text,
        active: data.active,
        position:
          data.position || initialInfo.announcement.position || "bottom",
      };
      broadcast({ type: "announcement", data: initialInfo.announcement });
      if (data.active && initialInfo.transcription.active) {
        initialInfo.transcription.active = false;
        broadcast({
          type: "transcriptionState",
          data: initialInfo.transcription,
        });
      }
      break;

    case "setTranscriptionActive":
      colorprint.WARN(`[Transcription State] ${data ? "ENABLED" : "DISABLED"}`);
      initialInfo.transcription.active = data;
      if (data) {
        initialInfo.announcement.active = false;
        initialInfo.viewerActive = false;
        broadcast({ type: "announcement", data: initialInfo.announcement });
        broadcast({ type: "viewerActive", data: false });
      }
      broadcast({
        type: "transcriptionState",
        data: initialInfo.transcription,
      });
      break;

    case "transcriptionUpdate":
      initialInfo.transcription.final = data.final;
      initialInfo.transcription.interim = data.interim;
      broadcast({ type: "transcriptionUpdate", data });
      break;
  }

  res.json({ success: true });
});

// -- Standard API Routes --

app.get("/", (req, res) => {
  const isLocal = currentTunnelUrl.includes("localhost") || /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}/.test(new URL(currentTunnelUrl || "http://localhost").hostname);
  const hostname = currentTunnelUrl ? new URL(currentTunnelUrl).hostname : "---";
  
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HIMNARIO - Backend</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: ${isLocal && currentTunnelUrl ? "#f59e0b" : "#6366f1"};
            --primary-hover: ${isLocal && currentTunnelUrl ? "#d97706" : "#4f46e5"};
            --bg: #0f172a;
            --card-bg: rgba(30, 41, 59, 0.7);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --glass-border: rgba(255, 255, 255, 0.1);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background: var(--bg);
            background: radial-gradient(circle at top right, #1e1b4b, #0f172a);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .container {
            width: 90%;
            max-width: 500px;
            perspective: 1000px;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            animation: cardEntrance 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            text-align: center;
        }

        @keyframes cardEntrance {
            from { opacity: 0; transform: translateY(30px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(var(--primary-rgb), 0.1);
            color: var(--primary);
            padding: 6px 16px;
            border-radius: 100px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 24px;
            border: 1px solid rgba(var(--primary-rgb), 0.2);
            text-transform: uppercase;
        }

        .dot {
            width: 8px;
            height: 8px;
            background: var(--primary);
            border-radius: 50%;
            box-shadow: 0 0 10px var(--primary);
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0% { opacity: 0.4; transform: scale(0.8); }
            50% { opacity: 1; transform: scale(1.1); }
            100% { opacity: 0.4; transform: scale(0.8); }
        }

        h1 {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
        }

        p.subtitle {
            color: var(--text-muted);
            font-size: 16px;
            margin-bottom: 32px;
        }

        .hostname-box {
            background: rgba(15, 23, 42, 0.5);
            border: 1px solid var(--glass-border);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 24px;
            position: relative;
            transition: all 0.3s ease;
        }

        .hostname-box:hover {
            border-color: rgba(var(--primary-rgb), 0.4);
            background: rgba(15, 23, 42, 0.7);
        }

        .hostname-label {
            display: block;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
            margin-bottom: 8px;
            font-weight: 600;
        }

        .hostname-value {
            font-size: 20px;
            font-weight: 400;
            color: var(--primary);
            word-break: break-all;
        }

        .copy-btn {
            background: var(--primary);
            color: white;
            border: none;
            width: 100%;
            padding: 16px;
            border-radius: 14px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .copy-btn:hover {
            background: var(--primary-hover);
            transform: translateY(-2px);
            box-shadow: 0 10px 15px -3px rgba(var(--primary-rgb), 0.4);
        }

        .copy-btn:active {
            transform: translateY(0);
        }

        .footer-link {
            display: inline-block;
            margin-top: 24px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 14px;
            transition: color 0.2s;
        }

        .footer-link:hover {
            color: white;
        }

        /* Message alert */
        #toast {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: #10b981;
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            font-weight: 600;
            box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3);
            transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0;
        }

        #toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="status-badge">
                <div class="dot"></div>
                ${!currentTunnelUrl ? "CONECTANDO..." : isLocal ? "MODO LOCAL" : "TÚNEL ACTIVO"}
            </div>
            <h1>HIMNARIO</h1>
            <p class="subtitle">Copie el hostname para el frontend</p>
            
            <div class="hostname-box">
                <span class="hostname-label">Hostname</span>
                <div class="hostname-value" id="hostname">${hostname}</div>
            </div>

            <button class="copy-btn" id="copyBtn" ${!currentTunnelUrl ? "disabled" : ""}>
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copiar Hostname
            </button>

            <a href="${currentTunnelUrl || "#"}" target="_blank" class="footer-link">
                ${currentTunnelUrl ? (isLocal ? "Abrir IP local" : "Abrir URL completa") : "Esperando..."}
            </a>
        </div>
    </div>

    <div id="toast">¡Hostname copiado al portapapeles!</div>

    <script>
        const btn = document.getElementById('copyBtn');
        const textElement = document.getElementById('hostname');
        const toast = document.getElementById('toast');

        btn.addEventListener('click', async () => {
            const text = textElement.innerText;
            if (text === '---') return;
            try {
                await navigator.clipboard.writeText(text);
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 3000);
            } catch (err) {
                console.error('Error al copiar: ', err);
            }
        });
    </script>
</body>
</html>
  `;
  res.send(html);
});

app.get("/api/cantos", async (req, res) => {
  res.send(await getCantos());
});

app.get("/api/canto/:id", async (req, res) => {
  const answer = await getCantos(req.params.id);
  res.send(answer[0]);
});

app.post("/import", async (req, res) => {
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

app.post("/api/canto", async (req, res) => {
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

app.put("/api/canto", async (req, res) => {
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

app.delete("/api/cantos", async (req, res) => {
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

app.delete("/api/canto/:id", async (req, res) => {
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
    const query = db.query(
      "SELECT * FROM anuncios ORDER BY createdAt DESC LIMIT 50",
    );
    const results = query.all();
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/anuncios", (req, res) => {
  try {
    const { text, position, topic } = req.body;
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const id = uuid();
    const createdAt = Date.now();
    const pos = position || "bottom";
    const insert = db.query(
      "INSERT INTO anuncios (id, text, position, topic, createdAt) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run(id, text, pos, topic || null, createdAt);
    res.json({ id, text, position: pos, topic: topic || null, createdAt });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/anuncios/:id", (req, res) => {
  try {
    const query = db.query("DELETE FROM anuncios WHERE id = ?");
    query.run(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/anuncios", (req, res) => {
  try {
    const query = db.query("DELETE FROM anuncios");
    query.run();
    res.json({ success: true, message: "All announcements deleted" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/anuncios/delete-selected", (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: "IDs array is required" });
      return;
    }
    const query = db.query("DELETE FROM anuncios WHERE id = ?");
    db.transaction(() => {
      for (const id of ids) {
        query.run(id);
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

let initialInfo = {
  viewerActive: false,
  activeLine: "",
  activeCantoId: "",
  activeIndex: 0,
  activeSong: null as ParsedSong | null,
  announcement: {
    text: "",
    active: false,
    position: "bottom" as "top" | "bottom",
  },
  transcription: { active: false, final: "", interim: "" },
};

async function prepareDb() {
  try {
    db.run(
      "CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, text TEXT NOT NULL, position TEXT DEFAULT 'bottom', createdAt INTEGER)",
    );
    try {
      db.query("SELECT topic FROM anuncios LIMIT 1").get();
    } catch (e) {
      db.run("ALTER TABLE anuncios ADD COLUMN topic TEXT");
    }
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

  let fallbackTriggered = false;
  const originalExit = process.exit;

  const triggerLocalFallback = (reason: string) => {
    if (fallbackTriggered) return;
    fallbackTriggered = true;

    colorprint.WARN(`[TUNNEL] Switching to Local Mode: ${reason}`);
    
    // Restore original process.exit early
    process.exit = originalExit;
    
    // Fallback logic
    const localIp = getLocalIp();
    currentTunnelUrl = `http://${localIp}:${PORT}`;
    sendNotification("🤖 Backend is alive (Local Mode)!", currentTunnelUrl);
  };

  // Temp global error handlers to catch async library failures
  const onUncaught = (err: Error) => triggerLocalFallback(`Uncaught Exception: ${err.message}`);
  const onUnhandled = (reason: any) => triggerLocalFallback(`Unhandled Rejection: ${reason}`);

  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUnhandled);

  // Monkey-patch process.exit to prevent the library from killing the main process
  // @ts-ignore
  process.exit = (code?: number) => {
    if (code !== 0 && code !== undefined) {
      triggerLocalFallback(`Intercepted process.exit(${code})`);
      return; // Do NOT exit!
    }
    return originalExit(code);
  };

  try {
    // Race the tunnel initialization against a 10-second timeout
    const url = await Promise.race([
      getTunnel(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
    ]) as string;

    if (!fallbackTriggered) {
      currentTunnelUrl = url;
      sendNotification("🤖 Backend is alive!", url);
    }
  } catch (e: any) {
    triggerLocalFallback(e.message);
  } finally {
    // Cleanup handlers after initialization phase
    setTimeout(() => {
      process.off("uncaughtException", onUncaught);
      process.off("unhandledRejection", onUnhandled);
      process.exit = originalExit;
    }, 1000);
  }
});
