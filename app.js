// ── SUPABASE CLIENT ──
const SUPABASE_URL = "https://kmdsdrvvpbennilcinxl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DpqBWRsDSMR3LLh3xO-djQ_1uU_crgE";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// ── BACKEND API ──
const API_BASE = "https://jaldarpanbackend.onrender.com"; // Render deployment

let currentUserId = null;
let mealImageBase64 = null; // stores uploaded meal image for /analyze

// Track the latest AI calculated footprint to feed dynamically into the dashboard meter
let latestAIMealFootprint = null;

// Runtime state — populated from Supabase on load
let appState = {
    userProfile: null,
    challenges: [],
    friends: [],
    badges: [],
    events: []
};

function renderResult(data, foodName) {
    const container = document.getElementById("result-container");
    if (!container) return;
    
    container.innerHTML = `
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

async function lookup() {
    const food = document.getElementById("meal-text").value;

    try {
        const response = await fetch(`${API_BASE}/lookup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                food_name: food
            })
        });

        const data = await response.json();

        if (!data.found) {
            const container = document.getElementById("result-container");
            if (container) {
                container.innerHTML = `<p>${data.message}</p>`;
            }
            return;
        }

        renderResult(data, food);

        // Track and sync calculation changes to state & backend
        const litres = Math.round(data.water_liters || 0);
        latestAIMealFootprint = litres; // Cache for the indicator recalculation panel
        
        appState.userProfile.todayWaterLogged += litres;
        appState.userProfile.xp += 30;
        bumpStreak();
        await syncProfile();
        await logActivity('meal_lookup', litres, 30, {
            source: 'text_lookup',
            food_name: food
        });
        updateUIRefreshes();
        
        // Push updates seamlessly straight to the dashboard visual indicators
        calculateFootprint();

    } catch (err) {
        console.error("Lookup error:", err);
    }
}

// 1. The Core Logic: Handles reading the file and sending it to the API
async function scan(file) {
    if (!file) return;

    const resultElement = document.getElementById("result-container");
    
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
            
            renderResult(data, data.identified_as || "Unknown");

            // Track and sync calculation changes to state & backend
            const litres = Math.round(data.water_liters || 0);
            latestAIMealFootprint = litres; // Cache for the indicator recalculation panel
            
            appState.userProfile.todayWaterLogged += litres;
            appState.userProfile.xp += 30;
            bumpStreak();
            await syncProfile();
            await logActivity('meal_scan', litres, 30, {
                source: 'image_scan',
                identified_as: data.identified_as || "Unknown"
            });
            updateUIRefreshes();
            
            // Push updates seamlessly straight to the dashboard visual indicators
            calculateFootprint();

        } catch (error) {
            console.error("Scanning failed:", error);
            
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
    if (list.children.length <= 1) return; 
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
    const fontPanel = document.getElementById('result-container');
    if (!fontPanel) return;

    const itemsHTML = (data.items || []).map(item => `
        <div class="meal-result-item">
            <div>
                <span class="item-name">${item.name}</span>
                <span class="item-qty"> · ${item.quantity}</span>
            </div>
            <span class="item-litres">${item.litres}L</span>
        </div>
    `).join('');

    fontPanel.innerHTML = `
        <div class="result-card">
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
            ${data.summary ? `<div class="meal-result-summary" style="margin-top:12px; font-size:0.9rem; padding:10px; border-radius:6px; background:rgba(255,255,255,0.05);">${data.summary}</div>` : ''}
        </div>
    `;
}

async function analyzeMeal() {
    const isImageMode = document.getElementById('meal-mode-image').style.display !== 'none';

    let body;
    if (isImageMode) {
        if (!mealImageBase64) {
            alert('Please upload a meal image first.');
            return;
        }
        body = { image_base_64: mealImageBase64 };
    } else {
        const rows = document.querySelectorAll('#meal-items-list .meal-item-row');
        const items = [];
        rows.forEach(row => {
            const name = row.querySelector('.meal-item-name').value.trim();
            const quantity = row.querySelector('.meal-item-qty').value.trim();
            if (name) items.push({ name, quantity: quantity || '1 serving' });
        });
        if (items.length === 0) {
            alert('Please add at least one food item.');
            return;
        }
        body = { items };
    }

    // Show loading state
    const btn = document.querySelector('[onclick="analyzeMeal()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!data.success) {
            alert('Analysis failed: ' + (data.message || 'Unknown error'));
            return;
        }

        // Render result
        renderMealAnalysisResult(data);

        // Save to activity_logs + award XP + bump streak
        const litres = Math.round(data.total_litres || 0);
        latestAIMealFootprint = litres; // Cache for the indicator recalculation panel
        
        appState.userProfile.todayWaterLogged += litres;
        appState.userProfile.xp += 30;
        bumpStreak();
        await syncProfile();
        await logActivity('meal_scan', litres, 30, {
            source: isImageMode ? 'image' : 'text',
            items: JSON.parse(JSON.stringify(data.items || []))
        });
        updateUIRefreshes();
        
        // Push updates seamlessly straight to the dashboard visual indicators
        calculateFootprint();

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

    const activeFilter = document.querySelector('#event-filters .toggle-btn.active');
    if (activeFilter && typeof filterEvents === 'function') {
        filterEvents(activeFilter.dataset.filter, activeFilter);
    }
}

async function registerEvent(eventId, btn) {
    const ev = appState.events.find(e => e.id === eventId);
    if (!ev) return;

    if (ev.isRegistered) {
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

    if (last === todayStr) return; 

    if (last) {
        const lastDate = new Date(last + 'T00:00:00Z');
        const today = new Date(todayStr + 'T00:00:00Z');
        const diffDays = Math.round((today - lastDate) / 86400000);

        if (diffDays === 1) {
            appState.userProfile.streak += 1; 
        } else {
            appState.userProfile.streak = 1; 
        }
    } else {
        appState.userProfile.streak = 1; 
    }

    appState.userProfile.lastActiveDate = todayStr;
}

// ── PERIODIC RESETS ──

function getISOWeekKey(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7; 
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${date.getUTCFullYear()}-${week}`;
}

async function applyPeriodicResets(profile) {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10); 
    const profileUpdates = {};
    let resetTypes = [];

    if (profile.last_daily_reset !== todayStr) {
        resetTypes.push('daily');
        profileUpdates.today_water_logged = 0;
        profileUpdates.last_daily_reset = todayStr;
        appState.userProfile.todayWaterLogged = 0;
    }

    const lastWeekDate = new Date(profile.last_weekly_reset + 'T00:00:00Z');
    if (getISOWeekKey(lastWeekDate) !== getISOWeekKey(today)) {
        resetTypes.push('weekly');
        profileUpdates.last_weekly_reset = todayStr;
    }

    const lastMonthDate = new Date(profile.last_monthly_reset + 'T00:00:00Z');
    if (lastMonthDate.getUTCFullYear() !== today.getFullYear() || lastMonthDate.getUTCMonth() !== today.getMonth()) {
        resetTypes.push('monthly');
        profileUpdates.last_monthly_reset = todayStr;
    }

    if (resetTypes.length === 0) return;

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

    await supabaseClient.from('profiles').update(profileUpdates).eq('id', currentUserId);
}

async function loadAppState() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'auth.html';
        return false;
    }
    currentUserId = session.user.id;

    const { data: profile, error: profileErr } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUserId)
        .single();

    if (profileErr || !profile) {
        // New user — profile row doesn't exist yet, send to onboarding
        window.location.href = 'auth.html';
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

    await applyPeriodicResets(profile);

    const { data: masterChallenges } = await supabaseClient
        .from('challenges')
        .select('*');

    let { data: userChallenges } = await supabaseClient
        .from('user_challenges')
        .select('*')
        .eq('user_id', currentUserId);

    if (!userChallenges || userChallenges.length === 0) {
        const rows = masterChallenges.map(c => ({
            user_id: currentUserId,
            challenge_id: c.id,
            completed: false
        }));
        await supabaseClient.from('user_challenges').insert(rows);
        userChallenges = rows.map(r => ({ ...r, completed_at: null }));
    }

    const completionMap = {};
    userChallenges.forEach(uc => { completionMap[uc.challenge_id] = uc.completed; });

    appState.challenges = masterChallenges.map(c => ({
        id: c.id,
        text: c.text,
        type: c.type,
        xp: c.xp,
        completed: !!completionMap[c.id]
    }));

    const { data: masterBadges } = await supabaseClient
        .from('badges')
        .select('*');

    appState.badges = (masterBadges || []).map(b => ({
        id: b.id,
        name: b.name,
        desc: b.description,
        requirement: b.requirement
    }));

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

function showPage(pageId) {
    document.querySelectorAll('.app-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    const TargetPage = document.getElementById(`page-${pageId}`);
    if(TargetPage) TargetPage.classList.add('active');

    const menuItems = document.querySelectorAll('.nav-menu .nav-item');
    menuItems.forEach(item => {
        if(item.textContent.toLowerCase().includes(pageId === 'log' ? 'log activity' : pageId)) {
            item.classList.add('active');
        }
    });

    // Refresh profile page every time it's opened so meal history is live
    if (pageId === 'profile') {
        renderProfileHeatmaps();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getLevelName(xp) {
    if (xp < 500) return "Water Explorer";
    if (xp < 1000) return "Stream Protector";
    if (xp < 2000) return "River Guardian";
    return "Ocean Hero";
}

function updateUIRefreshes() {
    const profile = appState.userProfile;
    const computedLevel = getLevelName(profile.xp);

    document.getElementById('nav-streak').textContent = profile.streak;
    document.getElementById('nav-xp').textContent = profile.xp;
    document.getElementById('nav-avatar-img').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.avatarSeed}`;

    document.getElementById('hero-username').textContent = profile.username;
    document.getElementById('dash-level-name').textContent = computedLevel;
    document.getElementById('dash-water-saved').textContent = profile.waterSavedMonth.toLocaleString();
    document.getElementById('dash-today-litres').textContent = profile.todayWaterLogged;

    const circle = document.getElementById('today-progress-circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    
    const baselineCap = 500;
    const percentage = Math.min((profile.todayWaterLogged / baselineCap) * 100, 100);
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;

    renderDashboardQuests();
    renderMainQuestMatrix();
    renderLeaderboards();
    renderProfileHeatmaps();
}

function renderDashboardQuests() {
    const container = document.getElementById('dash-challenges-list');
    container.innerHTML = "";
    
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

    if(!dailyBox) return; 

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

    dataset.sort((a, b) => b.xp - a.xp);

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

    if(!mainBody) return;
    mainBody.innerHTML = "";
    
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

async function renderProfileHeatmaps() {
    // Profile identity fields
    document.getElementById('profile-name-display').textContent = appState.userProfile.username;
    document.getElementById('profile-rank-display').textContent = getLevelName(appState.userProfile.xp);
    document.getElementById('prof-xp').textContent = appState.userProfile.xp;
    document.getElementById('prof-streak').textContent = appState.userProfile.streak;
    document.getElementById('prof-saved').textContent = (appState.userProfile.waterSavedMonth / 1000).toFixed(1) + 'k';
    document.getElementById('prof-challenges').textContent = appState.userProfile.challengesCompletedCount;
    document.getElementById('prof-friends').textContent = appState.userProfile.friendsInvitedCount;

    // Sync big profile avatar to current seed
    const profileAvatarDisplay = document.getElementById('profile-avatar-display');
    if (profileAvatarDisplay) {
        profileAvatarDisplay.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(appState.userProfile.avatarSeed)}`;
    }

    // Populate username field in settings
    const usernameInput = document.getElementById('settings-username');
    if (usernameInput) usernameInput.value = appState.userProfile.username;

    // ── AVATAR PICKER ──
    const avatarPicker = document.getElementById('dash-avatar-picker');
    if (avatarPicker && !avatarPicker.dataset.initialized) {
        avatarPicker.dataset.initialized = 'true';
        const AVATAR_SEEDS = [
            'JalWater', 'AquaBot', 'RiverGuard', 'EcoWave', 'DropsBot',
            'StreamBot', 'TidalFlow', 'WaterLeaf', 'OceanMind', 'RainBot',
            'PondLife', 'CloudBot'
        ];
        AVATAR_SEEDS.forEach(seed => {
            const wrapper = document.createElement('div');
            wrapper.className = 'avatar-option' + (seed === appState.userProfile.avatarSeed ? ' selected' : '');
            wrapper.title = seed;
            wrapper.innerHTML = `<img src="https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}" alt="${seed}">`;
            wrapper.onclick = async () => {
                avatarPicker.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
                wrapper.classList.add('selected');
                appState.userProfile.avatarSeed = seed;
                // Update all avatar images instantly
                document.getElementById('nav-avatar-img').src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
                if (profileAvatarDisplay) profileAvatarDisplay.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}`;
                await syncProfile();
                if (typeof showToast === 'function') {
                    showToast('Avatar updated!', 'fa-solid fa-circle-check', true);
                }
            };
            avatarPicker.appendChild(wrapper);
        });
    } else if (avatarPicker) {
        // Re-sync selected state when re-navigating to profile
        avatarPicker.querySelectorAll('.avatar-option').forEach(el => {
            el.classList.toggle('selected', el.title === appState.userProfile.avatarSeed);
        });
    }

    // ── MEAL HISTORY + DIET FEEDBACK ──
    const entriesEl = document.getElementById('mh-entries');
    const totalEl = document.getElementById('mh-total-litres');
    const countEl = document.getElementById('mh-meal-count');
    const dietStatusEl = document.getElementById('mh-diet-status');
    if (!entriesEl) return;

    // Show loading state while fetching
    entriesEl.innerHTML = '<div class="mh-empty" style="opacity:0.6"><i class="fa-solid fa-spinner fa-spin" style="margin-right:6px"></i> Loading meal history...</div>';

    // Load diet from localStorage
    let dietPlan = null;
    try { dietPlan = JSON.parse(localStorage.getItem('jaldarpan_user_diet')); } catch(e) {}

    if (dietPlan && dietPlan.text) {
        dietStatusEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#2ed573"></i> Diet plan active — feedback enabled`;
        dietStatusEl.style.color = '#2ed573';
    }

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextMidnight = new Date(midnight.getTime() + 86400000);

    const { data: logs } = await supabaseClient
        .from('activity_logs')
        .select('*')
        .eq('user_id', currentUserId)
        .gte('created_at', midnight.toISOString())
        .lt('created_at', nextMidnight.toISOString())
        .order('created_at', { ascending: false });

    const allLogs = logs || [];
    // Filter only meal-related logs (Section A)
    const mealLogs = allLogs.filter(l =>
        l.log_type === 'meal_scan' || l.log_type === 'meal_lookup'
    );

    const mealSum = mealLogs.reduce((a, l) => a + (l.litres || 0), 0);
    if (totalEl) totalEl.textContent = mealSum + ' L';
    if (countEl) countEl.textContent = mealLogs.length + (mealLogs.length === 1 ? ' meal' : ' meals');

    if (mealLogs.length === 0) {
        entriesEl.innerHTML = '<div class="mh-empty">No meals logged yet today.<br><small>Use Section A in Log Activity to add meals.</small></div>';
        return;
    }

    entriesEl.innerHTML = '';
    mealLogs.forEach(entry => {
        const name = histEntryName(entry);
        const m = entry.metadata || {};
        const source = m.source === 'image' ? '📷 Image Scan' : (entry.log_type === 'meal_lookup' ? '🔍 Single Lookup' : '📝 Text Entry');
        const time = new Date(entry.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const litres = entry.litres || 0;

        // Diet feedback
        let feedbackHTML = '';
        if (dietPlan && dietPlan.text) {
            const feedback = getMealDietFeedback(name, litres, dietPlan);
            feedbackHTML = `<div class="mh-feedback ${feedback.cls}"><i class="${feedback.icon}"></i> ${feedback.text}</div>`;
        }

        const card = document.createElement('div');
        card.className = 'mh-entry';
        card.innerHTML = `
            <div class="mh-entry-top">
                <div class="mh-entry-left">
                    <div class="mh-entry-name">${escapeHTML(name)}</div>
                    <div class="mh-entry-meta">${source} · ${time}</div>
                </div>
                <div class="mh-entry-right">
                    <div class="mh-litres">${litres} L</div>
                    <div class="mh-xp">+${entry.xp_earned} XP</div>
                </div>
            </div>
            ${feedbackHTML}
        `;
        entriesEl.appendChild(card);
    });
}

function getMealDietFeedback(mealName, litres, dietPlan) {
    const dietText = (dietPlan.text || '').toLowerCase();
    const meal = mealName.toLowerCase();

    // High water footprint items
    const highFootprint = ['beef', 'lamb', 'mutton', 'pork', 'chicken', 'meat', 'prawn', 'shrimp', 'fish'];
    const medFootprint  = ['egg', 'dairy', 'milk', 'cheese', 'paneer', 'curd', 'yogurt'];
    const lowFootprint  = ['dal', 'lentil', 'vegetable', 'rice', 'roti', 'chapati', 'sabji', 'salad', 'oats', 'poha', 'khichdi', 'tofu'];

    const isHigh = highFootprint.some(k => meal.includes(k));
    const isMed  = medFootprint.some(k => meal.includes(k));
    const isLow  = lowFootprint.some(k => meal.includes(k));

    // Check if this food is in diet
    const inDiet = dietText.includes(meal.split(' ')[0]) || dietText.includes(meal.split(',')[0].trim());

    if (isHigh && litres > 1000) {
        return {
            cls: 'fb-warn',
            icon: 'fa-solid fa-triangle-exclamation',
            text: inDiet
                ? `This is part of your diet plan but carries a high water footprint (${litres}L). Consider a plant protein swap to save ~1,200L.`
                : `High footprint meal (${litres}L) — not in your diet plan. Replacing with dal or tofu can save over 1,000L per serving.`
        };
    }
    if (isLow && litres < 500) {
        return {
            cls: 'fb-good',
            icon: 'fa-solid fa-leaf',
            text: inDiet
                ? `Great match with your diet plan! Low footprint choice at ${litres}L — well within your target.`
                : `Eco-friendly meal (${litres}L)! Not explicitly in your diet plan, but a great water-saving choice.`
        };
    }
    if (isMed) {
        return {
            cls: 'fb-neutral',
            icon: 'fa-solid fa-droplet',
            text: inDiet
                ? `Aligns with your diet plan. Moderate footprint at ${litres}L — balanced choice.`
                : `Moderate water footprint (${litres}L). Not in your set diet plan — check your plan for better alternatives.`
        };
    }
    if (litres > 1500) {
        return {
            cls: 'fb-warn',
            icon: 'fa-solid fa-triangle-exclamation',
            text: `Very high footprint detected (${litres}L). ${inDiet ? 'This is in your diet plan — consider reviewing it for water efficiency.' : 'This meal is not in your diet plan and significantly raises your daily impact.'}`
        };
    }
    return {
        cls: 'fb-neutral',
        icon: 'fa-solid fa-circle-info',
        text: inDiet
            ? `Matches your diet plan. Footprint: ${litres}L.`
            : `Footprint: ${litres}L. Not directly found in your diet plan — log meals from your plan for better tracking.`
    };
}

function histTypeInfo(entry) {
    const t = entry.log_type;
    const m = entry.metadata || {};
    if (t === 'meal_scan' && m.source === 'image') return { icon: '📷', label: 'Meal Scan', cls: 'type-scan' };
    if (t === 'meal_scan') return { icon: '🍽️', label: 'Meal Log', cls: 'type-meal' };
    if (t === 'meal_lookup') return { icon: '🔍', label: 'Food Lookup', cls: 'type-meal' };
    if (t === 'quick_log') return { icon: '⚡', label: 'Quick Log', cls: 'type-quick' };
    if (t === 'footprint_calc') return { icon: '📊', label: 'Footprint Calc', cls: 'type-calc' };
    return { icon: '📝', label: t.replace(/_/g, ' '), cls: 'type-calc' };
}

function histEntryName(entry) {
    const m = entry.metadata || {};
    if (m.identified_as) return m.identified_as;
    if (m.items && m.items.length) return m.items.map(i => i.name).join(', ');
    if (m.food_name) return m.food_name;
    if (m.title) return m.title;
    return entry.log_type.replace(/_/g, ' ');
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
    appState.userProfile.xp += 10; 
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
        latestAIMealFootprint = 1200; // Mock preset mapping
        calculateFootprint();
    }, 1200);
}

// Core Analytical Calculations Logic
async function calculateFootprint() {
    // Check if an AI calculation was performed. If so, prioritize its footprint directly!
    let mealLitres = latestAIMealFootprint ?? 0;

    const showerMins = parseInt(document.getElementById('input-shower').value) || 0;
    const laundryLoads = parseInt(document.getElementById('input-laundry').value) || 0;
    const dishMins = parseInt(document.getElementById('input-dishes').value) || 0;
    const gardenMins = parseInt(document.getElementById('input-garden').value) || 0;
    const carSessions = parseInt(document.getElementById('input-car').value) || 0;
    
    // Explicit 0.5 float step metric extraction
    const directDrink = parseFloat(document.getElementById('input-drink').value) || 0;

    const showerRate = 9; 
    const laundryRate = 75; 
    const dishRate = 6; 
    const hoseRate = 12; 
    const carRate = 150; 

    const domesticSum = (showerMins * showerRate) + (laundryLoads * laundryRate) + (dishMins * dishRate) + (gardenMins * hoseRate) + (carSessions * carRate) + directDrink;
    const totalImpactCalculated = mealLitres + Math.round(domesticSum);

    // Update UI Elements
    document.getElementById('calculated-litres').textContent = totalImpactCalculated;
    
    const fillPercent = Math.min((totalImpactCalculated / 3000) * 100, 100);
    document.getElementById('meter-fill').style.height = `${fillPercent}%`;

    const suggestionsBox = document.getElementById('ai-suggestions-list');
    suggestionsBox.innerHTML = "";

    const diagnosticTextNode = document.getElementById('impact-evaluation-text');
    diagnosticTextNode.textContent = `Today's Water Impact: ${totalImpactCalculated} Litres total system parameter profile tracking values loaded.`;

    let feedbackCards = [];
    if(showerMins > 5) {
        feedbackCards.push("You could conserve approximately 18-36 litres tomorrow by restricting structural shower durations by 2-4 minutes.");
    }
    if(latestAIMealFootprint > 1000) {
        feedbackCards.push("Transitioning high footprint AI detected meals to plant-based choices optimizes regional hydro systems.");
    }
    if(laundryLoads > 0) {
        feedbackCards.push("Consolidating garment cycles strictly into completely full load distributions reduces wastewater downstream processing friction.");
    }
    if(gardenMins > 0) {
        feedbackCards.push("Consider shifting automated irrigation parameters to cool evening or pre-dawn slots to bypass heavy atmospheric evaporation penalties.");
    }

    if(feedbackCards.length === 0) {
        feedbackCards.push("Operational profile exhibits excellent compliance boundaries. Continue implementing tracking loops to stabilize surrounding ecosystems.");
    }

    feedbackCards.forEach(tip => {
        const card = document.createElement('div');
        card.className = "suggestion-item";
        card.innerHTML = `
            <div class="sug-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
            <p>${tip}</p>
        `;
        suggestionsBox.appendChild(card);
    });

    // Update local variable states profile metrics mapping seamlessly 
    // instead of incrementing continuously via += loop metrics
    await recalculateTodayWaterLogged();
    appState.userProfile.todayWaterLogged += Math.round(domesticSum);
    appState.userProfile.xp += 30; 
    bumpStreak();
    await syncProfile();
    
    // Explicit clean write profile update targeting domestic calculations independently
    await logActivity('footprint_calc', Math.round(domesticSum), 30, { ai_impact: latestAIMealFootprint });
    updateUIRefreshes();
}

function openInviteModal() {
    document.getElementById('invite-modal').classList.add('active');
}
function closeInviteModal() {
    document.getElementById('invite-modal').remove('active');
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

function toggleAccordion(element) {
    element.classList.toggle('open');
}

async function updateProfileSettings() {
    const newName = document.getElementById('settings-username').value;
    const newSeed = document.getElementById('settings-avatar-seed').value;
    
    if(newName.trim()) appState.userProfile.username = newName;
    if(newSeed.trim()) appState.userProfile.avatarSeed = newSeed;

    await syncProfile();
    updateUIRefreshes();
}

async function recalculateTodayWaterLogged() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextMidnight = new Date(midnight.getTime() + 86400000);

    const { data: logs } = await supabaseClient
        .from('activity_logs')
        .select('log_type, litres')
        .eq('user_id', currentUserId)
        .gte('created_at', midnight.toISOString())
        .lt('created_at', nextMidnight.toISOString());

    const total = (logs || []).reduce(
        (sum, log) => sum + (log.litres || 0),
        0
    );

    // Pull meal footprint specifically to sync with dashboard requirements instantly on initialization refresh cycles
    const mealsOnly = (logs || [])
        .filter(l => l.log_type === 'meal_scan' || l.log_type === 'meal_lookup')
        .reduce((sum, log) => sum + (log.litres || 0), 0);
        
    latestAIMealFootprint = mealsOnly;

    appState.userProfile.todayWaterLogged = total;
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
    if (!ok) return; 
    await recalculateTodayWaterLogged();
    updateUIRefreshes();
    
    // Trigger local calculation parameters seamlessly on load
    calculateFootprint();

    // Enforce step parameters constraint directly onto slider elements programmatically
    const sliders = ['input-shower', 'input-laundry', 'input-dishes', 'input-garden', 'input-car'];
    sliders.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.setAttribute('step', '1');
    });

    const drinkSlider = document.getElementById('input-drink');
    if (drinkSlider) drinkSlider.setAttribute('step', '0.5');

    updateUIRefreshes();
    renderEvents();
    
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
