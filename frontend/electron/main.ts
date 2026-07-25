import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null
let backendProcess: ChildProcess | null = null
const BACKEND_PORT = 8899
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

function getBackendPath(): string {
  const isDev = !app.isPackaged
  if (isDev) {
    const backendDir = path.join(__dirname, '..', '..', 'backend')
    return path.join(backendDir, 'run.py')
  }
  return path.join(process.resourcesPath, 'backend', 'run.py')
}

function startBackend(): void {
  const backendPath = getBackendPath()
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

  console.log(`Starting backend: ${pythonCmd} ${backendPath}`)

  backendProcess = spawn(pythonCmd, [backendPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(BACKEND_PORT),
    },
  })

  backendProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[backend] ${data.toString().trim()}`)
  })

  backendProcess.on('error', (err: Error) => {
    console.error('Failed to start backend:', err.message)
  })

  backendProcess.on('exit', (code: number | null) => {
    console.log(`Backend exited with code ${code}`)
    backendProcess = null
  })
}

function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill('SIGKILL')
      }
    }, 5000)
    backendProcess = null
  }
}

async function waitForBackend(): Promise<void> {
  const maxRetries = 30
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/health`)
      if (response.ok) {
        console.log('Backend is ready')
        return
      }
    } catch {
      // Backend not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.warn('Backend did not become ready in time')
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Telegram Document Downloader',
    backgroundColor: '#080808',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // In development, load from Vite dev server
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

// IPC handlers
ipcMain.handle('select-download-directory', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Directory',
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('get-platform', () => {
  return process.platform
})

ipcMain.handle('get-default-downloads', () => {
  return app.getPath('downloads')
})

ipcMain.handle('open-file', async (_event, filePath: string) => {
  try {
    await shell.openPath(filePath)
  } catch (err) {
    console.error('Failed to open file:', err)
  }
})

ipcMain.handle('open-folder', async (_event, folderPath: string) => {
  try {
    await shell.openPath(folderPath)
  } catch (err) {
    console.error('Failed to open folder:', err)
  }
})

ipcMain.handle('backend-url', () => BACKEND_URL)

app.whenReady().then(async () => {
  startBackend()
  createWindow()
  await waitForBackend()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  stopBackend()
})
