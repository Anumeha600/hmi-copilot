<img width="1600" height="758" alt="WhatsApp Image 2026-09-11 at 5 57 39 AM" src="https://github.com/user-attachments/assets/67f7bd6a-af21-4965-be9c-9b7a55beaf21" />

                                                        <img width="1600" height="755" alt="WhatsApp Image 2026-09-11 at 5 58 00 AM" src="https://github.com/user-attachments/assets/3a9ba926-4a78-4cb9-9a5a-14495051c70e" />



# HMI Copilot


### AI-Powered Runtime HMI for Visualization, Investigation & Control of Industrial Machines

**Team:** First Byte  
**Members:** Sarthak V K · Anumeha Paul  
**Hackathon:** Schneider Electric HMI Hackathon  
**Problem Statement:** PS2 – Dynamic Screen at Runtime for Visualization & Control of Machines via HMI

🌐 **Live Demo:** https://hmi-copilot.vercel.app/hmi

📦 **GitHub:** https://github.com/Anumeha600/hmi-copilot

---

## 🚀 Overview

**HMI Copilot** is an AI-powered industrial Human-Machine Interface designed to help operators understand, investigate, and respond to machine conditions in real time.

Traditional HMIs primarily display machine values, alarms, and fixed screens. Operators still have to interpret the information, identify the likely cause, search for procedures, and decide what to do next.

HMI Copilot adds an intelligent contextual layer on top of the HMI.

Instead of simply displaying:

> "Motor Temperature High"

HMI Copilot helps answer:

> **What happened? Why did it happen? What evidence supports it? What should I do next?**

The system combines:

- Machine Context
- Edge Intelligence
- AI Reasoning
- Dynamic HMI Generation
- Contextual Guidance
- Golden Path Workflows
- Time Travel Replay
- Safety & Policy Guardrails

### Core Concept

```text
Machine Context
       ↓
AI Understands
       ↓
AI Investigates
       ↓
AI Explains / Guides
       ↓
HMI Adapts
       ↓
Operator Decides
```

---

# 🎯 Problem Statement

Industrial operators are often presented with large amounts of machine data but limited contextual assistance.

Common challenges include:

- Alarm overload and poor alarm prioritization
- Large volumes of real-time process data
- Difficulty identifying the root cause of an event
- Slow interpretation of abnormal machine behavior
- New operators lacking machine-specific knowledge
- Expertise remaining undocumented
- Static HMI screens that do not adapt to the current situation
- Operators needing to manually search through SOPs and historical data

These challenges increase response time and make machine operation highly dependent on individual operator experience.

---

# 💡 Proposed Solution

HMI Copilot introduces an intelligent runtime layer that connects machine context, AI reasoning, and the HMI.

### 1. Event Detection

The system continuously interprets machine telemetry and identifies abnormal conditions and important events.

### 2. Root Cause Analysis

Instead of only displaying an alarm, the Copilot investigates related machine variables and provides a likely cause with supporting evidence.

### 3. Contextual Guidance

The system provides machine-specific explanations, SOP information, recommended actions, and next steps.

### 4. Dynamic HMI

The interface adapts according to the current machine state and operator workflow instead of remaining a completely static screen.

### 5. Time Travel Replay

Operators can move backward through machine history to understand how an abnormal condition developed.

### 6. Data Reconstruction

Historical machine context can be reconstructed around an event to help operators understand the sequence of conditions.

### 7. Golden Path Guidance

The system presents a recommended operational sequence for handling a machine condition.

### 8. Standardization

Machine knowledge and troubleshooting logic can be represented consistently instead of depending entirely on individual operator experience.

### 9. AI-Assisted Control

The Copilot can recommend or prepare control actions while respecting safety policies, operator authorization, and existing machine interlocks.

The AI is **not designed as an unrestricted autonomous controller**.

---

# 🏭 Supported Machine Modes

The prototype supports multiple simulated industrial machines.

| Machine | Example Context |
|---|---|
| Pump Station P-101 | Pump, motor, pressure, flow and temperature |
| Drive Motor M-201 | Motor temperature, speed, torque and current |
| Transfer Conveyor C-301 | Conveyor speed, load and current |
| Air Compressor CP-401 | Compressor pressure, temperature and speed |
| Buffer Tank T-501 | Tank level, inlet/outlet flow and valve position |

The machines are currently simulated for demonstration and development.

---

# 🧠 Key Features

## Machine Context

HMI Copilot maintains contextual information about the active machine.

The context can include:

- Asset hierarchy
- Machine state
- Telemetry
- Process variables
- Alarms
- Events
- Component relationships
- Historical conditions
- Operator actions
- Current workflow

This allows the AI to reason about the machine rather than treating every question as an isolated request.

---

# 🤖 AI Copilot

The Copilot provides structured machine explanations.

Typical responses follow:

```text
FINDING
What is happening?

CAUSE
What is the likely cause?

EVIDENCE
What machine data supports the conclusion?

ACTION
What should the operator consider doing?

NEXT
What should be checked next?
```

This keeps AI output operationally useful rather than producing generic conversational responses.

---

# 🔍 Explain This Component

Operators can select a machine component and ask the Copilot to explain it.

For example:

```text
Drive Motor
      ↓
EXPLAIN THIS COMPONENT
      ↓
Machine Context
      ↓
Current State
      ↓
Relevant Alarm
      ↓
AI Explanation
```

The explanation is tied to the currently selected machine and component.

---

# ❓ Why Highlighted?

When the HMI highlights a machine component, the operator can ask:

**WHY HIGHLIGHTED?**

The Copilot explains why that component is relevant to the current machine condition.

This creates a direct relationship between:

```text
Machine Visualization
        ↓
Highlighted Component
        ↓
Machine Context
        ↓
AI Explanation
```

---

# 🚨 RUN INCIDENT

The prototype includes a controlled incident simulation for demonstration.

When the operator selects:

```text
RUN INCIDENT
```

the selected demo machine develops a simulated abnormal condition.

The workflow is:

```text
RUN INCIDENT
      ↓
Abnormal Telemetry
      ↓
Alarm / Event
      ↓
Machine Context Update
      ↓
AI Investigation
      ↓
Dynamic HMI Adaptation
      ↓
Component Highlight
      ↓
Golden Path / SOP Guidance
```

This allows the complete HMI Copilot workflow to be demonstrated without requiring a physical industrial machine.

---

# ⚙️ AUTO / MANUAL Modes

## AUTO

In AUTO mode, the machine simulator automatically evolves its telemetry and process behavior.

This demonstrates how HMI Copilot can continuously interpret machine conditions.

## MANUAL

In MANUAL mode, the operator can provide machine inputs through the HMI.

Examples include:

- Temperature
- Speed
- Pressure
- Flow
- Torque
- Current
- Load
- Level
- Valve position

The inputs are validated against machine limits.

Unsafe values trigger the Safety & Policy Guardrail instead of being silently accepted.

---

# 🖥️ Dynamic HMI

The HMI is designed as a runtime workspace rather than a conventional static dashboard.

The primary workspace is divided into three areas:

```text
┌──────────────────────────────────────────────────────────────┐
│                         HMI COPILOT                          │
├──────────────────┬──────────────────────┬────────────────────┤
│                  │                      │                    │
│ MACHINE CONTEXT  │    AI COPILOT       │   DYNAMIC HMI      │
│                  │                      │                    │
│ • Machine        │ • Investigation     │ • Machine View     │
│ • Telemetry      │ • Explanation       │ • Controls         │
│ • Alarms         │ • Root Cause        │ • Dynamic Panels   │
│ • Events         │ • Guidance          │ • Component Focus  │
│                  │                      │                    │
└──────────────────┴──────────────────────┴────────────────────┘
```

---

# 🏗️ Machine Visualization

The HMI includes an interactive 2.5D/3D-style machine visualization.

Operators can:

- Zoom
- Orbit
- Pan
- Reset
- Fit the machine view
- Hover over components
- Select components
- Highlight alarm-related components
- View component-specific information

The visualization is connected to the machine context and Copilot workflow.

---

# 📋 SOP & Golden Path

### SOP

**Standard Operating Procedure** represents the approved step-by-step procedure for handling a machine condition.

### Golden Path

The **Golden Path** represents the recommended operational sequence for efficiently responding to a specific condition.

Conceptually:

```text
Machine Event
     ↓
AI Investigation
     ↓
Recommended Golden Path
     ↓
Operator Guidance
     ↓
Verified Action
```

---

# ⏪ Time Travel Replay

Time Travel allows operators to investigate historical machine behavior.

Instead of looking only at the current machine state:

```text
CURRENT STATE
     ↓
What happened before?
     ↓
Previous telemetry
     ↓
Previous alarms
     ↓
Event progression
     ↓
Root-cause investigation
```

This helps operators understand how a fault developed rather than only seeing its final state.

---

# 🛡️ Safety & Policy Guardrails

Industrial control requires stronger safeguards than ordinary AI applications.

HMI Copilot therefore separates AI reasoning from unrestricted machine control.

The conceptual architecture is:

```text
Operator
   ↓
HMI
   ↓
AI Recommendation
   ↓
Safety & Policy Guardrail
   ↓
Operator Authorization
   ↓
Existing PLC / Machine Interlocks
   ↓
Control Action
```

The Copilot does not bypass machine safety mechanisms.

Unsafe or invalid operator inputs are rejected or routed through the guardrail workflow.

---

# 🧩 System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                  INDUSTRIAL DATA SOURCES                    │
│                                                             │
│ PLC Tags │ I/O │ Alarms │ Process Logs │ Asset Hierarchy   │
│ Documents │ Events │ Operator Actions                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  MACHINE CONTEXT MODEL                      │
│                                                             │
│ Machine State │ Telemetry │ Events │ Components │ History  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              EDGE INTELLIGENCE / CONTEXT ENGINE             │
│                                                             │
│ Rules │ Event Detection │ Context Processing │ Validation  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
┌───────────────────────────┐   ┌────────────────────────────┐
│     LOW-COMPUTE HMI       │   │     CENTRAL AI SERVER      │
│                           │   │                            │
│ Runtime Visualization     │   │ LLM Reasoning              │
│ Machine Controls          │   │ Root Cause Analysis        │
│ Local Context             │   │ Natural Language            │
└──────────────┬────────────┘   └──────────────┬─────────────┘
               │                               │
               └───────────────┬───────────────┘
                               ▼
                 ┌──────────────────────────┐
                 │       DYNAMIC HMI        │
                 │                          │
                 │ Visualization            │
                 │ Guidance                 │
                 │ Golden Path              │
                 │ Time Travel              │
                 │ AI Copilot               │
                 └──────────────────────────┘
```

---

# 🔄 Runtime Workflow

```text
1. Machine generates telemetry
              ↓
2. Context Engine interprets machine state
              ↓
3. Event / anomaly is detected
              ↓
4. Relevant machine components are identified
              ↓
5. Copilot investigates available context
              ↓
6. AI generates explanation and evidence
              ↓
7. HMI dynamically adapts
              ↓
8. Relevant component is highlighted
              ↓
9. Operator receives contextual guidance
              ↓
10. Guardrails validate control actions
              ↓
11. Machine context updates
              ↓
12. HMI continues adapting
```

---

# 🧠 Edge-First AI Architecture

HMI Copilot follows an edge-first design philosophy.

Not every operation requires a large language model.

```text
                 MACHINE DATA
                      │
                      ▼
              ┌───────────────┐
              │ EDGE CONTEXT  │
              │    ENGINE     │
              └───────┬───────┘
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
   Deterministic Tasks       AI Tasks
   ─────────────────        ──────────
   • Thresholds             • Explanation
   • Alarms                 • Investigation
   • State                  • Root Cause
   • Validation             • Natural Language
   • Context                • Guidance
          │                       │
          └───────────┬───────────┘
                      ▼
                 DYNAMIC HMI
```

This reduces unnecessary AI calls and allows lightweight operations to remain close to the HMI/edge.

---

# 🧰 Technology Stack

## Frontend

- React
- Next.js
- TypeScript
- Dynamic SVG HMI
- Interactive machine visualization

## Backend

- Node.js
- Next.js API Routes
- REST APIs
- Session-scoped runtime state

## AI

- Generative AI / LLM
- Groq API
- `openai/gpt-oss-120b`
- Edge-first deterministic context engine

## Data

- Machine telemetry
- PLC tags
- I/O
- Alarms
- Process logs
- Asset hierarchy
- Event history

## Industrial Integration Targets

The architecture is designed to integrate with industrial protocols and systems such as:

- OPC UA
- Modbus TCP
- MQTT
- REST APIs
- PLC tag systems

> **Current hackathon prototype:** machine data is simulated. Live PLC connectivity is an integration target and is not represented as currently implemented.

---

# 📁 Project Structure

```text
hmi-copilot/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── copilot/
│   │   │   └── hmi/
│   │   │
│   │   └── hmi/
│   │
│   ├── components/
│   │   └── hmi/
│   │       ├── HmiWorkspace
│   │       ├── MachineContextPanel
│   │       ├── CopilotPanel
│   │       ├── DynamicHmiPanel
│   │       ├── MachineView
│   │       ├── HmiRenderer
│   │       └── SafetyGuardrailDialog
│   │
│   ├── lib/
│   │   ├── machineContext/
│   │   │   ├── model.ts
│   │   │   ├── pumpStationEngine.ts
│   │   │   ├── sessionState.ts
│   │   │   ├── replay.ts
│   │   │   ├── hmiSchema.ts
│   │   │   └── goldenPath.ts
│   │   │
│   │   └── server/
│   │       ├── contextEngine.ts
│   │       ├── copilotReasoner.ts
│   │       ├── taskRouter.ts
│   │       ├── safetyPolicy.ts
│   │       └── hmiEngine.ts
│   │
│   └── ...
│
├── public/
├── package.json
├── README.md
└── ...
```

---

# 🔐 Environment Variables

Create a `.env.local` file in the project root:

```env
GROQ_API_KEY=gsk_your_actual_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

The API key must remain server-side.

**Never hardcode the API key into frontend code or commit `.env.local` to GitHub.**

---

# 💻 Local Development

## 1. Clone the repository

```bash
git clone https://github.com/Anumeha600/hmi-copilot.git
```

## 2. Enter the project

```bash
cd hmi-copilot
```

## 3. Install dependencies

```bash
npm install
```

## 4. Configure environment variables

Create:

```text
.env.local
```

and add:

```env
GROQ_API_KEY=gsk_your_actual_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

## 5. Start the development server

```bash
npm run dev
```

## 6. Open the HMI

```text
http://localhost:3000/hmi
```

---

# 🧪 Testing

Run the automated test suite:

```bash
npm test
```

Build the production application:

```bash
npm run build
```

The current verified implementation includes:

```text
63 automated tests
63 passing
0 failures
0 analyzer errors
```

---

# ☁️ Deployment

The prototype is deployed using Vercel.

### Production URL

```text
https://hmi-copilot.vercel.app/hmi
```

The project is connected to GitHub and can be automatically deployed from the repository.

### Required Environment Variables

```text
GROQ_API_KEY
GROQ_MODEL
```

---

# 🎬 Recommended Hackathon Demo Flow

The following flow demonstrates the complete HMI Copilot concept quickly.

## Step 1 — Open HMI

Open:

```text
https://hmi-copilot.vercel.app/hmi
```

---

## Step 2 — Select Machine

Start with:

```text
Pump Station P-101
```

Show:

- Machine context
- Telemetry
- Machine visualization
- Copilot
- Dynamic HMI

---

## Step 3 — Run Incident

Click:

```text
RUN INCIDENT
```

The machine begins developing a simulated abnormal condition.

Show:

```text
Telemetry changes
       ↓
Alarm appears
       ↓
Machine context updates
       ↓
Relevant component highlighted
```

---

## Step 4 — Ask the Copilot

Use:

```text
EXPLAIN THIS COMPONENT
```

or:

```text
WHY HIGHLIGHTED?
```

The Copilot provides contextual reasoning.

---

## Step 5 — Show Root Cause

Demonstrate:

```text
FINDING
CAUSE
EVIDENCE
ACTION
NEXT
```

This highlights how the system goes beyond a conventional alarm display.

---

## Step 6 — Show Golden Path

Open the recommended workflow and demonstrate how the operator is guided through the response.

---

## Step 7 — Show Time Travel

Move backward through the machine timeline and demonstrate how the operator can reconstruct the sequence leading to the event.

---

## Step 8 — Show Manual Mode

Switch to:

```text
MANUAL
```

Enter a machine parameter such as:

```text
Temperature
Speed
Pressure
```

Apply the value.

Demonstrate how machine context and the HMI respond.

---

## Step 9 — Demonstrate Safety Guardrail

Enter an unsafe value.

The system should not silently execute it.

Instead:

```text
Operator Input
      ↓
Safety Validation
      ↓
Guardrail
      ↓
Authorization
      ↓
Controlled Action
```

---

# 🏆 Why HMI Copilot?

### Traditional HMI

```text
Machine
   ↓
Data
   ↓
Alarm
   ↓
Operator interprets everything
```

### HMI Copilot

```text
Machine
   ↓
Machine Context
   ↓
Event Detection
   ↓
Investigation
   ↓
AI Explanation
   ↓
Contextual Guidance
   ↓
Dynamic HMI
   ↓
Operator Decision
```

The goal is not to replace the operator.

The goal is to make the operator:

- Faster
- Better informed
- More consistent
- Less dependent on undocumented expertise

---

# 📈 Potential Impact

## Reduced Alarm Overload

Prioritizes important events and connects them to machine context.

## Faster Troubleshooting

Provides likely causes and supporting evidence instead of forcing operators to manually correlate values.

## Better Operator Onboarding

Helps inexperienced operators understand machine behavior through contextual explanations.

## Knowledge Preservation

Transforms machine-specific troubleshooting knowledge into reusable workflows and guidance.

## Reduced HMI Engineering Effort

Dynamic HMI concepts can reduce dependence on manually creating separate static screens for every possible machine condition.

## Improved Decision Support

Provides relevant information at the moment the operator needs it.

---

# 🔮 Future Scope

The hackathon prototype can be extended toward real industrial deployment.

Potential future developments include:

- Live PLC connectivity
- OPC UA integration
- Modbus TCP integration
- MQTT industrial telemetry
- Real-time historian integration
- Digital twins
- More advanced root-cause reasoning
- Plant-wide asset hierarchy
- Multi-machine Copilot
- Voice-based industrial assistance
- Role-based operator permissions
- Audit trails
- Advanced predictive analytics
- Edge deployment on industrial hardware
- Human-in-the-loop control workflows
- Integration with existing Schneider Electric HMI and automation environments

---

# 🔒 Safety Philosophy

AI should not become an uncontrolled layer between an operator and an industrial machine.

Therefore, HMI Copilot follows:

```text
AI Recommendation
       ↓
Policy Validation
       ↓
Operator Authorization
       ↓
Machine Interlocks
       ↓
Controlled Action
```

The system is designed to support operators while preserving deterministic safety mechanisms.

---

# ⚠️ Prototype Disclaimer

HMI Copilot is a **hackathon prototype**.

The machine behavior and telemetry in the public demo are simulated.

The prototype does not claim to directly control physical industrial equipment or live PLCs.

Industrial deployment would require:

- Validated PLC integration
- Cybersecurity controls
- Safety certification where applicable
- Deterministic control logic
- Operator authorization
- Machine-specific interlocks
- Industrial testing and validation

---

# 👥 Team

## First Byte

### Sarthak V K

SRM Institute of Science and Technology

### Anumeha Paul

SRM Institute of Science and Technology

---

# 🏁 Hackathon

**Schneider Electric HMI Hackathon**

**Problem Statement:**  
PS2 – Dynamic Screen at Runtime for Visualization & Control of Machines via HMI

**Solution:**  
HMI Copilot

**Team:**  
First Byte

---

# 🌐 Links

### Live Demo

https://hmi-copilot.vercel.app/hmi

### GitHub Repository

https://github.com/Anumeha600/hmi-copilot

---

# 💭 Core Idea

> **Don't just show the operator what the machine is doing. Help the operator understand why, what it means, and what to do next.**

```text
              HMI COPILOT

        MACHINE CONTEXT
               ↓
        AI UNDERSTANDS
               ↓
        AI INVESTIGATES
               ↓
        AI EXPLAINS
               ↓
        AI GUIDES
               ↓
        HMI ADAPTS
               ↓
        OPERATOR DECIDES
```

---

## Built for the future of intelligent industrial HMIs.
