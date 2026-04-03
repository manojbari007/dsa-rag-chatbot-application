# 🧠 DSA Expert Chatbot

A high-performance **Retrieval-Augmented Generation (RAG)** chatbot engineered specifically to serve as a Data Structures & Algorithms learning companion. The application leverages State-of-the-Art Language Models and blazing-fast inference hardware to query textbook-level knowledge efficiently.

![DSA Expert Chatbot UI](https://github.com/manojbari007/dsa-expert/assets/placeholder.png)

## 🚀 Tech Stack

### Generative AI & RAG Pipeline
* **[Groq SDK](https://groq.com/)**: Serves as the core reasoning engine. Specifically utilizing `llama-3.3-70b-versatile` to provide lightning-fast, high-quality generated answers.
* **[Google Generative AI](https://aistudio.google.com/)**: Uses `gemini-embedding-001` (768 dimensions) to generate highly accurate vector representations of the DSA dataset.
* **[Pinecone](https://www.pinecone.io/)**: A fully managed vector database used to store embeddings and quickly perform semantic search and nearest-neighbor context retrieval.
* **[LangChain](https://js.langchain.com/)**: Used for document extraction (`PDFLoader`) and chunking (`RecursiveCharacterTextSplitter`) on raw academic materials.

### Application Architecture
* **Backend**: **Node.js** with **Express.js** providing a robust streaming API (Server-Sent Events) for real-time inference responses.
* **Frontend**: Highly responsive, dynamic Vanilla **JavaScript / HTML / CSS** application featuring modern UI/UX design (inspired by rich web aesthetics with Inter font and CSS variables), local storage history, markdown rendering, and animated typing indicators.

## ⚙️ How it Works under the Hood

The application follows an advanced modular RAG architecture:

1. **Document Ingestion (`index.js`)**:
   - Parses massive DSA PDFs.
   - Chunks text iteratively with specific 1000-character overlaps.
   - Generates vector embeddings concurrently and explicitly upserts them into a designated Pinecone serverless index.
2. **Query Refinement (`server.js`)**: 
   - A standalone `llama-3.3-70b` LLM first assesses the user's input alongside conversational history, converting context-dependent phrases into standalone search queries.
3. **Retrieval**: 
   - The standalone query is instantly embedded through Gemini and fetched against Pinecone.
4. **Answer Generation**:
   - The augmented context + the original history are presented to the primary `llama` inference engine to synthesize an educational, purely contextual explanation, streaming actively toward the client.

## 🛠️ Usage Setup

**Prerequisites:**
You will need API keys for:
- [Groq](https://console.groq.com/keys) (LLM engine)
- [Google AI Studio](https://aistudio.google.com/) (Embeddings)
- [Pinecone](https://app.pinecone.io/) (Vector Database)

**1. Clone the repository**
```bash
git clone https://github.com/manojbari007/dsa-expert.git
cd dsa-expert
```

**2. Install Dependencies**
```bash
npm install
```

**3. Environment Variables**
Create a `.env` file referencing the given keys:
```env
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=your_index
PORT=3000
```

**4. Data Ingestion (Optional)**
Place your textbook (e.g., `dsa.pdf`) into the `/data` folder, then run the indexing utility to populate Pinecone:
```bash
node index.js
```

**5. Start the Server**
```bash
node server.js
```
Navigate to `http://localhost:3000` to interact with your AI companion!
