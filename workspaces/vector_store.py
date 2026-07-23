# workspaces/vector_store.py

import os
import chromadb
from django.conf import settings
from sentence_transformers import SentenceTransformer

# Initialize the persistent local Chroma DB client inside the project folder
CHROMA_DATA_DIR = os.path.join(settings.BASE_DIR, 'chroma_db')
chroma_client = chromadb.PersistentClient(path=CHROMA_DATA_DIR)

# Load a highly efficient, free, local embedding model (runs completely offline)
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

class VectorStoreService:
    @staticmethod
    def get_or_create_collection(workspace_id):
        """Isolates each workspace inside its own unique vector collection."""
        collection_name = f"workspace_{workspace_id}"
        return chroma_client.get_or_create_collection(name=collection_name)

    @classmethod
    def index_document_chunks(cls, workspace_id, document_id, chunks):
        """
        Computes vector embeddings for document chunks and saves them 
        to ChromaDB along with source tracking metadata.
        """
        collection = cls.get_or_create_collection(workspace_id)
        
        ids = []
        documents = []
        embeddings = []
        metadatas = []
        
        for idx, chunk in enumerate(chunks):
            chunk_id = f"doc_{document_id}_chunk_{idx}"
            text_content = chunk["text"]
            
            # Generate the vector embedding locally
            vector = embedding_model.encode(text_content).tolist()
            
            ids.append(chunk_id)
            documents.append(text_content)
            embeddings.append(vector)
            metadatas.append({
                "document_id": document_id,
                "source_type": chunk["source_type"],
                "location": chunk["location"]  # e.g., "Page 4" or "00:02:15"
            })
            
        # Batch insert into local ChromaDB collection
        collection.add(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )

    @classmethod
    def query_workspace_context(cls, workspace_id, query_text, n_results=20):
        """
        Searches the workspace's local vector collection for the text chunks 
        most semantically relevant to a user query.
        """
        collection = cls.get_or_create_collection(workspace_id)
        query_vector = embedding_model.encode(query_text).tolist()
        
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n_results
        )
        
        # Flatten results into an easily consumable dictionary array
        formatted_results = []
        if results and results['documents']:
            for doc, meta in zip(results['documents'][0], results['metadatas'][0]):
                formatted_results.append({
                    "text": doc,
                    "location": meta["location"],
                    "source_type": meta["source_type"]
                })
        return formatted_results