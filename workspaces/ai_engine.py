# workspaces/ai_engine.py

import json
import time
import google.generativeai as genai
from django.conf import settings
from .vector_store import VectorStoreService
from .mongo_service import ChatMemoryService

API_KEYS = getattr(settings, 'GEMINI_API_KEYS', [])
if not API_KEYS and hasattr(settings, 'GEMINI_API_KEY'):
    API_KEYS = [settings.GEMINI_API_KEY]

current_key_index = 0

class AIEngine:
    @staticmethod
    def _execute_with_fallback(system_prompt):
        global current_key_index
        attempts = 0
        max_attempts = len(API_KEYS) * 3 

        while attempts < max_attempts:
            try:
                genai.configure(api_key=API_KEYS[current_key_index])
                model = genai.GenerativeModel('gemini-3.6-flash', generation_config=genai.types.GenerationConfig(temperature=0.0))
                response = model.generate_content(system_prompt)
                return response.text
            except Exception as e:
                error_str = str(e).lower()
                if "429" in error_str or "quota" in error_str or "exhausted" in error_str or "resource" in error_str or "404" in error_str or "not found" in error_str:
                    print(f"  [AI Engine] API Key {current_key_index + 1} issue encountered. Rotating to next key...")
                    current_key_index = (current_key_index + 1) % len(API_KEYS)
                    attempts += 1
                    time.sleep(1)
                else:
                    raise e
        raise Exception("All Gemini API keys have been exhausted or encountered routing errors.")

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
        raw_history = mongo_service.get_chat_history(workspace_id, user_id)[-20:]
        
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

        answer_text = AIEngine._execute_with_fallback(system_prompt)
        mongo_service.save_message(workspace_id, user_id, role="user", text=user_query)
        mongo_service.save_message(workspace_id, user_id, role="ai", text=answer_text)

        return {"answer": answer_text, "sources": []}

    @staticmethod
    def generate_artifact(workspace_id, user_query, artifact_type='markdown', selected_doc_ids=None):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=35,
            selected_doc_ids=selected_doc_ids 
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
                           "title": "Source Reference", 
                           "type": "pdf", 
                           "link": "[Use the exact SOURCE_TAG provided in the context chunks, e.g. [Unit 10_Mongoose and MERN Integration.pdf|Page 15] or [videoId|00:10:38]]"
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

            Ensure positions are spread out hierarchically so nodes do not overlap. You MUST use the exact bracketed SOURCE_TAGs from the workspace chunks for the resource links so they successfully link to PDFs and videos.
            
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
        elif artifact_type == 'quiz':
            system_prompt = f"""
            You are an expert educator. Generate a highly interactive 5-question multiple-choice quiz based ONLY on the workspace context.
            Return ONLY a valid JSON array matching this schema. DO NOT wrap the response in markdown code blocks.
            
            Schema:
            [
              {{
                "question": "The text of the question?",
                "options": ["Option A", "Option B", "Option C", "Option D"],
                "correct_answer": "Option B",
                "explanation": "A concise explanation of why this is the correct answer.",
                "tag": "Subtopic Category"
              }}
            ]
            
            CRITICAL RULES:
            1. The "correct_answer" string MUST perfectly and exactly match one of the strings inside the "options" array.
            2. Do NOT mention "Chunk X".
            3. The "tag" MUST be a short, 1-3 word classification phrase.
            
            {formatted_context}
            Topic Request: {user_query}
            """
        else:
            system_prompt = f"""
            You are an elite Academic Content Generator. 
            Create a highly structured, standalone markdown document based ONLY on the provided workspace context.
            Include detailed explanations, formatted code blocks (if applicable), and avoid all conversational filler.

            CRITICAL CITATION RULES:
            1. You MUST cite your sources using the EXACT string provided in the 'SOURCE_TAG'.
            2. Format citations exactly like this: [videoId|00:12:34] or [filename.pdf|Page 1].
            3. NEVER group multiple citations together.
            4. Do NOT make them standard markdown web links. Just output the raw bracketed tag exactly as provided.
            
            FORMATTING RULES:
            1. Use proper markdown spacing. Leave a blank empty line before and after headings, lists, and code blocks.
            2. Ensure inline code `ticks` have spaces around them.

            {formatted_context}
            User Artifact Request: {user_query}
            """

        return AIEngine._execute_with_fallback(system_prompt)