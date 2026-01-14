"""Handle image compression, base64 encoding, and thumbnail management"""

import io
import base64
from pathlib import Path
from typing import Optional, List, Dict
from PIL import Image
from datetime import datetime


class ImageHandler:
    """Manages image thumbnails with lock/unlock mechanism"""

    def __init__(self, thumbnail_size: tuple = (150, 150), quality: int = 70):
        """
        Initialize ImageHandler.

        Args:
            thumbnail_size: Tuple of (width, height) for thumbnails
            quality: JPEG quality (0-100)
        """
        self.thumbnail_size = thumbnail_size
        self.quality = quality

    def compress_and_encode(self, image_path: str) -> Optional[str]:
        """
        Compress image and encode to base64 data URI.

        Args:
            image_path: Path to source image

        Returns:
            Base64 data URI string or None on error
        """
        try:
            # Open and convert to RGB (handles RGBA, grayscale, etc.)
            img = Image.open(image_path)

            # Convert RGBA to RGB if needed
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')

            # Create thumbnail (maintains aspect ratio)
            img.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)

            # Encode to JPEG in memory
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=self.quality, optimize=True)
            buffer.seek(0)

            # Encode to base64
            img_base64 = base64.b64encode(buffer.read()).decode('utf-8')

            # Return as data URI
            return f"data:image/jpeg;base64,{img_base64}"

        except Exception as e:
            print(f"[PromptSystem] Error compressing image {image_path}: {e}")
            return None

    def decode_and_save(self, base64_data: str, output_path: str) -> bool:
        """
        Decode base64 data URI and save to file.

        Args:
            base64_data: Base64 data URI string
            output_path: Path to save the image

        Returns:
            True if successful, False otherwise
        """
        try:
            # Remove data URI prefix if present
            if base64_data.startswith('data:image'):
                base64_data = base64_data.split(',', 1)[1]

            # Decode base64
            img_data = base64.b64decode(base64_data)

            # Save to file
            with open(output_path, 'wb') as f:
                f.write(img_data)

            return True

        except Exception as e:
            print(f"[PromptSystem] Error decoding and saving image: {e}")
            return False

    def manage_thumbnails(
        self,
        current_thumbnails: List[Dict],
        new_image_path: str,
        max_thumbnails: int = 3
    ) -> List[Dict]:
        """
        Manage thumbnail slots with lock/unlock mechanism.

        Logic:
        - Unlocked slots are always replaced with the newest image
        - Locked slots are preserved
        - Maximum of max_thumbnails slots
        - When all locked and adding new, remove oldest locked

        Args:
            current_thumbnails: List of thumbnail dicts with 'data', 'locked', 'timestamp'
            new_image_path: Path to new image to add
            max_thumbnails: Maximum number of thumbnails to keep

        Returns:
            Updated list of thumbnails
        """
        # Encode new image
        new_thumbnail_data = self.compress_and_encode(new_image_path)
        if not new_thumbnail_data:
            return current_thumbnails

        new_thumbnail = {
            'data': new_thumbnail_data,
            'locked': False,
            'timestamp': datetime.now().isoformat(),
            'source_image': str(Path(new_image_path).name)
        }

        # If no thumbnails yet, just add it
        if not current_thumbnails:
            return [new_thumbnail]

        # Find unlocked slot
        unlocked_index = None
        for i, thumb in enumerate(current_thumbnails):
            if not thumb.get('locked', False):
                unlocked_index = i
                break

        # Replace unlocked slot
        if unlocked_index is not None:
            current_thumbnails[unlocked_index] = new_thumbnail
            return current_thumbnails

        # All locked - add new slot if under max
        if len(current_thumbnails) < max_thumbnails:
            current_thumbnails.append(new_thumbnail)
            return current_thumbnails

        # All locked and at max - remove oldest locked
        # Sort by timestamp, keep newest (max_thumbnails - 1), then add new
        current_thumbnails.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return current_thumbnails[:max_thumbnails - 1] + [new_thumbnail]

    def lock_thumbnail(self, thumbnails: List[Dict], index: int) -> List[Dict]:
        """
        Lock a specific thumbnail by index.

        Args:
            thumbnails: List of thumbnail dicts
            index: Index of thumbnail to lock

        Returns:
            Updated thumbnails list
        """
        if 0 <= index < len(thumbnails):
            thumbnails[index]['locked'] = True
        return thumbnails

    def unlock_thumbnail(self, thumbnails: List[Dict], index: int) -> List[Dict]:
        """
        Unlock a specific thumbnail by index.

        Args:
            thumbnails: List of thumbnail dicts
            index: Index of thumbnail to unlock

        Returns:
            Updated thumbnails list
        """
        if 0 <= index < len(thumbnails):
            thumbnails[index]['locked'] = False
        return thumbnails

    def merge_thumbnails(
        self,
        thumbnails_a: List[Dict],
        thumbnails_b: List[Dict],
        max_thumbnails: int = 3
    ) -> List[Dict]:
        """
        Merge two thumbnail lists, keeping locked ones and newest.

        Args:
            thumbnails_a: First thumbnail list
            thumbnails_b: Second thumbnail list
            max_thumbnails: Maximum thumbnails to keep

        Returns:
            Merged thumbnail list
        """
        # Collect all locked thumbnails
        locked = [t for t in thumbnails_a if t.get('locked', False)]
        locked.extend([t for t in thumbnails_b if t.get('locked', False)])

        # Remove duplicates based on data (same image)
        seen_data = set()
        unique_locked = []
        for thumb in locked:
            data_hash = hash(thumb.get('data', ''))
            if data_hash not in seen_data:
                seen_data.add(data_hash)
                unique_locked.append(thumb)

        # If more than max, keep newest locked
        if len(unique_locked) > max_thumbnails:
            unique_locked.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            return unique_locked[:max_thumbnails]

        # If under max, add newest unlocked to fill
        if len(unique_locked) < max_thumbnails:
            unlocked = [t for t in thumbnails_a if not t.get('locked', False)]
            unlocked.extend([t for t in thumbnails_b if not t.get('locked', False)])

            # Sort by timestamp, newest first
            unlocked.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

            # Add unlocked until we reach max
            for thumb in unlocked:
                if len(unique_locked) >= max_thumbnails:
                    break
                data_hash = hash(thumb.get('data', ''))
                if data_hash not in seen_data:
                    seen_data.add(data_hash)
                    unique_locked.append(thumb)

        return unique_locked
