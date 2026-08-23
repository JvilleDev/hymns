import { test, expect } from "bun:test";

// ponytail: smoke test contra el servicio rpunt real; requiere que esté corriendo
const rpunctUrl = process.env.RPUNCT_URL || "http://127.0.0.1:8000";

test("rpunct accesible y puntúa texto", async () => {
  let res: Response;
  try {
    res = await fetch(`${rpunctUrl}/punctuate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hola mundo esta es una prueba de puntuacion automatica" }),
    });
  } catch (e: any) {
    throw new Error(`No se pudo conectar a rpunct en ${rpunctUrl}: ${e.cause?.code ?? e.message}`);
  }
  console.log(`rpunct ${rpunctUrl} → HTTP ${res.status}`);
  expect(res.ok).toBe(true);
  const data = await res.json();
  console.log("RPUNCT TEST RES:", data);
  expect(typeof data.text).toBe("string");
});
