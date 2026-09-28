# Deployment Plan: Vercel (Frontend) + Render (Backend)

This document provides an end-to-end guide to deploy the **ITDR Management Platform** with the frontend hosted on **Vercel** and the Node.js backend hosted on **Render**.

---

## 1. Architecture & Deployment Strategy

```mermaid
flowchart LR
    User[User Browser] -->|HTTPS| Vercel[Vercel Frontend\n(Static / Rewrites)]
    Vercel -->|/api/* Proxy Rewrite| Render[Render Web Service\n(Node.js server.mjs)]
    Render -->|In-Memory / Catalog Store| BackendState[(ITDR State & Mocks)]
```

### Recommended Strategy: Vercel Proxy Rewrites
By configuring a rewrite rule in `vercel.json`, all frontend calls to `/api/*` are transparently forwarded from Vercel to Render:
- **Zero CORS Issues:** Frontend communicates with the same origin (`/api/...`).
- **Cookie Compatibility:** `HttpOnly; SameSite=Lax` session cookies work seamlessly without third-party cookie blocking.
- **No Frontend URL Refactoring:** `app.js` continues to use relative paths (`/api/session`, `/api/itdr/...`).

---

## 2. Prerequisites & Preparation

### 2.1 Codebase Structure
Ensure your repository is organized cleanly for both deployment platforms.

```
ITDR-Module/
├── itdr/
│   ├── package.json              <-- Required for Render & Vercel
│   ├── vercel.json               <-- Vercel proxy rewrite config
│   ├── public/                   <-- Static frontend files
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── app.js
│   │   └── ui/
│   └── src/                      <-- Backend service
│       ├── server.mjs
│       ├── itdrModule.mjs
│       └── ...
```

---

## 3. Required Configuration Files

### 3.1 Backend `package.json` (`itdr/package.json`)
Render needs a `package.json` to detect Node.js and run the start command.

Create `itdr/package.json`:
```json
{
  "name": "itdr-service",
  "version": "1.0.0",
  "type": "module",
  "description": "ITDR Phase 2 Management Platform Backend",
  "main": "src/server.mjs",
  "scripts": {
    "start": "node src/server.mjs",
    "test": "node --test tests/*.test.mjs"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["itdr", "bcm", "resilience"],
  "author": "",
  "license": "ISC"
}
```

### 3.2 Vercel Configuration (`itdr/vercel.json`)
Create `itdr/vercel.json` to route `/api/*` requests to your Render service while serving the static frontend from `public`:

```json
{
  "version": 2,
  "public": true,
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/api/:match*",
      "destination": "https://<YOUR-RENDER-SERVICE-NAME>.onrender.com/api/:match*"
    },
    {
      "source": "/itdr/(.*)",
      "destination": "/index.html"
    },
    {
      "source": "/itdr",
      "destination": "/index.html"
    },
    {
      "source": "/((?!api/).*)",
      "destination": "/$1"
    }
  ]
}
```

> [!NOTE]
> Replace `<YOUR-RENDER-SERVICE-NAME>` with your actual Render service name (e.g., `itdr-backend.onrender.com`).

### 3.3 Backend Port Handling (`src/server.mjs`)
Ensure `server.mjs` checks `process.env.PORT` (Render dynamically assigns this):

```javascript
// In src/server.mjs
const DEFAULT_PORT = Number(process.env.PORT || process.env.ITDR_PORT || 8787);
```

---

## 4. Step-by-Step Deployment Guide

### Phase 1: Deploy Backend on Render

1. **Push Code to Git**: Ensure your repository is pushed to GitHub or GitLab.
2. **Log in to Render**: Navigate to [dashboard.render.com](https://dashboard.render.com).
3. **Create New Web Service**:
   - Click **New +** -> **Web Service**.
   - Select your repository.
4. **Configure Web Service Settings**:
   - **Name**: `itdr-backend` (or custom name)
   - **Root Directory**: `itdr` (or leave blank if repository root is the `itdr` folder)
   - **Environment**: `Node`
   - **Build Command**: `npm install` (or leave empty if no external dependencies)
   - **Start Command**: `npm start` (or `node src/server.mjs`)
   - **Plan**: `Free`
5. **Add Environment Variables** (under *Environment* tab):
   - `NODE_ENV`: `production`
   - `ITDR_PORT`: `10000` (Render will override with `$PORT` automatically)
6. **Deploy**:
   - Click **Create Web Service**.
   - Wait for deployment logs to finish.
   - Verify health check by visiting:
     `https://<your-render-service>.onrender.com/api/health`
     Expected JSON response: `{"service":"bcm-itdr","phase":2,"itdrEnabled":true}`

---

### Phase 2: Deploy Frontend on Vercel

1. **Log in to Vercel**: Navigate to [vercel.com](https://vercel.com).
2. **Import Project**:
   - Click **Add New...** -> **Project**.
   - Select your GitHub / GitLab repository.
3. **Configure Project Settings**:
   - **Project Name**: `itdr-platform`
   - **Framework Preset**: `Other`
   - **Root Directory**: Select `itdr/public` (or `itdr` if using `vercel.json` in `itdr/`)
   - **Output Directory**: `.` (or `public`)
4. **Update `vercel.json` with your Render URL**:
   - Make sure `vercel.json` points the destination to `https://<your-render-service>.onrender.com/api/:match*`.
5. **Deploy**:
   - Click **Deploy**.
   - Once deployed, Vercel gives you an URL like `https://itdr-platform.vercel.app`.

---

## 5. Alternative Option: Direct Cross-Origin (CORS) Setup

If you prefer calling Render directly without Vercel rewrites:

1. **Configure CORS in Backend (`src/server.mjs`)**:
   Add headers to all responses:
   ```javascript
   res.setHeader("Access-Control-Allow-Origin", "https://your-frontend.vercel.app");
   res.setHeader("Access-Control-Allow-Credentials", "true");
   res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
   res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
   ```
2. **Handle Preflight OPTIONS requests**:
   ```javascript
   if (req.method === "OPTIONS") {
     res.writeHead(204);
     res.end();
     return;
   }
   ```
3. **Set Secure Cookies**:
   ```javascript
   "set-cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=None; Secure`
   ```
4. **Set Frontend API Base URL (`app.js`)**:
   ```javascript
   const API_BASE = "https://your-render-service.onrender.com";
   fetch(`${API_BASE}${path}`, { credentials: "include", ... })
   ```

*(The proxy rewrite method in Section 3 is recommended over CORS as it is faster and requires fewer changes).*

---

## 6. Pre-Launch Verification Checklist

| Test Item | Verification Action | Expected Outcome |
|---|---|---|
| **Health Check** | `GET https://<render-service>/api/health` | HTTP 200 with JSON payload |
| **Frontend UI** | Open `https://<vercel-project>.vercel.app` | UI loads clean styling and navbar |
| **Session Initialization** | Role switcher on frontend | HTTP 200 on `PUT /api/session`, cookie set |
| **Data Fetching** | Navigate to Applications / Dashboard | Catalogs and KPI cards populate |
| **Plan Draft & Submit** | Create plan draft, submit for review | Plan status updates to `SUBMITTED` |
| **Approver Workflow** | Switch role to Approver and approve | Version publishes and triggers bound test |

---

## 7. Troubleshooting & Free-Tier Notes

> [!TIP]
> **Render Free Tier Spin-Down:**
> Render free-tier services spin down after 15 minutes of inactivity. The initial request might take **30-50 seconds** to wake up the instance.
> *Workaround:* Use a free uptime monitor (e.g., UptimeRobot) to ping `/api/health` every 10 minutes.

> [!WARNING]
> **In-Memory Storage Note:**
> The current Phase 2 implementation stores data in-memory. Restarting the Render service resets modified plans to seeded default state. For persistence across restarts in production, migrate store to PostgreSQL / MongoDB in future phases.
