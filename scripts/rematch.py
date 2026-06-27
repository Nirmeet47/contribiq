import os, sys, psycopg2
sys.path.insert(0, os.path.abspath("."))
from dotenv import load_dotenv
load_dotenv()
from scripts.run_pipeline import step3_match

conn = psycopg2.connect(os.environ["DATABASE_URL"])
try:
    step3_match(conn)
finally:
    conn.close()

print("Done. Dashboard will refresh within 5 minutes (Redis TTL).")