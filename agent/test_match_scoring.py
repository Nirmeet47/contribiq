from agent.match_scoring import compute_match_score


def test_perfect_match_scores_one():
    assert compute_match_score(
        skill_sim=1.0,
        lang_penalty=1.0,
        interest_sim=1.0,
        diff_score=1.0,
        time_fit=1.0,
    ) == 1.0


def test_zero_inputs_score_zero():
    assert compute_match_score(
        skill_sim=0.0,
        lang_penalty=0.0,
        interest_sim=0.0,
        diff_score=0.0,
        time_fit=0.0,
    ) == 0.0


def test_language_mismatch_reduces_score():
    common = {
        "skill_sim": 0.8,
        "interest_sim": 0.7,
        "diff_score": 0.9,
        "time_fit": 0.6,
    }

    high_language_score = compute_match_score(lang_penalty=1.0, **common)
    low_language_score = compute_match_score(lang_penalty=0.2, **common)

    assert low_language_score < high_language_score


def test_skill_similarity_dominates_other_factors():
    skill_only_score = compute_match_score(
        skill_sim=1.0,
        lang_penalty=1.0,
        interest_sim=0.0,
        diff_score=0.0,
        time_fit=0.0,
    )
    everything_except_skill_score = compute_match_score(
        skill_sim=0.0,
        lang_penalty=1.0,
        interest_sim=1.0,
        diff_score=1.0,
        time_fit=1.0,
    )

    assert skill_only_score > everything_except_skill_score
