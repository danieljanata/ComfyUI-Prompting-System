"""Main database manager for prompt storage and retrieval"""

import json
import hashlib
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from .image_handler import ImageHandler
import sys
import os

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils.path_utils import get_database_path, normalize_path


class PromptDatabase:
    """Manages prompt database with JSON storage and base64 thumbnails"""

    VERSION = "1.0"

    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize PromptDatabase.

        Args:
            db_path: Optional custom path to database file
        """
        self.db_path = db_path or get_database_path()
        self.image_handler = ImageHandler()
        self.data = self._load_or_create()

    def _load_or_create(self) -> Dict[str, Any]:
        """Load existing database or create new one"""
        if self.db_path.exists():
            try:
                with open(self.db_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"[PromptSystem] Loaded database with {len(data.get('prompts', []))} prompts")
                    return data
            except Exception as e:
                print(f"[PromptSystem] Error loading database: {e}")
                return self._create_empty_database()
        else:
            return self._create_empty_database()

    def _create_empty_database(self) -> Dict[str, Any]:
        """Create empty database structure"""
        return {
            "version": self.VERSION,
            "created": datetime.now().isoformat(),
            "last_updated": datetime.now().isoformat(),
            "settings": {
                "auto_cleanup_enabled": True,
                "auto_cleanup_days": 30,
                "max_thumbnails": 3
            },
            "categories": [],
            "tags": [],
            "prompts": []
        }

    def save(self) -> bool:
        """Save database to disk"""
        try:
            self.data['last_updated'] = datetime.now().isoformat()

            # Ensure directory exists
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

            # Write to temporary file first, then rename (atomic operation)
            temp_path = self.db_path.with_suffix('.tmp')
            with open(temp_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)

            # Rename temp to actual file
            temp_path.replace(self.db_path)

            print(f"[PromptSystem] Database saved to {self.db_path}")
            return True

        except Exception as e:
            print(f"[PromptSystem] Error saving database: {e}")
            return False

    def _generate_hash(self, text: str) -> str:
        """Generate SHA256 hash of text"""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()

    def _get_next_id(self) -> int:
        """Get next available prompt ID"""
        if not self.data['prompts']:
            return 1
        return max(p['id'] for p in self.data['prompts']) + 1

    def add_prompt(
        self,
        text: str,
        category: str,
        tags: Optional[List[str]] = None,
        rating: int = 0,
        notes: str = "",
        image_path: Optional[str] = None
    ) -> int:
        """
        Add new prompt to database.

        Args:
            text: Prompt text
            category: Category name
            tags: List of tags
            rating: Rating 0-5
            notes: Optional notes
            image_path: Optional path to image for thumbnail

        Returns:
            Prompt ID
        """
        tags = tags or []
        prompt_hash = self._generate_hash(text)

        # Check for duplicate
        existing = self.find_by_hash(prompt_hash)
        if existing:
            print(f"[PromptSystem] Prompt already exists with ID {existing['id']}")
            return existing['id']

        # Create thumbnails if image provided
        thumbnails = []
        if image_path:
            thumb_data = self.image_handler.compress_and_encode(image_path)
            if thumb_data:
                thumbnails.append({
                    'data': thumb_data,
                    'locked': False,
                    'timestamp': datetime.now().isoformat(),
                    'source_image': str(Path(image_path).name)
                })

        # Create new prompt
        prompt_id = self._get_next_id()
        new_prompt = {
            "id": prompt_id,
            "text": text,
            "category": category,
            "tags": tags,
            "rating": rating,
            "notes": notes,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "used_count": 1,
            "hash": prompt_hash,
            "thumbnails": thumbnails,
            "generation_history": []
        }

        self.data['prompts'].append(new_prompt)

        # Update categories and tags
        if category and category not in self.data['categories']:
            self.data['categories'].append(category)

        for tag in tags:
            if tag and tag not in self.data['tags']:
                self.data['tags'].append(tag)

        self.save()
        print(f"[PromptSystem] Added new prompt with ID {prompt_id}")
        return prompt_id

    def update_prompt(
        self,
        prompt_id: int,
        text: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        rating: Optional[int] = None,
        notes: Optional[str] = None
    ) -> bool:
        """
        Update existing prompt.

        Args:
            prompt_id: Prompt ID to update
            text: New text (optional)
            category: New category (optional)
            tags: New tags (optional)
            rating: New rating (optional)
            notes: New notes (optional)

        Returns:
            True if successful
        """
        prompt = self.get_prompt(prompt_id)
        if not prompt:
            print(f"[PromptSystem] Prompt {prompt_id} not found")
            return False

        # Update fields
        if text is not None:
            prompt['text'] = text
            prompt['hash'] = self._generate_hash(text)

        if category is not None:
            prompt['category'] = category
            if category not in self.data['categories']:
                self.data['categories'].append(category)

        if tags is not None:
            prompt['tags'] = tags
            for tag in tags:
                if tag not in self.data['tags']:
                    self.data['tags'].append(tag)

        if rating is not None:
            prompt['rating'] = max(0, min(5, rating))

        if notes is not None:
            prompt['notes'] = notes

        prompt['updated_at'] = datetime.now().isoformat()

        self.save()
        print(f"[PromptSystem] Updated prompt {prompt_id}")
        return True

    def get_prompt(self, prompt_id: int) -> Optional[Dict[str, Any]]:
        """Get prompt by ID"""
        for prompt in self.data['prompts']:
            if prompt['id'] == prompt_id:
                return prompt
        return None

    def find_by_hash(self, prompt_hash: str) -> Optional[Dict[str, Any]]:
        """Find prompt by hash"""
        for prompt in self.data['prompts']:
            if prompt['hash'] == prompt_hash:
                return prompt
        return None

    def delete_prompt(self, prompt_id: int) -> bool:
        """Delete prompt by ID"""
        initial_count = len(self.data['prompts'])
        self.data['prompts'] = [p for p in self.data['prompts'] if p['id'] != prompt_id]

        if len(self.data['prompts']) < initial_count:
            self.save()
            print(f"[PromptSystem] Deleted prompt {prompt_id}")
            return True

        return False

    def add_thumbnail(self, prompt_id: int, image_path: str) -> bool:
        """
        Add thumbnail to prompt with lock/unlock mechanism.

        Args:
            prompt_id: Prompt ID
            image_path: Path to image file

        Returns:
            True if successful
        """
        prompt = self.get_prompt(prompt_id)
        if not prompt:
            return False

        max_thumbnails = self.data['settings'].get('max_thumbnails', 3)
        current_thumbnails = prompt.get('thumbnails', [])

        # Use image handler to manage thumbnails
        updated_thumbnails = self.image_handler.manage_thumbnails(
            current_thumbnails,
            image_path,
            max_thumbnails
        )

        prompt['thumbnails'] = updated_thumbnails
        prompt['updated_at'] = datetime.now().isoformat()

        self.save()
        return True

    def lock_thumbnail(self, prompt_id: int, thumbnail_index: int) -> bool:
        """Lock a thumbnail"""
        prompt = self.get_prompt(prompt_id)
        if not prompt:
            return False

        prompt['thumbnails'] = self.image_handler.lock_thumbnail(
            prompt.get('thumbnails', []),
            thumbnail_index
        )

        self.save()
        return True

    def unlock_thumbnail(self, prompt_id: int, thumbnail_index: int) -> bool:
        """Unlock a thumbnail"""
        prompt = self.get_prompt(prompt_id)
        if not prompt:
            return False

        prompt['thumbnails'] = self.image_handler.unlock_thumbnail(
            prompt.get('thumbnails', []),
            thumbnail_index
        )

        self.save()
        return True

    def add_generation_history(
        self,
        prompt_id: int,
        full_prompt: str,
        output_image: str,
        workflow_snapshot: Optional[Dict] = None
    ) -> bool:
        """
        Add generation history entry to prompt.

        Args:
            prompt_id: Prompt ID
            full_prompt: Full concatenated prompt used
            output_image: Path to output image
            workflow_snapshot: Optional workflow data

        Returns:
            True if successful
        """
        prompt = self.get_prompt(prompt_id)
        if not prompt:
            return False

        history_entry = {
            'timestamp': datetime.now().isoformat(),
            'full_prompt': full_prompt,
            'output_image': normalize_path(output_image),
            'workflow_snapshot': workflow_snapshot
        }

        if 'generation_history' not in prompt:
            prompt['generation_history'] = []

        prompt['generation_history'].append(history_entry)
        prompt['used_count'] = prompt.get('used_count', 0) + 1
        prompt['updated_at'] = datetime.now().isoformat()

        self.save()
        return True

    def search_prompts(
        self,
        search_text: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        min_rating: int = 0,
        max_results: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Search prompts with filters.

        Args:
            search_text: Text to search in prompt content
            category: Filter by category
            tags: Filter by tags (any match)
            min_rating: Minimum rating filter
            max_results: Maximum results to return

        Returns:
            List of matching prompts
        """
        results = []

        for prompt in self.data['prompts']:
            # Rating filter
            if prompt.get('rating', 0) < min_rating:
                continue

            # Category filter
            if category and prompt.get('category') != category:
                continue

            # Tags filter
            if tags:
                prompt_tags = set(prompt.get('tags', []))
                if not any(tag in prompt_tags for tag in tags):
                    continue

            # Text search
            if search_text:
                search_lower = search_text.lower()
                if search_lower not in prompt.get('text', '').lower():
                    if search_lower not in prompt.get('notes', '').lower():
                        continue

            results.append(prompt)

            if len(results) >= max_results:
                break

        # Sort by used_count and rating
        results.sort(key=lambda p: (p.get('rating', 0), p.get('used_count', 0)), reverse=True)

        return results

    def get_latest_prompt_by_category(self, category: str) -> Optional[Dict[str, Any]]:
        """Get most recent prompt in category"""
        category_prompts = [p for p in self.data['prompts'] if p.get('category') == category]

        if not category_prompts:
            return None

        # Sort by updated_at
        category_prompts.sort(key=lambda p: p.get('updated_at', ''), reverse=True)
        return category_prompts[0]

    def cleanup_old_unrated(self) -> int:
        """
        Remove old unrated prompts based on settings.

        Returns:
            Number of prompts removed
        """
        if not self.data['settings'].get('auto_cleanup_enabled', True):
            return 0

        cleanup_days = self.data['settings'].get('auto_cleanup_days', 30)
        cutoff_date = datetime.now() - timedelta(days=cleanup_days)
        cutoff_iso = cutoff_date.isoformat()

        initial_count = len(self.data['prompts'])

        # Remove prompts that are:
        # - Unrated (rating = 0)
        # - Older than cutoff date
        self.data['prompts'] = [
            p for p in self.data['prompts']
            if p.get('rating', 0) > 0 or p.get('created_at', '') > cutoff_iso
        ]

        removed = initial_count - len(self.data['prompts'])

        if removed > 0:
            self.save()
            print(f"[PromptSystem] Cleaned up {removed} old unrated prompts")

        return removed

    def merge_database(self, other_db_path: Path) -> Dict[str, int]:
        """
        Merge another database into this one.

        Logic:
        - Deduplicate by hash
        - Higher rating wins
        - Sum used_count
        - Keep older created_at
        - Merge thumbnails (keep locked + newest)

        Args:
            other_db_path: Path to other database JSON file

        Returns:
            Dictionary with merge statistics
        """
        try:
            with open(other_db_path, 'r', encoding='utf-8') as f:
                other_data = json.load(f)

            stats = {
                'added': 0,
                'merged': 0,
                'skipped': 0
            }

            for other_prompt in other_data.get('prompts', []):
                other_hash = other_prompt.get('hash')

                # Find existing by hash
                existing = self.find_by_hash(other_hash)

                if not existing:
                    # New prompt - add it
                    # Reassign ID to avoid conflicts
                    new_id = self._get_next_id()
                    other_prompt['id'] = new_id
                    self.data['prompts'].append(other_prompt)
                    stats['added'] += 1
                else:
                    # Merge with existing
                    # Higher rating wins
                    if other_prompt.get('rating', 0) > existing.get('rating', 0):
                        existing['rating'] = other_prompt['rating']

                    # Sum used_count
                    existing['used_count'] = (
                        existing.get('used_count', 0) +
                        other_prompt.get('used_count', 0)
                    )

                    # Keep older created_at
                    if other_prompt.get('created_at', '') < existing.get('created_at', ''):
                        existing['created_at'] = other_prompt['created_at']

                    # Merge thumbnails
                    existing['thumbnails'] = self.image_handler.merge_thumbnails(
                        existing.get('thumbnails', []),
                        other_prompt.get('thumbnails', []),
                        self.data['settings'].get('max_thumbnails', 3)
                    )

                    # Merge generation history
                    existing_history = existing.get('generation_history', [])
                    other_history = other_prompt.get('generation_history', [])
                    existing['generation_history'] = existing_history + other_history

                    # Update timestamp
                    existing['updated_at'] = datetime.now().isoformat()

                    stats['merged'] += 1

            # Merge categories and tags
            for cat in other_data.get('categories', []):
                if cat not in self.data['categories']:
                    self.data['categories'].append(cat)

            for tag in other_data.get('tags', []):
                if tag not in self.data['tags']:
                    self.data['tags'].append(tag)

            self.save()
            print(f"[PromptSystem] Merge complete: {stats}")
            return stats

        except Exception as e:
            print(f"[PromptSystem] Error merging database: {e}")
            return {'error': str(e)}

    def export_to_file(self, export_path: Path) -> bool:
        """Export database to file"""
        try:
            with open(export_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
            print(f"[PromptSystem] Exported database to {export_path}")
            return True
        except Exception as e:
            print(f"[PromptSystem] Error exporting database: {e}")
            return False

    def get_statistics(self) -> Dict[str, Any]:
        """Get database statistics"""
        return {
            'total_prompts': len(self.data['prompts']),
            'total_categories': len(self.data['categories']),
            'total_tags': len(self.data['tags']),
            'rated_prompts': len([p for p in self.data['prompts'] if p.get('rating', 0) > 0]),
            'unrated_prompts': len([p for p in self.data['prompts'] if p.get('rating', 0) == 0]),
            'prompts_with_thumbnails': len([p for p in self.data['prompts'] if p.get('thumbnails')]),
            'total_generations': sum(p.get('used_count', 0) for p in self.data['prompts'])
        }
