/********************************************************
 * GLOBAL STATE & CONFIGURATION
 ********************************************************/
const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_DATA = [];
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 
let IS_SYNCING = false;
let LAST_MSG_ID = "";

/********************************************************
 * INITIALIZATION
 ********************************************************/
$(document).ready(() => {
    initPremiumUI();
    loadDashboard();

    // High-Frequency Sync for Chat & Real-time status
    setInterval(updateChatPreview, 15000);
    
    // Background Data Sync (Professional Polling)
    setInterval(professionalSync, 30000);
});

function initPremiumUI() {
    // Add subtle top loader if not exists
    if (!$('#slim-progress').length) {
        $('body').append('<div id="slim-progress" style="position:fixed; top:0; left:0; height:3px; background:linear-gradient(90deg, #4f46e5, #818cf8); z-index:9999; width:0%; transition: width 0.4s cubic-bezier(0.1, 0.7, 1.0, 0.1);"></div>');
    }
}

/********************************************************
 * CORE DATA ENGINE
 ********************************************************/
async function loadDashboard() {
    showSlimProgress(30);
    $("#globalLoader").show();

    try {
        const response = await fetchWithTimeout(`${API}?action=getDashboardData&t=${Date.now()}`);
        const data = await response.json();

        MASTER_DATA = data.records || [];
        
        // Setup Identity
        handleIdentity(MASTER_DATA);

        // Render Everything
        updateStats(MASTER_DATA, data.archivedCount || 0);
        buildFilters();
        renderTable();
        if (data.publicHubActivity) renderHubActivity(data.publicHubActivity);
        
        showSlimProgress(100);
    } catch (err) {
        showToast("Connection unstable. Retrying...", "error");
    } finally {
        setTimeout(() => { 
            $("#globalLoader").fadeOut(400); 
            hideSlimProgress();
        }, 600);
    }
}

async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible' || $('.modal.show').length > 0) return;
    
    IS_SYNCING = true;
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        // Deep compare to avoid unnecessary DOM thrashing
        const hasChanges = JSON.stringify(MASTER_DATA) !== JSON.stringify(res.records);
        
        if (hasChanges) {
            // Check for new match notification before updating MASTER_DATA
            detectNewMatches(res.records);
            
            MASTER_DATA = res.records;
            animateValue("statTotal", parseInt($('#statTotal').text()), MASTER_DATA.length, 1000);
            renderTable();
            if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
        }
    } catch (e) { console.warn("Sync deferred."); }
    finally { IS_SYNCING = false; }
}

/********************************************************
 * TABLE & UI RENDERING (PREMIUM MOTION)
 ********************************************************/
function renderTable() {
    const tbody = $('#mainTbody');
    const query = $('#inpSearch').val().toLowerCase();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();

    // User Criteria for local match detection
    const myCriteria = MASTER_DATA
        .filter(x => String(x.phone) === String(MY_PHONE))
        .map(me => ({
            working: String(me['Working District']).trim().toUpperCase(),
            willing: String(me['Willing District']).trim().toUpperCase()
        }));

    // Filter Logic
    const filtered = MASTER_DATA.filter(r => {
        const isMe = String(r.phone) === String(MY_PHONE);
        const matchesSearch = !query || (r['Your Designation'] || "").toLowerCase().includes(query);
        const matchesFrom = from === 'all' || r['Working District'] === from;
        const matchesTo = to === 'all' || r['Willing District'] === to;
        
        if (FILTER_MATCHES) {
            const theirWorking = String(r['Working District']).trim().toUpperCase();
            const theirWilling = String(r['Willing District']).trim().toUpperCase();
            const isMatchForMe = myCriteria.some(me => 
                (theirWorking === me.willing && theirWilling === me.working) || 
                (r.MATCH_STATUS.toUpperCase().includes("MATCH") && theirWorking === me.willing)
            );
            return (isMatchForMe || isMe) && matchesSearch && matchesFrom && matchesTo;
        }
        return matchesSearch && matchesFrom && matchesTo;
    });

    // Update Counter Button
    const matchCount = filtered.filter(x => String(x.phone) !== String(MY_PHONE)).length;
    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i> Matches ${matchCount > 0 ? `<span class="badge badge-light ml-1">${matchCount}</span>` : ''}`);

    // DOM Update
    tbody.empty();
    $('#noData').toggleClass('d-none', filtered.length > 0);

    filtered.forEach((row, index) => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const matchStat = (row.MATCH_STATUS || "").toUpperCase();
        const hasMatch = matchStat.includes("MATCH");
        const delay = index * 0.03; // Staggered entry

        let demandCfg = getDemandConfig(row.DEMAND_STATUS);
        let statusBadge = getStatusBadge(matchStat, hasMatch);

        const rowHtml = `
            <tr class="${isMe ? 'row-identity' : ''}" style="animation: slideIn 0.4s ease forwards ${delay}s; opacity:0;">
                <td>
                    <div class="font-weight-bold text-dark">${row['Your Designation']}</div>
                    ${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem;">MY PROFILE</div>' : ''}
                </td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td>
                <td class="desktop-only">
                    <div class="demand-pill ${demandCfg.c}">
                        <span class="pulse-dot-small" style="background:${demandCfg.d}"></span>${row.DEMAND_STATUS || 'Moderate'}
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <button class="btn btn-unlock ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" 
                            onclick="unlockRow('${row.id}', ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock'}"></i>
                    </button>
                </td>
            </tr>`;
        tbody.append(rowHtml);
    });
}

/********************************************************
 * SUCCESS STORIES (ARCHIVE) LOGIC
 ********************************************************/
async function loadSuccessStories() {
    const container = $('#successWallContainer').empty().append('<div class="text-center p-5"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i></div>');
    
    try {
        const res = await fetch(`${API}?action=getArchivedStories`);
        const data = await res.json();
        container.empty();

        if (!data.stories || data.stories.length === 0) {
            container.append('<div class="text-center p-5 text-muted">Success stories will appear here soon.</div>');
            return;
        }

        data.stories.forEach((story, i) => {
            container.append(`
                <div class="activity-item" style="animation-delay: ${i * 0.1}s">
                    <div class="d-flex align-items-center mb-2">
                        <div class="rounded-circle bg-success text-white d-flex align-items-center justify-content-center mr-3" style="width:40px; height:40px;">
                            <i class="fas fa-check"></i>
                        </div>
                        <div>
                            <h6 class="mb-0 font-weight-bold">${story.designation}</h6>
                            <small class="text-muted">${new Date(story.matchDate).toLocaleDateString()}</small>
                        </div>
                    </div>
                    <div class="p-2 rounded bg-light border-left border-success">
                        <strong>${story.from}</strong> <i class="fas fa-arrow-right mx-2 text-success"></i> <strong>${story.to}</strong>
                    </div>
                    <div class="mt-2 text-success small font-weight-bold uppercase"><i class="fas fa-medal mr-1"></i> ${story.outcome}</div>
                </div>
            `);
        });
    } catch (e) {
        container.html('<div class="alert alert-warning">Failed to load success wall.</div>');
    }
}

/********************************************************
 * CHAT SYSTEM (PREMIUM)
 ********************************************************/
async function sendChatMessage(customMsg = null) {
    const inputField = $('#chatInput');
    const msg = customMsg || inputField.val().trim();
    if (!msg) return;

    // Optimistic UI: Clear input immediately for speed feel
    inputField.val('');
    
    try {
        await fetch(API, {
            method: "POST",
            body: JSON.stringify({
                action: "sendMessage",
                roomId: currentRoomId,
                userPhone: MY_PHONE,
                userName: MY_NAME,
                msg: msg
            })
        });
        loadMessages(); // Refresh to show the message confirmed
    } catch (e) {
        showToast("Message failed to send", "error");
    }
}

/********************************************************
 * UTILITIES & HELPERS
 ********************************************************/
function handleIdentity(records) {
    if (MY_PHONE) {
        const currentUser = records.find(x => String(x.phone) === String(MY_PHONE));
        if (currentUser) {
            MY_NAME = currentUser['Your Designation'] || "User";
            $('#idContainer').removeClass('d-none');
            $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
        } else {
            clearIdentity();
        }
    }
}

function getDemandConfig(status) {
    const s = (status || '').toUpperCase();
    if (s.includes('HIGH')) return { c: 'lvl-high', d: '#ef4444' };
    if (s.includes('LOW')) return { c: 'lvl-low', d: '#10b981' };
    return { c: 'lvl-mod', d: '#f59e0b' };
}

function getStatusBadge(stat, hasMatch) {
    if (stat.includes("3-WAY")) return `<span class="badge badge-pill badge-secondary badge-glow-purple">3-WAY MATCH</span>`;
    if (hasMatch) return `<span class="badge badge-pill badge-success badge-glow-green">DIRECT MATCH</span>`;
    return `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
}

function detectNewMatches(newRecords) {
    const oldMatched = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
    const newMatched = newRecords.filter(x => String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
    
    if (newMatched > oldMatched) {
        showToast("🎉 Mutual match found! Check your notifications.", "success");
        if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
    }
}

// Stats Animation
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj || start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
}

function showSlimProgress(percent) { $('#slim-progress').css('width', percent + '%').show(); }
function hideSlimProgress() { $('#slim-progress').fadeOut(); }

// Global Actions
function toggleMatches() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    FILTER_MATCHES = !FILTER_MATCHES;
    $('#btnMatches').toggleClass('btn-primary text-white').toggleClass('btn-outline-primary');
    renderTable();
}

function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
