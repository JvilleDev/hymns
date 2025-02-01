import Database from "bun:sqlite";
import express from "express";
import { v4 as uuid } from "uuid";
import http from "http";
import * as io from "socket.io";
import colorprint from "colorprint";
import cors from "cors";
import Fuse from "fuse.js";
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const db = new Database("src/data.db");

const app = express();
const server = http.createServer(app);
const socket = new io.Server(server, {
    cors: {
        origin: "*",
    },
});
const PORT = 5001;

let initialInfo = {
    viewerActive: true,
    activeLine: "",
};
app.use(express.static("public"));
app.use(cors({ origin: "*" }));
app.use(express.json());
server.listen(PORT, async () => {
    await prisma.$connect()
    colorprint.INFO("Server running in http://localhost:" + PORT);
    prepareDb();
    setupFuse();
});

let fuse: Fuse<unknown>;

async function setupFuse() {
    const cantos: Canto[] = await getCantos();
    const options = {
        keys: ["title", "content", "nh", "type"],
        includeScore: true,
        threshold: 0.3,
    };
    fuse = new Fuse(cantos, options);
}

async function updateFuse() {
    const cantos = await getCantos();
    fuse.setCollection(cantos);
}

socket.on("connection", (sc) => {
    sc.emit("initial", initialInfo);
    sc.on("newLine", (msg) => {
        initialInfo.activeLine = msg;
        socket.emit("line", msg);
    });
    sc.on("view", (msg) => {
        initialInfo.viewerActive = msg;
        socket.emit("viewerActive", msg);
    });
});

app.get("/", async (req, res) => {
    res.send("Alive!");
});

app.get("/api/cantos", async (req, res) => {
    res.send(await getCantos());
});
app.get("/api/canto/:id", async (req, res) => {
    res.send(await getCantos(req.params.id));
});
app.post("/api/canto", async (req, res) => {
    try {
        const { title, type, nh, content } = req.body;
        const id = uuid();
        const query = db.query(
            "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)"
        );
        query.run(id, title, type, nh, content);
        prisma.cantos.upsert({
            where: { id: id },
            update: { title: title, type: type, nh: nh, content: content },
            create: { id: id, title: title, type: type, nh: nh, content: content },
        })

        await updateFuse();
        res.send("OK!");
    } catch (error) {
        res.send(`ERROR: ${error}`);
    }
});
app.put("/api/canto", async (req, res): Promise<any> => {
    try {
        const { id, title, type, nh, content } = req.body;

        if (!id) {
            return res.status(400).send("ERROR: 'id' es requerido para actualizar el canto.");
        }

        const query = db.query(
            "UPDATE cantos SET title = ?, type = ?, nh = ?, content = ? WHERE id = ?"
        );

        const result = await query.run(title, type, nh, content, id);

        if (result.changes === 0) {
            return res
                .status(404)
                .send("ERROR: No se encontró ningún canto con el ID proporcionado.");
        }

        await prisma.cantos.update({
            where: { id: id },
            data: { title: title, type: type, nh: nh, content: content },
        })

        await updateFuse();
        res.send("Canto actualizado correctamente.");
    } catch (error: Error | any) {
        res.status(500).send(`ERROR: ${error.message}`);
    }
});
app.delete("/api/canto/:id", async (req, res) => {
    try {
        const query = db.query("DELETE FROM cantos WHERE id = ?");
        await query.run(req.params.id);

        await prisma.cantos.delete({
            where: {id: req.params.id},
        })

        await updateFuse();
        res.send("OK!");
    } catch (error) {
        res.send(`ERROR: ${error}`);
    }
});
app.get("/search", async (req, res): Promise<any> => {
    try {
        if (!req.query.q) {
            return res.status(400).json({
                error: "Search query is required",
            });
        }

        const searchTerm = req.query.q as string;
        const results = fuse.search(searchTerm);
        res.json({
            results: results.map((result) => result.item),
        });
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({
            error: "An error occurred while searching",
        });
    }
});

// DB Setup
async function prepareDb() {
    await db.run(
        "CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)"
    );
    const res = await prisma.cantos.findMany()
    for (const row of res) {
        const query = db.query(
            "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)"
        );
        await query.run(row.id, row.title, row.type, row.nh, row.content);
    }
}
async function getCantos(id?: string):Promise<Canto[]> {
    if (id) {
        const query = db.query("SELECT * FROM cantos WHERE id = ?");
        return await query.all(id)[0] as Canto[];
    } else {
        const query = db.query(
            "SELECT id, title, nh, type, content FROM cantos ORDER BY nh"
        );
        return await query.all() as Canto[];
    }
}