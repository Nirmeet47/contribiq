import os, sys, psycopg2, psycopg2.extras
sys.path.insert(0, os.path.abspath("."))
from dotenv import load_dotenv
load_dotenv()

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE classified=true) as classified, COUNT(*) FILTER (WHERE classified=false) as unclassified FROM issues")
print("Issues:", dict(cur.fetchone()))

cur.execute("SELECT COUNT(*) as total FROM issue_embeddings")
print("Issue embeddings:", dict(cur.fetchone()))

cur.execute("SELECT COUNT(*) as total FROM repos")
print("Repos:", dict(cur.fetchone()))

cur.execute("SELECT COUNT(*) as total FROM skill_embeddings")
print("Skill embeddings:", dict(cur.fetchone()))

cur.execute("SELECT COUNT(*) as total FROM issue_matches")
print("Existing matches:", dict(cur.fetchone()))

cur.execute("""
    SELECT i.id, i.title, i.classified, i.difficulty, i.state, r.language, r."fullName"
    FROM issues i JOIN repos r ON r.id = i."repoId"
    LIMIT 5
""")
print("\nSample issues:")
for row in cur.fetchall():
    print(" ", dict(row))

cur.execute("""
    SELECT u.id, u.interests, u."timeCommitment",
           (SELECT COUNT(*) FROM skill_embeddings se JOIN skill_profiles sp ON sp.id = se.skill_profile_id WHERE sp."userId" = u.id) as has_embedding,
           array_agg(DISTINCT lower(s.name)) FILTER (WHERE s."isLanguage" = true) AS known_languages
    FROM users u
    LEFT JOIN skill_profiles sp ON sp."userId" = u.id
    LEFT JOIN skills s ON s."skillProfileId" = sp.id
    GROUP BY u.id, u.interests, u."timeCommitment"
""")
print("\nUsers:")
for row in cur.fetchall():
    print(" ", dict(row))

conn.close()