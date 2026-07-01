"use client";

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

export type SkillLevel = "strong" | "moderate" | "learning";

export type RadarSkill = {
  skill: string;
  level: SkillLevel;
  confidence: number;
};

const LEVEL_STYLES: Record<SkillLevel, string> = {
  strong: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  moderate: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  learning: "border-sky-500/30 bg-sky-500/10 text-sky-300",
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function SkillRadar({ skills }: { skills: RadarSkill[] }) {
  const chartData =
    skills.length > 0
      ? skills
      : [
          { skill: "Frontend", confidence: 0 },
          { skill: "Backend", confidence: 0 },
          { skill: "Testing", confidence: 0 },
        ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-zinc-100">Skill radar</h2>
        <p className="text-xs font-medium text-zinc-500">Top confidence signals</p>
      </div>
      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height={250}>
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="#3f3f46" />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <PolarAngleAxis
              dataKey="skill"
              tick={{ fill: "#a1a1aa", fontSize: 11, fontWeight: 600 }}
            />
            <Radar
              dataKey="confidence"
              stroke="#34d399"
              fill="#34d399"
              fillOpacity={0.28}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {skills.length > 0 && (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div key={skill.skill} className="flex items-center justify-between gap-3 text-xs">
              <p className="min-w-0 truncate font-bold text-zinc-200">{skill.skill}</p>
              <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold ${LEVEL_STYLES[skill.level]}`}>
                {titleCase(skill.level)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
