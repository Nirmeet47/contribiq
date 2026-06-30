import os

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from redis import Redis


load_dotenv()


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute(
        """
        SELECT id, username, interests, "timeCommitment"
        FROM users
        ORDER BY "updatedAt" DESC
        """
    )
    users = cur.fetchall()
    print("\nusers")
    for user in users:
        print(dict(user))

    for user in users:
        user_id = user["id"]
        print(f"\nfeed eligibility for {user['username']} ({user_id})")
        cur.execute(
            """
            SELECT
              COUNT(*) AS all_matches,
              COUNT(*) FILTER (
                WHERE im.score >= 0.5
                  AND (im."interestSim" > 0 OR im.score >= 0.65)
              ) AS strong_any_state,
              COUNT(*) FILTER (
                WHERE im.score >= 0.5
                  AND (im."interestSim" > 0 OR im.score >= 0.65)
                  AND i.state = 'open'
              ) AS strong_open,
              COUNT(*) FILTER (
                WHERE im.score >= 0.5
                  AND (im."interestSim" > 0 OR im.score >= 0.65)
                  AND i.state = 'open'
                  AND f.id IS NULL
              ) AS dashboard_eligible,
              COUNT(DISTINCT f."issueId") AS dismissed
            FROM issue_matches im
            JOIN issues i ON i.id = im."issueId"
            LEFT JOIN issue_feedback f ON f."issueId" = i.id AND f."userId" = im."userId"
            WHERE im."userId" = %s
            """,
            (user_id,),
        )
        print(dict(cur.fetchone()))

        cur.execute(
            """
            SELECT r."fullName", i.title, im.score, im."interestSim", i.state, f.id IS NOT NULL AS dismissed
            FROM issue_matches im
            JOIN issues i ON i.id = im."issueId"
            JOIN repos r ON r.id = i."repoId"
            LEFT JOIN issue_feedback f ON f."issueId" = i.id AND f."userId" = im."userId"
            WHERE im."userId" = %s
              AND im.score >= 0.5
              AND (im."interestSim" > 0 OR im.score >= 0.65)
              AND i.state = 'open'
              AND f.id IS NULL
            ORDER BY im.score DESC
            LIMIT 10
            """,
            (user_id,),
        )
        for row in cur.fetchall():
            print(" ", dict(row))

    try:
        redis = Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        keys = sorted(redis.keys("feed*"))
        print("\nfeed cache keys")
        for key in keys[:30]:
            value = redis.get(key)
            print(key, value[:160] if value else None)
    except Exception as error:
        print("\nredis error", error)

    conn.close()


if __name__ == "__main__":
    main()
