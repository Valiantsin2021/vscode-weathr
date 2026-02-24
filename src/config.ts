import * as vscode from 'vscode'

export interface WeathrConfig {
  latitude: number
  longitude: number
  autoLocation: boolean
  hideLocation: boolean
  hideHUD: boolean
  temperatureUnit: 'celsius' | 'fahrenheit'
  windSpeedUnit: 'kmh' | 'ms' | 'mph' | 'kn'
  precipitationUnit: 'mm' | 'inch'
  showLeaves: boolean
  animationSpeed: 'slow' | 'normal' | 'fast'
  theme: 'auto' | 'dark' | 'light',
  pixelMode: boolean
  locationMode: 'auto' | 'manual' | 'coordinates'
  manualLocation: string
}

export function getConfig(): WeathrConfig {
  const cfg = vscode.workspace.getConfiguration('vscode-weathr')
  return {
    latitude: cfg.get<number>('location.latitude', 36.5965),
    longitude: cfg.get<number>('location.longitude', 4.5198),
    autoLocation: cfg.get<boolean>('location.auto', true),
    hideLocation: cfg.get<boolean>('location.hide', false),
    hideHUD: cfg.get<boolean>('hideHUD', false),
    temperatureUnit: cfg.get<'celsius' | 'fahrenheit'>('units.temperature', 'celsius'),
    windSpeedUnit: cfg.get<'kmh' | 'ms' | 'mph' | 'kn'>('units.windSpeed', 'kmh'),
    precipitationUnit: cfg.get<'mm' | 'inch'>('units.precipitation', 'mm'),
    showLeaves: cfg.get<boolean>('showLeaves', false),
    animationSpeed: cfg.get<'slow' | 'normal' | 'fast'>('animationSpeed', 'normal'),
    pixelMode: cfg.get<boolean>('pixelMode', false),
    theme: cfg.get<'auto' | 'dark' | 'light'>('theme', 'auto'),
    locationMode: cfg.get<'auto' | 'manual' | 'coordinates'>('location.mode', 'auto'),
    manualLocation: cfg.get<string>('location.manual', '')
  }
}
