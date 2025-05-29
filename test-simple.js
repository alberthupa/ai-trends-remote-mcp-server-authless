import { CosmosClient } from "@azure/cosmos";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { config } from "dotenv";

// Load environment variables
config();

async function testConnections() {
    console.log("🧪 Testing connections...\n");

    // Test Cosmos DB
    console.log("📊 Testing Cosmos DB connection...");
    try {
        const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
        const database = cosmosClient.database(process.env.COSMOS_DATABASE_NAME);

        // Test chunks container
        const chunksContainer = database.container(process.env.COSMOS_CHUNKS_CONTAINER_NAME);
        const chunksQuery = await chunksContainer.items.query("SELECT TOP 1 * FROM c").fetchAll();
        console.log(`✅ Chunks container: Found ${chunksQuery.resources.length} items`);

        // Test reports container
        const reportsContainer = database.container(process.env.COSMOS_REPORTS_CONTAINER_NAME);
        const reportsQuery = await reportsContainer.items.query("SELECT TOP 1 * FROM c").fetchAll();
        console.log(`✅ Reports container: Found ${reportsQuery.resources.length} items`);
    } catch (error) {
        console.error("❌ Cosmos DB error:", error.message);
    }

    console.log("\n" + "=".repeat(50) + "\n");

    // Test Google AI
    console.log("🤖 Testing Google AI...");
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Say 'Hello, Google AI is working!'");
        console.log("✅ Google AI response:", result.response.text());
    } catch (error) {
        console.error("❌ Google AI error:", error.message);
    }

    console.log("\n" + "=".repeat(50) + "\n");

    // Test OpenAI
    console.log("🤖 Testing OpenAI...");
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Say 'Hello, OpenAI is working!'" }],
            max_tokens: 50
        });
        console.log("✅ OpenAI response:", completion.choices[0]?.message?.content);
    } catch (error) {
        console.error("❌ OpenAI error:", error.message);
    }
}

testConnections().catch(console.error);
