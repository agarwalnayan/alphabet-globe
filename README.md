# 🌍 Alphabet Globe

A 3D interactive alphabet globe with hand gesture controls. Letters (GLB models) are arranged in a sphere using Fibonacci distribution. Navigate using hand gestures via your webcam.

---

## 📁 Project Structure
```
alphabet-globe/
├── server/          ← Express backend (port 5000)
│   ├── index.js
│   ├── .env
│   └── uploads/     ← GLB files stored here
└── client/          ← React frontend (port 3000)
    └── src/
        ├── components/
        │   ├── GlobeView.js    ← 3D experience
        │   └── AdminPanel.js   ← Upload manager
        └── hooks/
            └── useHandGestures.js  ← MediaPipe integration
```

---

## 🚀 Setup & Run

### 1. Install dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### 2. Start the backend
```bash
cd server
npm start
# → Running on http://localhost:5000
```

### 3. Start the frontend
```bash
cd client
npm start
# → Opens http://localhost:3000
```

---

## 🔐 Admin Panel

- Navigate to **Admin** tab in the top nav
- Password: `alphabet@123`
- Upload GLB files for any of the 26 letters
- Files should be named `A.glb`, `B.glb`, etc. (or single-letter files)
- Max file size: 50MB per file

---

## 🖐️ Hand Gestures

| Gesture | Action |
|---------|--------|
| ☝️ Point Left | Next letter |
| ☝️ Point Right | Previous letter |
| ✋ Open Palm | Stop / Pause auto-spin |
| ✊ Fist | Start auto-spin |

Gestures need to be held for ~12 frames (~0.4s) to trigger.

---

## 🧩 Tech Stack

- **Frontend**: React, Three.js, @react-three/fiber, @react-three/drei
- **Gesture**: MediaPipe Hands (loaded from CDN)
- **Backend**: Node.js, Express, Multer
- **3D Layout**: Fibonacci sphere distribution

---

## 🔧 Environment Variables (server/.env)

```
PORT=5000
UPLOAD_PASSWORD=alphabet@123
```
