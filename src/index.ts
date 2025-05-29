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

// Create MCP server instance
const createMcpServer = (env: Env) => {
	const server = new McpServer({
		name: "ai-trends-mcp-server",
		version: "0.1.0"
	});

	// Register tools
	server.setRequestHandler({
		method: "tools/list",
		handler: async () => ({
			tools: [
				{
					name: "get_latest_trends",
					description: "Get the latest AI trends with optional filtering",
					inputSchema: {
						type: "object",
						properties: {
							limit: { type: "string", description: "Number of trends to return (default: 10)" },
							field: { type: "string", description: "Filter by field (e.g., 'Healthcare', 'Finance')" },
							minConfidence: { type: "string", description: "Minimum confidence score (0-1)" }
						}
					}
				},
				{
					name: "search_trends",
					description: "Search AI trends with comprehensive filtering options",
					inputSchema: {
						type: "object",
						properties: {
							field: { type: "string", description: "Filter by field" },
							subfield: { type: "string", description: "Filter by subfield" },
							keywords: { type: "array", items: { type: "string" }, description: "Keywords to search for" },
							startDate: { type: "string", description: "Start date (ISO format)" },
							endDate: { type: "string", description: "End date (ISO format)" },
							minConfidence: { type: "string", description: "Minimum confidence score (0-1)" },
							timeHorizon: { type: "string", description: "Time horizon filter" },
							geographicRegion: { type: "string", description: "Geographic region filter" },
							disruptionPotential: { type: "string", description: "Disruption potential filter" },
							limit: { type: "string", description: "Maximum number of results" }
						}
					}
				},
				{
					name: "get_trend_by_id",
					description: "Get a specific trend by ID",
					inputSchema: {
						type: "object",
						properties: {
							id: { type: "string", description: "The trend ID" }
						},
						required: ["id"]
					}
				},
				{
					name: "analyze_trend_with_ai",
					description: "Get AI-powered analysis of a trend",
					inputSchema: {
						type: "object",
						properties: {
							trendId: { type: "string", description: "The trend ID to analyze" },
							aiProvider: { type: "string", description: "AI provider to use ('google' or 'openai')", default: "google" },
							analysisType: { type: "string", description: "Type of analysis ('impact', 'technical', 'market', 'comprehensive')", default: "comprehensive" }
						},
						required: ["trendId"]
					}
				}
			]
		})
	});

	// Handle tool calls
	server.setRequestHandler({
		method: "tools/call",
		handler: async ({ params }) => {
			const { name, arguments: args } = params;

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

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(resources, null, 2)
							}
						]
					};
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

				// ...existing code for other tools...

				throw new Error(`Unknown tool: ${name}`);
			} catch (error) {
				console.error(`Error in tool ${name}:`, error);
				return {
					content: [
						{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
						}
					],
					isError: true
				};
			}
		}
	});

	return server;
};

// Export MyMCP class for Durable Objects (if needed)
export class MyMCP {
	private server: McpServer;

	constructor(state: any, env: Env) {
		this.server = createMcpServer(env);
	}

	async fetch(request: Request) {
		return this.server.fetch(request);
	}
}

// Cloudflare Workers export
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const server = createMcpServer(env);
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return server.fetch(request);
		}

		if (url.pathname === "/mcp") {
			return server.fetch(request);
		}

		return new Response("Not found", { status: 404 });
	},
};
