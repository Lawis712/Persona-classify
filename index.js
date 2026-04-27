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
    console.log('[' + EXT_NAME + '] Loading...');

    initStorage();

    try {
        initMainPanel();
        console.log('[' + EXT_NAME + '] Main panel initialized.');
    } catch (err) {
        console.error('[' + EXT_NAME + '] Main panel init failed:', err);
    }

    if (isQuickPersonaEnabled()) {
        if (typeof toastr !== 'undefined') {
            toastr.warning('Persona Groups detected Quick Persona is enabled. Quick popup disabled.', EXT_NAME);
        }
    } else {
        try {
            initQuickPanel();
            console.log('[' + EXT_NAME + '] Quick panel initialized.');
        } catch (err) {
            console.error('[' + EXT_NAME + '] Quick panel init failed:', err);
        }
    }

    const refreshAll = function () {
        try { refreshMainPanel(); } catch (e) {}
        try { refreshQuickPanel(); } catch (e) {}
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

    console.log('[' + EXT_NAME + '] Loaded successfully.');
});
