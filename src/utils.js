import { power_user } from '../../../../power-user.js';

// 获取所有 persona 的 avatar 文件名列表
export function getAllPersonaAvatars() {
    return Object.keys(power_user.personas || {});
}

// 获取 persona 的显示名
export function getPersonaName(avatar) {
    return power_user.personas?.[avatar] || avatar;
}

// 是否已绑定到角色
export function isPersonaBoundToCharacter(avatar) {
    const desc = power_user.persona_descriptions?.[avatar];
    if (!desc) return false;
    // ST 中 position === 'character' 或 lockedPersonas 中存在
    if (desc.position === 'character') return true;
    // 检查是否被某角色锁定
    const locked = power_user.personas_lock || power_user.lockedPersonas || {};
    if (typeof locked === 'object') {
        for (const key in locked) {
            if (locked[key] === avatar) return true;
        }
    }
    return false;
}

// 获取头像 URL
export function getAvatarUrl(avatar) {
    return `/User Avatars/${avatar}`;
}

// 是否当前激活的 persona
export function isCurrentPersona(avatar) {
    return power_user.default_persona === avatar || 
           document.querySelector(`#user_avatar_block .avatar-container[imgfile="${avatar}"].selected`) !== null;
}
