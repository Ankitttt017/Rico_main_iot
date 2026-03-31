# IndusTrace: Industrial Traceability & PLC Integration System

IndusTrace is a high-performance, real-time manufacturing execution and traceability platform designed for seamless integration with industrial PLC hardware (Mitsubishi, Modbus TCP) and barcode scanning systems.

## 🚀 Key Features

- **Real-time Dashboard**: Dynamic circular KPI charts, shift-wise breakdown, and hourly production analytics.
- **Traceability Engine**: Interactive vertical timeline showing the "Genealogy" of every part processed.
- **PLC Handshake Logic**: Automatic interlock management with Mitsubishi SLMP and Modbus TCP support.
- **I/O Monitor**: Live signal telemetry, PLC connectivity testing, and secondary register control.
- **Device Management**: Centralized registry for Machines, Scanners, and QR Validation Rules.
- **Professional Reporting**: PDF/CSV export with advanced time-based filtering and part journey histories.

---

## 🏗 System Architecture

### Frontend (React + Vite)
- **State Management**: React Hooks (useState, useMemo, useCallback).
- **Communication**: Axios for REST APIs, Socket.IO-Client for real-time telemetry.
- **Styling**: Tailwind CSS with a custom "Industrial NOC" design system.
- **Visualization**: Recharts for analytics and custom SVG/Timeline components for traceability.

### Backend (Node.js + Express)
- **Protocols**: `modbus-serial` for Modbus TCP, custom TCP sockets for SLMP/Text protocols.
- **ORM**: Sequelize with MySQL for structured data persistence.
- **Real-time**: Socket.IO for pushing scan events and hardware health to the UI.
- **Security**: JWT-based authentication with role-based clearance (Admin, Engineer, Supervisor, Operator).

---

## 📂 Project Structure

```bash
Tracebility/
├── backend/                # Express server and industrial drivers
│   ├── src/
│   │   ├── controllers/    # Business logic (Dashboard, Traceability, etc.)
│   │   ├── services/       # PLC Drivers (Modbus, SLMP) and Scanners
│   │   ├── models/         # Database schemas (Machine, Part, Shift)
│   │   └── index.js        # Main entry point & Socket configuration
├── frontend/               # React Application
│   ├── src/
│   │   ├── pages/          # UI Modules (Dashboard, IoMonitor, etc.)
│   │   ├── components/     # Reusable UI Patterns (ConfirmModal, Layout)
│   │   ├── api/            # API Service Layer
│   │   └── utils/          # Formatting and configuration constants
└── PROJECT_DOC.md          # This documentation
```

---

## 🔧 Installation & Setup

### Prerequisites
- Node.js (v18+)
- MySQL Server (v8+)

### 1. Database Setup
Create a database named `traceability_db` and configure your credentials in `backend/.env`.
```env
DB_HOST=localhost
DB_USER=root
DB_PASS=yourpassword
DB_NAME=traceability_db
JWT_SECRET=your_secret_key
PORT=4000
```

### 2. Backend Initialization
```bash
cd backend
npm install
npm run dev
```

### 3. Frontend Initialization
```bash
cd frontend
npm install
npm run dev
```

---

## 📡 Scanner Communication Protocol

To ensure 100% data integrity in production, scanners must be configured to follow these specifications.

### 1. Overview
The backend provides a TCP Server (default port `5000`) that acts as a listener for barcode/QR scanners. Communication is asynchronous and newline-delimited.

### 2. Canonical Payload Formats
| Format | Pattern | Example |
| :--- | :--- | :--- |
| **Simple ID** | `<PART_ID>\n` | `ABC123\n` |
| **Delimited** | `<PART_ID>\|RESULT:OK\|REJECTION_BIN:0\n` | `ABC123\|RESULT:OK\|REJECTION_BIN:0\n` |
| **JSON** | `{"id":"<PART_ID>","bin":0}\n` | `{"id":"ABC123","bin":0}\n` |

### 3. Response Contract
- **ALLOW**: Backend returns `ALLOW\n` if all sequence and hardware guards pass.
- **BLOCK**: Backend returns `BLOCK\n` on any validation failure or PLC interlock.
- **Timeout**: The scanner should wait at least 800ms before timing out or retrying.

### 4. Fragmented Packet Handling
Payloads exceeding typical MTU or fragmented by network latency are reassembled by the server using the `\n` delimiter. Ensure your scanner append a suffix of `\n` or `\r\n`.

---

## 🛠 Hardware Integration Guide

### PLC Configuration
1. Navigate to **PLC Config**.
2. Select your Protocol (e.g., SLMP for Mitsubishi).
3. Map the **Trigger**, **Status**, and **Handshake** registers.
4. Use the **Memory Projection** diagram to verify hex/dec mapping.

### Scanner Mapping
1. Navigate to **Scanner Manager**.
2. Add scanner IP and Port.
3. Bind the scanner to a **Machine ID** from the registry.
4. Verify link status in **Scanner Monitor**.

---

## 📊 Analytics & Reporting
- **Overview**: Real-time OK/NG counts and Hourly Production.
- **Machine KPI**: Radial charts showing performance vs target.
- **Export**: Use the **Download** button in the Reports section to generate PDF certificates of production for specific batches or time ranges.

---

## 📜 Security & Roles
- **Admin**: Full system control including hardware re-configuration.
- **Engineer**: PLC tuning, QR pattern definition, and monitor access.
- **Supervisor**: Reporting, shift management, and traceability viewing.
- **Operator**: Live dashboard viewing and basic production tracking.

---
© 2026 IndusTrace Industrial Systems. All Rights Reserved.
