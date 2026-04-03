import * as dotenv from "dotenv";
dotenv.config();
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import readlineSync from "readline-sync";

// Initialize Groq (free, fast, generous rate limits)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Initialize Gemini embedding model (only 1 call per query - no rate limit issue)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = genAI.getGenerativeModel({
  model: "gemini-embedding-001",
});

const History = [];

async function transformQuery(question) {
  History.push({ role: "user", content: question });

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a query rewriting expert. Based on the provided chat history, rephrase the "Follow Up user Question" into a complete, standalone question that can be understood without the chat history.
    Only output the rewritten question and nothing else.`,
      },
      ...History,
    ],
    temperature: 0.3,
    max_tokens: 256,
  });

  History.pop();

  return response.choices[0].message.content;
}

async function chatting(question) {
  // Step 1: Rewrite the query for standalone understanding
  const queries = await transformQuery(question);

  // Step 2: Convert query to vector (single embedding call - no rate limit issue)
  const result = await embeddingModel.embedContent({
    content: { role: "user", parts: [{ text: queries }] },
    outputDimensionality: 768,
  });
  const queryVector = result.embedding.values;

  // Step 3: Search Pinecone for relevant context
  const pinecone = new Pinecone();
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

  const searchResults = await pineconeIndex.query({
    topK: 10,
    vector: queryVector,
    includeMetadata: true,
  });

  const context = searchResults.matches
    .map((match) => match.metadata.text)
    .join("\n\n---\n\n");

  // Step 4: Generate answer using Groq (Llama 3.3 70B)
  History.push({ role: "user", content: queries });

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You have to behave like a Data Structure and Algorithm Expert.
    You will be given a context of relevant information and a user question.
    Your task is to answer the user's question based ONLY on the provided context.
    If the answer is not in the context, you must say "I could not find the answer in the provided document."
    Keep your answers clear, concise, and educational.
      
      Context: ${context}`,
      },
      ...History,
    ],
    temperature: 0.5,
    max_tokens: 1024,
  });

  const answer = response.choices[0].message.content;

  History.push({ role: "assistant", content: answer });

  console.log("\n");
  console.log(answer);
}

async function main() {
  while (true) {
    const userProblem = readlineSync.question("\nAsk me anything--> ");
    if (
      userProblem.toLowerCase() === "exit" ||
      userProblem.toLowerCase() === "quit"
    ) {
      console.log("Goodbye!");
      break;
    }
    await chatting(userProblem);
  }
}

main();
