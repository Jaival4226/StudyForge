# Study Forge 🧠

An autonomous, full-stack academic operating system that transforms disjointed study materials into a living, interactive knowledge graph. 

Study Forge ingests multi-modal educational content (YouTube lectures and local PDFs), extracts core concepts using LLMs, and maps them mathematically into a 3D-simulated spatial neural network called **Cortex**. It features RAG-powered chat, automated study artifact generation, and an adaptive daily review system.

## 🚀 Key Features

*   **Multi-Modal Ingestion Pipeline:** Automatically extracts and chunks text from local PDFs and YouTube URLs using `youtube_transcript_api` and `PyPDF2`.
*   **Cortex Knowledge Graph:** An autonomous agent that extracts concepts, merges identical entities via mathematical vector distance (ChromaDB), and infers relationships to render a D3-physics simulated node graph.
*   **Vector-Backed RAG Chat:** Ask questions directly to your workspace. The system pulls relevant context from ChromaDB and conversational memory from MongoDB to provide cited, accurate answers.
*   **Artifact Synthesis:** Automatically generate detailed Markdown Study Guides, interactive Flashcards, and auto-grading Quizzes directly from your uploaded materials.
*   **Spaced Repetition Engine:** A daily review system that tracks user mastery and dynamically schedules concept reviews based on retention performance.

## 🛠️ Technology Stack

**Frontend Layer:**
*   React 19 & Vite
*   Tailwind CSS (Custom Violet/Slate Academic Theme)
*   React Flow & D3-Force (Graph Rendering & Physics)
*   Framer Motion (Animations)

**Backend & AI Layer:**
*   Python & Django REST Framework (DRF)
*   Google Gemini API (`gemini-1.5-flash`)
*   SentenceTransformers (`all-MiniLM-L6-v2`)

**Database Architecture:**
*   **SQLite:** Relational storage for Workspaces, Documents, Artifacts, and Mastery telemetry.
*   **ChromaDB:** Persistent local vector storage for document semantic search and graph node embeddings.
*   **MongoDB:** NoSQL document storage for continuous workspace chat history.

---

## ⚙️ Local Development Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   Python 3.10+
*   Node.js & npm
*   MongoDB Community Server (running locally on port `27017`)

### 2. Backend Installation (Django)

Open a terminal in the root directory:

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install required Python dependencies
pip install django djangorestframework django-cors-headers chromadb sentence-transformers youtube-transcript-api PyPDF2 google-generativeai pymongo python-dotenv

# Create the environment file
touch .env

Open the .env file and add your Gemini API Key(s):
GEMINI_API_KEYS=your_api_key_here

Run database migrations and start the server:
python manage.py makemigrations workspaces
python manage.py migrate
python manage.py runserver

3. Frontend Installation (React/Vite)
Open a second terminal window and navigate to the frontend directory:

cd frontend

# Install Node modules
npm install

# Start the Vite development server
npm run dev
The frontend will run on http://localhost:5173 and communicate with the Django backend on http://localhost:8000.

📂 Project Architecture
workspaces/ingestion.py: Handles multi-modal chunking and timestamp generation for PDFs and Videos.

workspaces/vector_store.py: Manages ChromaDB collections, local persistence, and similarity matching algorithms.

workspaces/graph_engine.py: The Cortex backend. Extracts entities, merges via vector distance thresholds, and mathematically infers edge relationships.

workspaces/ai_engine.py: Orchestrates Google Gemini API calls with robust fallback, rotation, and streaming logic.

frontend/src/CortexPanel.jsx: Renders the D3-simulated knowledge graph, dynamically fetching nodes and applying conditional mastery formatting.

🔒 Security & Collaboration
Study Forge is multi-tenant capable. Users can register accounts, create isolated workspaces, and selectively invite collaborators by username. Workspaces are strictly walled off via DRF query filtering to ensure absolute data privacy.