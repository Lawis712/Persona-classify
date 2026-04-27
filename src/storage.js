import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';

const KEY = 'persona_groups';

const DEFAULT_DATA = {
    groups: [],          // [{ id, name, collapsed: false, personas: [avatarFile, ...] }]
    version: 1,
};

export function initStorage() {
    if (!extension_settings[KEY]) {
        extension_settings[KEY] = structuredClone(DEFAULT_DATA);
        saveSettingsDebounced();
    }
    // 兼容老数据
    if (!extension_settings[KEY].groups) {
        extension_settings[KEY].groups = [];
        saveSettingsDebounced();
    }
}

export function getGroups() {
    return extension_settings[KEY].groups;
}

export function saveGroups() {
    saveSettingsDebounced();
}

export function createGroup(name) {
    const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const groups = getGroups();
    groups.push({ id, name: name || '新分组', collapsed: false, personas: [] });
    saveGroups();
    return id;
}

export function renameGroup(id, newName) {
    const g = getGroups().find(x => x.id === id);
    if (g) {
        g.name = newName;
        saveGroups();
    }
}

export function deleteGroup(id) {
    const groups = getGroups();
    const idx = groups.findIndex(x => x.id === id);
    if (idx >= 0) {
        groups.splice(idx, 1);
        saveGroups();
    }
}

export function toggleCollapse(id) {
    const g = getGroups().find(x => x.id === id);
    if (g) {
        g.collapsed = !g.collapsed;
        saveGroups();
    }
}

// 移动 persona 到指定分组（targetGroupId 为 null 表示移出到未分组）
export function movePersonas(avatars, targetGroupId) {
    const groups = getGroups();
    // 先从所有分组移除
    for (const g of groups) {
        g.personas = g.personas.filter(a => !avatars.includes(a));
    }
    // 加入目标分组
    if (targetGroupId) {
        const target = groups.find(x => x.id === targetGroupId);
        if (target) {
            for (const a of avatars) {
                if (!target.personas.includes(a)) target.personas.push(a);
            }
        }
    }
    saveGroups();
}

// 获取一个 persona 所属分组（找不到返回 null）
export function getPersonaGroup(avatar) {
    return getGroups().find(g => g.personas.includes(avatar)) || null;
}

// 获取未分组的 persona 列表
export function getUngroupedAvatars(allAvatars) {
    const grouped = new Set();
    for (const g of getGroups()) {
        g.personas.forEach(a => grouped.add(a));
    }
    return allAvatars.filter(a => !grouped.has(a));
}
