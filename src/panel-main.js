import { getGroups, getUngroupedAvatars, toggleCollapse } from './storage.js';
import { getAllPersonaAvatars, getPersonaName, getAvatarUrl, isCurrentPersona } from './utils.js';

const BTN_ID = 'pg-quick-btn';
const POPUP_ID = 'pg-quick-popup';

export function initQuickPanel() {
    const tryInject = () => {
        // 魔法棒按钮 #send_form > #extensionsMenuButton 或 #leftSendForm 区域
        const wand = document.getElementById('extensionsMenuButton') 
                  || document.querySelector('#leftSendForm #extensionsMenuButton')
                  || document.querySelector('.fa-wand-magic-sparkles')?.closest('div');
        if (!wand) {
            setTimeout(tryInject, 500);
            return;
        }
        if (document.getElementById(BTN_ID)) return;

        const btn = document.createElement('div');
        btn.id = BTN_ID;
        btn.className = 'fa-solid fa-user-group interactable';
        btn.title = '人设分组（快捷切换）';
        btn.tabIndex = 0;

        wand.parentElement.insertBefore(btn, wand.nextSibling);

        btn.addEventListener('click', toggleQuickPopup);
    };
    tryInject();
}

export function refreshQuickPanel() {
    const popup = document.getElementById(POPUP_ID);
    if (popup && popup.style.display !== 'none') {
        renderQuickPopup();
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
