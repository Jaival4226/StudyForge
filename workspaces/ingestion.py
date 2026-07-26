# workspaces/ingestion.py

import re
from youtube_transcript_api import YouTubeTranscriptApi
import PyPDF2

class IngestionEngine:
    @staticmethod
    def process_youtube(url):
        try:
            video_id_match = re.search(r'(?:v=|/v/|youtu\.be/|/embed/)([a-zA-Z0-9_-]{11})', url)
            if not video_id_match:
                print(f"❌ Could not extract a valid YouTube Video ID from: {url}")
                return []
            
            video_id = video_id_match.group(1)
            
            try:
                ytt_api = YouTubeTranscriptApi()
                transcript_list = ytt_api.list(video_id)
                
                try:
                    fetched_transcript = transcript_list.find_transcript(['en'])
                except Exception:
                    fetched_transcript = next(iter(transcript_list))
                
                transcript = fetched_transcript.fetch()
                
            except Exception as transcript_error:
                print(f"⚠️ Could not fetch transcripts: {transcript_error}")
                return []
            
            chunks = []
            current_text = ""
            current_start = None

            for entry in transcript:
                # Safely extract start time & text whether entry is a dict or object
                if isinstance(entry, dict):
                    raw_start = entry.get('start', 0)
                    raw_text = entry.get('text', '')
                else:
                    raw_start = getattr(entry, 'start', 0)
                    raw_text = getattr(entry, 'text', '')
                
                start_time = int(raw_start)
                clean_text = raw_text.replace('\n', ' ').strip()

                if current_start is None:
                    current_start = start_time

                current_text += clean_text + " "

                # Group captions into ~25 second paragraphs for deeper context
                if (start_time - current_start >= 25) or (len(current_text) > 400):
                    hours, remainder = divmod(current_start, 3600)
                    minutes, seconds = divmod(remainder, 60)
                    loc_string = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                    db_location = f"{video_id}|{loc_string}"
                    chunk_str = f"[{loc_string}] {current_text.strip()}"

                    chunks.append({
                        "text": chunk_str,
                        "page_content": chunk_str, 
                        "source_type": "video",
                        "location": db_location, 
                        "metadata": {"source": url}
                    })
                    current_text = ""
                    current_start = None

            # Capture leftover transcript tail
            if current_text.strip() and current_start is not None:
                hours, remainder = divmod(current_start, 3600)
                minutes, seconds = divmod(remainder, 60)
                loc_string = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                db_location = f"{video_id}|{loc_string}"
                chunk_str = f"[{loc_string}] {current_text.strip()}"
                chunks.append({
                    "text": chunk_str,
                    "page_content": chunk_str, 
                    "source_type": "video",
                    "location": db_location, 
                    "metadata": {"source": url}
                })
                
            return chunks
        except Exception as e:
            print(f"❌ YouTube Extraction Error: {e}")
            return []

    @staticmethod
    def process_pdf(file_path, filename="Document"):
        try:
            chunks = []
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                for page_num in range(len(reader.pages)):
                    text = reader.pages[page_num].extract_text()
                    if text:
                        clean_text = text.replace('\n', ' ')
                        # Embed the actual filename so the AI knows what document it is reading!
                        loc_string = f"{filename}|Page {page_num + 1}"
                        chunk_str = f"[{loc_string}] {clean_text}"
                        
                        chunks.append({
                            "text": chunk_str,
                            "page_content": chunk_str,
                            "source_type": "pdf",
                            "location": loc_string,
                            "metadata": {"source": filename, "page": page_num + 1}
                        })
            return chunks
        except Exception as e:
            print(f"❌ PDF Extraction Error: {e}")
            return []