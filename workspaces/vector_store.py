# workspaces/vector_store.py

import os
import chromadb
from django.conf import settings
from sentence_transformers import SentenceTransformer

CHROMA_DATA_DIR = os.path.join(settings.BASE_DIR, 'chroma_db')
chroma_client = chromadb.PersistentClient(path=CHROMA_DATA_DIR)
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

class VectorStoreService:
    @staticmethod
    def get_or_create_collection(workspace_id):
        collection_name = f"workspace_{workspace_id}"
        return chroma_client.get_or_create_collection(name=collection_name)

    @classmethod
    def index_document_chunks(cls, workspace_id, document_id, chunks):
        collection = cls.get_or_create_collection(workspace_id)
        ids, documents, embeddings, metadatas = [], [], [], []
        
        for idx, chunk in enumerate(chunks):
            chunk_id = f"doc_{document_id}_chunk_{idx}"
            text_content = chunk["text"]
            vector = embedding_model.encode(text_content).tolist()
            
            ids.append(chunk_id)
            documents.append(text_content)
            embeddings.append(vector)
            metadatas.append({
                "document_id": document_id,
                "source_type": chunk["source_type"],
                "location": chunk["location"]
            })
            
        collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)

    @classmethod
    def query_workspace_context(cls, workspace_id, query_text, n_results=35, selected_doc_ids=None, distance_threshold=1.2):
        collection = cls.get_or_create_collection(workspace_id)
        
        if collection.count() == 0:
            return []

        # Prevent crashing if we ask for more results than exist in DB
        n_results = min(n_results, collection.count())
            
        query_vector = embedding_model.encode(query_text).tolist()
        
        where_clause = None
        if selected_doc_ids and len(selected_doc_ids) > 0:
            doc_ids = [int(doc_id) for doc_id in selected_doc_ids]
            if len(doc_ids) == 1:
                where_clause = {"document_id": doc_ids[0]}
            else:
                where_clause = {"document_id": {"$in": doc_ids}}

        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
            where=where_clause
        )
        
        formatted_results = []
        if results and results['documents'] and len(results['documents']) > 0:
            distances = results.get('distances', [[0] * len(results['documents'][0])])[0]
            for doc, meta, dist in zip(results['documents'][0], results['metadatas'][0], distances):
                if dist <= distance_threshold:
                    formatted_results.append({
                        "text": doc,
                        "location": meta["location"],
                        "source_type": meta["source_type"]
                    })
        return formatted_results

    @classmethod
    def delete_document_chunks(cls, workspace_id, document_id):
        try:
            collection = cls.get_or_create_collection(workspace_id)
            collection.delete(where={"document_id": document_id})
        except Exception as e:
            print(f"❌ Failed to purge vectors from ChromaDB: {e}")
    
    @classmethod
    def get_embedding_function(cls):
        # 🚨 FIX: Safely return the existing embedding function or a default one
        if hasattr(cls, 'embedding_function'):
            return cls.embedding_function
        elif hasattr(cls, 'embed_fn'):
            return cls.embed_fn
        elif hasattr(cls, '_embedding_function'):
            return cls._embedding_function
        else:
            # Fallback to standard ChromaDB embedding
            from chromadb.utils import embedding_functions
            return embedding_functions.DefaultEmbeddingFunction()

    @classmethod
    def get_concept_collection(cls, workspace_id):
        # Safely grab the ChromaDB client
        if hasattr(cls, 'client'):
            db_client = cls.client
        elif hasattr(cls, '_client'):
            db_client = cls._client
        else:
            import chromadb
            db_client = chromadb.PersistentClient(path="./chroma_db")
            
        collection_name = f"workspace_{workspace_id}_concepts"
        
        return db_client.get_or_create_collection(
            name=collection_name, 
            embedding_function=cls.get_embedding_function()
        )