from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from mcp.types import Tool

from pydantic import BaseModel, Field

from wiki_arena.models import GameState, GameConfig, MoveMetrics, ModelConfig

class ToolCall(BaseModel):
    """
    Represents a tool call by an arbitrary language model.
    """
    model_text_response: Optional[str] = Field(None, description="The raw text response or thought process from the language model.")
    tool_name: Optional[str] = Field(None, description="The name of the tool the model chose to call.")
    tool_arguments: Optional[Dict[str, Any]] = Field(None, description="The arguments the model provided for the chosen tool.")
    # TODO(hunter): see if we can remove this or other option
    error_message: Optional[str] = Field(None, description="Any error message if the model failed to produce a valid action.")
    metrics: Optional[MoveMetrics] = Field(None, description="API call metrics")

class LanguageModel(ABC):
    """
    Abstract base class for Language Model interactions.
    """

    def __init__(self, model_config: ModelConfig):
        """
        Initializes the Language Model with a structured ModelConfig.

        Args:
            model_config: A ModelConfig object containing provider, model name, pricing, and settings.
        """
        self.model_config = model_config
        # Keep backward compatibility for now
        self.model_settings = model_config.settings
        super().__init__()

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Calculate cost based on model pricing and token usage."""
        if not self.model_config.input_cost_per_1m_tokens or not self.model_config.output_cost_per_1m_tokens:
            return 0.0
            
        input_cost = (input_tokens / 1_000_000) * self.model_config.input_cost_per_1m_tokens
        output_cost = (output_tokens / 1_000_000) * self.model_config.output_cost_per_1m_tokens
        return input_cost + output_cost

    @abstractmethod
    async def _format_tools_for_provider(
        self,
        mcp_tools: List[Dict[str, Any]],
    ) -> Any:
        """
        Convert MCP tool definitions to the provider's format.
        
        Args:
            mcp_tools: List of tool definitions in MCP format
            
        Returns:
            Tools formatted for the specific provider's API
        """
        pass

    @abstractmethod
    async def generate_response(
        self,
        tools: List[Dict[str, Any]],
        game_state: GameState,
    ) -> ToolCall:
        """
        Given the current game state and available tools, let the language model choose a tool call.

        This method should be implemented by concrete Language Model classes. It will
        typically involve:
        1. Converting tools from MCP format to provider format
        2. Formatting a prompt based on the game state (current page, target, history, rules, available tools).
        3. Sending the prompt to the Language Model provider.
        4. Parsing the AI's response to extract a tool call (name and arguments) and any textual thoughts.
        5. Returning a ToolCall object.

        Args:
            tools: List of available tools in MCP format
            game_state: The current state of the game.

        Returns:
            A ToolCall object detailing the model's chosen tool call or an error.
        """
        pass

    
