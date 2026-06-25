import "dotenv/config";

import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const connection = redis as unknown as ConnectionOptions;

export const matchScoringWorker = new Worker(
  "match-scoring",
  async () => {
    const result = await prisma.$executeRaw`
      WITH user_vectors AS (
        SELECT
          u.id AS user_id,
          u.interests,
          se.embedding AS skill_embedding,
          COALESCE(AVG(s.confidence), 0.5) AS avg_confidence
        FROM users u
        JOIN skill_profiles sp ON sp."userId" = u.id
        JOIN skill_embeddings se ON se.skill_profile_id = sp.id
        LEFT JOIN skills s ON s."skillProfileId" = sp.id
        WHERE u.onboarded = true
        GROUP BY u.id, u.interests, se.embedding
      ),
      scored AS (
        SELECT
          uv.user_id,
          ie.issue_id,
          GREATEST(0, LEAST(1, 1 - (uv.skill_embedding <=> ie.embedding))) AS skill_sim,
          CASE
            WHEN COALESCE(array_length(uv.interests, 1), 0) = 0
              OR COALESCE(array_length(r.categories, 1), 0) = 0
            THEN 0
            ELSE LEAST(
              1,
              (
                SELECT COUNT(*)::float
                FROM unnest(uv.interests) AS user_interest
                JOIN unnest(r.categories) AS repo_category
                  ON lower(user_interest) = lower(repo_category)
                  OR (
                    lower(user_interest) = 'ai_ml'
                    AND lower(repo_category) IN ('ai', 'ml', 'ai/ml', 'machine-learning', 'machine learning')
                  )
              ) / GREATEST(array_length(uv.interests, 1), 1)
            )
          END AS interest_sim,
          CASE
            WHEN uv.avg_confidence >= 0.75 THEN
              CASE i.difficulty
                WHEN 'advanced'::"Difficulty" THEN 1.0
                WHEN 'intermediate'::"Difficulty" THEN 0.85
                ELSE 0.65
              END
            WHEN uv.avg_confidence >= 0.45 THEN
              CASE i.difficulty
                WHEN 'intermediate'::"Difficulty" THEN 1.0
                WHEN 'beginner'::"Difficulty" THEN 0.85
                ELSE 0.65
              END
            ELSE
              CASE i.difficulty
                WHEN 'beginner'::"Difficulty" THEN 1.0
                WHEN 'intermediate'::"Difficulty" THEN 0.75
                ELSE 0.45
              END
          END AS diff_score
        FROM user_vectors uv
        CROSS JOIN issue_embeddings ie
        JOIN issues i ON i.id = ie.issue_id
        JOIN repos r ON r.id = i."repoId"
        WHERE i.classified = true
          AND i.state = 'open'::"IssueState"
          AND i.difficulty IS NOT NULL
      )
      INSERT INTO issue_matches (
        id,
        "userId",
        "issueId",
        score,
        "skillSim",
        "interestSim",
        "diffScore",
        "createdAt",
        "updatedAt"
      )
      SELECT
        gen_random_uuid()::text,
        user_id,
        issue_id,
        (skill_sim * 0.7) + (interest_sim * 0.2) + (diff_score * 0.1),
        skill_sim,
        interest_sim,
        diff_score,
        now(),
        now()
      FROM scored
      ON CONFLICT ("userId", "issueId")
      DO UPDATE SET
        score = EXCLUDED.score,
        "skillSim" = EXCLUDED."skillSim",
        "interestSim" = EXCLUDED."interestSim",
        "diffScore" = EXCLUDED."diffScore",
        "updatedAt" = now()
    `;

    return { upserted: Number(result) };
  },
  { connection }
);
