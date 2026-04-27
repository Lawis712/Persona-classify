// Persona Group Manager - SillyTavern Extension
// 兼容 ST 1.12.4 ~ 1.17+

// 【改动1】去掉 IIFE 包裹，改为顶层代码 + jQuery 启动
'use strict';

const PGM_EXTENSION_NAME = 'persona-group-manager';
const PGM_SETTINGS_KEY = 'personaGroupManager';

// ========== 工具函数 ==========

function pgm_getContext() {
    return window.SillyTavern?.getContext?.() || SillyTavern.getContext();
}

// 【改动2】兼容获取 power_user
function pgm_getPowerUser() {
    try {
        if (typeof power_user !== 'undefined' && power_user?.personas) return power_user;
    } catch (e) { /* ignore */ }
    try {
        const ctx = pgm_getContext();
        if (ctx.powerUserSettings?.personas) return ctx.powerUserSettings;
    } catch (e) { /* ignore */ }
    return null;
}

function pgm_getDefaultSettings() {
    return {
        groups: [],          // [{ id, name, order, collapsed }]
        personaGroupMap: {}, // { personaKey: groupId }
        quickCollapsed: {},  // { groupId: bool } 快捷弹窗折叠状态
        version: 1,
    };
}

function pgm_getSettings() {
    const context = pgm_getContext();
    if (!context.extensionSettings[PGM_SETTINGS_KEY]) {
        context.extensionSettings[PGM_SETTINGS_KEY] = pgm_getDefaultSettings();
    }
    return context.extensionSettings[PGM_SETTINGS_KEY];
}

function pgm_saveSettings() {
    const context = pgm_getContext();
    context.saveSettingsDebounced();
}

function pgm_generateId() {
    return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * 获取所有 persona 数据
 * 兼容不同 ST 版本
 */
function pgm_getAllPersonas() {
    const result = [];
    try {
        // 【改动2】使用兼容函数
        const pu = pgm_getPowerUser();
        if (!pu || !pu.personas) return result;

        for (const [key, name] of Object.entries(pu.personas)) {
            const descObj = pu.persona_descriptions?.[key];
            const description = typeof descObj === 'object' ? descObj.description : (descObj || '');
            const isBound = pgm_isPersonaBound(key);
            result.push({
                key,
                name: name || key,
                description: description || '',
                bound: isBound,
                avatarUrl: pgm_getPersonaAvatarUrl(key),
            });
        }
    } catch (e) {
        console.error('[PGM] getAllPersonas error:', e);
    }
    return result;
}

function pgm_isPersonaBound(personaKey) {
    try {
        const pu = pgm_getPowerUser();
        if (!pu?.persona_descriptions) return false;
        if (pu.persona_bind && typeof pu.persona_bind === 'object') {
            return Object.values(pu.persona_bind).includes(personaKey);
        }
        return false;
    } catch (e) {
        return false;
    }
}

// 【改动6】兼容两种头像URL格式
function pgm_getPersonaAvatarUrl(key) {
    return `/thumbnail?type=persona&file=${encodeURIComponent(key)}`;
}

function pgm_getPersonaAvatarFallbackUrl(key) {
    return `/User Avatars/${encodeURIComponent(key)}`;
}

function pgm_getCurrentPersonaKey() {
    try {
        const pu = pgm_getPowerUser();
        return pu?.user_avatar || '';
    } catch (e) {
        return '';
    }
}

function pgm_switchPersona(personaKey) {
    try {
        // 使用 ST 原生的切换方式
        const event = new CustomEvent('persona_switch_request', { detail: { key: personaKey } });
        document.dispatchEvent(event);

        // 直接调用 ST 内部函数（兼容多版本）
        if (typeof setUserAvatar === 'function') {
            setUserAvatar(personaKey);
            return;
        }

        // 备用方案：模拟点击
        const avatarElements = document.querySelectorAll('#user_avatar_block .avatar-container');
        for (const el of avatarElements) {
            // 【改动3】也检查 data-avatar-id
            if (pgm_getPersonaKeyFromElement(el) === personaKey) {
                el.click();
                return;
            }
        }

        // 第三备用方案：STScript
        const ctx = pgm_getContext();
        if (ctx.executeSlashCommands) {
            ctx.executeSlashCommands(`/persona ${personaKey}`);
            return;
        }
        if (typeof executeSlashCommands === 'function') {
            executeSlashCommands(`/persona ${personaKey}`);
        }
    } catch (e) {
        console.error('[PGM] switchPersona error:', e);
    }
}

function pgm_truncateText(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}

// ========== 分组数据操作 ==========

function pgm_getGroups() {
    const settings = pgm_getSettings();
    return [...settings.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function pgm_addGroup(name) {
    const settings = pgm_getSettings();
    const group = {
        id: pgm_generateId(),
        name: name,
        order: settings.groups.length,
        collapsed: false,
    };
    settings.groups.push(group);
    pgm_saveSettings();
    return group;
}

function pgm_renameGroup(groupId, newName) {
    const settings = pgm_getSettings();
    const group = settings.groups.find(g => g.id === groupId);
    if (group) {
        group.name = newName;
        pgm_saveSettings();
    }
}

function pgm_deleteGroup(groupId) {
    const settings = pgm_getSettings();
    settings.groups = settings.groups.filter(g => g.id !== groupId);
    // 把该组的人设移到未分组
    for (const [key, gid] of Object.entries(settings.personaGroupMap)) {
        if (gid === groupId) {
            delete settings.personaGroupMap[key];
        }
    }
    pgm_saveSettings();
}

function pgm_toggleGroupCollapse(groupId, target) {
    const settings = pgm_getSettings();
    if (target === 'quick') {
        if (!settings.quickCollapsed) settings.quickCollapsed = {};
        settings.quickCollapsed[groupId] = !settings.quickCollapsed[groupId];
    } else {
        const group = settings.groups.find(g => g.id === groupId);
        if (group) {
            group.collapsed = !group.collapsed;
        }
    }
    pgm_saveSettings();
}

function pgm_setPersonaGroup(personaKey, groupId) {
    const settings = pgm_getSettings();
    if (groupId) {
        settings.personaGroupMap[personaKey] = groupId;
    } else {
        delete settings.personaGroupMap[personaKey];
    }
    pgm_saveSettings();
}

function pgm_getPersonasByGroup(personas) {
    const settings = pgm_getSettings();
    const groups = pgm_getGroups();
    const grouped = {};
    const ungrouped = [];

    for (const g of groups) {
        grouped[g.id] = [];
    }

    for (const p of personas) {
        const gid = settings.personaGroupMap[p.key];
        if (gid && grouped[gid]) {
            grouped[gid].push(p);
        } else {
            ungrouped.push(p);
        }
    }

    return { groups, grouped, ungrouped };
}

// ========== 右键菜单 ==========

function pgm_showContextMenu(e, personaKey) {
    e.preventDefault();
    pgm_removeContextMenu();

    const settings = pgm_getSettings();
    const groups = pgm_getGroups();
    const currentGroup = settings.personaGroupMap[personaKey] || null;

    const menu = document.createElement('div');
    menu.className = 'pgm-context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    // 标题
    const title = document.createElement('div');
    title.className = 'pgm-context-menu-item';
    title.style.fontWeight = 'bold';
    title.style.cursor = 'default';
    title.style.opacity = '0.6';
    title.style.fontSize = '11px';
    title.textContent = '移动到分组';
    menu.appendChild(title);

    const divider1 = document.createElement('div');
    divider1.className = 'pgm-context-menu-divider';
    menu.appendChild(divider1);

    // 各个分组
    for (const g of groups) {
        const item = document.createElement('div');
        item.className = 'pgm-context-menu-item';
        item.textContent = (currentGroup === g.id ? '✓ ' : '　') + g.name;
        item.addEventListener('click', () => {
            pgm_setPersonaGroup(personaKey, g.id);
            pgm_removeContextMenu();
            pgm_refreshAllViews();
        });
        menu.appendChild(item);
    }

    // 移出分组
    if (currentGroup) {
        const divider2 = document.createElement('div');
        divider2.className = 'pgm-context-menu-divider';
        menu.appendChild(divider2);

        const removeItem = document.createElement('div');
        removeItem.className = 'pgm-context-menu-item';
        removeItem.textContent = '✕ 移出分组';
        removeItem.addEventListener('click', () => {
            pgm_setPersonaGroup(personaKey, null);
            pgm_removeContextMenu();
            pgm_refreshAllViews();
        });
        menu.appendChild(removeItem);
    }

    // 新建分组并移入
    const divider3 = document.createElement('div');
    divider3.className = 'pgm-context-menu-divider';
    menu.appendChild(divider3);

    const newGroupItem = document.createElement('div');
    newGroupItem.className = 'pgm-context-menu-item';
    newGroupItem.textContent = '+ 新建分组并移入';
    newGroupItem.addEventListener('click', () => {
        pgm_removeContextMenu();
        const name = prompt('输入分组名称：');
        if (name && name.trim()) {
            const group = pgm_addGroup(name.trim());
            pgm_setPersonaGroup(personaKey, group.id);
            pgm_refreshAllViews();
        }
    });
    menu.appendChild(newGroupItem);

    document.body.appendChild(menu);

    // 修正位置防止超出屏幕
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
    }

    // 点击其他地方关闭
    setTimeout(() => {
        document.addEventListener('click', pgm_removeContextMenu, { once: true });
    }, 0);
}

function pgm_removeContextMenu() {
    document.querySelectorAll('.pgm-context-menu').forEach(el => el.remove());
}

// ========== 位置1：用户设定管理面板增强 ==========

let pgm_panelObserver = null;
let pgm_currentFilter = 'all'; // 'all' | 'bound' | 'unbound'

function pgm_initPanelEnhancement() {
    pgm_observePanel();
}

function pgm_observePanel() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (pgm_isPersonaPanel(node)) {
                    setTimeout(() => pgm_enhancePanel(), 100);
                }
                const inner = node.querySelector?.('#user_avatar_block, .persona_manager');
                if (inner) {
                    setTimeout(() => pgm_enhancePanel(), 100);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    pgm_panelObserver = observer;

    const checkExisting = () => {
        const panel = pgm_findPersonaPanel();
        if (panel && !panel.dataset.pgmEnhanced) {
            pgm_enhancePanel();
        }
    };

    setInterval(checkExisting, 1000);
}

function pgm_isPersonaPanel(node) {
    if (!node || !node.matches) return false;
    return node.matches('#user_avatar_block, .persona_manager, [id*="persona"]');
}

function pgm_findPersonaPanel() {
    return document.querySelector('#user_avatar_block')
        || document.querySelector('.persona_manager')
        || document.querySelector('#persona-management-block');
}

function pgm_findPersonaListContainer() {
    const panel = pgm_findPersonaPanel();
    if (!panel) return null;

    const avatarContainers = panel.querySelectorAll('.avatar-container');
    if (avatarContainers.length > 0) {
        return avatarContainers[0].parentElement;
    }
    return null;
}

function pgm_enhancePanel() {
    const panel = pgm_findPersonaPanel();
    if (!panel) return;

    const listContainer = pgm_findPersonaListContainer();
    if (!listContainer) return;

    if (panel.dataset.pgmEnhanced === 'true') {
        pgm_refreshPanelView();
        return;
    }

    panel.dataset.pgmEnhanced = 'true';

    pgm_injectPanelControls(listContainer);
    pgm_refreshPanelView();
}

function pgm_injectPanelControls(listContainer) {
    if (document.getElementById('pgm-panel-controls')) return;

    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'pgm-panel-controls';

    const filters = [
        { key: 'all', label: '全部' },
        { key: 'bound', label: '已绑定' },
        { key: 'unbound', label: '未绑定' },
    ];

    for (const f of filters) {
        const btn = document.createElement('button');
        btn.className = 'pgm-filter-btn' + (pgm_currentFilter === f.key ? ' active' : '');
        btn.textContent = f.label;
        btn.dataset.filter = f.key;
        btn.addEventListener('click', () => {
            pgm_currentFilter = f.key;
            document.querySelectorAll('#pgm-panel-controls .pgm-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            pgm_refreshPanelView();
        });
        controlsDiv.appendChild(btn);
    }

    const addBtn = document.createElement('button');
    addBtn.id = 'pgm-add-group-btn';
    addBtn.textContent = '+ 新建分组';
    addBtn.addEventListener('click', () => {
        const name = prompt('输入分组名称：');
        if (name && name.trim()) {
            pgm_addGroup(name.trim());
            pgm_refreshAllViews();
        }
    });
    controlsDiv.appendChild(addBtn);

    listContainer.parentNode.insertBefore(controlsDiv, listContainer);
}

function pgm_refreshPanelView() {
    const listContainer = pgm_findPersonaListContainer();
    if (!listContainer) return;

    const personas = pgm_getAllPersonas();

    let filtered = personas;
    if (pgm_currentFilter === 'bound') {
        filtered = personas.filter(p => p.bound);
    } else if (pgm_currentFilter === 'unbound') {
        filtered = personas.filter(p => !p.bound);
    }

    const { groups, grouped, ungrouped } = pgm_getPersonasByGroup(filtered);

    // 获取原始的 avatar-container 元素映射
    const originalElements = {};
    listContainer.querySelectorAll('.avatar-container').forEach(el => {
        const key = pgm_getPersonaKeyFromElement(el);
        if (key) {
            originalElements[key] = el;
        }
    });

    // 隐藏所有原始元素（不删除，保持ST的事件绑定）
    listContainer.querySelectorAll('.avatar-container').forEach(el => {
        el.style.display = 'none';
    });

    // 移除之前的分组容器
    listContainer.querySelectorAll('.pgm-group-section, .pgm-ungrouped-separator, .pgm-ungrouped-wrapper').forEach(el => el.remove());

    // 渲染分组
    for (const group of groups) {
        const personasInGroup = grouped[group.id] || [];
        if (personasInGroup.length === 0) continue;

        const section = pgm_createGroupSection(group, personasInGroup, originalElements, 'panel');
        listContainer.insertBefore(section, listContainer.firstChild);
    }

    // 渲染未分组的人设
    if (ungrouped.length > 0) {
        if (groups.some(g => (grouped[g.id] || []).length > 0)) {
            const separator = document.createElement('div');
            separator.className = 'pgm-ungrouped-separator';
            separator.textContent = '未分组';
            listContainer.appendChild(separator);
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'pgm-ungrouped-wrapper';

        for (const p of ungrouped) {
            const el = originalElements[p.key];
            if (el) {
                el.style.display = '';
                wrapper.appendChild(el);
                pgm_attachContextMenu(el, p.key);
            }
        }
        listContainer.appendChild(wrapper);
    }
}

function pgm_createGroupSection(group, personas, originalElements, mode) {
    const section = document.createElement('div');
    section.className = 'pgm-group-section';
    section.dataset.groupId = group.id;

    // 拖拽目标
    section.addEventListener('dragover', (e) => {
        e.preventDefault();
        section.classList.add('pgm-drag-over');
    });
    section.addEventListener('dragleave', () => {
        section.classList.remove('pgm-drag-over');
    });
    section.addEventListener('drop', (e) => {
        e.preventDefault();
        section.classList.remove('pgm-drag-over');
        const personaKey = e.dataTransfer.getData('text/persona-key');
        if (personaKey) {
            pgm_setPersonaGroup(personaKey, group.id);
            pgm_refreshAllViews();
        }
    });

    // Header
    const header = document.createElement('div');
    header.className = 'pgm-group-header';

    const arrow = document.createElement('span');
    arrow.className = 'pgm-group-arrow' + (group.collapsed ? ' collapsed' : '');
    arrow.textContent = '▼';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pgm-group-name';
    nameSpan.textContent = group.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'pgm-group-count';
    countSpan.textContent = `(${personas.length})`;

    const actions = document.createElement('div');
    actions.className = 'pgm-group-actions';

    if (mode === 'panel') {
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️';
        renameBtn.title = '重命名';
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newName = prompt('重命名分组：', group.name);
            if (newName && newName.trim()) {
                pgm_renameGroup(group.id, newName.trim()); // 【改动4】修复 roup() -> pgm_renameGroup()
                pgm_refreshAllViews();
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = '删除分组';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`确定删除分组「${group.name}」吗？\n（人设不会被删除，会回到未分组状态）`)) {
                pgm_deleteGroup(group.id);
                pgm_refreshAllViews();
            }
        });

        actions.appendChild(renameBtn);
        actions.appendChild(deleteBtn);
    }

    header.appendChild(arrow);
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    header.appendChild(actions);

    // 折叠控制
    const isCollapsed = mode === 'quick'
        ? (pgm_getSettings().quickCollapsed?.[group.id] || false)
        : group.collapsed;

    header.addEventListener('click', () => {
        pgm_toggleGroupCollapse(group.id, mode === 'quick' ? 'quick' : 'panel');
        const content = section.querySelector('.pgm-group-content');
        const arrowEl = section.querySelector('.pgm-group-arrow');
        if (content) content.classList.toggle('collapsed');
        if (arrowEl) arrowEl.classList.toggle('collapsed');
    });

    section.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'pgm-group-content' + (isCollapsed ? ' collapsed' : '');

    if (mode === 'panel') {
        for (const p of personas) {
            const el = originalElements?.[p.key];
            if (el) {
                el.style.display = '';
                content.appendChild(el);
                pgm_attachContextMenu(el, p.key);
                pgm_makeDraggable(el, p.key);
            }
        }
    } else if (mode === 'quick') {
        const grid = document.createElement('div');
        grid.className = 'pgm-quick-grid';
        const currentKey = pgm_getCurrentPersonaKey();

        for (const p of personas) {
            const avatarDiv = pgm_createQuickAvatarItem(p, currentKey);
            grid.appendChild(avatarDiv);
        }
        content.appendChild(grid);
    }

    if (isCollapsed) {
        const arrowEl = header.querySelector('.pgm-group-arrow');
        if (arrowEl) arrowEl.classList.add('collapsed');
    }

    section.appendChild(content);
    return section;
}

// 【改动3】增强 getPersonaKeyFromElement，兼容 data-avatar-id
function pgm_getPersonaKeyFromElement(el) {
    if (!el) return '';

    // 方式1: data-avatar-id（新版 ST）
    const avatarId = el.getAttribute('data-avatar-id') || el.dataset?.avatarId;
    if (avatarId) return avatarId;

    // 方式2: 子元素的 data-avatar-id
    const innerAvatar = el.querySelector('[data-avatar-id]');
    if (innerAvatar) {
        const id = innerAvatar.getAttribute('data-avatar-id');
        if (id) return id;
    }

    // 方式3: imgfile 属性
    const imgFile = el.getAttribute('imgfile');
    if (imgFile) return imgFile;
    const innerImgFile = el.querySelector('[imgfile]');
    if (innerImgFile) return innerImgFile.getAttribute('imgfile');

    // 方式4: data-persona 属性
    if (el.dataset?.persona) return el.dataset.persona;

    // 方式5: 从 img src 中提取
    const img = el.querySelector('img');
    if (img) {
        const src = decodeURIComponent(img.getAttribute('src') || '');
        // thumbnail?type=persona&file=xxx.png
        const thumbMatch = src.match(/[?&]file=([^&#]+)/i);
        if (thumbMatch) return decodeURIComponent(thumbMatch[1]);
        // /User Avatars/xxx.png
        const directMatch = src.match(/User\s*Avatars\/(.+?)(?:\?|$)/i);
        if (directMatch) return decodeURIComponent(directMatch[1]);
    }

    // 方式6: title
    return el.getAttribute('title') || '';
}

function pgm_attachContextMenu(el, personaKey) {
    if (el.dataset.pgmContextMenu) return;
    el.dataset.pgmContextMenu = 'true';

    el.addEventListener('contextmenu', (e) => {
        pgm_showContextMenu(e, personaKey);
    });
}

function pgm_makeDraggable(el, personaKey) {
    if (el.dataset.pgmDraggable) return;
    el.dataset.pgmDraggable = 'true';
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/persona-key', personaKey);
        el.classList.add('pgm-dragging');
    });

    el.addEventListener('dragend', () => {
        el.classList.remove('pgm-dragging');
        document.querySelectorAll('.pgm-drag-over').forEach(x => x.classList.remove('pgm-drag-over'));
    });
}

// ========== 位置2：底部快捷弹窗 ==========

// 【改动5】重写插入逻辑，放到魔法棒右边
function pgm_initQuickPopup() {
    const sendForm = document.getElementById('send_form');
    if (!sendForm) {
        console.warn('[PGM] 未找到输入栏，延迟重试...');
        setTimeout(pgm_initQuickPopup, 2000);
        return;
    }

    if (document.getElementById('pgm-quick-btn')) return;

    // 创建按钮
    const btn = document.createElement('div');
    btn.id = 'pgm-quick-btn';
    btn.title = '快速切换人设';

    const btnImg = document.createElement('img');
    btnImg.id = 'pgm-quick-btn-img';
    pgm_updateQuickBtnAvatar(btnImg);
    btn.appendChild(btnImg);

    // 插入到魔法棒右边
    let inserted = false;

    // 尝试1: 魔法棒按钮后面
    const wandBtn = document.getElementById('extensionsMenuButton');
    if (wandBtn) {
        wandBtn.insertAdjacentElement('afterend', btn);
        inserted = true;
    }

    // 尝试2: #send_but_sheld 后面（旧版本）
    if (!inserted) {
        const sendButSheld = document.getElementById('send_but_sheld');
        if (sendButSheld) {
            sendButSheld.insertAdjacentElement('afterend', btn);
            inserted = true;
        }
    }

    // 尝试3: #leftSendForm 末尾
    if (!inserted) {
        const leftButtons = sendForm.querySelector('#leftSendForm');
        if (leftButtons) {
            leftButtons.appendChild(btn);
            inserted = true;
        }
    }

    // 尝试4: send_form 开头
    if (!inserted) {
        sendForm.insertBefore(btn, sendForm.firstChild);
    }

    console.log('[PGM] 快捷按钮已插入');

    // 创建弹窗
    const overlay = document.createElement('div');
    overlay.id = 'pgm-quick-overlay';
    document.body.appendChild(overlay);

    const popup = document.createElement('div');
    popup.id = 'pgm-quick-popup';
    document.body.appendChild(popup);

    // 事件
    btn.addEventListener('click', () => {
        pgm_toggleQuickPopup();
    });

    overlay.addEventListener('click', () => {
        pgm_closeQuickPopup();
    });

    // ESC 关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popup.classList.contains('visible')) {
            pgm_closeQuickPopup();
        }
    });
}

// 【改动6】头像URL加 fallback
function pgm_updateQuickBtnAvatar(imgEl) {
    if (!imgEl) imgEl = document.getElementById('pgm-quick-btn-img');
    if (!imgEl) return;

    const currentKey = pgm_getCurrentPersonaKey();
    if (currentKey) {
        imgEl.src = pgm_getPersonaAvatarUrl(currentKey);
        imgEl.onerror = () => {
            const fallback = pgm_getPersonaAvatarFallbackUrl(currentKey);
            if (imgEl.src !== fallback) {
                imgEl.src = fallback;
                imgEl.onerror = () => { imgEl.src = '/img/ai4.png'; };
            } else {
                imgEl.src = '/img/ai4.png';
            }
        };
    } else {
        imgEl.src = '/img/ai4.png';
    }
}

function pgm_toggleQuickPopup() {
    const popup = document.getElementById('pgm-quick-popup');
    const overlay = document.getElementById('pgm-quick-overlay');
    if (!popup || !overlay) return;

    if (popup.classList.contains('visible')) {
        pgm_closeQuickPopup();
    } else {
        pgm_renderQuickPopup();
        popup.classList.add('visible');
        overlay.classList.add('visible');
    }
}

function pgm_closeQuickPopup() {
    const popup = document.getElementById('pgm-quick-popup');
    const overlay = document.getElementById('pgm-quick-overlay');
    if (popup) popup.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
}

function pgm_renderQuickPopup() {
    const popup = document.getElementById('pgm-quick-popup');
    if (!popup) return;

    popup.innerHTML = '';

    // 搜索框
    const searchInput = document.createElement('input');
    searchInput.className = 'pgm-quick-search';
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 搜索人设...';
    searchInput.addEventListener('input', () => {
        pgm_renderQuickContent(popup, searchInput.value.toLowerCase());
    });
    popup.appendChild(searchInput);

    // 内容容器
    const contentDiv = document.createElement('div');
    contentDiv.id = 'pgm-quick-content';
    popup.appendChild(contentDiv);

    pgm_renderQuickContent(popup, '');
}

function pgm_renderQuickContent(popup, searchTerm) {
    let contentDiv = popup.querySelector('#pgm-quick-content');
    if (!contentDiv) return;
    contentDiv.innerHTML = '';

    let personas = pgm_getAllPersonas();

    // 搜索过滤
    if (searchTerm) {
        personas = personas.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.description.toLowerCase().includes(searchTerm)
        );
    }

    const { groups, grouped, ungrouped } = pgm_getPersonasByGroup(personas);
    const currentKey = pgm_getCurrentPersonaKey();

    // 渲染分组
    for (const group of groups) {
        const personasInGroup = grouped[group.id] || [];
        if (personasInGroup.length === 0) continue;

        const section = pgm_createGroupSection(group, personasInGroup, null, 'quick');
        contentDiv.appendChild(section);
    }

    // 渲染未分组
    if (ungrouped.length > 0) {
        if (groups.some(g => (grouped[g.id] || []).length > 0)) {
            const separator = document.createElement('div');
            separator.className = 'pgm-ungrouped-separator';
            separator.textContent = '未分组';
            contentDiv.appendChild(separator);
        }

        const grid = document.createElement('div');
        grid.className = 'pgm-quick-grid';

        for (const p of ungrouped) {
            const avatarDiv = pgm_createQuickAvatarItem(p, currentKey);
            grid.appendChild(avatarDiv);
        }
        contentDiv.appendChild(grid);
    }

    if (personas.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:20px;color:var(--SmartThemeQuoteColor,#888);font-size:13px;';
        empty.textContent = searchTerm ? '没有找到匹配的人设' : '暂无人设';
        contentDiv.appendChild(empty);
    }
}

// 【改动6】头像 onerror fallback
function pgm_createQuickAvatarItem(persona, currentKey) {
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'pgm-quick-avatar' + (persona.key === currentKey ? ' active' : '');
    avatarDiv.title = persona.name + (persona.description ? '\n' + pgm_truncateText(persona.description, 80) : '');

    const img = document.createElement('img');
    img.src = pgm_getPersonaAvatarUrl(persona.key);
    img.loading = 'lazy';
    img.onerror = () => {
        const fallback = pgm_getPersonaAvatarFallbackUrl(persona.key);
        if (img.src !== fallback) {
            img.src = fallback;
            img.onerror = () => { img.src = '/img/ai4.png'; };
        } else {
            img.src = '/img/ai4.png';
        }
    };

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pgm-quick-avatar-name';
    nameSpan.textContent = persona.name;

    avatarDiv.appendChild(img);
    avatarDiv.appendChild(nameSpan);

    avatarDiv.addEventListener('click', () => {
        pgm_switchPersona(persona.key);
        pgm_closeQuickPopup();
        setTimeout(() => pgm_updateQuickBtnAvatar(), 300);
    });

    // 右键菜单
    avatarDiv.addEventListener('contextmenu', (e) => {
        pgm_showContextMenu(e, persona.key);
    });

    return avatarDiv;
}

// ========== 刷新所有视图 ==========

function pgm_refreshAllViews() {
    // 刷新位置1（面板）
    const panel = pgm_findPersonaPanel();
    if (panel) {
        panel.dataset.pgmEnhanced = 'false';
        pgm_enhancePanel();
    }

    // 刷新位置2（弹窗）
    const popup = document.getElementById('pgm-quick-popup');
    if (popup && popup.classList.contains('visible')) {
        const searchInput = popup.querySelector('.pgm-quick-search');
        pgm_renderQuickContent(popup, searchInput?.value?.toLowerCase() || '');
    }

    // 更新快捷按钮头像
    pgm_updateQuickBtnAvatar();
}

// ========== 初始化 ==========

function pgm_init() {
    if (window._pgmInitialized) return;
    window._pgmInitialized = true;

    console.log('[PGM] Persona Group Manager 初始化...');

    // 确保设置存在
    pgm_getSettings();

    // 初始化两个位置的功能
    pgm_initPanelEnhancement();
    pgm_initQuickPopup();

    // 监听 persona 变更事件（兼容多版本）
    try {
        const eventSource = pgm_getContext().eventSource;
        if (eventSource) {
            const possibleEvents = [
                'persona_updated',
                'PERSONA_UPDATED',
                'settings_updated',
            ];
            for (const eventName of possibleEvents) {
                try {
                    eventSource.on(eventName, () => {
                        setTimeout(pgm_refreshAllViews, 200);
                    });
                } catch (e) {
                    // 忽略不存在的事件
                }
            }
        }
    } catch (e) {
        console.warn('[PGM] 事件监听注册失败:', e);
    }

    console.log('[PGM] Persona Group Manager 初始化完成！');
}

// 【改动1】ST 标准启动方式
jQuery(async () => {
    const waitForReady = setInterval(() => {
        try {
            const ctx = pgm_getContext();
            if (ctx && document.getElementById('send_form')) {
                clearInterval(waitForReady);
                pgm_init();
            }
        } catch (e) { /* ST 还没准备好 */ }
    }, 500);

    // 最长等 15 秒
    setTimeout(() => {
        clearInterval(waitForReady);
        if (!window._pgmInitialized) {
            console.warn('[PGM] 等待超时，强制初始化');
            pgm_init();
        }
    }, 15000);
});
                    bound: isBound,
                    avatarUrl: getPersonaAvatarUrl(key),
                });
            }
        } catch (e) {
            console.error('[PGM] getAllPersonas error:', e);
        }
        return result;
    }

    function isPersonaBound(personaKey) {
        try {
            const pu = typeof power_user !== 'undefined' ? power_user : null;
            if (!pu?.persona_descriptions) return false;
            const desc = pu.persona_descriptions[personaKey];
            // 检查 default 字段或者绑定关系
            // ST 中 persona 绑定 char 的方式在不同版本不同
            // 通常在 power_user.default_persona 或角色卡的 data.extensions.persona
            // 简单方案：检查是否在任何角色的 default persona 中
            if (pu.persona_bind && typeof pu.persona_bind === 'object') {
                return Object.values(pu.persona_bind).includes(personaKey);
            }
            // 备用方案
            return false;
        } catch (e) {
            return false;
        }
    }

    function getPersonaAvatarUrl(key) {
        // ST 的 persona 头像路径
        return `/User Avatars/${key}`;
    }

    function getCurrentPersonaKey() {
        try {
            const pu = typeof power_user !== 'undefined' ? power_user : null;
            return pu?.user_avatar || '';
        } catch (e) {
            return '';
        }
    }

    function switchPersona(personaKey) {
        try {
            // 使用 ST 原生的切换方式
            // 触发点击对应 persona 或调用内部函数
            const event = new CustomEvent('persona_switch_request', { detail: { key: personaKey } });
            document.dispatchEvent(event);

            // 直接调用 ST 内部函数（兼容多版本）
            if (typeof setUserAvatar === 'function') {
                setUserAvatar(personaKey);
                return;
            }

            // 备用方案：模拟点击
            const avatarElements = document.querySelectorAll('#user_avatar_block .avatar-container');
            for (const el of avatarElements) {
                const imgEl = el.querySelector('img');
                if (imgEl) {
                    const src = imgEl.getAttribute('src') || '';
                    if (src.includes(encodeURIComponent(personaKey)) || src.includes(personaKey)) {
                        el.click();
                        return;
                    }
                }
                // 也检查 data 属性
                if (el.dataset?.persona === personaKey || el.getAttribute('imgfile') === personaKey) {
                    el.click();
                    return;
                }
            }

            // 第三备用方案：STScript
            if (typeof executeSlashCommands === 'function') {
                executeSlashCommands(`/persona ${personaKey}`);
            }
        } catch (e) {
            console.error('[PGM] switchPersona error:', e);
        }
    }

    function truncateText(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    }

    // ========== 分组数据操作 ==========

    function getGroups() {
        const settings = getSettings();
        return [...settings.groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    function addGroup(name) {
        const settings = getSettings();
        const group = {
            id: generateId(),
            name: name,
            order: settings.groups.length,
            collapsed: false,
        };
        settings.groups.push(group);
        saveSettings();
        return group;
    }

    function renameGroup(groupId, newName) {
        const settings = getSettings();
        const group = settings.groups.find(g => g.id === groupId);
        if (group) {
            group.name = newName;
            saveSettings();
        }
    }

    function deleteGroup(groupId) {
        const settings = getSettings();
        settings.groups = settings.groups.filter(g => g.id !== groupId);
        // 把该组的人设移到未分组
        for (const [key, gid] of Object.entries(settings.personaGroupMap)) {
            if (gid === groupId) {
                delete settings.personaGroupMap[key];
            }
        }
        saveSettings();
    }

    function toggleGroupCollapse(groupId, target) {
        const settings = getSettings();
        const targetMap = target === 'quick' ? settings.quickCollapsed : null;
        if (target === 'quick') {
            if (!settings.quickCollapsed) settings.quickCollapsed = {};
            settings.quickCollapsed[groupId] = !settings.quickCollapsed[groupId];
        } else {
            const group = settings.groups.find(g => g.id === groupId);
            if (group) {
                group.collapsed = !group.collapsed;
            }
        }
        saveSettings();
    }

    function setPersonaGroup(personaKey, groupId) {
        const settings = getSettings();
        if (groupId) {
            settings.personaGroupMap[personaKey] = groupId;
        } else {
            delete settings.personaGroupMap[personaKey];
        }
        saveSettings();
    }

    function getPersonasByGroup(personas) {
        const settings = getSettings();
        const groups = getGroups();
        const grouped = {};
        const ungrouped = [];

        for (const g of groups) {
            grouped[g.id] = [];
        }

        for (const p of personas) {
            const gid = settings.personaGroupMap[p.key];
            if (gid && grouped[gid]) {
                grouped[gid].push(p);
            } else {
                ungrouped.push(p);
            }
        }

        return { groups, grouped, ungrouped };
    }

    // ========== 右键菜单 ==========

    function showContextMenu(e, personaKey) {
        e.preventDefault();
        removeContextMenu();

        const settings = getSettings();
        const groups = getGroups();
        const currentGroup = settings.personaGroupMap[personaKey] || null;

        const menu = document.createElement('div');
        menu.className = 'pgm-context-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        // 标题
        const title = document.createElement('div');
        title.className = 'pgm-context-menu-item';
        title.style.fontWeight = 'bold';
        title.style.cursor = 'default';
        title.style.opacity = '0.6';
        title.style.fontSize = '11px';
        title.textContent = '移动到分组';
        menu.appendChild(title);

        const divider1 = document.createElement('div');
        divider1.className = 'pgm-context-menu-divider';
        menu.appendChild(divider1);

        // 各个分组
        for (const g of groups) {
            const item = document.createElement('div');
            item.className = 'pgm-context-menu-item';
            item.textContent = (currentGroup === g.id ? '✓ ' : '　') + g.name;
            item.addEventListener('click', () => {
                setPersonaGroup(personaKey, g.id);
                removeContextMenu();
                refreshAllViews();
            });
            menu.appendChild(item);
        }

        // 移出分组（取消分组）
        if (currentGroup) {
            const divider2 = document.createElement('div');
            divider2.className = 'pgm-context-menu-divider';
            menu.appendChild(divider2);

            const removeItem = document.createElement('div');
            removeItem.className = 'pgm-context-menu-item';
            removeItem.textContent = '✕ 移出分组';
            removeItem.addEventListener('click', () => {
                setPersonaGroup(personaKey, null);
                removeContextMenu();
                refreshAllViews();
            });
            menu.appendChild(removeItem);
        }

        // 新建分组并移入
        const divider3 = document.createElement('div');
        divider3.className = 'pgm-context-menu-divider';
        menu.appendChild(divider3);

        const newGroupItem = document.createElement('div');
        newGroupItem.className = 'pgm-context-menu-item';
        newGroupItem.textContent = '+ 新建分组并移入';
        newGroupItem.addEventListener('click', () => {
            removeContextMenu();
            const name = prompt('输入分组名称：');
            if (name && name.trim()) {
                const group = addGroup(name.trim());
                setPersonaGroup(personaKey, group.id);
                refreshAllViews();
            }
        });
        menu.appendChild(newGroupItem);

        document.body.appendChild(menu);

        // 修正位置防止超出屏幕
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 5) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 5) + 'px';
        }

        // 点击其他地方关闭
        setTimeout(() => {
            document.addEventListener('click', removeContextMenu, { once: true });
        }, 0);
    }

    function removeContextMenu() {
        document.querySelectorAll('.pgm-context-menu').forEach(el => el.remove());
    }

    // ========== 位置1：用户设定管理面板增强 ==========

    let panelObserver = null;
    let currentFilter = 'all'; // 'all' | 'bound' | 'unbound'

    function initPanelEnhancement() {
        // 监视 persona 管理面板的打开
        // ST 的 persona 面板在 #user_avatar_block 或 persona management popup 中
        observePanel();
    }

    function observePanel() {
        // 使用 MutationObserver 监听面板出现
        const targetSelectors = [
            '#persona-management-block',
            '#user_avatar_block',
            '.persona_manager',          // 不同版本可能的选择器
        ];

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    // 检查是否是persona管理面板或其容器
                    if (isPersonaPanel(node)) {
                        setTimeout(() => enhancePanel(), 100);
                    }
                    // 也检查子节点
                    const inner = node.querySelector?.('#user_avatar_block, .persona_manager');
                    if (inner) {
                        setTimeout(() => enhancePanel(), 100);
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        panelObserver = observer;

        // 也监听原有面板的内容变化（当persona列表刷新时）
        const checkExisting = () => {
            const panel = findPersonaPanel();
            if (panel && !panel.dataset.pgmEnhanced) {
                enhancePanel();
            }
        };

        // 定期检查（兼容各种打开方式）
        setInterval(checkExisting, 1000);
    }

    function isPersonaPanel(node) {
        if (!node || !node.matches) return false;
        return node.matches('#user_avatar_block, .persona_manager, [id*="persona"]');
    }

    function findPersonaPanel() {
        // 尝试多个选择器兼容不同版本
        return document.querySelector('#user_avatar_block')
            || document.querySelector('.persona_manager')
            || document.querySelector('#persona-management-block');
    }

    function findPersonaListContainer() {
        const panel = findPersonaPanel();
        if (!panel) return null;

        // 找到存放persona条目的容器
        // 通常是包含 .avatar-container 元素的直接父容器
        const avatarContainers = panel.querySelectorAll('.avatar-container');
        if (avatarContainers.length > 0) {
            return avatarContainers[0].parentElement;
        }
        return null;
    }

    function enhancePanel() {
        const panel = findPersonaPanel();
        if (!panel) return;

        const listContainer = findPersonaListContainer();
        if (!listContainer) return;

        // 防止重复增强
        if (panel.dataset.pgmEnhanced === 'true') {
            // 已增强，只需要刷新分组视图
            refreshPanelView();
            return;
        }

        panel.dataset.pgmEnhanced = 'true';

        // 注入控制栏（在列表容器之前）
        injectPanelControls(listContainer);

        // 初始渲染
        refreshPanelView();
    }

    function injectPanelControls(listContainer) {
        // 检查是否已存在
        if (document.getElementById('pgm-panel-controls')) return;

        const controlsDiv = document.createElement('div');
        controlsDiv.id = 'pgm-panel-controls';

        // 筛选按钮
        const filters = [
            { key: 'all', label: '全部' },
            { key: 'bound', label: '已绑定' },
            { key: 'unbound', label: '未绑定' },
        ];

        for (const f of filters) {
            const btn = document.createElement('button');
            btn.className = 'pgm-filter-btn' + (currentFilter === f.key ? ' active' : '');
            btn.textContent = f.label;
            btn.dataset.filter = f.key;
            btn.addEventListener('click', () => {
                currentFilter = f.key;
                document.querySelectorAll('#pgm-panel-controls .pgm-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                refreshPanelView();
            });
            controlsDiv.appendChild(btn);
        }

        // 新建分组按钮
        const addBtn = document.createElement('button');
        addBtn.id = 'pgm-add-group-btn';
        addBtn.textContent = '+ 新建分组';
        addBtn.addEventListener('click', () => {
            const name = prompt('输入分组名称：');
            if (name && name.trim()) {
                addGroup(name.trim());
                refreshAllViews();
            }
        });
        controlsDiv.appendChild(addBtn);

        listContainer.parentNode.insertBefore(controlsDiv, listContainer);
    }

    function refreshPanelView() {
        const listContainer = findPersonaListContainer();
        if (!listContainer) return;

        const personas = getAllPersonas();

        // 根据筛选过滤
        let filtered = personas;
        if (currentFilter === 'bound') {
            filtered = personas.filter(p => p.bound);
        } else if (currentFilter === 'unbound') {
            filtered = personas.filter(p => !p.bound);
        }

        const { groups, grouped, ungrouped } = getPersonasByGroup(filtered);

        // 获取原始的 avatar-container 元素映射
        const originalElements = {};
        listContainer.querySelectorAll('.avatar-container').forEach(el => {
            const key = getPersonaKeyFromElement(el);
            if (key) {
                originalElements[key] = el;
            }
        });

        // 隐藏所有原始元素（不删除，保持ST的事件绑定）
        listContainer.querySelectorAll('.avatar-container').forEach(el => {
            el.style.display = 'none';
        });

        // 移除之前的分组容器
        listContainer.querySelectorAll('.pgm-group-section, .pgm-ungrouped-separator, .pgm-ungrouped-wrapper').forEach(el => el.remove());

        // 渲染分组
        for (const group of groups) {
            const personasInGroup = grouped[group.id] || [];
            if (personasInGroup.length === 0) continue;

            const section = createGroupSection(group, personasInGroup, originalElements, 'panel');
            listContainer.insertBefore(section, listContainer.firstChild);
        }

        // 渲染未分组的人设（裸露排列）
        if (ungrouped.length > 0) {
            // 分隔线
            if (groups.some(g => (grouped[g.id] || []).length > 0)) {
                const separator = document.createElement('div');
                separator.className = 'pgm-ungrouped-separator';
                separator.textContent = '未分组';
                listContainer.appendChild(separator);
            }

            const wrapper = document.createElement('div');
            wrapper.className = 'pgm-ungrouped-wrapper';

            for (const p of ungrouped) {
                const el = originalElements[p.key];
                if (el) {
                    el.style.display = '';
                    wrapper.appendChild(el);
                    attachContextMenu(el, p.key);
                }
            }
            listContainer.appendChild(wrapper);
        }
    }

    function createGroupSection(group, personas, originalElements, mode) {
        const section = document.createElement('div');
        section.className = 'pgm-group-section';
        section.dataset.groupId = group.id;

        // 拖拽目标
        section.addEventListener('dragover', (e) => {
            e.preventDefault();
            section.classList.add('pgm-drag-over');
        });
        section.addEventListener('dragleave', () => {
            section.classList.remove('pgm-drag-over');
        });
        section.addEventListener('drop', (e) => {
            e.preventDefault();
            section.classList.remove('pgm-drag-over');
            const personaKey = e.dataTransfer.getData('text/persona-key');
            if (personaKey) {
                setPersonaGroup(personaKey, group.id);
                refreshAllViews();
            }
        });

        // Header
        const header = document.createElement('div');
        header.className = 'pgm-group-header';

        const arrow = document.createElement('span');
        arrow.className = 'pgm-group-arrow' + (group.collapsed ? ' collapsed' : '');
        arrow.textContent = '▼';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'pgm-group-name';
        nameSpan.textContent = group.name;

        const countSpan = document.createElement('span');
        countSpan.className = 'pgm-group-count';
        countSpan.textContent = `(${personas.length})`;

        const actions = document.createElement('div');
        actions.className = 'pgm-group-actions';

        if (mode === 'panel') {
            const renameBtn = document.createElement('button');
            renameBtn.textContent = '✏️';
            renameBtn.title = '重命名';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt('重命名分组：', group.name);
                if (newName && newName.trim()) {
                    roup(group.id, newName.trim());
                    refreshAllViews();
                }
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = '删除分组';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`确定删除分组「${group.name}」吗？\n（人设不会被删除，会回到未分组状态）`)) {
                    deleteGroup(group.id);
                    refreshAllViews();
                }
            });

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);
        }

        header.appendChild(arrow);
        header.appendChild(nameSpan);
        header.appendChild(countSpan);
        header.appendChild(actions);

        // 折叠控制
        const isCollapsed = mode === 'quick'
            ? (getSettings().quickCollapsed?.[group.id] || false)
            : group.collapsed;

        header.addEventListener('click', () => {
            toggleGroupCollapse(group.id, mode === 'quick' ? 'quick' : 'panel');
            const content = section.querySelector('.pgm-group-content');
            const arrowEl = section.querySelector('.pgm-group-arrow');
            if (content) content.classList.toggle('collapsed');
            if (arrowEl) arrowEl.classList.toggle('collapsed');
        });

        section.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'pgm-group-content' + (isCollapsed ? ' collapsed' : '');

        if (mode === 'panel') {
            // 列表模式：移动原始 ST 元素进来
            for (const p of personas) {
                const el = originalElements?.[p.key];
                if (el) {
                    el.style.display = '';
                    content.appendChild(el);
                    attachContextMenu(el, p.key);
                    makeDraggable(el, p.key);
                }
            }
        } else if (mode === 'quick') {
            // 网格模式
            const grid = document.createElement('div');
            grid.className = 'pgm-quick-grid';
            const currentKey = getCurrentPersonaKey();

            for (const p of personas) {
                const avatarDiv = createQuickAvatarItem(p, currentKey);
                grid.appendChild(avatarDiv);
            }
            content.appendChild(grid);
        }

        if (isCollapsed) {
            const arrowEl = header.querySelector('.pgm-group-arrow');
            if (arrowEl) arrowEl.classList.add('collapsed');
        }

        section.appendChild(content);
        return section;
    }

    function getPersonaKeyFromElement(el) {
        // 尝试多种方式获取 persona key
        // 方式1: imgfile 属性
        const imgFile = el.getAttribute('imgfile');
        if (imgFile) return imgFile;

        // 方式2: data 属性
        if (el.dataset.persona) return el.dataset.persona;

        // 方式3: 从 img src 中提取
        const img = el.querySelector('img');
        if (img) {
            const src = img.getAttribute('src') || '';
            // 路径格式：/User Avatars/xxx.png
            const match = src.match(/User\s*Avatars\/(.+?)(?:\?|$)/i);
            if (match) return decodeURIComponent(match[1]);
        }

        // 方式4: title 或 aria-label
        return el.getAttribute('title') || '';
    }

    function attachContextMenu(el, personaKey) {
        // 避免重复绑定
        if (el.dataset.pgmContextMenu) return;
        el.dataset.pgmContextMenu = 'true';

        el.addEventListener('contextmenu', (e) => {
            showContextMenu(e, personaKey);
        });
    }

    function makeDraggable(el, personaKey) {
        if (el.dataset.pgmDraggable) return;
        el.dataset.pgmDraggable = 'true';
        el.setAttribute('draggable', 'true');

        el.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/persona-key', personaKey);
            el.classList.add('pgm-dragging');
        });

        el.addEventListener('dragend', () => {
            el.classList.remove('pgm-dragging');
            document.querySelectorAll('.pgm-drag-over').forEach(x => x.classList.remove('pgm-drag-over'));
        });
    }

    // ========== 位置2：底部快捷弹窗 ==========

    function initQuickPopup() {
        // 在底部输入栏添加快捷按钮
        const sendForm = document.getElementById('send_form')
            || document.querySelector('#send_but_sheld')?.parentElement
            || document.querySelector('.send_form');

        if (!sendForm) {
            console.warn('[PGM] 未找到输入栏，延迟重试...');
            setTimeout(initQuickPopup, 2000);
            return;
        }

        // 检查是否已存在
        if (document.getElementById('pgm-quick-btn')) return;

        // 创建按钮
        const btn = document.createElement('div');
        btn.id = 'pgm-quick-btn';
        btn.title = '快速切换人设';

        const btnImg = document.createElement('img');
        btnImg.id = 'pgm-quick-btn-img';
        updateQuickBtnAvatar(btnImg);
        btn.appendChild(btnImg);

        // 插入到合适位置
        const leftButtons = sendForm.querySelector('#leftSendForm')
            || sendForm.querySelector('.drag-drop')
            || sendForm;

        if (leftButtons && leftButtons !== sendForm) {
            leftButtons.appendChild(btn);
        } else {
            sendForm.insertBefore(btn, sendForm.firstChild);
        }

        // 创建弹窗
        const overlay = document.createElement('div');
        overlay.id = 'pgm-quick-overlay';
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.id = 'pgm-quick-popup';
        document.body.appendChild(popup);

        // 事件
        btn.addEventListener('click', () => {
            toggleQuickPopup();
        });

        overlay.addEventListener('click', () => {
            closeQuickPopup();
        });

        // ESC 关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && popup.classList.contains('visible')) {
                closeQuickPopup();
            }
            });
    }

    function updateQuickBtnAvatar(imgEl) {
        if (!imgEl) imgEl = document.getElementById('pgm-quick-btn-img');
        if (!imgEl) return;

        const currentKey = getCurrentPersonaKey();
        if (currentKey) {
            imgEl.src = getPersonaAvatarUrl(currentKey);
            imgEl.onerror = () => {
                imgEl.src = '/img/ai4.png'; // 默认头像
            };
        } else {
            imgEl.src = '/img/ai4.png';
        }
    }

    function toggleQuickPopup() {
        const popup = document.getElementById('pgm-quick-popup');
        const overlay = document.getElementById('pgm-quick-overlay');
        if (!popup || !overlay) return;

        if (popup.classList.contains('visible')) {
            closeQuickPopup();
        } else {
            renderQuickPopup();
            popup.classList.add('visible');
            overlay.classList.add('visible');
        }
    }

    function closeQuickPopup() {
        const popup = document.getElementById('pgm-quick-popup');
        const overlay = document.getElementById('pgm-quick-overlay');
        if (popup) popup.classList.remove('visible');
        if (overlay) overlay.classList.remove('visible');
    }

    function renderQuickPopup() {
        const popup = document.getElementById('pgm-quick-popup');
        if (!popup) return;

        popup.innerHTML = '';

        // 搜索框
        const searchInput = document.createElement('input');
        searchInput.className = 'pgm-quick-search';
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 搜索人设...';
        searchInput.addEventListener('input', () => {
            renderQuickContent(popup, searchInput.value.toLowerCase());
        });
        popup.appendChild(searchInput);

        // 内容容器
        const contentDiv = document.createElement('div');
        contentDiv.id = 'pgm-quick-content';
        popup.appendChild(contentDiv);

        renderQuickContent(popup, '');
    }

    function renderQuickContent(popup, searchTerm) {
        let contentDiv = popup.querySelector('#pgm-quick-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '';

        let personas = getAllPersonas();

        // 搜索过滤
        if (searchTerm) {
            personas = personas.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                p.description.toLowerCase().includes(searchTerm)
            );
        }

        const { groups, grouped, ungrouped } = getPersonasByGroup(personas);
        const currentKey = getCurrentPersonaKey();

        // 渲染分组
        for (const group of groups) {
            const personasInGroup = grouped[group.id] || [];
            if (personasInGroup.length === 0) continue;

            const section = createGroupSection(group, personasInGroup, null, 'quick');
            contentDiv.appendChild(section);
        }

        // 渲染未分组
        if (ungrouped.length > 0) {
            if (groups.some(g => (grouped[g.id] || []).length > 0)) {
                const separator = document.createElement('div');
                separator.className = 'pgm-ungrouped-separator';
                separator.textContent = '未分组';
                contentDiv.appendChild(separator);
            }

            const grid = document.createElement('div');
            grid.className = 'pgm-quick-grid';

            for (const p of ungrouped) {
                const avatarDiv = createQuickAvatarItem(p, currentKey);
                grid.appendChild(avatarDiv);
            }
            contentDiv.appendChild(grid);
        }

        if (personas.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align:center;padding:20px;color:var(--SmartThemeQuoteColor,#888);font-size:13px;';
            empty.textContent = searchTerm ? '没有找到匹配的人设' : '暂无人设';
            contentDiv.appendChild(empty);
        }
    }

    function createQuickAvatarItem(persona, currentKey) {
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'pgm-quick-avatar' + (persona.key === currentKey ? ' active' : '');
        avatarDiv.title = persona.name + (persona.description ? '\n' + truncateText(persona.description, 80) : '');

        const img = document.createElement('img');
        img.src = getPersonaAvatarUrl(persona.key);
        img.loading = 'lazy';
        img.onerror = () => { img.src = '/img/ai4.png'; };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'pgm-quick-avatar-name';
        nameSpan.textContent = persona.name;

        avatarDiv.appendChild(img);
        avatarDiv.appendChild(nameSpan);

        avatarDiv.addEventListener('click', () => {
            switchPersona(persona.key);
            closeQuickPopup();
            // 延迟更新按钮头像
            setTimeout(() => updateQuickBtnAvatar(), 300);
        });

        // 右键菜单
        avatarDiv.addEventListener('contextmenu', (e) => {
            showContextMenu(e, persona.key);
        });

        return avatarDiv;
    }

    // ========== 刷新所有视图 ==========

    function refreshAllViews() {
        // 刷新位置1（面板）
        const panel = findPersonaPanel();
        if (panel) {
            panel.dataset.pgmEnhanced = 'false';
            enhancePanel();
        }

        // 刷新位置2（弹窗）
        const popup = document.getElementById('pgm-quick-popup');
        if (popup && popup.classList.contains('visible')) {
            const searchInput = popup.querySelector('.pgm-quick-search');
            renderQuickContent(popup, searchInput?.value?.toLowerCase() || '');
        }

        // 更新快捷按钮头像
        updateQuickBtnAvatar();
    }

    // ========== 初始化 ==========

    function init() {
        console.log('[PGM] Persona Group Manager 初始化...');

        // 确保设置存在
        getSettings();

        // 初始化两个位置的功能
        initPanelEnhancement();
        initQuickPopup();

        // 监听 persona 变更事件（兼容多版本）
        const eventSource = getContext().eventSource;
        if (eventSource) {
            const possibleEvents = [
                'persona_updated',
                'PERSONA_UPDATED',
                'settings_updated',
            ];
            for (const eventName of possibleEvents) {
                try {
                    eventSource.on(eventName, () => {
                        setTimeout(refreshAllViews, 200);
                    });
                } catch (e) {
                    // 忽略不存在的事件
                }
            }
        }

        // 也监听 ST 的自定义事件
        document.addEventListener('persona_switch_complete', () => {
            setTimeout(() => {
                updateQuickBtnAvatar();
                refreshAllViews();
            }, 300);
        });

        console.log('[PGM] Persona Group Manager 初始化完成！');
    }

    // 当 jQuery ready 或 DOMContentLoaded 时初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
    } else {
        setTimeout(init, 1500);
    }

    // 也监听 ST 的扩展加载事件
    if (typeof jQuery !== 'undefined') {
        jQuery(async () => {
            setTimeout(init, 2000);
        });
    }

})();
