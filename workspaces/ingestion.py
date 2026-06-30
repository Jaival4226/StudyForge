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
            for entry in transcript:
                if isinstance(entry, dict):
                    raw_start = entry.get('start', 0)
                    raw_text = entry.get('text', '')
                else:
                    raw_start = getattr(entry, 'start', 0)
                    raw_text = getattr(entry, 'text', '')
                
                start_time = int(raw_start)
                hours, remainder = divmod(start_time, 3600)
                minutes, seconds = divmod(remainder, 60)
                
                loc_string = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
                timestamp = f"[{loc_string}]"
                text = raw_text.replace('\n', ' ')
                
                chunk_str = f"{timestamp} {text}"
                
                # --- THE MAGIC BULLET ---
                # We embed the video ID directly into the database location field.
                # ChromaDB cannot strip this out!
                db_location = f"{video_id}|{loc_string}"
                
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
    def process_pdf(file_path):
        try:
            chunks = []
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                for page_num in range(len(reader.pages)):
                    text = reader.pages[page_num].extract_text()
                    if text:
                        clean_text = text.replace('\n', ' ')
                        loc_string = f"Page {page_num + 1}"
                        chunk_str = f"[{loc_string}] {clean_text}"
                        
                        chunks.append({
                            "text": chunk_str,
                            "page_content": chunk_str,
                            "source_type": "pdf",
                            "location": loc_string,
                            "metadata": {"source": "pdf_upload", "page": page_num + 1}
                        })
            return chunks
        except Exception as e:
            print(f"❌ PDF Extraction Error: {e}")
            return []