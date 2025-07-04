"""
Backend coordinators.

Coordinators manage business object lifecycles and orchestrate between
the core wiki_arena library and the web layer.
"""

from .game_coordinator import GameCoordinator
from .task_coordinator import TaskCoordinator

__all__ = ['GameCoordinator', 'TaskCoordinator'] 