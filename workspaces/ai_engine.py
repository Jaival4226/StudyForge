import json
import time
from google import genai
from google.genai import types
from django.conf import settings
from .vector_store import VectorStoreService
from .mongo_service import ChatMemoryService

API_KEYS = getattr(settings, 'GEMINI_API_KEYS', [])
if not API_KEYS and hasattr(settings, 'GEMINI_API_KEY'):
    API_KEYS = [settings.GEMINI_API_KEY]

# Auto-Model Router using active models
MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']

current_key_index = 0
current_model_index = 0

class AIEngine:
    @staticmethod
    def _execute_with_fallback(system_prompt):
        global current_key_index, current_model_index
        attempts = 0
        max_attempts = len(API_KEYS) * len(MODELS) 

        while attempts < max_attempts:
            try:
                client = genai.Client(api_key=API_KEYS[current_key_index])
                active_model = MODELS[current_model_index]
                
                response = client.models.generate_content(
                    model=active_model,
                    contents=system_prompt,
                    config=types.GenerateContentConfig(temperature=0.0)
                )
                return response.text
            except Exception as e:
                error_str = str(e).lower()
                if "404" in error_str or "not found" in error_str:
                    current_model_index = (current_model_index + 1) % len(MODELS)
                    attempts += 1
                    continue
                elif "429" in error_str or "quota" in error_str or "exhausted" in error_str or "401" in error_str or "unauthenticated" in error_str:
                    current_key_index = (current_key_index + 1) % len(API_KEYS)
                    attempts += 1
                    time.sleep(1)
                    continue
                else:
                    raise e
        raise Exception("All Gemini API keys and model fallbacks have been exhausted.")

    @staticmethod
    def chat_with_workspace(workspace_id, user_query, user_id):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=15, 
            distance_threshold=2.0 
        )

        formatted_context = "WORKSPACE DOCUMENTS:\n\n"
        if context_results:
            for idx, result in enumerate(context_results):
                smart_tag = result.get('location', 'unknown')
                formatted_context += f"--- Chunk {idx + 1} ---\nSOURCE_TAG: [{smart_tag}]\nTEXT: {result.get('text', '')}\n\n"
        else:
            formatted_context = "I don't have any documents in this workspace to answer that."

        mongo_service = ChatMemoryService()
        raw_history = mongo_service.get_chat_history(workspace_id, user_id)[-10:]
        
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
        2. BE COMPREHENSIVE BUT CLEAN: Write detailed responses but DO NOT use excessive formatting.
        3. NO HEAVY FORMATTING: DO NOT use horizontal rules (---) and DO NOT use heading tags (###). Use simple paragraphs and basic bullet points.
        4. FILE AWARENESS: The user's uploaded files are provided in "WORKSPACE DOCUMENTS". Treat them as file contents.
        5. NO META-TALK / NO RAW VIDEO ID LEAKS.
        
        CRITICAL CITATION RULES:
        1. You MUST cite your sources using the EXACT string provided in the 'SOURCE_TAG'.
        2. NEVER drop the brackets. (e.g., [oop_notes.pdf|Page 1])
        3. NEVER group multiple citations together.
        
        {formatted_memory}
        
        {formatted_context}
        
        Current User Query: {user_query}
        """

        mongo_service.save_message(workspace_id, user_id, role="user", text=user_query)

        global current_key_index, current_model_index
        attempts = 0
        max_attempts = len(API_KEYS) * len(MODELS) 

        while attempts < max_attempts:
            try:
                client = genai.Client(api_key=API_KEYS[current_key_index])
                active_model = MODELS[current_model_index]
                
                response = client.models.generate_content_stream(
                    model=active_model,
                    contents=system_prompt,
                    config=types.GenerateContentConfig(temperature=0.0)
                )
                
                iterator = iter(response)
                first_chunk = next(iterator)
                
                accumulated_text = ""
                if first_chunk.text:
                    accumulated_text += first_chunk.text
                    yield first_chunk.text
                    
                for chunk in iterator:
                    if chunk.text:
                        accumulated_text += chunk.text
                        yield chunk.text
                        
                mongo_service.save_message(workspace_id, user_id, role="ai", text=accumulated_text)
                return

            except Exception as e:
                error_str = str(e).lower()
                if "404" in error_str or "not found" in error_str:
                    current_model_index = (current_model_index + 1) % len(MODELS)
                    attempts += 1
                    continue
                elif "429" in error_str or "quota" in error_str or "exhausted" in error_str or "401" in error_str or "unauthenticated" in error_str or "stopiteration" in error_str:
                    current_key_index = (current_key_index + 1) % len(API_KEYS)
                    attempts += 1
                    time.sleep(1)
                    continue
                else:
                    error_msg = f"\n\n❌ Chat Error: {str(e)}"
                    mongo_service.save_message(workspace_id, user_id, role="ai", text=error_msg)
                    yield error_msg
                    return

        error_msg = "❌ All Gemini API keys or models have been exhausted."
        mongo_service.save_message(workspace_id, user_id, role="ai", text=error_msg)
        yield error_msg

    @staticmethod
    def generate_artifact(workspace_id, user_query, artifact_type='markdown', selected_doc_ids=None):
        context_results = VectorStoreService.query_workspace_context(
            workspace_id=workspace_id, 
            query_text=user_query, 
            n_results=20,
            selected_doc_ids=selected_doc_ids,
            distance_threshold=2.0
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
            1. Use clean, minimal markdown spacing. 
            2. STRICTLY PROHIBITED: Do not use horizontal rules (---).
            3. STRICTLY PROHIBITED: Do not overuse headings (###). Use bold text for emphasis instead of heavy headers.
            4. Ensure inline code `ticks` have spaces around them.

            {formatted_context}
            User Artifact Request: {user_query}
            """

        return AIEngine._execute_with_fallback(system_prompt)