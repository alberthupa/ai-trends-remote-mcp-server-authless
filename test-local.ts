import { config } from "dotenv";

// Load environment variables first
config();

async function testLocally() {
    console.log("🧪 Testing MCP Server Functions Locally...\n");

    try {
        // Dynamic import to ensure environment variables are loaded
        const { MyMCP } = await import("./src/index.js");

        const mcp = new MyMCP();

        // Mock the initialization
        await mcp.init();

        console.log("✅ MCP Server initialized\n");

        // Test get_latest_trends
        console.log("📊 Testing get_latest_trends...");
        try {
            // Access the tool handler directly
            const tools = (mcp.server as any)._tools;
            const trendsHandler = tools.get("get_latest_trends");

            if (trendsHandler) {
                const result = await trendsHandler.handler({ limit: 3 });
                console.log("Result:", result.content[0].text);
            } else {
                console.log("❌ get_latest_trends tool not found");
            }
        } catch (error) {
            console.error("❌ Error in get_latest_trends:", error);
        }

        console.log("\n" + "=".repeat(50) + "\n");

        // Test ask_trends
        console.log("🤔 Testing ask_trends...");
        try {
            const tools = (mcp.server as any)._tools;
            const askHandler = tools.get("ask_trends");

            if (askHandler) {
                const result = await askHandler.handler({
                    question: "What are the key differences between GPT-4 and Claude?"
                });
                console.log("Result:", result.content[0].text);
            } else {
                console.log("❌ ask_trends tool not found");
            }
        } catch (error) {
            console.error("❌ Error in ask_trends:", error);
        }

    } catch (error) {
        console.error("❌ Failed to initialize MCP:", error);
    }
}

testLocally().catch(console.error);
