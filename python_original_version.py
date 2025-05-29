import os
import re
from datetime import datetime, timedelta
from google import genai
from openai import OpenAI
from azure.cosmos import CosmosClient, PartitionKey, exceptions

from dotenv import load_dotenv
load_dotenv(override=True)

COSMOS_CONNECTION_STRING = os.environ.get("COSMOS_CONNECTION_STRING")
DATABASE_NAME = os.environ.get("COSMOS_DB_NAME")
PARTITION_KEY_PATH = "/id"
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")


def clean_text(text):
    '''
    this is a simple text cleaning function
    '''
    text = re.sub(r"\s+", " ", text)
    text = text.strip()
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text

class SimpleCosmosClient:
    '''
    main class for connecting to Cosmos DB
    It uses the connection string, database name and partition key path to connect to the Cosmos DB account.
    It initializes the CosmosClient, DatabaseClient and ContainerClient.
    it is necessary for the whole script to work.
    '''
    def __init__(
        self,
        connection_string: str,
        database_name: str,
        partition_key_path: str,
    ):
        self.connection_string = connection_string
        self.database_name = database_name
        self.partition_key_path = partition_key_path
        self.cosmos_client = None
        self.database_client = None
        self.container_client = None

    def connect(self) -> True:
        """
        Connects to the Cosmos DB account and gets the database client.
        """
        print("Connecting to Cosmos DB...")
        try:
            parts = self.connection_string.split(";")
            uri = None
            key = None
            for part in parts:
                if part.startswith("AccountEndpoint="):
                    uri = part.split("=")[1]
                elif part.startswith("AccountKey="):
                    key_start_index = part.find("=") + 1
                    key = part[key_start_index:]

            if not uri or not key:
                raise ValueError("Invalid connection string format")

            self.cosmos_client = CosmosClient(uri, key)
            print("CosmosClient initialized successfully.")

            self.database_client = self.cosmos_client.get_database_client(
                self.database_name
            )
            print(f"Database '{self.database_name}' client obtained.")

            return True

        except exceptions.CosmosResourceNotFoundError:
            print(
                f"Error: Database '{self.database_name}' not found. Please ensure the database name is correct and exists."
            )
            self.database_client = None
        except ValueError as e:
            print(f"Connection string error: {e}")
            self.cosmos_client = None
            self.database_client = None
        except Exception as e:
            print(f"An unexpected error occurred during connection: {e}")
            self.cosmos_client = None
            self.database_client = None

class SimpleLlmClient:
    '''
    this class is used to connect to the LLM models.
    it is used in only one function in the script, i.e. ask_trends, 
    '''
    def __init__(self, model_name: str = "gemini-2.0-flash"):
        self.model_name = model_name  # gpt-4o or gemini-2.0-flash
        self.client = None

    def set_client(self):
        if self.model_name == "gpt-4o":
            client = OpenAI(
                api_key=OPENAI_API_KEY,
            )
            self.client = client

        elif self.model_name == "gemini-2.0-flash":
            client = genai.Client(
                api_key=os.environ.get("GEMINI_API_KEY"),
            )
            self.client = client
        return self.client

    def get_response(self, prompt: str):
        if not self.client:
            print(f"Setting client for model: {self.model_name}")
            self.set_client()
        if self.model_name == "gpt-4o":
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.choices[0].message.content
        elif self.model_name == "gemini-2.0-flash":
            response = self.client.models.generate_content(
                model=self.model_name, contents=prompt
            )
            return response.text


cosmos_client = SimpleCosmosClient(
    connection_string=COSMOS_CONNECTION_STRING,
    database_name=DATABASE_NAME,
    partition_key_path=PARTITION_KEY_PATH,
)

cosmos_client.connect()


def ask_trends(cosmos_client: SimpleCosmosClient, users_query: str) -> str:
    """
    This function answers the user's query based on the curated trends dataset.
    It should be triggered when user says he wants to ask trends about something, 
    e.g.: "use AI trends to tell me about LLMs", or "What are the best models? use AI Trends".
    
    Args:
        cosmos_client (SimpleCosmosClient): Connected Cosmos DB client instance
        users_query (str): The user's question about AI trends
        
    Returns:
        str: AI-generated response based on relevant trend data, or error message if database connection fails
    """

    try:
        chunks = cosmos_client.database_client.get_container_client("knowledge-chunks")
    except Exception as e:
        print(f"Error connecting to Cosmos DB: {e}")
        return "Error connecting to the database."

    def get_openai_embedding(text):
        client = OpenAI(api_key=OPENAI_API_KEY)
        return client.embeddings.create(input=text, model="text-embedding-3-small")

    embeddings_result = get_openai_embedding(users_query)
    embeddings_from_users_question = embeddings_result.data[0].embedding

    two_weeks_ago = (datetime.utcnow() - timedelta(weeks=2)).date().isoformat()

    cosmos_query = f"""
        SELECT TOP 10 c.text FROM c
        WHERE c.chunk_date >= "{two_weeks_ago}"
        ORDER BY VectorDistance(c.embedding, {embeddings_from_users_question})        
    """
    query_results = list(
        chunks.query_items(
            query=cosmos_query,
            enable_cross_partition_query=True,
        )
    )

    context = ""
    for i in query_results:
        context += f"{i['text']}\n"
    context = clean_text(context)


    prompt = f"""
    You are presented with this message from a user: "{users_query}". Interpret is as a question.
    Your job is to summarize what is the context below and provide a concise answer to the question based only on the context below.
    Do not assess quality of the context, just answer the question based on the context.
    Answer directly the question, do not repeat the question and do not refer to the text itself.
    Here is the context: "{context}"`
    """

    llm_client = SimpleLlmClient()
    response = llm_client.get_response(prompt)

    return response


def get_latest_trends(cosmos_client: SimpleCosmosClient) -> str:
    """
    This function retrieves the latest trends: daily, weekly and monthly.
    It should be triggered when user asks for the latest AI trends 
    ("Use AI trends to tell me what is trending?", "what are AI trends?", "What is trending in AI?").
    
    Args:
        cosmos_client (SimpleCosmosClient): Connected Cosmos DB client instance
        
    Returns:
        str: Formatted string containing the latest trend reports with dates, or error message if database connection fails
    """

    try:
        reports = cosmos_client.database_client.get_container_client(
            "knowledge-reports"
        )
    except Exception as e:
        print(f"Error connecting to Cosmos DB: {e}")
        return "Error connecting to the database."
    pass

    report_content = ""
    q = "select top 3 c.report_date, c. trend_flag, c.trend_report from c order by c.report_date desc"
    reports_from_cosmos = list(
        reports.query_items(
            query=q,
            enable_cross_partition_query=True,
        )
    )
    for i in reports_from_cosmos:
        report_content += f"{i['report_date']}: {i['trend_report']}\n"
    return report_content






def main():
    #sth = ask_trends("best llm model")
    sth = ask_trends(cosmos_client, "what is the strongest feature of gemini")
    print(sth)


    #sth = get_latest_trends(cosmos_client, )
    #print(sth)
    ##print("Welcome to the LLM Trends Bot!")


if __name__ == "__main__":
    main()
