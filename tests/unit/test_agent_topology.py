from stewart.agent import root_agent
from stewart.contracts import LORE_OUTPUT_KEY
from stewart.lore_agent import lore_agent


def test_stewart_owns_a_separate_single_turn_lore_agent() -> None:
    assert root_agent.name == "stewart"
    assert root_agent.sub_agents == [lore_agent]
    assert lore_agent is not root_agent
    assert lore_agent.name == "lore_agent"
    assert lore_agent.mode == "single_turn"
    assert lore_agent.output_key == LORE_OUTPUT_KEY


def test_parallel_search_is_available_only_to_lore() -> None:
    assert [tool.__name__ for tool in lore_agent.tools] == ["parallel_search"]
    assert [tool.name for tool in root_agent.tools] == ["lore_agent"]
    assert all(tool.name != "parallel_search" for tool in root_agent.tools)
