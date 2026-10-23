# Smart Factory Industrial Management Platform (SF-IMP)

## Overview
The Smart Factory Industrial Management Platform (SF-IMP) is a modern, Industry 4.0-ready full-stack application designed to manage, monitor, and securely orchestrate Operational Technology (OT) edge devices (like PLCs) from a centralized IT infrastructure. 

The platform features a zero-trust MQTT ingestion pipeline, a highly optimized time-series database architecture, strict Role-Based Access Control (RBAC), and a premium, responsive glassmorphism frontend for real-time visualization and command execution.

---

## System Architecture Flow

The data lifecycle within SF-IMP ensures high security and performance. Data flows from the factory floor to the dashboard through the following sequence:

1. **Edge Device (CODESYS PLC)**: The physical or virtual PLC gathers telemetry data (e.g., tank levels, speeds) and publishes a JSON payload to a highly specific, dynamically assigned MQTT topic (e.g., `factory/site_X/device_Y/telemetry`).
2. **MQTT Broker**: A local Mosquitto message broker receives the payload.
3. **Node.js Firewall (Ingestion Engine)**: The `ingest.js` microservice subscribes to `factory/#`. It intercepts the payload, extracts the topic, and checks the database cache. If the device is unregistered or unverified, the data is silently dropped (Zero-Trust).
4. **TimescaleDB**: Verified telemetry is immediately inserted into a PostgreSQL/TimescaleDB hypertable, optimized for high-frequency time-series inserts and aggregations.
5. **Express REST API**: The backend server (`server.js`) exposes secured RESTful endpoints, querying the database for historical and live telemetry.
6. **Frontend UI**: The Vanilla JS Single Page Application (SPA) fetches the API data and renders beautiful, real-time charts using Chart.js, while allowing authorized users to send MQTT commands back down the pipeline via interactive buttons and sliders.

---

## Core Components

### 1. Backend (Node.js & Express)
The core REST API powering the application. 
- **Security**: Built with `bcrypt` for secure password hashing and `jsonwebtoken` (JWT) for stateless session management.
- **Modularity**: Handles user authentication, OT device registration, audit logging, and telemetry data retrieval.

### 2. Database (PostgreSQL + TimescaleDB)
A robust hybrid database architecture:
- **Relational Data**: Standard PostgreSQL tables manage hierarchical enterprise data (`Users`, `Sites`, `Zones`, `Devices`) and immutable `Audit Logs`.
- **Time-Series Data**: A TimescaleDB extension converts the `telemetry_data` table into a hypertable, allowing the system to easily handle thousands of telemetry data points per second.

### 3. Security & RBAC
A strict 3-tier authorization system guarantees that users only have access to what they need:
- **Super Admin**: Complete system control (create sites, manage all users).
- **Manager**: Site-level control (manage zones, PLCs, and engineers within their assigned site).
- **Engineer**: Operational access (view dashboards, send commands to PLCs).
- **Audit Compliance**: User deletions are treated as "Soft Deletes" (`deleted_at` timestamp) to ensure that the historical Audit Log remains completely intact and immutable.

### 4. Operational Technology (OT) Management
- **Dynamic Registration**: When an administrator registers a new PLC, the backend generates cryptographically secure, randomized MQTT credentials (username/password) and unique routing topics.
- **HMI Canvas**: The frontend features an interactive, drag-and-drop Human Machine Interface (HMI) canvas. Users can map digital sliders and buttons to mirror the physical layout of their factory machines.

### 5. Frontend (Vanilla JS / HTML / CSS)
A fast, lightweight Single Page Application without the bloat of heavy frameworks.
- **Aesthetics**: Premium "Industry 4.0" dark-mode UI leveraging glassmorphism, subtle micro-animations, and CSS grid layouts.
- **Visualization**: Integrates `Chart.js` for dynamic, multi-axis telemetry tracking. Widgets automatically detect unique telemetry features (e.g., temperature, pressure, speed) based on the database schema.

### 6. Edge Device Integration (CODESYS Virtual PLC)
Designed to communicate directly with IEC 61131-3 standard PLCs.
- **Simulation**: Uses a CODESYS Virtual Control SL instance.
- **Bidirectional MQTT**: Utilizes the IIoT Libraries to publish JSON telemetry payloads (e.g., `{"niveau": 61.5}`) and uses the `MQTTSubscribe` block to receive JSON commands from the dashboard's interactive sliders.

---

## Setup & Execution

### Prerequisites
- Node.js (v18+)
- PostgreSQL (with TimescaleDB extension installed)
- Mosquitto MQTT Broker (running on port `1884` by default)

### Installation
1. Clone the repository and navigate to the root directory.
2. Install the backend dependencies:
   ```bash
   npm install
   ```
3. Ensure your PostgreSQL instance is running. Create a database named `smart_factory` and execute the schema setup scripts to initialize the tables and hypertables.
4. Start your local Mosquitto MQTT broker.

### Running the Services
The system requires two Node.js processes to run simultaneously:

1. **Start the Express API & Static Server**:
   ```bash
   node server.js
   ```
   *The server will start on `http://localhost:3000`.*

2. **Start the MQTT Ingestion Firewall**:
   Open a separate terminal and run:
   ```bash
   node ingestion.js
   ```

### Default Access
Open `http://localhost:3000` in your web browser. Log in using the default Super Admin credentials initialized in your database.
