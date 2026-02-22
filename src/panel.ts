import * as vscode from 'vscode'
import { getConfig } from './config'
import { getWebviewContent } from './webview'

export class WeathrPanel {
  public static currentPanel: WeathrPanel | undefined
  private static _viewProvider: vscode.WebviewView | undefined

  private readonly _panel: vscode.WebviewPanel | undefined
  private readonly _view: vscode.WebviewView | undefined
  private _disposables: vscode.Disposable[] = []
  private _simulateCondition: string | null = null
  private _simulateNight: boolean = false

  // -------------------------------------------------------------------
  // Static factory – creates an editor-based panel
  // -------------------------------------------------------------------
  public static createOrShow(context: vscode.ExtensionContext, condition: string | null = null, night: boolean = false) {
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel._simulateCondition = condition
      WeathrPanel.currentPanel._simulateNight = night
      WeathrPanel.currentPanel._update()
      WeathrPanel.currentPanel._panel?.reveal()
      return
    }

    const panel = vscode.window.createWebviewPanel('vscode-weathr', 'Weathr 🌦️', vscode.ViewColumn.Two, {
      enableScripts: true,
      localResourceRoots: [context.extensionUri],
      retainContextWhenHidden: true
    })

    WeathrPanel.currentPanel = new WeathrPanel(panel, undefined, context, condition, night)
  }

  // -------------------------------------------------------------------
  // Static – attach to panel view (bottom panel / sidebar)
  // -------------------------------------------------------------------
  public static attachView(view: vscode.WebviewView, context: vscode.ExtensionContext) {
    WeathrPanel._viewProvider = view

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [context.extensionUri]
    }

    // If a panel instance already exists we hand it the view
    if (WeathrPanel.currentPanel) {
      WeathrPanel.currentPanel._setContent(view.webview)
    } else {
      WeathrPanel.currentPanel = new WeathrPanel(undefined, view, context, null, false)
    }
  }

  // -------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------
  private constructor(
    panel: vscode.WebviewPanel | undefined,
    view: vscode.WebviewView | undefined,
    private readonly _context: vscode.ExtensionContext,
    condition: string | null,
    night: boolean
  ) {
    this._panel = panel
    this._view = view
    this._simulateCondition = condition
    this._simulateNight = night

    this._update()

    const webview = this._getWebview()
    if (!webview) return

    // Handle messages from webview JS
    webview.onDidReceiveMessage(
      (message: { command: string; data?: unknown }) => {
        switch (message.command) {
          case 'refresh':
            this.refresh()
            break
          case 'error':
            vscode.window.showErrorMessage(`Weathr: ${message.data}`)
            break
          case 'info':
            vscode.window.showInformationMessage(`Weathr: ${message.data}`)
            break
        }
      },
      undefined,
      this._disposables
    )

    if (this._panel) {
      this._panel.onDidDispose(() => this.dispose(), null, this._disposables)
    }
  }

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------
  public refresh() {
    const wv = this._getWebview()
    if (wv) {
      wv.postMessage({ command: 'refreshWeather' })
    }
  }

  public simulate(condition: string | null, night: boolean) {
    this._simulateCondition = condition
    this._simulateNight = night
    const wv = this._getWebview()
    if (wv) {
      wv.postMessage({ command: 'simulate', condition, night })
    }
  }

  public updateConfig() {
    const cfg = getConfig()
    const wv = this._getWebview()
    if (wv) {
      wv.postMessage({ command: 'updateConfig', config: cfg })
    }
  }

  public dispose() {
    WeathrPanel.currentPanel = undefined
    this._panel?.dispose()
    for (const d of this._disposables) d.dispose()
    this._disposables = []
  }

  // -------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------
  private _getWebview(): vscode.Webview | undefined {
    return this._panel?.webview ?? this._view?.webview
  }

  private _setContent(webview: vscode.Webview) {
    const cfg = getConfig()
    webview.html = getWebviewContent(webview, this._context.extensionUri, cfg, this._simulateCondition, this._simulateNight)
  }

  private _update() {
    const wv = this._getWebview()
    if (!wv) return
    this._setContent(wv)
    if (this._panel) {
      this._panel.title = 'Weathr 🌦️'
    }
  }
}
