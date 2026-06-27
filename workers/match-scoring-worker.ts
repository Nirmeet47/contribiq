import "dotenv/config";

import { Worker, type ConnectionOptions } from "bullmq";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { scoreConfig } from "@/lib/app-config";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const connection = redis as unknown as ConnectionOptions;

const matchScoringJobSchema = z
  .object({
    issueId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
  })
  .strict()
  .refine((data) => !(data.issueId && data.userId), {
    message: "Provide either issueId or userId, not both",
  });

function interestMatchCondition() {
  return Prisma.sql`
    lower(user_interest) = lower(repo_category)
    OR (
      lower(user_interest) IN ('ai', 'ai_ml')
      AND lower(repo_category) IN ('ai', 'ai_ml', 'ml', 'ai/ml', 'machine-learning', 'machine learning')
    )
  `;
}

async function scoreMatches(scope: { issueId?: string; userId?: string }) {
  const userFilter = scope.userId
    ? Prisma.sql`AND u.id = ${scope.userId}`
    : Prisma.empty;
  const issueFilter = scope.issueId
    ? Prisma.sql`AND i.id = ${scope.issueId}`
    : Prisma.empty;

  return prisma.$executeRaw`
    WITH user_vectors AS (
      SELECT
        u.id AS user_id,
        u.interests,
        u."timeCommitment" AS time_commitment,
        se.embedding AS skill_embedding,
        COALESCE(AVG(s.confidence), 0.5) AS avg_confidence,
        array_agg(DISTINCT lower(s.name)) FILTER (WHERE s."isLanguage" = true) AS known_languages
      FROM users u
      JOIN skill_profiles sp ON sp."userId" = u.id
      JOIN skill_embeddings se ON se.skill_profile_id = sp.id
      LEFT JOIN skills s ON s."skillProfileId" = sp.id
      WHERE u.onboarded = true
        ${userFilter}
      GROUP BY u.id, u.interests, u."timeCommitment", se.embedding
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
                ON ${interestMatchCondition()}
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
        END AS diff_score,
        CASE
          WHEN i."estimatedHours" IS NULL OR i."estimatedHours" <= 0 THEN ${Prisma.raw(String(scoreConfig.missingEstimateTimeFitScore))}
          ELSE GREATEST(
            ${Prisma.raw(String(scoreConfig.minimumTimeFitScore))},
            1 - (
              ABS(
                i."estimatedHours" - CASE
                  WHEN uv.time_commitment <= ${Prisma.raw(String(scoreConfig.lightTimeCommitmentMaxHours))} THEN ${Prisma.raw(String(scoreConfig.lightPreferredIssueHours))}
                  WHEN uv.time_commitment <= ${Prisma.raw(String(scoreConfig.steadyTimeCommitmentMaxHours))} THEN ${Prisma.raw(String(scoreConfig.steadyPreferredIssueHours))}
                  ELSE ${Prisma.raw(String(scoreConfig.highPreferredIssueHours))}
                END
              ) / GREATEST(
                i."estimatedHours",
                CASE
                  WHEN uv.time_commitment <= ${Prisma.raw(String(scoreConfig.lightTimeCommitmentMaxHours))} THEN ${Prisma.raw(String(scoreConfig.lightPreferredIssueHours))}
                  WHEN uv.time_commitment <= ${Prisma.raw(String(scoreConfig.steadyTimeCommitmentMaxHours))} THEN ${Prisma.raw(String(scoreConfig.steadyPreferredIssueHours))}
                  ELSE ${Prisma.raw(String(scoreConfig.highPreferredIssueHours))}
                END,
                1
              )
            )
          )
        END AS time_fit_score,
        CASE
          WHEN r.language IS NULL THEN ${Prisma.raw("0.85")}
          WHEN lower(r.language) = ANY(uv.known_languages) THEN ${Prisma.raw("1.0")}
          ELSE ${Prisma.raw("0.4")}
        END AS lang_penalty
      FROM user_vectors uv
      CROSS JOIN issue_embeddings ie
      JOIN issues i ON i.id = ie.issue_id
      JOIN repos r ON r.id = i."repoId"
      WHERE i.classified = true
        AND i.state = 'open'::"IssueState"
        AND i.difficulty IS NOT NULL
        AND (
          r.language IS NULL
          OR lower(r.language) = ANY(uv.known_languages)
        )
        ${issueFilter}
    )
    INSERT INTO issue_matches (
      id,
      "userId",
      "issueId",
      score,
      "skillSim",
      "langPenalty",
      "interestSim",
      "diffScore",
      "createdAt",
      "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      user_id,
      issue_id,
      ((skill_sim * lang_penalty) * ${Prisma.raw(String(scoreConfig.skillWeight))}) +
        (interest_sim * ${Prisma.raw(String(scoreConfig.interestWeight))}) +
        (diff_score * ${Prisma.raw(String(scoreConfig.difficultyWeight))}) +
        (time_fit_score * ${Prisma.raw(String(scoreConfig.timeFitWeight))}),
      skill_sim,
      lang_penalty,
      interest_sim,
      diff_score,
      now(),
      now()
    FROM scored
    ON CONFLICT ("userId", "issueId")
    DO UPDATE SET
      score = EXCLUDED.score,
      "skillSim" = EXCLUDED."skillSim",
      "langPenalty" = EXCLUDED."langPenalty",
      "interestSim" = EXCLUDED."interestSim",
      "diffScore" = EXCLUDED."diffScore",
      "updatedAt" = now()
  `;
}

export const matchScoringWorker = new Worker(
  "match-scoring",
  async (job) => {
    const parsed = matchScoringJobSchema.safeParse(job.data ?? {});
    if (!parsed.success) {
      console.warn("[match-scoring] Skipping invalid job payload", {
        jobId: job.id,
        error: z.treeifyError(parsed.error),
      });
      return { skipped: true, reason: "invalid-payload" };
    }

    const scope = parsed.data;
    const result = await scoreMatches(scope);
    const scopeLabel = scope.issueId
      ? `issue:${scope.issueId}`
      : scope.userId
        ? `user:${scope.userId}`
        : "all";

    console.log("[match-scoring] Scored matches", {
      jobId: job.id,
      scope: scopeLabel,
      upserted: Number(result),
    });
    return { upserted: Number(result) };
  },
  { connection }
);
