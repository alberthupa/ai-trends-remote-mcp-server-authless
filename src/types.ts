export interface TrendDocument {
    id: string;
    trend: string;
    timestamp: string;
    content: string;
    category?: string;
}

export interface EnvConfig {
    COSMOS_CONNECTION_STRING: string;
    COSMOS_DATABASE_NAME: string;
    COSMOS_CHUNKS_CONTAINER_NAME: string;
    COSMOS_REPORTS_CONTAINER_NAME: string;
    GOOGLE_API_KEY: string;
    OPENAI_API_KEY: string;
}

export interface ChunkDocument {
    id: string;
    content: string;
    timestamp?: string;
}

export interface ReportDocument {
    id: string;
    title: string;
    timestamp: string;
    content: string;
    category?: string;
}
