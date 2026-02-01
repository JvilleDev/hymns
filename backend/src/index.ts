import Database from "bun:sqlite";
import express from "express";
import { v4 as uuid } from "uuid";
import http from "http";
import * as io from "socket.io";
// @ts-ignore
import colorprint from "colorprint";
import cors from "cors";
import Fuse from "fuse.js";

const db = new Database("./src/data/database.db");

const app = express();
const server = http.createServer(app);
const socket = new io.Server(server, {
    cors: {
        origin: "*",
    },
});
const PORT = 3100;



app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(express.json({limit: '5mb'}));

let fuse: Fuse<Canto>;

server.listen(PORT, async () => {
    colorprint.INFO("Server running in http://localhost:" + PORT);
    await prepareDb();
    await setupFuse();
});

async function setupFuse() {
    const cantos: Canto[] = await getCantos();
    const options = {
        keys: [
            { name: 'title', weight: 2 },
            { name: 'content', weight: 1 },
            { name: 'nh', weight: 1 },
            { name: 'type', weight: 0.5 }
        ],
        includeScore: true,
        threshold: 0.4,
        ignoreLocation: true,
        useExtendedSearch: true,
        minMatchCharLength: 2
    };

    fuse = new Fuse([], options);

    let addedCount = 0;
    cantos.forEach((canto, index) => {
        try {
            if (canto.title && canto.content) {
               fuse.add(canto);
               addedCount++;
            }
        } catch (error) {
            console.error(`Error al agregar canto #${index} (${canto.id}) a Fuse:`, error);
        }
    });
}

async function updateFuse() {
    const cantos = await getCantos();
    fuse.setCollection(cantos);
}


// -- Tipos --
interface ParsedSong {
    id: string;
    title: string;
    type: string;
    nh: number;
    lines: string[];
    quickActions: { text: string; index: number }[];
}

interface Anuncio {
    id: string;
    text: string;
    position: 'top' | 'bottom';
    createdAt: number; // timestamp
}

// -- Helpers --
function parseSong(canto: Canto): ParsedSong {
    const lines: string[] = [];
    const actions: { text: string; index: number }[] = [];

    // Header Line
    const prefix = (canto.type === 'Canto' && canto.nh) ? `${canto.nh}` : 'ESPECIAL';
    const headerLine = `${prefix} - ${(canto.title || '').toUpperCase()}`;
    
    lines.push(headerLine);
    actions.push({ text: 'INICIO', index: 0 });

    // Process Content
    const content = canto.content;
    const rawLines = typeof content === 'string' 
        ? content.split('\n').filter(Boolean) 
        : (Array.isArray(content) ? content : []);

    rawLines.forEach((line) => {
        // Here we just push the line. Frontend was doing some cleaning but let's keep it simple for now.
        // We might want to remove formatting cues if they exist, but current logic seemed to use raw lines.
        lines.push(line);
        const currentIndex = lines.length - 1;

        const cleanLine = line.trim();
        // Regex for Marks
        const regexMark = /^(?:\d+|[->]|FINAL|(?:CORO|PRE[-]?CORO|ESTRIBILLO))/i;
        // Regex for Tags
        const regexTag = /^Al\s+(?:CORO|PRE[-]?CORO|ESTRIBILLO|FINAL)(?:\s+\d+)?/i;

        if (regexMark.test(cleanLine) || regexTag.test(cleanLine)) {
             let text = cleanLine.replace(/^Al\s+/i, ''); 
             actions.push({ text: text || `Sec ${currentIndex}`, index: currentIndex + 1 });
        }
    });

    return {
        id: canto.id,
        title: canto.title,
        type: canto.type,
        nh: canto.nh,
        lines,
        quickActions: actions
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
        position: 'bottom' as 'top' | 'bottom',
    },
};


socket.on("connection", (sc) => {
    colorprint.NOTICE(`[Client Connected] ID: ${sc.id}`);
    sc.emit("initial", initialInfo);

    sc.on("newLine", (msg) => {
        colorprint.INFO(`[Line] ${msg}`);
        initialInfo.activeLine = msg;
        sc.broadcast.emit("line", msg);
    });

    sc.on("changeCanto", async (id) => {
        colorprint.INFO(`[Canto Change] New ID: ${id}`);
        initialInfo.activeCantoId = id;
        initialInfo.activeIndex = 0;
        
        try {
            const rawSong = (await getCantos(id))[0];
            if (rawSong) {
                const parsed = parseSong(rawSong);
                initialInfo.activeSong = parsed;
                
                // Broadcast structured song data
                socket.emit("activeSong", parsed);
                
                // Also emit 'canto' for compatibility if needed, but 'activeSong' should supersede
                sc.broadcast.emit("canto", id); 
                
                // Auto-set first line
                if (parsed.lines.length > 0) {
                     initialInfo.activeLine = parsed.lines[0];
                     socket.emit("line", initialInfo.activeLine);
                     socket.emit("index", 0);
                }
            } 
        } catch (e) {
            console.error("Error parsing song:", e);
            initialInfo.activeSong = null;
        }
    });

    sc.on("changeIndex", (index) => {
        colorprint.INFO(`[Index Change] Line: ${index + 1}`);
        initialInfo.activeIndex = index;
        
        if (initialInfo.activeSong && initialInfo.activeSong.lines[index] !== undefined) {
            initialInfo.activeLine = initialInfo.activeSong.lines[index];
            socket.emit("line", initialInfo.activeLine);
        }
        
        sc.broadcast.emit("index", index);
    });

    sc.on("view", (msg) => {
        colorprint.WARN(`[Viewer State] ${msg ? 'ENABLED' : 'DISABLED'}`);
        initialInfo.viewerActive = msg;
        sc.broadcast.emit("viewerActive", msg);
    });

    sc.on("newWritten", (msg) => {
        colorprint.NOTICE(`[Notification] ${msg.html ? 'HTML Content' : 'Text'}`);
        socket.emit("written", msg);
        socket.emit("written", msg);
    });

    sc.on("setAnnouncement", (data: { text: string; active: boolean; position?: 'top' | 'bottom' }) => {
        colorprint.NOTICE(`[Announcement] ${data.active ? 'SHOW:' : 'HIDE:'} ${data.text} (${data.position || 'bottom'})`);
        initialInfo.announcement = {
            ...initialInfo.announcement,
            text: data.text,
            active: data.active,
            position: data.position || initialInfo.announcement.position || 'bottom'
        };
        sc.broadcast.emit("announcement", initialInfo.announcement);
        sc.emit("announcement", initialInfo.announcement); // Echo back to sender to confirm state
    });

    sc.on("disconnect", () => {
        colorprint.DEBUG(`[Client Disconnected] ID: ${sc.id}`);
    });
});

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
            return res.status(400).json({ error: "El cuerpo debe ser un array de cantos." });
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
            return res.status(400).send("ERROR: 'id' es requerido para actualizar el canto.");
        }

        const query = db.query(
            "UPDATE cantos SET title = ?, type = ?, nh = ?, content = ? WHERE id = ?"
        );
        const result = query.run(title, type, nh, content, id);

        if (result.changes === 0) {
            return res.status(404).send("ERROR: No se encontró ningún canto con el ID proporcionado.");
        }

        await updateFuse();
        res.send("Canto actualizado correctamente.");
    } catch (error: any) {
        res.status(500).send(`ERROR: ${error.message}`);
    }
});

app.delete("/api/cantos", async (req, res) => {
    console.log("DELETE /api/cantos hit");
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
    res.json({ status: "ok", version: "v2-with-delete" });
});

app.delete("/api/canto/:id", async (req, res) => {
    try {
        const query = db.query("DELETE FROM cantos WHERE id = ?");
        const result = query.run(req.params.id);

        if (result.changes === 0) {
            return res.status(404).send("ERROR: No se encontró ningún canto para eliminar.");
        }

        await updateFuse();
        res.send("OK!");
    } catch (error) {
        res.send(`ERROR: ${error}`);
    }

});

// -- Anuncios API --

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
        if (!text) return res.status(400).json({ error: "Text is required" });

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

app.get("/search", async (req, res) => {
    try {
        if (!req.query.q) {
            return res.status(400).json({
                error: "Search query is required",
            });
        }

        const searchTerm = req.query.q as string;
        if (!fuse) {
            await setupFuse();
        }

        const cantos = await getCantos();
        if (cantos.length === 0) {
            await setupFuse();
            return res.status(500).json({
                error: "No hay cantos en la base de datos para buscar"
            });
        }

        let manualMatches = 0;
        cantos.forEach(canto => {
            const titleMatch = canto.title.toLowerCase().includes(searchTerm.toLowerCase());
            const contentMatch = canto.content.toLowerCase().includes(searchTerm.toLowerCase());
            if (titleMatch || contentMatch) {
                manualMatches++;
            }
        });

        const results = fuse.search(searchTerm);

        if (results.length === 0 && manualMatches > 0) {
            console.warn("La búsqueda manual encontró coincidencias pero Fuse no encontró ninguna.");
        }

        res.json({
            query: searchTerm,
            count: results.length,
            manualMatches: manualMatches,
            results: results.map((result) => ({
                ...result.item,
                score: result.score
            })),
        });
    } catch (error: any) {
        console.error("Search error:", error);
        res.status(500).json({
            error: "An error occurred while searching",
            message: error.message
        });
    }
});

// DB Setup
async function prepareDb() {
    try {
        db.run(
            "CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)"
        );
        db.run(
            "CREATE TABLE IF NOT EXISTS anuncios (id TEXT PRIMARY KEY, text TEXT NOT NULL, position TEXT DEFAULT 'bottom', createdAt INTEGER)"
        );
        
        // Migration to add position column if it doesn't exist
        try {
            const tempQuery = db.query("SELECT position FROM anuncios LIMIT 1");
            tempQuery.get();
        } catch (e) {
            console.log("Migrating anuncios table to include position...");
            db.run("ALTER TABLE anuncios ADD COLUMN position TEXT DEFAULT 'bottom'");
        }
    } catch (error) {
        console.error("Error preparing database:", error);
    }
}

async function getCantos(id?: string): Promise<Canto[]> {
    try {
        if (id) {
            const query = db.query("SELECT * FROM cantos WHERE id = ?");
            const result = query.all(id);
            return result.length > 0 ? [result[0] as Canto] : [];
        } else {
            const query = db.query(
                "SELECT id, title, nh, type, content FROM cantos ORDER BY nh"
            );
            const results = query.all();
            return results as Canto[];
        }
    } catch (error) {
        console.error("Error fetching cantos:", error);
        return [];
    }
}

// Tipado
interface Canto {
    id: string;
    title: string;
    type: string;
    nh: number;
    content: string;
}
