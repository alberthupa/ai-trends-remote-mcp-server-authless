import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

async function testMCPServer() {
    console.log("🚀 Starting MCP Server Test...\n");

    try {
        // Spawn the MCP server process
        const serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                // These will use the values from .env file
            },
        });

        // Create MCP client
        const transport = new StdioClientTransport({
            command: "npx",
            args: ["tsx", "src/index.ts"],
        });

        const client = new Client({
            name: "test-client",
            version: "1.0.0",
        }, {
            capabilities: {}
        });

        await client.connect(transport);

        console.log("✅ Connected to MCP server\n");

        // List available tools
        const tools = await client.listTools();
        console.log("📋 Available tools:");
        tools.tools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });
        console.log("");

        // Test 1: get_latest_trends
        console.log("📊 Test 1: Getting latest trends...");
        try {
            const trendsResult = await client.callTool("get_latest_trends", {
                limit: 5
            });
            console.log("Latest trends:");
            console.log(trendsResult.content[0].text);
        } catch (error) {
            console.error("❌ Error getting trends:", error);
        }
        console.log("");

        // Test 2: ask_trends
        console.log("🤔 Test 2: Asking about AI trends...");
        try {
            const questionResult = await client.callTool("ask_trends", {
                question: "What are the most significant AI trends in 2024?"
            });
            console.log("Answer:");
            console.log(questionResult.content[0].text);
        } catch (error) {
            console.error("❌ Error asking question:", error);
        }

        // Cleanup
        await client.close();
        serverProcess.kill();
        console.log("\n✅ Test completed!");

    } catch (error) {
        console.error("❌ Test failed:", error);
        process.exit(1);
    }
}

// Run the test
testMCPServer();
