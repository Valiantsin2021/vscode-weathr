import * as vscode from 'vscode'
import { WeathrPanel } from './panel'

export function activate(context: vscode.ExtensionContext) {
  console.log('vscode-weathr is now active!')

  // Register: Start command
  const startCmd = vscode.commands.registerCommand('vscode-weathr.start', () => {
    WeathrPanel.createOrShow(context)
  })

  // Register: Refresh command
  const refreshCmd = vscode.commands.registerCommand('vscode-weathr.refresh', () => {
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.refresh()
    } else {
      WeathrPanel.createOrShow(context)
    }
  })

  // Register: Simulate condition
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
      { label: '⛈️  Thunderstorm with Hail', value: 'thunderstorm-hail' },
      { label: '🌙  (Real weather data)', value: 'real' }
    ]

    const pick = await vscode.window.showQuickPick(conditions, {
      placeHolder: 'Select a weather condition to simulate',
      title: 'Weathr: Simulate Weather'
    })

    if (!pick) return

    const isNight = await vscode.window.showQuickPick(
      [
        { label: '☀️  Day', value: false },
        { label: '🌙  Night', value: true }
      ],
      { placeHolder: 'Day or Night?', title: 'Time of Day' }
    )

    const condition = pick.value === 'real' ? null : pick.value
    const night = isNight ? (isNight.value as boolean) : false

    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.simulate(condition, night)
    } else {
      WeathrPanel.createOrShow(context, condition, night)
    }
  })

  // Register: Toggle HUD
  const toggleHUDCmd = vscode.commands.registerCommand('vscode-weathr.toggleHUD', async () => {
    const config = vscode.workspace.getConfiguration('vscode-weathr')
    const current = config.get<boolean>('hideHUD', false)
    await config.update('hideHUD', !current, vscode.ConfigurationTarget.Global)
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.updateConfig()
    }
  })

  // Register: Toggle Leaves
  const toggleLeavesCmd = vscode.commands.registerCommand('vscode-weathr.toggleLeaves', async () => {
    const config = vscode.workspace.getConfiguration('vscode-weathr')
    const current = config.get<boolean>('showLeaves', false)
    await config.update('showLeaves', !current, vscode.ConfigurationTarget.Global)
    const state = !current ? 'enabled' : 'disabled'
    vscode.window.showInformationMessage(`Weathr: Falling leaves ${state}`)
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.updateConfig()
    }
  })

  // Listen to config changes
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('vscode-weathr') && WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel.updateConfig()
    }
  })

  // Auto-start if panel is registered as view
  const viewProvider = new WeathrViewProvider(context)
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('vscode-weathr.weatherView', viewProvider))

  context.subscriptions.push(startCmd, refreshCmd, simulateCmd, toggleHUDCmd, toggleLeavesCmd, configWatcher)
}

export function deactivate() {
  WeathrPanel.currentPanel?.dispose()
}

/**
 * WebView provider for the panel view
 */
class WeathrViewProvider implements vscode.WebviewViewProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    }
    WeathrPanel.attachView(webviewView, this.context)
  }
}
