from dataclasses import dataclass
import re


SKILL_LEVEL_ORDER = {"strong": 0, "moderate": 1, "learning": 2}

SKILL_ALIASES = {
    "@prisma/client": "Prisma",
    "@supabase/ssr": "Supabase",
    "@supabase/supabase-js": "Supabase",
    "angular": "Angular",
    "docker": "Docker",
    "express": "Express",
    "fastapi": "FastAPI",
    "fastify": "Fastify",
    "go": "Go",
    "golang": "Go",
    "graphql": "GraphQL",
    "javascript": "JavaScript",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "mongodb": "MongoDB",
    "mongoose": "MongoDB",
    "nest": "NestJS",
    "nestjs": "NestJS",
    "next": "Next.js",
    "nextjs": "Next.js",
    "node": "Node.js",
    "nodejs": "Node.js",
    "pg": "PostgreSQL",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "prisma": "Prisma",
    "python": "Python",
    "react": "React",
    "redis": "Redis",
    "rust": "Rust",
    "supabase": "Supabase",
    "svelte": "Svelte",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "trpc": "tRPC",
    "typescript": "TypeScript",
    "vite": "Vite",
    "vue": "Vue",
}

ACRONYM_ALIASES = {
    "api": "API",
    "cli": "CLI",
    "css": "CSS",
    "dom": "DOM",
    "html": "HTML",
    "http": "HTTP",
    "js": "JS",
    "json": "JSON",
    "sql": "SQL",
    "ts": "TS",
    "ui": "UI",
    "url": "URL",
}


@dataclass
class CanonicalSkill:
    name: str
    level: str = "learning"
    confidence: float = 0.5
    repoCount: int = 0
    commitCount: int = 0


def skill_identity(value: str) -> str:
    return alias_key(normalize_skill_name(value))


def alias_key(value: str) -> str:
    key = value.strip().lower()
    key = re.sub(r"^@", "", key)
    key = re.sub(r"^types/", "", key)
    key = re.sub(r"^@?trpc/.*", "trpc", key)
    key = re.sub(r"^@?supabase/.*", "supabase", key)
    key = re.sub(r"^@?prisma/.*", "prisma", key)
    key = re.sub(r"\.js$", "js", key)
    key = re.sub(r"[\s._-]+", "", key)
    return key


def package_stem(value: str) -> str:
    return value.strip().lstrip("@").split("/")[-1]


def title_token(token: str) -> str:
    lower = token.lower()
    return ACRONYM_ALIASES.get(lower, lower[:1].upper() + lower[1:])


def normalize_skill_name(value: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        return ""

    direct = SKILL_ALIASES.get(trimmed.lower())
    if direct:
        return direct

    canonical = SKILL_ALIASES.get(alias_key(trimmed))
    if canonical:
        return canonical

    stem = package_stem(trimmed)
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", stem)
    tokens = [token for token in re.split(r"[-_./\s]+", spaced) if token]
    return " ".join(title_token(token) for token in tokens)


def canonicalize_skills(skills) -> list[CanonicalSkill]:
    by_identity: dict[str, CanonicalSkill] = {}

    for raw_skill in skills:
        if isinstance(raw_skill, CanonicalSkill):
            skill = raw_skill
        elif isinstance(raw_skill, dict):
            skill = CanonicalSkill(
                name=str(raw_skill.get("name", "")),
                level=str(raw_skill.get("level", "learning")),
                confidence=float(raw_skill.get("confidence", 0.5)),
                repoCount=int(raw_skill.get("repoCount", 0)),
                commitCount=int(raw_skill.get("commitCount", 0)),
            )
        elif isinstance(raw_skill, str):
            skill = CanonicalSkill(name=raw_skill)
        else:
            skill = CanonicalSkill(
                name=getattr(raw_skill, "name", ""),
                level=getattr(raw_skill, "level", "learning"),
                confidence=float(getattr(raw_skill, "confidence", 0.5)),
                repoCount=int(getattr(raw_skill, "repoCount", 0)),
                commitCount=int(getattr(raw_skill, "commitCount", 0)),
            )

        name = normalize_skill_name(skill.name)
        if not name:
            continue

        level = skill.level if skill.level in SKILL_LEVEL_ORDER else "learning"
        incoming = CanonicalSkill(
            name=name,
            level=level,
            confidence=max(0.0, min(1.0, skill.confidence)),
            repoCount=max(0, skill.repoCount),
            commitCount=max(0, skill.commitCount),
        )
        identity = skill_identity(name)
        existing = by_identity.get(identity)

        if not existing:
            by_identity[identity] = incoming
            continue

        by_identity[identity] = CanonicalSkill(
            name=existing.name,
            level=(
                incoming.level
                if SKILL_LEVEL_ORDER[incoming.level] < SKILL_LEVEL_ORDER[existing.level]
                else existing.level
            ),
            confidence=max(existing.confidence, incoming.confidence),
            repoCount=max(existing.repoCount, incoming.repoCount),
            commitCount=max(existing.commitCount, incoming.commitCount),
        )

    return sorted(
        by_identity.values(),
        key=lambda skill: (SKILL_LEVEL_ORDER[skill.level], skill.name.lower()),
    )


def format_skill_embedding_text(skills) -> str:
    canonical = canonicalize_skills(skills)
    if not canonical:
        return "skills: none"

    return "\n".join(
        (
            f"skill:{skill.name};level:{skill.level};"
            f"confidence:{skill.confidence:.2f};repos:{skill.repoCount};commits:{skill.commitCount}"
        )
        for skill in canonical
    )


def format_issue_embedding_text(required_skills: list[str]) -> str:
    canonical = canonicalize_skills(
        [CanonicalSkill(name=name, level="learning") for name in required_skills]
    )
    if not canonical:
        return "required-skills: none"

    return "\n".join(f"required-skill:{skill.name}" for skill in canonical)
