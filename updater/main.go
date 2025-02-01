package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/go-git/go-git/v5"
	"github.com/joho/godotenv"
)

var frontendPort = 3000
var backendPort = 8000

func checkBun() bool {
	cmd := exec.Command("bun", "--version")
	err := cmd.Run()
	return err == nil
}

func installBun() {
	fmt.Println("Bun no está instalado. Procediendo con la instalación...")
	cmd := exec.Command("bash", "-c", "curl -fsSL https://bun.sh/install | bash && exec $SHELL")
	if err := cmd.Run(); err != nil {
		log.Fatal("Error al instalar Bun:", err)
	}
	fmt.Println("Bun instalado correctamente. Reinicia la terminal para aplicar los cambios.")
}

func getLatestCommit() string {
	repo, err := git.PlainOpen("../")
	if err != nil {
		log.Fatal("No se pudo abrir el repositorio:", err)
	}
	ref, err := repo.Head()
	if err != nil {
		log.Fatal("Error al obtener la referencia HEAD:", err)
	}
	return ref.Hash().String()
}

func runCommand(directory, command string, args ...string) error {
	cmd := exec.Command(command, args...)
	cmd.Dir = directory
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}

	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() {
		// fmt.Println(scanner.Text())
	}
	return cmd.Wait()
}

func findProcessOnPort(port int) int {
	var cmd *exec.Cmd
	if isWindows() {
		cmd = exec.Command("powershell", "-c", fmt.Sprintf("netstat -ano | findstr :%d", port))
	} else {
		cmd = exec.Command("bash", "-c", fmt.Sprintf("lsof -i :%d | awk 'NR==2 {print $2}'", port))
	}

	output, err := cmd.Output()
	if err != nil {
		return 0
	}

	pidStr := strings.TrimSpace(string(output))
	if pidStr == "" {
		return 0
	}

	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return 0
	}

	return pid
}

func killProcess(pid int) {
	if pid == 0 {
		return
	}

	var cmd *exec.Cmd
	if isWindows() {
		cmd = exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/F")
	} else {
		cmd = exec.Command("kill", "-9", strconv.Itoa(pid))
	}

	if err := cmd.Run(); err != nil {
		fmt.Printf("❌ No se pudo matar el proceso %d: %v\n", pid, err)
	} else {
		fmt.Printf("✅ Proceso %d eliminado correctamente.\n", pid)
	}
}

func prepareFrontend(latestCommit string) {
	updateStatus("Frontend", "⏳ Verificando si es necesario compilar...")

	distPath := "../frontend/.output"
	versionFile := "../frontend/version.txt"

	// Si la carpeta dist no existe, compilar
	if _, err := os.Stat(distPath); os.IsNotExist(err) {
		updateStatus("Frontend", "⚠️ No se encontró dist, compilando...")
		compileFrontend(latestCommit, versionFile)
		return
	}

	// Leer el último commit almacenado en version.txt
	storedCommit, err := os.ReadFile(versionFile)
	if err != nil || strings.TrimSpace(string(storedCommit)) != latestCommit {
		updateStatus("Frontend", "⚠️ Nueva versión detectada, compilando...")
		compileFrontend(latestCommit, versionFile)
	} else {
		updateStatus("Frontend", "✅ No es necesario compilar")
	}
}

func compileFrontend(latestCommit, versionFile string) {
	updateStatus("Frontend", "⏳ Instalando dependencias...")
	if err := runCommand("../frontend", "bun", "install"); err != nil {
		updateStatus("Frontend", "❌ Error en dependencias")
		return
	}

	updateStatus("Frontend", "⏳ Compilando...")
	if err := runCommand("../frontend", "bun", "run", "build"); err != nil {
		updateStatus("Frontend", "❌ Error al compilar")
		fmt.Println(err)
		return
	}

	// Guardar el commit actual en version.txt
	if err := os.WriteFile(versionFile, []byte(latestCommit), 0644); err != nil {
		updateStatus("Frontend", "⚠️ Error guardando versión")
	}

	updateStatus("Frontend", "✅ Listo para iniciar")
}

func prepareBackend() {
	updateStatus("Backend", "⏳ Preparando...")
	if err := runCommand("../backend", "bun", "install"); err != nil {
		updateStatus("Backend", "❌ Error en dependencias")
		return
	}
	updateStatus("Backend", "✅ Listo para iniciar")
}

func startFrontend() {
	pid := findProcessOnPort(frontendPort)
	if pid != 0 {
		fmt.Printf("⚠️  El puerto %d está en uso por el proceso %d. Matándolo...\n", frontendPort, pid)
		killProcess(pid)
	}

	updateStatus("Frontend", "⏳ Iniciando...")
	go func() {
		if err := runCommand("../frontend", "bun", "run", "preview"); err != nil {
			updateStatus("Frontend", "❌ Error al iniciar")
			return
		}
		updateStatus("Frontend", "✅ Activo en puerto "+strconv.Itoa(frontendPort))
	}()
}

func startBackend() {
	pid := findProcessOnPort(backendPort)
	if pid != 0 {
		fmt.Printf("⚠️  El puerto %d está en uso por el proceso %d. Matándolo...\n", backendPort, pid)
		killProcess(pid)
	}

	updateStatus("Backend", "⏳ Iniciando...")
	go func() {
		if err := runCommand("../backend", "bun", "--env-file=.env", "run", "start"); err != nil {
			updateStatus("Backend", "❌ Error al iniciar")
			return
		}
		updateStatus("Backend", "✅ Activo en puerto "+strconv.Itoa(backendPort))
	}()
}

func updateStatus(service, status string) {
	fmt.Printf("\r%s: %s\n", service, status)
}

func isWindows() bool {
	return os.PathSeparator == '\\'
}

func main() {
	if err := godotenv.Load("../backend/.env"); err != nil {
		log.Fatal("Error al cargar el archivo .env")
	}

	if !checkBun() {
		installBun()
	}

	latestCommit := getLatestCommit()

	// Preparamos el frontend y backend sincrónicamente
	prepareFrontend(latestCommit) // El frontend se prepara (compilación si es necesario)
	prepareBackend()              // El backend se prepara

	// Iniciamos el frontend y backend
	startFrontend()
	startBackend()

	// Mantener la ejecución
	for {
		time.Sleep(10 * time.Second)
	}
}
