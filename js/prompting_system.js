// ComfyUI-Prompting-System
// Sidebar with pagination, LoRA upload, per-node tracking, prompt editing

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ============================================================================
// Helpers
// ============================================================================
const psApi = async (path, opts = {}) => {
    try {
        const r = await fetch(`/ps${path}`, {
            headers: { "Content-Type": "application/json" },
            ...opts
        });
        return await r.json();
    } catch (e) {
        console.error("[PS] API Error:", e);
        return { success: false, error: e.message };
    }
};

const toast = (msg, type = "info") => {
    const colors = { success: "#a6e3a1", error: "#f38ba8", info: "#89b4fa" };
    const el = document.createElement("div");
    el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:8px;z-index:10001;background:${colors[type]};color:#1e1e2e;font-size:13px;font-weight:500;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
};

// LocalStorage helpers
const STORAGE_KEY = "ps_sidebar_state";
const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
};
const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
};

const getWorkflowName = () => {
    if (app.graph?.extra?.title) return app.graph.extra.title;
    if (app.graph?.name) return app.graph.name;
    const title = document.title || '';
    if (title.includes(' - ')) return title.split(' - ')[0].trim();
    return `workflow_${new Date().toISOString().slice(0,10)}`;
};

// ============================================================================
// EXTENSION
// ============================================================================
app.registerExtension({
    name: "PromptingSystem.UI",
    
    async setup() {
        app.extensionManager.registerSidebarTab({
            id: "prompting_system",
            icon: "pi pi-database",
            title: "PS",
            tooltip: "Prompting System Browser",
            type: "custom",
            render: (el) => {
                const renderSidebarContent = async () => {
                    el.innerHTML = '';
                    const savedState = loadState();
                    
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 14px; color: #fff; font-family: Arial, sans-serif;';
                    
                    // Header
                    const header = document.createElement('h3');
                    header.textContent = '✨ Prompt Browser';
                    header.style.cssText = 'margin: 0 0 14px 0; color: #cba6f7; font-size: 17px; border-bottom: 1px solid #444; padding-bottom: 10px;';
                    container.appendChild(header);
                    
                    // Stats
                    const stats = document.createElement('div');
                    stats.style.cssText = 'font-size: 13px; color: #888; margin-bottom: 12px;';
                    stats.textContent = 'Loading...';
                    container.appendChild(stats);
                    
                    // Search
                    const searchInput = document.createElement('input');
                    searchInput.type = 'text';
                    searchInput.placeholder = 'Search prompts...';
                    searchInput.value = savedState.search || '';
                    searchInput.style.cssText = 'width: 100%; padding: 10px 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; font-size: 13px; margin-bottom: 10px; box-sizing: border-box;';
                    container.appendChild(searchInput);
                    
                    // Filters
                    const filtersRow = document.createElement('div');
                    filtersRow.style.cssText = 'display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;';
                    
                    const selectStyle = 'flex: 1; min-width: 80px; padding: 8px; background: #333; border: 1px solid #444; border-radius: 5px; color: #fff; font-size: 12px;';
                    
                    const catSelect = document.createElement('select');
                    catSelect.style.cssText = selectStyle;
                    filtersRow.appendChild(catSelect);
                    
                    const modelSelect = document.createElement('select');
                    modelSelect.style.cssText = selectStyle;
                    filtersRow.appendChild(modelSelect);
                    
                    const tagSelect = document.createElement('select');
                    tagSelect.style.cssText = selectStyle;
                    filtersRow.appendChild(tagSelect);
                    
                    container.appendChild(filtersRow);
                    
                    // Results list - scrollable
                    const resultsList = document.createElement('div');
                    resultsList.style.cssText = 'max-height: 400px; overflow-y: auto; margin-bottom: 10px;';
                    container.appendChild(resultsList);
                    
                    // Pagination
                    const paginationRow = document.createElement('div');
                    paginationRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 10px; margin: 10px 0; font-size: 13px;';
                    container.appendChild(paginationRow);
                    
                    // Buttons row 1
                    const row1 = document.createElement('div');
                    row1.style.cssText = 'display: flex; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #444;';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.style.cssText = 'flex: 1; padding: 10px; background: linear-gradient(135deg, #89b4fa, #74c7ec); border: none; border-radius: 6px; color: #1e1e2e; font-weight: bold; cursor: pointer; font-size: 13px;';
                    copyBtn.onclick = () => {
                        if (selectedPromptText) {
                            navigator.clipboard.writeText(selectedPromptText);
                            toast('Copied!', 'success');
                        } else {
                            toast('Select a prompt first', 'info');
                        }
                    };
                    row1.appendChild(copyBtn);
                    
                    const refreshBtn = document.createElement('button');
                    refreshBtn.textContent = '🔄';
                    refreshBtn.style.cssText = 'padding: 10px 14px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px;';
                    refreshBtn.onclick = () => loadData();
                    row1.appendChild(refreshBtn);
                    
                    container.appendChild(row1);
                    
                    // Buttons row 2
                    const row2 = document.createElement('div');
                    row2.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';
                    
                    const btnStyle2 = 'flex: 1; padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 5px; color: #fff; cursor: pointer; font-size: 12px;';
                    
                    const wfBtn = document.createElement('button');
                    wfBtn.textContent = '📄 WF';
                    wfBtn.title = 'Download workflow';
                    wfBtn.style.cssText = btnStyle2;
                    wfBtn.onclick = () => {
                        try {
                            const wf = app.graph.serialize();
                            const name = getWorkflowName();
                            const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `${name}.json`;
                            a.click();
                            toast(`Downloaded: ${name}.json`, 'success');
                        } catch (e) {
                            toast('Failed', 'error');
                        }
                    };
                    row2.appendChild(wfBtn);
                    
                    const exportBtn = document.createElement('button');
                    exportBtn.textContent = '💾 DB';
                    exportBtn.title = 'Export prompts';
                    exportBtn.style.cssText = btnStyle2;
                    exportBtn.onclick = async () => {
                        const r = await psApi('/export');
                        if (r.success && r.data) {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
                            a.download = `prompts_${new Date().toISOString().slice(0,10)}.json`;
                            a.click();
                            toast('Exported!', 'success');
                        }
                    };
                    row2.appendChild(exportBtn);
                    
                    const importBtn = document.createElement('button');
                    importBtn.textContent = '📤 Import';
                    importBtn.style.cssText = btnStyle2;
                    importBtn.onclick = () => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.json';
                        input.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (file) {
                                try {
                                    const text = await file.text();
                                    const data = JSON.parse(text);
                                    const r = await psApi('/import', { method: 'POST', body: JSON.stringify(data) });
                                    if (r.success) {
                                        toast(`+${r.result.added} new, ${r.result.updated} updated`, 'success');
                                        loadData();
                                    }
                                } catch (e) {
                                    toast('Invalid file', 'error');
                                }
                            }
                        };
                        input.click();
                    };
                    row2.appendChild(importBtn);
                    
                    container.appendChild(row2);
                    
                    // Buttons row 3
                    const row3 = document.createElement('div');
                    row3.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';
                    
                    const outputZipBtn = document.createElement('button');
                    outputZipBtn.textContent = '📦 Outputs ZIP';
                    outputZipBtn.style.cssText = 'flex: 1; padding: 8px; background: rgba(249,226,175,0.3); border: none; border-radius: 5px; color: #1e1e2e; cursor: pointer; font-size: 12px; font-weight: 500;';
                    outputZipBtn.onclick = async () => {
                        toast('Creating ZIP...', 'info');
                        try {
                            const response = await fetch('/ps/download-outputs');
                            if (response.ok) {
                                const blob = await response.blob();
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = `outputs_${new Date().toISOString().slice(0,10)}.zip`;
                                a.click();
                                toast('Downloaded!', 'success');
                            }
                        } catch (e) {
                            toast('Failed', 'error');
                        }
                    };
                    row3.appendChild(outputZipBtn);
                    
                    const loraBtn = document.createElement('button');
                    loraBtn.textContent = '🎨 Upload LoRA';
                    loraBtn.style.cssText = 'flex: 1; padding: 8px; background: rgba(203,166,247,0.3); border: none; border-radius: 5px; color: #1e1e2e; cursor: pointer; font-size: 12px; font-weight: 500;';
                    loraBtn.onclick = () => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.safetensors,.pt,.bin,.ckpt';
                        input.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            
                            loraBtn.textContent = '⏳ 0%';
                            loraBtn.disabled = true;
                            
                            const formData = new FormData();
                            formData.append('file', file);
                            
                            try {
                                const xhr = new XMLHttpRequest();
                                xhr.open('POST', '/ps/upload-lora');
                                
                                xhr.upload.onprogress = (e) => {
                                    if (e.lengthComputable) {
                                        const pct = Math.round((e.loaded / e.total) * 100);
                                        loraBtn.textContent = `⏳ ${pct}%`;
                                    }
                                };
                                
                                xhr.onload = () => {
                                    loraBtn.textContent = '🎨 Upload LoRA';
                                    loraBtn.disabled = false;
                                    if (xhr.status === 200) {
                                        const r = JSON.parse(xhr.responseText);
                                        if (r.success) {
                                            toast(`LoRA uploaded: ${r.filename}`, 'success');
                                        } else {
                                            toast(r.error || 'Failed', 'error');
                                        }
                                    } else {
                                        toast('Upload failed', 'error');
                                    }
                                };
                                
                                xhr.onerror = () => {
                                    loraBtn.textContent = '🎨 Upload LoRA';
                                    loraBtn.disabled = false;
                                    toast('Upload failed', 'error');
                                };
                                
                                xhr.send(formData);
                            } catch (e) {
                                loraBtn.textContent = '🎨 Upload LoRA';
                                loraBtn.disabled = false;
                                toast('Upload failed', 'error');
                            }
                        };
                        input.click();
                    };
                    row3.appendChild(loraBtn);
                    
                    container.appendChild(row3);
                    
                    // Settings section
                    const settingsSection = document.createElement('div');
                    settingsSection.style.cssText = 'margin-top: 14px; padding-top: 14px; border-top: 1px solid #444;';
                    
                    // Per page setting
                    const perPageRow = document.createElement('div');
                    perPageRow.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 12px;';
                    perPageRow.innerHTML = '<span style="font-size: 12px; color: #888;">Per page:</span>';
                    
                    const perPageSelect = document.createElement('select');
                    perPageSelect.style.cssText = 'padding: 6px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 12px;';
                    [4, 8, 12, 16, 24].forEach(n => {
                        const opt = document.createElement('option');
                        opt.value = n;
                        opt.textContent = n;
                        if (n === (savedState.perPage || 8)) opt.selected = true;
                        perPageSelect.appendChild(opt);
                    });
                    perPageRow.appendChild(perPageSelect);
                    settingsSection.appendChild(perPageRow);
                    
                    // Management header
                    const mgmtHeader = document.createElement('div');
                    mgmtHeader.textContent = '⚙️ Categories & Models';
                    mgmtHeader.style.cssText = 'font-size: 13px; color: #89b4fa; margin-bottom: 10px; font-weight: bold;';
                    settingsSection.appendChild(mgmtHeader);
                    
                    // Categories
                    const catMgmt = document.createElement('div');
                    catMgmt.style.cssText = 'margin-bottom: 10px;';
                    catMgmt.innerHTML = '<div style="font-size: 11px; color: #666; margin-bottom: 4px;">Categories:</div>';
                    const catChips = document.createElement('div');
                    catChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;';
                    catMgmt.appendChild(catChips);
                    
                    const catAddRow = document.createElement('div');
                    catAddRow.style.cssText = 'display: flex; gap: 4px;';
                    const catInput = document.createElement('input');
                    catInput.placeholder = 'New category...';
                    catInput.style.cssText = 'flex: 1; padding: 6px 8px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 12px;';
                    catAddRow.appendChild(catInput);
                    const catAddBtn = document.createElement('button');
                    catAddBtn.textContent = '+';
                    catAddBtn.style.cssText = 'padding: 6px 12px; background: #89b4fa; border: none; border-radius: 4px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
                    catAddBtn.onclick = async () => {
                        if (catInput.value.trim()) {
                            await psApi('/categories', { method: 'POST', body: JSON.stringify({ name: catInput.value.trim() }) });
                            catInput.value = '';
                            loadData();
                        }
                    };
                    catAddRow.appendChild(catAddBtn);
                    catMgmt.appendChild(catAddRow);
                    settingsSection.appendChild(catMgmt);
                    
                    // Models
                    const modelMgmt = document.createElement('div');
                    modelMgmt.innerHTML = '<div style="font-size: 11px; color: #666; margin-bottom: 4px;">Models:</div>';
                    const modelChips = document.createElement('div');
                    modelChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;';
                    modelMgmt.appendChild(modelChips);
                    
                    const modelAddRow = document.createElement('div');
                    modelAddRow.style.cssText = 'display: flex; gap: 4px;';
                    const modelInput = document.createElement('input');
                    modelInput.placeholder = 'New model...';
                    modelInput.style.cssText = 'flex: 1; padding: 6px 8px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 12px;';
                    modelAddRow.appendChild(modelInput);
                    const modelAddBtn = document.createElement('button');
                    modelAddBtn.textContent = '+';
                    modelAddBtn.style.cssText = 'padding: 6px 12px; background: #89b4fa; border: none; border-radius: 4px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
                    modelAddBtn.onclick = async () => {
                        if (modelInput.value.trim()) {
                            await psApi('/models', { method: 'POST', body: JSON.stringify({ name: modelInput.value.trim() }) });
                            modelInput.value = '';
                            loadData();
                        }
                    };
                    modelAddRow.appendChild(modelAddBtn);
                    modelMgmt.appendChild(modelAddRow);
                    settingsSection.appendChild(modelMgmt);
                    
                    container.appendChild(settingsSection);
                    el.appendChild(container);
                    
                    // State
                    let currentSearch = savedState.search || '';
                    let currentCategory = savedState.category || 'All';
                    let currentModel = savedState.model || 'All';
                    let currentTag = savedState.tag || 'All';
                    let currentPage = 1;
                    let perPage = savedState.perPage || 8;
                    let selectedPromptId = null;
                    let selectedPromptText = '';
                    let allCategories = [];
                    let allModels = [];
                    
                    const persistState = () => {
                        saveState({ search: currentSearch, category: currentCategory, model: currentModel, tag: currentTag, perPage });
                    };
                    
                    // Show edit modal with chip-based tag editor
                    const showEditModal = (prompt) => {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;';
                        
                        const modal = document.createElement('div');
                        modal.style.cssText = 'background: #2a2a3a; border-radius: 12px; padding: 20px; width: 380px; max-width: 90%;';
                        
                        // Current tags state
                        let currentTags = [...(prompt.tags || [])];
                        
                        // Build modal HTML
                        modal.innerHTML = `
                            <h3 style="margin: 0 0 16px 0; color: #cba6f7; font-size: 16px;">Edit Prompt</h3>
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Category</label>
                                <select id="edit-category" style="width: 100%; padding: 10px; background: #333; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 13px;">
                                    <option value="">None</option>
                                    ${allCategories.map(c => `<option value="${c}" ${prompt.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                                </select>
                            </div>
                            <div style="margin-bottom: 12px;">
                                <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Model</label>
                                <select id="edit-model" style="width: 100%; padding: 10px; background: #333; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 13px;">
                                    <option value="">None</option>
                                    ${allModels.map(m => `<option value="${m}" ${prompt.model === m ? 'selected' : ''}>${m}</option>`).join('')}
                                </select>
                            </div>
                            <div style="margin-bottom: 16px;">
                                <label style="display: block; font-size: 12px; color: #888; margin-bottom: 4px;">Tags (type and press comma or Enter)</label>
                                <div id="tags-container" style="background: #333; border: 1px solid #444; border-radius: 6px; padding: 8px; min-height: 40px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                                    <input id="tag-input" type="text" placeholder="Add tag..." style="flex: 1; min-width: 80px; padding: 6px; background: transparent; border: none; color: #fff; font-size: 13px; outline: none;">
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <button id="edit-cancel" style="flex: 1; padding: 12px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 13px;">Cancel</button>
                                <button id="edit-save" style="flex: 1; padding: 12px; background: #89b4fa; border: none; border-radius: 6px; color: #1e1e2e; font-weight: bold; cursor: pointer; font-size: 13px;">Save</button>
                            </div>
                        `;
                        
                        overlay.appendChild(modal);
                        document.body.appendChild(overlay);
                        
                        const tagsContainer = modal.querySelector('#tags-container');
                        const tagInput = modal.querySelector('#tag-input');
                        
                        // Render tag chips
                        const renderTags = () => {
                            // Remove existing chips (keep input)
                            Array.from(tagsContainer.querySelectorAll('.tag-chip')).forEach(c => c.remove());
                            
                            // Add chips before input
                            currentTags.forEach(tag => {
                                const chip = document.createElement('span');
                                chip.className = 'tag-chip';
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(137,180,250,0.25); color: #89b4fa; border-radius: 4px; font-size: 12px;';
                                chip.innerHTML = `${tag} <span style="cursor: pointer; opacity: 0.7; font-size: 14px;">×</span>`;
                                chip.querySelector('span').onclick = () => {
                                    currentTags = currentTags.filter(t => t !== tag);
                                    renderTags();
                                };
                                tagsContainer.insertBefore(chip, tagInput);
                            });
                        };
                        
                        // Add tag function
                        const addTag = (text) => {
                            const tag = text.trim().toLowerCase();
                            if (tag && !currentTags.includes(tag)) {
                                currentTags.push(tag);
                                renderTags();
                            }
                            tagInput.value = '';
                        };
                        
                        // Initial render
                        renderTags();
                        
                        // Handle input events
                        tagInput.onkeydown = (e) => {
                            if (e.key === ',' || e.key === 'Enter') {
                                e.preventDefault();
                                addTag(tagInput.value);
                            } else if (e.key === 'Backspace' && !tagInput.value && currentTags.length > 0) {
                                // Remove last tag on backspace if input is empty
                                currentTags.pop();
                                renderTags();
                            }
                        };
                        
                        // Also handle comma in input value (for paste)
                        tagInput.oninput = () => {
                            if (tagInput.value.includes(',')) {
                                const parts = tagInput.value.split(',');
                                parts.forEach((part, i) => {
                                    if (i < parts.length - 1) {
                                        addTag(part);
                                    } else {
                                        tagInput.value = part;
                                    }
                                });
                            }
                        };
                        
                        // Click on container focuses input
                        tagsContainer.onclick = () => tagInput.focus();
                        
                        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                        modal.querySelector('#edit-cancel').onclick = () => overlay.remove();
                        modal.querySelector('#edit-save').onclick = async () => {
                            // Add any remaining text as tag
                            if (tagInput.value.trim()) {
                                addTag(tagInput.value);
                            }
                            
                            const category = modal.querySelector('#edit-category').value;
                            const model = modal.querySelector('#edit-model').value;
                            const tags = currentTags.join(',');
                            
                            await psApi(`/prompts/${prompt.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ category, model, tags })
                            });
                            
                            overlay.remove();
                            toast('Saved!', 'success');
                            loadData();
                        };
                    };
                    
                    // Load data
                    const loadData = async () => {
                        const statsRes = await psApi('/stats');
                        if (statsRes.success) {
                            stats.textContent = `📝 ${statsRes.stats.total} | ⭐ ${statsRes.stats.rated} | 🖼 ${statsRes.stats.with_thumbnail}`;
                        }
                        
                        // Categories
                        const catRes = await psApi('/categories');
                        if (catRes.success) {
                            allCategories = catRes.categories;
                            catSelect.innerHTML = '<option value="All">All Categories</option>' + 
                                catRes.categories.map(c => `<option value="${c}">${c}</option>`).join('');
                            catSelect.value = currentCategory;
                            
                            catChips.innerHTML = '';
                            catRes.categories.forEach(c => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(203,166,247,0.15); color: #cba6f7; border-radius: 4px; font-size: 11px;';
                                chip.innerHTML = `${c} <span style="cursor: pointer; opacity: 0.7;">×</span>`;
                                chip.querySelector('span').onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/categories/${encodeURIComponent(c)}`, { method: 'DELETE' });
                                    loadData();
                                };
                                catChips.appendChild(chip);
                            });
                        }
                        
                        // Models
                        const modelRes = await psApi('/models');
                        if (modelRes.success) {
                            allModels = modelRes.models;
                            modelSelect.innerHTML = '<option value="All">All Models</option>' + 
                                modelRes.models.map(m => `<option value="${m}">${m}</option>`).join('');
                            modelSelect.value = currentModel;
                            
                            modelChips.innerHTML = '';
                            modelRes.models.forEach(m => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; background: rgba(250,179,135,0.2); color: #fab387; border-radius: 4px; font-size: 11px;';
                                chip.innerHTML = `${m} <span style="cursor: pointer; opacity: 0.7;">×</span>`;
                                chip.querySelector('span').onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/models/${encodeURIComponent(m)}`, { method: 'DELETE' });
                                    loadData();
                                };
                                modelChips.appendChild(chip);
                            });
                        }
                        
                        // Tags
                        const tagRes = await psApi('/tags');
                        if (tagRes.success) {
                            tagSelect.innerHTML = '<option value="All">All Tags</option>' + 
                                tagRes.tags.map(t => `<option value="${t}">${t}</option>`).join('');
                            tagSelect.value = currentTag;
                        }
                        
                        // Prompts
                        const params = new URLSearchParams();
                        if (currentSearch) params.append('search', currentSearch);
                        if (currentCategory !== 'All') params.append('category', currentCategory);
                        if (currentModel !== 'All') params.append('model', currentModel);
                        if (currentTag !== 'All') params.append('tag', currentTag);
                        params.append('limit', '500');
                        
                        const promptsRes = await psApi(`/prompts?${params}`);
                        resultsList.innerHTML = '';
                        
                        if (!promptsRes.success || !promptsRes.prompts?.length) {
                            resultsList.innerHTML = '<div style="text-align: center; padding: 30px; color: #666; font-size: 13px;">No prompts found</div>';
                            paginationRow.innerHTML = '';
                            return;
                        }
                        
                        const allPrompts = promptsRes.prompts;
                        const totalPages = Math.ceil(allPrompts.length / perPage);
                        currentPage = Math.min(currentPage, totalPages);
                        
                        const startIdx = (currentPage - 1) * perPage;
                        const pagePrompts = allPrompts.slice(startIdx, startIdx + perPage);
                        
                        // Render prompts - FULL TEXT, variable height
                        pagePrompts.forEach(p => {
                            const card = document.createElement('div');
                            card.style.cssText = `display: flex; gap: 10px; background: rgba(255,255,255,0.03); border: 2px solid ${selectedPromptId === p.id ? '#cba6f7' : 'rgba(255,255,255,0.08)'}; border-radius: 8px; padding: 12px; margin-bottom: 10px; cursor: pointer; transition: border-color 0.15s;`;
                            
                            card.onclick = () => {
                                selectedPromptId = p.id;
                                selectedPromptText = p.text;
                                navigator.clipboard.writeText(p.text);
                                toast('Copied!', 'success');
                                loadData();
                            };
                            
                            const content = document.createElement('div');
                            content.style.cssText = 'flex: 1; min-width: 0;';
                            
                            // Tags row
                            const topRow = document.createElement('div');
                            topRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap; align-items: center;';
                            
                            if (p.model) {
                                const tag = document.createElement('span');
                                tag.style.cssText = 'background: rgba(250,179,135,0.2); color: #fab387; padding: 2px 6px; border-radius: 4px; font-size: 10px;';
                                tag.textContent = p.model;
                                topRow.appendChild(tag);
                            }
                            if (p.category) {
                                const tag = document.createElement('span');
                                tag.style.cssText = 'background: rgba(203,166,247,0.15); color: #cba6f7; padding: 2px 6px; border-radius: 4px; font-size: 10px;';
                                tag.textContent = p.category;
                                topRow.appendChild(tag);
                            }
                            if (p.tags && p.tags.length) {
                                p.tags.forEach(t => {
                                    const tag = document.createElement('span');
                                    tag.style.cssText = 'background: rgba(137,180,250,0.15); color: #89b4fa; padding: 2px 6px; border-radius: 4px; font-size: 10px;';
                                    tag.textContent = t;
                                    topRow.appendChild(tag);
                                });
                            }
                            
                            // Edit button
                            const editBtn = document.createElement('span');
                            editBtn.textContent = '✏️';
                            editBtn.title = 'Edit';
                            editBtn.style.cssText = 'cursor: pointer; margin-left: auto; font-size: 12px; opacity: 0.6;';
                            editBtn.onclick = (e) => {
                                e.stopPropagation();
                                showEditModal(p);
                            };
                            topRow.appendChild(editBtn);
                            
                            content.appendChild(topRow);
                            
                            // FULL TEXT - no truncation
                            const textDiv = document.createElement('div');
                            textDiv.style.cssText = 'font-size: 13px; color: #cdd6f4; line-height: 1.5; margin-bottom: 8px; word-break: break-word;';
                            textDiv.textContent = p.text;
                            content.appendChild(textDiv);
                            
                            // Bottom row - stars + delete
                            const bottomRow = document.createElement('div');
                            bottomRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';
                            
                            // Stars
                            const starsDiv = document.createElement('span');
                            starsDiv.style.cssText = 'color: #f9e2af; font-size: 14px;';
                            for (let i = 1; i <= 5; i++) {
                                const star = document.createElement('span');
                                star.textContent = '★';
                                star.style.cssText = `cursor: pointer; opacity: ${i <= (p.rating || 0) ? 1 : 0.3}; transition: opacity 0.1s;`;
                                star.onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/prompts/${p.id}/rate`, { method: 'POST', body: JSON.stringify({ rating: i === p.rating ? 0 : i }) });
                                    loadData();
                                };
                                starsDiv.appendChild(star);
                            }
                            bottomRow.appendChild(starsDiv);
                            
                            // Spacer
                            const spacer = document.createElement('span');
                            spacer.style.cssText = 'flex: 1;';
                            bottomRow.appendChild(spacer);
                            
                            // Delete
                            const delBtn = document.createElement('span');
                            delBtn.textContent = '🗑️';
                            delBtn.style.cssText = 'cursor: pointer; opacity: 0.5; font-size: 14px;';
                            delBtn.onclick = async (e) => {
                                e.stopPropagation();
                                if (confirm('Delete this prompt?')) {
                                    await psApi(`/prompts/${p.id}`, { method: 'DELETE' });
                                    loadData();
                                }
                            };
                            bottomRow.appendChild(delBtn);
                            
                            content.appendChild(bottomRow);
                            card.appendChild(content);
                            
                            // Thumbnail
                            if (p.thumbnail) {
                                const thumbDiv = document.createElement('div');
                                thumbDiv.style.cssText = 'width: 70px; height: 70px; background: rgba(255,255,255,0.05); border-radius: 6px; flex-shrink: 0; overflow: hidden;';
                                const img = document.createElement('img');
                                img.src = `data:image/jpeg;base64,${p.thumbnail}`;
                                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                                thumbDiv.appendChild(img);
                                card.appendChild(thumbDiv);
                            }
                            
                            resultsList.appendChild(card);
                        });
                        
                        // Pagination
                        paginationRow.innerHTML = '';
                        if (totalPages > 1) {
                            const prevBtn = document.createElement('button');
                            prevBtn.textContent = '◀ Prev';
                            prevBtn.disabled = currentPage === 1;
                            prevBtn.style.cssText = 'padding: 6px 12px; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 12px;';
                            prevBtn.onclick = () => { currentPage--; loadData(); };
                            paginationRow.appendChild(prevBtn);
                            
                            const pageInfo = document.createElement('span');
                            pageInfo.textContent = `${currentPage} / ${totalPages}`;
                            pageInfo.style.cssText = 'color: #888; font-size: 13px;';
                            paginationRow.appendChild(pageInfo);
                            
                            const nextBtn = document.createElement('button');
                            nextBtn.textContent = 'Next ▶';
                            nextBtn.disabled = currentPage === totalPages;
                            nextBtn.style.cssText = 'padding: 6px 12px; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 12px;';
                            nextBtn.onclick = () => { currentPage++; loadData(); };
                            paginationRow.appendChild(nextBtn);
                        }
                    };
                    
                    // Event listeners
                    let searchTimeout;
                    searchInput.oninput = () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            currentSearch = searchInput.value;
                            currentPage = 1;
                            persistState();
                            loadData();
                        }, 300);
                    };
                    
                    catSelect.onchange = () => { currentCategory = catSelect.value; currentPage = 1; persistState(); loadData(); };
                    modelSelect.onchange = () => { currentModel = modelSelect.value; currentPage = 1; persistState(); loadData(); };
                    tagSelect.onchange = () => { currentTag = tagSelect.value; currentPage = 1; persistState(); loadData(); };
                    perPageSelect.onchange = () => { perPage = parseInt(perPageSelect.value); currentPage = 1; persistState(); loadData(); };
                    
                    loadData();
                };
                
                renderSidebarContent();
            }
        });
        
        // Capture thumbnail after execution
        api.addEventListener("executed", async () => {
            setTimeout(async () => {
                await psApi("/capture-thumbnail", { method: "POST" });
            }, 1500);
        });
    },
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Smart Text - canvas buttons with per-node reset
        if (nodeData.name === "PS_SmartText") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const node = this;
                
                node._psButtons = [
                    { emoji: '📋', x: 0, w: 22, title: 'Paste & NEW', color: 'rgba(137,180,250,0.6)' },
                    { emoji: '🗑', x: 24, w: 22, title: 'Clear & NEW', color: 'rgba(243,139,168,0.6)' },
                    { emoji: '💾', x: 48, w: 22, title: 'Mark NEW', color: 'rgba(166,227,161,0.6)' }
                ];
                node._psBtnY = 4;
                node._psBtnH = 20;
                
                setTimeout(() => {
                    const textWidget = this.widgets?.find(w => w.name === 'text');
                    if (textWidget && textWidget.inputEl) {
                        textWidget.inputEl.style.marginTop = '4px';
                    }
                }, 50);
            };
            
            const onDrawBackground = nodeType.prototype.onDrawBackground;
            nodeType.prototype.onDrawBackground = function(ctx) {
                if (onDrawBackground) onDrawBackground.apply(this, arguments);
                this.widgets_start_y = 26;
            };
            
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                
                if (!this._psButtons) return;
                
                const startX = 10;
                const y = this._psBtnY;
                
                this._psButtons.forEach(btn => {
                    ctx.fillStyle = btn.hover ? btn.color.replace('0.6', '0.9') : btn.color;
                    ctx.beginPath();
                    ctx.roundRect(startX + btn.x, y, btn.w, this._psBtnH, 4);
                    ctx.fill();
                    
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff';
                    ctx.fillText(btn.emoji, startX + btn.x + btn.w/2, y + this._psBtnH/2);
                });
            };
            
            const onMouseDown = nodeType.prototype.onMouseDown;
            nodeType.prototype.onMouseDown = function(e, localPos, graphCanvas) {
                if (this._psButtons) {
                    const startX = 10;
                    const y = this._psBtnY;
                    
                    for (let i = 0; i < this._psButtons.length; i++) {
                        const btn = this._psButtons[i];
                        if (localPos[0] >= startX + btn.x && 
                            localPos[0] <= startX + btn.x + btn.w &&
                            localPos[1] >= y && 
                            localPos[1] <= y + this._psBtnH) {
                            this._handlePsButton(i);
                            return true;
                        }
                    }
                }
                if (onMouseDown) return onMouseDown.apply(this, arguments);
            };
            
            nodeType.prototype._handlePsButton = async function(index) {
                const textWidget = this.widgets?.find(w => w.name === 'text');
                const nodeId = this.id;
                
                const resetForNew = async () => {
                    await psApi('/reset-last-saved', { 
                        method: 'POST', 
                        body: JSON.stringify({ saver_id: String(nodeId) })
                    });
                };
                
                if (index === 0) { // Paste
                    const text = await navigator.clipboard.readText();
                    if (textWidget) {
                        textWidget.value = text;
                        await resetForNew();
                        app.graph.setDirtyCanvas(true);
                        toast('Pasted! Next = NEW', 'info');
                    }
                } else if (index === 1) { // Clear
                    if (textWidget) {
                        textWidget.value = '';
                        await resetForNew();
                        app.graph.setDirtyCanvas(true);
                        toast('Cleared! Next = NEW', 'info');
                    }
                } else if (index === 2) { // Mark NEW
                    await resetForNew();
                    toast('Next = NEW', 'info');
                }
            };
            
            const onMouseMove = nodeType.prototype.onMouseMove;
            nodeType.prototype.onMouseMove = function(e, localPos, graphCanvas) {
                if (this._psButtons) {
                    const startX = 10;
                    const y = this._psBtnY;
                    let needsRedraw = false;
                    
                    this._psButtons.forEach(btn => {
                        const wasHover = btn.hover;
                        btn.hover = localPos[0] >= startX + btn.x && 
                                   localPos[0] <= startX + btn.x + btn.w &&
                                   localPos[1] >= y && 
                                   localPos[1] <= y + this._psBtnH;
                        if (wasHover !== btn.hover) needsRedraw = true;
                    });
                    
                    if (needsRedraw) this.setDirtyCanvas(true);
                }
                if (onMouseMove) return onMouseMove.apply(this, arguments);
            };
        }
        
        // Metadata Reader - no extra UI needed
    }
});
