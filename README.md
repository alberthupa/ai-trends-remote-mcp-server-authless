# AI Trends MCP Server

A Model Context Protocol (MCP) server that provides AI trends analysis using Azure Cosmos DB, Google Gemini, and OpenAI.

## Features (tryin)

- **ask_trends**: Ask questions about AI trends and get AI-powered answers
- **get_latest_trends**: Retrieve the latest AI trend reports

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your Azure Cosmos DB, Google AI, and OpenAI credentials

3. Ensure your Cosmos DB has two containers:
   - `knowledge-chunks`: For storing AI knowledge chunks
   - `knowledge-reports`: For storing AI trend reports

## Testing

### Local Testing

Test the functions directly without the MCP protocol:

```bash
npm test
```

### MCP Protocol Testing

Test with the full MCP client-server protocol:

```bash
npm run test:mcp
```

### Development Server

Run the development server with Wrangler:

```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

Make sure to set your secrets in Cloudflare:

```bash
wrangler secret put COSMOS_CONNECTION_STRING
wrangler secret put GOOGLE_API_KEY
wrangler secret put OPENAI_API_KEY
```

## Environment Variables

- `COSMOS_CONNECTION_STRING`: Azure Cosmos DB connection string
- `COSMOS_DATABASE_NAME`: Database name (e.g., "hupi-loch")
- `COSMOS_CHUNKS_CONTAINER_NAME`: Container for knowledge chunks (e.g., "knowledge-chunks")
- `COSMOS_REPORTS_CONTAINER_NAME`: Container for reports (e.g., "knowledge-reports")
- `GOOGLE_API_KEY`: Google AI API key for Gemini
- `OPENAI_API_KEY`: OpenAI API key

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "ai-trends": {
      "url": "https://your-worker.workers.dev/mcp"
    }
  }
}
```
