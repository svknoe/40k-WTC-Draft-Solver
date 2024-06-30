from drafter.store import DraftStage

def get_dictionary_name(n: int, draft_stage: DraftStage, dictionary_type: str):
    if not (n == 4 or n == 6 or n == 8):
        raise Exception("{} is no a legal entry for n. Choose 4, 6 or 8.".format(n))

    dictionary_name = "{}_{}_player_{}_dictionary".format(dictionary_type, n, draft_stage.name)

    return dictionary_name