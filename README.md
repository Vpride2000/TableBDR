# TableBDR — Budget Management Table with PostgreSQL

A React + TypeScript + Webpack project with a collapsible budget table connected to PostgreSQL. Displays telecom and connectivity service budgets with expandable row groups.

## 🚀 Quick Start

### Prerequisites
- Node.js 20.18.2+
- PostgreSQL 13+ (local or remote)
- npm

### 1. Clone & Install
```bash
git clone https://github.com/Vpride2000/TableBDR.git
cd TableBDR
npm install
```

### 2. Configure Environment
Create `.env` file in root:
```env
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=pgpwd4habr
PGDATABASE=postgres
SERVER_PORT=4000
```

### 3. Start Backend (TypeScript)
```bash
npm run server
```
- Starts Express API on `http://localhost:4000`

### 4. Start Frontend (Development)
In another terminal:
```bash
npm run dev
```
- Webpack dev server on `http://localhost:3005`
- Hot Module Replacement (HMR) enabled
- Auto-proxies `/api/*` requests to backend

### 5. Open in Browser
```
http://localhost:3005
```

## 📦 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Webpack dev server (React HMR) |
| `npm run server` | Start TypeScript backend (Express + PostgreSQL) |
| `npm run test:db` | Test PostgreSQL connection |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |

## 🏗️ Project Structure

```
TableBDR/
├── src/
│   ├── App.tsx              # Main React component
│   ├── BudgetTable.tsx      # Collapsible budget table
│   ├── BudgetTable.css      # Table styles
│   ├── App.css
│   ├── index.css
│   ├── main.tsx             # React entry point
│   └── types.d.ts           # Type definitions
├── server/
│   └── index.ts             # Express API (TypeScript)
├── scripts/
│   └── testPostgresConnection.ts  # DB connection test
├── public/
│   └── icons.svg, favicon.svg
├── webpack.config.js        # Webpack configuration
├── tsconfig.json            # TypeScript config reference
├── tsconfig.app.json        # Frontend TypeScript config
├── tsconfig.server.json     # Backend TypeScript config
├── .env                     # Local environment (not in git)
└── package.json
```

## 🗄️ Database Schema

Проект использует доменную схему GN/PAO для бюджета связи:
- `GN_bdr`
- `GN_department`
- `GN_departament_object`
- `GN_dogovor`
- `GN_contractor`
- `GN_budget_network_item`
- `PAO__budget_network_item`

## 📋 Features

- ✅ React 19 + TypeScript
- ✅ Webpack bundler with dev server
- ✅ PostgreSQL integration
- ✅ Collapsible table rows (2 per group)
- ✅ Express backend API
- ✅ Full TypeScript (frontend + backend)
- ✅ Hot Module Replacement (HMR)
- ✅ ESLint + TypeScript strict mode

## 🔌 API Endpoints

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{ "status": "ok" }
```

## 🛠️ Development

### Modify Table Data
Edit `/server/index.ts` → `seed` array to add/modify budget entries.

### TypeScript Configuration
- **Frontend:** `tsconfig.app.json`
- **Backend:** `tsconfig.server.json`

### Build for Production
```bash
npm run build
```
Output: `dist/bundle.js`

## 📝 Notes

- `.env` is ignored by Git (keep secrets safe)
- `node_modules` and `dist` are excluded from version control
- Webpack proxy redirects `/api/*` to backend during dev

## 📄 License

MIT

