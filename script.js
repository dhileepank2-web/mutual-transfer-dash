const API = "https://script.google.com/macros/s/AKfycbzpOofnWNMX_9k0alBViu1rq54ReVdR7VUhqs28WYYlansyFXuX58CxRqnDz_KU_zLO/exec";
let MASTER_DATA = [], FILTER_MATCHES = false, ARCHIVE_COUNT = 0, ARCHIVED_RECORDS = [];
let MY_PHONE = localStorage.getItem("userPhone");
let MY_NAME = ""; 
let IS_SYNCING = false;

$(document).ready(() => {
    loadData();

    // Auto-sync every 30 seconds
    setInterval(professionalSync, 30000);

    // Deep refresh every 2 minutes
    setInterval(() => {
        if (document.visibilityState === 'visible' && !$('.modal.show').length) {
            syncLiveFeed();
        }
    }, 120000);
});

// --- SYNC & DATA LOADING ---

async function professionalSync() {
    if (IS_SYNCING || document.visibilityState !== 'visible') return;
    IS_SYNCING = true;
    showSlimProgress(30); 

    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();
        
        const hasChanges = JSON.stringify(MASTER_DATA) !== JSON.stringify(res.records);
        
        if (hasChanges) {
            MASTER_DATA = res.records;
            ARCHIVE_COUNT = res.archivedCount || 0;
            ARCHIVED_RECORDS = res.archivedRecords || [];
            
            renderTable(); 
            updateStats(MASTER_DATA, ARCHIVE_COUNT);
            if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
            console.log("Sync Complete: Data Updated");
        }

        showSlimProgress(100);
    } catch (e) {
        console.warn("Background sync failed.");
    } finally {
        setTimeout(() => { IS_SYNCING = false; hideSlimProgress(); }, 1000);
    }
}

async function syncLiveFeed() {
    try {
        const r = await fetch(`${API}?action=getDashboardData&t=${Date.now()}`);
        const res = await r.json();

        if (MY_PHONE) {
            const oldMatchCount = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE) && (x.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;
            const newMatchCount = res.records.filter(x => String(x.phone) === String(MY_PHONE) && (x.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;

            if (newMatchCount > oldMatchCount) {
                showToast("🎉 Great news! A new mutual match has been found!", "success");
                if (window.navigator.vibrate) window.navigator.vibrate(200); 
            }
        }

        MASTER_DATA = res.records;
        ARCHIVE_COUNT = res.archivedCount || 0;
        ARCHIVED_RECORDS = res.archivedRecords || [];
        
        renderTable(); 
        updateStats(MASTER_DATA, ARCHIVE_COUNT);
        renderArchiveTable(ARCHIVED_RECORDS);
        if (res.publicHubActivity) renderHubActivity(res.publicHubActivity);
        
    } catch (e) { 
        console.warn("Silent sync failed."); 
    }
}

function loadData() {
    $("#globalLoader").show();
    fetch(`${API}?action=getDashboardData&t=${Date.now()}`)
    .then(r => r.json())
    .then(response => {
        MASTER_DATA = response.records || [];
        ARCHIVE_COUNT = response.archivedCount || 0;
        ARCHIVED_RECORDS = response.archivedRecords || [];
        
        if (response.publicHubActivity) renderHubActivity(response.publicHubActivity);

        $('#lastUpdated').text(response.serverTime || new Date().toLocaleTimeString());

        if (MY_PHONE) {
            const currentUser = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE));
            if (currentUser) {
                MY_NAME = currentUser['Your Designation'] || "User"; 
                $('#idContainer').removeClass('d-none');
                $('#lblUserPhone').text(MY_PHONE.slice(0, 2) + '****' + MY_PHONE.slice(-2));
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
        renderArchiveTable(ARCHIVED_RECORDS);
        loadActivityLog(); 
        $("#globalLoader").fadeOut();
    })
    .catch(err => {
        console.error("Critical Load Error:", err);
        $("#globalLoader").hide();
        alert("Unable to load data. Please check your connection.");
    });
}

// --- STATS LOGIC ---

function updateStats(data, archivedCount) {
    // 1. Unique Count (By Phone)
    const uniqueUsers = [...new Set(data.map(x => String(x.phone)))].length;
    // 2. Total Count (All live requests)
    const totalRequests = data.length;
    // 3. Current Live Matches
    const liveMatches = data.filter(r => (r.MATCH_STATUS || "").toUpperCase().includes("MATCH")).length;
    // 4. Total Leaved (archivedCount)
    const totalLeaved = archivedCount;
    // 5. Overall Hub Success (Live Matches + Archived)
    const overallSuccess = liveMatches + archivedCount;

    // Animate UI elements
    animateValue("statUnique", parseInt($('#statUnique').text()) || 0, uniqueUsers, 1000);
    animateValue("statTotal", parseInt($('#statTotal').text()) || 0, totalRequests, 1000);
    animateValue("statArchived", parseInt($('#statArchived').text()) || 0, totalLeaved, 1000);
    animateValue("statLiveMatches", parseInt($('#statLiveMatches').text()) || 0, liveMatches, 1000); // Note: Ensure you have this ID in HTML
    animateValue("statMatched", parseInt($('#statMatched').text()) || 0, overallSuccess, 1000);
}

// --- RENDERING FUNCTIONS ---

function renderTable() {
    const selectedDesig = $('#selDesignation').val();
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
        const theirWorking = String(r['Working District']).trim().toUpperCase();
        const theirWilling = String(r['Willing District']).trim().toUpperCase();
        const systemMatch = (r.MATCH_STATUS || "").toUpperCase().includes("MATCH");
        return myCriteria.some(me => {
            const isDirectMutual = (theirWorking === me.willing && theirWilling === me.working);
            const isChainMatch = (systemMatch && theirWorking === me.willing);
            return isDirectMutual || isChainMatch;
        });
    });

    $('#btnMatches').html(`<i class="fas fa-handshake mr-1"></i>My Matches ${potentialMatches.length > 0 ? `<span class="badge badge-light ml-1">${potentialMatches.length}</span>` : ''}`);

    const filtered = MASTER_DATA.filter(r => {
        const isOwn = String(r.phone) === String(MY_PHONE);
        const matchesDesig = selectedDesig === 'all' || r['Your Designation'] === selectedDesig;
        const matchesFrom = from === 'all' || r['Working District'] === from;
        const matchesTo = to === 'all' || r['Willing District'] === to;
        if (FILTER_MATCHES) {
            const isMatchForMe = potentialMatches.some(m => m.id === r.id);
            return (isMatchForMe || isOwn) && matchesDesig && matchesFrom && matchesTo;
        }
        return matchesDesig && matchesFrom && matchesTo;
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
        
        let demandCfg = { c: 'lvl-mod', d: '#f59e0b' }; 
        const dStatus = (row.DEMAND_STATUS || '').toUpperCase();
        if(dStatus.includes('HIGH')) demandCfg = { c: 'lvl-high', d: '#ef4444' };
        if(dStatus.includes('LOW')) demandCfg = { c: 'lvl-low', d: '#10b981' };

        let statusMarkup = `<span class="badge badge-pill badge-light text-muted border">PENDING</span>`;
        if(matchStat.includes("3-WAY")) {
            statusMarkup = `<span class="badge badge-pill badge-secondary">3-WAY MATCH</span>`;
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
                <td class="desktop-only">
                    <div class="demand-pill ${demandCfg.c}">
                        <span class="pulse-dot-small" style="background:${demandCfg.d};"></span>
                        ${row.DEMAND_STATUS || 'Moderate'}
                    </div>
                </td>
                <td>${statusMarkup}</td>
                <td class="text-center">
                    <button class="btn btn-unlock shadow-sm ${!hasMatch ? 'opacity-50' : 'btn-hover-grow'}" 
                            onclick="unlockRow('${row.id}', ${hasMatch})">
                        <i class="fas ${hasMatch ? 'fa-lock-open' : 'fa-lock text-white-50'}"></i>
                    </button>
                </td>
            </tr>`;
    });
    tbody.html(rowsHtml);
}

function renderArchiveTable(archivedRecords) {
    const tbody = $('#archiveTbody').empty();
    if (!archivedRecords || archivedRecords.length === 0) {
        tbody.append('<tr><td colspan="3" class="text-center p-4 text-muted">No historical records.</td></tr>');
        return;
    }

    archivedRecords.forEach(row => {
        tbody.append(`
            <tr>
                <td>
                    <div class="font-weight-bold">${row['Your Designation']}</div>
                    <small class="text-muted">ID: ${row.id || 'N/A'}</small>
                </td>
                <td>
                    <div class="small"><i class="fas fa-map-marker-alt text-muted mr-1"></i>${row['Working District']}</div>
                    <div class="small"><i class="fas fa-paper-plane text-primary mr-1"></i>${row['Willing District']}</div>
                </td>
                <td>
                    <span class="badge badge-pill badge-light border text-success">
                        ${row.reason || 'Found Match'}
                    </span>
                </td>
            </tr>
        `);
    });
}

// --- UTILITY & ACTION FUNCTIONS ---

async function unlockRow(id, active) {
    const isActive = String(active) === "true" || active === true;
    if(!isActive) { showToast("Match required to view contact", "info"); return; }
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
        } else {
            if (data.is3Way) {
                $('#chainPersonB').text(data.partnerB.name);
                $('#chainPersonC').text(data.partnerC.name);
                $('#distB').text(data.partnerB.workingDistrict);
                $('#distC').text(data.partnerC.workingDistrict);
                $('#modalChain').modal('show'); 
            } else {
                $('#resName').text(data.name || "N/A");
                $('#resPhone').text(data.contact || "N/A");
                $('#callLink').attr("href", "tel:" + data.contact);
                $('#waLink').attr("href", "https://wa.me/91" + data.contact);
                $('#modalContact').modal('show'); 
            }
            showToast("Contact Unlocked!", "success");
        }
    } catch(e) { 
        $("#globalLoader").fadeOut(); 
        showToast("Server Error", "error"); 
    }
}

async function executeDeletion() {
    let sel = $('input[name="delReason"]:checked').val();
    let finalReason = sel === "OTHER" ? $('#deleteReasonOther').val().trim() : sel;
    if (sel === "OTHER" && !finalReason) { alert("Please provide a reason."); return; }
    if (!confirm("Are you sure? This will permanently remove your profile.")) return;
    $('#modalDeleteConfirm').modal('hide');
    $("#globalLoader").show();
    try {
        const res = await fetch(API, {
            method: "POST",
            body: JSON.stringify({ action: "deleteEntry", userPhone: MY_PHONE, reason: finalReason })
        });
        const data = await res.json();
        if (data.status === "SUCCESS") {
            alert("Entry Successfully Deleted.");
            clearIdentity();
        } else {
            alert("Error: " + data.error);
            $("#globalLoader").fadeOut();
        }
    } catch(e) { $("#globalLoader").fadeOut(); alert("Connection Error."); }
}

function animateValue(id, start, end, duration) {
    if (start === end) return;
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

function showSlimProgress(percent) {
    if (!$('#slim-progress').length) {
        $('body').append('<div id="slim-progress" style="position:fixed; top:0; left:0; height:3px; background:#4f46e5; z-index:9999; transition: width 0.4s ease;"></div>');
    }
    $('#slim-progress').css('width', percent + '%').fadeIn();
}

function hideSlimProgress() {
    $('#slim-progress').fadeOut(() => $('#slim-progress').css('width', '0%'));
}

function toggleMatches() {
    if (!MY_PHONE) { $('#modalVerify').modal('show'); return; }
    FILTER_MATCHES = !FILTER_MATCHES;
    const btn = $('#btnMatches');
    FILTER_MATCHES ? btn.removeClass('btn-outline-primary').addClass('btn-primary text-white') : btn.addClass('btn-outline-primary').removeClass('btn-primary text-white');
    renderTable();
}

function buildFilters() {
    const desigSet = [...new Set(MASTER_DATA.map(x => x['Your Designation']))].filter(Boolean).sort();
    const fromSet = [...new Set(MASTER_DATA.map(x => x['Working District']))].filter(Boolean).sort();
    const toSet = [...new Set(MASTER_DATA.map(x => x['Willing District']))].filter(Boolean).sort();

    $('#selDesignation').html('<option value="all">All Designations</option>');
    $('#selFrom').html('<option value="all">All Districts</option>');
    $('#selTo').html('<option value="all">All Districts</option>');

    desigSet.forEach(d => $('#selDesignation').append(`<option value="${d}">${d}</option>`));
    fromSet.forEach(d => $('#selFrom').append(`<option value="${d}">${d}</option>`));
    toSet.forEach(d => $('#selTo').append(`<option value="${d}">${d}</option>`));
}

function saveVerify() {
    const val = $('#verifyPhone').val();
    if(!/^\d{10}$/.test(val)) { alert("Invalid phone format."); return; }
    if(MASTER_DATA.some(x => String(x.phone) === String(val))) {
        localStorage.setItem("userPhone", val);
        location.reload();
    } else {
        $('#loginError, #regSection').fadeIn();
    }
}

function showToast(message, type = 'success') {
    $('.custom-toast').remove();
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
    const bgColor = type === 'success' ? '#10b981' : '#4f46e5';
    const toast = $(`<div class="custom-toast shadow-lg"><i class="fas ${icon} mr-2"></i><span>${message}</span></div>`);
    $('body').append(toast);
    toast.css({
        'position': 'fixed', 'bottom': '20px', 'left': '50%', 'transform': 'translateX(-50%)',
        'background': bgColor, 'color': 'white', 'padding': '12px 24px', 'border-radius': '50px',
        'z-index': '10000', 'font-weight': '600', 'display': 'none'
    });
    toast.fadeIn(400).delay(3000).fadeOut(400, function() { $(this).remove(); });
}

function clearIdentity() { localStorage.removeItem("userPhone"); location.reload(); }
function resetUI() { $('#selDesignation').val('all'); $('#selFrom').val('all'); $('#selTo').val('all'); FILTER_MATCHES = false; $('#btnMatches').addClass('btn-outline-primary').removeClass('btn-primary text-white'); renderTable(); }
function deleteMyEntry() { if (!MY_PHONE) { $('#modalVerify').modal('show'); return; } $('#r1').prop('checked', true); $('#otherReasonWrapper').addClass('d-none'); $('#modalDeleteConfirm').modal('show'); }
function selectRadio(id) { $(`#${id}`).prop('checked', true); if(id === 'r3') $('#otherReasonWrapper').removeClass('d-none'); else $('#otherReasonWrapper').addClass('d-none'); }
function redirectToRegistration() { const up = localStorage.getItem("userPhone"); const url = "https://dhileepank2-web.github.io/mutual-transfer-dash/testreg.html"; window.location.href = up ? `${url}?editPhone=${up}` : url; }
function shareToWhatsApp() { const appUrl = window.location.href.split('?')[0]; const myDistrict = MASTER_DATA.find(x => String(x.phone) === String(MY_PHONE))?.['Working District'] || "my district"; const text = `*Mutual Transfer Portal Update* 🌐\n\nI'm looking for a transfer from *${myDistrict}*.\nCheck live matches and register your profile here:\n\n👉 ${appUrl}`; const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`; window.open(waUrl, '_blank'); }
function copyInviteLink() { const appUrl = window.location.href.split('?')[0]; navigator.clipboard.writeText(appUrl).then(() => { showToast("Invite link copied!", "success"); }); }
function renderHubActivity(activities) {
    const container = $('#hubActivityList').empty();
    if (!activities.length) {
        container.append('<div class="text-center p-4 text-muted border rounded-24">No recent activity.</div>');
        return;
    }
    activities.forEach((act, i) => {
        const delay = i * 0.1; 
        container.append(`
            <div class="activity-item shadow-sm" style="animation-delay: ${delay}s">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <span class="live-indicator"><span class="pulse-dot mr-1" style="width:6px; height:6px;"></span>Live</span>
                    <small class="text-muted" style="font-size:0.7rem;">${act.time}</small>
                </div>
                <div class="font-weight-bold text-dark" style="font-size:0.9rem;">${act.msg}</div>
                <div class="d-flex justify-content-between align-items-center mt-2">
                    <small class="text-primary font-weight-bold" style="font-size:0.7rem;">${act.type}</small>
                    <small class="text-muted" style="font-size:0.7rem;"><i class="fas fa-user-shield mr-1"></i>${act.user}</small>
                </div>
            </div>
        `);
    });
}

function loadActivityLog() {
    const container = $('#notificationList').empty();
    const audit = $('#auditLog').empty();
    const myEntries = MASTER_DATA.filter(x => String(x.phone) === String(MY_PHONE));
    
    if (myEntries.length === 0) {
        container.append(`<div class="text-center p-5 border rounded-24 bg-white"><p class="text-muted mb-0">No active registration found.</p></div>`);
        return;
    }

    const successfulMatches = myEntries.filter(e => e.MATCH_STATUS.toUpperCase().includes("MATCH"));
    if (successfulMatches.length > 0) {
        successfulMatches.forEach(m => {
            const is3Way = m.MATCH_STATUS.toUpperCase().includes("3-WAY");
            container.append(`
                <div class="history-card" style="border-left-color: ${is3Way ? '#7c3aed' : '#10b981'};">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <span class="badge ${is3Way ? 'badge-secondary' : 'badge-success'} mb-2">${is3Way ? '3-WAY MATCH' : 'DIRECT MATCH'}</span>
                            <h6 class="font-weight-bold mb-1">Transfer to ${m['Willing District']} Ready</h6>
                            <p class="small text-muted mb-0">A mutual match has been found for your request.</p>
                        </div>
                        <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="unlockRow('${m.id}', true)">View Contact</button>
                    </div>
                </div>`);
        });
    }

    myEntries.filter(e => !e.MATCH_STATUS.toUpperCase().includes("MATCH")).forEach(p => {
        container.append(`
            <div class="history-card" style="border-left-color: #cbd5e1;">
                <div class="d-flex align-items-center">
                    <div class="spinner-grow spinner-grow-sm text-muted mr-3" role="status"></div>
                    <div>
                        <p class="mb-0 font-weight-bold">Searching for ${p['Willing District']}...</p>
                    </div>
                </div>
            </div>`);
    });

    audit.append(`
        <div class="p-3 bg-white border rounded-15 mb-2 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Profile Verified</div><div class="text-muted" style="font-size: 0.75rem;">Identity confirmed via ${MY_PHONE.slice(-4)}</div></div>
        <div class="p-3 bg-white border rounded-15 shadow-sm"><div class="font-weight-bold" style="font-size: 0.8rem;">Syncing Districts</div><div class="text-muted" style="font-size: 0.75rem;">Tracking ${myEntries.length} location(s)</div></div>`);
}

