# workspaces/ai_engine.py

import json
import google.generativeai as genai
from django.conf import settings
from .vector_store import VectorStoreService
from .mongo_service import ChatMemoryService

genai.configure(api_key=settings.GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash', generation_config=genai.types.GenerationConfig(temperature=0.0))

class AIEngine:
    @staticmethod
    def chat_with_workspace(workspace_id, user_query, user_id):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=35
        )

        if not context_results:
            return {"answer": "I don't have any documents in this workspace to answer that.", "sources": []}

        formatted_context = "WORKSPACE DOCUMENTS:\n\n"
        for idx, result in enumerate(context_results):
            smart_tag = result.get('location', 'unknown')
            formatted_context += f"--- Chunk {idx + 1} ---\nSOURCE_TAG: [{smart_tag}]\nTEXT: {result.get('text', '')}\n\n"

        mongo_service = ChatMemoryService()
        raw_history = mongo_service.get_chat_history(workspace_id, user_id)
        
        formatted_memory = "PREVIOUS CONVERSATION HISTORY:\n"
        for msg in raw_history:
            role = "User" if msg['role'] == 'user' else "AI"
            formatted_memory += f"{role}: {msg['text']}\n"

        system_prompt = f"""
        You are an elite Academic Research Assistant. Your job is to synthesize information across multiple domains.
        Answer the user's query using ONLY the provided context.
        You have access to the Previous Conversation History to understand pronouns or context.
        
        CRITICAL BEHAVIORAL RULES:
        1. BE DOMAIN AGNOSTIC: You will be given context spanning many different subjects.
        2. BE COMPREHENSIVE: Extract maximum value from the provided chunks. Write highly detailed responses.
        3. FILE AWARENESS: The user's uploaded files are provided in "WORKSPACE DOCUMENTS". Treat them as file contents.
        4. NO META-TALK / NO RAW VIDEO ID LEAKS.
        
        CRITICAL CITATION RULES:
        1. You MUST cite your sources using the EXACT string provided in the 'SOURCE_TAG'.
        2. NEVER drop the brackets. (e.g., [oop_notes.pdf|Page 1])
        3. NEVER group multiple citations together.
        
        {formatted_memory}
        
        {formatted_context}
        
        Current User Query: {user_query}
        """

        response = model.generate_content(system_prompt)
        answer_text = response.text

        mongo_service.save_message(workspace_id, user_id, role="user", text=user_query)
        mongo_service.save_message(workspace_id, user_id, role="ai", text=answer_text)

        return {"answer": answer_text, "sources": []}

    @staticmethod
    def generate_artifact(workspace_id, user_query, artifact_type='markdown'):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=35
        )

        formatted_context = "WORKSPACE DOCUMENTS:\n\n"
        if context_results:
            for idx, result in enumerate(context_results):
                smart_tag = result.get('location', 'unknown')
                formatted_context += f"--- Chunk {idx + 1} ---\nSOURCE_TAG: [{smart_tag}]\nTEXT: {result.get('text', '')}\n\n"
        else:
            formatted_context = "No documents found in this workspace."

        if artifact_type == 'graph':
            system_prompt = f"""
            You are an expert curriculum designer. Generate a JSON payload representing a Knowledge Graph based ONLY on the workspace context.
            Return ONLY a valid JSON object matching this strict schema. DO NOT wrap the response in markdown code blocks like ```json.
            
            Schema:
            {{
              "nodes": [
                {{
                  "id": "1",
                  "data": {{ 
                      "label": "Main Concept Name",
                      "summary": "A punchy 1-2 sentence overview of the concept.",
                      "details": "A deeply detailed, multi-paragraph explanation of how this works, why it matters, and practical examples.",
                      "resources": [
                        {{
                           "title": "Related Video Explanation", 
                           "type": "video", 
                           "link": "[Enter exact YouTube ID|Timestamp from source tag if available, or generate a high quality external search query]"
                        }}
                      ]
                  }},
                  "position": {{ "x": 250, "y": 0 }},
                  "type": "default"
                }}
              ],
              "edges": [
                {{ "id": "e1-2", "source": "1", "target": "2", "animated": true, "label": "leads to" }}
              ]
            }}

            Ensure positions are spread out hierarchically (e.g., y: 0, y: 150, y: 300) so nodes do not overlap in the React Flow UI.
            
            {formatted_context}
            Topic Request: {user_query}
            """
        elif artifact_type == 'flashcards':
            system_prompt = f"""
            Generate 5-8 highly engaging, interactive Flashcards based ONLY on the context.
            Return ONLY a valid JSON array matching this schema. DO NOT wrap the response in markdown code blocks.
            
            Schema:
            [
              {{
                "question": "A clear, challenging question about the topic.",
                "answer": "A concise, precise answer with bullet points if necessary.",
                "tag": "Subtopic Category"
              }}
            ]

            {formatted_context}
            Topic Request: {user_query}
            """
        else:
            system_prompt = f"""
            You are an elite Academic Content Generator. 
            Create a highly structured, standalone markdown document based ONLY on the provided workspace context.
            Include detailed explanations, formatted code blocks (if applicable), and avoid all conversational filler.

            {formatted_context}
            User Artifact Request: {user_query}
            """

        response = model.generate_content(system_prompt)
        return response.text