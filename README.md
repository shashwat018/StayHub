# StayHub — Website_Files
## VIT Pune PG Finder + Community Chat

---

## Structure

```
Website_Files/
├── backend/
│   ├── index.js              ← API server  (PORT 3000)  ← RUN THIS
│   ├── chat-server.js        ← Chat server (PORT 3001)  ← RUN THIS
│   ├── package.json
│   ├── data/
│   │   ├── pgs.json          ← 31 PGs from Dataset_04.csv
│   │   ├── reviews.json      ← Resident reviews
│   │   └── Dataset_04.csv    ← Original dataset
│   └── utils/
│       ├── scoringEngine.js
│       ├── amenityScorer.js
│       ├── rocWeighting.js
│       └── reviewUtils.js
│
└── frontend/
    ├── index.html            ← Home
    ├── listings.html         ← Browse PGs
    ├── fitscore.html         ← AI Match
    ├── pg-detail.html        ← PG Detail
    ├── chat.html             ← Community Chat
    ├── css/  (6 files)
    └── js/   (6 files)
```

---

## HOW TO RUN

### Step 1 — Install dependencies (once)
```bash
cd Website_Files/backend
npm install
```

### Step 2 — Terminal 1: Start API + Website
```bash
cd Website_Files/backend
node index.js
```

### Step 3 — Terminal 2: Start Chat
```bash
cd Website_Files/backend
node chat-server.js
```

### Step 4 — Open browser
```
http://localhost:3000
```

---

## Pages

| Page           | URL                                 |
|----------------|-------------------------------------|
| Home           | http://localhost:3000               |
| Browse PGs     | http://localhost:3000/listings.html |
| AI Match       | http://localhost:3000/fitscore.html |
| Community Chat | http://localhost:3000/chat.html     |
