"""Prompt Library Browser Node - Browse, search, and manage prompts with UI"""

import sys
import os
import json
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import PromptDatabase
from utils.path_utils import get_database_path


class PromptLibraryBrowserNode:
    """
    Interactive prompt library browser with UI.
    Allows searching, filtering, loading, and managing prompts.
    """

    def __init__(self):
        self.db = PromptDatabase()

    @classmethod
    def INPUT_TYPES(cls):
        """Define input types"""
        db = PromptDatabase()
        categories = ["All"] + db.data.get('categories', [])
        tags = db.data.get('tags', [])

        return {
            "required": {
                "action": ([
                    "Browse",
                    "Search",
                    "Load Prompt",
                    "Upload Database",
                    "Lock Thumbnail",
                    "Unlock Thumbnail"
                ], {
                    "default": "Browse"
                }),
            },
            "optional": {
                "search_text": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "Search prompts..."
                }),
                "category_filter": (categories, {
                    "default": "All"
                }),
                "min_rating": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 5,
                    "step": 1,
                    "display": "slider"
                }),
                "prompt_id_to_load": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999999,
                    "step": 1
                }),
                "thumbnail_index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 2,
                    "step": 1,
                    "tooltip": "Thumbnail slot (0, 1, or 2)"
                }),
                "database_json": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Paste database JSON here to upload..."
                }),
                "max_results": ("INT", {
                    "default": 20,
                    "min": 1,
                    "max": 100,
                    "step": 1
                }),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "INT")
    RETURN_NAMES = ("loaded_text", "loaded_category", "results_json", "loaded_prompt_id")
    FUNCTION = "process"
    CATEGORY = "🎨 Prompting System"
    OUTPUT_NODE = True

    def process(
        self,
        action: str,
        search_text: str = "",
        category_filter: str = "All",
        min_rating: int = 0,
        prompt_id_to_load: int = 0,
        thumbnail_index: int = 0,
        database_json: str = "",
        max_results: int = 20
    ):
        """Process library browser action"""

        if action == "Browse" or action == "Search":
            # Search prompts
            search_filter = search_text if search_text else None
            cat_filter = category_filter if category_filter != "All" else None

            results = self.db.search_prompts(
                search_text=search_filter,
                category=cat_filter,
                min_rating=min_rating,
                max_results=max_results
            )

            # Convert to JSON for output
            results_json = json.dumps(results, indent=2, ensure_ascii=False)

            # Create readable summary
            summary = f"📚 Found {len(results)} prompts\n"
            summary += "=" * 50 + "\n\n"

            for prompt in results[:10]:  # Show first 10 in summary
                summary += f"ID: {prompt['id']} | ⭐ {prompt.get('rating', 0)}/5 | 🏷️  {prompt.get('category', 'N/A')}\n"
                summary += f"Text: {prompt['text'][:80]}...\n"

                if prompt.get('tags'):
                    summary += f"Tags: {', '.join(prompt['tags'])}\n"

                thumb_count = len(prompt.get('thumbnails', []))
                if thumb_count > 0:
                    locked_count = sum(1 for t in prompt['thumbnails'] if t.get('locked', False))
                    summary += f"🖼️  {thumb_count} thumbnails ({locked_count} locked)\n"

                summary += f"Used: {prompt.get('used_count', 0)}x\n"
                summary += "-" * 50 + "\n"

            if len(results) > 10:
                summary += f"\n... and {len(results) - 10} more results.\n"
                summary += "Use 'Load Prompt' action with prompt ID to load specific prompt."

            return ("", "", summary, 0)

        elif action == "Load Prompt":
            # Load specific prompt by ID
            if prompt_id_to_load == 0:
                return ("", "", "❌ Please specify a prompt ID to load.", 0)

            prompt = self.db.get_prompt(prompt_id_to_load)

            if not prompt:
                return ("", "", f"❌ Prompt ID {prompt_id_to_load} not found.", 0)

            loaded_text = prompt['text']
            loaded_category = prompt.get('category', 'Uncategorized')

            info = f"✅ Loaded Prompt ID: {prompt_id_to_load}\n"
            info += f"Category: {loaded_category}\n"
            info += f"Rating: {'⭐' * prompt.get('rating', 0)}\n"
            info += f"Tags: {', '.join(prompt.get('tags', []))}\n"
            info += f"Used: {prompt.get('used_count', 0)}x\n"
            info += f"Created: {prompt.get('created_at', 'N/A')}\n\n"

            if prompt.get('notes'):
                info += f"Notes: {prompt['notes']}\n\n"

            if prompt.get('thumbnails'):
                info += f"🖼️  {len(prompt['thumbnails'])} thumbnails available\n"

            # Return detailed JSON
            prompt_json = json.dumps(prompt, indent=2, ensure_ascii=False)

            return (loaded_text, loaded_category, info, prompt_id_to_load)

        elif action == "Upload Database":
            # Upload and merge database
            if not database_json or database_json.strip() == "":
                return ("", "", "❌ Please paste database JSON to upload.", 0)

            try:
                # Parse JSON
                uploaded_data = json.loads(database_json)

                # Save to temporary file
                temp_path = get_database_path().parent / "temp_upload.json"
                with open(temp_path, 'w', encoding='utf-8') as f:
                    json.dump(uploaded_data, f)

                # Merge with current database
                stats = self.db.merge_database(temp_path)

                # Clean up temp file
                temp_path.unlink()

                info = "✅ Database merged successfully!\n\n"
                info += f"📥 Added: {stats.get('added', 0)} new prompts\n"
                info += f"🔄 Merged: {stats.get('merged', 0)} existing prompts\n\n"
                info += "Changes:\n"
                info += "• Duplicates removed (by hash)\n"
                info += "• Ratings: higher value kept\n"
                info += "• Used counts: summed\n"
                info += "• Thumbnails: locked ones + newest unlocked kept\n"

                return ("", "", info, 0)

            except json.JSONDecodeError as e:
                return ("", "", f"❌ Invalid JSON: {str(e)}", 0)
            except Exception as e:
                return ("", "", f"❌ Upload failed: {str(e)}", 0)

        elif action == "Lock Thumbnail":
            if prompt_id_to_load == 0:
                return ("", "", "❌ Please specify a prompt ID.", 0)

            success = self.db.lock_thumbnail(prompt_id_to_load, thumbnail_index)

            if success:
                info = f"🔒 Locked thumbnail {thumbnail_index} for prompt {prompt_id_to_load}"
            else:
                info = f"❌ Failed to lock thumbnail. Check prompt ID and index."

            return ("", "", info, 0)

        elif action == "Unlock Thumbnail":
            if prompt_id_to_load == 0:
                return ("", "", "❌ Please specify a prompt ID.", 0)

            success = self.db.unlock_thumbnail(prompt_id_to_load, thumbnail_index)

            if success:
                info = f"🔓 Unlocked thumbnail {thumbnail_index} for prompt {prompt_id_to_load}"
            else:
                info = f"❌ Failed to unlock thumbnail. Check prompt ID and index."

            return ("", "", info, 0)

        return ("", "", "Unknown action", 0)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Re-execute when inputs change"""
        return kwargs.get('action', '') + str(kwargs.get('prompt_id_to_load', 0))
