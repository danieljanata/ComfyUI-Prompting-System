"""Smart Text Input Node - Text input with change detection"""

import sys
import os
from difflib import SequenceMatcher

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class SmartTextInputNode:
    """
    Enhanced text input node with change detection.
    Outputs text and a flag indicating if it's a complete rewrite or minor edit.
    """

    def __init__(self):
        self.previous_text = {}  # Store previous text per node instance

    @classmethod
    def INPUT_TYPES(cls):
        """Define input types"""
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "dynamicPrompts": True
                }),
            },
            "optional": {
                "similarity_threshold": ("FLOAT", {
                    "default": 0.2,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.05,
                    "display": "slider",
                    "tooltip": "Below this threshold = complete rewrite"
                }),
            }
        }

    RETURN_TYPES = ("STRING", "BOOLEAN", "FLOAT")
    RETURN_NAMES = ("text", "is_new_prompt", "similarity")
    FUNCTION = "process"
    CATEGORY = "🎨 Prompting System"

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity ratio between two texts (0.0 to 1.0)"""
        if not text1 or not text2:
            return 0.0
        return SequenceMatcher(None, text1, text2).ratio()

    def process(self, text: str, similarity_threshold: float = 0.2):
        """
        Process text input and detect changes.

        Returns:
            - text: The input text
            - is_new_prompt: True if complete rewrite detected
            - similarity: Similarity score with previous text
        """
        node_id = id(self)
        previous_text = self.previous_text.get(node_id, "")

        # Calculate similarity
        if previous_text:
            similarity = self._calculate_similarity(previous_text, text)
        else:
            similarity = 0.0

        # Detect if new prompt
        is_new_prompt = similarity < similarity_threshold

        # Update previous text
        self.previous_text[node_id] = text

        if is_new_prompt:
            print(f"[SmartTextInput] New prompt detected (similarity: {similarity:.2f})")
        else:
            print(f"[SmartTextInput] Minor edit detected (similarity: {similarity:.2f})")

        return (text, is_new_prompt, similarity)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Always re-execute to detect changes"""
        import random
        return random.random()
