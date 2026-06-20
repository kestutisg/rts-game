# Tiberian Odyssey

A browser-based real-time strategy skirmish game inspired by classic C&C-style gameplay. Built with vanilla HTML, CSS, and JavaScript (ES modules)—no build step or dependencies required.

Play as the blue faction against an AI opponent on an isometric 2.5D map. Gather ore, expand your base, manage power, train an army, and destroy the enemy before they destroy you.

## Features

- **Isometric 2.5D rendering** — 120x120 diamond tile map with depth-sorted buildings and units
- **Base building** — Construction Yard, Power Plant, Ore Refinery, Motor Pool, defenses, and superweapon-era towers
- **Unit production** — Harvesters, motorcycles, buggies, tanks, planes, nuclear rockets, and bio rockets
- **Economy & power** — harvest ore for credits; low power slows construction and training
- **Combat** — unit-vs-unit and unit-vs-structure combat with projectiles and health bars
- **Pathfinding** — A* navigation around rocks and structures
- **Enemy AI** — automated expansion, unit production, and periodic attack waves
- **Radar minimap** — tactical overview in the sidebar
- **Synth background music** — procedurally generated via the Web Audio API

## Getting Started

Because the game uses ES modules, it must be served over HTTP (opening `index.html` directly from the filesystem will not work in most browsers).

From the project root, start a local server:

```bash
# Python 3
python3 -m http.server 8080

# Node.js (if npx is available)
npx serve .
```

Then open [http://localhost:8080](http://localhost:8080) in a modern browser.

## Controls

| Input | Action |
| --- | --- |
| **W / A / S / D** or **Arrow keys** | Pan the camera |
| **Mouse at screen edge** | Scroll the camera |
| **Left click** | Select a unit or building |
| **Left drag** | Box-select multiple units |
| **Right click** | Move, attack, or assign harvest orders |
| **Sidebar tabs** | Switch between Structures and Units |
| **Build / Train buttons** | Queue construction or unit training |
| **MUSIC toggle** | Enable or disable background music |

### Gameplay tips

1. Place your **Construction Yard** first, then add **Power Plants** before expanding.
2. Build an **Ore Refinery** to spawn a Harvester and start earning credits from ore fields (golden tiles).
3. Right-click ore tiles to send Harvesters mining; they return automatically to your refinery.
4. Train combat units from the **Barracks** tab and use right-click to attack enemy forces.
5. Watch the power bar—running low on power slows all production.

## Project Structure

```
rts-game/
├── index.html          # Game shell and HUD markup
├── style.css           # UI styling
└── js/
    ├── game.js         # Main loop, camera, economy, win/loss
    ├── grid.js         # Isometric map, rendering, A* pathfinding
    ├── input.js        # Mouse/keyboard input and unit commands
    ├── ui.js           # HUD, sidebar, minimap, tooltips
    ├── building.js     # Structure types and construction
    ├── unit.js         # Combat units and harvesters
    ├── ai.js           # Enemy skirmish AI
    ├── audio.js        # Web Audio synthesizer
    └── entities.js     # Base entity class
```

## Tech Stack

- **HTML5 Canvas** for rendering
- **ES6 modules** for code organization
- **Web Audio API** for procedural music
- No frameworks, bundlers, or package managers

## License

No license file is included yet. Add one if you plan to share or open-source the project.
