import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

with psycopg2.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            '''
            SELECT "indexingStatus", COUNT(*) AS count
            FROM repos
            GROUP BY "indexingStatus"
            ORDER BY "indexingStatus"
            '''
        )
        print("status_counts:", [dict(row) for row in cur.fetchall()])

        cur.execute(
            '''
            SELECT id, "fullName", "indexingStatus", "lastIndexedAt", "indexingError", "updatedAt"
            FROM repos
            WHERE "indexingStatus" = 'PENDING'
            ORDER BY "updatedAt" DESC
            LIMIT 20
            '''
        )
        print("pending_repos:", [dict(row) for row in cur.fetchall()])
