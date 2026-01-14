"""Extract metadata and prompts from ComfyUI generated images"""

import json
from pathlib import Path
from typing import Optional, Dict, Any
from PIL import Image
from PIL.PngImagePlugin import PngInfo


def extract_prompt_from_png(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Extract prompt information from ComfyUI generated PNG file.

    Args:
        image_path: Path to the PNG file

    Returns:
        Dictionary with prompt data or None if not found
    """
    try:
        img = Image.open(image_path)

        # ComfyUI stores prompt in 'prompt' metadata field
        if 'prompt' in img.info:
            prompt_data = json.loads(img.info['prompt'])
            return prompt_data

        return None

    except Exception as e:
        print(f"[PromptSystem] Error extracting prompt from {image_path}: {e}")
        return None


def extract_workflow_from_png(image_path: str) -> Optional[Dict[str, Any]]:
    """
    Extract workflow information from ComfyUI generated PNG file.

    Args:
        image_path: Path to the PNG file

    Returns:
        Dictionary with workflow data or None if not found
    """
    try:
        img = Image.open(image_path)

        # ComfyUI stores workflow in 'workflow' metadata field
        if 'workflow' in img.info:
            workflow_data = json.loads(img.info['workflow'])
            return workflow_data

        return None

    except Exception as e:
        print(f"[PromptSystem] Error extracting workflow from {image_path}: {e}")
        return None


def extract_all_text_from_prompt_data(prompt_data: Dict[str, Any]) -> str:
    """
    Extract all text prompts from prompt data structure.
    Concatenates all text inputs found in the workflow.

    Args:
        prompt_data: Prompt data dictionary from PNG metadata

    Returns:
        Concatenated prompt text
    """
    texts = []

    try:
        # Prompt data structure: {node_id: {class_type, inputs: {...}}}
        for node_id, node_data in prompt_data.items():
            if isinstance(node_data, dict) and 'inputs' in node_data:
                inputs = node_data['inputs']

                # Look for text inputs
                for key, value in inputs.items():
                    if isinstance(value, str) and key in ['text', 'prompt', 'positive', 'negative']:
                        if value.strip():
                            texts.append(value.strip())

        return ', '.join(texts)

    except Exception as e:
        print(f"[PromptSystem] Error extracting text from prompt data: {e}")
        return ""


def get_image_creation_time(image_path: str) -> Optional[float]:
    """
    Get image file creation time.

    Args:
        image_path: Path to the image file

    Returns:
        Timestamp or None
    """
    try:
        path = Path(image_path)
        if path.exists():
            return path.stat().st_mtime
        return None
    except Exception as e:
        print(f"[PromptSystem] Error getting creation time: {e}")
        return None


def scan_output_directory(output_dir: Path, limit: int = 100) -> list:
    """
    Scan output directory for recent images.

    Args:
        output_dir: Path to output directory
        limit: Maximum number of images to return

    Returns:
        List of tuples (image_path, timestamp) sorted by newest first
    """
    images = []

    try:
        # Supported image formats
        extensions = ['.png', '.jpg', '.jpeg', '.webp']

        for ext in extensions:
            for img_path in output_dir.glob(f'*{ext}'):
                timestamp = img_path.stat().st_mtime
                images.append((str(img_path), timestamp))

        # Sort by timestamp (newest first)
        images.sort(key=lambda x: x[1], reverse=True)

        return images[:limit]

    except Exception as e:
        print(f"[PromptSystem] Error scanning output directory: {e}")
        return []
