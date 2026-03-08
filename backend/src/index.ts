import Database from "bun:sqlite";
import express, { Response } from "express";
import { v4 as uuid } from "uuid";
import http from "http";
// @ts-ignore
import colorprint from "colorprint";
import cors from "cors";
import Fuse from "fuse.js";

const db = new Database("./src/data/database.db");

const app = express();
const server = http.createServer(app);

const PORT = 3100;

app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(express.json({limit: '5mb'}));

let fuse: Fuse<Canto>;

// -- SSE Logic --

let clients: { id: string, res: Response }[] = [];

function broadcast(data: any) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    clients.forEach(client => client.res.write(msg));
}

app.get("/sse", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    // Common header to disable buffering in Nginx and other proxies
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = uuid();
    clients.push({ id: clientId, res });

    colorprint.NOTICE(`[SSE Client Connected] ID: ${clientId}`);

    // Send initial state immediately
    res.write(`data: ${JSON.stringify({ type: "initial", data: initialInfo })}\n\n`);

    req.on('close', () => {
        clients = clients.filter(c => c.id !== clientId);
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
            if (initialInfo.activeSong && initialInfo.activeSong.lines[data] !== undefined) {
                initialInfo.activeLine = initialInfo.activeSong.lines[data];
                broadcast({ type: "line", data: initialInfo.activeLine });
            }
            broadcast({ type: "index", data });
            break;

        case "view":
            colorprint.WARN(`[Viewer State] ${data ? 'ENABLED' : 'DISABLED'}`);
            initialInfo.viewerActive = data;
            broadcast({ type: "viewerActive", data });
            break;

        case "setAnnouncement":
            colorprint.NOTICE(`[Announcement] ${data.active ? 'SHOW:' : 'HIDE:'} ${data.text}`);
            initialInfo.announcement = {
                ...initialInfo.announcement,
                text: data.text,
                active: data.active,
                position: data.position || initialInfo.announcement.position || 'bottom'
            };
            broadcast({ type: "announcement", data: initialInfo.announcement });
            if (data.active && initialInfo.transcription.active) {
                initialInfo.transcription.active = false;
                broadcast({ type: "transcriptionState", data: initialInfo.transcription });
            }
            break;

        case "setTranscriptionActive":
            colorprint.WARN(`[Transcription State] ${data ? 'ENABLED' : 'DISABLED'}`);
            initialInfo.transcription.active = data;
            if (data) {
                initialInfo.announcement.active = false;
                initialInfo.viewerActive = false;
                broadcast({ type: "announcement", data: initialInfo.announcement });
                broadcast({ type: "viewerActive", data: false });
            }
            broadcast({ type: "transcriptionState", data: initialInfo.transcription });
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
    res.send("Alive!");
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
            "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)"
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
        res.status(200).json({ message: "Cantos importados exitosamente", count: cantos.length });
    } catch (error: any) {
        console.error("Error al importar cantos:", error);
        res.status(500).json({ error: "Error al importar cantos", message: error.message });
    }
});

app.post("/api/canto", async (req, res) => {
    try {
        const { title, type, nh, content } = req.body;
        const id = uuid();
        const query = db.query(
            "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)"
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
            res.status(400).send("ERROR: 'id' es requerido para actualizar el canto.");
            return;
        }
        const query = db.query(
            "UPDATE cantos SET title = ?, type = ?, nh = ?, content = ? WHERE id = ?"
        );
        const result = query.run(title, type, nh, content, id);
        if (result.changes === 0) {
            res.status(404).send("ERROR: No se encontró ningún canto con el ID proporcionado.");
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
        const query = db.query("SELECT * FROM anuncios ORDER BY createdAt DESC LIMIT 50");
        const results = query.all();
        res.json(results);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.post("/api/anuncios", (req, res) => {
    try {
        const { text, position } = req.body;
        if (!text) {
            res.status(400).json({ error: "Text is required" });
            return;
        }
        const id = uuid();
        const createdAt = Date.now();
        const pos = position || 'bottom';
        const insert = db.query("INSERT INTO anuncios (id, text, position, createdAt) VALUES (?, ?, ?, ?)");
        insert.run(id, text, pos, createdAt);
        res.json({ id, text, position: pos, createdAt });
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
            results: results.map((result) => ({ ...result.item, score: result.score })),
        });
    } catch (error: any) {
        console.error("Search error:", error);
        res.status(500).json({ error: "An error occurred while searching", message: error.message });
    }
});

// -- Helpers & DB --

async function setupFuse() {
    const cantos: Canto[] = await getCantos();
    const options = {
        keys: [{ name: 'title', weight: 2 }, { name: 'content', weight: 1 }, { name: 'nh', weight: 1 }, { name: 'type', weight: 0.5 }],
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true,
        useExtendedSearch: true,
        minMatchCharLength: 2
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
    const prefix = (canto.type === 'Canto' && canto.nh) ? `${canto.nh}` : 'ESPECIAL';
    const headerLine = `${prefix} - ${(canto.title || '').toUpperCase()}`;
    lines.push(headerLine);
    actions.push({ text: 'INICIO', index: 0 });
    const content = canto.content;
    const rawLines = typeof content === 'string' ? content.split('\n').filter(Boolean) : (Array.isArray(content) ? content : []);
    rawLines.forEach((line) => {
        lines.push(line);
        const currentIndex = lines.length - 1;
        const cleanLine = line.trim();
        const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/i;
        const regexTag = /^Al\s+(?:CORO|PRE[-]?CORO|ESTRIBILLO|FINAL)(?:\s+\d+)?/i;
        if (regexMark.test(cleanLine) || regexTag.test(cleanLine)) {
             let text = cleanLine.replace(/^Al\s+/i, ''); 
             actions.push({ text: text || `Sec ${currentIndex}`, index: currentIndex + 1 });
        }
    });
    return { id: canto.id, title: canto.title, type: canto.type, nh: canto.nh, lines, quickActions: actions };
}

let initialInfo = {
    viewerActive: false,
    activeLine: "",
    activeCantoId: "",
    activeIndex: 0,
    activeSong: null as ParsedSong | null,
    announcement: { text: "", active: false, position: 'bottom' as 'top' | 'bottom' },
    transcription: { active: false, final: "", interim: "" }
};

async function prepareDb() {
    try {
        db.run("CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)");
        db.run("CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, text TEXT NOT NULL, position TEXT DEFAULT 'bottom', createdAt INTEGER)");
        try {
            db.query("SELECT position FROM anuncios LIMIT 1").get();
        } catch (e) {
            db.run("ALTER TABLE anuncios ADD COLUMN position TEXT DEFAULT 'bottom'");
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
            return db.query("SELECT id, title, nh, type, content FROM cantos ORDER BY nh").all() as Canto[];
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

server.listen(PORT, async () => {
    colorprint.INFO("Server running in http://localhost:" + PORT);
    await prepareDb();
    await setupFuse();
});
