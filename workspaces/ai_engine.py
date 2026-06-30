# workspaces/ai_engine.py

import google.generativeai as genai
from django.conf import settings
from .vector_store import VectorStoreService

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash')

class AIEngine:
    @staticmethod
    def chat_with_workspace(workspace_id, user_query):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=60        
        )

        if not context_results:
            return {
                "answer": "I don't have any documents in this workspace to answer that.",
                "sources": []
            }

        formatted_context = "WORKSPACE DOCUMENTS:\n\n"
        
        for idx, result in enumerate(context_results):
            # Because of our Ingestion update, this is ALREADY the perfect Smart Tag!
            smart_tag = result.get('location', 'unknown')
            
            # Watch your terminal, it will finally include the ID!
            print(f"Backend Generated Tag: [{smart_tag}]")

            formatted_context += f"--- Chunk {idx + 1} ---\n"
            formatted_context += f"SOURCE_TAG: [{smart_tag}]\n"
            formatted_context += f"TEXT: {result.get('text', '')}\n\n"

        system_prompt = f"""
        You are an AI assistant. Answer the user's query using ONLY the provided context.
        You must synthesize information from MULTIPLE sources.
        
        CRITICAL CITATION RULES (DO NOT IGNORE):
        1. You MUST cite your sources using the EXACT string provided in the 'SOURCE_TAG'.
        2. NEVER drop the brackets or the Video ID. 
           - WRONG: 00:08:16
           - WRONG: [00:08:16]
           - CORRECT: [BJ-VvGyQxho|00:08:16]
        3. NEVER group multiple citations together inside one set of brackets. Every single timestamp must be separated into its own distinct bracketed tag.
           - WRONG: [ZDa-Z5JzLYM|00:03:14, ZDa-Z5JzLYM|00:03:20]
           - CORRECT: [ZDa-Z5JzLYM|00:03:14] [ZDa-Z5JzLYM|00:03:20]
        
        Context:
        {formatted_context}
        
        User Query: {user_query}
        """

        response = model.generate_content(system_prompt)

        return {
            "answer": response.text,
            "sources": [] 
        }