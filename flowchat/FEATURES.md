# FlowAI - Feature Guide & Workflow Examples

FlowAI is a no-code, drag-and-drop virtual assistant builder. Instead of writing YAML files and Python code by hand, you describe what you want in plain English and FlowAI generates everything for you.

---

## Table of Contents

1. [Story Builder - Generate a RASA Assistant from Plain English](#1-story-builder---generate-a-rasa-assistant-from-plain-english)
2. [Train & Launch a Virtual Assistant](#2-train--launch-a-virtual-assistant)
3. [Edit Generated RASA Files](#3-edit-generated-rasa-files)
4. [Visual Flow Canvas - Drag & Drop Conversation Design](#4-visual-flow-canvas---drag--drop-conversation-design)
5. [Generate a Flow from Natural Language](#5-generate-a-flow-from-natural-language)
6. [RAG Document Upload & Querying](#6-rag-document-upload--querying)
7. [Build RAG-Powered Flows](#7-build-rag-powered-flows)
8. [Build LLM-Powered Flows](#8-build-llm-powered-flows)
9. [Conditional Branching in Flows](#9-conditional-branching-in-flows)
10. [Flow Versioning & Management](#10-flow-versioning--management)
11. [Chat with a Flow](#11-chat-with-a-flow)
12. [Export & Duplicate Flows](#12-export--duplicate-flows)

---

## 1. Story Builder - Generate a RASA Assistant from Plain English

Write a story describing your assistant and FlowAI generates all 7 RASA NLU files automatically.

### Example

**Input (plain English story):**

```
I want a hotel booking assistant that:

1. Greets the user and asks how it can help
2. Understands when users want to book a room, cancel a booking, or ask about amenities
3. For booking: asks for check-in date, check-out date, number of guests, and room type
4. For cancellation: asks for the booking reference number and confirms cancellation
5. For amenities: provides info about pool, gym, spa, and restaurant
6. Handles fallback gracefully when it doesn't understand
```

**Output (7 generated files):**

| File | What It Contains |
|------|-----------------|
| `nlu.yml` | 8-15 training examples per intent (`book_room`, `cancel_booking`, `ask_amenities`, `greet`, `goodbye`) |
| `stories.yml` | Conversation paths for each scenario (happy path + variations) |
| `rules.yml` | Deterministic behaviors (greet on start, fallback on `nlu_fallback`) |
| `domain.yml` | All intents, entities, slots, responses, actions, and session config |
| `config.yml` | NLU pipeline (tokenizer, featurizer, DIETClassifier) and policies |
| `endpoints.yml` | Action server endpoint configuration |
| `actions.py` | Custom action classes for booking logic, cancellation, and amenity lookup |

### How To

1. Open FlowAI and stay on the **Story Builder** tab (default view)
2. Optionally enter a project name (e.g. `hotel_booking_bot`)
3. Type your story in plain English in the text area
4. Click **Generate RASA Files**
5. All 7 files appear in the center File Viewer panel

---

## 2. Train & Launch a Virtual Assistant

After generating (or editing) RASA files, train a model and launch a live assistant.

### Example

```
Project: hotel_booking_bot
Training: rasa train  -->  model saved to trained_models/hotel_booking_bot/
Launch:   rasa run on port 5005  -->  assistant available at http://localhost:5005
```

### How To

1. Generate RASA files (see Workflow 1)
2. In the right-side **Train & Launch** panel, click **Train Model**
3. Watch training logs stream in the terminal viewer
4. Once training succeeds (green badge), enter a port number (default: 5005)
5. Click **Launch Assistant**
6. Your assistant is now live and accepting messages on that port
7. Click **Stop** to shut it down when done

---

## 3. Edit Generated RASA Files

Review and fine-tune any generated file before training.

### Example

Say the generated `nlu.yml` has this intent:

```yaml
- intent: book_room
  examples: |
    - I want to book a room
    - Reserve a room for me
    - I'd like to make a reservation
```

You can add more training examples directly in the editor:

```yaml
- intent: book_room
  examples: |
    - I want to book a room
    - Reserve a room for me
    - I'd like to make a reservation
    - Can I get a room for this weekend?
    - Book me a double room
    - I need accommodation for two nights
```

### How To

1. Click any of the 7 file tabs in the center panel (`nlu.yml`, `stories.yml`, etc.)
2. Edit the file content in the dark-themed editor
3. A dot indicator appears on modified tabs
4. Click **Save Changes** to persist your edits
5. Then proceed to train

---

## 4. Visual Flow Canvas - Drag & Drop Conversation Design

Build conversation flows visually by dragging node types onto a canvas and connecting them.

### Example

A customer support flow built on the canvas:

```
[Message: "Welcome! How can I help?"]
         |
   [Choice: "What do you need?"]
    /          |            \
[Billing]  [Technical]  [General]
    |          |            |
[Input:     [Input:      [Message:
 "What's    "Describe     "Visit our
  your       your          FAQ page"]
  account    issue"]
  number?"]
```

### Available Node Types

| Node | Purpose | Example Use |
|------|---------|-------------|
| **Message** | Display a bot message | `"Welcome! How can I help you today?"` |
| **Input** | Capture user text into a variable | Ask for name, store in `{{user_name}}` |
| **Choice** | Present options, branch based on selection | "Billing / Technical / General" |
| **Condition** | Evaluate an expression, branch true/false | `{{age}} >= 18` |
| **RAG Query** | Search uploaded documents for answers | Query: `"{{user_question}}"`, top 5 chunks |
| **LLM Response** | Generate a response using Claude | System: "You are a helpful agent", User: `"{{context}}"` |

### How To

1. Switch to the **Flow Canvas** tab in the top bar
2. Drag a node type from the left palette onto the canvas
3. Click a node to open its property editor on the right
4. Connect nodes by dragging from an output handle to an input handle
5. Click **Save** to persist your flow

---

## 5. Generate a Flow from Natural Language

Describe a conversation flow in plain English and get a visual flow generated on the canvas.

### Example

**Input prompt:**

```
Create a customer feedback bot that:
- Greets the user
- Asks them to rate their experience from 1-5
- If rating is 4 or 5, thanks them
- If rating is 1-3, asks what went wrong and apologizes
```

**Output:** A complete flow with Message, Input, Condition, and Message nodes auto-arranged on the canvas with all connections wired up.

### How To

1. Switch to **Flow Canvas** tab
2. Click the purple **Generate** button in the top bar
3. Enter your flow description in the modal
4. Optionally check "Use uploaded documents" to include RAG context
5. Click **Generate** and the flow appears on the canvas

---

## 6. RAG Document Upload & Querying

Upload PDF, DOCX, or TXT documents. FlowAI parses, chunks, embeds, and indexes them for retrieval.

### Example

**Upload:** `company_policy.pdf` (50-page HR handbook)

**Processing pipeline:**
```
PDF  -->  Parse text (PyPDF2)
     -->  Chunk into 512-char segments with 64-char overlap
     -->  Embed with sentence-transformers (all-MiniLM-L6-v2)
     -->  Store in ChromaDB vector database
```

**Query:** `"What is the vacation policy for new employees?"`

**Result:** Top 5 most relevant text chunks from the document, ranked by cosine similarity.

### How To

1. Switch to **Flow Canvas** tab
2. Click the **Documents** tab in the left panel
3. Drag-and-drop a file (PDF, DOCX, TXT, or MD) or click to upload
4. Wait for indexing to complete (status badge turns green with chunk count)
5. Documents are now available for RAG Query nodes and flow generation

---

## 7. Build RAG-Powered Flows

Create flows that answer questions from your uploaded documents.

### Example

A flow that answers HR policy questions:

```
[Message: "Hi! Ask me anything about company policy."]
    |
[Input: "What's your question?" --> store in {{user_question}}]
    |
[RAG Query: query="{{user_question}}", top_k=5 --> store in {{context}}]
    |
[LLM Response:
   system="Answer the question using only the provided context."
   user="Context: {{context}}\n\nQuestion: {{user_question}}"
   --> store in {{answer}}]
    |
[Message: "{{answer}}"]
```

### How To

1. Upload documents via the Document Library (see Workflow 6)
2. On the canvas, create this chain: Message --> Input --> RAG Query --> LLM Response --> Message
3. Configure the RAG Query node with `query_template: "{{user_question}}"` and `top_k: 5`
4. Configure the LLM Response node with a system prompt that grounds answers in the retrieved context
5. Use `{{variable_name}}` syntax to pass data between nodes

---

## 8. Build LLM-Powered Flows

Add Claude-powered intelligence anywhere in a conversation flow.

### Example

A travel recommendation assistant:

```
[Input: "Where do you want to travel?" --> {{destination}}]
    |
[Input: "What's your budget?" --> {{budget}}]
    |
[LLM Response:
   system="You are a travel advisor. Give 3 specific activity recommendations."
   user="Destination: {{destination}}, Budget: {{budget}}"
   model="claude-sonnet-4-6"
   --> store in {{recommendations}}]
    |
[Message: "Here are my top picks:\n{{recommendations}}"]
```

### How To

1. Drag an **LLM Response** node onto the canvas
2. Set the **System Prompt** (defines the AI's persona and rules)
3. Set the **User Template** (uses `{{variables}}` from earlier nodes)
4. Choose a model (defaults to `claude-sonnet-4-6`)
5. Set a **Response Slot** name to store the output for downstream nodes

---

## 9. Conditional Branching in Flows

Route conversations based on expressions evaluated against context variables.

### Example

An age verification flow:

```
[Input: "How old are you?" --> {{age}}]
    |
[Condition: "int({{age}}) >= 18"]
   /              \
 True            False
  |                |
[Message:        [Message:
 "Welcome!        "Sorry, you must
  Here's the      be 18 or older."]
  full menu."]
```

**Supported expressions:**
- Comparisons: `{{score}} > 80`, `{{status}} == 'active'`
- Logic: `{{age}} >= 18 and {{country}} == 'US'`
- Math: `int({{amount}}) * 1.1 > 100`

### How To

1. Drag a **Condition** node onto the canvas
2. Enter an expression using `{{variable}}` references
3. Connect the green (true) handle to one path
4. Connect the red (false) handle to another path
5. Expressions are evaluated safely using `simpleeval`

---

## 10. Flow Versioning & Management

Every time you save a flow, the previous version is automatically preserved.

### Example

```
Version 1: Initial greeting flow (3 nodes)
Version 2: Added choice node for department routing
Version 3: Added RAG query for knowledge base
Version 4: Refined LLM prompts
```

You can view any previous version and see how the flow evolved.

### How To

- Flows auto-version on every save (previous definition stored as a `FlowVersion`)
- View version history via the API: `GET /flows/{flow_id}/versions`
- Soft delete: deleted flows are hidden but recoverable
- All flows are stored in SQLite with full metadata

---

## 11. Chat with a Flow

Send messages to a published flow and get responses as the engine walks through nodes.

### Example

```
POST /chat
{
  "message": "I want to book a room",
  "flow_id": "hotel_booking",
  "context": {}
}

Response:
{
  "reply": "Great! What's your check-in date?",
  "node_id": "ask_checkin",
  "context": { "intent": "book_room" }
}
```

If no `flow_id` is provided, the intent classifier automatically routes the message to the best matching flow.

### How To

- Send a `POST /chat` request with a message
- The engine executes the current node and returns the bot reply plus updated context
- Pass the returned `node_id` and `context` back in subsequent requests to continue the conversation
- The classifier uses Claude for multi-flow routing with keyword fallback

---

## 12. Export & Duplicate Flows

Share flows as JSON or create copies for experimentation.

### Example

**Export** produces a standalone JSON file:

```json
{
  "id": "hotel_booking",
  "description": "Hotel room booking assistant",
  "start_node": "greet",
  "nodes": {
    "greet": {
      "type": "message",
      "text": "Welcome to Hotel FlowAI! How can I help?",
      "next": "main_choice"
    },
    "main_choice": {
      "type": "choice",
      "text": "What would you like to do?",
      "choices": {
        "Book a room": "booking_flow",
        "Cancel booking": "cancel_flow",
        "Amenities": "amenities_info"
      }
    }
  }
}
```

**Duplicate** creates a new flow with `_copy` suffix, ready for independent editing.

### How To

- **Export:** Click the **Export** button in the top bar to download the flow as a `.json` file
- **Duplicate:** Call `POST /flows/{flow_id}/duplicate` to create a copy
- **Import:** Load any exported JSON back onto the canvas

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy (async), SQLite |
| AI | Anthropic Claude API (Sonnet) |
| RAG | ChromaDB, sentence-transformers (all-MiniLM-L6-v2) |
| NLU | RASA (generated), Claude (intent routing) |
| Frontend | React 18, Vite, ReactFlow v12, Zustand, TailwindCSS |
| Layout | Dagre (automatic graph layout) |

## Quick Start

```bash
# Backend
cd flowchat
export ANTHROPIC_API_KEY=sk-your-key-here
pip install -r requirements.txt
uvicorn server:app --reload

# Frontend
cd flowchat/frontend
npm install
npm run dev
```

Open `http://localhost:5173` and start building.
