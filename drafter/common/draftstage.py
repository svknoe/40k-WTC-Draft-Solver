from enum import Enum  # standard libraries


class DraftStage(Enum):
    none, select_defender, select_attackers, discard_attacker = range(4)


def get_next_draft_stage(draft_stage):
    next_draft_stage = DraftStage((draft_stage.value + 1) % 4)
    return next_draft_stage


def get_previous_draft_stage(draft_stage):
    next_draft_stage = DraftStage((draft_stage.value - 1) % 4)
    return next_draft_stage