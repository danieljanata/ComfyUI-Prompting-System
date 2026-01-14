"""Prompt Saver Node - Saves prompts with metadata and lock/unlock mechanism"""

import sys
import os
from difflib import SequenceMatcher

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import PromptDatabase


class PromptSaverNode:
    """
    Node for saving prompts with category, tags, rating, and notes.
    Features lock/unlock mechanism to control when to overwrite from database.
    """

    def __init__(self):
        self.db = PromptDatabase()
        self.last_text = {}  # Store last text per node instance

    @classmethod
    def INPUT_TYPES(cls):
        """Define input types for the node"""
        db = PromptDatabase()

        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "dynamicPrompts": False
                }),
                "locked": ("BOOLEAN", {
                    "default": False,
                    "label_on": "🔒 LOCKED",
                    "label_off": "🔓 UNLOCKED (Click to lock)"
                }),
                "category": (db.data.get('categories', []) + ["+ New Category"], {
                    "default": "+ New Category"
                }),
            },
            "optional": {
                "new_category": ("STRING", {
                    "default": "",
                    "multiline": False
                }),
                "tags": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "tag1, tag2, tag3"
                }),
                "rating": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 5,
                    "step": 1,
                    "display": "slider"
                }),
                "notes": ("STRING", {
                    "default": "",
                    "multiline": True
                }),
                "auto_save": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Auto-save enabled",
                    "label_off": "Auto-save disabled"
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "INT")
    RETURN_NAMES = ("text", "category", "prompt_id")
    FUNCTION = "process"
    CATEGORY = "🎨 Prompting System"

    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """Calculate similarity ratio between two texts (0.0 to 1.0)"""
        return SequenceMatcher(None, text1, text2).ratio()

    def _is_complete_rewrite(self, old_text: str, new_text: str) -> bool:
        """
        Detect if text is completely rewritten.
        Returns True if similarity < 20%
        """
        if not old_text or not new_text:
            return True

        similarity = self._calculate_similarity(old_text, new_text)
        return similarity < 0.2

    def process(
        self,
        text: str,
        locked: bool,
        category: str,
        new_category: str = "",
        tags: str = "",
        rating: int = 0,
        notes: str = "",
        auto_save: bool = True
    ):
        """
        Main processing function.

        Logic:
        - If unlocked: Load latest prompt from category and overwrite text
        - If locked: Save current text (new or update based on similarity)
        """
        # Resolve category
        if category == "+ New Category" and new_category:
            category = new_category
        elif category == "+ New Category":
            category = "Uncategorized"

        # Parse tags
        tag_list = [t.strip() for t in tags.split(',') if t.strip()]

        # Get node instance ID for tracking
        node_id = id(self)

        if not locked:
            # UNLOCKED MODE: Load latest prompt from database
            latest_prompt = self.db.get_latest_prompt_by_category(category)

            if latest_prompt:
                text = latest_prompt.get('text', '')
                tags = ', '.join(latest_prompt.get('tags', []))
                rating = latest_prompt.get('rating', 0)
                notes = latest_prompt.get('notes', '')
                prompt_id = latest_prompt.get('id', 0)

                print(f"[PromptSaver] Loaded prompt ID {prompt_id} from category '{category}'")

                # Store as last text for this node
                self.last_text[node_id] = text

                return (text, category, prompt_id)
            else:
                print(f"[PromptSaver] No prompts found in category '{category}'")
                return (text, category, 0)

        else:
            # LOCKED MODE: Save current text
            if not auto_save:
                # Auto-save disabled, just return current values
                return (text, category, 0)

            last_text = self.last_text.get(node_id, "")

            # Detect if this is a new prompt or update
            if not last_text or self._is_complete_rewrite(last_text, text):
                # NEW PROMPT
                prompt_id = self.db.add_prompt(
                    text=text,
                    category=category,
                    tags=tag_list,
                    rating=rating,
                    notes=notes
                )

                print(f"[PromptSaver] Created new prompt ID {prompt_id}")

                # Update last text
                self.last_text[node_id] = text

                return (text, category, prompt_id)
            else:
                # UPDATE EXISTING - find by similarity
                # For now, update the latest prompt in category
                latest_prompt = self.db.get_latest_prompt_by_category(category)

                if latest_prompt:
                    prompt_id = latest_prompt['id']

                    self.db.update_prompt(
                        prompt_id=prompt_id,
                        text=text,
                        category=category,
                        tags=tag_list,
                        rating=rating,
                        notes=notes
                    )

                    print(f"[PromptSaver] Updated prompt ID {prompt_id}")

                    # Update last text
                    self.last_text[node_id] = text

                    return (text, category, prompt_id)
                else:
                    # No existing prompt, create new
                    prompt_id = self.db.add_prompt(
                        text=text,
                        category=category,
                        tags=tag_list,
                        rating=rating,
                        notes=notes
                    )

                    print(f"[PromptSaver] Created new prompt ID {prompt_id}")
                    self.last_text[node_id] = text

                    return (text, category, prompt_id)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Force re-execution on every run"""
        import random
        return random.random()
