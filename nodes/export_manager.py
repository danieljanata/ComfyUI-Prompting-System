"""Export Manager Node - Export database and workflow"""

import sys
import os
import json
from pathlib import Path
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import PromptDatabase
from utils.path_utils import get_database_path, get_comfy_dir


class ExportManagerNode:
    """
    Node for exporting prompt database and workflow.
    Provides download buttons for database and workflow files.
    """

    def __init__(self):
        self.db = PromptDatabase()

    @classmethod
    def INPUT_TYPES(cls):
        """Define input types"""
        return {
            "required": {
                "export_action": ([
                    "None",
                    "Export Database",
                    "Show Statistics",
                    "Cleanup Old Prompts"
                ], {
                    "default": "None"
                }),
            },
            "optional": {
                "export_filename": ("STRING", {
                    "default": f"prompt_database_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                    "multiline": False
                }),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "prompt": "PROMPT"
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("info",)
    FUNCTION = "process"
    CATEGORY = "🎨 Prompting System"
    OUTPUT_NODE = True

    def process(
        self,
        export_action: str,
        export_filename: str = "",
        unique_id=None,
        extra_pnginfo=None,
        prompt=None
    ):
        """Process export action"""

        if export_action == "None":
            stats = self.db.get_statistics()
            info = f"📊 Database Statistics:\n"
            info += f"Total Prompts: {stats['total_prompts']}\n"
            info += f"Categories: {stats['total_categories']}\n"
            info += f"Tags: {stats['total_tags']}\n"
            info += f"Rated: {stats['rated_prompts']}\n"
            info += f"Unrated: {stats['unrated_prompts']}\n"
            info += f"With Thumbnails: {stats['prompts_with_thumbnails']}\n"
            info += f"Total Generations: {stats['total_generations']}"
            return (info,)

        elif export_action == "Export Database":
            # Export to output directory for download
            comfy_dir = get_comfy_dir()
            output_dir = comfy_dir / "output"
            output_dir.mkdir(exist_ok=True)

            if not export_filename:
                export_filename = f"prompt_database_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

            export_path = output_dir / export_filename

            success = self.db.export_to_file(export_path)

            if success:
                info = f"✅ Database exported to:\n{export_path}\n\n"
                info += f"File size: {export_path.stat().st_size / 1024:.2f} KB\n"
                info += "Check your ComfyUI output folder to download."
            else:
                info = "❌ Export failed. Check console for errors."

            return (info,)

        elif export_action == "Show Statistics":
            stats = self.db.get_statistics()

            info = "📊 Detailed Database Statistics\n"
            info += "=" * 40 + "\n\n"
            info += f"📝 Total Prompts: {stats['total_prompts']}\n"
            info += f"   ⭐ Rated: {stats['rated_prompts']}\n"
            info += f"   ☆ Unrated: {stats['unrated_prompts']}\n\n"

            info += f"📁 Categories: {stats['total_categories']}\n"
            categories = self.db.data.get('categories', [])
            for cat in categories[:10]:  # Show first 10
                cat_prompts = [p for p in self.db.data['prompts'] if p.get('category') == cat]
                info += f"   • {cat}: {len(cat_prompts)} prompts\n"

            if len(categories) > 10:
                info += f"   ... and {len(categories) - 10} more\n"

            info += f"\n🏷️  Tags: {stats['total_tags']}\n"
            tags = self.db.data.get('tags', [])
            info += f"   {', '.join(tags[:20])}\n"  # Show first 20 tags

            if len(tags) > 20:
                info += f"   ... and {len(tags) - 20} more\n"

            info += f"\n🖼️  Prompts with thumbnails: {stats['prompts_with_thumbnails']}\n"
            info += f"🎨 Total generations: {stats['total_generations']}\n\n"

            info += f"💾 Database location:\n{get_database_path()}\n"

            return (info,)

        elif export_action == "Cleanup Old Prompts":
            removed = self.db.cleanup_old_unrated()

            if removed > 0:
                info = f"🧹 Cleanup Complete!\n"
                info += f"Removed {removed} old unrated prompts.\n\n"
                stats = self.db.get_statistics()
                info += f"Remaining prompts: {stats['total_prompts']}"
            else:
                info = "✨ No cleanup needed. All prompts are either:\n"
                info += "• Rated (kept permanently)\n"
                info += "• Recent (within cleanup threshold)\n\n"
                info += f"Cleanup threshold: {self.db.data['settings']['auto_cleanup_days']} days"

            return (info,)

        return ("Unknown action",)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Re-execute when action changes"""
        return kwargs.get('export_action', 'None')
