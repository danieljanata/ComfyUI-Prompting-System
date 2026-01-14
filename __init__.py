"""
ComfyUI Prompting System
A comprehensive prompt management system for ComfyUI with database storage and thumbnail support.
"""

import os
import sys
from pathlib import Path

# Add this directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

# Import nodes
from nodes.prompt_saver import PromptSaverNode
from nodes.smart_text_input import SmartTextInputNode
from nodes.prompt_library_browser import PromptLibraryBrowserNode
from nodes.export_manager import ExportManagerNode

# ComfyUI Node Registration
NODE_CLASS_MAPPINGS = {
    "PromptSaver": PromptSaverNode,
    "SmartTextInput": SmartTextInputNode,
    "PromptLibraryBrowser": PromptLibraryBrowserNode,
    "ExportManager": ExportManagerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptSaver": "💾 Prompt Saver",
    "SmartTextInput": "✏️ Smart Text Input",
    "PromptLibraryBrowser": "📚 Prompt Library Browser",
    "ExportManager": "📤 Export Manager",
}

# Web directory for UI components
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# Print loaded info
print("=" * 60)
print("🎨 ComfyUI Prompting System Loaded!")
print("=" * 60)
print("Nodes loaded:")
for node_name, display_name in NODE_DISPLAY_NAME_MAPPINGS.items():
    print(f"  • {display_name}")
print("=" * 60)
