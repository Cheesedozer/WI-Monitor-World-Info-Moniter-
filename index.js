// ============================================================
// WI Monitor — SillyTavern Extension
// Shows which World Info entries were activated during generation
// ============================================================

const MODULE_NAME = 'wi_monitor';

// ── Default Settings ──────────────────────────────────────────
const defaultSettings = Object.freeze({
    enabled: true,
    collapseByDefault: false,
    showConstantEntries: true,
    maxContentPreview: 0, // 0 = no preview, >0 = character count
});

// ── State ─────────────────────────────────────────────────────
let lastActivatedEntries = [];
let lastUpdateTime = null;

// ── Settings Helpers ──────────────────────────────────────────
function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();

    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    return extensionSettings[MODULE_NAME];
}

// ── Core: Handle WORLD_INFO_ACTIVATED ─────────────────────────
function onWorldInfoActivated(activatedEntries) {
    const settings = getSettings();
    if (!settings.enabled) return;

    if (Array.isArray(activatedEntries)) {
        lastActivatedEntries = activatedEntries;
    } else {
        console.warn(`[${MODULE_NAME}] Unexpected WORLD_INFO_ACTIVATED payload:`, activatedEntries);
        lastActivatedEntries = [];
    }

    lastUpdateTime = new Date();
    updateUI();
}

// ── UI Rendering ──────────────────────────────────────────────
function updateUI() {
    const settings = getSettings();
    const container = document.getElementById('wi_monitor_entries');
    const badge = document.getElementById('wi_monitor_badge');
    const timestamp = document.getElementById('wi_monitor_timestamp');

    if (!container) return;

    // Filter entries
    let entries = [...lastActivatedEntries];
    if (!settings.showConstantEntries) {
        entries = entries.filter(e => !e.constant);
    }

    // Update badge count
    if (badge) {
        badge.textContent = entries.length.toString();
        badge.style.display = entries.length > 0 ? 'inline-block' : 'none';
    }

    // Update timestamp
    if (timestamp) {
        timestamp.textContent = lastUpdateTime
            ? `Last updated: ${lastUpdateTime.toLocaleTimeString()}`
            : 'No data yet \u2014 send a message to populate';
    }

    // Clear and rebuild entries list
    container.innerHTML = '';

    if (entries.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.classList.add('wi_monitor_empty');
        emptyMsg.textContent = lastUpdateTime
            ? 'No World Info entries were activated.'
            : 'Waiting for first generation...';
        container.appendChild(emptyMsg);
        return;
    }

    // Group entries by source book
    const grouped = {};
    for (const entry of entries) {
        const bookName = entry.world || 'Unknown Book';
        if (!grouped[bookName]) {
            grouped[bookName] = [];
        }
        grouped[bookName].push(entry);
    }

    // Render grouped entries
    for (const [bookName, bookEntries] of Object.entries(grouped)) {
        // Book header
        const bookHeader = document.createElement('div');
        bookHeader.classList.add('wi_monitor_book_header');
        bookHeader.innerHTML = `<span class="fa-solid fa-book"></span> ${escapeHtml(bookName)} <span class="wi_monitor_book_count">(${bookEntries.length})</span>`;
        container.appendChild(bookHeader);

        // Entry rows
        for (const entry of bookEntries) {
            const row = document.createElement('div');
            row.classList.add('wi_monitor_entry');
            if (entry.constant) {
                row.classList.add('wi_monitor_constant');
            }

            // Entry name
            const entryName = entry.comment || `Entry #${entry.uid}`;

            // Trigger keywords
            const triggerKeys = Array.isArray(entry.key)
                ? entry.key.filter(k => k && k.trim()).join(', ')
                : (typeof entry.key === 'string' ? entry.key : '');

            // Build row HTML
            row.innerHTML = `
                <div class="wi_monitor_entry_name" title="${escapeHtml(entryName)}">
                    ${entry.constant ? '<span class="fa-solid fa-thumbtack" title="Constant (always active)"></span> ' : ''}
                    ${escapeHtml(entryName)}
                </div>
                <div class="wi_monitor_entry_keys" title="Trigger keys: ${escapeHtml(triggerKeys)}">
                    ${entry.constant ? '<em>constant</em>' : escapeHtml(triggerKeys || '(no keys)')}
                </div>
            `;

            container.appendChild(row);
        }
    }
}

// ── Utility: HTML Escape ──────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Manual Refresh Handler ────────────────────────────────────
function onManualRefresh() {
    if (lastActivatedEntries.length === 0) {
        toastr.info('No activation data yet. Send a message first.', 'WI Monitor');
        return;
    }
    updateUI();
    toastr.success(`Showing ${lastActivatedEntries.length} entries from last generation.`, 'WI Monitor');
}

// ── Chat Changed Handler ──────────────────────────────────────
function onChatChanged() {
    lastActivatedEntries = [];
    lastUpdateTime = null;
    updateUI();
}

// ── Settings UI Sync ──────────────────────────────────────────
function syncSettingsUI() {
    const settings = getSettings();
    $('#wi_monitor_enabled').prop('checked', settings.enabled);
    $('#wi_monitor_show_constant').prop('checked', settings.showConstantEntries);
}

// ── Initialization ────────────────────────────────────────────
(async function init() {
    const context = SillyTavern.getContext();
    const { eventSource, event_types, saveSettingsDebounced } = context;

    // Load settings HTML
    try {
        const settingsHtml = await $.get(
            `/scripts/extensions/third-party/SillyTavern-WIMonitor/settings.html`,
        );
        $('#extensions_settings2').append(settingsHtml);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to load settings HTML:`, error);
        return;
    }

    // Initialize settings and update UI
    getSettings();
    syncSettingsUI();

    // ── Bind UI Events ────────────────────────────────────
    $('#wi_monitor_enabled').on('change', function () {
        const settings = getSettings();
        settings.enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#wi_monitor_show_constant').on('change', function () {
        const settings = getSettings();
        settings.showConstantEntries = $(this).prop('checked');
        saveSettingsDebounced();
        updateUI();
    });

    $('#wi_monitor_refresh_btn').on('click', onManualRefresh);

    // ── Subscribe to Events ───────────────────────────────
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, onWorldInfoActivated);
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    // Initial UI render (empty state)
    updateUI();

    console.log(`[${MODULE_NAME}] Extension loaded successfully`);
})();
