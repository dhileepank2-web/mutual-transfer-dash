/**
 * MUTUAL TRANSFER DASHBOARD - CORE ENGINE v2.0
 * Optimized for Speed, Reliability, and Premium UX
 */

const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0;
let MY_PHONE = localStorage.getItem("userPhone");
let IS_SYNCING = false;
let currentRoomId = 'GLOBAL';
let chatPollInterval = null;
let LAST_MSG_ID = ""; 
let LAST_SEEN_TIME = localStorage.getItem('last_chat_seen') || 0;

$(document).ready(() => {
    loadData();

    // Auto-refresh Hub and Stats every 2 minutes (if tab is active)
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);

    // Background Sync (Every 30 seconds for "Live" feel)
    setInterval(professionalSync, 30000);

    // Chat Preview (Every 15 seconds)
    setInterval(updateChatPreview, 15000);
});

// --- 1. CORE DATA LOADING ---

async function loadData() {
    $("#globalLoader").show();
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const response = await r.json();
        
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        
        if (response.publicHubActivity) renderHubActivity(response.publicHubActivity);

        // Verification Logic
        if (MY_PHONE) {
            const userExists = MASTER_DATA.some(user => String(user.phone) === String(MY_PHONE));
            if (userExists) {
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
            } else {
                clearIdentity();
            }
        } else {
            $('#modalVerify').modal('show');
        }

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        buildFilters();
        renderTable();
        loadActivityLog(); 
        $("#globalLoader").fadeOut();
    } catch (err) {
        console.error("Critical Load Error:", err);
        $("#globalLoader").hide();
        showToast("Connection Error. Please refresh.", "error");
    }
}

// --- 2. PREMIUM SYNC & ANIMATION ---

async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible' || $('.modal.show').length) return;
    
    IS_SYNCING = true;
    showSlimProgress(30);

    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        const hasChanges = JSON.stringify(MASTER_DATA) !== JSON.stringify(res.records);
        
        if (hasChanges) {
            // Animate only if total count changed
            animateValue("statTotal", MASTER_DATA.length, res.records.length, 1000);
            MASTER_DATA = res.records;
            renderTable();
            updateStats(res.records, res.archivedCount);
            if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
        }
        showSlimProgress(100);
    } catch (e) {
        console.warn("Silent sync throttled.");
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

async function syncLiveFeed() {
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();

        const oldMatches = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
        const newMatches = res.records.filter(x => String(x.phone) === String(MY_PHONE) && x.MATCH_STATUS.toUpperCase().includes("MATCH")).length;

        if (newMatches > oldMatches) {
            showToast("🎉 New mutual match found!", "success");
            if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
        }

        MASTER_DATA = res.records;
        renderTable(); 
        updateStats(res.records, res.archivedCount);
    } catch (e) { console.warn("Live feed sync failed."); }
}

// --- 3. TABLE & FILTER ENGINE (SPEED OPTIMIZED) ---

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

    // Calculate matches once for the badge
    const potentialMatches = MASTER_DATA.filter(r => {
        if (String(r.phone) === String(MY_PHONE)) return false;
        const theirWorking = String(r['Working District']).trim().toUpperCase();
        const theirWilling = String(r['Willing District']).trim().toUpperCase();
        const systemMatch = r.MATCH_STATUS.toUpperCase().includes("MATCH");
        return myCriteria.some(me => (theirWorking === me.willing && theirWilling === me.working) || (systemMatch && theirWorking === me.willing));
    });

    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i> Potential Matches ${potentialMatches.length > 0 ? `<span class="badge badge-light ml-1 animate__animated animate__pulse animate__infinite">${potentialMatches.length}</span>` : ''}`);

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
    const existingIds = tbody.find('tr').map(function() { return String($(this).attr('data-id')); }).get();
    
    $('#noData').toggleClass('d-none', data.length > 0);
    
    let htmlBuffer = ""; 
    data.forEach(row => {
        const isMe = String(row.phone) === String(MY_PHONE);
        const matchStat = (row.MATCH_STATUS || "").toUpperCase();
        const hasMatch = matchStat.includes("MATCH");
        const isNew = existingIds.length > 0 && !existingIds.includes(String(row.id));
        
        let demandCfg = { c: 'lvl-mod', d: '#f59e0b' }; 
        const dStatus = (row.DEMAND_STATUS || '').toUpperCase();
        if(dStatus.includes('HIGH')) demandCfg = { c: 'lvl-high', d: '#ef4444' };
        if(dStatus.includes('LOW')) demandCfg = { c: 'lvl-low', d: '#10b981' };

        let statusMarkup = `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
        if(matchStat.includes("3-WAY")) {
            statusMarkup = `<span class="badge badge-pill badge-secondary badge-glow-purple">3-WAY MATCH</span>`;
        } else if(hasMatch) {
            statusMarkup = `<span class="badge badge-pill badge-success badge-glow-green">DIRECT MATCH</span>`;
        }

        htmlBuffer += `
            <tr class="${isMe ? 'row-identity' : ''} ${isNew ? 'animate__animated animate__fadeInLeft' : ''}" data-id="${row.id}">
                <td>
                    <div class="font-weight-bold text-dark">${row['Your Designation']}</div>
                    ${isMe ? '<div class="text-primary font-weight-bold" style="font-size:0.65rem;">MY ENTRY</div>' : ''}
                </td>
                <td><i class="fas fa-map-marker-alt text-muted mr-1"></i> ${row['Working District']}</td>
                <td><i class="fas fa-paper-plane text-primary mr-1"></i> <strong>${row['Willing District']}</strong></td>
                <td class="desktop-only">
                    <div class="demand-pill ${demandCfg.c}">
                        <span class="pulse-dot-small" style="background:${demandCfg.d};"></span>
                        ${row.DEMAND_STATUS || 'Moderate'}
                    </div>
                </td>
                <td>${statusMarkup}</td>
                <td class="text-center">
                    <button class="btn btn-unlock ${!hasMatch ? 'opacity-50' : 'btn-hover-grow shadow-sm'}" 
                            onclick="unlockRow('${row.id}', ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'}"></i>
                    </button>
                </td>
            </tr>`;
    });
    tbody.html(htmlBuffer);
}

// --- 4. CONTACT UNLOCK & MODALS ---

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

        if(data.error) {
            showToast(data.error, "error");
        } else if (data.is3Way) {
            $('#chainPersonB').text(data.partnerB.name);
            $('#chainPersonC').text(data.partnerC.name);
            $('#distB').text(data.partnerB.workingDistrict);
            $('#distC').text(data.partnerC.workingDistrict);
            $('#btnChatPartner').attr('onclick', `openChat('MATCH_${id}', 'Group Chat')`);
            $('#modalChain').modal('show'); 
        } else {
            $('#resName').text(data.name || "N/A");
            $('#resPhone').text(data.contact || "N/A");
            $('#callLink').attr("href", "tel:" + data.contact);
            $('#waLink').attr("href", "https://wa.me/91" + data.contact);
            $('#btnChatPartner').attr('onclick', `openChat('MATCH_${id}', 'Chat with ${data.name}')`);
            $('#modalContact').modal('show'); 
        }
    } catch(e) { 
        $("#globalLoader").fadeOut(); 
        showToast("Server Error", "error"); 
    }
}

// --- 5. CHAT SYSTEM (PREMIUM) ---

function openChat(roomId, title) {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
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

$('#modalChat').on('hidden.bs.modal', () => clearInterval(chatPollInterval));

async function loadMessages() {
    try {
        const res = await fetch(`${API}?action=getMessages&roomId=${currentRoomId}&userPhone=${MY_PHONE}`);
        const data = await res.json();
        let html = "";
        
        data.messages.forEach(m => {
            const isAdmin = String(MY_PHONE) === "9080141350"; 
            html += `
                <div class="msg-bubble ${m.isMe ? 'msg-me' : 'msg-them'} position-relative animate__animated animate__fadeInUp animate__faster">
                    ${!m.isMe ? `<div class="msg-sender">${m.name}</div>` : ''}
                    <div>${m.text}</div>
                    <div class="d-flex justify-content-between align-items-center mt-1">
                        <span class="msg-info">${m.time}</span>
                        ${isAdmin ? `<i class="fas fa-trash-alt text-danger ml-2" style="cursor:pointer; font-size:0.7rem;" onclick="adminDeleteMsg('${m.text}')"></i>` : ''}
                    </div>
                </div>`;
        });
        
        $('#chatBox').html(html);
        $('#chatBox').scrollTop($('#chatBox')[0].scrollHeight);
    } catch(e) { console.warn("Chat load failed."); }
}

async function sendChatMessage() {
    const inputField = $('#chatInput');
    const msg = inputField.val().trim();
    if (!msg) return;
    
    inputField.val('');
    $('#btnSendChat').prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i>');

    await fetch(API, {
        method: "POST",
        body: JSON.stringify({
            action: "sendMessage", roomId: currentRoomId, userPhone: MY_PHONE, msg: msg
        })
    });
    
    $('#btnSendChat').prop('disabled', false).html('<i class="fas fa-paper-plane"></i>');
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
                $('#chatBadge').fadeIn();
                $('#prevName').text(lastMsg.name);
                $('#prevText').text(lastMsg.text);
                $('#prevAvatar').text(lastMsg.name.charAt(0));
                $('#chatPreview').fadeIn().delay(5000).fadeOut();
                LAST_MSG_ID = lastMsg.text;
            }
        }
    } catch (e) { }
}

// --- 6. UTILITIES (STATS, FILTERS, DELETE) ---

function updateStats(data, archived) {
    const liveTotal = [...new Set(data.map(x => x.phone))].length;
    const liveMatched = data.filter(r => r.MATCH_STATUS.toUpperCase().includes("MATCH")).length;
    const systemMatchesTotal = liveMatched + archived;
    const totalHistoricalProfiles = liveTotal + archived;
    const rate = totalHistoricalProfiles > 0 ? Math.round((systemMatchesTotal / totalHistoricalProfiles) * 100) : 0;
    
    $('#statTotal').text(liveTotal);
    $('#statMatched').text(systemMatchesTotal);
    $('#statRate').text(rate + '%');
}

function loadActivityLog() {
    const container = $('#notificationList').empty();
    const audit = $('#auditLog').empty();
    const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    
    if (myEntries.length === 0) {
        container.append(`<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">No active registration found.</p></div>`);
        return;
    }

    myEntries.filter(e => e.MATCH_STATUS.toUpperCase().includes("MATCH")).forEach(m => {
        const is3Way = m.MATCH_STATUS.toUpperCase().includes("3-WAY");
        container.append(`
            <div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">${is3Way ? '3-WAY' : 'DIRECT'} MATCH</span>
                        <h6 class="font-weight-bold mb-1">Transfer Ready</h6>
                        <p class="small text-muted mb-0">Mutual match found for ${m['Willing District']}.</p>
                    </div>
                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${m.id}', true)">View</button>
                </div>
            </div>`);
    });

    audit.append(`<div class="p-3 bg-white border rounded-15 mb-2 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Profile Verified</div><div class="text-muted" style="font-size: 0.75rem;">Identity confirmed.</div></div>`);
}

function renderHubActivity(activities) {
    const container = $('#hubActivityList').empty();
    activities.forEach((act, i) => {
        container.append(`
            <div class="activity-item shadow-sm" style="animation-delay: ${i * 0.1}s">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="live-indicator"><span class="pulse-dot mr-1"></span>Live</span>
                    <small class="text-muted">${act.time}</small>
                </div>
                <div class="font-weight-bold text-dark">${act.msg}</div>
            </div>`);
    });
}

async function executeDeletion() {
    let sel = $('input[name="delReason"]:checked').val();
    let finalReason = sel === "OTHER" ? $('#deleteReasonOther').val().trim() : sel;
    if (sel === "OTHER" && !finalReason) { alert("Reason required."); return; }
    if (!confirm("Permanently remove your profile?")) return;
    
    $("#globalLoader").show();
    try {
        const res = await fetch(API, {
            method: "POST",
            body: JSON.stringify({ action: "deleteEntry", userPhone: MY_PHONE, reason: finalReason })
        });
        const data = await res.json();
        if (data.status === "SUCCESS") { clearIdentity(); }
        else { alert("Error: " + data.error); $("#globalLoader").fadeOut(); }
    } catch(e) { $("#globalLoader").fadeOut(); alert("Connection Error."); }
}

function buildFilters() {
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].sort();
    const toSet = [...new Set(MASTER_DATA.map(x => x['Willing District']))].sort();
    $('#selFrom').html('<option value="all">All Working</option>').append(fromSet.map(d => `<option value="${d}">${d}</option>`));
    $('#selTo').html('<option value="all">All Willing</option>').append(toSet.map(d => `<option value="${d}">${d}</option>`));
}

// --- 7. HELPER UI FUNCTIONS ---

function showToast(message, type = 'success') {
    $('.custom-toast').remove();
    const toast = $(`<div class="custom-toast shadow-lg animate__animated animate__fadeInUp"><span>${message}</span></div>`);
    $('body').append(toast);
    toast.css({ 'position': 'fixed', 'bottom': '20px', 'left': '50%', 'transform': 'translateX(-50%)', 'background': type === 'success' ? '#10b981' : '#ef4444', 'color': 'white', 'padding': '12px 24px', 'border-radius': '50px', 'z-index': '10000', 'font-weight': '600' });
    setTimeout(() => toast.fadeOut(() => toast.remove()), 3000);
}

function showSlimProgress(percent) {
    if (!$('#slim-progress').length) $('body').append('<div id="slim-progress" style="position:fixed; top:0; left:0; height:3px; background:#4f46e5; z-index:9999; transition: width 0.4s ease;"></div>');
    $('#slim-progress').css('width', percent + '%').fadeIn();
}

function hideSlimProgress() { $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%')); }

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

function shareToWhatsApp() {
    const appUrl = window.location.href.split('?')[0];
    const text = `*Mutual Transfer Portal Update* 🌐\nCheck live matches here:\n👉 ${appUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
}

function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
function toggleMatches() { FILTER_MATCHES = !FILTER_MATCHES; $('#btnMatches').toggleClass('btn-primary btn-outline-primary'); renderTable(); }
function saveVerify() { 
    const val = $('#verifyPhone').val();
    if(MASTER_DATA.some(x => String(x.phone) === String(val))) { localStorage.setItem("userPhone", val); location.reload(); }
    else { $('#loginError, #regSection').fadeIn(); }
}
