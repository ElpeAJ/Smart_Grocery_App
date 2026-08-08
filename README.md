# Smart Grocery Ecosystem: Multi-Tier Architecture & Secure RBAC System

<img width="415" height="867" alt="Shop 2" src="https://github.com/user-attachments/assets/71782253-2fdb-4bd9-8d9f-055450eb694f" />
<img width="411" height="867" alt="Chat History" src="https://github.com/user-attachments/assets/b1514165-ff50-4b11-9292-52adfcfb0aeb" />

## 📌 Project Overview
This repository contains the complete codebase for the **Smart Grocery Application Ecosystem**, a multi-tier cross-platform solution developed as a BSc Final Year Capstone Project. The project features a distinct structural decoupling between its data management infrastructure (`backend`) and its client-facing presentation layer (`smart-grocery-mobile`). 

The architecture is explicitly engineered to handle secure, multi-role client interactions, data isolation rules, and transactional input sanitation, modeling a robust enterprise software ecosystem.

## 📱 Application Interface
<img width="414" height="865" alt="Pick Order" src="https://github.com/user-attachments/assets/c529d763-e33e-4715-83bd-673176c41705" />
<img width="412" height="867" alt="Staff Report" src="https://github.com/user-attachments/assets/29a0c1f0-4e6c-4bf6-91b3-9b9a697fb19b" />

## 🏛️ System Architecture & Engineering Patterns

### 1. Structural Separation of Concerns (SoC)
The application architecture enforces strict decoupling layers:
* **`/backend` Infrastructure:** Centralizes relational data storage schemas, API route mapping, and core server-side orchestration logic.
* **`/smart-grocery-mobile` Client:** Contains the mobile presentation layers, state machines, and view rendering models that interact asynchronously with the backend over secure endpoints.

### 2. Role-Based Access Control (RBAC) & Identity Security
To manage variable multi-role access privileges safely, the system enforces a strict identity protocol layout:
* **Multi-User Interface Matrices:** Renders tailored interface workflows based on active user tokens (e.g., Customers, Store Managers, Delivery Logistics Agents).
* **Data Privilege Boundaries:** Prevents privilege escalation and unauthorized data leaks by isolating user permissions at the database transaction query layer.

### 3. Relational Database Design & Structural Validation
The backend relies on structured database configurations designed to protect against common data integrity failures:
* **Strict Input Sanitation:** Intercepts and parses runtime parameters before query evaluation to eliminate injection risks.
* **Referential Integrity Constraints:** Employs precise foreign key mapping cascades and normalization paradigms across relational database tables to prevent record corruption.
* **BPMN/UML Modeling Principles:** Modeled using structured business process modeling notation and system state diagrams to optimize tracking pipelines.

## 🛠️ Technical Stack & Tools
* **System Architecture:** Full-Stack Decoupled Client-Server Ecosystem
* **Frontend Delivery:** Mobile Framework Architectures (located in `/smart-grocery-mobile`)
* **Backend Runtime & Data Handling:** Microservices API Handling (located in `/backend`)
* **Data Storage Engine:** Relational Database Architectures (MySQL / SQLite / PostgreSQL / Oracle compatibility)
* **API Ingestion Frameworks:** RESTful API Design Patterns, Structural JSON Payload Exchange
* **Production Environments & Deployments:** Live Web Microservices (Vercel Production Deployment)

## 📋 Comprehensive Data & Logic Pipeline
1. **Request Ingestion:** The client-side application initializes a session request, appending authenticated user role metadata.
2. **Gateway Verification:** The backend architecture parses incoming tokens to check security bounds before executing functions.
3. **Database Transaction:** Validated triggers invoke optimized CRUD operations on the isolated relational database engine.
4. **Payload Serializer:** Relational data columns are mapped into predictable, lightweight JSON array matrices.
5. **State Hydration:** The mobile engine captures the incoming HTTP response stream and instantly updates active layout views.

## ⚙️ Project Installation & Execution Protocols

This repository is split into independent subsystems. To operate or review the components locally, execute the following pipelines:

### 1. Fork and Clone the Architecture
1. Navigate to the top-right corner of this repository page and click the **Fork** button to create an independent copy under your GitHub account.
2. Open your local terminal environment and clone your newly forked repository:
   ```bash
   git clone https://github.com
   cd Smart_Grocery_App
   ```

### 2. Backend Setup & Run Environment
```bash
cd backend
# Execute your local environment configuration or server init commands here
# Command to run: uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
```

### 3. Mobile Client Compilation
```bash
cd ../smart-grocery-mobile
# Initialize dependencies and target mobile simulator scripts
# Command to run: npx expo start -- iOS OR npx expo start -- android
```

---
*Developed as a premier BSc Final Year Capstone Project, exploring scalable systems engineering, multi-role security models, and relational data architecture.*
