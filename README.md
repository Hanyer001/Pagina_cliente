# Research Collaboration Portal

A responsive research portal prototype for exploring researchers, projects, research units and collaboration networks in a Universidad Alberto Hurtado context.

**Status:** academic frontend prototype using fictional data. The interface is in Spanish. This repository demonstrates interface and interaction design; it does not establish an official institutional deployment.

## What it demonstrates

- Researcher profiles with research areas, projects and academic background.
- Search and filters by faculty, topic and research unit.
- Project detail pages and research activity summaries.
- Interactive collaboration graphs built with vis-network.
- Public and internal presentation modes, including sample funding opportunities.
- Hash-based navigation, keyboard-accessible profile tabs and responsive layouts.

The public/internal switch changes what the interface displays. **It is not authentication or access control**: all demo data is delivered to the browser.

## Run locally

Requires Python 3 for a simple static server; no npm installation or build is needed.

```sh
git clone https://github.com/Hanyer001/Pagina_cliente.git
cd Pagina_cliente
python3 -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). On Windows, `py -m http.server 8000 --bind 127.0.0.1` can be used instead.

Serve over HTTP: opening `index.html` directly may prevent the browser from loading the JSON dataset. Internet access is needed for CDN libraries and Google Fonts.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, styles, navigation and external dependencies. |
| `app.js` | Rendering, search, filters, routing and graph interactions. |
| `datos_prueba.json` | Fictional entities, relationships and sample funding catalogs. |
| `assets/uah-logo.png` | Branding asset used by the prototype. |

Built with HTML, CSS, vanilla JavaScript, Bootstrap 5, Bootstrap Icons and vis-network. The data layer is separate from the rendering logic and uses in-memory indices for relationships.

## Review the prototype

Search for a researcher, apply a topic filter, open a profile and explore its network. Toggle public/internal view to inspect how project visibility changes, then resize the browser and try keyboard navigation.

There is no backend, login system or persistent editing workflow. A production portal would need authenticated access, server-side authorization and a verified institutional data source.
