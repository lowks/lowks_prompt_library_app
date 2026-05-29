/* Prompt Library App — frontend JS using REST API backend */
'use strict';

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${options.method || 'GET'} ${path} failed (${res.status}): ${text}`);
    }
    return res.json();
}

const get  = (path)       => api(path);
const post = (path, body) => api(path, { method: 'POST',   body: JSON.stringify(body) });
const put  = (path, body) => api(path, { method: 'PUT',    body: JSON.stringify(body) });
const del  = (path)       => api(path, { method: 'DELETE' });
const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body || {}) });

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

const state = {
    currentView: 'all',
    currentSection: null,
    currentSubsection: null,
    editingPromptId: null,
    searchQuery: '',
    filterTag: null,
    sections: [],
    subsections: [],
};

// ---------------------------------------------------------------------------
// Settings (localStorage — UI preferences only, not data)
// ---------------------------------------------------------------------------

const defaultSettings = {
    theme: 'dark',
    defaultView: 'all',
    confirmDelete: true,
    fontSize: 'medium',
};

function loadSettings() {
    const saved = localStorage.getItem('appSettings');
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : { ...defaultSettings };
}

function saveSettings(settings) {
    localStorage.setItem('appSettings', JSON.stringify(settings));
}

function applySettings(settings) {
    if (settings.theme === 'light') {
        document.body.classList.add('light-mode');
    } else if (settings.theme === 'dark') {
        document.body.classList.remove('light-mode');
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('light-mode', !prefersDark);
    }
    document.body.style.fontSize =
        settings.fontSize === 'small' ? '14px' :
        settings.fontSize === 'large' ? '18px' : '16px';
}

// ---------------------------------------------------------------------------
// Sidebar rendering
// ---------------------------------------------------------------------------

async function renderSections() {
    state.sections    = await get('/api/sections');
    state.subsections = await get('/api/subsections');

    const list = document.getElementById('sectionsList');
    list.innerHTML = '';

    for (const section of state.sections) {
        const subs = state.subsections.filter(s => s.sectionId === section.id);
        const item = document.createElement('div');
        item.className = 'section-item';
        item.innerHTML = `
            <button class="section-toggle" data-section="${section.id}">
                <span class="section-icon">${section.icon || '📁'}</span>
                <span>${escapeHtml(section.name)}</span>
                <span style="margin-left:auto;font-size:12px;">${subs.length ? '▼' : ''}</span>
            </button>
            <div class="subsection-list" id="subsections-${section.id}">
                ${subs.map(sub => `
                    <div class="subsection-item" data-subsection="${sub.id}" data-section="${section.id}">
                        <span>${escapeHtml(sub.name)}</span>
                    </div>
                `).join('')}
                <div class="subsection-item" data-action="add-subsection" data-section="${section.id}"
                     style="color:var(--accent-primary);font-weight:500;">
                    <span>+ Add Subsection</span>
                </div>
            </div>
        `;
        list.appendChild(item);
    }

    attachSectionListeners();
}

function attachSectionListeners() {
    document.querySelectorAll('.section-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const sectionId = btn.dataset.section;
            const view = btn.dataset.view;
            if (view) {
                state.currentView = view;
                state.currentSection = null;
                state.currentSubsection = null;
                document.querySelectorAll('.section-toggle').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderPrompts();
            } else if (sectionId) {
                document.getElementById(`subsections-${sectionId}`).classList.toggle('open');
            }
        });
    });

    document.querySelectorAll('.subsection-item').forEach(item => {
        item.addEventListener('click', async () => {
            const action = item.dataset.action;
            const sectionId = parseInt(item.dataset.section, 10);
            const subsectionId = item.dataset.subsection ? parseInt(item.dataset.subsection, 10) : null;

            if (action === 'add-subsection') {
                const name = prompt('Enter subsection name:');
                if (name && name.trim()) {
                    await post('/api/subsections', { name: name.trim(), sectionId });
                    await renderSections();
                }
            } else if (subsectionId) {
                state.currentView = 'subsection';
                state.currentSection = sectionId;
                state.currentSubsection = subsectionId;
                document.querySelectorAll('.section-toggle, .subsection-item').forEach(b => b.classList.remove('active'));
                item.classList.add('active');
                renderPrompts();
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Prompts rendering
// ---------------------------------------------------------------------------

async function renderPrompts() {
    const params = new URLSearchParams();

    if (state.currentView === 'favorites') {
        params.set('favorite', 'true');
    } else if (state.currentView === 'subsection' && state.currentSubsection) {
        params.set('subsectionId', state.currentSubsection);
    }

    if (state.searchQuery) {
        params.set('q', state.searchQuery);
    }

    let url = '/api/prompts?' + params.toString();
    let prompts = await get(url);

    if (state.currentView === 'recent') {
        prompts = prompts.slice(0, 20);
    }

    if (state.filterTag) {
        prompts = prompts.filter(p => p.tags && p.tags.includes(state.filterTag));
    }

    // Update page title / breadcrumb
    let title = 'All Prompts';
    let breadcrumb = 'Home / All Prompts';
    if (state.currentView === 'favorites') {
        title = 'Favorite Prompts'; breadcrumb = 'Home / Favorites';
    } else if (state.currentView === 'recent') {
        title = 'Recent Prompts'; breadcrumb = 'Home / Recent';
    } else if (state.currentView === 'subsection' && state.currentSubsection) {
        const sub = state.subsections.find(s => s.id === state.currentSubsection);
        const sec = state.sections.find(s => s.id === state.currentSection);
        if (sub && sec) { title = sub.name; breadcrumb = `Home / ${sec.name} / ${sub.name}`; }
    }
    document.getElementById('pageTitle').textContent = title;
    document.getElementById('breadcrumb').textContent = breadcrumb;

    // Stats
    const stats = await get('/api/stats');
    document.getElementById('totalPrompts').textContent   = stats.totalPrompts;
    document.getElementById('totalSections').textContent  = stats.totalSections;
    document.getElementById('totalFavorites').textContent = stats.totalFavorites;

    // Filter tags
    renderFilterTags(prompts);

    // Cards
    const grid = document.getElementById('promptsGrid');
    if (prompts.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <div class="empty-state-icon">📝</div>
                <h3>No prompts found</h3>
                <p>Create your first prompt to get started!</p>
                <button class="btn-add" style="margin-top:16px;" id="emptyAddPromptBtn">➕ Add Prompt</button>
            </div>`;
        document.getElementById('emptyAddPromptBtn')?.addEventListener('click', () => openPromptModal());
        return;
    }

    grid.innerHTML = prompts.map(p => {
        const sec = state.sections.find(s => s.id === p.sectionId);
        const sub = state.subsections.find(s => s.id === p.subsectionId);
        const date = new Date(p.updatedAt).toLocaleDateString();
        return `
            <div class="prompt-card" data-id="${p.id}">
                <div class="prompt-header">
                    <div style="flex:1;">
                        <div class="prompt-title">${escapeHtml(p.title)}</div>
                        ${p.description ? `<div style="font-size:13px;color:var(--text-muted);">${escapeHtml(p.description)}</div>` : ''}
                    </div>
                    <button class="icon-btn favorite-btn ${p.favorite ? 'active' : ''}"
                            data-id="${p.id}" title="${p.favorite ? 'Remove from favorites' : 'Add to favorites'}">
                        ${p.favorite ? '⭐' : '☆'}
                    </button>
                </div>
                <div class="prompt-meta">
                    ${sec ? `<span class="tag">${escapeHtml(sec.name)}</span>` : ''}
                    ${sub ? `<span class="tag">${escapeHtml(sub.name)}</span>` : ''}
                    ${(p.tags || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}
                </div>
                <div class="prompt-preview">${escapeHtml(p.content)}</div>
                <div class="prompt-footer">
                    <span class="prompt-date">Updated ${date}</span>
                    <div class="prompt-actions">
                        <button class="icon-btn view-btn" data-id="${p.id}" title="View">👁️</button>
                        <button class="icon-btn copy-btn" data-id="${p.id}" title="Copy">📋</button>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Attach card-level listeners
    grid.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); toggleFavorite(parseInt(btn.dataset.id, 10)); });
    });
    grid.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); viewPrompt(parseInt(btn.dataset.id, 10)); });
    });
    grid.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); copyPromptById(parseInt(btn.dataset.id, 10)); });
    });
    grid.querySelectorAll('.prompt-card').forEach(card => {
        card.addEventListener('click', () => viewPrompt(parseInt(card.dataset.id, 10)));
    });
}

function renderFilterTags(prompts) {
    const allTags = new Set();
    prompts.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));

    const bar = document.getElementById('filterBar');
    if (allTags.size === 0) { bar.innerHTML = ''; return; }

    bar.innerHTML = `
        <button class="filter-chip ${!state.filterTag ? 'active' : ''}" data-tag="">All</button>
        ${[...allTags].map(t =>
            `<button class="filter-chip ${state.filterTag === t ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</button>`
        ).join('')}`;

    bar.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.filterTag = chip.dataset.tag || null;
            renderPrompts();
        });
    });
}

// ---------------------------------------------------------------------------
// Prompt CRUD helpers
// ---------------------------------------------------------------------------

async function toggleFavorite(id) {
    await patch(`/api/prompts/${id}/favorite`);
    renderPrompts();
}

async function viewPrompt(id) {
    state.editingPromptId = id;
    const p = await get(`/api/prompts/${id}`);
    const sec = state.sections.find(s => s.id === p.sectionId);
    const sub = state.subsections.find(s => s.id === p.subsectionId);

    // Build placeholder form if content has {{...}}
    const placeholders = [...new Set((p.content.match(/\{\{([^}]+)\}\}/g) || []).map(m => m.slice(2, -2).trim()))];
    const placeholderHtml = placeholders.length ? `
        <div class="template-form">
            <h4>Fill in placeholders</h4>
            <div class="placeholder-inputs">
                ${placeholders.map(ph => `
                    <div class="form-group" style="margin-bottom:12px;">
                        <label>${escapeHtml(ph)}</label>
                        <input type="text" class="placeholder-input" data-placeholder="${escapeHtml(ph)}"
                               placeholder="Value for ${escapeHtml(ph)}">
                    </div>`).join('')}
            </div>
            <div class="rendered-prompt" id="renderedPrompt">${escapeHtml(p.content)}</div>
        </div>` : '';

    document.getElementById('viewPromptTitle').textContent = p.title;
    document.getElementById('viewPromptBody').innerHTML = `
        <div style="margin-bottom:16px;">
            ${sec ? `<span class="tag" style="margin-right:8px;">${escapeHtml(sec.name)}</span>` : ''}
            ${sub ? `<span class="tag" style="margin-right:8px;">${escapeHtml(sub.name)}</span>` : ''}
            ${(p.tags || []).map(t => `<span class="tag" style="margin-right:8px;">#${escapeHtml(t)}</span>`).join('')}
        </div>
        ${p.description ? `<p style="color:var(--text-muted);margin-bottom:16px;">${escapeHtml(p.description)}</p>` : ''}
        <div class="rendered-prompt" id="promptContentDisplay">${escapeHtml(p.content)}</div>
        ${placeholderHtml}`;

    // Live-update rendered prompt
    document.querySelectorAll('.placeholder-input').forEach(input => {
        input.addEventListener('input', () => {
            let rendered = p.content;
            document.querySelectorAll('.placeholder-input').forEach(inp => {
                rendered = rendered.replaceAll(`{{${inp.dataset.placeholder}}}`, inp.value || `{{${inp.dataset.placeholder}}}`);
            });
            const el = document.getElementById('renderedPrompt');
            if (el) el.textContent = rendered;
        });
    });

    document.getElementById('viewPromptModal').classList.add('show');
}

async function openPromptModal(id = null) {
    state.editingPromptId = id;
    const sections = await get('/api/sections');

    const secSelect = document.getElementById('promptSection');
    secSelect.innerHTML = '<option value="">Select a section</option>' +
        sections.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

    document.getElementById('promptSubsection').innerHTML = '<option value="">Select a subsection</option>';
    document.getElementById('promptModalTitle').textContent = id ? 'Edit Prompt' : 'Add New Prompt';
    document.getElementById('promptForm').reset();

    if (id) {
        const p = await get(`/api/prompts/${id}`);
        document.getElementById('promptTitle').value       = p.title;
        document.getElementById('promptDescription').value = p.description || '';
        document.getElementById('promptSection').value     = p.sectionId || '';
        document.getElementById('promptContent').value     = p.content;
        document.getElementById('promptTags').value        = (p.tags || []).join(', ');
        if (p.sectionId) {
            await loadSubsections(p.sectionId);
            document.getElementById('promptSubsection').value = p.subsectionId || '';
        }
    }

    document.getElementById('promptModal').classList.add('show');
}

async function loadSubsections(sectionId) {
    const subs = await get(`/api/subsections?sectionId=${sectionId}`);
    document.getElementById('promptSubsection').innerHTML =
        '<option value="">Select a subsection</option>' +
        subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
}

async function savePrompt() {
    const title       = document.getElementById('promptTitle').value.trim();
    const description = document.getElementById('promptDescription').value.trim();
    const sectionId   = parseInt(document.getElementById('promptSection').value, 10);
    const subVal      = document.getElementById('promptSubsection').value;
    const subsectionId = subVal ? parseInt(subVal, 10) : null;
    const content     = document.getElementById('promptContent').value.trim();
    const tagsInput   = document.getElementById('promptTags').value.trim();
    const tags        = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (!title || !content || !sectionId) {
        alert('Please fill in all required fields');
        return;
    }

    const body = { title, description, sectionId, subsectionId, content, tags };

    if (state.editingPromptId) {
        const existing = await get(`/api/prompts/${state.editingPromptId}`);
        body.favorite = existing.favorite;
        await put(`/api/prompts/${state.editingPromptId}`, body);
    } else {
        await post('/api/prompts', body);
    }

    document.getElementById('promptModal').classList.remove('show');
    await renderPrompts();
}

async function duplicatePrompt() {
    if (!state.editingPromptId) return;
    const p = await get(`/api/prompts/${state.editingPromptId}`);
    await post('/api/prompts', {
        title:        p.title + ' (Copy)',
        description:  p.description,
        sectionId:    p.sectionId,
        subsectionId: p.subsectionId,
        content:      p.content,
        tags:         p.tags,
        favorite:     false,
    });
    document.getElementById('viewPromptModal').classList.remove('show');
    await renderPrompts();
}

async function deletePrompt() {
    if (!state.editingPromptId) return;
    const settings = loadSettings();
    if (settings.confirmDelete && !confirm('Are you sure you want to delete this prompt?')) return;
    await del(`/api/prompts/${state.editingPromptId}`);
    document.getElementById('viewPromptModal').classList.remove('show');
    await renderPrompts();
}

async function copyPromptById(id) {
    const p = await get(`/api/prompts/${id}`);
    await navigator.clipboard.writeText(p.content);
    showToast('Copied to clipboard!');
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

async function exportData() {
    const data = await get('/api/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `prompt-library-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        alert('Invalid JSON file');
        return;
    }
    if (!data.version || !data.prompts) {
        alert('Invalid backup file');
        return;
    }
    if (!confirm('This will replace all existing data. Continue?')) return;

    await post('/api/import', data);
    await renderSections();
    await renderPrompts();
    alert('Data imported successfully!');
    event.target.value = '';
}

// ---------------------------------------------------------------------------
// UI utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showToast(message, duration = 2500) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
            background:var(--accent-primary); color:white; padding:10px 20px;
            border-radius:8px; font-size:14px; z-index:9999;
            box-shadow:0 4px 12px var(--shadow); transition:opacity 0.3s;`;
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const settings = loadSettings();
    settings.theme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    saveSettings(settings);
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------

function openSettingsModal() {
    const s = loadSettings();
    document.getElementById('themeSelect').value        = s.theme;
    document.getElementById('defaultViewSelect').value  = s.defaultView;
    document.getElementById('fontSizeSelect').value     = s.fontSize;
    document.getElementById('confirmDeleteCheck').checked = s.confirmDelete;
    document.getElementById('settingsModal').classList.add('show');
}

function saveSettingsFromModal() {
    const settings = {
        theme:         document.getElementById('themeSelect').value,
        defaultView:   document.getElementById('defaultViewSelect').value,
        fontSize:      document.getElementById('fontSizeSelect').value,
        confirmDelete: document.getElementById('confirmDeleteCheck').checked,
    };
    saveSettings(settings);
    applySettings(settings);
    document.getElementById('settingsModal').classList.remove('show');
    showToast('Settings saved!');
    renderPrompts();
}

async function clearAllData() {
    const confirmText = 'DELETE';
    const userInput = prompt(`This will permanently delete ALL data. Type "${confirmText}" to confirm:`);
    if (userInput !== confirmText) return;

    await post('/api/import', { version: 1, sections: [], subsections: [], prompts: [] });
    // Create a default section
    await post('/api/sections', { name: 'General', icon: '📁' });
    document.getElementById('settingsModal').classList.remove('show');
    await renderSections();
    await renderPrompts();
    showToast('All data cleared.');
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async () => {
    const settings = loadSettings();
    applySettings(settings);

    // Ensure at least one section exists
    const sections = await get('/api/sections');
    if (sections.length === 0) {
        await post('/api/sections', { name: 'General', icon: '📁' });
    }

    await renderSections();
    await renderPrompts();

    // --- Prompt modal ---
    document.getElementById('addPrompt').addEventListener('click',        () => openPromptModal());
    document.getElementById('fabAddPrompt').addEventListener('click',     () => openPromptModal());
    document.getElementById('savePrompt').addEventListener('click',       savePrompt);
    document.getElementById('cancelPrompt').addEventListener('click',     () => document.getElementById('promptModal').classList.remove('show'));
    document.getElementById('closePromptModal').addEventListener('click', () => document.getElementById('promptModal').classList.remove('show'));

    // --- View modal ---
    document.getElementById('closeViewModal').addEventListener('click',  () => document.getElementById('viewPromptModal').classList.remove('show'));
    document.getElementById('editPromptBtn').addEventListener('click',   () => {
        document.getElementById('viewPromptModal').classList.remove('show');
        openPromptModal(state.editingPromptId);
    });
    document.getElementById('duplicatePromptBtn').addEventListener('click', duplicatePrompt);
    document.getElementById('deletePromptBtn').addEventListener('click',    deletePrompt);
    document.getElementById('copyPromptBtn').addEventListener('click', () => {
        const el = document.getElementById('renderedPrompt') || document.getElementById('promptContentDisplay');
        if (el) { navigator.clipboard.writeText(el.textContent); showToast('Copied to clipboard!'); }
    });

    // --- Section modal ---
    document.getElementById('addSection').addEventListener('click',      () => document.getElementById('sectionModal').classList.add('show'));
    document.getElementById('fabAddSection').addEventListener('click',   () => document.getElementById('sectionModal').classList.add('show'));
    document.getElementById('cancelSection').addEventListener('click',   () => document.getElementById('sectionModal').classList.remove('show'));
    document.getElementById('closeSectionModal').addEventListener('click', () => document.getElementById('sectionModal').classList.remove('show'));
    document.getElementById('saveSection').addEventListener('click', async () => {
        const name = document.getElementById('sectionName').value.trim();
        const icon = document.getElementById('sectionIcon').value.trim() || '📁';
        if (!name) { alert('Please enter a section name'); return; }
        await post('/api/sections', { name, icon });
        document.getElementById('sectionModal').classList.remove('show');
        document.getElementById('sectionForm').reset();
        await renderSections();
        await renderPrompts();
    });

    // --- Subsection dropdown ---
    document.getElementById('promptSection').addEventListener('change', e => {
        if (e.target.value) loadSubsections(e.target.value);
        else document.getElementById('promptSubsection').innerHTML = '<option value="">Select a subsection</option>';
    });

    // --- Search ---
    document.getElementById('globalSearch').addEventListener('input', e => {
        state.searchQuery = e.target.value;
        renderPrompts();
    });

    // --- Header actions ---
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('exportData').addEventListener('click', exportData);
    document.getElementById('importData').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importData);

    // --- FAB ---
    document.getElementById('fabToggle').addEventListener('click', () => document.getElementById('fabMenu').classList.toggle('open'));

    // --- Settings ---
    document.getElementById('settingsBtn').addEventListener('click',         openSettingsModal);
    document.getElementById('closeSettingsModal').addEventListener('click',  () => document.getElementById('settingsModal').classList.remove('show'));
    document.getElementById('saveSettingsBtn').addEventListener('click',     saveSettingsFromModal);
    document.getElementById('resetSettingsBtn').addEventListener('click',    () => {
        saveSettings(defaultSettings);
        applySettings(defaultSettings);
        openSettingsModal();
    });
    document.getElementById('clearAllDataBtn').addEventListener('click', clearAllData);

    // --- Close modals on backdrop click ---
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
    });
})();
