# weathr VS Code Extension

A VS Code extension that brings the **weathr** terminal weather app experience into your editor — live weather animations in a canvas-based webview panel, powered by real-time data from [Open-Meteo](https://open-meteo.com/).

Inspired by the approach of [vscode-pets](https://marketplace.visualstudio.com/items?itemName=tonybaloney.vscode-pets).

## Features

- 🌦️ **Live weather animations** — rain, snow, thunderstorm, drizzle, fog, clear, partly-cloudy, overcast
- 🌅 **Day/night cycle** — stars, moon, fireflies at night; sun, birds, airplanes during the day
- 📍 **Flexible location** — auto-detect via IP, specify by town/postcode, or use coordinates
- 🏠 **Animated scene** — house with chimney smoke, trees, fence, road
- 🍂 **Falling leaves** — optional autumn leaves animation
- ⚡ **Thunderstorm lightning** — screen flashes, animated bolts
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
| `Weathr: Set Location by Town or Postcode` | Manually set location (e.g., "London" or "SW1A 1AA") |

## Configuration

All settings are under `vscode-weathr.*` in VS Code Settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `location.mode` | `auto` | Location mode: `auto` (IP), `manual` (town/postcode), `coordinates` |
| `location.manual` | `` | Manual location string (e.g., "London" or "SW1A 1AA"), used when mode is `manual` |
| `location.latitude` | `36.60` | Latitude (–90 to 90) |
| `location.longitude` | `4.52` | Longitude (–180 to 180) |
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

## Setting Location

You have three options to set your location:

### 1. Auto-detect (default)
Set `location.mode` to `auto` to detect your location using your IP address.

### 2. Manual location (town or postcode)
Run the **`Weathr: Set Location by Town or Postcode`** command and enter a location name:
- Town names: "London", "New York", "Tokyo"
- Postcodes: "SW1A 1AA", "10001", "100-0001"

The location will be automatically geocoded and weather will update immediately.

### 3. Manual coordinates
Set `location.mode` to `coordinates` and configure:
- `location.latitude` — latitude of your location
- `location.longitude` — longitude of your location

## Configuration Example

```json
{
  "vscode-weathr.location.mode": "manual",
  "vscode-weathr.location.manual": "Paris",
  "vscode-weathr.units.temperature": "celsius",
  "vscode-weathr.units.windSpeed": "kmh",
  "vscode-weathr.units.precipitation": "mm"
}
```

Or use coordinates-based location:

```json
{
  "vscode-weathr.location.mode": "coordinates",
  "vscode-weathr.location.latitude": 40.7128,
  "vscode-weathr.location.longitude": -74.0060,
  "vscode-weathr.units.temperature": "celsius",
  "vscode-weathr.units.windSpeed": "kmh",
  "vscode-weathr.units.precipitation": "mm"
}
```

## Geocoding

When using manual location mode, town/postcode names are converted to coordinates using the [Nominatim API](https://nominatim.org/) (free OpenStreetMap geocoding service). No API key is required.

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
