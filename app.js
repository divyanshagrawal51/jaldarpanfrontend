// ─────────────────────────────────────────────────────────────
//  FIXES FOR WATER IMPACT CALCULATION
//  Drop these into app.js, replacing the corresponding functions
// ─────────────────────────────────────────────────────────────

// Tracks the water litres from the most recent meal analysis this session
// so calculateFootprint() can include it in the total
let sessionMealLitres = 0;

// ── UPDATED: renderMealAnalysisResult ──
// After rendering, also update the domestic impact meter
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

    // FIX 1: Store meal litres so calculateFootprint() can include them
    sessionMealLitres = Math.round(data.total_litres || 0);

    // FIX 2: Immediately reflect meal litres in the impact meter
    updateImpactMeter(sessionMealLitres);
}

// ── NEW HELPER: updateImpactMeter ──
// Updates the calculated-litres display, water meter fill, and suggestions
// totalLitres = meal + domestic combined
function updateImpactMeter(totalLitres, suggestions = []) {
    const litresEl = document.getElementById('calculated-litres');
    const meterFill = document.getElementById('meter-fill');
    const evalText = document.getElementById('impact-evaluation-text');
    const suggestionsBox = document.getElementById('ai-suggestions-list');

    if (litresEl) litresEl.textContent = totalLitres;

    if (meterFill) {
        const fillPercent = Math.min((totalLitres / 3000) * 100, 100);
        meterFill.style.height = `${fillPercent}%`;
    }

    if (evalText) {
        evalText.textContent = `Today's Water Impact: ${totalLitres} Litres`;
    }

    if (suggestionsBox && suggestions.length > 0) {
        suggestionsBox.innerHTML = '';
        suggestions.forEach(tip => {
            const card = document.createElement('div');
            card.className = 'suggestion-item';
            card.innerHTML = `
                <div class="sug-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <p>${tip}</p>
            `;
            suggestionsBox.appendChild(card);
        });
    }
}

// ── UPDATED: analyzeMeal ──
// Accumulates meal litres into todayWaterLogged (additive, not overwrite)
// and also updates water_saved_month
async function analyzeMeal() {
    const isImageMode = document.getElementById('meal-mode-image').style.display !== 'none';

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
        if (items.length === 0) {
            alert('Please add at least one food item.');
            return;
        }
        body = { items };
    }

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

        renderMealAnalysisResult(data); // sets sessionMealLitres and updates meter

        const litres = Math.round(data.total_litres || 0);

        // FIX 3: ADDITIVE — don't overwrite, add to what's already logged today
        appState.userProfile.todayWaterLogged += litres;

        // FIX 4: Update water_saved_month (this was never done before)
        // We track litres logged; "saved" is computed relative to a baseline of 3000L/day
        const baseline = 3000;
        const saved = Math.max(0, baseline - appState.userProfile.todayWaterLogged);
        appState.userProfile.waterSavedMonth = saved;

        appState.userProfile.xp += 30;
        bumpStreak();
        await syncProfile();
        await logActivity('meal_scan', litres, 30, {
            source: isImageMode ? 'image' : 'text',
            items: JSON.parse(JSON.stringify(data.items || []))
        });
        updateUIRefreshes();

    } catch (err) {
        console.error('Analyze error:', err);
        alert('Could not reach the backend. Make sure the server is running.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ── UPDATED: calculateFootprint ──
// FIX 5: Removed dead #meal-select read
// FIX 6: Uses sessionMealLitres (from analyzeMeal) + domestic = real combined total
// FIX 7: ADDITIVE update to todayWaterLogged, not overwrite
async function calculateFootprint() {
    const showerMins     = parseInt(document.getElementById('input-shower').value)  || 0;
    const laundryLoads   = parseInt(document.getElementById('input-laundry').value) || 0;
    const dishMins       = parseInt(document.getElementById('input-dishes').value)  || 0;
    const gardenMins     = parseInt(document.getElementById('input-garden').value)  || 0;
    const carSessions    = parseInt(document.getElementById('input-car').value)     || 0;
    const directDrink    = parseFloat(document.getElementById('input-drink').value) || 0;

    const showerRate  = 9;
    const laundryRate = 75;
    const dishRate    = 6;
    const hoseRate    = 12;
    const carRate     = 150;

    const domesticLitres = Math.round(
        (showerMins  * showerRate)  +
        (laundryLoads * laundryRate) +
        (dishMins    * dishRate)    +
        (gardenMins  * hoseRate)    +
        (carSessions * carRate)     +
        directDrink
    );

    // FIX 5+6: Total = meal litres (from analysis) + domestic activities
    const totalImpactCalculated = sessionMealLitres + domesticLitres;

    // Build suggestions
    const feedbackCards = [];
    if (showerMins > 5) {
        feedbackCards.push("Reducing your shower by 2–4 minutes could save 18–36 litres tomorrow.");
    }
    if (sessionMealLitres > 800) {
        feedbackCards.push("Your meal had a high water footprint. Swapping one item for a plant-based option can cut it significantly.");
    }
    if (laundryLoads > 0) {
        feedbackCards.push("Run laundry only on full loads to avoid wasting up to 75L per partial cycle.");
    }
    if (gardenMins > 0) {
        feedbackCards.push("Water your garden at dawn or dusk — midday watering loses up to 30% to evaporation.");
    }
    if (feedbackCards.length === 0) {
        feedbackCards.push("Great usage profile today! Keep tracking daily to build your streak.");
    }

    // Update the meter with full combined total
    updateImpactMeter(totalImpactCalculated, feedbackCards);

    // FIX 7: Set todayWaterLogged to the full combined total (meal + domestic)
    // This is now authoritative — previous meal litres already captured by analyzeMeal
    appState.userProfile.todayWaterLogged = totalImpactCalculated;

    // FIX 4: Update water_saved_month
    const baseline = 3000;
    const saved = Math.max(0, baseline - totalImpactCalculated);
    appState.userProfile.waterSavedMonth = saved;

    appState.userProfile.xp += 30;
    bumpStreak();
    await syncProfile();
    await logActivity('footprint_calc', domesticLitres, 30, {
        shower: showerMins,
        laundry: laundryLoads,
        dishes: dishMins,
        garden: gardenMins,
        car: carSessions,
        drink: directDrink,
        meal_litres_session: sessionMealLitres
    });
    updateUIRefreshes();
}
