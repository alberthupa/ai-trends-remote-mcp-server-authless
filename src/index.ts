import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CosmosClient, Container } from "@azure/cosmos";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

// Environment variables interface
interface EnvConfig {
	COSMOS_CONNECTION_STRING: string;
	COSMOS_DATABASE_NAME: string;
	COSMOS_CHUNKS_CONTAINER_NAME: string;
	COSMOS_REPORTS_CONTAINER_NAME: string;
	GOOGLE_API_KEY: string;
	OPENAI_API_KEY: string;
}

// Trend document interfaces
interface ChunkDocument {
	id: string;
	content: string;
	timestamp?: string;
}

interface ReportDocument {
	id: string;
	title: string;
	timestamp: string;
	content: string;
	category?: string;
}

// Define our MCP agent with AI trends tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "AI Trends Analyzer",
		version: "1.0.0",
	});

	private cosmosClient?: CosmosClient;
	private chunksContainer?: Container;
	private reportsContainer?: Container;
	private genAI?: GoogleGenerativeAI;
	private openai?: OpenAI;
	private config?: EnvConfig;

	async init() {
		// Initialize configuration from environment
		// Support both Cloudflare Workers env and Node.js process.env
		const getEnvVar = (key: string) => {
			if (typeof process !== 'undefined' && process.env) {
				return process.env[key] || "";
			}
			// For Cloudflare Workers, env vars are passed differently
			return "";
		};

		this.config = {
			COSMOS_CONNECTION_STRING: getEnvVar('COSMOS_CONNECTION_STRING'),
			COSMOS_DATABASE_NAME: getEnvVar('COSMOS_DATABASE_NAME'),
			COSMOS_CHUNKS_CONTAINER_NAME: getEnvVar('COSMOS_CHUNKS_CONTAINER_NAME'),
			COSMOS_REPORTS_CONTAINER_NAME: getEnvVar('COSMOS_REPORTS_CONTAINER_NAME'),
			GOOGLE_API_KEY: getEnvVar('GOOGLE_API_KEY'),
			OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY'),
		};

		// Initialize clients
		if (this.config.COSMOS_CONNECTION_STRING) {
			this.cosmosClient = new CosmosClient(this.config.COSMOS_CONNECTION_STRING);
			const database = this.cosmosClient.database(this.config.COSMOS_DATABASE_NAME);
			this.chunksContainer = database.container(this.config.COSMOS_CHUNKS_CONTAINER_NAME);
			this.reportsContainer = database.container(this.config.COSMOS_REPORTS_CONTAINER_NAME);
		}

		if (this.config.GOOGLE_API_KEY) {
			this.genAI = new GoogleGenerativeAI(this.config.GOOGLE_API_KEY);
		}

		if (this.config.OPENAI_API_KEY) {
			this.openai = new OpenAI({
				apiKey: this.config.OPENAI_API_KEY,
			});
		}

		// Tool: ask_trends
		this.server.tool(
			"ask_trends",
			{
				question: z.string().describe("The question to ask about AI trends"),
			},
			async ({ question }) => {
				try {
					// Get knowledge chunks from Cosmos DB
					const chunks = await this.getKnowledgeChunks();

					// Prepare context for the AI
					const context = chunks
						.map(chunk => chunk.content)
						.join("\n\n");

					// Use Google Gemini or OpenAI to answer the question
					let answer = "";

					if (this.genAI) {
						const model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
						const prompt = `Based on the following AI trends knowledge:\n\n${context}\n\nQuestion: ${question}\n\nProvide a comprehensive answer:`;

						const result = await model.generateContent(prompt);
						answer = result.response.text();
					} else if (this.openai) {
						const completion = await this.openai.chat.completions.create({
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
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error answering question: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);

		// Tool: get_latest_trends
		this.server.tool(
			"get_latest_trends",
			{
				limit: z.number().optional().default(10).describe("Number of trends to retrieve"),
			},
			async ({ limit }) => {
				try {
					const reports = await this.getLatestReports(limit);

					const formattedTrends = reports
						.map((report, index) => {
							const date = new Date(report.timestamp);
							const formattedDate = date.toLocaleDateString("en-US", {
								year: "numeric",
								month: "short",
								day: "numeric",
							});

							return `${index + 1}. **${report.title}** (${formattedDate})\n   ${report.content}\n   ${report.category ? `Category: ${report.category}` : ""}`;
						})
						.join("\n\n");

					return {
						content: [
							{
								type: "text",
								text: formattedTrends || "No trends found",
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error fetching trends: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						],
					};
				}
			}
		);
	}

	// Helper method to fetch knowledge chunks from Cosmos DB
	private async getKnowledgeChunks(limit: number = 50): Promise<ChunkDocument[]> {
		if (!this.chunksContainer) {
			throw new Error("Cosmos DB chunks container not initialized");
		}

		const querySpec = {
			query: "SELECT * FROM c ORDER BY c._ts DESC OFFSET 0 LIMIT @limit",
			parameters: [
				{
					name: "@limit",
					value: limit,
				},
			],
		};

		const { resources } = await this.chunksContainer.items
			.query<ChunkDocument>(querySpec)
			.fetchAll();

		return resources;
	}

	// Helper method to fetch latest reports from Cosmos DB
	private async getLatestReports(limit: number = 10): Promise<ReportDocument[]> {
		if (!this.reportsContainer) {
			throw new Error("Cosmos DB reports container not initialized");
		}

		const querySpec = {
			query: "SELECT * FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit",
			parameters: [
				{
					name: "@limit",
					value: limit,
				},
			],
		};

		const { resources } = await this.reportsContainer.items
			.query<ReportDocument>(querySpec)
			.fetchAll();

		return resources;
	}
}

// Support both Cloudflare Workers and local Node.js execution
const isCloudflareWorker = typeof Request !== 'undefined' && typeof Response !== 'undefined';

if (isCloudflareWorker) {
	export default {
		fetch(request: Request, env: Env, ctx: ExecutionContext) {
			// Pass environment variables to the MCP instance
			process.env = { ...process.env, ...env };

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
} else {
	// For local testing with Node.js
	import('dotenv').then(({ config }) => {
		config();
		const mcp = new MyMCP();
		mcp.init().then(() => {
			console.log("MCP Server initialized for local testing");
		});
	});
}
