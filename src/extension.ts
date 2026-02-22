import * as vscode from 'vscode'
import { WeathrPanel } from './panel'

export function activate(context: vscode.ExtensionContext) {
  console.log('vscode-weathr is now active!')

  // ── Commands ────────────────────────────────────────────────────────────

  const startCmd = vscode.commands.registerCommand('vscode-weathr.start', () => {
    WeathrPanel.createOrShow(context)
  })

  const refreshCmd = vscode.commands.registerCommand('vscode-weathr.refresh', () => {
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.refresh()
    } else {
      WeathrPanel.createOrShow(context)
    }
  })

  const simulateCmd = vscode.commands.registerCommand('vscode-weathr.simulate', async () => {
    const conditions = [
      { label: '☀️  Clear', value: 'clear' },
      { label: '⛅  Partly Cloudy', value: 'partly-cloudy' },
      { label: '☁️  Cloudy', value: 'cloudy' },
      { label: '🌫️  Overcast', value: 'overcast' },
      { label: '🌁  Fog', value: 'fog' },
      { label: '🌦️  Drizzle', value: 'drizzle' },
      { label: '🌧️  Rain', value: 'rain' },
      { label: '🌨️  Freezing Rain', value: 'freezing-rain' },
      { label: '🌧️  Rain Showers', value: 'rain-showers' },
      { label: '❄️  Snow', value: 'snow' },
      { label: '🌨️  Snow Grains', value: 'snow-grains' },
      { label: '🌨️  Snow Showers', value: 'snow-showers' },
      { label: '⛈️  Thunderstorm', value: 'thunderstorm' },
      { label: '⛈️  Thunderstorm with Hail', value: 'thunderstorm-hail' }
    ]

    const pick = await vscode.window.showQuickPick(conditions, {
      placeHolder: 'Select a weather condition to simulate',
      title: 'Weathr: Simulate Weather'
    })
    if (!pick) {
      return
    }

    const timeOpts = [
      { label: '☀️  Day', value: false },
      { label: '🌙  Night', value: true }
    ]
    const timePick = await vscode.window.showQuickPick(timeOpts, {
      placeHolder: 'Day or Night?',
      title: 'Weathr: Time of Day'
    })

    const condition = pick.value === 'real' ? null : pick.value
    const night = timePick ? (timePick.value as boolean) : false

    ensurePanel(context)
    WeathrPanel.currentPanel?.simulate(condition, night)
  })

  const toggleHUDCmd = vscode.commands.registerCommand('vscode-weathr.toggleHUD', async () => {
    const cfg = vscode.workspace.getConfiguration('vscode-weathr')
    const cur = cfg.get<boolean>('hideHUD', false)
    await cfg.update('hideHUD', !cur, vscode.ConfigurationTarget.Global)
    WeathrPanel.currentPanel?.updateConfig()
  })

  const toggleLeavesCmd = vscode.commands.registerCommand('vscode-weathr.toggleLeaves', async () => {
    const cfg = vscode.workspace.getConfiguration('vscode-weathr')
    const cur = cfg.get<boolean>('showLeaves', false)
    await cfg.update('showLeaves', !cur, vscode.ConfigurationTarget.Global)
    vscode.window.showInformationMessage(`Weathr: Falling leaves ${!cur ? 'enabled' : 'disabled'}`)
    ensurePanel(context)
    WeathrPanel.currentPanel?.updateConfig()
  })

  // Opens a dedicated editor-tab panel (second column)
  const switchPanelCmd = vscode.commands.registerCommand('vscode-weathr.switchPanel', () => {
    WeathrPanel.createOrShow(context)
    vscode.window.showInformationMessage('Weathr: Opened as editor tab — drag it anywhere you like!')
  })

  // ── Config change watcher ──────────────────────────────────────────────
  const cfgWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('vscode-weathr')) {
      WeathrPanel.currentPanel?.updateConfig()
    }
  })

  // ── Pixel mode switch ─────────────────────────────────

  const togglePixelCmd = vscode.commands.registerCommand('vscode-weathr.togglePixelMode', async () => {
    const cfg = vscode.workspace.getConfiguration('vscode-weathr')
    const cur = cfg.get<boolean>('pixelMode', false)
    await cfg.update('pixelMode', !cur, vscode.ConfigurationTarget.Global)
    vscode.window.showInformationMessage(`Weathr: Pixel mode ${!cur ? 'enabled' : 'disabled'}`)
    ensurePanel(context)
    WeathrPanel.currentPanel?.updateConfig()
  })

  // ── Register both WebView providers ────────────────────────────────────

  // 1) Bottom panel view
  const bottomProvider = new WeathrViewProvider(context, 'panel')
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('vscode-weathr.weatherView', bottomProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  )

  // 2) Explorer view
  const explorerProvider = new WeathrViewProvider(context, 'explorer')
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('vscode-weathr.explorerView', explorerProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  )

  context.subscriptions.push(startCmd, refreshCmd, simulateCmd, toggleHUDCmd, toggleLeavesCmd, switchPanelCmd, cfgWatcher, togglePixelCmd)
}

export function deactivate() {
  WeathrPanel.currentPanel?.dispose()
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensurePanel(context: vscode.ExtensionContext) {
  if (!WeathrPanel.currentPanel) {
    WeathrPanel.createOrShow(context)
  }
}

/**
 * Shared WebviewViewProvider used for both the bottom panel and the sidebar.
 * Both register themselves on WeathrPanel so commands always reach whichever
 * instance is currently visible.
 */
class WeathrViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly placement: 'panel' | 'explorer'
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    }
    view.title = 'Weathr 🌦️'
    WeathrPanel.attachView(view, this.context)
  }
}
