---
description: How to build and serve the Angular project with different environments
---

// turbo-all

# Build & Serve

## Serve locally (development)

```bash
ng serve
```

## Serve with a specific environment

```bash
ng serve --configuration=edge01
ng serve --configuration=edge02
ng serve --configuration=bl8
```

## Build for production

```bash
ng build --configuration=production
```

## Build for a specific environment

```bash
ng build --configuration=edge01
ng build --configuration=bl8
```

## Available configurations

| Config | API URL |
|--------|---------|
| `development` | `http://localhost:8082/` |
| `production` | `https://apibl7.binlogic.io/` |
| `edge01` | `https://edge01.shipedge.com/` |
| `edge02` | `https://edge02.shipedge.com/` |
| `edge03` | `https://edge03.shipedge.com/` |
| `edge04` | `https://edge04.shipedge.com/` |
| `bl8` | `https://apibl8.binlogic.io/` |
