import {
    getGroups, createGroup, renameGroup, deleteGroup,
    toggleCollapse, movePersonas, getUngroupedAvatars
} from './storage.js';
import {
    getAllPersonaAvatars, getPersonaName,
    isPersonaBoundToCharacter, getAvatarUrl
} from './utils.js';

const CONTAINER_ID = 'pg-main-container';

const state = {
    selectMode: false,
    selected: new Set(),
    filter: 'all',
    search: '',
};

export function initMainPanel() {
    const tryInject = () => {
        const native = document.getElementById('user_avatar_block');
        if (!native) {
            setTimeout(tryInject, 500);
            return;
        }
        if (document.getElementById(CONTAINER_ID)) return;

        const container = document.createElement('div');
        container.id = CONTAINER_ID;
        container.className = 'pg-main';
        native.parentElement.insertBefore(container, native);

        native.classList.add('pg-native-hidden');

        renderMainPanel();
    };
    tryInject();
}

export function refreshMainPanel() {
    if (!document.getElementById(CONTAINER_ID)) return;
    renderMainPanel();
}

function renderMainPanel() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const allAvatars = getAllPersonaAvatars();
    const filteredAll = applyFilter(allAvatars);

    container.innerHTML = `
        <div class="pg-toolbar">
            <input type="text" class="text_pole pg-search" placeholder="搜索人设..." value="${escapeHtml(state.search)}">
            <select class="pg-filter">
                <option value="all" ${state.filter === 'all' ? 'selected' : ''}>全部</option>
                <option value="bound" ${state.filter === 'bound' ? 'selected' : ''}>已绑定</option>
                <option value="unbound" ${state.filter === 'unbound' ? 'selected' : ''}>未绑定</option>
            </select>
            <button class="menu_button pg-btn-newgroup" title="新建分组"><i class="fa-solid fa-folder-plus"></i></button>
            <button class="menu_button pg-btn-selectmode ${state.selectMode ? 'pg-active' : ''}" title="多选模式">
                <i class="fa-solid fa-check-double"></i>
            </button>
        </div>
        ${state.selectMode ? renderSelectionBar() : ''}
        <div class="pg-groups-list"></div>
        <div class="pg-ungrouped-section">
            <div class="pg-section-title">未分组</div>
            <div class="pg-personas pg-ungrouped-personas"></div>
        </div>
    `;

    const groupsList = container.querySelector('.pg-groups-list');
    for (const g of getGroups()) {
        groupsList.appendChild(renderGroup(g, filteredAll));
    }

    const ungrouped = getUngroupedAvatars(filteredAll);
    const ungroupedDiv = container.querySelector('.pg-ungrouped-personas');
    for (const avatar of ungrouped) {
        ungroupedDiv.appendChild(renderPersonaCard(avatar));
    }

    bindEvents(container);
}

function renderSelectionBar() {
    const groups = getGroups();
    const options = groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
    return `
        <div class="pg-selection-bar">
            <span>已选 <b class="pg-selected-count">${state.selected.size}</b></span>
            <select class="pg-move-target">
                <option value="">— 移到分组 —</option>
                ${options}
                <option value="__ungroup__">↓ 移出（未分组）</option>
            </select>
            <button class="menu_button pg-btn-move">应用</button>
            <button class="menu_button pg-btn-clear-sel">清空</button>
        </div>
    `;
}

function renderGroup(g, filteredAll) {
    const div = document.createElement('div');
    div.className = `pg-group ${g.collapsed ? 'pg-collapsed' : ''}`;
    div.dataset.gid = g.id;

    const personasInGroup = g.personas.filter(a => filteredAll.includes(a));

    div.innerHTML = `
        <div class="pg-group-header">
            <i class="fa-solid fa-chevron-down pg-toggle"></i>
            <span class="pg-group-name" title="双击重命名">${escapeHtml(g.name)}</span>
            <span class="pg-group-count">${personasInGroup.length}</span>
            <div class="pg-group-actions">
                <i class="fa-solid fa-pen pg-btn-rename" title="重命名"></i>
                <i class="fa-solid fa-trash pg-btn-delgroup" title="删除分组"></i>
            </div>
        </div>
        <div class="pg-group-body">
            <div class="pg-personas"></div>
        </div>
    `;

    const body = div.querySelector('.pg-personas');
    for (const avatar of personasInGroup) {
        body.appendChild(renderPersonaCard(avatar));
    }
    return div;
}

function renderPersonaCard(avatar) {
    const nativeCard = document.querySelector(`#user_avatar_block .avatar-container[imgfile="${CSS.escape(avatar)}"]`)
        || document.querySelector(`#user_avatar_block [imgfile="${CSS.escape(avatar)}"]`);

    const card = document.createElement('div');
    card.className = 'pg-persona-card';
    card.dataset.avatar = avatar;

    const checkHtml = state.selectMode
        ? `<input type="checkbox" class="pg-check" ${state.selected.has(avatar) ? 'checked' : ''}>`
        : '';
    const boundHtml = isPersonaBoundToCharacter(avatar)
        ? '<i class="fa-solid fa-link pg-bound-icon" title="已绑定角色"></i>'
        : '';

    card.innerHTML = `
        ${checkHtml}
        <img src="${getAvatarUrl(avatar)}" class="pg-avatar-img" alt="${escapeHtml(getPersonaName(avatar))}">
        <div class="pg-persona-name" title="${escapeHtml(getPersonaName(avatar))}">${escapeHtml(getPersonaName(avatar))}</div>
        ${boundHtml}
    `;

    card.addEventListener('click', (e) => {
        if (state.selectMode) {
            e.preventDefault();
            e.stopPropagation();
            toggleSelect(avatar);
            return;
        }
        if (nativeCard) nativeCard.click();
    });

    return card;
}

function applyFilter(avatars) {
    let result = avatars;
    if (state.filter === 'bound') {
        result = result.filter(a => isPersonaBoundToCharacter(a));
    } else if (state.filter === 'unbound') {
        result = result.filter(a => !isPersonaBoundToCharacter(a));
    }
    if (state.search.trim()) {
        const kw = state.search.trim().toLowerCase();
        result = result.filter(a =>
            a.toLowerCase().includes(kw) ||
            getPersonaName(a).toLowerCase().includes(kw)
        );
    }
    return result;
}

function toggleSelect(avatar) {
    if (state.selected.has(avatar)) state.selected.delete(avatar);
    else state.selected.add(avatar);
    renderMainPanel();
}

function bindEvents(container) {
    const search = container.querySelector('.pg-search');
    if (search) {
        search.addEventListener('input', (e) => {
            state.search = e.target.value;
            renderMainPanel();
        });
    }

    const filter = container.querySelector('.pg-filter');
    if (filter) {
        filter.addEventListener('change', (e) => {
            state.filter = e.target.value;
            renderMainPanel();
        });
    }

    const newGroupBtn = container.querySelector('.pg-btn-newgroup');
    if (newGroupBtn) {
        newGroupBtn.addEventListener('click', () => {
            const name = prompt('新分组名称：', '新分组');
            if (name && name.trim()) {
                createGroup(name.trim());
                renderMainPanel();
            }
        });
    }

    const selModeBtn = container.querySelector('.pg-btn-selectmode');
    if (selModeBtn) {
        selModeBtn.addEventListener('click', () => {
            state.selectMode = !state.selectMode;
            state.selected.clear();
            renderMainPanel();
        });
    }

    if (state.selectMode) {
        const clearBtn = container.querySelector('.pg-btn-clear-sel');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.selected.clear();
                renderMainPanel();
            });
        }

        const moveBtn = container.querySelector('.pg-btn-move');
        if (moveBtn) {
            moveBtn.addEventListener('click', () => {
                const targetSel = container.querySelector('.pg-move-target');
                const target = targetSel ? targetSel.value : '';
                if (!target) return;
                const arr = [...state.selected];
                if (target === '__ungroup__') {
                    movePersonas(arr, null);
                } else {
                    movePersonas(arr, target);
                }
                state.selected.clear();
                renderMainPanel();
            });
        }

        container.querySelectorAll('.pg-check').forEach(cb => {
            cb.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = e.target.closest('.pg-persona-card');
                if (card) toggleSelect(card.dataset.avatar);
            });
        });
    }

    container.querySelectorAll('.pg-group').forEach(div => {
        const gid = div.dataset.gid;
        const toggle = div.querySelector('.pg-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                toggleCollapse(gid);
                renderMainPanel();
            });
        }
        const nameEl = div.querySelector('.pg-group-name');
        if (nameEl) {
            nameEl.addEventListener('dblclick', () => {
                const cur = (getGroups().find(x => x.id === gid) || {}).name || '';
                const name = prompt('重命名：', cur);
                if (name && name.trim()) { renameGroup(gid, name.trim()); renderMainPanel(); }
            });
        }
        const renameBtn = div.querySelector('.pg-btn-rename');
        if (renameBtn) {
            renameBtn.addEventListener('click', () => {
                const cur = (getGroups().find(x => x.id === gid) || {}).name || '';
                const name = prompt('重命名：', cur);
                if (name && name.trim()) { renameGroup(gid, name.trim()); renderMainPanel(); }
            });
        }
        const delBtn = div.querySelector('.pg-btn-delgroup');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                if (confirm('删除该分组？分组内人设会被移到"未分组"。')) {
                    deleteGroup(gid);
                    renderMainPanel();
                }
            });
        }
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
}

function toggleQuickPopup() {
    let popup = document.getElementById(POPUP_ID);
    if (popup) {
        if (popup.style.display === 'none') {
            popup.style.display = 'block';
            renderQuickPopup();
            positionPopup(popup);
        } else {
            popup.style.display = 'none';
        }
        return;
    }
    popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.className = 'pg-quick-popup';
    document.body.appendChild(popup);
    renderQuickPopup();
    positionPopup(popup);

    // 点击外部关闭
    setTimeout(() => {
        document.addEventListener('click', closeOnOutside);
    }, 100);
}

function closeOnOutside(e) {
    const popup = document.getElementById(POPUP_ID);
    const btn = document.getElementById(BTN_ID);
    if (!popup) return;
    if (!popup.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
        popup.style.display = 'none';
        document.removeEventListener('click', closeOnOutside);
    }
}

function positionPopup(popup) {
    const btn = document.getElementById(BTN_ID);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    popup.style.left = `${Math.max(8, rect.left - 100)}px`;
}

function renderQuickPopup() {
    const popup = document.getElementById(POPUP_ID);
    if (!popup) return;

    const allAvatars = getAllPersonaAvatars();

    let html = '<div class="pg-quick-header">切换人设</div>';

    for (const g of getGroups()) {
        const personas = g.personas.filter(a => allAvatars.includes(a));
        if (personas.length === 0) continue;
        html += `
            <div class="pg-quick-group ${g.collapsed ? 'pg-collapsed' : ''}" data-gid="${g.id}">
                <div class="pg-quick-group-header">
                    <i class="fa-solid fa-chevron-down"></i>
                    <span>${escapeHtml(g.name)}</span>
                    <span class="pg-quick-count">${personas.length}</span>
                </div>
                <div class="pg-quick-grid">
                    ${personas.map(a => renderQuickAvatar(a)).join('')}
                </div>
            </div>
        `;
    }

    const ungrouped = getUngroupedAvatars(allAvatars);
    if (ungrouped.length > 0) {
        html += `
            <div class="pg-quick-ungrouped">
                <div class="pg-quick-section-title">未分组</div>
                <div class="pg-quick-grid">
                    ${ungrouped.map(a => renderQuickAvatar(a)).join('')}
                </div>
            </div>
        `;
    }

    popup.innerHTML = html;

    // 绑定切换事件
    popup.querySelectorAll('.pg-quick-avatar').forEach(el => {
        el.addEventListener('click', () => {
            const avatar = el.dataset.avatar;
            const native = document.querySelector(`#user_avatar_block [imgfile="${CSS.escape(avatar)}"]`);
            if (native) {
                native.click();
                popup.style.display = 'none';
            }
        });
    });

    // 折叠
    popup.querySelectorAll('.pg-quick-group-header').forEach(h => {
        h.addEventListener('click', () => {
            const gid = h.parentElement.dataset.gid;
            toggleCollapse(gid);
            renderQuickPopup();
        });
    });
}

function renderQuickAvatar(avatar) {
    const cur = isCurrentPersona(avatar) ? 'pg-current' : '';
    return `
        <div class="pg-quick-avatar ${cur}" data-avatar="${escapeHtml(avatar)}" title="${escapeHtml(getPersonaName(avatar))}">
            <img src="${getAvatarUrl(avatar)}" alt="">
        </div>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
