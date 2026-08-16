# Tiberian Odyssey

A browser-based real-time strategy skirmish game inspired by classic C&C-style gameplay. Built with vanilla HTML, CSS, and JavaScript (ES modules)—no build step or dependencies required.

Choose GDI or NOD and face an AI opponent on a staggered 2.5D map. Gather ore, expand your base, manage power, train an army, and destroy the enemy before they destroy you.

## Features

- **Staggered 2.5D rendering** — map-specific diamond-cell grids with half-cell row offsets, elevated terrain, and depth-sorted buildings and units
- **Map climates** — country-specific climate bands and palettes, from Icelandic cold zones to Cuba's tropical lowlands
- **Base building** — Construction Yard, Power Plant, Ore Refinery, Motor Pool, defenses, and superweapon-era towers
- **Unit production** — Harvesters, motorcycles, buggies, tanks, planes, nuclear rockets, and bio rockets
- **Economy & power** — harvest regenerating ore fields for credits; low power slows construction and training
- **Combat** — unit-vs-unit and unit-vs-structure combat with projectiles and health bars
- **Repairs** — select damaged friendly units or structures and use **REPAIR SELECTED** or press **R** to restore health for credits
- **Pathfinding** — A* navigation around rocks and structures
- **Enemy AI** — automated expansion, unit production, and periodic attack waves
- **Radar minimap** — tactical overview in the sidebar
- **Country-inspired maps** — choose Great Britain, Iceland, Japan, New Zealand, Cuba, or Italy; each map has its own land shape and base positions
- **Synth background music** — procedurally generated via the Web Audio API
- **Faction asymmetry** — GDI fields heavy armor, railguns, sonic emitters, and orbital strikes; NOD fields stealth, fast vehicles, obelisks, and toxic weapons

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
| **Escape / Cancel Building** | Cancel the active structure build or placement |
| **Sidebar tabs** | Switch between Structures and Units |
| **Build / Train buttons** | Queue construction or unit training |
| **Repair Selected / R** | Repair selected damaged friendly units or structures |
| **Save Game / Load Game** | Store or restore the current mission in browser local storage |
| **MUSIC toggle** | Enable or disable background music |

### Gameplay tips

1. Place your **Construction Yard** first, then add **Power Plants** before expanding.
2. Build an **Ore Refinery** to spawn a Harvester and start earning credits from ore fields (golden tiles).
3. Right-click ore tiles to send Harvesters mining; they return automatically to your refinery.
4. Depleted ore fields slowly recover, so you can revisit old fields instead of exhausting the map.
5. Train combat units from the **Barracks** tab and use right-click to attack enemy forces.
6. Watch the power bar—running low on power slows all production.

### Factions

- **GDI** — tougher Predator tanks, stronger Construction Yards, railgun tank fire, sonic emitter beams, and a durable power grid.
- **NOD** — cloaked Harvesters and Attack Bikes, faster Raider vehicles, higher-output Tiberium Reactors, Obelisks of Light, and lingering toxic clouds from strategic weapons.

## Project Structure

```
rts-game/
├── index.html          # Game shell and HUD markup
├── style.css           # UI styling
└── js/
    ├── game.js         # Main loop, camera, economy, win/loss
    ├── grid.js         # Staggered 2.5D map, rendering, A* pathfinding
    ├── input.js        # Mouse/keyboard input and unit commands
    ├── ui.js           # HUD, sidebar, minimap, tooltips
    ├── maps/           # Separate country-inspired map definitions
    ├── building.js     # Structure types and construction
    ├── unit.js         # Combat units and harvesters
    ├── ai.js           # Enemy skirmish AI
    ├── audio.js        # Web Audio synthesizer
    ├── entities.js     # Base entity class
    ├── races.js        # GDI/NOD identities, modifiers, and names
    └── tech.js         # Shared progression and production definitions
```

## Tech Stack

- **HTML5 Canvas** for rendering
- **ES6 modules** for code organization
- **Web Audio API** for procedural music
- No frameworks, bundlers, or package managers

## License

This project is licensed under the [MIT License](LICENSE).
