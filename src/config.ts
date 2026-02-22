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
  theme: 'auto' | 'dark' | 'light'
}

export function getConfig(): WeathrConfig {
  const cfg = vscode.workspace.getConfiguration('vscode-weathr')
  return {
    latitude: cfg.get<number>('location.latitude', 52.52),
    longitude: cfg.get<number>('location.longitude', 13.41),
    autoLocation: cfg.get<boolean>('location.auto', true),
    hideLocation: cfg.get<boolean>('location.hide', false),
    hideHUD: cfg.get<boolean>('hideHUD', false),
    temperatureUnit: cfg.get<'celsius' | 'fahrenheit'>('units.temperature', 'celsius'),
    windSpeedUnit: cfg.get<'kmh' | 'ms' | 'mph' | 'kn'>('units.windSpeed', 'kmh'),
    precipitationUnit: cfg.get<'mm' | 'inch'>('units.precipitation', 'mm'),
    showLeaves: cfg.get<boolean>('showLeaves', false),
    animationSpeed: cfg.get<'slow' | 'normal' | 'fast'>('animationSpeed', 'normal'),
    theme: cfg.get<'auto' | 'dark' | 'light'>('theme', 'auto')
  }
}
