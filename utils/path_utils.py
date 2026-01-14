"""Cross-platform path utilities for database and file management"""

import os
import folder_paths
from pathlib import Path
from typing import Optional


def get_comfy_dir() -> Path:
    """Get ComfyUI root directory"""
    # folder_paths is ComfyUI's built-in module
    if hasattr(folder_paths, 'base_path'):
        return Path(folder_paths.base_path)

    # Fallback: try to detect from common locations
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / 'comfy').exists() or (parent / 'nodes.py').exists():
            return parent

    # Last resort: use current working directory
    return Path.cwd()


def get_database_path() -> Path:
    """
    Get the database file path.
    Returns: Path to prompt_database.json in ./user/default/workflows/
    """
    comfy_dir = get_comfy_dir()
    db_dir = comfy_dir / "user" / "default" / "workflows"
    ensure_directory_exists(db_dir)

    return db_dir / "prompt_database.json"


def get_output_dir() -> Path:
    """Get ComfyUI output directory"""
    comfy_dir = get_comfy_dir()
    output_dir = comfy_dir / "output"

    if not output_dir.exists():
        # Try alternate locations
        if hasattr(folder_paths, 'get_output_directory'):
            return Path(folder_paths.get_output_directory())
        output_dir = comfy_dir / "outputs"

    return output_dir


def get_input_dir() -> Path:
    """Get ComfyUI input directory"""
    comfy_dir = get_comfy_dir()
    input_dir = comfy_dir / "input"

    if not input_dir.exists():
        if hasattr(folder_paths, 'get_input_directory'):
            return Path(folder_paths.get_input_directory())

    return input_dir


def ensure_directory_exists(path: Path) -> None:
    """
    Ensure a directory exists, create if it doesn't.
    Cross-platform safe.
    """
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)


def normalize_path(path: str) -> str:
    """
    Normalize path for cross-platform compatibility.
    Always uses forward slashes for storage in JSON.
    """
    return str(Path(path).as_posix())


def get_relative_path(absolute_path: Path, base_path: Optional[Path] = None) -> str:
    """
    Convert absolute path to relative path from base.
    Returns normalized string with forward slashes.
    """
    if base_path is None:
        base_path = get_comfy_dir()

    try:
        rel_path = Path(absolute_path).relative_to(base_path)
        return normalize_path(rel_path)
    except ValueError:
        # Path is not relative to base, return as-is
        return normalize_path(absolute_path)


def resolve_path(relative_path: str, base_path: Optional[Path] = None) -> Path:
    """
    Resolve a relative path to absolute path.
    Handles both forward and backward slashes.
    """
    if base_path is None:
        base_path = get_comfy_dir()

    # Convert to Path (handles both slash types)
    path = Path(relative_path)

    if path.is_absolute():
        return path

    return (base_path / path).resolve()
