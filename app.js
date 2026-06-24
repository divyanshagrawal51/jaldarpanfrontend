// ── SUPABASE CLIENT ──
const SUPABASE_URL = "https://kmdsdrvvpbennilcinxl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DpqBWRsDSMR3LLh3xO-djQ_1uU_crgE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ── BACKEND API ──
const API_BASE = "https://jaldarpanbackend.onrender.com"; // Render deployment

let currentUserId = null;
let mealImageBase64 = null; // stores uploaded meal image for /analyze

// (Mock friends removed — leaderboard now shows only the real logged-in user)

// Runtime state — populated from Supabase on load
let appState = {
    userProfile: null,
    challenges: [],
    friends: [],
    badges: [],
    events: []
};

function renderResult(data, foodName) {
    document.getElementById("result").innerHTML = `
        <div class="result-card">

            <div class="result-header">
                <h2>${data.matched_food.toUpperCase()}</h2>
                <div class="water-number">
                    ${data.water_liters}
                    <span>L</span>
                </div>
                <p>${data.unit}</p>
            </div>

            <div class = "breakdown-grid">
                <div class="stat-card green">
                    <h3>${data.breakdown.green}</h3>
                    <p>Green Water</p>
                </div>

                <div class="stat-card blue">
                    <h3>${data.breakdown.blue}</h3>
                    <p>Blue Water</p>
                </div>

                <div class="stat-card grey">
                    <h3>${data.breakdown.grey}</h3>
                    <p>Grey Water</p>
                </div>
            </div>

            <div class="tips-section">
                <h3>Did You Know?</h3>
                ${data.tips.map(t => `<p>• ${t}</p>`).join("")}
            </div>

            <div class="advice-box">
                ${data.advice}
            </div>

        </div>
        `;
}

// 1. The Core Logic: Handles reading the file and sending it to the API
async function scan(file) {
    if (!file) return;

    // 1. Get your existing result element (replace "result-container" with your actual ID)
    const resultElement = document.getElementById("result");
    
    // 2. Put the loading text inside it immediately
    if (resultElement) {
        resultElement.innerHTML = "<p class='loading-text'>Please wait, scanning image...</p>";
    }

    const reader = new FileReader();

    reader.onload = async function(e) {
        try {
            const base64 = e.target.result.split(",")[1];

            const response = await fetch(`${API_BASE}/scan`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ image: base64 })
            });

            const data = await response.json();
            
            // 3. Your existing function will automatically overwrite the loading text with the real data
            renderResult(data, data.identified_as || "Unknown");

        } catch (error) {
            console.error("Scanning failed:", error);
            
            // 4. If it fails, clear the loading message and show an error instead
            if (resultElement) {
                resultElement.innerHTML = "<p style='color: red;'>Failed to scan image. Please try again.</p>";
            }
        }
    };

    reader.readAsDataURL(file);
}

// 2. The Event Handler: Extracts the file and updates the UI status
async function handleImageUpload(event) {
    const file = event.target.files[0];
    
    if (!file) return;

    document.getElementById("upload-status").textContent = file.name;

    // Reuse the scan function here
    await scan(file);
}


// ── MEAL ANALYZE ──

function switchMealMode(mode) {
    document.getElementById('meal-mode-text').style.display = mode === 'text' ? 'block' : 'none';
    document.getElementById('meal-mode-image').style.display = mode === 'image' ? 'block' : 'none';
    document.getElementById('btn-mode-text').classList.toggle('active', mode === 'text');
    document.getElementById('btn-mode-image').classList.toggle('active', mode === 'image');
    mealImageBase64 = null;
}

function addMealRow() {
    const list = document.getElementById('meal-items-list');
    const row = document.createElement('div');
    row.className = 'meal-item-row';
    row.innerHTML = `
        <input type="text" placeholder="Food item (e.g. Dal)" class="meal-item-name"/>
        <input type="text" placeholder="Qty (e.g. 1 bowl)" class="meal-item-qty"/>
        <button class="meal-row-remove" onclick="removeMealRow(this)" title="Remove">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    list.appendChild(row);
}

function removeMealRow(btn) {
    const list = document.getElementById('meal-items-list');
    if (list.children.length <= 1) return; // keep at least one row
    btn.closest('.meal-item-row').remove();
}

function handleMealImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1];
        mealImageBase64 = base64;

        const preview = document.getElementById('meal-image-preview');
        preview.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById('upload-status').textContent = file.name;
    };
    reader.readAsDataURL(file);
}

function renderMealAnalysisResult(data) {
    const resultsPanel = document.getElementById('result');
    if (!resultsPanel) return;

    const itemsHTML = (data.items || []).map(item => `
        <div class="meal-result-item">
            <div>
                <span class="item-name">${item.name}</span>
                <span class="item-qty"> · ${item.quantity}</span>
            </div>
            <span class="item-litres">${item.litres}L</span>
        </div>
    `).join('');

    resultsPanel.innerHTML = `
        <div class="result-header">
            <h3>Meal Analysis <span class="estimated-badge">AI Estimated</span></h3>
            <div class="water-number">${data.total_litres}<span>L</span></div>
            <p style="color:var(--text-muted);font-size:0.85rem">total water footprint</p>
        </div>
        <div class="breakdown-grid" style="margin:16px 0">
            <div class="stat-card">
                <div style="font-size:1.4rem;font-weight:700;color:#4ade80">${data.green}L</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">🌿 Green</div>
            </div>
            <div class="stat-card">
                <div style="font-size:1.4rem;font-weight:700;color:#38bdf8">${data.blue}L</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">💧 Blue</div>
            </div>
            <div class="stat-card">
                <div style="font-size:1.4rem;font-weight:700;color:#94a3b8">${data.grey}L</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">🌫️ Grey</div>
            </div>
        </div>
        <div class="meal-result-items">${itemsHTML}</div>
        ${data.summary ? `<div class="meal-result-summary">${data.summary}</div>` : ''}
    `;
}

async function analyzeMeal() {
    const isImageMode = document.getElementById('meal-mode-image').style.display !== 'none';
    console.log('analyzeMeal called, isImageMode:', isImageMode);

    let body;
    if (isImageMode) {
        if (!mealImageBase64) {
            alert('Please upload a meal image first.');
            return;
        }
        body = { image_base64: mealImageBase64 };
    } else {
        const rows = document.querySelectorAll('#meal-items-list .meal-item-row');
        const items = [];
        rows.forEach(row => {
            const name = row.querySelector('.meal-item-name').value.trim();
            const quantity = row.querySelector('.meal-item-qty').value.trim();
            if (name) items.push({ name, quantity: quantity || '1 serving' });
        });
        console.log('items collected:', items);
        if (items.length === 0) {
            alert('Please add at least one food item.');
            return;
        }
        body = { items };
    }

    const btn = document.getElementById('meal-analyze-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
    btn.disabled = true;

    try {
        console.log('fetching /analyze with body:', body);
        const res = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        console.log('response status:', res.status);
        const data = await res.json();
        console.log('response data:', data);

        if (!data.success) {
            alert('Analysis failed: ' + (data.message || 'Unknown error'));
            return;
        }

        renderMealAnalysisResult(data);

        const litres = Math.round(data.total_litres || 0);
        appState.userProfile.todayWaterLogged += litres;
        appState.userProfile.xp += 30;
        bumpStreak();
        await syncProfile();
        await logActivity('meal_scan', litres, 30, {
            source: isImageMode ? 'image' : 'text',
            items: JSON.parse(JSON.stringify(data.items || []))
        });
        updateUIRefreshes();
        console.log('analyzeMeal complete');

    } catch (err) {
        console.error('Analyze error:', err);
        alert('Could not reach the backend. Make sure the server is running.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ── FARMER CORNER ──

async function analyzeFarm() {
    const crop = document.getElementById('farmer-crop').value.trim();
    const area = document.getElementById('farmer-area').value.trim();
    const irrigation = document.getElementById('farmer-irrigation').value;
    const region = document.getElementById('farmer-region').value.trim();
    const soil = document.getElementById('farmer-soil').value;
    const waterSource = document.getElementById('farmer-water-source').value;

    if (!crop || !area) {
        alert('Please enter at least crop name and farm area.');
        return;
    }

    const btn = document.getElementById('farmer-analyze-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/farmer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crop, area: parseFloat(area), irrigation, region, soil, water_source: waterSource })
        });
        const data = await res.json();

        if (!data.success) {
            alert('Analysis failed: ' + (data.message || 'Unknown error'));
            return;
        }

        // Update result card
        document.getElementById('farmer-total-litres').textContent =
            data.total_litres.toLocaleString('en-IN');
        document.getElementById('farmer-efficiency').textContent =
            data.efficiency + '%';
        document.getElementById('farmer-saving').textContent =
            data.saving_potential.toLocaleString('en-IN') + 'L';

        // Update tips
        const tipsContainer = document.getElementById('farmer-tips-container');
        tipsContainer.innerHTML = (data.tips || [])
            .map(tip => `<div class="farmer-tip">${tip}</div>`)
            .join('');

    } catch (err) {
        console.error('Farmer analyze error:', err);
        alert('Could not reach the backend.');
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-droplet"></i> Analyze Crop';
        btn.disabled = false;
    }
}

// ── EVENTS ──

const EVENT_TYPE_META = {
    cleanup:    { label: 'River Cleanup', icon: 'fa-solid fa-water',             coverClass: 'type-cleanup' },
    seminar:    { label: 'Seminar',       icon: 'fa-solid fa-chalkboard-user',   coverClass: 'type-seminar' },
    workshop:   { label: 'Workshop',      icon: 'fa-solid fa-screwdriver-wrench', coverClass: 'type-workshop' },
    plantation: { label: 'Plantation',    icon: 'fa-solid fa-seedling',          coverClass: 'type-plantation' }
};

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function renderEvents() {
    const grid = document.getElementById('events-grid');
    if (!grid) return;

    // Remove previously rendered cards (keep the "Host Your Own Drive" add-card)
    grid.querySelectorAll('.event-card:not(.add-event-card)').forEach(el => el.remove());

    const addCard = grid.querySelector('.add-event-card');

    appState.events.forEach(ev => {
        const meta = EVENT_TYPE_META[ev.type] || EVENT_TYPE_META.seminar;
        const card = document.createElement('div');
        card.className = 'glass-card event-card';
        card.dataset.type = ev.type;

        const capacityHTML = ev.capacity
            ? `<strong>${ev.registeredCount}</strong> / ${ev.capacity} registered`
            : `<strong>${ev.registeredCount}</strong> registered`;

        const btnHTML = ev.isRegistered
            ? `<button class="btn btn-primary btn-register registered" onclick="registerEvent('${ev.id}', this)"><i class="fa-solid fa-check"></i> Registered</button>`
            : `<button class="btn btn-primary btn-register" onclick="registerEvent('${ev.id}', this)">Register</button>`;

        card.innerHTML = `
            <div class="event-cover ${meta.coverClass}">
                <i class="${meta.icon}"></i>
                <span class="event-type-badge">${meta.label}</span>
                <span class="event-status-badge approved">Approved</span>
            </div>
            <div class="event-body">
                <h3>${escapeHTML(ev.title)}</h3>
                <p class="event-desc">${escapeHTML(ev.description)}</p>
                <div class="event-meta">
                    <span><i class="fa-regular fa-calendar"></i> ${escapeHTML(ev.eventDate)}</span>
                    <span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(ev.location)}</span>
                </div>
                <div class="event-organizer">
                    <span class="organizer-avatar"><i class="${ev.organizerIcon || 'fa-solid fa-users'}"></i></span>
                    Organized by ${escapeHTML(ev.organizerName)}
                </div>
                <div class="event-footer">
                    <span class="event-capacity">${capacityHTML}</span>
                    ${btnHTML}
                </div>
            </div>
        `;

        if (addCard) {
            grid.insertBefore(card, addCard);
        } else {
            grid.appendChild(card);
        }
    });

    // Re-apply active filter, if any
    const activeFilter = document.querySelector('#event-filters .toggle-btn.active');
    if (activeFilter && typeof filterEvents === 'function') {
        filterEvents(activeFilter.dataset.filter, activeFilter);
    }
}

async function registerEvent(eventId, btn) {
    const ev = appState.events.find(e => e.id === eventId);
    if (!ev) return;

    if (ev.isRegistered) {
        // Cancel registration
        await supabaseClient
            .from('event_registrations')
            .delete()
            .eq('event_id', eventId)
            .eq('user_id', currentUserId);

        ev.isRegistered = false;
        ev.registeredCount = Math.max(0, ev.registeredCount - 1);
        showToast('Registration cancelled.', 'fa-solid fa-circle-info');
    } else {
        await supabaseClient
            .from('event_registrations')
            .insert({ event_id: eventId, user_id: currentUserId });

        ev.isRegistered = true;
        ev.registeredCount += 1;
        showToast(`You're registered for "${ev.title}"!`, 'fa-solid fa-circle-check', true);
    }

    renderEvents();
}

// ── DATA LAYER ──

async function logout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'auth.html';
}

async function syncProfile() {
    const p = appState.userProfile;
    await supabaseClient.from('profiles').update({
        username: p.username,
        avatar_seed: p.avatarSeed,
        xp: p.xp,
        streak: p.streak,
        water_saved_month: p.waterSavedMonth,
        challenges_completed_count: p.challengesCompletedCount,
        friends_invited_count: p.friendsInvitedCount,
        today_water_logged: p.todayWaterLogged,
        last_active_date: p.lastActiveDate,
        updated_at: new Date().toISOString()
    }).eq('id', currentUserId);
}

async function syncChallenge(challengeId, completed) {
    await supabaseClient.from('user_challenges').update({
        completed: completed,
        completed_at: completed ? new Date().toISOString() : null
    }).eq('user_id', currentUserId).eq('challenge_id', challengeId);
}

async function logActivity(logType, litres, xpEarned, metadata = {}) {
    await supabaseClient.from('activity_logs').insert({
        user_id: currentUserId,
        log_type: logType,
        litres: litres,
        xp_earned: xpEarned,
        metadata: metadata
    });
}

// ── STREAK ──

function bumpStreak() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const last = appState.userProfile.lastActiveDate;

    if (last === todayStr) return; // already counted today

    if (last) {
        const lastDate = new Date(last + 'T00:00:00Z');
        const today = new Date(todayStr + 'T00:00:00Z');
        const diffDays = Math.round((today - lastDate) / 86400000);

        if (diffDays === 1) {
            appState.userProfile.streak += 1; // consecutive day
        } else {
            appState.userProfile.streak = 1; // gap — restart
        }
    } else {
        appState.userProfile.streak = 1; // first ever activity
    }

    appState.userProfile.lastActiveDate = todayStr;
}

// ── PERIODIC RESETS ──

function getISOWeekKey(d) {
    // Returns "YYYY-WW" for ISO week comparison
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-${week}`;
}

async function applyPeriodicResets(profile) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD
    const profileUpdates = {};
    let resetTypes = [];

    // DAILY
    if (profile.last_daily_reset !== todayStr) {
        resetTypes.push('daily');
        profileUpdates.today_water_logged = 0;
        profileUpdates.last_daily_reset = todayStr;
        appState.userProfile.todayWaterLogged = 0;
    }

    // WEEKLY (ISO week comparison)
    const lastWeekDate = new Date(profile.last_weekly_reset + 'T00:00:00Z');
    if (getISOWeekKey(lastWeekDate) !== getISOWeekKey(today)) {
        resetTypes.push('weekly');
        profileUpdates.last_weekly_reset = todayStr;
    }

    // MONTHLY
    const lastMonthDate = new Date(profile.last_monthly_reset + 'T00:00:00Z');
    if (lastMonthDate.getUTCFullYear() !== today.getFullYear() || lastMonthDate.getUTCMonth() !== today.getMonth()) {
        resetTypes.push('monthly');
        profileUpdates.last_monthly_reset = todayStr;
    }

    if (resetTypes.length === 0) return;

    // Reset matching user_challenges rows
    const { data: matchingChallenges } = await supabaseClient
        .from('challenges')
        .select('id')
        .in('type', resetTypes);

    if (matchingChallenges && matchingChallenges.length > 0) {
        const ids = matchingChallenges.map(c => c.id);
        await supabaseClient
            .from('user_challenges')
            .update({ completed: false, completed_at: null })
            .eq('user_id', currentUserId)
            .in('challenge_id', ids);
    }

    // Persist profile reset markers
    await supabaseClient.from('profiles').update(profileUpdates).eq('id', currentUserId);
}

async function loadAppState() {
    // 1. Check session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'auth.html';
        return false;
    }
    currentUserId = session.user.id;

    // 2. Load profile
    const { data: profile, error: profileErr } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUserId)
        .single();

    if (profileErr || !profile) {
        console.error('Failed to load profile:', profileErr);
        return false;
    }

    if (!profile.onboarding_completed) {
        window.location.href = 'auth.html';
        return false;
    }

    appState.userProfile = {
        username: profile.username,
        avatarSeed: profile.avatar_seed,
        xp: profile.xp,
        streak: profile.streak,
        waterSavedMonth: profile.water_saved_month,
        challengesCompletedCount: profile.challenges_completed_count,
        friendsInvitedCount: profile.friends_invited_count,
        todayWaterLogged: profile.today_water_logged,
        lastActiveDate: profile.last_active_date
    };

    // 2b. Periodic resets (daily / weekly / monthly)
    await applyPeriodicResets(profile);

    // 3. Load master challenges
    const { data: masterChallenges } = await supabaseClient
        .from('challenges')
        .select('*');

    // 4. Load this user's challenge completion status
    let { data: userChallenges } = await supabaseClient
        .from('user_challenges')
        .select('*')
        .eq('user_id', currentUserId);

    // 5. First-time user: seed user_challenges rows
    if (!userChallenges || userChallenges.length === 0) {
        const rows = masterChallenges.map(c => ({
            user_id: currentUserId,
            challenge_id: c.id,
            completed: false
        }));
        await supabaseClient.from('user_challenges').insert(rows);
        userChallenges = rows.map(r => ({ ...r, completed_at: null }));
    }

    // 6. Merge master challenges with completion status
    const completionMap = {};
    userChallenges.forEach(uc => { completionMap[uc.challenge_id] = uc.completed; });

    appState.challenges = masterChallenges.map(c => ({
        id: c.id,
        text: c.text,
        type: c.type,
        xp: c.xp,
        completed: !!completionMap[c.id]
    }));

    // 7. Load master badges
    const { data: masterBadges } = await supabaseClient
        .from('badges')
        .select('*');

    appState.badges = (masterBadges || []).map(b => ({
        id: b.id,
        name: b.name,
        desc: b.description,
        requirement: b.requirement
    }));

    // 8. Load approved events + registration counts + this user's registrations
    const { data: events } = await supabaseClient
        .from('events')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: true });

    const { data: registrations } = await supabaseClient
        .from('event_registrations')
        .select('event_id, user_id');

    const regCountMap = {};
    const userRegSet = new Set();
    (registrations || []).forEach(r => {
        regCountMap[r.event_id] = (regCountMap[r.event_id] || 0) + 1;
        if (r.user_id === currentUserId) userRegSet.add(r.event_id);
    });

    appState.events = (events || []).map(ev => ({
        id: ev.id,
        title: ev.title,
        type: ev.type,
        description: ev.description,
        eventDate: ev.event_date,
        location: ev.location,
        organizerName: ev.organizer_name,
        organizerIcon: ev.organizer_icon,
        capacity: ev.capacity,
        registeredCount: regCountMap[ev.id] || 0,
        isRegistered: userRegSet.has(ev.id)
    }));

    return true;
}

// Single Page Nav Engine
function showPage(pageId) {
    document.querySelectorAll('.app-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const TargetPage = document.getElementById(`page-${pageId}`);
    if(TargetPage) TargetPage.classList.add('active');

    // Sync menu highlighting nodes
    const menuItems = document.querySelectorAll('.nav-menu .nav-item');
    menuItems.forEach(item => {
        if(item.textContent.toLowerCase().includes(pageId === 'log' ? 'log activity' : pageId)) {
            item.classList.add('active');
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Compute Tier Rank Classifications dynamically from XP values
function getLevelName(xp) {
    if (xp < 500) return "Water Explorer";
    if (xp < 1000) return "Stream Protector";
    if (xp < 2000) return "River Guardian";
    return "Ocean Hero";
}

// Core Rendering Pipeline
function updateUIRefreshes() {
    const profile = appState.userProfile;
    const computedLevel = getLevelName(profile.xp);

    // Navigation Status syncs
    document.getElementById('nav-streak').textContent = profile.streak;
    document.getElementById('nav-xp').textContent = profile.xp;
    document.getElementById('nav-avatar-img').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.avatarSeed}`;

    // Dashboard elements syncs
    document.getElementById('hero-username').textContent = profile.username;
    document.getElementById('dash-level-name').textContent = computedLevel;
    document.getElementById('dash-water-saved').textContent = profile.waterSavedMonth.toLocaleString();
    document.getElementById('dash-today-litres').textContent = profile.todayWaterLogged;

    // Progress circle evaluation logic
    const circle = document.getElementById('today-progress-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    // Baselines limit at 500 Litres for circular progress visualization bounds
    const baselineCap = 500;
    const percentage = Math.min((profile.todayWaterLogged / baselineCap) * 100, 100);
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    // Sub-component renders
    renderDashboardQuests();
    renderMainQuestMatrix();
    renderLeaderboards();
    renderProfileHeatmaps();
}

// Render Core Lists
function renderDashboardQuests() {
    const container = document.getElementById('dash-challenges-list');
    container.innerHTML = "";
    
    // Render top 2 incomplete challenges
    const activeQuests = appState.challenges.filter(c => !c.completed).slice(0, 2);
    if(activeQuests.length === 0) {
        container.innerHTML = "<p style='font-size:0.9rem; color:var(--text-muted);'>All active operational directives cleared!</p>";
        return;
    }

    activeQuests.forEach(quest => {
        const item = document.createElement('div');
        item.className = "challenge-item-row";
        item.innerHTML = `
            <div class="challenge-main">
                <button class="chk-btn" onclick="completeQuestDirectly('${quest.id}')"></button>
                <div class="challenge-text-block">
                    <label>${quest.text}</label>
                    <div class="challenge-meta"><span class="c-xp">+${quest.xp} XP</span></div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function renderMainQuestMatrix() {
    const dailyBox = document.getElementById('container-daily-challenges');
    const weeklyBox = document.getElementById('container-weekly-challenges');
    const monthlyBox = document.getElementById('container-monthly-challenges');

    if(!dailyBox) return; // Guard clause for structural checking

    dailyBox.innerHTML = ""; weeklyBox.innerHTML = ""; monthlyBox.innerHTML = "";

    appState.challenges.forEach(quest => {
        const row = document.createElement('div');
        row.className = `challenge-item-row ${quest.completed ? 'completed' : ''}`;
        row.innerHTML = `
            <div class="challenge-main">
                <button class="chk-btn" onclick="completeQuestDirectly('${quest.id}')">
                    ${quest.completed ? '<i class="fa-solid fa-check" style="color:#03141c; font-size:0.8rem;"></i>' : ''}
                </button>
                <div class="challenge-text-block">
                    <label onclick="completeQuestDirectly('${quest.id}')">${quest.text}</label>
                    <div class="challenge-meta">
                        <span class="c-xp">+${quest.xp} XP</span>
                        <span>• Target Scope: ${quest.type}</span>
                    </div>
                </div>
            </div>
        `;
        
        if(quest.type === 'daily') dailyBox.appendChild(row);
        if(quest.type === 'weekly') weeklyBox.appendChild(row);
        if(quest.type === 'monthly') monthlyBox.appendChild(row);
    });

    // Render Badge Matrix
    const badgeGrid = document.getElementById('badges-container-grid');
    badgeGrid.innerHTML = "";
    appState.badges.forEach(badge => {
        const isUnlocked = appState.userProfile.xp >= badge.requirement;
        const div = document.createElement('div');
        div.className = `badge-node ${isUnlocked ? 'unlocked' : ''}`;
        div.innerHTML = `
            <div class="badge-icon-layer">${badge.name.split(' ')[0]}</div>
            <h5>${badge.name.substring(2)}</h5>
            <p>${badge.desc}</p>
            <small style="font-size:0.65rem; color:var(--color-aqua);">${isUnlocked ? 'Matrix Active' : 'Req: ' + badge.requirement + ' XP'}</small>
        `;
        badgeGrid.appendChild(div);
    });
}

async function renderLeaderboards(filterType = 'veg') {
    const mainBody = document.getElementById('main-leaderboard-body');
    const dashMiniList = document.getElementById('dash-leaderboard-list');

    // Fetch all profiles from Supabase, ranked by XP
    const { data: profiles, error } = await supabaseClient
        .from('profiles')
        .select('id, username, avatar_seed, xp, diet')
        .order('xp', { ascending: false });

    if (error) {
        console.error('Leaderboard fetch error:', error);
        return;
    }

    const dataset = (profiles || []).map(p => ({
        id: p.id,
        name: p.id === currentUserId ? `${p.username} (You)` : p.username,
        xp: p.xp,
        level: getLevelName(p.xp),
        avatarSeed: p.avatar_seed || p.username,
        isVeg: !p.diet || p.diet === 'Vegetarian' || p.diet === 'Vegan' || p.diet === 'Eggetarian',
        isUser: p.id === currentUserId
    }));

    // Already sorted by XP from the query, but ensure consistency
    dataset.sort((a, b) => b.xp - a.xp);

    // Mini Dash Render (Top 3)
    if(dashMiniList) {
        dashMiniList.innerHTML = "";
        dataset.slice(0, 3).forEach(ind => {
            const row = document.createElement('div');
            row.className = "mini-l-item";
            row.innerHTML = `
                <span style="font-size:0.9rem; font-weight:600;">${escapeHTML(ind.name)}</span>
                <span style="color:var(--color-aqua); font-size:0.85rem; font-weight:700;">${ind.xp} XP</span>
            `;
            dashMiniList.appendChild(row);
        });
    }

    // Filter main view matrix configuration parameters
    if(!mainBody) return;
    mainBody.innerHTML = "";
    
    // Update active structural toggle styling buttons
    if(filterType === 'veg') {
        document.getElementById('btn-toggle-veg').classList.add('active');
        document.getElementById('btn-toggle-nonveg').classList.remove('active');
    } else {
        document.getElementById('btn-toggle-veg').classList.remove('active');
        document.getElementById('btn-toggle-nonveg').classList.add('active');
    }

    const filteredData = dataset.filter(i => filterType === 'veg' ? i.isVeg : !i.isVeg || i.isUser);

    filteredData.forEach((ind, index) => {
        const tr = document.createElement('tr');
        if(ind.isUser) tr.className = "user-row";
        tr.innerHTML = `
            <td><span class="rank-num">${index + 1}</span></td>
            <td>
                <div class="identity-cell">
                    <img class="mini-avatar-list" src="https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(ind.avatarSeed)}" alt="av">
                    <strong>${escapeHTML(ind.name)}</strong>
                </div>
            </td>
            <td style="color:var(--color-aqua); font-weight:700;">${ind.xp}</td>
            <td><span class="badge-pill">${ind.level}</span></td>
        `;
        mainBody.appendChild(tr);
    });
}

function renderProfileHeatmaps() {
    const grid = document.getElementById('heatmap-container-grid');
    if(!grid) return;
    grid.innerHTML = "";
    
    // Create static array nodes simulating dynamic git footprint logging history matrix map
    const mockContributions = [0,1,0,3,2,0,1,0,0,2,1,3,0,1,2,0,1,1,0,2,3,0,0,1,2,1,0,2];
    mockContributions.forEach(lvl => {
        const node = document.createElement('div');
        node.className = `cube level-${lvl}`;
        node.title = `Ecosystem interaction level validation state: ${lvl}`;
        grid.appendChild(node);
    });

    // Populate standard textual field arrays inside settings panels
    document.getElementById('profile-name-display').textContent = appState.userProfile.username;
    document.getElementById('profile-rank-display').textContent = getLevelName(appState.userProfile.xp);
    document.getElementById('prof-xp').textContent = appState.userProfile.xp;
    document.getElementById('prof-streak').textContent = appState.userProfile.streak;
    document.getElementById('prof-saved').textContent = (appState.userProfile.waterSavedMonth/1000).toFixed(1) + 'k';
    document.getElementById('prof-challenges').textContent = appState.userProfile.challengesCompletedCount;
    document.getElementById('prof-friends').textContent = appState.userProfile.friendsInvitedCount;
}

// User Actions Handlers
async function completeQuestDirectly(id) {
    const quest = appState.challenges.find(c => c.id === id);
    if(quest && !quest.completed) {
        quest.completed = true;
        appState.userProfile.xp += quest.xp;
        appState.userProfile.challengesCompletedCount++;
        await syncProfile();
        await syncChallenge(id, true);
        updateUIRefreshes();
        alert(`Quest verified successfully! Earned +${quest.xp} operational experience points.`);
    } else if(quest && quest.completed) {
        quest.completed = false;
        appState.userProfile.xp -= quest.xp;
        appState.userProfile.challengesCompletedCount--;
        await syncProfile();
        await syncChallenge(id, false);
        updateUIRefreshes();
    }
}

async function quickLog(amount, title) {
    appState.userProfile.todayWaterLogged += amount;
    appState.userProfile.xp += 10; // Fixed incentive base configuration values
    bumpStreak();
    await syncProfile();
    await logActivity('quick_log', Math.round(amount), 10, { title: title });
    updateUIRefreshes();
    alert(`Interaction matrix initialized: ${title}. Allocated +10 XP baseline standard.`);
}

function updateRangeVal(element, outputId) {
    document.getElementById(outputId).textContent = element.value;
}

function triggerMockUpload() {
    const status = document.getElementById('upload-status');
    status.textContent = "Processing network asset arrays via AI proxy...";
    setTimeout(() => {
        status.textContent = "AI Classification Match Found: [Paneer Butter Masala Matrix Combo]";
        document.getElementById('meal-select').value = "dairy";
    }, 1200);
}

// Core Analytical Calculations Logic
async function calculateFootprint() {
    const showerMins = parseInt(document.getElementById('input-shower').value) || 0;
    const laundryLoads = parseInt(document.getElementById('input-laundry').value) || 0;
    const dishMins = parseInt(document.getElementById('input-dishes').value) || 0;
    const gardenMins = parseInt(document.getElementById('input-garden').value) || 0;
    const carSessions = parseInt(document.getElementById('input-car').value) || 0;
    const directDrink = parseFloat(document.getElementById('input-drink').value) || 0;

    // Direct Consumption Variable Allocation Formula Indices
    const showerRate = 9;   // Litres per min
    const laundryRate = 75; // Litres per load
    const dishRate = 6;     // Litres per min
    const hoseRate = 12;    // Litres per min
    const carRate = 150;    // Litres per wash

    const totalImpactCalculated = Math.round(
        (showerMins * showerRate) +
        (laundryLoads * laundryRate) +
        (dishMins * dishRate) +
        (gardenMins * hoseRate) +
        (carSessions * carRate) +
        directDrink
    );

    // Update UI Elements
    document.getElementById('calculated-litres').textContent = totalImpactCalculated;

    // Animate meter fill
    const fillPercent = Math.min((totalImpactCalculated / 3000) * 100, 100);
    document.getElementById('meter-fill').style.height = `${fillPercent}%`;

    // Diagnostic text
    const diagnosticTextNode = document.getElementById('impact-evaluation-text');
    if (diagnosticTextNode) diagnosticTextNode.textContent = `Today's Domestic Water Impact: ${totalImpactCalculated} Litres`;

    // Suggestions
    const suggestionsBox = document.getElementById('ai-suggestions-list');
    suggestionsBox.innerHTML = "";
    let feedbackCards = [];

    if(showerMins > 5) feedbackCards.push("Reducing your shower by 2–4 minutes could save 18–36 litres tomorrow.");
    if(laundryLoads > 0) feedbackCards.push("Running only full laundry loads reduces water waste significantly.");
    if(gardenMins > 0) feedbackCards.push("Watering your garden in the early morning or evening reduces evaporation losses.");
    if(carSessions > 0) feedbackCards.push("Using a bucket instead of a hose for car washing can save over 100 litres per wash.");
    if(feedbackCards.length === 0) feedbackCards.push("Great job! Your domestic water usage is well within efficient limits today.");

    feedbackCards.forEach(tip => {
        const card = document.createElement('div');
        card.className = "suggestion-item";
        card.innerHTML = `<div class="sug-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div><p>${tip}</p>`;
        suggestionsBox.appendChild(card);
    });

    // Save to Supabase + award XP + bump streak
    appState.userProfile.todayWaterLogged += totalImpactCalculated;
    appState.userProfile.xp += 30;
    bumpStreak();
    await syncProfile();
    await logActivity('footprint_calc', Math.round(totalImpactCalculated), 30, {
        shower: showerMins, laundry: laundryLoads, dishes: dishMins,
        garden: gardenMins, car: carSessions, drink: directDrink
    });
    updateUIRefreshes();
}

// Modal Interaction Framework
function openInviteModal() {
    document.getElementById('invite-modal').classList.add('active');
}
function closeInviteModal() {
    document.getElementById('invite-modal').classList.remove('active');
}
async function copyInviteCode() {
    const field = document.getElementById('invite-code-field');
    field.select();
    field.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(field.value);
    alert("Invite token hash array mapped to device clipboard layers: " + field.value);
    appState.userProfile.friendsInvitedCount++;
    await syncProfile();
    updateUIRefreshes();
    closeInviteModal();
}

function filterLeaderboard(type) {
    renderLeaderboards(type);
}

// Interactive Knowledge Hub Accordion Nodes
function toggleAccordion(element) {
    element.classList.toggle('open');
}

// Profile Sync Configurations Layer updates
async function updateProfileSettings() {
    const newName = document.getElementById('settings-username').value;
    const newSeed = document.getElementById('settings-avatar-seed').value;
    
    if(newName.trim()) appState.userProfile.username = newName;
    if(newSeed.trim()) appState.userProfile.avatarSeed = newSeed;

    await syncProfile();
    updateUIRefreshes();
}

function toggleThemeOverride() {
    const isChecked = document.getElementById('theme-toggle-checkbox').checked;
    if(!isChecked) {
        document.body.style.background = "#051923";
    } else {
        document.body.style.background = "linear-gradient(135deg, #051923 0%, #0A4D68 50%, #002B3D 100%)";
        document.body.style.backgroundSize = "400% 400%";
    }
}

// Initialization Entry Vector
window.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadAppState();
    if (!ok) return; // redirected to auth.html or load failed

    updateUIRefreshes();
    renderEvents();
    
    // Set standard periodic carousel data update intervals
    const facts = [
        "1 kg of beef may require significantly more water than most vegetables—averaging around 15,000 litres!",
        "A leaky faucet expanding at exactly one drop per second sheds up to 11,000 litres of clean fluid annually.",
        "Refining a single metric ton of raw steel absorbs up to 300 metric tons of process scaling operational water assets."
    ];
    let index = 0;
    setInterval(() => {
        const carousel = document.getElementById('fact-carousel-container');
        if(carousel) {
            index = (index + 1) % facts.length;
            carousel.innerHTML = `<p class="fact-text">"${facts[index]}"</p>`;
        }
    }, 8000);
});
