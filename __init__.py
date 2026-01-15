"""
ComfyUI-Prompting-System
Prompt management extension with sidebar browser
"""

import os
import json
import hashlib
import base64
from datetime import datetime
from pathlib import Path
from io import BytesIO

import folder_paths
from aiohttp import web
from server import PromptServer

# ============================================================================
# DATABASE
# ============================================================================

class PromptDB:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_db()
        return cls._instance
    
    def _init_db(self):
        self.path = Path(os.path.dirname(__file__)) / "data"
        self.path.mkdir(exist_ok=True)
        self.file = self.path / "prompts.json"
        self.data = self._load()
        self._last_saved_id = None  # Track last saved prompt for overwrite logic
    
    def _load(self):
        if self.file.exists():
            try:
                with open(self.file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    data.setdefault("prompts", {})
                    data.setdefault("categories", [])
                    data.setdefault("models", [])
                    data.setdefault("tags", [])
                    return data
            except:
                pass
        return {
            "prompts": {},
            "categories": [],
            "models": [],
            "tags": []
        }
    
    def _save(self):
        with open(self.file, 'w', encoding='utf-8') as f:
            json.dump(self.data, f, indent=2, ensure_ascii=False)
    
    def _hash(self, text):
        return hashlib.sha256(text.encode()).hexdigest()[:12]
    
    def _id(self):
        import random, string
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
    
    def save_prompt(self, text, saver_id=None, model=None, category=None, tags=None):
        """
        Save prompt logic with per-saver tracking:
        - Each saver_id has its own last_saved tracking
        - If saver_id's last_saved exists → overwrite it
        - Otherwise → create new (or find by hash if duplicate)
        - Tags are STACKED (added to existing), not replaced
        """
        if not text or not text.strip():
            return None
        
        text = text.strip()
        text_hash = self._hash(text)
        now = datetime.now().isoformat()
        
        # Initialize per-saver tracking if needed
        if not hasattr(self, '_saver_last_ids'):
            self._saver_last_ids = {}
        
        # Use saver_id or 'default' for tracking
        track_key = saver_id or 'default'
        
        # Process new tags
        new_tags = []
        if tags:
            for t in tags.split(","):
                t = t.strip().lower()
                if t:
                    new_tags.append(t)
                    if t not in self.data["tags"]:
                        self.data["tags"].append(t)
        
        # Helper to merge tags (stack without duplicates)
        def merge_tags(existing, new):
            result = list(existing) if existing else []
            for t in new:
                if t not in result:
                    result.append(t)
            return result
        
        # If we have a last_saved_id for this saver, overwrite it
        last_id = self._saver_last_ids.get(track_key)
        if last_id and last_id in self.data["prompts"]:
            pid = last_id
            p = self.data["prompts"][pid]
            p["text"] = text
            p["hash"] = text_hash
            if model and model != "none":
                p["model"] = model
            if category and category != "none":
                p["category"] = category
            # Stack tags instead of replacing
            if new_tags:
                p["tags"] = merge_tags(p.get("tags", []), new_tags)
            p["updated_at"] = now
            p["used_count"] = p.get("used_count", 0) + 1
            self._save()
            print(f"[PS] Overwritten prompt {pid} (saver: {track_key})")
            return pid
        
        # Check if prompt with same hash already exists
        for pid, p in self.data["prompts"].items():
            if p.get("hash") == text_hash:
                # Update existing
                if model and model != "none":
                    p["model"] = model
                if category and category != "none":
                    p["category"] = category
                # Stack tags
                if new_tags:
                    p["tags"] = merge_tags(p.get("tags", []), new_tags)
                p["updated_at"] = now
                p["used_count"] = p.get("used_count", 0) + 1
                self._saver_last_ids[track_key] = pid
                self._save()
                print(f"[PS] Updated existing prompt {pid} (same hash, saver: {track_key})")
                return pid
        
        # Create new
        pid = self._id()
        self.data["prompts"][pid] = {
            "id": pid,
            "text": text,
            "hash": text_hash,
            "model": model if model and model != "none" else None,
            "category": category if category and category != "none" else None,
            "tags": new_tags,
            "rating": None,
            "thumbnail": None,
            "created_at": now,
            "updated_at": now,
            "used_count": 1
        }
        self._saver_last_ids[track_key] = pid
        self._save()
        print(f"[PS] Created new prompt {pid} (saver: {track_key}), _saver_last_ids now has {len(self._saver_last_ids)} entries")
        return pid
    
    def reset_last_saved(self, saver_id=None):
        """Reset last_saved_id for specific saver - next save will create new"""
        if not hasattr(self, '_saver_last_ids'):
            self._saver_last_ids = {}
        
        track_key = saver_id or 'default'
        if track_key in self._saver_last_ids:
            del self._saver_last_ids[track_key]
        print(f"[PS] Reset saver: {track_key}")
    
    def get_prompts(self, search=None, category=None, model=None, tag=None, rating_min=None, limit=50, sort="updated_at"):
        results = []
        for p in self.data["prompts"].values():
            if search and search.lower() not in p.get("text", "").lower():
                continue
            if category and category not in ["All", "none", ""] and p.get("category") != category:
                continue
            if model and model not in ["All", "none", ""] and p.get("model") != model:
                continue
            if tag and tag not in ["All", ""] and tag.lower() not in [t.lower() for t in p.get("tags", [])]:
                continue
            if rating_min and (p.get("rating") or 0) < rating_min:
                continue
            results.append(p)
        
        if sort == "rating":
            results.sort(key=lambda x: x.get("rating") or 0, reverse=True)
        elif sort == "used_count":
            results.sort(key=lambda x: x.get("used_count", 0), reverse=True)
        else:
            results.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return results[:limit]
    
    def get_prompt(self, pid):
        return self.data["prompts"].get(pid)
    
    def rate(self, pid, rating):
        if pid in self.data["prompts"]:
            self.data["prompts"][pid]["rating"] = rating if rating > 0 else None
            self._save()
            return True
        return False
    
    def delete_prompt(self, pid):
        if pid in self.data["prompts"]:
            del self.data["prompts"][pid]
            if self._last_saved_id == pid:
                self._last_saved_id = None
            self._save()
            return True
        return False
    
    def set_thumbnail(self, pid, thumbnail_base64):
        if pid in self.data["prompts"]:
            self.data["prompts"][pid]["thumbnail"] = thumbnail_base64
            self._save()
            print(f"[PS] Thumbnail set for prompt {pid}")
            return True
        print(f"[PS] Cannot set thumbnail - prompt {pid} not found")
        return False
    
    def get_all_last_saved_ids(self):
        """Get all recently saved prompt IDs (for thumbnail assignment)"""
        if not hasattr(self, '_saver_last_ids'):
            self._saver_last_ids = {}
        ids = list(self._saver_last_ids.values())
        print(f"[PS] get_all_last_saved_ids: {ids} (from {len(self._saver_last_ids)} savers)")
        return ids
    
    def register_saved_prompt(self, saver_id, prompt_id):
        """Register a prompt as recently saved (for thumbnail assignment)"""
        if not hasattr(self, '_saver_last_ids'):
            self._saver_last_ids = {}
        self._saver_last_ids[saver_id] = prompt_id
        print(f"[PS] Registered: saver={saver_id} -> prompt={prompt_id}")
    
    def update_prompt(self, pid, model=None, category=None, tags=None):
        """Update prompt metadata"""
        if pid not in self.data["prompts"]:
            return False
        
        p = self.data["prompts"][pid]
        
        if model is not None:
            p["model"] = model if model and model != "none" else None
        
        if category is not None:
            p["category"] = category if category and category != "none" else None
        
        if tags is not None:
            tag_list = []
            if tags:
                for t in tags.split(","):
                    t = t.strip().lower()
                    if t:
                        tag_list.append(t)
                        if t not in self.data["tags"]:
                            self.data["tags"].append(t)
            p["tags"] = tag_list
        
        p["updated_at"] = datetime.now().isoformat()
        self._save()
        return True
    
    def get_categories(self):
        return self.data.get("categories", [])
    
    def add_category(self, cat):
        if cat and cat not in self.data["categories"]:
            self.data["categories"].append(cat)
            self._save()
            return True
        return False
    
    def delete_category(self, cat):
        if cat in self.data["categories"]:
            self.data["categories"].remove(cat)
            self._save()
            return True
        return False
    
    def get_models(self):
        return self.data.get("models", [])
    
    def add_model(self, model):
        if model and model not in self.data.get("models", []):
            self.data.setdefault("models", []).append(model)
            self._save()
            return True
        return False
    
    def delete_model(self, model):
        if model in self.data.get("models", []):
            self.data["models"].remove(model)
            self._save()
            return True
        return False
    
    def get_tags(self):
        return self.data.get("tags", [])
    
    def get_stats(self):
        prompts = list(self.data["prompts"].values())
        return {
            "total": len(prompts),
            "rated": sum(1 for p in prompts if p.get("rating")),
            "with_thumbnail": sum(1 for p in prompts if p.get("thumbnail")),
            "categories": len(self.data.get("categories", [])),
            "models": len(self.data.get("models", [])),
            "tags": len(self.data.get("tags", []))
        }
    
    def export_data(self):
        return self.data
    
    def import_data(self, incoming):
        """Import/merge data. Newer overwrites older based on updated_at."""
        added = 0
        updated = 0
        
        for pid, p in incoming.get("prompts", {}).items():
            h = p.get("hash") or self._hash(p.get("text", ""))
            
            # Find existing by hash
            existing_id = None
            for eid, ep in self.data["prompts"].items():
                if ep.get("hash") == h:
                    existing_id = eid
                    break
            
            if existing_id:
                # Compare dates
                incoming_date = p.get("updated_at", "")
                existing_date = self.data["prompts"][existing_id].get("updated_at", "")
                if incoming_date > existing_date:
                    self.data["prompts"][existing_id].update({
                        "text": p.get("text"),
                        "model": p.get("model"),
                        "category": p.get("category"),
                        "tags": p.get("tags", []),
                        "rating": p.get("rating"),
                        "thumbnail": p.get("thumbnail"),
                        "updated_at": incoming_date,
                        "used_count": max(self.data["prompts"][existing_id].get("used_count", 0), p.get("used_count", 0))
                    })
                    updated += 1
            else:
                # Add new
                new_id = self._id()
                self.data["prompts"][new_id] = {**p, "id": new_id, "hash": h}
                added += 1
        
        # Merge categories, models, tags
        for cat in incoming.get("categories", []):
            if cat not in self.data["categories"]:
                self.data["categories"].append(cat)
        for model in incoming.get("models", []):
            if model not in self.data["models"]:
                self.data["models"].append(model)
        for tag in incoming.get("tags", []):
            if tag not in self.data["tags"]:
                self.data["tags"].append(tag)
        
        self._save()
        return {"added": added, "updated": updated}
    
    def get_last_saved_id(self):
        return self._last_saved_id


db = PromptDB()


# ============================================================================
# THUMBNAIL HELPER
# ============================================================================

def create_thumbnail(image_path, size=64):
    """Create 64x64 JPEG thumbnail as base64"""
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            # Crop to square
            w, h = img.size
            m = min(w, h)
            left = (w - m) // 2
            top = (h - m) // 2
            img = img.crop((left, top, left + m, top + m))
            img = img.resize((size, size), Image.Resampling.LANCZOS)
            
            buf = BytesIO()
            img.save(buf, format='JPEG', quality=85)
            return base64.b64encode(buf.getvalue()).decode('ascii')
    except Exception as e:
        print(f"[PS] Thumbnail error: {e}")
        return None


def capture_last_output_image():
    """Find most recent image in output dir (including subdirs) and create thumbnail for all recently saved prompts"""
    try:
        import time
        output_dir = folder_paths.get_output_directory()
        latest = None
        latest_time = 0
        
        # Search recursively in output dir
        for root, dirs, files in os.walk(output_dir):
            for f in files:
                if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    fp = os.path.join(root, f)
                    mt = os.path.getmtime(fp)
                    if mt > latest_time:
                        latest_time = mt
                        latest = fp
        
        # Only process if image is recent (within last 30 seconds)
        if latest and (time.time() - latest_time) < 30:
            # Get all recently saved prompt IDs
            recent_ids = db.get_all_last_saved_ids()
            if recent_ids:
                thumb = create_thumbnail(latest, 64)
                if thumb:
                    for pid in recent_ids:
                        db.set_thumbnail(pid, thumb)
                    print(f"[PS] Thumbnail from {os.path.basename(latest)} assigned to {len(recent_ids)} prompts: {recent_ids}")
                    return True
            else:
                print(f"[PS] No recent prompt IDs to assign thumbnail to")
        else:
            if latest:
                print(f"[PS] Latest image too old: {time.time() - latest_time:.1f}s ago")
    except Exception as e:
        print(f"[PS] Capture error: {e}")
    return False


# ============================================================================
# NODES
# ============================================================================

class SmartTextNode:
    """Text node with buttons to control save behavior."""
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "saver_id")
    FUNCTION = "process"
    CATEGORY = "Prompting-System"
    
    def process(self, text, unique_id=None):
        # Pass unique_id as saver_id for tracking
        return (text.strip() if text else "", str(unique_id) if unique_id else "")


class PromptSaverNode:
    """Saves prompts. Overwrites last saved until reset via API."""
    @classmethod
    def INPUT_TYPES(cls):
        cats = ["none"] + db.get_categories()
        models = ["none"] + db.get_models()
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            },
            "optional": {
                "saver_id": ("STRING", {"forceInput": True, "default": ""}),
                "category": (cats, {"default": "none"}),
                "model": (models, {"default": "none"}),
                "tags": ("STRING", {"default": ""}),
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "save"
    CATEGORY = "Prompting-System"
    OUTPUT_NODE = True
    
    def save(self, text, saver_id="", category="none", model="none", tags=""):
        if text and text.strip():
            pid = db.save_prompt(
                text.strip(),
                saver_id=saver_id if saver_id else None,
                model=model if model != "none" else None,
                category=category if category != "none" else None,
                tags=tags
            )
            print(f"[PS] Saved prompt {pid} (saver: {saver_id})")
        return (text,)


class MetadataReaderNode:
    @classmethod
    def INPUT_TYPES(cls):
        input_dir = folder_paths.get_input_directory()
        files = [""]
        try:
            files += sorted([f for f in os.listdir(input_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))])
        except:
            pass
        return {
            "required": {
                "image": (files, {"image_upload": True}),
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompts",)
    FUNCTION = "read"
    CATEGORY = "Prompting-System"
    
    @classmethod
    def IS_CHANGED(cls, image):
        return float("nan")
    
    def read(self, image):
        if not image:
            return ("No image selected",)
        
        import struct, zlib
        input_dir = folder_paths.get_input_directory()
        filepath = os.path.join(input_dir, image)
        
        if not os.path.exists(filepath):
            return ("File not found",)
        
        chunks = {}
        try:
            with open(filepath, 'rb') as f:
                sig = f.read(8)
                if sig != b'\x89PNG\r\n\x1a\n':
                    return ("Not a PNG file",)
                
                while True:
                    length_bytes = f.read(4)
                    if len(length_bytes) < 4:
                        break
                    length = struct.unpack('>I', length_bytes)[0]
                    chunk_type = f.read(4).decode('ascii', errors='ignore')
                    chunk_data = f.read(length)
                    f.read(4)
                    
                    if chunk_type == 'tEXt':
                        parts = chunk_data.split(b'\x00', 1)
                        if len(parts) == 2:
                            chunks[parts[0].decode('latin-1')] = parts[1].decode('latin-1', errors='replace')
                    elif chunk_type == 'zTXt':
                        parts = chunk_data.split(b'\x00', 1)
                        if len(parts) == 2:
                            try:
                                chunks[parts[0].decode('latin-1')] = zlib.decompress(parts[1][1:]).decode('utf-8', errors='replace')
                            except:
                                pass
                    if chunk_type == 'IEND':
                        break
        except Exception as e:
            return (f"Error: {e}",)
        
        prompts = []
        
        if 'workflow' in chunks:
            try:
                wf = json.loads(chunks['workflow'])
                for node in wf.get('nodes', []):
                    for w in node.get('widgets_values', []):
                        if isinstance(w, str) and len(w) > 20:
                            prompts.append(w)
            except:
                pass
        
        if 'prompt' in chunks:
            try:
                pr = json.loads(chunks['prompt'])
                for nid, node in pr.items():
                    if isinstance(node, dict):
                        inputs = node.get('inputs', {})
                        for key in ['text', 'prompt', 'positive', 'negative']:
                            val = inputs.get(key, '')
                            if isinstance(val, str) and len(val) > 10:
                                prompts.append(val)
            except:
                pass
        
        if 'parameters' in chunks:
            prompts.append(chunks['parameters'])
        
        # Dedupe
        seen = set()
        unique = []
        for p in prompts:
            if p not in seen:
                seen.add(p)
                unique.append(p)
        
        if unique:
            return ("\n\n---\n\n".join(unique),)
        return ("No prompts found in metadata",)


class MetadataCleanerNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "mode": (["clean", "custom", "clone"], {"default": "clean"}),
                "filename_prefix": ("STRING", {"default": "cleaned_"}),
                "save": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "source_image": ("IMAGE",),
                "custom_metadata": ("STRING", {"multiline": True, "default": ""}),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("images", "info")
    FUNCTION = "process"
    CATEGORY = "Prompting-System"
    OUTPUT_NODE = True
    
    def process(self, images, mode, filename_prefix, save=True, source_image=None, custom_metadata=""):
        from PIL import Image
        from PIL.PngImagePlugin import PngInfo
        import numpy as np
        
        if not save:
            return (images, "Save disabled - images passed through")
        
        output_dir = folder_paths.get_output_directory()
        
        # Handle subfolder in filename_prefix (e.g., "Cleaner/IMG")
        if '/' in filename_prefix or '\\' in filename_prefix:
            # Normalize path separators
            filename_prefix = filename_prefix.replace('\\', '/')
            parts = filename_prefix.rsplit('/', 1)
            if len(parts) == 2:
                subfolder, prefix = parts
                # Create subfolder(s) if needed
                full_subfolder = os.path.join(output_dir, subfolder)
                os.makedirs(full_subfolder, exist_ok=True)
                output_dir = full_subfolder
                filename_prefix = prefix
        
        saved_files = []
        for i in range(images.shape[0]):
            img_tensor = images[i]
            arr = 255. * img_tensor.cpu().numpy()
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
            
            pnginfo = PngInfo()
            if mode == "custom" and custom_metadata:
                pnginfo.add_text("parameters", custom_metadata)
            
            counter = 1
            while True:
                filename = f"{filename_prefix}{i:04d}_{counter:04d}.png"
                filepath = os.path.join(output_dir, filename)
                if not os.path.exists(filepath):
                    break
                counter += 1
            
            img.save(filepath, pnginfo=pnginfo)
            saved_files.append(filename)
        
        return (images, f"Saved {len(saved_files)} images (mode: {mode})")


# ============================================================================
# API ROUTES
# ============================================================================

routes = PromptServer.instance.routes

@routes.get("/ps/stats")
async def ps_stats(request):
    return web.json_response({"success": True, "stats": db.get_stats()})

@routes.get("/ps/categories")
async def ps_categories(request):
    return web.json_response({"success": True, "categories": db.get_categories()})

@routes.post("/ps/categories")
async def ps_add_category(request):
    data = await request.json()
    return web.json_response({"success": db.add_category(data.get("name", ""))})

@routes.delete("/ps/categories/{name}")
async def ps_del_category(request):
    return web.json_response({"success": db.delete_category(request.match_info["name"])})

@routes.get("/ps/models")
async def ps_models(request):
    return web.json_response({"success": True, "models": db.get_models()})

@routes.post("/ps/models")
async def ps_add_model(request):
    data = await request.json()
    return web.json_response({"success": db.add_model(data.get("name", ""))})

@routes.delete("/ps/models/{name}")
async def ps_del_model(request):
    return web.json_response({"success": db.delete_model(request.match_info["name"])})

@routes.get("/ps/tags")
async def ps_tags(request):
    return web.json_response({"success": True, "tags": db.get_tags()})

@routes.get("/ps/prompts")
async def ps_prompts(request):
    q = request.query
    results = db.get_prompts(
        search=q.get("search"),
        category=q.get("category"),
        model=q.get("model"),
        tag=q.get("tag"),
        rating_min=int(q.get("rating_min")) if q.get("rating_min") else None,
        limit=int(q.get("limit", 50)),
        sort=q.get("sort", "updated_at")
    )
    return web.json_response({"success": True, "prompts": results})

@routes.post("/ps/prompts/{pid}/rate")
async def ps_rate(request):
    data = await request.json()
    return web.json_response({"success": db.rate(request.match_info["pid"], data.get("rating", 0))})

@routes.delete("/ps/prompts/{pid}")
async def ps_delete(request):
    return web.json_response({"success": db.delete_prompt(request.match_info["pid"])})

@routes.put("/ps/prompts/{pid}")
async def ps_update(request):
    """Update prompt metadata (model, category, tags)"""
    data = await request.json()
    pid = request.match_info["pid"]
    success = db.update_prompt(
        pid,
        model=data.get("model"),
        category=data.get("category"),
        tags=data.get("tags")
    )
    return web.json_response({"success": success})

@routes.get("/ps/export")
async def ps_export(request):
    return web.json_response({"success": True, "data": db.export_data()})

@routes.post("/ps/import")
async def ps_import(request):
    data = await request.json()
    return web.json_response({"success": True, "result": db.import_data(data)})

@routes.post("/ps/capture-thumbnail")
async def ps_capture(request):
    return web.json_response({"success": capture_last_output_image()})

@routes.post("/ps/reset-last-saved")
async def ps_reset(request):
    """Reset last_saved_id for specific saver - next save will create new prompt"""
    data = await request.json() if request.body_exists else {}
    saver_id = data.get('saver_id')
    db.reset_last_saved(saver_id)
    return web.json_response({"success": True, "saver_id": saver_id})

@routes.get("/ps/download-outputs")
async def ps_download_outputs(request):
    """Download output folder as ZIP"""
    import zipfile
    from io import BytesIO
    
    output_dir = folder_paths.get_output_directory()
    
    # Create ZIP in memory
    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(output_dir):
            for file in files:
                filepath = os.path.join(root, file)
                arcname = os.path.relpath(filepath, output_dir)
                zf.write(filepath, arcname)
    
    zip_buffer.seek(0)
    
    # Return as downloadable file
    return web.Response(
        body=zip_buffer.read(),
        headers={
            'Content-Type': 'application/zip',
            'Content-Disposition': f'attachment; filename="outputs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.zip"'
        }
    )

@routes.post("/ps/upload-lora")
async def ps_upload_lora(request):
    """Upload LoRA file to models/loras folder"""
    try:
        reader = await request.multipart()
        field = await reader.next()
        
        if field.name != 'file':
            return web.json_response({"success": False, "error": "No file field"}, status=400)
        
        filename = field.filename
        if not filename.endswith(('.safetensors', '.pt', '.bin', '.ckpt')):
            return web.json_response({"success": False, "error": "Invalid file type"}, status=400)
        
        # Get loras directory
        lora_dirs = folder_paths.get_folder_paths("loras")
        if not lora_dirs:
            return web.json_response({"success": False, "error": "No loras folder found"}, status=500)
        
        lora_dir = lora_dirs[0]
        os.makedirs(lora_dir, exist_ok=True)
        
        filepath = os.path.join(lora_dir, filename)
        
        # Write file
        size = 0
        with open(filepath, 'wb') as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                size += len(chunk)
                f.write(chunk)
        
        return web.json_response({
            "success": True, 
            "filename": filename,
            "size": size,
            "path": filepath
        })
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


# ============================================================================
# NODE REGISTRATION
# ============================================================================

NODE_CLASS_MAPPINGS = {
    "PS_SmartText": SmartTextNode,
    "PS_PromptSaver": PromptSaverNode,
    "PS_MetadataReader": MetadataReaderNode,
    "PS_MetadataCleaner": MetadataCleanerNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PS_SmartText": "📝 Smart Text",
    "PS_PromptSaver": "💾 Prompt Saver",
    "PS_MetadataReader": "📖 Metadata Reader",
    "PS_MetadataCleaner": "🧹 Metadata Cleaner",
}

WEB_DIRECTORY = "./js"
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

print(f"\033[94m[Prompting-System]\033[0m Loaded | {db.get_stats()['total']} prompts")
