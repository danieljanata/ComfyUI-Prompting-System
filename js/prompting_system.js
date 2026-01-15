// ComfyUI-Prompting-System
// Sidebar with pagination, LoRA upload, per-node save tracking

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
    el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;z-index:10001;background:${colors[type]};color:#1e1e2e;font-size:12px;font-weight:500;`;
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
                    container.style.cssText = 'padding: 12px; color: #fff; font-family: Arial, sans-serif;';
                    
                    // Header
                    const header = document.createElement('h3');
                    header.textContent = '✨ Prompt Browser';
                    header.style.cssText = 'margin: 0 0 12px 0; color: #cba6f7; font-size: 15px; border-bottom: 1px solid #333; padding-bottom: 8px;';
                    container.appendChild(header);
                    
                    // Stats
                    const stats = document.createElement('div');
                    stats.style.cssText = 'font-size: 11px; color: #888; margin-bottom: 10px;';
                    stats.textContent = 'Loading...';
                    container.appendChild(stats);
                    
                    // Search
                    const searchInput = document.createElement('input');
                    searchInput.type = 'text';
                    searchInput.placeholder = 'Search prompts...';
                    searchInput.value = savedState.search || '';
                    searchInput.style.cssText = 'width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 5px; color: #fff; font-size: 11px; margin-bottom: 8px; box-sizing: border-box;';
                    container.appendChild(searchInput);
                    
                    // Filters
                    const filtersRow = document.createElement('div');
                    filtersRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;';
                    
                    const selectStyle = 'flex: 1; min-width: 70px; padding: 4px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 10px;';
                    
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
                    
                    // Results list
                    const resultsList = document.createElement('div');
                    resultsList.style.cssText = 'max-height: 280px; overflow-y: auto;';
                    container.appendChild(resultsList);
                    
                    // Pagination
                    const paginationRow = document.createElement('div');
                    paginationRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; margin: 8px 0; font-size: 11px;';
                    container.appendChild(paginationRow);
                    
                    // Copy + Refresh row
                    const row1 = document.createElement('div');
                    row1.style.cssText = 'display: flex; gap: 4px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.style.cssText = 'flex: 1; padding: 6px; background: linear-gradient(135deg, #89b4fa, #74c7ec); border: none; border-radius: 5px; color: #1e1e2e; font-weight: bold; cursor: pointer; font-size: 11px;';
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
                    refreshBtn.style.cssText = 'padding: 6px 10px; background: rgba(255,255,255,0.1); border: none; border-radius: 5px; color: #fff; cursor: pointer;';
                    refreshBtn.onclick = () => loadData();
                    row1.appendChild(refreshBtn);
                    
                    container.appendChild(row1);
                    
                    // WF + DB + Import row
                    const row2 = document.createElement('div');
                    row2.style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';
                    
                    const btnStyle2 = 'flex: 1; padding: 5px; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: #fff; cursor: pointer; font-size: 10px;';
                    
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
                    
                    // Output ZIP + LoRA upload row
                    const row3 = document.createElement('div');
                    row3.style.cssText = 'display: flex; gap: 4px; margin-top: 4px;';
                    
                    const outputZipBtn = document.createElement('button');
                    outputZipBtn.textContent = '📦 Outputs ZIP';
                    outputZipBtn.style.cssText = 'flex: 1; padding: 5px; background: rgba(249,226,175,0.3); border: none; border-radius: 4px; color: #1e1e2e; cursor: pointer; font-size: 10px; font-weight: 500;';
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
                    loraBtn.style.cssText = 'flex: 1; padding: 5px; background: rgba(203,166,247,0.3); border: none; border-radius: 4px; color: #1e1e2e; cursor: pointer; font-size: 10px; font-weight: 500;';
                    loraBtn.onclick = () => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.safetensors,.pt,.bin,.ckpt';
                        input.onchange = async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            
                            // Show progress
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
                    settingsSection.style.cssText = 'margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;';
                    
                    // Per page setting
                    const perPageRow = document.createElement('div');
                    perPageRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;';
                    perPageRow.innerHTML = '<span style="font-size: 10px; color: #888;">Per page:</span>';
                    
                    const perPageSelect = document.createElement('select');
                    perPageSelect.style.cssText = 'padding: 3px; background: #333; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 10px;';
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
                    mgmtHeader.style.cssText = 'font-size: 11px; color: #89b4fa; margin-bottom: 8px; font-weight: bold;';
                    settingsSection.appendChild(mgmtHeader);
                    
                    // Categories
                    const catMgmt = document.createElement('div');
                    catMgmt.style.cssText = 'margin-bottom: 8px;';
                    catMgmt.innerHTML = '<div style="font-size: 9px; color: #666; margin-bottom: 3px;">Categories:</div>';
                    const catChips = document.createElement('div');
                    catChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px;';
                    catMgmt.appendChild(catChips);
                    
                    const catAddRow = document.createElement('div');
                    catAddRow.style.cssText = 'display: flex; gap: 3px;';
                    const catInput = document.createElement('input');
                    catInput.placeholder = 'New category...';
                    catInput.style.cssText = 'flex: 1; padding: 3px 6px; background: #333; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 10px;';
                    catAddRow.appendChild(catInput);
                    const catAddBtn = document.createElement('button');
                    catAddBtn.textContent = '+';
                    catAddBtn.style.cssText = 'padding: 3px 8px; background: #89b4fa; border: none; border-radius: 3px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
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
                    modelMgmt.innerHTML = '<div style="font-size: 9px; color: #666; margin-bottom: 3px;">Models:</div>';
                    const modelChips = document.createElement('div');
                    modelChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px;';
                    modelMgmt.appendChild(modelChips);
                    
                    const modelAddRow = document.createElement('div');
                    modelAddRow.style.cssText = 'display: flex; gap: 3px;';
                    const modelInput = document.createElement('input');
                    modelInput.placeholder = 'New model...';
                    modelInput.style.cssText = 'flex: 1; padding: 3px 6px; background: #333; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 10px;';
                    modelAddRow.appendChild(modelInput);
                    const modelAddBtn = document.createElement('button');
                    modelAddBtn.textContent = '+';
                    modelAddBtn.style.cssText = 'padding: 3px 8px; background: #89b4fa; border: none; border-radius: 3px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
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
                    let totalPrompts = 0;
                    let selectedPromptId = null;
                    let selectedPromptText = '';
                    
                    const persistState = () => {
                        saveState({ search: currentSearch, category: currentCategory, model: currentModel, tag: currentTag, perPage });
                    };
                    
                    // Load data
                    const loadData = async () => {
                        const statsRes = await psApi('/stats');
                        if (statsRes.success) {
                            stats.textContent = `📝 ${statsRes.stats.total} | ⭐ ${statsRes.stats.rated} | 🖼 ${statsRes.stats.with_thumbnail}`;
                            totalPrompts = statsRes.stats.total;
                        }
                        
                        // Categories
                        const catRes = await psApi('/categories');
                        if (catRes.success) {
                            catSelect.innerHTML = '<option value="All">All Categories</option>' + 
                                catRes.categories.map(c => `<option value="${c}">${c}</option>`).join('');
                            catSelect.value = currentCategory;
                            
                            catChips.innerHTML = '';
                            catRes.categories.forEach(c => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 3px; padding: 2px 5px; background: rgba(203,166,247,0.15); color: #cba6f7; border-radius: 3px; font-size: 9px;';
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
                            modelSelect.innerHTML = '<option value="All">All Models</option>' + 
                                modelRes.models.map(m => `<option value="${m}">${m}</option>`).join('');
                            modelSelect.value = currentModel;
                            
                            modelChips.innerHTML = '';
                            modelRes.models.forEach(m => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 3px; padding: 2px 5px; background: rgba(250,179,135,0.2); color: #fab387; border-radius: 3px; font-size: 9px;';
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
                        
                        // Prompts with pagination
                        const params = new URLSearchParams();
                        if (currentSearch) params.append('search', currentSearch);
                        if (currentCategory !== 'All') params.append('category', currentCategory);
                        if (currentModel !== 'All') params.append('model', currentModel);
                        if (currentTag !== 'All') params.append('tag', currentTag);
                        params.append('limit', '500'); // Get all for client-side pagination
                        
                        const promptsRes = await psApi(`/prompts?${params}`);
                        resultsList.innerHTML = '';
                        
                        if (!promptsRes.success || !promptsRes.prompts?.length) {
                            resultsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #666; font-size: 11px;">No prompts found</div>';
                            paginationRow.innerHTML = '';
                            return;
                        }
                        
                        const allPrompts = promptsRes.prompts;
                        const totalPages = Math.ceil(allPrompts.length / perPage);
                        currentPage = Math.min(currentPage, totalPages);
                        
                        const startIdx = (currentPage - 1) * perPage;
                        const pagePrompts = allPrompts.slice(startIdx, startIdx + perPage);
                        
                        // Render prompts
                        pagePrompts.forEach(p => {
                            const card = document.createElement('div');
                            card.style.cssText = `display: flex; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid ${selectedPromptId === p.id ? '#cba6f7' : 'rgba(255,255,255,0.08)'}; border-radius: 6px; padding: 8px; margin-bottom: 6px; cursor: pointer;`;
                            
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
                            topRow.style.cssText = 'display: flex; gap: 3px; margin-bottom: 4px; flex-wrap: wrap;';
                            
                            if (p.model) {
                                const tag = document.createElement('span');
                                tag.style.cssText = 'background: rgba(250,179,135,0.2); color: #fab387; padding: 1px 4px; border-radius: 3px; font-size: 8px;';
                                tag.textContent = p.model;
                                topRow.appendChild(tag);
                            }
                            if (p.category) {
                                const tag = document.createElement('span');
                                tag.style.cssText = 'background: rgba(203,166,247,0.15); color: #cba6f7; padding: 1px 4px; border-radius: 3px; font-size: 8px;';
                                tag.textContent = p.category;
                                topRow.appendChild(tag);
                            }
                            content.appendChild(topRow);
                            
                            // Text
                            const textDiv = document.createElement('div');
                            textDiv.style.cssText = 'font-size: 10px; color: #bac2de; max-height: 32px; overflow: hidden; margin-bottom: 4px; line-height: 1.3;';
                            textDiv.textContent = p.text.substring(0, 100) + (p.text.length > 100 ? '...' : '');
                            content.appendChild(textDiv);
                            
                            // Bottom row
                            const bottomRow = document.createElement('div');
                            bottomRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';
                            
                            // Stars
                            const starsDiv = document.createElement('span');
                            starsDiv.style.cssText = 'color: #f9e2af; font-size: 10px; margin-left: auto;';
                            for (let i = 1; i <= 5; i++) {
                                const star = document.createElement('span');
                                star.textContent = '★';
                                star.style.cssText = `cursor: pointer; opacity: ${i <= (p.rating || 0) ? 1 : 0.3};`;
                                star.onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/prompts/${p.id}/rate`, { method: 'POST', body: JSON.stringify({ rating: i === p.rating ? 0 : i }) });
                                    loadData();
                                };
                                starsDiv.appendChild(star);
                            }
                            bottomRow.appendChild(starsDiv);
                            
                            // Delete
                            const delBtn = document.createElement('span');
                            delBtn.textContent = '🗑';
                            delBtn.style.cssText = 'cursor: pointer; opacity: 0.5; font-size: 10px;';
                            delBtn.onclick = async (e) => {
                                e.stopPropagation();
                                if (confirm('Delete?')) {
                                    await psApi(`/prompts/${p.id}`, { method: 'DELETE' });
                                    loadData();
                                }
                            };
                            bottomRow.appendChild(delBtn);
                            
                            content.appendChild(bottomRow);
                            card.appendChild(content);
                            
                            // Thumbnail
                            const thumbDiv = document.createElement('div');
                            thumbDiv.style.cssText = 'width: 50px; height: 50px; background: rgba(255,255,255,0.05); border-radius: 4px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;';
                            
                            if (p.thumbnail) {
                                const img = document.createElement('img');
                                img.src = `data:image/jpeg;base64,${p.thumbnail}`;
                                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                                thumbDiv.appendChild(img);
                            } else {
                                thumbDiv.style.color = '#45475a';
                                thumbDiv.style.fontSize = '16px';
                                thumbDiv.textContent = '🖼';
                            }
                            
                            card.appendChild(thumbDiv);
                            resultsList.appendChild(card);
                        });
                        
                        // Pagination controls
                        paginationRow.innerHTML = '';
                        if (totalPages > 1) {
                            const prevBtn = document.createElement('button');
                            prevBtn.textContent = '◀';
                            prevBtn.disabled = currentPage === 1;
                            prevBtn.style.cssText = 'padding: 3px 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 3px; color: #fff; cursor: pointer; font-size: 10px;';
                            prevBtn.onclick = () => { currentPage--; loadData(); };
                            paginationRow.appendChild(prevBtn);
                            
                            const pageInfo = document.createElement('span');
                            pageInfo.textContent = `${currentPage} / ${totalPages}`;
                            pageInfo.style.cssText = 'color: #888;';
                            paginationRow.appendChild(pageInfo);
                            
                            const nextBtn = document.createElement('button');
                            nextBtn.textContent = '▶';
                            nextBtn.disabled = currentPage === totalPages;
                            nextBtn.style.cssText = 'padding: 3px 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 3px; color: #fff; cursor: pointer; font-size: 10px;';
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
                
                // Reset for THIS specific node only
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
                        toast('Pasted! NEW', 'info');
                    }
                } else if (index === 1) { // Clear
                    if (textWidget) {
                        textWidget.value = '';
                        await resetForNew();
                        app.graph.setDirtyCanvas(true);
                        toast('Cleared! NEW', 'info');
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
        
        // Metadata Reader
        if (nodeData.name === "PS_MetadataReader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'padding: 4px;';
                
                const dlBtn = document.createElement('button');
                dlBtn.textContent = '📥 Download Workflow JSON';
                dlBtn.style.cssText = 'width: 100%; padding: 6px; background: linear-gradient(135deg, #89b4fa, #74c7ec); border: none; border-radius: 4px; color: #1e1e2e; font-weight: 600; cursor: pointer; font-size: 11px;';
                dlBtn.onclick = () => toast('Check prompts output', 'info');
                btnContainer.appendChild(dlBtn);
                
                this.addDOMWidget('ps_download', 'div', btnContainer, { serialize: false });
            };
        }
    }
});
