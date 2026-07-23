import pymongo
from django.conf import settings

class ChatMemoryService:
    def __init__(self):
        """
        Initializes the MongoDB connection. 
        This is where self.collection is created so the other functions can use it!
        """
        # Connect to your local MongoDB instance
        self.client = pymongo.MongoClient('mongodb://localhost:27017/')
        
        # Connect to the database and collection based on your provided JSON structure
        self.db = self.client['academic_workspace_db']
        self.collection = self.db['chat_history']

    def get_chat_history(self, workspace_id, user_id=None):
        """
        Fetches the complete group chat history for a workspace.
        We intentionally IGNORE the user_id here so everyone in the workspace sees the same chat!
        """
        # Querying self.collection will now work perfectly
        docs = self.collection.find({'workspace_id': str(workspace_id)}).sort('_id', 1)
        return list(docs)

    def save_message(self, workspace_id, user_id, role, text):
        """
        Saves a new message to the workspace group chat.
        """
        self.collection.insert_one({
            'workspace_id': str(workspace_id),
            'user_id': str(user_id),
            'role': role,
            'text': text
        })