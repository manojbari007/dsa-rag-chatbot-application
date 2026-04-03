import * as dotenv from "dotenv";
dotenv.config();
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { Embeddings } from "@langchain/core/embeddings";

// Custom embeddings class that supports outputDimensionality
class GeminiEmbeddings extends Embeddings {
  constructor({ apiKey, model, outputDimensionality }) {
    super({});
    const genAI = new GoogleGenerativeAI(apiKey);
    this.client = genAI.getGenerativeModel({ model });
    this.outputDimensionality = outputDimensionality;
  }

  async embedQuery(text) {
    const result = await this.client.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: this.outputDimensionality,
    });
    return result.embedding.values;
  }

  async embedDocuments(documents) {
    const results = [];
    // Very small batches to stay under free-tier API rate limits
    const batchSize = 5;
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);

      // Retry with exponential backoff on rate limit errors
      let retries = 0;
      const maxRetries = 5;
      while (true) {
        try {
          const batchResult = await this.client.batchEmbedContents({
            requests: batch.map((text) => ({
              content: { role: "user", parts: [{ text }] },
              outputDimensionality: this.outputDimensionality,
            })),
          });
          results.push(...batchResult.embeddings.map((e) => e.values));
          break;
        } catch (err) {
          retries++;
          if (retries > maxRetries) throw err;
          const delay = Math.pow(2, retries) * 5000; // 10s, 20s, 40s, 80s, 160s
          console.log(`  Rate limited, waiting ${delay / 1000}s before retry ${retries}/${maxRetries}...`);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      // Wait between batches to avoid rate limiting
      if (i + batchSize < documents.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return results;
  }
}

//load text data

async function indexDocument() {
  const PDF_PATH = "./data/dsa.pdf";
  const pdfLoader = new PDFLoader(PDF_PATH);
  const rawDocs = await pdfLoader.load();
  console.log("PDF Loaded");

  //step2 chunking
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const allChunks = await textSplitter.splitDocuments(rawDocs);
  // Filter out empty or whitespace-only chunks
  const chunkedDocs = allChunks.filter(
    (doc) => doc.pageContent && doc.pageContent.trim().length > 0
  );
  console.log(`chunking completed: ${chunkedDocs.length} non-empty chunks out of ${allChunks.length} total`);

  //step3 vector embedding model (convert chunk in to vector)
  // Using gemini-embedding-001 with outputDimensionality=768 to match Pinecone index
  const embeddings = new GeminiEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: "gemini-embedding-001",
    outputDimensionality: 768,
  });
  console.log("embedding model configured");

  //step-4 database configure
  //initialize pinecone client
  const pinecone = new Pinecone();
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  console.log("Pinecone configured");

  //step5 store vectors in pinecone
  // Manually embed + upsert since PineconeStore doesn't support custom dimensions
  const texts = chunkedDocs.map((doc) => doc.pageContent);
  const metadatas = chunkedDocs.map((doc) => doc.metadata);

  const batchSize = 50;
  const totalBatches = Math.ceil(texts.length / batchSize);
  for (let i = 0; i < texts.length; i += batchSize) {
    const batchTexts = texts.slice(i, i + batchSize);
    const batchMetas = metadatas.slice(i, i + batchSize);
    const vectors = await embeddings.embedDocuments(batchTexts);

    const records = vectors.map((values, idx) => {
      // Sanitize metadata: Pinecone only supports string, number, boolean values
      const rawMeta = { ...batchMetas[idx], text: batchTexts[idx] };
      const metadata = {};
      for (const [key, val] of Object.entries(rawMeta)) {
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          metadata[key] = val;
        }
      }
      return { id: `doc-${i + idx}`, values, metadata };
    });

    await pineconeIndex.upsert(records);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`Upserted batch ${batchNum}/${totalBatches}`);
  }

  console.log("data stored successfully!");
}

indexDocument();
