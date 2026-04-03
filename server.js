import * as dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// ─── Initialize Clients ─────────────────────────────
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.Index(process.env.PINECONE_INDEX_NAME);

console.log("✓ Clients initialized");

// ─── Embedding ───────────────────────────────────────
async function getEmbedding(text) {
  const result = await embeddingModel.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: 768,
  });
  return result.embedding.values;
}

// ─── Pinecone Search ─────────────────────────────────
async function searchPinecone(queryVector, topK = 8) {
  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });
  return (results.matches || [])
    .map((m) => m.metadata?.text || "")
    .filter(Boolean)
    .join("\n\n---\n\n");
}

// ─── Query Rewriting ─────────────────────────────────
async function rewriteQuery(question, history) {
  if (!history || history.length === 0) return question;

  const messages = [
    {
      role: "system",
      content:
        "You are a query rewriting expert. Rephrase the follow-up question into a standalone question. Only output the rewritten question.",
    },
    ...history.slice(-6).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    temperature: 0.2,
    max_tokens: 256,
  });
  return response.choices[0].message.content;
}

// ─── Chat API (Streaming) ────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // 1. Rewrite query
    const rewritten = await rewriteQuery(message, history);

    // 2. Get embedding & search
    const queryVector = await getEmbedding(rewritten);
    const context = await searchPinecone(queryVector);

    // 3. Build messages for Groq
    const systemPrompt = `You are a Data Structure and Algorithm Expert chatbot.
You will be given context retrieved from a DSA reference document and a user question.

**Rules:**
- Answer the user's question based ONLY on the provided context.
- If the answer is not in the context, say: "I couldn't find that in the document. Try rephrasing your question."
- Use clear formatting with bullet points, numbered lists, and code blocks when appropriate.
- Keep answers educational, concise, and well-structured.
- Use markdown formatting for better readability.

Context:
${context}`;

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-8).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      { role: "user", content: rewritten },
    ];

    // 4. Stream response from Groq
    const stream = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: chatMessages,
      temperature: 0.5,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Chat error:", err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// ─── Health Check ────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Start Server ────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🧠 DSA Expert is running at http://localhost:${PORT}\n`);
});
