/* ============================================================
   Community Drives & Events — interactions
   Self-contained module: filtering, registration, the
   "propose an event" flow, and a mock admin approval queue.
   ============================================================ */

// ---- Role gating ---------------------------------------------------
// TEMPORARY FLAG — until real authentication/user roles exist.
// Set this to true ONLY for accounts that should see the admin
// approval queue and the "Admin View" toggle. Wire this up to your
// actual login/role data once auth is built (e.g.
// const CURRENT_USER_IS_ADMIN = loggedInUser.role === 'admin';)
const CURRENT_USER_IS_ADMIN = false;

document.addEventListener('DOMContentLoaded', () => {
    if (!CURRENT_USER_IS_ADMIN) {
        // Hide the "Admin View" toggle entirely for normal users —
        // it should never even be discoverable in the markup.
        const toggle = document.querySelector('.admin-toggle');
        if (toggle) toggle.remove();

        // Make sure the approval queue card can never be shown.
        const queue = document.getElementById('admin-queue-card');
        if (queue) queue.remove();
    }
});

// ---- Filtering -------------------------------------------------
function filterEvents(type, btn) {
    // Update active filter button
    document.querySelectorAll('#event-filters .toggle-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    document.querySelectorAll('#events-grid .event-card[data-type]').forEach(card => {
        if (type === 'all' || card.dataset.type === type) {
            card.classList.remove('hidden-by-filter');
        } else {
            card.classList.add('hidden-by-filter');
        }
    });
}


// ---- Registration -----------------------------------------------
// registerEvent(eventId, btn) is now defined in app.js (Supabase-backed).

// ---- Propose Event modal ----------------------------------------
function openEventModal() {
    document.getElementById('event-modal').classList.add('active');
}
function closeEventModal() {
    document.getElementById('event-modal').classList.remove('active');
}

// Close modal on overlay click (outside the card)
document.addEventListener('click', function (e) {
    const modal = document.getElementById('event-modal');
    if (modal && e.target === modal) {
        closeEventModal();
    }
});

// EVENT_TYPE_META is defined in app.js (shared with renderEvents).

let pendingEventCounter = 3; // pending-evt-1 and pending-evt-2 already exist in markup

// Submit a new event proposal -> goes into the pending approval queue
function submitEventProposal(e) {
    e.preventDefault();

    const title = document.getElementById('event-title').value.trim();
    const type = document.getElementById('event-type').value;
    const date = document.getElementById('event-date').value.trim();
    const location = document.getElementById('event-location').value.trim();
    const capacity = document.getElementById('event-capacity').value.trim();
    const description = document.getElementById('event-description').value.trim();
    const organizer = document.getElementById('event-organizer').value.trim();

    const meta = EVENT_TYPE_META[type] || EVENT_TYPE_META.seminar;
    const id = `pending-evt-${pendingEventCounter++}`;

    const row = document.createElement('div');
    row.className = 'pending-event-row';
    row.id = id;
    row.innerHTML = `
        <div class="pending-event-info">
            <h4><i class="${meta.icon}"></i> ${escapeHTML(title)}</h4>
            <p>Submitted by <strong>${escapeHTML(organizer || 'You')}</strong> · Type: ${meta.label}${date ? ' · Proposed Date: ' + escapeHTML(date) : ''}${location ? ' · Location: ' + escapeHTML(location) : ''}</p>
        </div>
        <div class="pending-event-actions">
            <button class="btn btn-secondary btn-approve" onclick="approveEvent('${id}', this)"><i class="fa-solid fa-check"></i> Approve</button>
            <button class="btn btn-secondary btn-reject" onclick="rejectEvent('${id}')"><i class="fa-solid fa-xmark"></i> Reject</button>
        </div>
    `;

    // Stash the full data on the row so approveEvent can build the published card
    row.dataset.eventTitle = title;
    row.dataset.eventType = type;
    row.dataset.eventDate = date;
    row.dataset.eventLocation = location;
    row.dataset.eventCapacity = capacity;
    row.dataset.eventDescription = description;
    row.dataset.eventOrganizer = organizer;

    const list = document.getElementById('pending-events-list');
    if (list) {
        list.appendChild(row);
        // Make sure admin queue is visible so the submitter can see where it went (demo convenience)
        const queueCard = document.getElementById('admin-queue-card');
        if (queueCard) queueCard.classList.add('show');
    }
    // Note: for non-admin users the queue elements have been removed from
    // the page entirely (see role gating above). In a real backend this
    // submission would be persisted to the database regardless, and an
    // admin would see it next time they load the admin queue.

    e.target.reset();
    closeEventModal();
    showToast('Event submitted! It now awaits admin approval.', 'fa-solid fa-paper-plane', true);
}

// ---- Admin: approve / reject -------------------------------------
function toggleAdminMode() {
    const checked = document.getElementById('admin-mode-toggle').checked;
    document.getElementById('admin-queue-card').classList.toggle('show', checked);
}

function approveEvent(id, btn) {
    const row = document.getElementById(id);
    if (!row) return;

    // If this row came from the submission form, build a real card for it.
    if (row.dataset.eventTitle) {
        const meta = EVENT_TYPE_META[row.dataset.eventType] || EVENT_TYPE_META.seminar;
        const cap = parseInt(row.dataset.eventCapacity, 10);
        const capacityLabel = cap > 0 ? `0 / ${cap} registered` : 'Open registration';

        const card = document.createElement('div');
        card.className = 'glass-card event-card new-event-pulse';
        card.dataset.type = row.dataset.eventType;
        card.innerHTML = `
            <div class="event-cover ${meta.coverClass}">
                <i class="${meta.icon}"></i>
                <span class="event-type-badge">${meta.label}</span>
                <span class="event-status-badge approved">Approved</span>
            </div>
            <div class="event-body">
                <h3>${escapeHTML(row.dataset.eventTitle)}</h3>
                <p class="event-desc">${escapeHTML(row.dataset.eventDescription || 'No description provided.')}</p>
                <div class="event-meta">
                    <span><i class="fa-regular fa-calendar"></i> ${escapeHTML(row.dataset.eventDate || 'Date TBA')}</span>
                    <span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(row.dataset.eventLocation || 'Location TBA')}</span>
                </div>
                <div class="event-organizer">
                    <span class="organizer-avatar"><i class="fa-solid fa-user"></i></span>
                    Organized by ${escapeHTML(row.dataset.eventOrganizer || 'Community Member')} · Approved by Admin
                </div>
                <div class="event-footer">
                    <span class="event-capacity"><strong>${cap > 0 ? '0' : '—'}</strong>${cap > 0 ? ' / ' + cap + ' registered' : ''}</span>
                    <button class="btn btn-primary btn-register" onclick="registerEvent(this)">Register</button>
                </div>
            </div>
        `;

        const grid = document.getElementById('events-grid');
        const addCard = grid.querySelector('.add-event-card');
        grid.insertBefore(card, addCard);

        // Respect the currently active filter
        const activeFilter = document.querySelector('#event-filters .toggle-btn.active');
        if (activeFilter && activeFilter.dataset.filter !== 'all' && activeFilter.dataset.filter !== row.dataset.eventType) {
            card.classList.add('hidden-by-filter');
        }
    }

    fadeOutAndRemove(row);
    showToast('Event approved and published to Community Drives.', 'fa-solid fa-circle-check', true);
}

function rejectEvent(id) {
    const row = document.getElementById(id);
    if (!row) return;
    fadeOutAndRemove(row);
    showToast('Event submission rejected.', 'fa-solid fa-circle-xmark');
}

function fadeOutAndRemove(row) {
    row.classList.add('fading-out');
    setTimeout(() => {
        row.remove();
        const list = document.getElementById('pending-events-list');
        if (list && list.children.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'pending-empty-msg';
            empty.textContent = "All caught up — no events waiting for approval.";
            list.appendChild(empty);
        }
    }, 350);
}

// ---- Helpers -------------------------------------------------------
// escapeHTML(str) is now defined in app.js (shared with renderEvents).

let toastTimeout;
function showToast(message, icon, success) {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.className = 'toast-notification' + (success ? ' success' : '');
    toast.innerHTML = `<i class="${icon || 'fa-solid fa-circle-info'}"></i> <span>${message}</span>`;

    requestAnimationFrame(() => toast.classList.add('show'));

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3200);
}