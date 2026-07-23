import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

with psycopg2.connect(os.environ["DATABASE_URL"]) as conn:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            '''
            SELECT id, username, role
            FROM users
            ORDER BY "createdAt" NULLS LAST, id
            LIMIT 10
            '''
        )
        users = [dict(row) for row in cur.fetchall()]
        print("users:", users)

        admin = next((user for user in users if user["role"] == "ADMIN"), None)
        if admin:
            print("existing admin:", admin)
        elif users:
            cur.execute(
                '''
                UPDATE users
                SET role = 'ADMIN'
                WHERE id = %s
                RETURNING id, username, role
                ''',
                (users[0]["id"],),
            )
            print("promoted admin:", dict(cur.fetchone()))
        else:
            print("no users found")
