import Database from "bun:sqlite";
import express from "express";
import { v4 as uuid } from "uuid";
import http from "http";
import * as io from "socket.io";
// @ts-ignore
import colorprint from "colorprint";
import cors from "cors";
import Fuse from "fuse.js";
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient;
const db =  new Database("src/data.db");

try {
    prisma = new PrismaClient();
} catch (error) {
    console.error("Failed to initialize database connections:", error);
}

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
    await prepareDb();
    await setupFuse();
});

let fuse: Fuse<Canto>;

async function setupFuse() {
    const cantos: Canto[] = await getCantos();
    console.log(`Setting up Fuse search with ${cantos.length} cantos`);
    
    // Log some sample data to verify content
    if (cantos.length > 0) {
        console.log("Sample canto for debugging:", JSON.stringify(cantos[0], null, 2));
    }
    
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
    
    // Inicializar Fuse con un array vacío
    fuse = new Fuse([], options);
    
    // Agregar cada canto individualmente para detectar posibles problemas
    let addedCount = 0;
    cantos.forEach((canto, index) => {
        try {
            // Verificar que el canto tenga los campos necesarios
            if (!canto.title || !canto.content) {
                console.warn(`Canto #${index} (${canto.id}) tiene campos faltantes:`, canto);
            }
            
            // Agregar el canto a Fuse
            fuse.add(canto);
            addedCount++;
        } catch (error) {
            console.error(`Error al agregar canto #${index} (${canto.id}) a Fuse:`, error);
            console.error("Datos del canto problemático:", JSON.stringify(canto, null, 2));
        }
    });
    
    console.log(`Fuse search engine initialized successfully with ${addedCount}/${cantos.length} cantos`);
}

async function updateFuse() {
    const cantos = await getCantos();
    console.log("TIPO DE CANTOS", typeof cantos)
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
    console.log("GET CANTO", req.params.id)
    const answer = await getCantos(req.params.id)
    console.log("ANSWER", answer)
    res.send(answer[0]);
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
        console.log(`Searching for: "${searchTerm}"`);
        
        if (!fuse) {
            console.log("Fuse is not initialized, setting up now");
            await setupFuse();
        }
        
        // Ensure we have data to search
        const cantos = await getCantos();
        if (cantos.length === 0) {
            console.log("No cantos found in database, reinitializing...");
            await setupFuse();
            return res.status(500).json({
                error: "No hay cantos en la base de datos para buscar"
            });
        }
        
        console.log(`Realizando búsqueda con ${cantos.length} cantos disponibles`);
        
        // Realizar búsqueda manual para depuración
        console.log("Realizando búsqueda manual para depuración:");
        let manualMatches = 0;
        cantos.forEach(canto => {
            const titleMatch = canto.title.toLowerCase().includes(searchTerm.toLowerCase());
            const contentMatch = canto.content.toLowerCase().includes(searchTerm.toLowerCase());
            if (titleMatch || contentMatch) {
                manualMatches++;
                console.log(`- Match manual encontrado: ${canto.title} (ID: ${canto.id})`);
                if (titleMatch) console.log(`  - Coincidencia en título`);
                if (contentMatch) console.log(`  - Coincidencia en contenido`);
            }
        });
        console.log(`Búsqueda manual encontró ${manualMatches} coincidencias`);
        
        // Búsqueda con Fuse
        const results = fuse.search(searchTerm);
        console.log(`Fuse encontró ${results.length} resultados para "${searchTerm}"`);
        
        if (results.length > 0) {
            console.log("Primer resultado:", JSON.stringify(results[0].item, null, 2));
            console.log("Puntuación:", results[0].score);
        } else if (manualMatches > 0) {
            console.log("ADVERTENCIA: La búsqueda manual encontró coincidencias pero Fuse no encontró ninguna");
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
    } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({
            error: "An error occurred while searching",
            message: error instanceof Error ? error.message : String(error)
        });
    }
});

// DB Setup
async function prepareDb() {
    try {
        console.log("Preparing database...");
        await db.run(
            "CREATE TABLE IF NOT EXISTS cantos (title TEXT NOT NULL, id TEXT PRIMARY KEY, nh INTEGER, content TEXT, type TEXT)"
        );
        
        console.log("Fetching cantos from Prisma...");
        const res = await prisma.cantos.findMany();
        console.log(`Found ${res.length} cantos in Prisma database`);
        
        if (res.length === 0) {
            console.warn("No cantos found in Prisma database. Search functionality will not work properly.");
            return;
        }
        
        console.log("Inserting cantos into SQLite database...");
        for (const row of res) {
            const query = db.query(
                "INSERT OR REPLACE INTO cantos (id, title, type, nh, content) VALUES (?, ?, ?, ?, ?)"
            );
            await query.run(row.id, row.title, row.type, row.nh, row.content);
        }
        
        // Verify data was inserted correctly
        const verifyQuery = db.query("SELECT COUNT(*) as count FROM cantos");
        const result = await verifyQuery.get();
        const count = result ? (result as {count: number}).count : 0;
        console.log(`Successfully inserted ${count} cantos into SQLite database`);
    } catch (error) {
        console.error("Error preparing database:", error);
    }
}
async function getCantos(id?: string):Promise<Canto[]> {
    try {
        if (id) {
            const query = db.query("SELECT * FROM cantos WHERE id = ?");
            const result = await query.all(id);
            return result.length > 0 ? [result[0] as Canto] : [];
        } else {
            const query = db.query(
                "SELECT id, title, nh, type, content FROM cantos ORDER BY nh"
            );
            const results = await query.all();
            console.log(`Retrieved ${results.length} cantos from database`);
            return results as Canto[];
        }
    } catch (error) {
        console.error("Error fetching cantos:", error);
        return [];
    }
}