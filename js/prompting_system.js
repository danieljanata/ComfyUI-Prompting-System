// ComfyUI-Prompting-System
// Sidebar browser with persistent filters, workflow export, output ZIP

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

// LocalStorage helpers for persistent filters
const STORAGE_KEY = "ps_sidebar_state";
const saveState = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
};
const loadState = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch(e) { return {}; }
};

// Get workflow name from ComfyUI
const getWorkflowName = () => {
    // Try multiple ways to get workflow name
    if (app.graph?.extra?.title) return app.graph.extra.title;
    if (app.graph?.name) return app.graph.name;
    // Try to get from document title
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
        // Register sidebar tab
        app.extensionManager.registerSidebarTab({
            id: "prompting_system",
            icon: "pi pi-database",
            title: "PS",
            tooltip: "Prompting System Browser",
            type: "custom",
            render: (el) => {
                const renderSidebarContent = async () => {
                    el.innerHTML = '';
                    
                    // Load saved state
                    const savedState = loadState();
                    
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 15px; color: #fff; font-family: Arial, sans-serif;';
                    
                    // Header
                    const header = document.createElement('h3');
                    header.textContent = '✨ Prompt Browser';
                    header.style.cssText = 'margin: 0 0 15px 0; color: #cba6f7; font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 10px;';
                    container.appendChild(header);
                    
                    // Stats
                    const stats = document.createElement('div');
                    stats.style.cssText = 'font-size: 12px; color: #888; margin-bottom: 15px;';
                    stats.textContent = 'Loading...';
                    container.appendChild(stats);
                    
                    // Search
                    const searchInput = document.createElement('input');
                    searchInput.type = 'text';
                    searchInput.placeholder = 'Search prompts...';
                    searchInput.value = savedState.search || '';
                    searchInput.style.cssText = 'width: 100%; padding: 8px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; margin-bottom: 10px; box-sizing: border-box;';
                    container.appendChild(searchInput);
                    
                    // Filters row 1: Category + Model
                    const filtersRow1 = document.createElement('div');
                    filtersRow1.style.cssText = 'display: flex; gap: 6px; margin-bottom: 6px;';
                    
                    const catSelect = document.createElement('select');
                    catSelect.style.cssText = 'flex: 1; padding: 6px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 11px;';
                    filtersRow1.appendChild(catSelect);
                    
                    const modelSelect = document.createElement('select');
                    modelSelect.style.cssText = 'flex: 1; padding: 6px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 11px;';
                    filtersRow1.appendChild(modelSelect);
                    
                    container.appendChild(filtersRow1);
                    
                    // Filters row 2: Tag
                    const filtersRow2 = document.createElement('div');
                    filtersRow2.style.cssText = 'display: flex; gap: 6px; margin-bottom: 10px;';
                    
                    const tagSelect = document.createElement('select');
                    tagSelect.style.cssText = 'flex: 1; padding: 6px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 11px;';
                    filtersRow2.appendChild(tagSelect);
                    
                    container.appendChild(filtersRow2);
                    
                    // Results list
                    const resultsList = document.createElement('div');
                    resultsList.style.cssText = 'max-height: 300px; overflow-y: auto;';
                    container.appendChild(resultsList);
                    
                    // Buttons row 1: Copy + Refresh
                    const buttonsRow1 = document.createElement('div');
                    buttonsRow1.style.cssText = 'display: flex; gap: 6px; margin-top: 15px; padding-top: 15px; border-top: 1px solid #333;';
                    
                    const copyBtn = document.createElement('button');
                    copyBtn.textContent = '📋 Copy Selected';
                    copyBtn.style.cssText = 'flex: 1; padding: 8px; background: linear-gradient(135deg, #89b4fa, #74c7ec); border: none; border-radius: 6px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
                    copyBtn.onclick = () => {
                        if (selectedPromptText) {
                            navigator.clipboard.writeText(selectedPromptText);
                            toast('Copied!', 'success');
                        } else {
                            toast('Select a prompt first', 'info');
                        }
                    };
                    buttonsRow1.appendChild(copyBtn);
                    
                    const refreshBtn = document.createElement('button');
                    refreshBtn.textContent = '🔄';
                    refreshBtn.style.cssText = 'padding: 8px 12px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer;';
                    refreshBtn.onclick = () => loadData();
                    buttonsRow1.appendChild(refreshBtn);
                    
                    container.appendChild(buttonsRow1);
                    
                    // Buttons row 2: WF + Export + Import
                    const buttonsRow2 = document.createElement('div');
                    buttonsRow2.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';
                    
                    const wfBtn = document.createElement('button');
                    wfBtn.textContent = '📄 WF';
                    wfBtn.title = 'Download current workflow';
                    wfBtn.style.cssText = 'flex: 1; padding: 6px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 11px;';
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
                            toast('Failed to download', 'error');
                        }
                    };
                    buttonsRow2.appendChild(wfBtn);
                    
                    const exportBtn = document.createElement('button');
                    exportBtn.textContent = '💾 DB';
                    exportBtn.title = 'Export prompts database';
                    exportBtn.style.cssText = 'flex: 1; padding: 6px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 11px;';
                    exportBtn.onclick = async () => {
                        const r = await psApi('/export');
                        if (r.success && r.data) {
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
                            a.download = `prompts_${new Date().toISOString().slice(0,10)}.json`;
                            a.click();
                            toast('DB Exported!', 'success');
                        }
                    };
                    buttonsRow2.appendChild(exportBtn);
                    
                    const importBtn = document.createElement('button');
                    importBtn.textContent = '📤 Import';
                    importBtn.title = 'Import & merge prompts';
                    importBtn.style.cssText = 'flex: 1; padding: 6px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; cursor: pointer; font-size: 11px;';
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
                    buttonsRow2.appendChild(importBtn);
                    
                    container.appendChild(buttonsRow2);
                    
                    // Buttons row 3: Output ZIP
                    const buttonsRow3 = document.createElement('div');
                    buttonsRow3.style.cssText = 'display: flex; gap: 6px; margin-top: 6px;';
                    
                    const outputZipBtn = document.createElement('button');
                    outputZipBtn.textContent = '📦 Download Outputs ZIP';
                    outputZipBtn.title = 'Download entire output folder as ZIP';
                    outputZipBtn.style.cssText = 'flex: 1; padding: 8px; background: linear-gradient(135deg, #f9e2af, #fab387); border: none; border-radius: 6px; color: #1e1e2e; font-weight: bold; cursor: pointer; font-size: 11px;';
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
                            } else {
                                toast('Failed to create ZIP', 'error');
                            }
                        } catch (e) {
                            toast('Download failed', 'error');
                        }
                    };
                    buttonsRow3.appendChild(outputZipBtn);
                    
                    container.appendChild(buttonsRow3);
                    
                    // Management section
                    const mgmtSection = document.createElement('div');
                    mgmtSection.style.cssText = 'margin-top: 15px; padding-top: 15px; border-top: 1px solid #333;';
                    
                    const mgmtHeader = document.createElement('div');
                    mgmtHeader.textContent = '⚙️ Manage Categories & Models';
                    mgmtHeader.style.cssText = 'font-size: 12px; color: #89b4fa; margin-bottom: 10px; font-weight: bold;';
                    mgmtSection.appendChild(mgmtHeader);
                    
                    // Category management
                    const catMgmt = document.createElement('div');
                    catMgmt.style.cssText = 'margin-bottom: 10px;';
                    catMgmt.innerHTML = '<div style="font-size: 10px; color: #666; margin-bottom: 4px;">Categories:</div>';
                    const catChips = document.createElement('div');
                    catChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;';
                    catMgmt.appendChild(catChips);
                    
                    const catAddRow = document.createElement('div');
                    catAddRow.style.cssText = 'display: flex; gap: 4px;';
                    const catInput = document.createElement('input');
                    catInput.placeholder = 'New category...';
                    catInput.style.cssText = 'flex: 1; padding: 4px 8px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 11px;';
                    catAddRow.appendChild(catInput);
                    const catAddBtn = document.createElement('button');
                    catAddBtn.textContent = '+';
                    catAddBtn.style.cssText = 'padding: 4px 10px; background: #89b4fa; border: none; border-radius: 4px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
                    catAddBtn.onclick = async () => {
                        if (catInput.value.trim()) {
                            await psApi('/categories', { method: 'POST', body: JSON.stringify({ name: catInput.value.trim() }) });
                            catInput.value = '';
                            loadData();
                        }
                    };
                    catAddRow.appendChild(catAddBtn);
                    catMgmt.appendChild(catAddRow);
                    mgmtSection.appendChild(catMgmt);
                    
                    // Model management
                    const modelMgmt = document.createElement('div');
                    modelMgmt.innerHTML = '<div style="font-size: 10px; color: #666; margin-bottom: 4px;">Models:</div>';
                    const modelChips = document.createElement('div');
                    modelChips.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;';
                    modelMgmt.appendChild(modelChips);
                    
                    const modelAddRow = document.createElement('div');
                    modelAddRow.style.cssText = 'display: flex; gap: 4px;';
                    const modelInput = document.createElement('input');
                    modelInput.placeholder = 'New model...';
                    modelInput.style.cssText = 'flex: 1; padding: 4px 8px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 11px;';
                    modelAddRow.appendChild(modelInput);
                    const modelAddBtn = document.createElement('button');
                    modelAddBtn.textContent = '+';
                    modelAddBtn.style.cssText = 'padding: 4px 10px; background: #89b4fa; border: none; border-radius: 4px; color: #1e1e2e; font-weight: bold; cursor: pointer;';
                    modelAddBtn.onclick = async () => {
                        if (modelInput.value.trim()) {
                            await psApi('/models', { method: 'POST', body: JSON.stringify({ name: modelInput.value.trim() }) });
                            modelInput.value = '';
                            loadData();
                        }
                    };
                    modelAddRow.appendChild(modelAddBtn);
                    modelMgmt.appendChild(modelAddRow);
                    mgmtSection.appendChild(modelMgmt);
                    
                    container.appendChild(mgmtSection);
                    el.appendChild(container);
                    
                    // State (restore from localStorage)
                    let currentSearch = savedState.search || '';
                    let currentCategory = savedState.category || 'All';
                    let currentModel = savedState.model || 'All';
                    let currentTag = savedState.tag || 'All';
                    let selectedPromptId = null;
                    let selectedPromptText = '';
                    
                    // Save state helper
                    const persistState = () => {
                        saveState({
                            search: currentSearch,
                            category: currentCategory,
                            model: currentModel,
                            tag: currentTag
                        });
                    };
                    
                    // Load data function
                    const loadData = async () => {
                        // Load stats
                        const statsRes = await psApi('/stats');
                        if (statsRes.success) {
                            stats.textContent = `📝 ${statsRes.stats.total} | ⭐ ${statsRes.stats.rated} | 🖼 ${statsRes.stats.with_thumbnail}`;
                        }
                        
                        // Load categories
                        const catRes = await psApi('/categories');
                        if (catRes.success) {
                            catSelect.innerHTML = '<option value="All">All Categories</option>' + 
                                catRes.categories.map(c => `<option value="${c}">${c}</option>`).join('');
                            catSelect.value = currentCategory;
                            
                            catChips.innerHTML = '';
                            catRes.categories.forEach(c => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: rgba(203,166,247,0.15); color: #cba6f7; border-radius: 4px; font-size: 10px;';
                                chip.innerHTML = `${c} <span style="cursor: pointer; opacity: 0.7;">×</span>`;
                                chip.querySelector('span').onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/categories/${encodeURIComponent(c)}`, { method: 'DELETE' });
                                    loadData();
                                };
                                catChips.appendChild(chip);
                            });
                        }
                        
                        // Load models
                        const modelRes = await psApi('/models');
                        if (modelRes.success) {
                            modelSelect.innerHTML = '<option value="All">All Models</option>' + 
                                modelRes.models.map(m => `<option value="${m}">${m}</option>`).join('');
                            modelSelect.value = currentModel;
                            
                            modelChips.innerHTML = '';
                            modelRes.models.forEach(m => {
                                const chip = document.createElement('span');
                                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; background: rgba(250,179,135,0.2); color: #fab387; border-radius: 4px; font-size: 10px;';
                                chip.innerHTML = `${m} <span style="cursor: pointer; opacity: 0.7;">×</span>`;
                                chip.querySelector('span').onclick = async (e) => {
                                    e.stopPropagation();
                                    await psApi(`/models/${encodeURIComponent(m)}`, { method: 'DELETE' });
                                    loadData();
                                };
                                modelChips.appendChild(chip);
                            });
                        }
                        
                        // Load tags
                        const tagRes = await psApi('/tags');
                        if (tagRes.success) {
                            tagSelect.innerHTML = '<option value="All">All Tags</option>' + 
                                tagRes.tags.map(t => `<option value="${t}">${t}</option>`).join('');
                            tagSelect.value = currentTag;
                        }
                        
                        // Load prompts
                        const params = new URLSearchParams();
                        if (currentSearch) params.append('search', currentSearch);
                        if (currentCategory !== 'All') params.append('category', currentCategory);
                        if (currentModel !== 'All') params.append('model', currentModel);
                        if (currentTag !== 'All') params.append('tag', currentTag);
                        params.append('limit', '50');
                        
                        const promptsRes = await psApi(`/prompts?${params}`);
                        resultsList.innerHTML = '';
                        
                        if (!promptsRes.success || !promptsRes.prompts?.length) {
                            resultsList.innerHTML = '<div style="text-align: center; padding: 30px; color: #666;">No prompts found</div>';
                            return;
                        }
                        
                        promptsRes.prompts.forEach(p => {
                            const card = document.createElement('div');
                            card.style.cssText = `
                                display: flex;
                                gap: 10px;
                                background: rgba(255,255,255,0.03);
                                border: 1px solid ${selectedPromptId === p.id ? '#cba6f7' : 'rgba(255,255,255,0.08)'};
                                border-radius: 8px;
                                padding: 10px;
                                margin-bottom: 8px;
                                cursor: pointer;
                                transition: all 0.15s;
                            `;
                            
                            card.onclick = () => {
                                selectedPromptId = p.id;
                                selectedPromptText = p.text;
                                navigator.clipboard.writeText(p.text);
                                toast('Copied!', 'success');
                                loadData();
                            };
                            
                            // Content (left side)
                            const content = document.createElement('div');
                            content.style.cssText = 'flex: 1; min-width: 0;';
                            
                            // Top row: Model + Category tags
                            const topRow = document.createElement('div');
                            topRow.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap;';
                            
                            if (p.model) {
                                const modelTag = document.createElement('span');
                                modelTag.style.cssText = 'background: rgba(250,179,135,0.2); color: #fab387; padding: 2px 6px; border-radius: 4px; font-size: 9px;';
                                modelTag.textContent = p.model;
                                topRow.appendChild(modelTag);
                            }
                            
                            if (p.category) {
                                const catTag = document.createElement('span');
                                catTag.style.cssText = 'background: rgba(203,166,247,0.15); color: #cba6f7; padding: 2px 6px; border-radius: 4px; font-size: 9px;';
                                catTag.textContent = p.category;
                                topRow.appendChild(catTag);
                            }
                            
                            content.appendChild(topRow);
                            
                            // Text preview (middle)
                            const textDiv = document.createElement('div');
                            textDiv.style.cssText = 'font-size: 11px; color: #bac2de; max-height: 36px; overflow: hidden; margin-bottom: 6px; line-height: 1.3;';
                            textDiv.textContent = p.text.substring(0, 120) + (p.text.length > 120 ? '...' : '');
                            content.appendChild(textDiv);
                            
                            // Bottom row: Tags + Stars + Delete
                            const bottomRow = document.createElement('div');
                            bottomRow.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap;';
                            
                            // Tags
                            if (p.tags && p.tags.length) {
                                p.tags.slice(0, 3).forEach(t => {
                                    const tag = document.createElement('span');
                                    tag.style.cssText = 'background: rgba(137,180,250,0.15); color: #89b4fa; padding: 1px 5px; border-radius: 3px; font-size: 9px;';
                                    tag.textContent = t;
                                    bottomRow.appendChild(tag);
                                });
                            }
                            
                            // Stars
                            const starsDiv = document.createElement('span');
                            starsDiv.style.cssText = 'color: #f9e2af; font-size: 11px; margin-left: auto;';
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
                            
                            // Delete button
                            const delBtn = document.createElement('span');
                            delBtn.textContent = '🗑';
                            delBtn.style.cssText = 'cursor: pointer; opacity: 0.5; font-size: 12px;';
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
                            
                            // Thumbnail (right side)
                            const thumbDiv = document.createElement('div');
                            thumbDiv.style.cssText = 'width: 64px; height: 64px; background: rgba(255,255,255,0.05); border-radius: 6px; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;';
                            
                            if (p.thumbnail) {
                                const img = document.createElement('img');
                                img.src = `data:image/jpeg;base64,${p.thumbnail}`;
                                img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
                                thumbDiv.appendChild(img);
                            } else {
                                thumbDiv.style.color = '#45475a';
                                thumbDiv.style.fontSize = '20px';
                                thumbDiv.textContent = '🖼';
                            }
                            
                            card.appendChild(thumbDiv);
                            resultsList.appendChild(card);
                        });
                    };
                    
                    // Event listeners with state persistence
                    let searchTimeout;
                    searchInput.oninput = () => {
                        clearTimeout(searchTimeout);
                        searchTimeout = setTimeout(() => {
                            currentSearch = searchInput.value;
                            persistState();
                            loadData();
                        }, 300);
                    };
                    
                    catSelect.onchange = () => { currentCategory = catSelect.value; persistState(); loadData(); };
                    modelSelect.onchange = () => { currentModel = modelSelect.value; persistState(); loadData(); };
                    tagSelect.onchange = () => { currentTag = tagSelect.value; persistState(); loadData(); };
                    
                    // Initial load
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
        // Smart Text - canvas buttons (no DOM widget issues)
        if (nodeData.name === "PS_SmartText") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const node = this;
                
                // Store button state
                node._psButtons = [
                    { emoji: '📋', x: 0, w: 22, title: 'Paste & NEW', color: 'rgba(137,180,250,0.6)' },
                    { emoji: '🗑', x: 24, w: 22, title: 'Clear & NEW', color: 'rgba(243,139,168,0.6)' },
                    { emoji: '💾', x: 48, w: 22, title: 'Mark NEW', color: 'rgba(166,227,161,0.6)' }
                ];
                node._psBtnY = 4;
                node._psBtnH = 20;
                
                // Adjust text widget position
                setTimeout(() => {
                    const textWidget = this.widgets?.find(w => w.name === 'text');
                    if (textWidget && textWidget.inputEl) {
                        textWidget.inputEl.style.marginTop = '4px';
                    }
                }, 50);
            };
            
            // Adjust widget start position
            const onDrawBackground = nodeType.prototype.onDrawBackground;
            nodeType.prototype.onDrawBackground = function(ctx) {
                if (onDrawBackground) onDrawBackground.apply(this, arguments);
                // Push widgets down to make room for buttons
                this.widgets_start_y = 26;
            };
            
            // Draw buttons on canvas
            const onDrawForeground = nodeType.prototype.onDrawForeground;
            nodeType.prototype.onDrawForeground = function(ctx) {
                if (onDrawForeground) onDrawForeground.apply(this, arguments);
                
                if (!this._psButtons) return;
                
                const startX = 10;
                const y = this._psBtnY;
                
                this._psButtons.forEach(btn => {
                    // Button background
                    ctx.fillStyle = btn.hover ? btn.color.replace('0.6', '0.9') : btn.color;
                    ctx.beginPath();
                    ctx.roundRect(startX + btn.x, y, btn.w, this._psBtnH, 4);
                    ctx.fill();
                    
                    // Emoji
                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff';
                    ctx.fillText(btn.emoji, startX + btn.x + btn.w/2, y + this._psBtnH/2);
                });
            };
            
            // Handle mouse events
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
                            
                            // Button clicked
                            this._handlePsButton(i);
                            return true;
                        }
                    }
                }
                if (onMouseDown) return onMouseDown.apply(this, arguments);
            };
            
            // Button actions
            nodeType.prototype._handlePsButton = async function(index) {
                const textWidget = this.widgets?.find(w => w.name === 'text');
                
                const resetForNew = async () => {
                    await psApi('/reset-last-saved', { method: 'POST' });
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
            
            // Hover effect
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
        
        // Metadata Reader - download button
        if (nodeData.name === "PS_MetadataReader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) onNodeCreated.apply(this, arguments);
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = 'padding: 4px;';
                
                const dlBtn = document.createElement('button');
                dlBtn.textContent = '📥 Download Workflow JSON';
                dlBtn.style.cssText = 'width: 100%; padding: 8px; background: linear-gradient(135deg, #89b4fa, #74c7ec); border: none; border-radius: 4px; color: #1e1e2e; font-weight: 600; cursor: pointer;';
                dlBtn.onclick = () => toast('Check prompts output for extracted data', 'info');
                btnContainer.appendChild(dlBtn);
                
                this.addDOMWidget('ps_download', 'div', btnContainer, { serialize: false });
            };
        }
    }
});
