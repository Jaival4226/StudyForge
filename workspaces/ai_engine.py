# workspaces/ai_engine.py

import google.generativeai as genai
from django.conf import settings
from .vector_store import VectorStoreService
from .mongo_service import ChatMemoryService # <--- Import our new Mongo service

genai.configure(api_key=settings.GEMINI_API_KEY)
# We will use temperature=0.0 to prevent it from messing up citations while looking at memory
model = genai.GenerativeModel('gemini-2.5-flash', generation_config=genai.types.GenerationConfig(temperature=0.0))

class AIEngine:
    @staticmethod
    def chat_with_workspace(workspace_id, user_query, user_id):
        # 1. Fetch Vector Context (Untouched & Safe)
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=60        
        )

        if not context_results:
            return {"answer": "I don't have any documents in this workspace to answer that.", "sources": []}

        # 2. Build the formatting block (Untouched & Safe)
        formatted_context = "WORKSPACE DOCUMENTS:\n\n"
        for idx, result in enumerate(context_results):
            smart_tag = result.get('location', 'unknown')
            formatted_context += f"--- Chunk {idx + 1} ---\nSOURCE_TAG: [{smart_tag}]\nTEXT: {result.get('text', '')}\n\n"

        # 3. NEW: Fetch Conversational Memory from MongoDB
        mongo_service = ChatMemoryService()
        raw_history = mongo_service.get_chat_history(workspace_id, user_id)
        
        formatted_memory = "PREVIOUS CONVERSATION HISTORY:\n"
        for msg in raw_history:
            role = "User" if msg['role'] == 'user' else "AI"
            formatted_memory += f"{role}: {msg['text']}\n"

        # 4. Safely inject Memory + Context into the Draconian Prompt
        system_prompt = f"""
        You are an elite Academic Research Assistant. Your job is to synthesize information across multiple domains.
        Answer the user's query using ONLY the provided context.
        You have access to the Previous Conversation History to understand pronouns or context.
        
        CRITICAL BEHAVIORAL RULES:
        1. BE DOMAIN AGNOSTIC: You will be given context spanning many different subjects (code, history, psychology, etc.). You must answer the question based on whatever subject the context contains, without bias.
        2. BE COMPREHENSIVE: Extract maximum value from the provided chunks. Write highly detailed, multi-paragraph responses. Do NOT give short answers.
        
        CRITICAL CITATION RULES (DO NOT IGNORE):
        1. You MUST cite your sources using the EXACT string provided in the 'SOURCE_TAG'.
        2. NEVER drop the brackets. (e.g., CORRECT: [BJ-VvGyQxho|00:08:16] or [Page 1])
        3. NEVER group multiple citations together.
        
        {formatted_memory}
        
        {formatted_context}
        
        Current User Query: {user_query}
        """

        # 5. Generate Answer
        response = model.generate_content(system_prompt)
        answer_text = response.text

        # 6. NEW: Save the new exchange to MongoDB
        mongo_service.save_message(workspace_id, user_id, role="user", text=user_query)
        mongo_service.save_message(workspace_id, user_id, role="ai", text=answer_text)

        return {
            "answer": answer_text,
            "sources": [] 
        }