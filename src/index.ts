import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CosmosClient, Container } from "@azure/cosmos";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

// Types
interface Env {
	// Azure Cosmos DB Configuration
	COSMOS_CONNECTION_STRING: string;
	COSMOS_DATABASE_NAME: string;
	COSMOS_CHUNKS_CONTAINER_NAME: string;
	COSMOS_REPORTS_CONTAINER_NAME: string;
	// Google AI Configuration
	GOOGLE_API_KEY: string;
	// OpenAI Configuration
	OPENAI_API_KEY: string;
}

interface TrendReport {
	id: string;
	trend_name: string;
	field: string;
	subfield: string;
	analysis: string;
	key_insights: string[];
	data_sources: string[];
	confidence_score: number;
	time_horizon: string;
	created_at: string;
	updated_at: string;
	geographic_relevance?: string[];
	sector_tags?: string[];
	disruption_potential?: string;
	market_implications?: string;
	[key: string]: any; // Allow additional fields
}

interface SearchOptions {
	field?: string;
	subfield?: string;
	keywords?: string[];
	startDate?: string;
	endDate?: string;
	minConfidence?: number;
	timeHorizon?: string;
	geographicRegion?: string;
	disruptionPotential?: string;
	limit?: number;
}

// Helper functions
async function initializeCosmosContainers(env: Env): Promise<{
	chunksContainer: Container;
	reportsContainer: Container;
}> {
	const cosmosClient = new CosmosClient(env.COSMOS_CONNECTION_STRING);
	const database = cosmosClient.database(env.COSMOS_DATABASE_NAME);

	const chunksContainer = database.container(env.COSMOS_CHUNKS_CONTAINER_NAME);
	const reportsContainer = database.container(env.COSMOS_REPORTS_CONTAINER_NAME);

	// Test containers are accessible
	try {
		await chunksContainer.read();
		await reportsContainer.read();
	} catch (error) {
		console.error("Error initializing Cosmos DB containers:", error);
		throw new Error("Failed to initialize Cosmos DB containers");
	}

	return { chunksContainer, reportsContainer };
}

// MCP instance with lazy initialization
let containers: { chunksContainer: Container; reportsContainer: Container } | null = null;

const MyMCP = McpServer.extend({
	tools: [
		{
			name: "get_latest_trends",
			description: "Get the latest AI trends with optional filtering",
			schema: z.object({
				limit: z.string().optional().describe("Number of trends to return (default: 10)"),
				field: z.string().optional().describe("Filter by field (e.g., 'Healthcare', 'Finance')"),
				minConfidence: z.string().optional().describe("Minimum confidence score (0-1)")
			})
		},
		// ...existing code...
	],

	callbacks: {
		async onToolCall({ name, args }, env: Env) {
			try {
				// Initialize containers if not already done
				if (!containers) {
					containers = await initializeCosmosContainers(env);
				}

				const { chunksContainer, reportsContainer } = containers;

				if (name === "get_latest_trends") {
					const limit = Math.min(Number.parseInt(args.limit || "10"), 50);
					const minConfidence = args.minConfidence ? Number.parseFloat(args.minConfidence) : 0;

					let query = "SELECT * FROM c WHERE c.confidence_score >= @minConfidence";
					const parameters = [{ name: "@minConfidence", value: minConfidence }];

					if (args.field) {
						query += " AND c.field = @field";
						parameters.push({ name: "@field", value: args.field });
					}

					query += " ORDER BY c.created_at DESC OFFSET 0 LIMIT @limit";
					parameters.push({ name: "@limit", value: limit });

					const { resources } = await reportsContainer.items.query({
						query,
						parameters
					}).fetchAll();

					return JSON.stringify(resources, null, 2);
				}

				// Tool: ask_trends
				if (name === "ask_trends") {
					const question = args.question as string;

					// Get knowledge chunks from Cosmos DB
					const chunks = await chunksContainer.items
						.query<ChunkDocument>("SELECT * FROM c ORDER BY c._ts DESC OFFSET 0 LIMIT 50")
						.fetchAll();

					// Prepare context for the AI
					const context = chunks.resources
						.map(chunk => chunk.content)
						.join("\n\n");

					// Use Google Gemini or OpenAI to answer the question
					let answer = "";

					if (env.GOOGLE_API_KEY) {
						const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
						const prompt = `Based on the following AI trends knowledge:\n\n${context}\n\nQuestion: ${question}\n\nProvide a comprehensive answer:`;

						const result = await model.generateContent(prompt);
						answer = result.response.text();
					} else if (env.OPENAI_API_KEY) {
						const completion = await openai.chat.completions.create({
							model: "gpt-4o-mini",
							messages: [
								{
									role: "system",
									content: "You are an AI trends expert. Answer questions based on the provided context about latest AI trends.",
								},
								{
									role: "user",
									content: `Based on the following AI trends knowledge:\n\n${context}\n\nQuestion: ${question}`,
								},
							],
							temperature: 0.7,
							max_tokens: 1000,
						});

						answer = completion.choices[0]?.message?.content || "No answer generated";
					} else {
						answer = "AI services not configured. Please set up Google AI or OpenAI API keys.";
					}

					return {
						content: [
							{
								type: "text",
								text: answer,
							},
						],
					};
				}

				// ...existing code...

				return "Unknown tool";
			} catch (error) {
				console.error(`Error in tool ${name}:`, error);
				return `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`;
			}
		}
	}
});

// Cloudflare Workers export
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// Pass environment variables to the MCP instance
		if (typeof process !== 'undefined') {
			process.env = { ...process.env, ...env };
		}

		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
