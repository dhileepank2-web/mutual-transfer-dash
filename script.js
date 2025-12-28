const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0;
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 

// State Management
let IS_SYNCING = false;
let currentRoomId = 'GLOBAL';
let chatPollInterval = null;
let LAST_MSG_ID = ""; 
let LAST_SEEN_TIME = localStorage.getItem('last_chat_seen') || 0;

$(document).ready(() => {
    loadData();

    // Auto-refresh logic (2 mins)
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);

    // High-End Professional Sync (30 seconds)
    setInterval(professionalSync, 30000);
    
    // Background Chat Preview Polling
    setInterval(updateChatPreview, 15000);
});

/* --- 1. CORE UTILITIES --- */

// Phone Masking Utility for Privacy (e.g., 9080141350 -> 90******50)
function maskPhone(phone) {
    if (!phone) return "User";
    const str = String(phone).replace(/\D/g, ''); // Ensure only digits
    if (str.length < 10) return str;
    return str.slice(0, 2) + "******" + str.slice(-2);
}

function showSlimProgress(percent) {
    if (!$('#slim-progress').length) {
        $('body').append('<div id="slim-progress"></div>');
    }
    $('#slim-progress').css('width', percent + '%').show();
}

function hideSlimProgress() {
    $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%'));
}

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

/* --- 2. DATA SYNC LOGIC --- */

async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible') return;
    IS_SYNCING = true;
    showSlimProgress(30);

    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        animateValue("statTotal", MASTER_DATA.length, res.records.length, 1000);
        
        // Check for data changes to avoid UI jitter
        if (JSON.stringify(MASTER_DATA) !== JSON.stringify(res.records)) {
            MASTER_DATA = res.records;
            renderTable(); 
            if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
            updateStats(res.records, res.archivedCount);
        }
        showSlimProgress(100);
    } catch (e) {
        console.warn("Professional sync paused.");
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

function loadData() {
    $("#globalLoader").show();
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        
        if (response.publicHubActivity) renderHubActivity(response.publicHubActivity);

        const userLookup = MASTER_DATA.reduce((acc, user) => {
            acc[String(user.phone)] = user;
            return acc;
        }, {});

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = userLookup[String(MY_PHONE)];
            if (currentUser) {
                MY_NAME = currentUser['Your Designation'] || "User";
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(maskPhone(MY_PHONE));
            } else {
                localStorage.removeItem("userPhone");
                MY_PHONE = null;
                $('#modalVerify').modal('show');
            }
        } else {
            $('#modalVerify').modal('show');
        }

        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        buildFilters();
        renderTable();
        loadActivityLog(); 
        $("#globalLoader").fadeOut();
    })
    .catch(err => {
        console.error("Critical Load Error", err);
        $("#globalLoader").hide();
    });
}

async function syncLiveFeed() {
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();

        const oldMatches = MASTER_DATA.filter(x => 
            String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")
        ).length;

        const newMatches = res.records.filter(x => 
            String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")
        ).length;

        if (newMatches > oldMatches) {
            showToast("🎉 Great news! New match found!", "success");
            if (window.navigator.vibrate) window.navigator.vibrate(200);
        }

        MASTER_DATA = res.records;
        renderTable(); 
        updateStats(res.records, res.archivedCount);
        if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
    } catch (e) { console.warn("Live sync error."); }
}

/* --- 3. CHAT SYSTEM (WITH MASKING) --- */

function openChat(roomId, title) {
    if (!MY_PHONE) { showToast("Login to chat", "info"); return; }
    currentRoomId = roomId;
    $('#chatTitle').text(title);
    $('#chatBox').empty();
    
    if (roomId === 'GLOBAL') {
        $('#chatBadge').fadeOut();
        LAST_SEEN_TIME = Date.now();
        localStorage.setItem('last_chat_seen', LAST_SEEN_TIME);
    }
    
    $('#modalChat').modal('show');
    loadMessages();
    
    if(chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(loadMessages, 4000);
}

async function loadMessages() {
    try {
        const res = await fetch(`${API}?action=getMessages&roomId=${currentRoomId}&userPhone=${MY_PHONE}`);
        const data = await res.json();
        let html = "";
        
        data.messages.forEach(m => {
            const isAdmin = String(MY_PHONE) === "9080141350"; 
            // Mask sender identity for everyone except 'Me'
            const senderDisplay = m.isMe ? "You" : maskPhone(m.name);

            html += `
                <div class="msg-bubble ${m.isMe ? 'msg-me' : 'msg-them'}">
                    ${!m.isMe ? `<div class="msg-sender">${senderDisplay}</div>` : ''}
                    <div>${m.text}</div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <span class="msg-info" style="font-size:0.6rem; opacity:0.7;">${m.time}</span>
                        ${isAdmin ? `<i class="fas fa-trash-alt text-danger ml-2" onclick="adminDeleteMsg('${m.text}')"></i>` : ''}
                    </div>
                </div>`;
        });
        
        $('#chatBox').html(html);
        const cb = $('#chatBox')[0];
        cb.scrollTop = cb.scrollHeight;
    } catch(e) { console.warn("Message sync fail."); }
}

async function sendChatMessage(customMsg = null) {
    const inputField = $('#chatInput');
    const msg = customMsg || inputField.val().trim();
    if (!msg) return;
    
    inputField.val('');
    await fetch(API, {
        method: "POST",
        body: JSON.stringify({
            action: "sendMessage",
            roomId: currentRoomId,
            userPhone: MY_PHONE,
            userName: MY_PHONE, // We send Phone to server, then mask it on load
            msg: msg
        })
    });
    loadMessages();
}

async function updateChatPreview() {
    if ($('#modalChat').hasClass('show')) return; 

    try {
        const res = await fetch(`${API}?action=getMessages&roomId=GLOBAL&userPhone=${MY_PHONE}`);
        const data = await res.json();
        
        if (data.messages && data.messages.length > 0) {
            const lastMsg = data.messages[data.messages.length - 1];
            if (!lastMsg.isMe && lastMsg.text !== LAST_MSG_ID) {
                const previewName = maskPhone(lastMsg.name);
                $('#chatBadge').fadeIn();
                $('#prevName').text(previewName);
                $('#prevText').text(lastMsg.text);
                $('#prevAvatar').text(previewName.charAt(0));
                
                $('#chatPreview').fadeIn().delay(5000).fadeOut();
                LAST_MSG_ID = lastMsg.text;
            }
        }
    } catch (e) { console.warn("Preview sync fail."); }
}

/* --- 4. TABLE & UI RENDERING --- */

function renderTable() {
    const query = $('#inpSearch').val().toLowerCase();
    const from = $('#selFrom').val();
    const to = $('#selTo').val();
    
    const myCriteria = MASTER_DATA
        .filter(x => String(x.phone) === String(MY_PHONE))
        .map(me => ({
            working: String(me['Working District']).trim().toUpperCase(),
            willing: String(me['Willing District']).trim().toUpperCase()
        }));

    const potentialMatches = MASTER_DATA.filter(r => {
        if (String(r.phone) === String(MY_PHONE)) return false;
        const tWorking = String(r['Working District']).trim().toUpperCase();
        const tWilling = String(r['Willing District']).trim().toUpperCase();
        const systemMatch = r.MATCH_STATUS.toUpperCase().includes("MATCH");
        return myCriteria.some(me => {
            const isDirect = (tWorking === me.willing && tWilling === me.working);
            const isChain = (systemMatch && tWorking === me.willing);
            return isDirect || isChain;
        });
    });

    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i> Matches ${potentialMatches.length > 0 ? `<span class="badge badge-light ml-1">${potentialMatches.length}</span>` : ''}`);

    const filtered = MASTER_DATA.filter(r => {
        const isOwn = String(r.phone) === String(MY_PHONE);
        const matchesSearch = !query || r['Your Designation']?.toLowerCase().includes(query);
        const matchesFrom = from === 'all' || r['Working District'] === from;
        const matchesTo = to === 'all' || r['Willing District'] === to;
        if (FILTER_MATCHES) {
            const isMatchForMe = potentialMatches.some(m => m.id === r.id);
            return (isMatchForMe || isOwn) && matchesSearch && matchesFrom && matchesTo;
        }
        return matchesSearch && matchesFrom && matchesTo;
    });
    renderTableToDOM(filtered);
}

function renderTableToDOM(data) {
    const tbody = $('#mainTbody');
    const existingIds = [];
    tbody.find('tr').each(function() {
        const id = $(this).attr('data-id');
        if (id) existingIds.push(String(id));
    });

    tbody.empty();
    $('#noData').toggleClass('d-none', data.length > 0);
    
    let rowsHtml = ""; 
    data.forEach(row => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const matchStat = (row.MATCH_STATUS || "").toUpperCase();
        const hasMatch = matchStat.includes("MATCH");
        const isNew = existingIds.length > 0 && !existingIds.includes(String(row.id));
        
        let dCfg = { c: 'lvl-mod', d: '#f59e0b' }; 
        const dStat = (row.DEMAND_STATUS || '').toUpperCase();
        if(dStat.includes('HIGH')) dCfg = { c: 'lvl-high', d: '#ef4444' };
        if(dStat.includes('LOW')) dCfg = { c: 'lvl-low', d: '#10b981' };

        let statusMarkup = `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
        if(matchStat.includes("3-WAY")) {
            statusMarkup = `<span class="badge badge-pill badge-glow-purple">3-WAY MATCH</span>`;
        } else if(hasMatch) {
            statusMarkup = `<span class="badge badge-pill badge-success">DIRECT MATCH</span>`;
        }

        rowsHtml += `
            <tr class="${isMe ? 'row-identity' : ''} ${isNew ? 'row-updated' : ''}" data-id="${row.id}">
                <td>
                    <div class="font-weight-bold text-dark">${row['Your Designation']}</div>
                    ${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem;">MY ENTRY</div>' : ''}
                </td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td>
                <td class="col-demand">
                    <div class="demand-pill ${dCfg.c}">
                        <span class="pulse-dot-small" style="background:${dCfg.d};"></span>
                        ${row.DEMAND_STATUS || 'Moderate'}
                    </div>
                </td>
                <td>${statusMarkup}</td>
                <td class="text-center">
                    <button class="btn btn-unlock ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" 
                            onclick="unlockRow('${row.id}', ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'}"></i>
                    </button>
                </td>
            </tr>`;
    });
    tbody.html(rowsHtml);
}

/* --- 5. STATS & HUB --- */

function updateStats(data, archived) {
    const uniqueLive = [...new Set(data.map(x => x.phone))].length;
    const liveMatch = data.filter(r => r.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
    
    $('#statTotalUnique').text(uniqueLive);
    $('#statTotal').text(uniqueLive);
    $('#statMatched').text(liveMatch + archived);
    
    const rate = (uniqueLive + archived) > 0 ? Math.round(((liveMatch + archived) / (uniqueLive + archived)) * 100) : 0;
    $('#statRate').text(rate + '%');
}

function renderHubActivity(activities) {
    const container = $('#hubActivityList');
    if (!container.length) return;
    container.empty();
    
    activities.forEach((act, i) => {
        container.append(`
            <div class="activity-item shadow-sm" style="animation-delay: ${i * 0.1}s">
                <div class="d-flex justify-content-between">
                    <span class="live-indicator"><span class="pulse-dot mr-1"></span>Live</span>
                    <small class="text-muted">${act.time}</small>
                </div>
                <div class="font-weight-bold" style="font-size:0.85rem;">${act.msg}</div>
                <div class="small text-muted mt-1">User: ${maskPhone(act.user)}</div>
            </div>`);
    });
}

function loadActivityLog() {
    const container = $('#notificationList').empty();
    const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    
    if (myEntries.length === 0) {
        container.append(`<div class="text-center p-4 text-muted">No active registration found.</div>`);
        return;
    }

    myEntries.forEach(m => {
        const isMatch = m.MATCH_STATUS.toUpperCase().includes("MATCH");
        container.append(`
            <div class="history-card" style="border-left: 4px solid ${isMatch ? '#10b981' : '#cbd5e1'}">
                <h6 class="font-weight-bold mb-1">${m['Willing District']} Transfer</h6>
                <p class="small text-muted mb-0">${isMatch ? 'Match Found! Unlock to see contact.' : 'Searching for mutual matches...'}</p>
            </div>`);
    });
}

/* --- 6. ACTIONS & MODALS --- */

async function unlockRow(id, active) {
    if(!active) { showToast("Match required to view contact", "info"); return; }
    $("#globalLoader").fadeIn();
    try {
        const res = await fetch(API, {
            method: "POST",
            body: JSON.stringify({ action: "getContact", rowId: id, userPhone: MY_PHONE })
        });
        const data = await res.json();
        $("#globalLoader").fadeOut();

        if (data.is3Way) {
            $('#chainPersonB').text(data.partnerB.name);
            $('#chainPersonC').text(data.partnerC.name);
            $('#modalChain').modal('show'); 
        } else {
            $('#resName').text(data.name);
            $('#resPhone').text(data.contact);
            $('#callLink').attr("href", "tel:" + data.contact);
            $('#waLink').attr("href", "https://wa.me/91" + data.contact);
            $('#modalContact').modal('show'); 
        }
    } catch(e) { 
        $("#globalLoader").fadeOut(); 
        showToast("Connection error", "error");
    }
}

function saveVerify() {
    const val = $('#verifyPhone').val();
    if(!/^\d{10}$/.test(val)) { alert("Enter 10 digit number"); return; }
    if(MASTER_DATA.some(x => String(x.phone) === String(val))) {
        localStorage.setItem("userPhone", val);
        location.reload();
    } else {
        $('#loginError, #regSection').fadeIn();
    }
}

function showToast(message, type = 'success') {
    $('.custom-toast').remove();
    const toast = $(`<div class="custom-toast shadow-lg">${message}</div>`).css({
        'position': 'fixed', 'bottom': '20px', 'left': '50%', 'transform': 'translateX(-50%)',
        'background': type === 'success' ? '#10b981' : '#4f46e5', 'color': 'white', 
        'padding': '12px 24px', 'border-radius': '50px', 'z-index': '10000', 'display': 'none'
    });
    $('body').append(toast);
    toast.fadeIn().delay(3000).fadeOut(() => toast.remove());
}

function buildFilters() {
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].sort();
    const toSet = [...new Set(MASTER_DATA.map(x => x['Willing District']))].sort();
    $('#selFrom').html('<option value="all">All Districts</option>').append(fromSet.map(d => `<option value="${d}">${d}</option>`));
    $('#selTo').html('<option value="all">All Districts</option>').append(toSet.map(d => `<option value="${d}">${d}</option>`));
}

function toggleMatches() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    FILTER_MATCHES = !FILTER_MATCHES;
    $('#btnMatches').toggleClass('btn-primary btn-outline-primary text-white');
    renderTable();
}

function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
