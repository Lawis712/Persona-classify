import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types } from '../../../../script.js';

import { initStorage } from './src/storage.js';
import { initMainPanel, refreshMainPanel } from './src/panel-main.js';
import { initQuickPanel, refreshQuickPanel } from './src/panel-quick.js';

const EXT_NAME = 'Persona Groups';

function isQuickPersonaEnabled() {
    try {
        const qp = extension_settings.quickPersona;
        return qp && qp.enabled === true;
    } catch (e) {
        return false;
    }
}

jQuery(async () => {
    console.log(`[${EXT_NAME}] Loading...`);

    initStorage();

    try {
        initMainPanel();
        console.log(`[${EXT_NAME}] Main panel initialized.`);
    } catch (err) {
        console.error(`[${EXT_NAME}] Main panel init failed:`, err);
    }

    if (isQuickPersonaEnabled()) {
        if (typeof toastr !== 'undefined') {
            toastr.warning(
                'Persona Groups 检测到 Quick Persona 已启用，快捷弹窗已禁用。',
                'Persona Groups'
            );
        }
    } else {
        try {
            initQuickPanel();
            console.log(`[${EXT_NAME}] Quick panel initialized.`);
        } catch (err) {
            console.error(`[${EXT_NAME}] Quick panel init failed:`, err);
        }
    }

    const refreshAll = () => {
        try { refreshMainPanel(); } catch(e) {}
        try { refreshQuickPanel(); } catch(e) {}
    };

    if (eventSource && event_types) {
        if (event_types.SETTINGS_UPDATED) {
            eventSource.on(event_types.SETTINGS_UPDATED, refreshAll);
        }
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, refreshAll);
        }
    }

    const observerTarget = document.getElementById('user_avatar_block');
    if (observerTarget) {
        const observer = new MutationObserver(refreshAll);
        observer.observe(observerTarget, { childList: true, subtree: false });
    }

    console.log(`[${EXT_NAME}] Loaded successfully.`);
});
    if (isQuickPersonaEnabled()) {
        toastr.warning(
            'Persona Groups 检测到 Quick Persona 已启用，快捷弹窗已禁用。请二选一。',
            'Persona Groups'
        );
    } else {
        try {
            initQuickPanel();
        } catch (err) {
            console.error(`[${EXT_NAME}] Quick panel init failed:`, err);
        }
    }

    // 4. 监听 persona 变化，刷新两个面板
    const refreshAll = () => {
        refreshMainPanel();
        refreshQuickPanel();
    };

    eventSource.on(event_types.SETTINGS_UPDATED, refreshAll);
    // ST 在切换/编辑 persona 后没有专门事件，监听通用事件
    eventSource.on(event_types.CHAT_CHANGED, refreshAll);

    // 监听原生头像列表的 DOM 变化（新增/删除 persona 时）
    const observerTarget = document.getElementById('user_avatar_block');
    if (observerTarget) {
        const observer = new MutationObserver(() => {
            refreshAll();
        });
        observer.observe(observerTarget, { childList: true });
    }

    console.log(`[${EXT_NAME}] Loaded.`);
});
    const EXTENSION_NAME = 'persona-group-manager';
    const SETTINGS_KEY = 'personaGroupManager';
    const LOG_PREFIX = '[PGM]';
    let initialized = false;

    // ============================
    //  日志
    // ============================
    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }
    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }
    function error(...args) {
        console.error(LOG_PREFIX, ...args);
    }

    // ============================
    //  ST API 兼容层
    // ============================

    function getContext() {
        try {
            if (window.SillyTavern?.getContext) return window.SillyTavern.getContext();
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) return SillyTavern.getContext();
        } catch (e) { }
        return null;
    }

    function getPowerUser() {
        try {
            if (typeof power_user !== 'undefined') return power_user;
        } catch (e) { }
        return null;
    }

    function getDefaultSettings() {
        return {
            groups: [],
            personaGroupMap: {},
            quickCollapsed: {},
            panelCollapsed: {},
            version: 2,
        };
    }

    function getSettings() {
        const ctx = getContext();
        if (!ctx) return getDefaultSettings();
        if (!ctx.extensionSettings[SETTINGS_KEY]) {
            ctx.extensionSettings[SETTINGS_KEY] = getDefaultSettings();
        }
        const s = ctx.extensionSettings[SETTINGS_KEY];
        // 确保字段完整
        if (!s.groups) s.groups = [];
        if (!s.personaGroupMap) s.personaGroupMap = {};
        if (!s.quickCollapsed) s.quickCollapsed = {};
        if (!s.panelCollapsed) s.panelCollapsed = {};
        return s;
    }

    function saveSettings() {
        try {
            const ctx = getContext();
            if (ctx?.saveSettingsDebounced) {
                ctx.saveSettingsDebounced();
            }
        } catch (e) {
            error('saveSettings failed:', e);
        }
    }

    function generateId() {
        return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    // ============================
    //  Persona 数据读取
    // ============================

    function getAllPersonas() {
        const pu = getPowerUser();
        if (!pu?.personas) return [];

        const result = [];
        for (const [key, name] of Object.entries(pu.personas)) {
            const descObj = pu.persona_descriptions?.[key];
            const description = (typeof descObj === 'object' ? descObj?.description : descObj) || '';
            result.push({
                key,
                name: name || key,
                description,
                bound: checkBound(key),
                avatarUrl: `/User Avatars/${encodeURIComponent(key)}`,
            });
        }
        return result;
    }

    function checkBound(personaKey) {
        try {
            const pu = getPowerUser();
            // ST 中绑定关系在 power_user.persona_bind: { charAvatarKey: personaAvatarKey }
            if (pu?.persona_bind && typeof pu.persona_bind === 'object') {
                return Object.values(pu.persona_bind).includes(personaKey);
            }
        } catch (e) { }
        return false;
    }

    function getCurrentPersonaKey() {
        try {
            return getPowerUser()?.user_avatar || '';
        } catch (e) {
            return '';
        }
    }

    /**
     * 切换人设 - 使用 ST 最可靠的方式
     */
    async function switchPersona(personaKey) {
        try {
            // 方式1: 直接模拟点击原生列表中对应的元素（最可靠，保持ST所有逻辑）
            const panel = findPersonaPanel();
            if (panel) {
                const allAvatars = panel.querySelectorAll('.avatar-container');
                for (const el of allAvatars) {
                    const elKey = getKeyFromAvatarEl(el);
                    if (elKey === personaKey) {
                        el.click();
                        log('通过面板点击切换:', personaKey);
                        return;
                    }
                }
            }

            // 方式2: 调用 ST 全局函数
            if (typeof window.setUserAvatar === 'function') {
                await window.setUserAvatar(personaKey);
                log('通过 setUserAvatar 切换:', personaKey);
                return;
            }

            // 方式3: Slash command
            const ctx = getContext();
            if (ctx?.executeSlashCommandsWithOptions) {
                await ctx.executeSlashCommandsWithOptions(`/persona ${personaKey}`);
                log('通过 slash command 切换:', personaKey);
                return;
            }

            warn('无法切换人设，未找到可用的切换方式');
        } catch (e) {
            error('switchPersona error:', e);
        }
    }

    // ============================
    //  DOM 查找工具
    // ============================

    function findPersonaPanel() {
        // 尝试多个选择器，兼容不同版本
        const selectors = [
            '#user_avatar_block',
            '.persona_manager',
            '#persona-management-block',
            '#persona_manager',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    /**
     * 获取 persona 面板中存放 avatar-container 的列表容器
     */
    function findAvatarListContainer() {
        const panel = findPersonaPanel();
        if (!panel) return null;

        // 查找包含 avatar-container 的容器
        const firstAvatar = panel.querySelector('.avatar-container');
        if (firstAvatar) {
            return firstAvatar.parentElement;
        }
        return null;
    }

    /**
     * 从 ST 原生的 .avatar-container 元素中提取 persona key
     */
    function getKeyFromAvatarEl(el) {
        if (!el) return '';

        // 方式1: imgfile 属性（最常见）
        const imgfile = el.getAttribute('imgfile');
        if (imgfile) return imgfile;

        // 方式2: data-persona
        if (el.dataset?.persona) return el.dataset.persona;

        // 方式3: 从 img src 提取
        const img = el.querySelector('img');
        if (img) {
            const src = decodeURIComponent(img.getAttribute('src') || '');
            const match = src.match(/User\s*Avatars[/\\](.+?)(?:\?|$)/i);
            if (match) return match[1];
        }

        return '';
    }

    // ============================
    //  分组数据操作
    // ============================

    function getGroups() {
        return [...getSettings().groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }

    function addGroup(name) {
        const s = getSettings();
        const group = {
            id: generateId(),
            name,
            order: s.groups.length,
        };
        s.groups.push(group);
        saveSettings();
        log('新建分组:', name);
        return group;
    }

    function renameGroup(id, newName) {
        const g = getSettings().groups.find(x => x.id === id);
        if (g) {
            g.name = newName;
            saveSettings();
        }
    }

    function deleteGroup(id) {
        const s = getSettings();
        s.groups = s.groups.filter(x => x.id !== id);
        for (const [k, v] of Object.entries(s.personaGroupMap)) {
            if (v === id) delete s.personaGroupMap[k];
        }
        delete s.panelCollapsed[id];
        delete s.quickCollapsed[id];
        saveSettings();
        log('删除分组:', id);
    }

    function setPersonaGroup(personaKey, groupId) {
        const s = getSettings();
        if (groupId) {
            s.personaGroupMap[personaKey] = groupId;
        } else {
            delete s.personaGroupMap[personaKey];
        }
        saveSettings();
    }

    function isGroupCollapsed(groupId, target) {
        const s = getSettings();
        const map = target === 'quick' ? s.quickCollapsed : s.panelCollapsed;
        return !!map[groupId];
    }

    function toggleCollapse(groupId, target) {
        const s = getSettings();
        const map = target === 'quick' ? s.quickCollapsed : s.panelCollapsed;
        map[groupId] = !map[groupId];
        saveSettings();
    }

    /**
     * 清理已不存在的 persona 的映射数据
     */
    function cleanupStaleData() {
        const pu = getPowerUser();
        if (!pu?.personas) return;

        const s = getSettings();
        let changed = false;
        for (const key of Object.keys(s.personaGroupMap)) {
            if (!(key in pu.personas)) {
                delete s.personaGroupMap[key];
                changed = true;
            }
        }
        if (changed) saveSettings();
    }

    /**
     * 按分组整理 personas
     */
    function organizeByGroup(personas) {
        const s = getSettings();
        const groups = getGroups();
        const grouped = {};
        const ungrouped = [];

        for (const g of groups) grouped[g.id] = [];

        for (const p of personas) {
            const gid = s.personaGroupMap[p.key];
            if (gid && grouped[gid]) {
                grouped[gid].push(p);
            } else {
                ungrouped.push(p);
            }
        }
        return { groups, grouped, ungrouped };
    }

    // ============================
    //  右键菜单
    // ============================

    function removeContextMenu() {
        document.querySelectorAll('.pgm-context-menu').forEach(el => el.remove());
    }

    function showContextMenu(e, personaKey) {
        e.preventDefault();
        e.stopPropagation();
        removeContextMenu();

        const s = getSettings();
        const groups = getGroups();
        const currentGid = s.personaGroupMap[personaKey] || null;

        const menu = document.createElement('div');
        menu.className = 'pgm-context-menu';

        // 标题
        const title = document.createElement('div');
        title.className = 'pgm-context-menu-title';
        title.textContent = '移动到分组';
        menu.appendChild(title);

        const div1 = document.createElement('div');
        div1.className = 'pgm-context-menu-divider';
        menu.appendChild(div1);

        // 分组选项
        for (const g of groups) {
            const item = document.createElement('div');
            item.className = 'pgm-context-menu-item';
            item.textContent = (currentGid === g.id ? '✓ ' : '　') + g.name;
            item.addEventListener('click', () => {
                if (currentGid !== g.id) {
                    setPersonaGroup(personaKey, g.id);
                    refreshAll();
                }
                removeContextMenu();
            });
            menu.appendChild(item);
        }

        // 移出分组
        if (currentGid) {
            const div2 = document.createElement('div');
            div2.className = 'pgm-context-menu-divider';
            menu.appendChild(div2);

            const removeItem = document.createElement('div');
            removeItem.className = 'pgm-context-menu-item';
            removeItem.textContent = '✕ 移出分组';
            removeItem.addEventListener('click', () => {
                setPersonaGroup(personaKey, null);
                refreshAll();
                removeContextMenu();
            });
            menu.appendChild(removeItem);
        }

        // 新建分组
        const div3 = document.createElement('div');
        div3.className = 'pgm-context-menu-divider';
        menu.appendChild(div3);

        const newItem = document.createElement('div');
        newItem.className = 'pgm-context-menu-item';
        newItem.textContent = '+ 新建分组并移入';
        newItem.addEventListener('click', () => {
            removeContextMenu();
            promptGroupName('新建分组', '', (name) => {
                if (name) {
                    const g = addGroup(name);
                    setPersonaGroup(personaKey, g.id);
                    refreshAll();
                }
            });
        });
        menu.appendChild(newItem);

        // 定位
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        document.body.appendChild(menu);

        // 修正溢出
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';
            }
        });

        // 点击关闭
        setTimeout(() => {
            const handler = (ev) => {
                if (!menu.contains(ev.target)) {
                    removeContextMenu();
                    document.removeEventListener('mousedown', handler, true);
                }
            };
            document.addEventListener('mousedown', handler, true);
        }, 0);
    }

    /**
     * 弹出输入框 - 优先用 ST 的 callGenericPopup，降级用 prompt
     */
    function promptGroupName(title, defaultVal, callback) {
        // 尝试 ST 的弹窗
        try {
            if (typeof callGenericPopup === 'function') {
                // ST 有一个通用弹窗，但签名不同版本不同，降级处理
            }
        } catch (e) { }

        // 降级用原生 prompt
        const result = prompt(title + '：', defaultVal || '');
        if (result !== null && result.trim()) {
            callback(result.trim());
        }
    }

    function confirmAction(msg, callback) {
        if (confirm(msg)) {
            callback();
        }
    }

    // ============================
    //  位置1: 面板增强
    // ============================

    let panelCheckInterval = null;
    let lastAvatarContainerCount = -1;

    function startPanelWatcher() {
        if (panelCheckInterval) return;

        panelCheckInterval = setInterval(() => {
            const container = findAvatarListContainer();
            if (!container) {
                lastAvatarContainerCount = -1;
                return;
            }

            // 检测面板是否可见
            const panel = findPersonaPanel();
            if (!panel || panel.offsetParent === null) {
                // 面板隐藏了，清理标记
                if (panel) panel.removeAttribute('data-pgm-enhanced');
                lastAvatarContainerCount = -1;
                return;
            }

            // 检测 avatar 数量变化（说明 ST 重新渲染了列表）
            const currentCount = container.querySelectorAll('.avatar-container').length;
            const isEnhanced = panel.getAttribute('data-pgm-enhanced') === '1';

            if (!isEnhanced || currentCount !== lastAvatarContainerCount) {
                lastAvatarContainerCount = currentCount;
                if (currentCount > 0) {
                    enhancePanel();
                }
            }
        }, 800);
    }

    function enhancePanel() {
        const panel = findPersonaPanel();
        const container = findAvatarListContainer();
        if (!panel || !container) return;

        panel.setAttribute('data-pgm-enhanced', '1');

        // 注入控制栏（只注入一次）
        if (!document.getElementById('pgm-panel-controls')) {
            const controls = buildPanelControls();
            container.parentNode.insertBefore(controls, container);
        }

        refreshPanelView();
    }

    let currentFilter = 'all';

    function buildPanelControls() {
        const div = document.createElement('div');
        div.id = 'pgm-panel-controls';

        const filters = [
            { key: 'all', label: '全部' },
            { key: 'bound', label: '已绑定' },
            { key: 'unbound', label: '未绑定' },
        ];

        for (const f of filters) {
            const btn = document.createElement('button');
            btn.className = 'pgm-filter-btn' + (currentFilter === f.key ? ' active' : '');
            btn.textContent = f.label;
            btn.addEventListener('click', () => {
                currentFilter = f.key;
                div.querySelectorAll('.pgm-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                refreshPanelView();
            });
            div.appendChild(btn);
        }

        const addBtn = document.createElement('button');
        addBtn.id = 'pgm-add-group-btn';
        addBtn.textContent = '+ 新建分组';
        addBtn.addEventListener('click', () => {
            promptGroupName('新建分组', '', (name) => {
                addGroup(name);
                refreshAll();
            });
        });
        div.appendChild(addBtn);

        return div;
    }

    function refreshPanelView() {
        const container = findAvatarListContainer();
        if (!container) return;

        let personas = getAllPersonas();

        // 筛选
        if (currentFilter === 'bound') {
            personas = personas.filter(p => p.bound);
        } else if (currentFilter === 'unbound') {
            personas = personas.filter(p => !p.bound);
        }

        const { groups, grouped, ungrouped } = organizeByGroup(personas);

        // 建立原生元素映射: key -> element
        const nativeEls = {};
        container.querySelectorAll('.avatar-container').forEach(el => {
            const key = getKeyFromAvatarEl(el);
            if (key) nativeEls[key] = el;
        });

        // 先把所有原生元素恢复显示 & 移除旧的分组DOM
        container.querySelectorAll('.avatar-container').forEach(el => {
            el.classList.remove('pgm-hidden-by-group');
            el.removeAttribute('draggable');
        });
        container.querySelectorAll('.pgm-group-section, .pgm-ungrouped-separator').forEach(el => el.remove());

        // === 渲染分组 ===
        // 我们把分组DOM插入到container的最前面
        // 分组内的原生元素隐藏，由分组容器"收纳"（不移动原生元素，而是在分组中放原生元素的引用）
        // 关键策略：把原生avatar-container直接移入分组content（移动DOM节点不会丢失addEventListener绑定的事件）

        const fragment = document.createDocumentFragment();
        let hasAnyGroup = false;

        for (const group of groups) {
            const personasInGroup = grouped[group.id] || [];
            if (personasInGroup.length === 0 && currentFilter === 'all') {
                // 空分组也显示（仅在全部模式下）
            } else if (personasInGroup.length === 0) {
                continue;
            }

            hasAnyGroup = true;
            const section = document.createElement('div');
            section.className = 'pgm-group-section';
            section.dataset.groupId = group.id;

            // 拖拽进分组
            section.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                section.classList.add('pgm-drag-over');
            });
            section.addEventListener('dragleave', (e) => {
                if (!section.contains(e.relatedTarget)) {
                    section.classList.remove('pgm-drag-over');
                }
            });
            section.addEventListener('drop', (e) => {
                e.preventDefault();
                section.classList.remove('pgm-drag-over');
                const dragKey = e.dataTransfer.getData('text/pgm-persona-key');
                if (dragKey) {
                    setPersonaGroup(dragKey, group.id);
                    refreshAll();
                }
            });

            // Header
            const header = document.createElement('div');
            header.className = 'pgm-group-header';

            const collapsed = isGroupCollapsed(group.id, 'panel');

            const arrow = document.createElement('span');
            arrow.className = 'pgm-group-arrow' + (collapsed ? ' collapsed' : '');
            arrow.textContent = '▼';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'pgm-group-name';
            nameSpan.textContent = group.name;

            const countSpan = document.createElement('span');
            countSpan.className = 'pgm-group-count';
            countSpan.textContent = `(${personasInGroup.length})`;

            const actions = document.createElement('div');
            actions.className = 'pgm-group-actions';

            const renameBtn = document.createElement('button');
            renameBtn.textContent = '✏️';
            renameBtn.title = '重命名分组';
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                promptGroupName('重命名分组', group.name, (name) => {
                    renameGroup(group.id, name);
                    refreshAll();
                });
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = '删除分组（人设不会被删除）';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmAction(`确定删除分组「${group.name}」？\n人设不会被删除，会回到未分组状态。`, () => {
                    deleteGroup(group.id);
                    refreshAll();
                });
            });

            actions.appendChild(renameBtn);
            actions.appendChild(deleteBtn);

            header.appendChild(arrow);
            header.appendChild(nameSpan);
            header.appendChild(countSpan);
            header.appendChild(actions);

            header.addEventListener('click', () => {
                toggleCollapse(group.id, 'panel');
                const content = section.querySelector('.pgm-group-content');
                const arrowEl = section.querySelector('.pgm-group-arrow');
                content?.classList.toggle('collapsed');
                arrowEl?.classList.toggle('collapsed');
            });

            section.appendChild(header);

            // Content - 把原生元素移入
            const content = document.createElement('div');
            content.className = 'pgm-group-content' + (collapsed ? ' collapsed' : '');

            for (const p of personasInGroup) {
                const el = nativeEls[p.key];
                if (el) {
                    // 使拖拽可用
                    el.setAttribute('draggable', 'true');
                    el.addEventListener('dragstart', makeDragStartHandler(p.key));
                    el.addEventListener('dragend', dragEndHandler);
                    // 右键菜单
                    attachRightClick(el, p.key);
                    content.appendChild(el);
                }
            }

            section.appendChild(content);
            fragment.appendChild(section);
        }

        // 未分组分隔线
        if (hasAnyGroup && ungrouped.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'pgm-ungrouped-separator';
            sep.textContent = '未分组';
            fragment.appendChild(sep);
        }

        // 把分组DOM插到container最前面
        container.insertBefore(fragment, container.firstChild);

        // 未分组的元素：保持在container中原位，添加右键菜单和拖拽
        for (const p of ungrouped) {
            const el = nativeEls[p.key];
            if (el) {
                el.setAttribute('draggable', 'true');
                el.addEventListener('dragstart', makeDragStartHandler(p.key));
                el.addEventListener('dragend', dragEndHandler);
                attachRightClick(el, p.key);
                // 确保在分组之后显示
                container.appendChild(el);
            }
        }

        lastAvatarContainerCount = container.querySelectorAll('.avatar-container').length;
    }

    // 拖拽处理
    function makeDragStartHandler(key) {
        return function handler(e) {
            e.dataTransfer.setData('text/pgm-persona-key', key);
            e.dataTransfer.effectAllowed = 'move';
            e.currentTarget.classList.add('pgm-dragging');
        };
    }

    function dragEndHandler(e) {
        e.current
