import os
import sys
import tempfile

# Tests must never touch the real (shared) database that backend/.env points to.
# load_dotenv() does not override variables that are already set, so set this before any app import.
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.gettempdir(), "civicsense_test.db").replace("\\", "/")
os.environ["KEEP_AUDIO"] = "0"  # explicit: dotenv would otherwise load KEEP_AUDIO=1 from a developer's .env

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
