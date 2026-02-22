# weathr VS Code Extension

A VS Code extension that brings the **weathr** terminal weather app experience into your editor — live weather animations in a canvas-based webview panel, powered by real-time data from [Open-Meteo](https://open-meteo.com/).

Inspired by the approach of [vscode-pets](https://marketplace.visualstudio.com/items?itemName=tonybaloney.vscode-pets).

## Features

- 🌦️ **Live weather animations** — rain, snow, thunderstorm, drizzle, fog, clear, partly-cloudy, overcast
- 🌅 **Day/night cycle** — stars, moon, fireflies at night; sun, birds, airplanes during the day
- 🏠 **Animated scene** — house with chimney smoke, trees, fence, road
- 🍂 **Falling leaves** — optional autumn leaves animation
- ⚡ **Thunderstorm lightning** — screen flashes, animated bolts
- 📍 **Auto-location** — detects your city via IP (ipinfo.io)
- 🌡️ **HUD overlay** — condition, temperature, wind, precipitation, coordinates
- 🎨 **Configurable** — all weathr config options exposed as VS Code settings

## Getting Started

1. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run `Weathr: Start Weather Animation`
3. Or find **Weathr** in the bottom panel tabs

## Commands

| Command | Description |
|---------|-------------|
| `Weathr: Start Weather Animation` | Open the animation panel |
| `Weathr: Refresh Weather` | Re-fetch weather from Open-Meteo |
| `Weathr: Simulate Weather Condition` | Pick any weather condition to preview |
| `Weathr: Toggle HUD` | Show/hide the status bar overlay |
| `Weathr: Toggle Falling Leaves` | Enable/disable autumn leaves |

## Configuration

All settings are under `vscode-weathr.*` in VS Code Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `location.latitude` | `52.52` | Latitude (–90 to 90) |
| `location.longitude` | `13.41` | Longitude (–180 to 180) |
| `location.auto` | `true` | Auto-detect via IP |
| `location.hide` | `false` | Hide coordinates in HUD |
| `hideHUD` | `false` | Hide weather HUD overlay |
| `units.temperature` | `celsius` | `celsius` or `fahrenheit` |
| `units.windSpeed` | `kmh` | `kmh`, `ms`, `mph`, `kn` |
| `units.precipitation` | `mm` | `mm` or `inch` |
| `showLeaves` | `false` | Autumn leaves animation |
| `animationSpeed` | `normal` | `slow`, `normal`, `fast` |
| `theme` | `auto` | `auto`, `dark`, `light` |

## Weather Conditions (Simulate)

- **Clear skies**: clear, partly-cloudy, cloudy, overcast
- **Precipitation**: fog, drizzle, rain, freezing-rain, rain-showers
- **Snow**: snow, snow-grains, snow-showers
- **Storms**: thunderstorm, thunderstorm-hail

## Privacy

When `location.auto` is `true`, a request is made to `ipinfo.io` to determine your approximate location. Set `location.auto` to `false` and configure latitude/longitude manually to avoid this.

## Development

```bash
cd vscode-weathr
npm install
npm run compile
# Press F5 in VS Code to launch Extension Development Host
```

## Credits

- Weather data: [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0)
- Concept: [weathr](https://github.com/Veirt/weathr) by Veirt
- Extension approach inspired by [vscode-pets](https://marketplace.visualstudio.com/items?itemName=tonybaloney.vscode-pets) by Anthony Shaw

## License

GPL-3.0-or-later
